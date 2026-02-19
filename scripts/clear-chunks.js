
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clear() {
    try {
        await prisma.$executeRaw`DELETE FROM "DocumentChunk"`;
        console.log("Cleared all DocumentChunks.");
    } catch (e) {
        console.error("Clear failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

clear();
