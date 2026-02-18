import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Users, Shield, LogOut, FileText, Layers } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) redirect("/login");
    if (!(session.user as any).isApproved) redirect("/pending-approval");

    const isAdmin = (session.user as any).role === "ADMIN";

    return (
        <div className="dashboard-layout">
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <Shield size={20} color="#6c63ff" />
                    NeonBoard
                </div>

                <nav className="sidebar-nav">
                    <Link href="/dashboard" className="sidebar-link">
                        <LayoutDashboard size={18} />
                        Dashboard
                    </Link>
                    {isAdmin && (
                        <Link href="/admin" className="sidebar-link">
                            <Users size={18} />
                            Manage Users
                            Manage Users
                        </Link>
                    )}
                    <Link href="/dashboard/documents" className="sidebar-link">
                        <FileText size={18} />
                        Documents
                    </Link>
                    <Link href="/dashboard/workspaces" className="sidebar-link">
                        <Layers size={18} />
                        Workspaces
                    </Link>
                </nav>

                <div
                    style={{
                        borderTop: "1px solid var(--border)",
                        paddingTop: "1rem",
                        marginTop: "auto",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            marginBottom: "0.75rem",
                        }}
                    >
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: "var(--bg-card)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 600,
                                fontSize: "0.85rem",
                                color: "var(--accent)",
                            }}
                        >
                            {session.user.name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div>
                            <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                                {session.user.name}
                            </div>
                            <div
                                style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-muted)",
                                }}
                            >
                                {(session.user as any).role}
                            </div>
                        </div>
                    </div>
                    <SignOutButton className="btn btn-outline btn-sm" />
                </div>
            </aside>

            <main className="main-content">{children}</main>
        </div >
    );
}
