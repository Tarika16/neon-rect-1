"use client";

import { useState, useEffect } from "react";
export const dynamic = "force-dynamic";
import {
    Users,
    CheckCircle,
    XCircle,
    Trash2,
    ShieldCheck,
    ShieldOff,
    RefreshCw,
} from "lucide-react";

interface UserData {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "USER";
    isApproved: boolean;
    createdAt: string;
}

export default function AdminPage() {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/users");
            const data = await res.json();
            setUsers(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleApprove = async (userId: string, approve: boolean) => {
        setActionLoading(userId);
        await fetch("/api/admin/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, isApproved: approve }),
        });
        await fetchUsers();
        setActionLoading(null);
    };

    const handleRoleToggle = async (userId: string, currentRole: string) => {
        setActionLoading(userId);
        const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
        await fetch("/api/admin/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, role: newRole }),
        });
        await fetchUsers();
        setActionLoading(null);
    };

    const handleDelete = async (userId: string) => {
        if (!confirm("Are you sure you want to delete this user?")) return;
        setActionLoading(userId);
        await fetch(`/api/admin/users?userId=${userId}`, { method: "DELETE" });
        await fetchUsers();
        setActionLoading(null);
    };

    const totalUsers = users.length;
    const approvedCount = users.filter((u) => u.isApproved).length;
    const pendingCount = users.filter((u) => !u.isApproved).length;
    const adminCount = users.filter((u) => u.role === "ADMIN").length;

    return (
        <>
            <div className="page-header">
                <h1>Manage Users</h1>
                <p>Approve, manage roles, and oversee all users.</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div
                        className="stat-icon"
                        style={{ background: "rgba(108,99,255,0.12)" }}
                    >
                        <Users size={20} color="#6c63ff" />
                    </div>
                    <div className="stat-value">{totalUsers}</div>
                    <div className="stat-label">Total Users</div>
                </div>
                <div className="stat-card">
                    <div
                        className="stat-icon"
                        style={{ background: "rgba(34,197,94,0.12)" }}
                    >
                        <CheckCircle size={20} color="#22c55e" />
                    </div>
                    <div className="stat-value">{approvedCount}</div>
                    <div className="stat-label">Approved</div>
                </div>
                <div className="stat-card">
                    <div
                        className="stat-icon"
                        style={{ background: "rgba(245,158,11,0.12)" }}
                    >
                        <XCircle size={20} color="#f59e0b" />
                    </div>
                    <div className="stat-value">{pendingCount}</div>
                    <div className="stat-label">Pending</div>
                </div>
                <div className="stat-card">
                    <div
                        className="stat-icon"
                        style={{ background: "rgba(108,99,255,0.12)" }}
                    >
                        <ShieldCheck size={20} color="#6c63ff" />
                    </div>
                    <div className="stat-value">{adminCount}</div>
                    <div className="stat-label">Admins</div>
                </div>
            </div>

            <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "1.25rem 1.5rem",
                        borderBottom: "1px solid var(--border)",
                    }}
                >
                    <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>All Users</h2>
                    <button
                        onClick={fetchUsers}
                        className="btn btn-outline btn-sm"
                        disabled={loading}
                    >
                        <RefreshCw size={14} className={loading ? "spinning" : ""} />
                        Refresh
                    </button>
                </div>

                {loading ? (
                    <div
                        style={{
                            padding: "3rem",
                            textAlign: "center",
                            color: "var(--text-muted)",
                        }}
                    >
                        <div
                            className="spinner"
                            style={{ margin: "0 auto 0.75rem" }}
                        />
                        Loading users...
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Joined</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{user.name}</div>
                                            <div
                                                style={{
                                                    fontSize: "0.8rem",
                                                    color: "var(--text-muted)",
                                                }}
                                            >
                                                {user.email}
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                className={`badge ${user.role === "ADMIN"
                                                    ? "badge-admin"
                                                    : "badge-user"
                                                    }`}
                                            >
                                                {user.role}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className={`badge ${user.isApproved
                                                    ? "badge-approved"
                                                    : "badge-pending"
                                                    }`}
                                            >
                                                {user.isApproved ? "Approved" : "Pending"}
                                            </span>
                                        </td>
                                        <td
                                            style={{
                                                fontSize: "0.85rem",
                                                color: "var(--text-secondary)",
                                            }}
                                        >
                                            {new Date(user.createdAt).toLocaleDateString()}
                                        </td>
                                        <td>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: "0.4rem",
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                {!user.isApproved ? (
                                                    <button
                                                        onClick={() => handleApprove(user.id, true)}
                                                        className="btn btn-success btn-sm"
                                                        disabled={actionLoading === user.id}
                                                        title="Approve"
                                                    >
                                                        <CheckCircle size={14} /> Approve
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleApprove(user.id, false)}
                                                        className="btn btn-outline btn-sm"
                                                        disabled={actionLoading === user.id}
                                                        title="Revoke"
                                                    >
                                                        <XCircle size={14} /> Revoke
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() =>
                                                        handleRoleToggle(user.id, user.role)
                                                    }
                                                    className="btn btn-outline btn-sm"
                                                    disabled={actionLoading === user.id}
                                                    title="Toggle role"
                                                >
                                                    {user.role === "ADMIN" ? (
                                                        <>
                                                            <ShieldOff size={14} /> Demote
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ShieldCheck size={14} /> Promote
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(user.id)}
                                                    className="btn btn-danger btn-sm"
                                                    disabled={actionLoading === user.id}
                                                    title="Delete user"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
