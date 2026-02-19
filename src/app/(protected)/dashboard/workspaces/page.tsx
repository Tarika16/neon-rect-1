"use client";

import { useState, useEffect } from "react";
import { Layers, Plus, Loader2, Calendar, FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Workspace {
    id: string;
    name: string;
    createdAt: string;
    _count: {
        documents: number;
    };
}

export default function WorkspacesPage() {
    const router = useRouter();
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");

    useEffect(() => {
        fetchWorkspaces();
    }, []);

    const fetchWorkspaces = async () => {
        try {
            const res = await fetch("/api/workspaces");
            if (res.ok) {
                const data = await res.json();
                setWorkspaces(data);
            }
        } catch (error) {
            console.error("Failed to fetch workspaces", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setCreating(true);
        try {
            const res = await fetch("/api/workspaces", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName }),
            });

            if (res.ok) {
                const newWorkspace = await res.json();
                setWorkspaces([newWorkspace, ...workspaces]);
                setNewName("");
            } else {
                alert("Failed to create workspace");
            }
        } catch (error) {
            console.error("Create error", error);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteWorkspace = async (id: string, e: React.MouseEvent) => {
        e.preventDefault(); // Prevent Link navigation
        e.stopPropagation();

        if (!window.confirm("Are you sure you want to delete this workspace? All documents and messages inside will be lost.")) return;

        try {
            const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
            if (res.ok) {
                setWorkspaces(prev => prev.filter(ws => ws.id !== id));
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.error || "Failed to delete workspace");
            }
        } catch (error) {
            console.error("Delete Workspace Error:", error);
            alert("An error occurred during deletion.");
        }
    };

    const formatDate = (dateString: string) => {
        const d = new Date(dateString);
        return isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Layers className="text-purple-400" /> My Workspaces
                </h1>
            </div>

            {/* Create Bar */}
            <div className="glass-card p-4 flex items-center gap-4">
                <form onSubmit={handleCreate} className="flex-1 flex gap-2">
                    <input
                        className="input-field flex-1"
                        placeholder="New Workspace Name..."
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        disabled={creating}
                    />
                    <button
                        type="submit"
                        className="btn btn-primary flex items-center gap-2"
                        disabled={creating || !newName.trim()}
                    >
                        {creating ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                        Create
                    </button>
                </form>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex justify-center p-10">
                    <Loader2 className="animate-spin text-purple-400" size={32} />
                </div>
            ) : workspaces.length === 0 ? (
                <div className="text-center py-10 text-gray-400 glass-card">
                    <Layers size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No workspaces found. Create one to get started!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {workspaces.map((ws) => (
                        <div key={ws.id} className="relative group">
                            <Link
                                href={`/dashboard/workspaces/${ws.id}`}
                                className="glass-card p-6 block hover:bg-white/5 transition-all border border-white/10 hover:border-purple-500/50"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-3 bg-purple-500/20 rounded-lg group-hover:bg-purple-500/30 transition-colors">
                                        <Layers className="text-purple-400 group-hover:text-purple-300" size={24} />
                                    </div>
                                    <span className="text-xs text-gray-500 font-mono">
                                        {ws.id.slice(-4)}
                                    </span>
                                </div>

                                <h3 className="text-lg font-bold text-white mb-2 truncate pr-8">{ws.name}</h3>

                                <div className="flex items-center gap-4 text-sm text-gray-400">
                                    <span className="flex items-center gap-1">
                                        <FileText size={14} />
                                        {ws._count?.documents || 0} Docs
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Calendar size={14} />
                                        {formatDate(ws.createdAt)}
                                    </span>
                                </div>
                            </Link>

                            <button
                                onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-400 transition-all rounded-lg hover:bg-red-400/10 z-10"
                                title="Delete Workspace"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
