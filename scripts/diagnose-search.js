/**
 * diagnose-search.js — Tests the full RAG pipeline.
 * Writes output to scripts/diag_output.txt for clean reading.
 */
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const outputFile = path.resolve(__dirname, 'diag_output.txt');
const lines = [];

function log(msg) {
    lines.push(msg);
    console.log(msg);
}

async function generateTestEmbedding(text) {
    const isOpenRouter = OPENAI_API_KEY?.startsWith('sk-or-');
    const baseUrl = isOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1';
    const model = isOpenRouter ? 'openai/text-embedding-3-small' : 'text-embedding-3-small';

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
        body: JSON.stringify({ input: text.slice(0, 8000), model, dimensions: 384 }),
    });

    const result = await res.json();
    if (result.data?.[0]?.embedding) {
        log(`  Embedding generated: ${result.data[0].embedding.length} dimensions`);
        return result.data[0].embedding;
    }
    log('  Embedding API error: ' + JSON.stringify(result).slice(0, 300));
    return null;
}

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    log('=== RAG DIAGNOSTIC ===\n');

    // 1. Document & Chunk Stats
    const { rows: docs } = await client.query(`
        SELECT d.id, d.title, LENGTH(d.content) as content_len, COUNT(c.id)::int as chunks,
               d."workspaceId"
        FROM "Document" d
        LEFT JOIN "DocumentChunk" c ON c."documentId" = d.id
        GROUP BY d.id, d.title, d.content, d."workspaceId"
        ORDER BY d."createdAt" DESC LIMIT 10
    `);
    log('--- Documents (latest 10) ---');
    docs.forEach(d => log(`  ${d.title} | ${d.chunks} chunks | ${d.content_len} chars | ws: ${d.workspaceid || 'none'}`));

    // 2. Check embedding dimensions of stored chunks
    const { rows: dimCheck } = await client.query(`
        SELECT id, vector_dims(embedding) as dims
        FROM "DocumentChunk"
        WHERE embedding IS NOT NULL
        LIMIT 5
    `);
    log('\n--- Stored Embedding Dimensions ---');
    if (dimCheck.length === 0) {
        log('  !! NO CHUNKS WITH EMBEDDINGS FOUND !!');
    } else {
        dimCheck.forEach(r => log(`  Chunk ${r.id.slice(0, 12)}... -> ${r.dims} dims`));
    }

    // 3. Check for chunks with NULL embeddings
    const { rows: [{ null_count }] } = await client.query(`
        SELECT COUNT(*) as null_count FROM "DocumentChunk" WHERE embedding IS NULL
    `);
    const { rows: [{ total_count }] } = await client.query(`
        SELECT COUNT(*) as total_count FROM "DocumentChunk"
    `);
    log('\n--- Embedding Coverage ---');
    log(`  Total chunks: ${total_count}`);
    log(`  With embeddings: ${total_count - null_count}`);
    log(`  NULL embeddings: ${null_count}`);

    // 4. Test vector search
    if (docs.length > 0) {
        const testQuestion = "What is this document about?";
        log(`\n--- Vector Search Test: "${testQuestion}" ---`);

        const embedding = await generateTestEmbedding(testQuestion);
        if (embedding) {
            const embStr = `[${embedding.join(',')}]`;
            const { rows: results } = await client.query(`
                SELECT 
                    chunk.id,
                    LEFT(chunk.content, 100) as content_preview,
                    doc.title as doc_title,
                    1 - (chunk.embedding <=> $1::vector) as similarity
                FROM "DocumentChunk" chunk
                JOIN "Document" doc ON chunk."documentId" = doc.id
                WHERE chunk.embedding IS NOT NULL
                ORDER BY chunk.embedding <=> $1::vector
                LIMIT 5
            `, [embStr]);

            if (results.length === 0) {
                log('  !! NO RESULTS - Vector search returned nothing !!');
            } else {
                results.forEach((r, i) => {
                    log(`  [${i + 1}] Score: ${Number(r.similarity).toFixed(4)} | Doc: ${r.doc_title}`);
                    log(`      "${r.content_preview}..."`);
                });
            }
        }

        // 5. Test with a document-specific question
        const firstDoc = docs[0];
        const specificQ = `What does ${firstDoc.title} say?`;
        log(`\n--- Document-Specific Search: "${specificQ}" ---`);
        const embedding2 = await generateTestEmbedding(specificQ);
        if (embedding2) {
            const embStr2 = `[${embedding2.join(',')}]`;
            const { rows: results2 } = await client.query(`
                SELECT 
                    chunk.id,
                    LEFT(chunk.content, 100) as content_preview,
                    doc.title as doc_title,
                    1 - (chunk.embedding <=> $1::vector) as similarity
                FROM "DocumentChunk" chunk
                JOIN "Document" doc ON chunk."documentId" = doc.id
                WHERE chunk.embedding IS NOT NULL
                ORDER BY chunk.embedding <=> $1::vector
                LIMIT 5
            `, [embStr2]);

            results2.forEach((r, i) => {
                log(`  [${i + 1}] Score: ${Number(r.similarity).toFixed(4)} | Doc: ${r.doc_title}`);
                log(`      "${r.content_preview}..."`);
            });
        }
    }

    // 6. Check API keys
    log('\n--- API Key Status ---');
    log(`  OPENAI_API_KEY: ${OPENAI_API_KEY ? `${OPENAI_API_KEY.slice(0, 10)}... (${OPENAI_API_KEY.startsWith('sk-or-') ? 'OpenRouter' : 'OpenAI'})` : 'MISSING'}`);
    log(`  GROQ_API_KEY: ${process.env.GROQ_API_KEY ? `${process.env.GROQ_API_KEY.slice(0, 10)}...` : 'MISSING'}`);
    log(`  FIRECRAWL_API_KEY: ${process.env.FIRECRAWL_API_KEY ? 'present' : 'MISSING (Deep Search will not work!)'}`);

    await client.end();

    // Write to file
    fs.writeFileSync(outputFile, lines.join('\n'), 'utf8');
    log('\nOutput saved to: ' + outputFile);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
