
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to chunk text (replicating lib/rag.ts logic)
function chunkText(text, chunkSize = 500, overlap = 50) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        let slice = text.slice(start, end);
        if (end < text.length) {
            const lastSpace = slice.lastIndexOf(' ');
            if (lastSpace > chunkSize * 0.8) {
                slice = slice.slice(0, lastSpace);
                start += lastSpace + 1 - overlap;
            } else {
                start += chunkSize - overlap;
            }
        } else {
            start += chunkSize - overlap;
        }
        if (slice.trim().length > 0) {
            chunks.push(slice.trim());
        }
    }
    return chunks;
}

async function reingest() {
    try {
        console.log("--- Starting Re-Ingestion ---");

        const docs = await prisma.document.findMany({
            include: { _count: { select: { chunks: true } } }
        });

        const docsToProcess = docs.filter(d => d._count.chunks === 0);
        console.log(`Found ${docsToProcess.length} documents to re-ingest.`);

        // Correctly relative to the project root where we run tsx
        const { generateEmbedding } = await import('../src/lib/rag.ts');

        for (const doc of docsToProcess) {
            console.log(`Processing: ${doc.title} (${doc.id})`);
            const chunks = chunkText(doc.content);
            console.log(`- Generated ${chunks.length} chunks`);

            for (const chunkContent of chunks) {
                try {
                    const embedding = await generateEmbedding(chunkContent);

                    const chunk = await prisma.documentChunk.create({
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
                } catch (chunkError) {
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
