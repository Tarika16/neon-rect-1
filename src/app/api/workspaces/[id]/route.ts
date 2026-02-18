import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function PATCH(
    req: Request,
    element: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { id } = await element.params;
        const { name } = await req.json();

        if (!name) {
            return new NextResponse("Name is required", { status: 400 });
        }

        const workspace = await (prisma as any).workspace.findUnique({
            where: {
                id,
                userId: session.user.id
            }
        });

        if (!workspace) {
            return new NextResponse("Workspace not found", { status: 404 });
        }

        const updatedWorkspace = await (prisma as any).workspace.update({
            where: {
                id
            },
            data: {
                name
            }
        });

        return NextResponse.json(updatedWorkspace);
    } catch (error) {
        console.error("Update Workspace Error:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    element: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { id } = await element.params;

        const workspace = await prisma.workspace.findUnique({
            where: {
                id,
                userId: session.user.id
            }
        });

        if (!workspace) {
            return new NextResponse("Workspace not found", { status: 404 });
        }

        await prisma.workspace.delete({
            where: {
                id
            }
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return new NextResponse("Internal Error", { status: 500 });
    }
}
