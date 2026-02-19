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

        // Fetch message activity for the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const messageStats = await (prisma as any).message.groupBy({
            by: ['createdAt'],
            where: {
                workspaceId,
                userId: session.user.id,
                createdAt: {
                    gte: sevenDaysAgo
                }
            },
            _count: {
                id: true
            }
        });

        // Format for Recharts (group by YYYY-MM-DD)
        const activityMap: Record<string, number> = {};
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            activityMap[dateStr] = 0;
        }

        messageStats.forEach((stat: any) => {
            const dateStr = new Date(stat.createdAt).toISOString().split('T')[0];
            if (activityMap[dateStr] !== undefined) {
                activityMap[dateStr] += stat._count.id;
            }
        });

        const activityData = Object.entries(activityMap)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return NextResponse.json({
            documentCount: documents.length,
            totalChunks,
            totalWords,
            activityData,
        });
    } catch (error) {
        console.error("Workspace Analytics Error:", error);
        return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
    }
}
