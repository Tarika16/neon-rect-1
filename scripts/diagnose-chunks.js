const { Client } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();

    const r1 = await c.query('SELECT COUNT(*) as cnt FROM "Document"');
    console.log('Total Documents:', r1.rows[0].cnt);

    const r2 = await c.query('SELECT COUNT(*) as cnt FROM "DocumentChunk"');
    console.log('Total Chunks:', r2.rows[0].cnt);

    const r3 = await c.query(`
        SELECT d.id, d.title, COUNT(c.id)::int as chunks
        FROM "Document" d
        LEFT JOIN "DocumentChunk" c ON c."documentId" = d.id
        GROUP BY d.id, d.title
        ORDER BY d."createdAt" DESC
        LIMIT 10
    `);
    console.log('\nDocuments (last 10):');
    r3.rows.forEach(r => console.log('  ' + r.title + ' -> ' + r.chunks + ' chunks'));

    const noChunks = r3.rows.filter(r => r.chunks === 0);
    console.log('\nDocuments with 0 chunks:', noChunks.length);

    await c.end();
})();
