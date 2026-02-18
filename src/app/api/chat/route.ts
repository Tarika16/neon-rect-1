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

        const { documentId, workspaceId, question, includeWebSearch } = await req.json();

        if (!question) {
            return NextResponse.json({ error: "Missing question" }, { status: 400 });
        }

        // Logic: Fetch Context (Single Doc OR Workspace)
        let contextText = "";

        // 1. Internal Documents
        if (workspaceId) {
            // Fetch ALL docs in workspace
            const docs = await (prisma as any).document.findMany({
                where: { workspaceId: workspaceId, userId: session.user.id },
                select: { id: true, title: true, content: true }
            });

            if (docs.length === 0) {
                return NextResponse.json({ error: "Workspace is empty or not found" }, { status: 404 });
            }

            // Context Stuffing: XML Style
            contextText += "<internal-knowledge>\n";
            for (const doc of docs) {
                // Truncate individual docs slightly to fit more
                const safeContent = doc.content.slice(0, 30000);
                contextText += `<document title="${doc.title}">\n${safeContent}\n</document>\n\n`;
            }
            contextText += "</internal-knowledge>\n\n";

        } else if (documentId) {
            // Single Doc Mode (Backwards compatibility)
            const doc = await (prisma as any).document.findUnique({
                where: { id: documentId },
            });

            if (!doc || doc.userId !== session.user.id) {
                return NextResponse.json({ error: "Document not found or forbidden" }, { status: 404 });
            }
            contextText += `<document title="${doc.title}">\n${doc.content.slice(0, 50000)}\n</document>\n\n`;
        } else {
            return NextResponse.json({ error: "Missing documentId or workspaceId" }, { status: 400 });
        }

        // 2. External Web Search (Firecrawl)
        if (includeWebSearch) {
            const webResults = await searchFirecrawl(question, 3);
            if (webResults.length > 0) {
                contextText += "<web-search-results>\n";
                for (const res of webResults) {
                    contextText += `<result title="${res.title}" url="${res.url}">\n${res.markdown || res.content}\n</result>\n\n`;
                }
                contextText += "</web-search-results>\n\n";
            }
        }

        // Construct System Prompt
        const systemPrompt = `You are an advanced AI assistant tailored for research and analysis.
        
        Your Goal: Answer the user's question using ONLY the provided context below.
        
        Instructions:
        1. Search through the <internal-knowledge> and <web-search-results> provided.
        2. Synthesize an answer that combines information from multiple documents or web sources if necessary.
        3. CITATIONS ARE MANDATORY. When you use a piece of information, you must append [Source: Document Title] or [Source: URL] immediately after the sentence.
        4. If the answer is not in the context, state "I cannot find the answer in the provided documents or search results."
        
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

        return NextResponse.json({ answer });

    } catch (error: any) {
        console.error("Chat Error:", error);
        return NextResponse.json({ error: error.message || "Failed to generate answer" }, { status: 500 });
    }
}
