import { prisma } from "./src/lib/db";
import { hash } from "bcryptjs";

async function main() {
    const email = "admin@neon.com";
    const password = "password123";

    let user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        console.log("Admin user not found. Creating...");
        const hashedPassword = await hash(password, 12);
        user = await prisma.user.create({
            data: {
                email,
                name: "Admin User",
                password: hashedPassword,
                role: "ADMIN",
                isApproved: true,
            },
        });
        console.log("Admin user created:", user.id);
    } else {
        console.log("Admin user already exists:", user.id);
        if (!user.isApproved || user.role !== "ADMIN") {
            console.log("Updating admin permissions...");
            await prisma.user.update({
                where: { id: user.id },
                data: { role: "ADMIN", isApproved: true }
            });
            console.log("Admin permissions updated.");
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
