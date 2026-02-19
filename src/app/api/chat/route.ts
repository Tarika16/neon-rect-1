import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchFirecrawl } from "@/lib/firecrawl";

// Configure Chat Providers
const groq = createOpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY || "dummy_key",
});

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new Response("Unauthorized", { status: 401 });
        }

        const { workspaceId, documentId, question, includeWebSearch } = await req.json();
        const userId = session.user.id as string;

        if (!question || (!workspaceId && !documentId)) {
            return new Response("Missing question, workspaceId or documentId", { status: 400 });
        }

        console.log(`Chat: Processing question "${question}" for ${workspaceId ? `workspace ${workspaceId}` : `document ${documentId}`}`);

        // 1. Generate Query Embedding
        console.time("Chat: Embedding");
        const { generateEmbedding } = await import("@/lib/rag");
        let queryEmbedding;
        try {
            queryEmbedding = await generateEmbedding(question);
            console.timeEnd("Chat: Embedding");
        } catch (embedError: any) {
            console.error("Chat: Embedding generation failed:", embedError);
            const detail = embedError.message || JSON.stringify(embedError) || "Unknown Xenova Error";
            throw new Error(`Failed to process question context: ${detail}`);
        }

        // 2. Vector Search (Semantic Retrieval)
        console.time("Chat: VectorSearch");
        let vectorResults: any[] = [];
        try {
            if (workspaceId) {
                vectorResults = await prisma.$queryRaw`
                    SELECT 
                        chunk.id,
                        chunk.content,
                        chunk.metadata,
                        doc.title as "docTitle",
                        1 - (chunk.embedding <=> ${queryEmbedding}::vector) as similarity
                    FROM "DocumentChunk" chunk
                    JOIN "Document" doc ON chunk."documentId" = doc.id
                    WHERE doc."workspaceId" = ${workspaceId}
                    AND doc."userId" = ${userId}
                    ORDER BY chunk.embedding <=> ${queryEmbedding}::vector
                    LIMIT 5;
                `;
            } else if (documentId) {
                vectorResults = await prisma.$queryRaw`
                    SELECT 
                        chunk.id,
                        chunk.content,
                        chunk.metadata,
                        doc.title as "docTitle",
                        1 - (chunk.embedding <=> ${queryEmbedding}::vector) as similarity
                    FROM "DocumentChunk" chunk
                    JOIN "Document" doc ON chunk."documentId" = doc.id
                    WHERE doc."id" = ${documentId}
                    AND doc."userId" = ${userId}
                    ORDER BY chunk.embedding <=> ${queryEmbedding}::vector
                    LIMIT 5;
                `;
            }
            console.timeEnd("Chat: VectorSearch");
        } catch (vectorError: any) {
            console.error("Chat: Vector Search failed:", vectorError);
            console.timeEnd("Chat: VectorSearch");
        }

        const topScore = vectorResults.length > 0 ? vectorResults[0].similarity : 0;
        let contextText = "";
        let sources: any[] = [];

        if (vectorResults.length > 0) {
            contextText += "## Internal Knowledge:\n";
            vectorResults.forEach((chunk, index) => {
                contextText += `[${index + 1}] Document: "${chunk.docTitle}"\nContent: ${chunk.content}\n\n`;
                sources.push({ id: index + 1, type: "document", title: chunk.docTitle, content: chunk.content });
            });
        }

        const isPoorMatch = topScore < 0.5;
        const shouldSearchWeb = includeWebSearch || (isPoorMatch && vectorResults.length < 2);

        if (shouldSearchWeb) {
            try {
                const webResults = await searchFirecrawl(question, 3);
                if (webResults.length > 0) {
                    contextText += "## Web Search Results:\n";
                    webResults.forEach((res, index) => {
                        const sourceIndex = sources.length + 1;
                        contextText += `[${sourceIndex}] Source: "${res.title}" (${res.url})\nContent: ${res.markdown || res.content}\n\n`;
                        sources.push({ id: sourceIndex, type: "web", title: res.title, url: res.url, content: res.content });
                    });
                }
            } catch (webError: any) {
                console.error("Chat: Web Search Failed", webError);
            }
        }

        // Save User Message
        const wsId = workspaceId || null;
        try {
            await (prisma as any).message.create({
                data: {
                    role: "user",
                    content: question,
                    workspaceId: wsId,
                    userId: session.user.id,
                },
            });
        } catch (dbError) {
            console.error("Chat: Failed to save user message:", dbError);
        }

        const systemPrompt = `You are an expert research assistant.
        Goal: Answer the user's question using ONLY the provided context.
        Rules:
        1. Use the [number] to cite your sources inline.
        2. synthesizing internal and web results.
        3. If not in context, say "I cannot find the answer".
        4. Be professional.
        5. Provide exactly 3 suggested follow-up questions starting with "SUGGESTED_QUESTIONS:".

        Context:
        ${contextText}`;

        // Hybrid LLM Selection
        let chatModel;
        const openRouterKey = process.env.OPENAI_API_KEY;
        const groqKey = process.env.GROQ_API_KEY;

        if (groqKey && groqKey.startsWith("gsk_")) {
            chatModel = groq("llama-3.1-8b-instant");
        } else if (openRouterKey && openRouterKey.startsWith("sk-or-")) {
            const openrouter = createOpenAI({
                baseURL: "https://openrouter.ai/api/v1",
                apiKey: openRouterKey,
            });
            chatModel = openrouter("openai/gpt-4o-mini");
        } else {
            throw new Error("No valid Chat API key found");
        }

        const result = streamText({
            model: chatModel,
            system: systemPrompt,
            messages: [{ role: "user", content: question }],
            onFinish: async (event) => {
                try {
                    await (prisma as any).message.create({
                        data: {
                            role: "assistant",
                            content: event.text,
                            workspaceId: wsId,
                            userId: userId,
                        },
                    });
                } catch (dbError) {
                    console.error("Chat: Failed to save assistant message:", dbError);
                }
            },
        });

        return result.toTextStreamResponse();

    } catch (error: any) {
        console.error("Chat API Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Failed to generate answer" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
