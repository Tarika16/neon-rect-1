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

        if (!question) {
            return new Response("Missing question", { status: 400 });
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
        let sources: any[] = [];

        try {
            // Attempt Workspace Search first
            if (workspaceId) {
                console.log(`Chat: searching workspace ${workspaceId}`);
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
                    LIMIT 4;
                `;
            } else if (documentId) {
                console.log(`Chat: searching document ${documentId}`);
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
                    LIMIT 4;
                `;
            }

            // GLOBAL FALLBACK (Try again across all documents if workspace/doc search is empty or poor)
            const topScore = vectorResults.length > 0 ? vectorResults[0].similarity : 0;
            if (vectorResults.length === 0 || topScore < 0.4) {
                console.log("Chat: Workspace results insufficient. Trying GLOBAL search...");
                const globalResults: any[] = await prisma.$queryRaw`
                    SELECT 
                        chunk.id,
                        chunk.content,
                        chunk.metadata,
                        doc.title as "docTitle",
                        1 - (chunk.embedding <=> ${queryEmbedding}::vector) as similarity
                    FROM "DocumentChunk" chunk
                    JOIN "Document" doc ON chunk."documentId" = doc.id
                    WHERE doc."userId" = ${userId}
                    ORDER BY chunk.embedding <=> ${queryEmbedding}::vector
                    LIMIT 3;
                `;

                // Merge global results if they are better
                if (globalResults.length > 0 && (globalResults[0].similarity > topScore)) {
                    vectorResults = [...vectorResults, ...globalResults.filter(g => !vectorResults.find(v => v.id === g.id))].slice(0, 5);
                }
            }

            console.timeEnd("Chat: VectorSearch");
        } catch (vectorError: any) {
            console.error("Chat: Vector Search failed:", vectorError);
        }

        let contextText = "";
        if (vectorResults.length > 0) {
            contextText += "## WORKSPACE DOCUMENTS:\n";
            vectorResults.forEach((chunk, index) => {
                const sourceId = sources.length + 1;
                contextText += `[${sourceId}] From Document: "${chunk.docTitle}"\nContent: ${chunk.content}\n\n`;
                sources.push({ id: sourceId, type: "document", title: chunk.docTitle, content: chunk.content });
            });
        }

        // WEB SEARCH FALLBACK (Deep Research)
        const finalTopScore = vectorResults.length > 0 ? vectorResults[0].similarity : 0;
        const needsWeb = includeWebSearch || vectorResults.length === 0 || (finalTopScore < 0.3);

        if (needsWeb) {
            console.log("Chat: Triggering Deep Search (Firecrawl)...");
            try {
                const webResults = await searchFirecrawl(question, 3);
                if (webResults.length > 0) {
                    contextText += "## LIVE WEB KNOWLEDGE:\n";
                    webResults.forEach((res) => {
                        const sourceId = sources.length + 1;
                        contextText += `[${sourceId}] From Web Page: "${res.title}" (${res.url})\nContent: ${res.markdown || res.content}\n\n`;
                        sources.push({ id: sourceId, type: "web", title: res.title, url: res.url, content: res.content });
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

        const systemPrompt = `You are a world-class AI research assistant.
        GOAL: Answer the user's question with absolute precision using the provided context.
        
        RULES:
        1. ALWAYS use inline citations like [1], [2] when referencing information.
        2. If information is from a DOCUMENT, clearly attribute it to the file name.
        3. If information is from the WEB, clearly attribute it to the URL.
        4. If you cannot find the answer in the context, say: "I've searched your workspace and the web, but I cannot find a definitive answer for this topic."
        5. DO NOT hallucinate. Only use the provided Workspace Documents and Live Web Knowledge.
        
        Citations used in your answer must correspond to the source list provided.
        
        Provide exactly 3 suggested follow-up questions at the end starting with "SUGGESTED_QUESTIONS:".

        CONTEXT:
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
                            content: event.text, // Store clean text in DB
                            workspaceId: wsId,
                            userId: userId,
                            // If we had a metadata field in DB, we'd store sources here
                        },
                    });
                } catch (dbError) {
                    console.error("Chat: Failed to save assistant message:", dbError);
                }
            },
        });

        // We wrap the response to include the sources at the end
        const stream = result.textStream;
        const readableStream = new ReadableStream({
            async start(controller) {
                const reader = stream.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    controller.enqueue(value);
                }
                // Append Sources
                controller.enqueue(`\n\n__SOURCES_METADATA__\n${JSON.stringify(sources)}`);
                controller.close();
            },
        });

        return new Response(readableStream, {
            headers: { "Content-Type": "text/plain; charset=utf-8" }
        });

    } catch (error: any) {
        console.error("Chat API Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Failed to generate answer" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
