import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
    await cookies(); // Force dynamic
    const session = await auth();

    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isApproved: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
}

export async function PATCH(req: Request) {
    const session = await auth();

    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { userId, isApproved, role } = await req.json();

    if (!userId) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const updateData: any = {};
    if (typeof isApproved === "boolean") updateData.isApproved = isApproved;
    if (role === "ADMIN" || role === "USER") updateData.role = role;

    const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isApproved: true,
        },
    });

    return NextResponse.json(user);
}

export async function DELETE(req: Request) {
    const session = await auth();

    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Prevent self-deletion
    if (userId === (session.user as any).id) {
        return NextResponse.json(
            { error: "Cannot delete yourself" },
            { status: 400 }
        );
    }

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ message: "User deleted" });
}
