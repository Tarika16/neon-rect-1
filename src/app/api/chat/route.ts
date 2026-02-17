import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { documentId, question } = await req.json();

        if (!documentId || !question) {
            return NextResponse.json({ error: "Missing documentId or question" }, { status: 400 });
        }

        // Fetch document content
        const doc = await (prisma as any).document.findUnique({
            where: { id: documentId },
        });

        if (!doc) {
            return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        if (doc.userId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Construct Prompt
        // Truncate content if too large (approx 15k chars to start, Groq supports ~32k tokens on Llama 3)
        const truncatedContent = doc.content.slice(0, 50000);

        const systemPrompt = `You are a helpful AI assistant. Answer the user's question based ONLY on the following document context. If the answer is not in the context, say "I cannot find the answer in the document."
        
        Document Content:
        ${truncatedContent}
        `;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: question },
            ],
            model: "llama-3.1-8b-instant", // High speed, low latency
        });

        const answer = completion.choices[0]?.message?.content || "No answer generated.";

        return NextResponse.json({ answer });

    } catch (error: any) {
        console.error("Chat Error:", error);
        return NextResponse.json({ error: error.message || "Failed to generate answer" }, { status: 500 });
    }
}
