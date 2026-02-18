"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, FileText, MessageSquare, Send, Loader2, Globe, CheckCircle, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

interface Document {
    id: string;
    title: string;
    workspaceId: string;
    createdAt: string;
}

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
}

export default function WorkspaceDetailPage() {
    const params = useParams();
    const router = useRouter();
    const workspaceId = params.id as string;

    const [documents, setDocuments] = useState<Document[]>([]);
    const [uploading, setUploading] = useState(false);
    const [deepSearch, setDeepSearch] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Manual Chat State
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (workspaceId) {
            fetchDocuments();
            fetchHistory();
        }
    }, [workspaceId]);

    useEffect(() => {
        if (messages.length > 0) {
            endRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const fetchHistory = async () => {
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}/messages`);
            if (res.ok) {
                const history = await res.json();
                if (history.length > 0) {
                    setMessages(history);
                } else {
                    setMessages([{ id: 'welcome', role: 'assistant', content: "Hello! I have access to all documents in this workspace. Ask me anything." }]);
                }
            }
        } catch (e) {
            console.error("Failed to fetch history", e);
        }
    };

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
        setError(null);

        const files = Array.from(e.target.files);
        let successCount = 0;
        let errors: string[] = [];

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
                } else {
                    const data = await res.json();
                    errors.push(`${file.name}: ${data.error || "Upload failed"}`);
                }
            } catch (error) {
                console.error("Upload failed for", file.name, error);
                errors.push(`${file.name}: Network error`);
            }
        }

        if (errors.length > 0) {
            setError(errors.join(", "));
        }

        if (successCount > 0) {
            await fetchDocuments();
        }
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { id: Date.now().toString(), role: "user", content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    question: userMessage.content,
                    includeWebSearch: deepSearch
                })
            });

            if (!res.ok) throw new Error(res.statusText);

            // Create placeholder for AI response
            const aiMessageId = (Date.now() + 1).toString();
            setMessages(prev => [...prev, { id: aiMessageId, role: "assistant", content: "" }]);

            if (!res.body) return;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                accumulatedContent += text;

                setMessages(prev => prev.map(m =>
                    m.id === aiMessageId ? { ...m, content: accumulatedContent } : m
                ));
            }
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "Sorry, something went wrong." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteWorkspace = async () => {
        if (!confirm("Are you sure you want to delete this workspace? This cannot be undone.")) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}`, {
                method: "DELETE"
            });
            if (res.ok) {
                router.push("/dashboard");
            } else {
                alert("Failed to delete workspace");
            }
        } catch (e) {
            console.error("Failed to delete", e);
            alert("Error deleting workspace");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-6rem)] gap-6">
            {/* Sidebar: Document List */}
            <div className="w-1/3 glass-card flex flex-col p-4 relative">
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
                        accept=".pdf,application/pdf,.txt,text/plain"
                        multiple
                        onChange={handleUpload}
                    />
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                        {error}
                        <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 pr-2 mb-12">
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

                {/* Delete Workspace Button */}
                <div className="absolute bottom-4 left-4 right-4">
                    <button
                        onClick={handleDeleteWorkspace}
                        disabled={isDeleting}
                        className="w-full btn bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex justify-center items-center gap-2"
                    >
                        {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                        Delete Workspace
                    </button>
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
                    {messages.map((m) => (
                        <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                            <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${m.role === "user"
                                ? "bg-purple-600 text-white rounded-tr-none"
                                : "bg-gray-800/80 text-gray-200 border border-white/10 rounded-tl-none whitespace-pre-wrap"
                                }`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-gray-800/80 p-3 rounded-2xl rounded-tl-none border border-white/10 flex items-center gap-2">
                                <Loader2 className="animate-spin text-purple-400" size={20} />
                                <span className="text-gray-400 text-sm">Thinking... {deepSearch && "(Searching Web)"}</span>
                            </div>
                        </div>
                    )}
                    <div ref={endRef} />
                </div>

                <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 bg-white/5 flex gap-2">
                    <input
                        className="input-field flex-1"
                        placeholder={deepSearch ? "Ask a question (Web Search Enabled)..." : "Ask about your documents..."}
                        value={input}
                        onChange={handleInputChange}
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isLoading || !input.trim()}
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
}
