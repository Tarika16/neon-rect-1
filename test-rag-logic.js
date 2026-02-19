
const { chunkText, generateEmbedding } = require('./src/lib/rag');
const dotenv = require('dotenv');
dotenv.config();

async function test() {
    const text = "This is a test of the Cloud Computing Unit-1 document. Chapter 1: Introduction to Cloud. Cloud computing is a model for enabling ubiquitous, convenient, on-demand network access to a shared pool of configurable computing resources (e.g., networks, servers, storage, applications, and services) that can be rapidly provisioned and released with minimal management effort or service provider interaction.";

    console.log("Input Text Length:", text.length);

    const chunks = chunkText(text, 100, 10);
    console.log("Chunks Generated Count:", chunks.length);
    console.log("Sample Chunk:", chunks[0]);

    try {
        console.log("\nTesting Embedding Generation...");
        const vector = await generateEmbedding(text);
        console.log("Vector Dimension:", vector.length);
    } catch (e) {
        console.error("Embedding Error:", e);
    }
}

test();
