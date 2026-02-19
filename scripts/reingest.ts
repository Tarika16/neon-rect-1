
import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { generateEmbedding, chunkText } from '../src/lib/rag';

const prisma = new PrismaClient();

async function reingest() {
    try {
        console.log("--- Starting Re-Ingestion (TS) ---");

        const docs = await (prisma as any).document.findMany({
            include: { _count: { select: { chunks: true } } }
        });

        const docsToProcess = docs.filter((d: any) => d._count.chunks === 0);
        console.log(`Found ${docsToProcess.length} documents to re-ingest.`);

        for (const doc of docsToProcess) {
            console.log(`Processing: ${doc.title} (${doc.id})`);
            const chunks = chunkText(doc.content);
            console.log(`- Generated ${chunks.length} chunks`);

            for (const chunkContent of chunks) {
                try {
                    const embedding = await generateEmbedding(chunkContent);

                    const chunk = await (prisma as any).documentChunk.create({
                        data: {
                            content: chunkContent,
                            documentId: doc.id,
                            metadata: { source: doc.title }
                        }
                    });

                    await prisma.$executeRaw`
                        UPDATE "DocumentChunk"
                        SET embedding = ${embedding}::vector
                        WHERE id = ${chunk.id}
                    `;
                } catch (chunkError: any) {
                    console.error(`  - Failed chunk: ${chunkError.message}`);
                }
            }
            console.log(`- Finished ${doc.title}`);
        }

        console.log("--- Re-Ingestion Complete ---");
    } catch (e) {
        console.error("Re-ingestion failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

reingest();
