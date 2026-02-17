import { prisma } from "./src/lib/db";

async function main() {
    try {
        console.log("Checking if prisma.document exists...");
        if (!prisma) {
            console.error("Prisma instance is undefined!");
            return;
        }
        // @ts-ignore - We want to check if it exists at runtime even if types say no
        if (prisma.document) {
            console.log("prisma.document exists!");
            // @ts-ignore
            const count = await prisma.document.count();
            console.log("Current document count:", count);
        } else {
            console.error("prisma.document is UNDEFINED.");
            console.log("Available keys on prisma:", Object.keys(prisma));
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

main();
