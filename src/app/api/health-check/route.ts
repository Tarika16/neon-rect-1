import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        // 1. Check Env Vars
        const envStatus = {
            DATABASE_URL: process.env.DATABASE_URL ? "Set" : "MISSING",
            AUTH_SECRET: process.env.AUTH_SECRET ? `Set (Length: ${process.env.AUTH_SECRET.length})` : "MISSING",
            NEXTAUTH_URL: process.env.NEXTAUTH_URL || "MISSING",
            NODE_ENV: process.env.NODE_ENV,
        };

        // 2. Check DB Connection & Admin
        let dbStatus = "Unknown";
        let adminInfo = null;

        try {
            const userCount = await prisma.user.count();
            const admin = await prisma.user.findFirst({
                where: { role: "ADMIN" },
                select: { id: true, email: true, isApproved: true }
            });

            dbStatus = "Connected";
            adminInfo = admin ? { found: true, email: admin.email, approved: admin.isApproved } : { found: false };
        } catch (e: any) {
            dbStatus = `Failed: ${e.message}`;
        }

        return NextResponse.json({
            status: "Health Check",
            timestamp: new Date().toISOString(),
            environment: envStatus,
            database: {
                status: dbStatus,
                adminUser: adminInfo
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();
        if (!email || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return NextResponse.json({ result: "User Not Found" }, { status: 404 });

        const importBcrypt = await import("bcryptjs"); // Dynamic import to be safe
        const isValid = await importBcrypt.compare(password, user.password);

        return NextResponse.json({
            result: isValid ? "SUCCESS: Password Correct" : "FAILURE: Password Incorrect",
            email: user.email,
            role: user.role,
            approved: user.isApproved
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
