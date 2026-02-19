#!/usr/bin/env node
/**
 * reingest.js — Re-embed documents that have 0 chunks in the database.
 * 
 * Uses pg directly (not Prisma) for full control over vector SQL.
 * Replicates the embedding logic from rag.ts:
 *   1. OpenAI/OpenRouter with dimensions=384
 *   2. Fallback to Xenova/MiniLM-L6-v2 (384-dim)
 * 
 * Usage: node scripts/reingest.js
 */

const { Client } = require('pg');
const path = require('path');
const crypto = require('crypto');

// Load .env from project root
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not found in .env');
    process.exit(1);
}

// ─── Embedding Functions ─────────────────────────────────────────────────────

async function generateEmbeddingOpenAI(text) {
    if (!OPENAI_API_KEY) return null;

    const isOpenRouter = OPENAI_API_KEY.startsWith('sk-or-');
    const baseUrl = isOpenRouter
        ? 'https://openrouter.ai/api/v1'
        : 'https://api.openai.com/v1';
    const model = isOpenRouter
        ? 'openai/text-embedding-3-small'
        : 'text-embedding-3-small';

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
    };
    if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://neon-admin-dashboard.vercel.app';
        headers['X-Title'] = 'NeonBoard';
    }

    const res = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            input: text.slice(0, 8000),
            model,
            dimensions: 384, // MUST match DB vector(384)
        }),
    });

    const result = await res.json();
    if (result.data?.[0]?.embedding) {
        return result.data[0].embedding;
    }

    console.warn('  OpenAI embedding API returned error:', JSON.stringify(result.error || result).slice(0, 200));
    return null;
}

let xenovaExtractor = null;

async function generateEmbeddingXenova(text) {
    try {
        if (!xenovaExtractor) {
            console.log('  Initializing Xenova pipeline (first call only)...');
            const { pipeline, env } = await import('@xenova/transformers');
            env.allowLocalModels = false;
            env.useBrowserCache = false;
            env.cacheDir = path.resolve(__dirname, '..', '.xenova-cache');
            xenovaExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            console.log('  Xenova pipeline ready.');
        }

        const output = await xenovaExtractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    } catch (e) {
        console.error('  Xenova embedding failed:', e.message);
        return null;
    }
}

async function generateEmbedding(text) {
    // Try OpenAI first (faster), fall back to Xenova
    const openaiResult = await generateEmbeddingOpenAI(text);
    if (openaiResult) return openaiResult;

    const xenovaResult = await generateEmbeddingXenova(text);
    if (xenovaResult) return xenovaResult;

    throw new Error('No embedding engine available');
}

// ─── Chunking (matches rag.ts) ───────────────────────────────────────────────

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

// ─── Generate CUID-like ID ───────────────────────────────────────────────────

function generateId() {
    // Simple cuid-compatible ID using timestamp + random hex
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `c${timestamp}${random}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    console.log('Connected to database.');

    try {
        // Enable pgvector extension (idempotent)
        await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

        // Find documents with 0 chunks
        const { rows: docs } = await client.query(`
            SELECT d.id, d.title, d.content, 
                   COUNT(c.id) as chunk_count
            FROM "Document" d
            LEFT JOIN "DocumentChunk" c ON c."documentId" = d.id
            GROUP BY d.id, d.title, d.content
            HAVING COUNT(c.id) = 0
            ORDER BY d."createdAt" DESC;
        `);

        if (docs.length === 0) {
            console.log('\n✓ All documents already have chunks. Nothing to reingest.');
            return;
        }

        console.log(`\nFound ${docs.length} document(s) with 0 chunks. Starting re-ingestion...\n`);

        let totalChunks = 0;

        for (const doc of docs) {
            const content = doc.content;
            if (!content || !content.trim()) {
                console.log(`  SKIP: "${doc.title}" (empty content)`);
                continue;
            }

            const chunks = chunkText(content);
            console.log(`  Processing: "${doc.title}" → ${chunks.length} chunks`);

            for (let i = 0; i < chunks.length; i++) {
                const chunkContent = chunks[i];
                try {
                    const embedding = await generateEmbedding(chunkContent);
                    const chunkId = generateId();
                    const embeddingStr = `[${embedding.join(',')}]`;

                    await client.query(
                        `INSERT INTO "DocumentChunk" (id, content, embedding, metadata, "documentId", "createdAt")
                         VALUES ($1, $2, $3::vector, $4, $5, NOW())`,
                        [
                            chunkId,
                            chunkContent,
                            embeddingStr,
                            JSON.stringify({ source: doc.title, chunk: i + 1, total: chunks.length }),
                            doc.id,
                        ]
                    );

                    totalChunks++;
                    process.stdout.write(`    Chunk ${i + 1}/${chunks.length} ✓\r`);
                } catch (chunkError) {
                    console.error(`\n    ERROR on chunk ${i + 1}: ${chunkError.message}`);
                }
            }
            console.log(); // newline after progress
        }

        console.log(`\n✓ Re-ingestion complete. Created ${totalChunks} chunks across ${docs.length} documents.`);

        // Verification: count total chunks now
        const { rows: [{ count }] } = await client.query('SELECT COUNT(*) as count FROM "DocumentChunk"');
        console.log(`  Total DocumentChunks in DB: ${count}`);
    } finally {
        await client.end();
        console.log('Database connection closed.');
    }
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
