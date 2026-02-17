import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json({
        status: "Debug Logs",
        logs: logger.getLogs(),
    });
}
