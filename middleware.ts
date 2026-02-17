import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
    const { pathname } = req.nextUrl;
    const isLoggedIn = !!req.auth;
    const user = req.auth?.user as any; // Cast to access custom fields

    // Public routes — no auth needed
    const publicRoutes = ["/", "/login", "/signup"];
    if (publicRoutes.includes(pathname) || pathname.startsWith("/api/")) {
        return NextResponse.next();
    }

    // console.log(`[Middleware] Path: ${pathname} | LoggedIn: ${isLoggedIn} | Role: ${user?.role}`);

    // Not logged in → redirect to login
    if (!isLoggedIn) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    // Logged in but not approved → show pending page
    if (!user?.isApproved && pathname !== "/pending-approval") {
        return NextResponse.redirect(new URL("/pending-approval", req.url));
    }

    // Approved but trying to access pending page
    if (user?.isApproved && pathname === "/pending-approval") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Admin routes protection
    if (pathname.startsWith("/admin") && user?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
