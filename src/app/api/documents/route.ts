import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
// import pdf from "pdf-parse";
import { parse } from "path";

// We need to disable the default body parser to handle file uploads manually if we weren't using Next.js 13+ App Router's formData()
// But App Router handles formData() natively.

console.log("Loading /api/documents/route.ts...");

export async function POST(req: Request) {
    try {
        const session = await auth();
        console.log("Upload: Session User ID:", session?.user?.id);

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const workspaceId = formData.get("workspaceId") as string | null;

        console.log("Upload: File:", file?.name, "Workspace:", workspaceId);

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        console.log(`Upload: Checking file type: ${file.type}, name: ${file.name}`);

        const isPdf = file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
        const isText = file.type.includes("text") || file.name.toLowerCase().endsWith(".txt");

        if (!isPdf && !isText) {
            return NextResponse.json({ error: `Unsupported file type: ${file.type} (${file.name})` }, { status: 400 });
        }

        // Read file buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        let content = "";

        if (isPdf) {
            try {
                // Dynamic import to prevent top-level crashes
                const pdfParse = (await import("pdf-parse-fork")).default;

                const data = await pdfParse(buffer);
                content = data.text;
                console.log("Upload: PDF parsed, length:", content.length);
            } catch (pdfError: any) {
                console.error("Upload: PDF Parse Error", pdfError);
                return NextResponse.json({
                    error: `Failed to parse PDF: ${pdfError.message || "Unknown error"}. (Filename: ${file.name})`
                }, { status: 500 });
            }
        } else {
            content = buffer.toString("utf-8");
            console.log("Upload: Text read, length:", content.length);
        }

        if (!content.trim()) {
            return NextResponse.json({ error: "File is empty or unreadable" }, { status: 400 });
        }

        // Save to DB
        // @ts-ignore
        const doc = await prisma.document.create({
            data: {
                title: file.name,
                content: content,
                userId: (session?.user as any).id,
                workspaceId: workspaceId || null,
            },
        });

        console.log("Upload: DB Saved Document:", doc.id);

        // RAG Ingestion: Chunk & Embed
        try {
            const { chunkText, generateEmbedding } = await import("@/lib/rag");
            const chunks = chunkText(content);
            console.log(`Upload: Generated ${chunks.length} chunks`);

            for (const chunkContent of chunks) {
                const embedding = await generateEmbedding(chunkContent);

                // Save chunk with embedding
                // Prisma doesn't support vector types directly in create/update yet without raw query or specific setup
                // But with the extension enabled, we can try to pass it if typed correctly, or use $executeRaw

                // Workaround for Unsupported type in Prisma:
                // We create the chunk first, then update it with raw SQL for the vector
                // @ts-ignore - Local types may be outdated due to file lock
                const chunk = await prisma.documentChunk.create({
                    data: {
                        content: chunkContent,
                        documentId: doc.id,
                        metadata: { source: file.name }
                    }
                });

                // Update vector using raw SQL
                await prisma.$executeRaw`
                    UPDATE "DocumentChunk"
                    SET embedding = ${embedding}::vector
                    WHERE id = ${chunk.id}
                `;
            }
            console.log("Upload: Embeddings generated and saved.");

        } catch (ragError) {
            console.error("RAG Ingestion Error:", ragError);
            // We don't fail the upload if RAG fails, but we should probably log it well
        }

        return NextResponse.json({ id: doc.id, title: doc.title, workspaceId: doc.workspaceId });

    } catch (error: any) {
        console.error("Upload Error:", error);
        return NextResponse.json({ error: error.message || "Failed to process file" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!(session?.user as any)?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId");

        const whereClause: any = { userId: (session?.user as any).id };
        if (workspaceId) {
            whereClause.workspaceId = workspaceId;
        }

        // @ts-ignore
        const docs = await (prisma as any).document.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            select: { id: true, title: true, createdAt: true, workspaceId: true }
        });

        return NextResponse.json(docs);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
