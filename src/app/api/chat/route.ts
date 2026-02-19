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
                    AND chunk.embedding IS NOT NULL
                    ORDER BY chunk.embedding <=> ${queryEmbedding}::vector
                    LIMIT 5;
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
                    AND chunk.embedding IS NOT NULL
                    ORDER BY chunk.embedding <=> ${queryEmbedding}::vector
                    LIMIT 5;
                `;
            }

            // Filter out low-quality matches (similarity < 0.2 is essentially random)
            vectorResults = vectorResults.filter((r: any) => Number(r.similarity) > 0.15);

            // GLOBAL FALLBACK if workspace/doc search is empty or poor
            const topScore = vectorResults.length > 0 ? Number(vectorResults[0].similarity) : 0;
            if (vectorResults.length === 0 || topScore < 0.4) {
                console.log("Chat: Workspace results insufficient (score:", topScore, "). Trying GLOBAL search...");
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
                    AND chunk.embedding IS NOT NULL
                    ORDER BY chunk.embedding <=> ${queryEmbedding}::vector
                    LIMIT 3;
                `;

                // Filter low quality
                const goodGlobalResults = globalResults.filter((r: any) => Number(r.similarity) > 0.15);

                if (goodGlobalResults.length > 0 && (goodGlobalResults.length === 0 || Number(goodGlobalResults[0].similarity) > topScore)) {
                    vectorResults = [...vectorResults, ...goodGlobalResults.filter(g => !vectorResults.find((v: any) => v.id === g.id))].slice(0, 5);
                }
            }

            console.timeEnd("Chat: VectorSearch");
            console.log(`Chat: Vector search returned ${vectorResults.length} relevant chunks (top score: ${vectorResults.length > 0 ? Number(vectorResults[0].similarity).toFixed(4) : 'N/A'})`);
        } catch (vectorError: any) {
            console.error("Chat: Vector Search failed:", vectorError);
        }

        // Build context from document results
        let contextText = "";
        let hasDocumentContext = false;

        if (vectorResults.length > 0) {
            hasDocumentContext = true;
            contextText += "## WORKSPACE DOCUMENTS:\n";
            vectorResults.forEach((chunk: any) => {
                const sourceId = sources.length + 1;
                contextText += `[${sourceId}] From Document: "${chunk.docTitle}"\nContent: ${chunk.content}\n\n`;
                sources.push({ id: sourceId, type: "document", title: chunk.docTitle, content: chunk.content });
            });
        }

        // WEB SEARCH (Deep Search)
        const finalTopScore = vectorResults.length > 0 ? Number(vectorResults[0].similarity) : 0;
        const needsWeb = includeWebSearch || vectorResults.length === 0 || (finalTopScore < 0.3);
        let hasWebContext = false;

        if (needsWeb) {
            console.log("Chat: Triggering Deep Search...");
            try {
                const webResults = await searchFirecrawl(question, 3);
                if (webResults.length > 0) {
                    hasWebContext = true;
                    contextText += "## LIVE WEB KNOWLEDGE:\n";
                    webResults.forEach((res) => {
                        const sourceId = sources.length + 1;
                        const content = res.markdown || res.content || "";
                        contextText += `[${sourceId}] From Web Page: "${res.title}" (${res.url})\nContent: ${content}\n\n`;
                        sources.push({ id: sourceId, type: "web", title: res.title, url: res.url, content: content.slice(0, 500) });
                    });
                }
                console.log(`Chat: Web search returned ${webResults.length} results`);
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

        // Fetch recent conversation history for context
        let conversationHistory = "";
        try {
            const recentMessages = await (prisma as any).message.findMany({
                where: { workspaceId: wsId, userId },
                orderBy: { createdAt: "desc" },
                take: 6, // Last 3 pairs
                select: { role: true, content: true },
            });

            if (recentMessages && recentMessages.length > 0) {
                const msgs = recentMessages.reverse();
                conversationHistory = "\n## RECENT CONVERSATION:\n" +
                    msgs.map((m: any) => `${m.role}: ${m.content.slice(0, 300)}`).join("\n");
            }
        } catch (histError) {
            console.error("Chat: Failed to fetch history:", histError);
        }

        // Build system prompt with clear instructions based on available context
        let contextInstructions = "";

        if (!hasDocumentContext && !hasWebContext) {
            // NO CONTEXT AT ALL — must prevent hallucination
            contextInstructions = `
WARNING: There are NO documents in this workspace and web search returned no results.
You MUST respond with one of these approaches:
1. If the question is general knowledge (like "what is JavaScript?"), answer from your training data BUT clearly state: "Note: This answer is from my general knowledge, not from any workspace documents."
2. If the question asks about specific documents, files, or workspace content, respond: "I don't have any documents in this workspace to answer your question. Please upload relevant documents first, or enable Deep Search to search the web."
3. NEVER make up document names, file contents, or pretend to have access to data you don't have.`;
        } else if (hasDocumentContext && !hasWebContext) {
            contextInstructions = `
You have access to WORKSPACE DOCUMENTS only. Answer strictly from these documents.
If the documents don't contain the answer, say so clearly.`;
        } else if (!hasDocumentContext && hasWebContext) {
            contextInstructions = `
No workspace documents were found. Answers are based on WEB SEARCH results only.
Clearly attribute all information to the web sources provided.`;
        } else {
            contextInstructions = `
You have both WORKSPACE DOCUMENTS and WEB SEARCH results.
Prioritize workspace documents. Use web results to supplement.`;
        }

        const systemPrompt = `You are a world-class AI research assistant integrated into a document workspace.
        
${contextInstructions}

RULES:
1. ALWAYS use inline citations like [1], [2] when referencing information from the provided context.
2. If information is from a DOCUMENT, clearly attribute it to the file name.
3. If information is from the WEB, clearly attribute it to the URL.
4. DO NOT fabricate or hallucinate information. Only use information from the provided context or your general knowledge (clearly labeled).
5. Be concise and precise. Answer the question directly.

${contextText ? `CONTEXT:\n${contextText}` : "CONTEXT: [EMPTY — No documents or web results available]"}
${conversationHistory}

After your answer, provide exactly 3 suggested follow-up questions starting with "SUGGESTED_QUESTIONS:".`;

        // Hybrid LLM Selection
        let chatModel;
        const openRouterKey = process.env.OPENAI_API_KEY;
        const groqKey = process.env.GROQ_API_KEY;

        if (groqKey && groqKey.startsWith("gsk_")) {
            chatModel = groq("llama-3.3-70b-versatile");
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

        // Wrap response to include sources metadata
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
