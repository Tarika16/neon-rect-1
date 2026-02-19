
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
    try {
        console.log("--- RAG Diagnosis ---");

        const docCount = await prisma.document.count();
        const chunkCount = await prisma.documentChunk.count();

        console.log(`Total Documents: ${docCount}`);
        console.log(`Total Chunks: ${chunkCount}`);

        const sampleChunks = await prisma.documentChunk.findMany({
            take: 5,
            select: { id: true, documentId: true }
        });

        console.log("Sample Chunks check (raw query for embedding existence):");
        for (const c of sampleChunks) {
            const row = await prisma.$queryRaw`SELECT id, embedding IS NOT NULL as "hasEmbedding" FROM "DocumentChunk" WHERE id = ${c.id}`;
            console.log(`Chunk ${c.id}: Has Embedding? ${row[0].hasEmbedding}`);
        }

        // Test Embedding Logic
        console.log("\nChecking Environment Variables:");
        console.log("OPENAI_API_KEY present:", !!process.env.OPENAI_API_KEY);
        console.log("GROQ_API_KEY present:", !!process.env.GROQ_API_KEY);

    } catch (e) {
        console.error("Diagnosis failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
