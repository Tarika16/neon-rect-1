import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const docId = params.id;

        // Verify ownership and existence
        const document = await (prisma as any).document.findFirst({
            where: {
                id: docId,
                userId: session.user.id,
            },
        });

        if (!document) {
            return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
        }

        // Delete the document (Prisma Cascade should handle chunks if configured, 
        // but we'll be explicit if needed. schema.prisma has onDelete: Cascade)
        await (prisma as any).document.delete({
            where: { id: docId },
        });

        return NextResponse.json({ success: true, message: "Document deleted successfully" });
    } catch (error) {
        console.error("Delete Document Error:", error);
        return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
    }
}
