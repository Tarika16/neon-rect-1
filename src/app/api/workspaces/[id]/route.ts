import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const workspace = await prisma.workspace.findUnique({
            where: {
                id: params.id,
                userId: session.user.id
            }
        });

        if (!workspace) {
            return new NextResponse("Workspace not found", { status: 404 });
        }

        await prisma.workspace.delete({
            where: {
                id: params.id
            }
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return new NextResponse("Internal Error", { status: 500 });
    }
}
