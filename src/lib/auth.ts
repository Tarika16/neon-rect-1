import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            name: "credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                logger.log(`Attempting login for: ${credentials?.email}`);

                if (!credentials?.email || !credentials?.password) {
                    logger.log("Auth Error: Missing credentials");
                    return null;
                }

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email as string },
                });

                if (!user) {
                    logger.log(`Auth Error: User not found for email: ${credentials.email}`);
                    return null;
                }

                logger.log(`User found: ${user.email} (Role: ${user.role}, Approved: ${user.isApproved})`);

                const bcrypt = await import("bcryptjs");
                const isValid = await bcrypt.compare(
                    credentials.password as string,
                    user.password
                );

                if (!isValid) {
                    logger.log(`Auth Error: Invalid password for user: ${user.email}`);
                    return null;
                }

                logger.log("Auth Success: Password matched");

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isApproved: user.isApproved,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                logger.log(`JWT Callback: User ${user.email} (Role: ${(user as any).role})`);
                token.role = (user as any).role;
                token.isApproved = (user as any).isApproved;
                token.id = (user as any).id;
            }
            return token;
        },
        async session({ session, token }) {
            logger.log(`Session Callback: User ${session.user?.email}`);
            if (session.user) {
                (session.user as any).role = token.role;
                (session.user as any).isApproved = token.isApproved;
                (session.user as any).id = token.id;
            }
            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
    },
    trustHost: true,
});
