import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { name } = await req.json();

        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const workspace = await (prisma as any).workspace.create({
            data: {
                name,
                userId: session.user.id,
            },
        });

        return NextResponse.json(workspace);
    } catch (error) {
        console.error("Create Workspace Error:", error);
        return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const workspaces = await (prisma as any).workspace.findMany({
            where: {
                userId: session.user.id,
            },
            include: {
                _count: {
                    select: { documents: true },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json(workspaces);
    } catch (error) {
        console.error("List Workspaces Error:", error);
        return NextResponse.json({ error: "Failed to list workspaces" }, { status: 500 });
    }
}
