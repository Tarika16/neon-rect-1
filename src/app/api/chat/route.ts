import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchFirecrawl } from "@/lib/firecrawl";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { workspaceId, question, includeWebSearch } = await req.json();

        if (!question || !workspaceId) {
            return NextResponse.json({ error: "Missing question or workspaceId" }, { status: 400 });
        }

        console.log(`Chat: Processing question "${question}" for workspace ${workspaceId}`);

        // 1. Generate Query Embedding
        const { generateEmbedding } = await import("@/lib/rag");
        const queryEmbedding = await generateEmbedding(question);

        // 2. Vector Search (Semantic Retrieval)
        // Find top 5 chunks most similar to query_embedding within the workspace
        // We join DocumentChunk -> Document to filter by workspaceId
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

        console.log(`Chat: Found ${vectorResults.length} relevant chunks`);

        // 3. Evaluate Retrieval Quality
        const topScore = vectorResults.length > 0 ? vectorResults[0].similarity : 0;
        console.log(`Chat: Top similarity score: ${topScore}`);

        let contextText = "";
        let sources: any[] = [];

        // Format Document Context
        if (vectorResults.length > 0) {
            contextText += "## Internal Knowledge:\n";
            vectorResults.forEach((chunk, index) => {
                // Add to context
                contextText += `[${index + 1}] Document: "${chunk.docTitle}"\nContent: ${chunk.content}\n\n`;
                // Track source for frontend
                sources.push({
                    id: index + 1,
                    type: "document",
                    title: chunk.docTitle,
                    content: chunk.content
                });
            });
        }

        // 4. Hybrid Logic: Web Search Fallback
        // Trigger if: 
        // a) Explicitly requested (includeWebSearch = true)
        // b) Poor vector match (score < 0.5) AND we have no good results
        const isPoorMatch = topScore < 0.5;
        const shouldSearchWeb = includeWebSearch || (isPoorMatch && vectorResults.length < 2);

        if (shouldSearchWeb) {
            console.log("Chat: Triggering Web Search (Fallback/Requested)...");
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
                // Continue without web results
            }
        }

        // 5. LLM Generation
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

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: question },
            ],
            model: "llama-3.1-8b-instant",
        });

        const answer = completion.choices[0]?.message?.content || "No answer generated.";

        return NextResponse.json({
            answer,
            sources,
            isWebFallback: shouldSearchWeb
        });

    } catch (error: any) {
        console.error("Chat Error:", error);
        return NextResponse.json({ error: error.message || "Failed to generate answer" }, { status: 500 });
    }
}
