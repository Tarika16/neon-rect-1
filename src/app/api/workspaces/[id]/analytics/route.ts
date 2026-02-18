import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
    req: Request,
    element: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: workspaceId } = await element.params;

        // Fetch all documents in the workspace
        const documents = await (prisma as any).document.findMany({
            where: {
                workspaceId,
                userId: session.user.id,
            },
            select: {
                content: true,
                _count: {
                    select: { chunks: true },
                },
            },
        });

        const totalChunks = documents.reduce((acc: number, doc: any) => acc + doc._count.chunks, 0);
        const totalWords = documents.reduce((acc: number, doc: any) => {
            const words = doc.content ? doc.content.split(/\s+/).filter((w: string) => w.length > 0).length : 0;
            return acc + words;
        }, 0);

        return NextResponse.json({
            documentCount: documents.length,
            totalChunks,
            totalWords,
        });
    } catch (error) {
        console.error("Workspace Analytics Error:", error);
        return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
    }
}
