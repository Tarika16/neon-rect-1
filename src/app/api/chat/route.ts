import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchFirecrawl } from "@/lib/firecrawl";

// Configure Groq as an OpenAI-compatible provider
const groq = createOpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
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
        const { generateEmbedding } = await import("@/lib/rag");
        const queryEmbedding = await generateEmbedding(question);

        // 2. Vector Search (Semantic Retrieval)
        const vectorResults: any[] = await prisma.$queryRaw`
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
            try {
                const webResults = await searchFirecrawl(question, 3);
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
            } catch (webError) {
                console.error("Chat: Web Search Failed", webError);
            }
        }

        // 5. Streaming LLM Generation

        // 5. Save User Message
        await prisma.message.create({
            data: {
                role: "user",
                content: question,
                workspaceId: workspaceId as string,
                userId: session.user.id as string,
            },
        });

        // 6. Streaming LLM Generation
        const systemPrompt = `You are an expert research assistant.
        
        Goal: Answer the user's question using ONLY the provided context.
        
        Rules:
        1. Use the [number] to cite your sources inline. Example: "The project deadline is Friday [1]."
        2. If the context has both Internal Knowledge and Web Search Results, synthesize them.
        3. If the answer is NOT in the context, say "I cannot find the answer in the provided documents or web search."
        4. Be concise and professional.
        
        Context:
        ${contextText}
        `;

        const result = streamText({
            model: groq("llama-3.1-8b-instant"),
            system: systemPrompt,
            messages: [{ role: "user", content: question }],
            onFinish: async (event) => {
                // Save AI Message when stream completes
                await prisma.message.create({
                    data: {
                        role: "assistant",
                        content: event.text,
                        workspaceId: workspaceId as string,
                        userId: session.user.id as string,
                    },
                });
            },
        });

        return result.toTextStreamResponse();

    } catch (error: any) {
        console.error("Chat Error:", error);
        return new Response(error.message || "Failed to generate answer", { status: 500 });
    }
}
