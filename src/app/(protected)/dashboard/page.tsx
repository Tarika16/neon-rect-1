import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Activity, Shield, Clock, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
    const session = await auth();

    if (!session?.user) redirect("/login");

    const isAdmin = (session.user as any).role === "ADMIN";

    return (
        <>
            <div className="page-header">
                <h1>Dashboard</h1>
                <p>Welcome back, {session.user.name}!</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div
                        className="stat-icon"
                        style={{ background: "rgba(108,99,255,0.12)" }}
                    >
                        <Shield size={20} color="#6c63ff" />
                    </div>
                    <div className="stat-label">Your Role</div>
                    <div className="stat-value" style={{ fontSize: "1.5rem" }}>
                        {(session.user as any).role}
                    </div>
                </div>

                <div className="stat-card">
                    <div
                        className="stat-icon"
                        style={{ background: "rgba(34,197,94,0.12)" }}
                    >
                        <Activity size={20} color="#22c55e" />
                    </div>
                    <div className="stat-label">Status</div>
                    <div
                        className="stat-value"
                        style={{ fontSize: "1.5rem", color: "var(--success)" }}
                    >
                        Approved
                    </div>
                </div>

                <div className="stat-card">
                    <div
                        className="stat-icon"
                        style={{ background: "rgba(245,158,11,0.12)" }}
                    >
                        <Clock size={20} color="#f59e0b" />
                    </div>
                    <div className="stat-label">Member Since</div>
                    <div className="stat-value" style={{ fontSize: "1.25rem" }}>
                        {new Date().toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                        })}
                    </div>
                </div>
            </div>

            <div className="glass-card">
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginBottom: "1rem",
                    }}
                >
                    <Sparkles size={20} color="#6c63ff" />
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 600 }}>
                        Quick Info
                    </h2>
                </div>
                <p
                    style={{
                        color: "var(--text-secondary)",
                        lineHeight: 1.7,
                        fontSize: "0.93rem",
                    }}
                >
                    {isAdmin
                        ? "You have Admin privileges. Head to the Manage Users section to approve new users, change roles, or remove accounts."
                        : "You have User level access. Contact an administrator if you need elevated privileges or additional features."}
                </p>
            </div>
        </>
    );
}
