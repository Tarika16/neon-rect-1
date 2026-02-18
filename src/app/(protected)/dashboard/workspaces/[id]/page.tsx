"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, FileText, MessageSquare, Send, Loader2, Globe, CheckCircle } from "lucide-react";
import { useParams } from "next/navigation";

interface Document {
    id: string;
    title: string;
    workspaceId: string;
    createdAt: string;
}

interface Message {
    role: "user" | "ai";
    content: string;
}

export default function WorkspaceDetailPage() {
    const params = useParams();
    const workspaceId = params.id as string;

    const [documents, setDocuments] = useState<Document[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deepSearch, setDeepSearch] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (workspaceId) {
            fetchDocuments();
            // Initial greeting
            setMessages([{ role: "ai", content: "Hello! I have access to all documents in this workspace. Ask me anything." }]);
        }
    }, [workspaceId]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const fetchDocuments = async () => {
        try {
            const res = await fetch(`/api/documents?workspaceId=${workspaceId}`);
            if (res.ok) {
                const data = await res.json();
                setDocuments(data);
            }
        } catch (e) {
            console.error("Failed to fetch docs", e);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        setUploading(true);

        const files = Array.from(e.target.files);
        let successCount = 0;

        for (const file of files) {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("workspaceId", workspaceId);

            try {
                const res = await fetch("/api/documents", {
                    method: "POST",
                    body: formData,
                });

                if (res.ok) {
                    successCount++;
                }
            } catch (error) {
                console.error("Upload failed for", file.name, error);
            }
        }

        if (successCount > 0) {
            await fetchDocuments();
        }
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input;
        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
        setLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    question: userMessage,
                    includeWebSearch: deepSearch
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");

            setMessages((prev) => [...prev, { role: "ai", content: data.answer }]);
        } catch (error) {
            setMessages((prev) => [...prev, { role: "ai", content: "⚠️ Error: Could not generate answer. Check API Key or Workspace content." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-6rem)] gap-6">
            {/* Sidebar: Document List */}
            <div className="w-1/3 glass-card flex flex-col p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <FileText className="text-purple-400" /> Files
                    </h2>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-primary btn-sm flex items-center gap-2"
                        disabled={uploading}
                    >
                        {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                        Add
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".pdf,.txt"
                        multiple
                        onChange={handleUpload}
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {documents.length === 0 && (
                        <p className="text-gray-400 text-center mt-10 text-sm">No documents in this workspace.</p>
                    )}
                    {documents.map((doc) => (
                        <div
                            key={doc.id}
                            className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2"
                        >
                            <FileText size={16} className="text-purple-400" />
                            <div className="flex-1 truncate">
                                <p className="font-medium text-white truncate text-sm">{doc.title}</p>
                            </div>
                            <CheckCircle size={14} className="text-green-500/50" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Area: Chat */}
            <div className="flex-1 glass-card flex flex-col p-0 overflow-hidden relative">
                <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <MessageSquare className="text-green-400" />
                        Workspace Chat
                    </h3>

                    {/* Deep Search Toggle */}
                    <div
                        className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all border
                            ${deepSearch
                                ? "bg-blue-500/20 border-blue-500 text-blue-300"
                                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"}
                        `}
                        onClick={() => setDeepSearch(!deepSearch)}
                    >
                        <Globe size={16} />
                        <span className="text-sm font-medium">Deep Search</span>
                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${deepSearch ? "bg-blue-500" : "bg-gray-600"}`}>
                            <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${deepSearch ? "translate-x-4" : "translate-x-0"}`} />
                        </div>
                    </div>
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${m.role === "user"
                                ? "bg-purple-600 text-white rounded-tr-none"
                                : "bg-gray-800/80 text-gray-200 border border-white/10 rounded-tl-none whitespace-pre-wrap"
                                }`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-gray-800/80 p-3 rounded-2xl rounded-tl-none border border-white/10">
                                <Loader2 className="animate-spin text-purple-400" size={20} />
                            </div>
                        </div>
                    )}
                    <div ref={endRef} />
                </div>

                <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-white/5 flex gap-2">
                    <input
                        className="input-field flex-1"
                        placeholder={deepSearch ? "Ask a question (Web Search Enabled)..." : "Ask about your documents..."}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading || !input.trim()}
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
}
