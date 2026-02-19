"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, FileText, MessageSquare, Send, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

interface Document {
    id: string;
    title: string;
    createdAt: string;
}

interface Message {
    role: "user" | "ai";
    content: string;
}

export default function DocumentsPage() {
    const router = useRouter();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchDocuments();
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const fetchDocuments = async () => {
        try {
            const res = await fetch("/api/documents");
            if (res.ok) {
                const data = await res.json();
                setDocuments(data);
            }
        } catch (e) {
            console.error("Failed to fetch docs", e);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setUploading(true);

        const formData = new FormData();
        formData.append("file", e.target.files[0]);

        try {
            const res = await fetch("/api/documents", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Upload failed");
            }

            const newDoc = await res.json();
            setDocuments([newDoc, ...documents]);
            setSelectedDoc(newDoc);
            setMessages([{ role: "ai", content: `I've read **${newDoc.title}**. What would you like to know?` }]);
        } catch (error: any) {
            alert(`Upload Error: ${error.message}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("PERMANENT DELETE: Are you sure you want to delete this document? This action cannot be undone.")) return;

        try {
            const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
            if (res.ok) {
                setDocuments((prev) => prev.filter((doc) => doc.id !== id));
                if (selectedDoc?.id === id) {
                    setSelectedDoc(null);
                    setMessages([]);
                }
            } else {
                const data = await res.json();
                alert(data.error || "Failed to delete document");
            }
        } catch (error) {
            console.error("Delete Error:", error);
            alert("An error occurred during deletion.");
        }
    };

    const formatDate = (dateString: string) => {
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return "N/A";
        return d.toLocaleDateString();
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !selectedDoc) return;

        const userMessage = input;
        setInput("");

        setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
            { role: "ai", content: "" }
        ]);

        setLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId: selectedDoc.id, question: userMessage }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${res.status}`);
            }

            if (!res.body) throw new Error("No response body received from AI.");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const text = decoder.decode(value, { stream: true });
                    accumulatedContent += text;

                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];
                        if (lastMsg && lastMsg.role === "ai") {
                            return [...newMsgs.slice(0, -1), { ...lastMsg, content: accumulatedContent }];
                        }
                        return newMsgs;
                    });
                }
            } catch (streamError: any) {
                console.error("Stream read error:", streamError);
                throw new Error(`Connection interrupted: ${streamError.message}`);
            }

        } catch (error: any) {
            console.error("Chat Error:", error);
            setMessages((prev) => {
                const newMsgs = [...prev];
                const lastMsg = newMsgs[newMsgs.length - 1];
                if (lastMsg && lastMsg.role === "ai") {
                    return [...newMsgs.slice(0, -1), { role: "ai", content: `⚠️ Error: ${error.message}` }];
                }
                return [...newMsgs, { role: "ai", content: `⚠️ Error: ${error.message}` }];
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-6rem)] gap-6">
            {/* Sidebar Documents List */}
            <div className="w-1/3 glass-card flex flex-col p-4 animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex flex-col">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <FileText className="text-purple-400" /> Documents
                        </h2>
                        <span className="text-[10px] text-gray-600 font-mono tracking-widest uppercase">System v1.7.2-stable</span>
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-primary btn-sm flex items-center gap-2 hover:scale-105 transition-transform"
                        disabled={uploading}
                    >
                        {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                        Upload
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".pdf,.txt,.docx,.csv"
                        onChange={handleUpload}
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {documents.length === 0 && (
                        <p className="text-gray-400 text-center mt-10 text-sm">No documents yet.</p>
                    )}
                    {documents.map((doc) => (
                        <div
                            key={doc.id}
                            onClick={() => {
                                if (selectedDoc?.id !== doc.id) {
                                    setSelectedDoc(doc);
                                    setMessages([{ role: "ai", content: `I'm ready to answer questions about **${doc.title}**.` }]);
                                }
                            }}
                            className={`p-4 rounded-2xl cursor-pointer transition-all border relative flex flex-col gap-3 ${selectedDoc?.id === doc.id
                                ? "bg-purple-500/20 border-purple-500/50 shadow-lg shadow-purple-500/10 scale-[1.02]"
                                : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                }`}
                        >
                            <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-white truncate text-base">{doc.title}</p>
                                    <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1 font-medium">
                                        Added: {formatDate(doc.createdAt)}
                                    </p>
                                </div>

                                {/* HIGH VISIBILITY SIDEBAR DELETE BUTTON */}
                                <button
                                    onClick={(e) => handleDeleteDocument(doc.id, e)}
                                    className="p-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-all rounded-xl border border-red-500/20 hover:border-red-500 shadow-sm flex items-center justify-center group"
                                    title="PERMANENTLY DELETE THIS FILE"
                                >
                                    <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Interface */}
            <div className="flex-1 glass-card flex flex-col p-0 overflow-hidden relative animate-fade-in">
                {selectedDoc ? (
                    <>
                        <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center bg-gradient-to-r from-transparent to-red-500/5">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <MessageSquare className="text-green-400" />
                                <span className="text-white">Chat:</span> <span className="text-purple-300 truncate max-w-[250px]">{selectedDoc.title}</span>
                            </h3>

                            {/* MASSIVE HEADER DELETE BUTTON */}
                            <button
                                onClick={(e) => handleDeleteDocument(selectedDoc.id, e as any)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-black text-white bg-red-600 hover:bg-red-700 border-2 border-red-500/50 rounded-xl transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] uppercase tracking-wider"
                            >
                                <Trash2 size={18} />
                                Delete Permanently
                            </button>
                        </div>

                        <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${m.role === "user"
                                        ? "bg-purple-600 text-white rounded-tr-none shadow-lg shadow-purple-500/20 animate-slide-in-right"
                                        : "bg-gray-800/90 text-gray-200 border border-white/10 rounded-tl-none whitespace-pre-wrap shadow-inner animate-slide-in-left"
                                        }`}>
                                        {m.content || (loading && i === messages.length - 1 ? <Loader2 className="animate-spin text-purple-400" size={16} /> : "")}
                                    </div>
                                </div>
                            ))}
                            <div ref={endRef} />
                        </div>

                        <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-white/5 flex gap-2">
                            <input
                                className="input-field flex-1"
                                placeholder="Ask about this document..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="btn btn-primary px-6 shadow-lg shadow-purple-500/20 flex items-center gap-2"
                                disabled={loading || !input.trim()}
                            >
                                <Send size={18} />
                                <span>Send</span>
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gradient-to-b from-transparent to-white/5 p-10 text-center">
                        <div className="p-6 bg-purple-500/10 rounded-full mb-6 animate-pulse">
                            <FileText size={64} className="text-purple-400" />
                        </div>
                        <h4 className="text-xl font-bold text-white mb-2">Select a Document</h4>
                        <p className="max-w-xs text-sm opacity-60">Pick a file from the list to start a conversation or delete unwanted items.</p>

                        <div className="mt-12 p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl flex items-center gap-4 max-w-md">
                            <AlertTriangle className="text-orange-400 shrink-0" />
                            <p className="text-xs text-left text-orange-200/70 italic">
                                Note: If you don't see the delete button next to your files, please refresh the page (Ctrl+F5) to clear the browser cache.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
