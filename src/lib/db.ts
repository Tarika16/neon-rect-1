import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Truly lazy Prisma Client for v7
// We pass the DATABASE_URL explicitly at runtime to avoid any config loading issues in Next.js
export const prisma = new Proxy({} as PrismaClient, {
    get(target, prop, receiver) {
        if (prop === "toJSON") return () => "PrismaClient";

        if (!globalForPrisma.prisma) {
            globalForPrisma.prisma = new PrismaClient({
                datasourceUrl: process.env.DATABASE_URL,
            } as any);
        }

        const value = (globalForPrisma.prisma as any)[prop];
        return typeof value === "function" ? value.bind(globalForPrisma.prisma) : value;
    },
});
