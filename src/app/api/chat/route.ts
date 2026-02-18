import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchFirecrawl } from "@/lib/firecrawl";

// Configure Groq as an OpenAI-compatible provider
if (!process.env.GROQ_API_KEY) {
    console.warn("GROQ_API_KEY is missing from environment variables.");
}

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

        const { workspaceId, question, includeWebSearch } = await req.json();

        if (!question || !workspaceId) {
            return new Response("Missing question or workspaceId", { status: 400 });
        }

        console.log(`Chat: Processing question "${question}" for workspace ${workspaceId}`);

        // 1. Generate Query Embedding
        console.time("Chat: Embedding");
        const { generateEmbedding } = await import("@/lib/rag");
        let queryEmbedding;
        try {
            queryEmbedding = await generateEmbedding(question);
            console.timeEnd("Chat: Embedding");
        } catch (embedError: any) {
            console.error("Chat: Embedding generation failed:", embedError);
            throw new Error(`Failed to process question context: ${embedError.message}`);
        }

        // 2. Vector Search (Semantic Retrieval)
        console.time("Chat: VectorSearch");
        let vectorResults: any[] = [];
        try {
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
                AND doc."userId" = ${session.user.id}
                ORDER BY chunk.embedding <=> ${queryEmbedding}::vector
                LIMIT 5;
            `;
            console.timeEnd("Chat: VectorSearch");
        } catch (vectorError: any) {
            console.error("Chat: Vector Search failed:", vectorError);
            console.timeEnd("Chat: VectorSearch");
            // Non-fatal, proceed with empty context if vector search fails
        }

        // 3. Evaluate Retrieval Quality
        const topScore = vectorResults.length > 0 ? vectorResults[0].similarity : 0;

        let contextText = "";
        let sources: any[] = [];

        // Format Document Context
        if (vectorResults.length > 0) {
            contextText += "## Internal Knowledge:\n";
            vectorResults.forEach((chunk, index) => {
                contextText += `[${index + 1}] Document: "${chunk.docTitle}"\nContent: ${chunk.content}\n\n`;
                sources.push({
                    id: index + 1,
                    type: "document",
                    title: chunk.docTitle,
                    content: chunk.content
                });
            });
        }

        // 4. Hybrid Logic: Web Search Fallback
        const isPoorMatch = topScore < 0.5;
        const shouldSearchWeb = includeWebSearch || (isPoorMatch && vectorResults.length < 2);

        if (shouldSearchWeb) {
            console.log("Chat: Triggering Web Search...");
            console.time("Chat: WebSearch");
            try {
                const webResults = await searchFirecrawl(question, 3);
                console.timeEnd("Chat: WebSearch");
                if (webResults.length > 0) {
                    contextText += "## Web Search Results:\n";
                    webResults.forEach((res, index) => {
                        const sourceIndex = sources.length + 1;
                        contextText += `[${sourceIndex}] Source: "${res.title}" (${res.url})\nContent: ${res.markdown || res.content}\n\n`;
                        sources.push({
                            id: sourceIndex,
                            type: "web",
                            title: res.title,
                            url: res.url,
                            content: res.content
                        });
                    });
                }
            } catch (webError: any) {
                console.error("Chat: Web Search Failed", webError);
                console.timeEnd("Chat: WebSearch");
            }
        }

        // 5. Streaming LLM Generation

        // 5. Save User Message
        try {
            await (prisma as any).message.create({
                data: {
                    role: "user",
                    content: question,
                    workspaceId: workspaceId as string,
                    userId: session.user.id as string,
                },
            });
        } catch (dbError) {
            console.error("Chat: Failed to save user message:", dbError);
        }

        // 6. Streaming LLM Generation
        const userId = session.user.id as string;
        const wsId = workspaceId as string;

        const systemPrompt = `You are an expert research assistant.
        
        Goal: Answer the user's question using ONLY the provided context.
        
        Rules:
        1. Use the [number] to cite your sources inline. Example: "The project deadline is Friday [1]."
        2. If the context has both Internal Knowledge and Web Search Results, synthesize them.
        3. If the answer is NOT in the context, say "I cannot find the answer in the provided documents or web search."
        4. Be concise and professional.
        5. CRITICAL: At the very end of your response, after any citations, provide exactly 3 suggested follow-up questions starting with "SUGGESTED_QUESTIONS:". Separate them with newlines. 
           Example:
           ... your answer ...
           SUGGESTED_QUESTIONS:
           What is the deadline for Phase 2?
           Who is the lead project manager?
           Is there a budget allocated?
        
        Context:
        ${contextText}
        `;

        console.time("Chat: StreamStarting");
        const result = streamText({
            model: groq("llama-3.1-8b-instant"),
            system: systemPrompt,
            messages: [{ role: "user", content: question }],
            onFinish: async (event) => {
                console.log("Chat: Stream Finished, saving to DB...");
                // Save AI Message when stream completes
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
        console.timeEnd("Chat: StreamStarting");

        return result.toTextStreamResponse();

    } catch (error: any) {
        console.error("Chat API Detailed Error:", {
            message: error.message,
            stack: error.stack,
            cause: error.cause
        });
        return new Response(JSON.stringify({ error: error.message || "Failed to generate answer" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
