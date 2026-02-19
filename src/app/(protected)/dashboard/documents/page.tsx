"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, FileText, MessageSquare, Send, Loader2, Trash2, AlertTriangle, ShieldAlert } from "lucide-react";
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

    // EMERGENCY: Version Detection
    const CURRENT_VERSION = "v2.0.0-FIXED";

    useEffect(() => {
        fetchDocuments();
        console.log("DocumentsPage loaded: ", CURRENT_VERSION);
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const fetchDocuments = async () => {
        try {
            const res = await fetch("/api/documents?t=" + Date.now()); // Cache-buster
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
        if (!window.confirm("🔴 DANGER: Delete this file permanently?")) return;

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
        <div className="flex flex-col h-[calc(100vh-6rem)]">
            {/* FORCE REFRESH BANNER IF OLD */}
            <div className="bg-red-600 text-white text-[10px] font-bold py-1 px-4 flex justify-between items-center uppercase tracking-widest animate-pulse">
                <span>🔴 DELETE FEATURE ACTIVE - VERSION 2.0.0</span>
                <span>IF YOU DO NOT SEE RED BUTTONS, PRESS CTRL+F5</span>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden mt-4">
                {/* Sidebar Documents List */}
                <div className="w-1/3 glass-card flex flex-col p-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex flex-col">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <FileText className="text-purple-400" /> Documents
                            </h2>
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg transition-all"
                            disabled={uploading}
                        >
                            {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                            Upload New File
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
                                        setMessages([{ role: "ai", content: `I'm ready to answer about **${doc.title}**.` }]);
                                    }
                                }}
                                className={`p-4 rounded-2xl cursor-pointer transition-all border-2 relative flex flex-col gap-2 ${selectedDoc?.id === doc.id
                                    ? "bg-purple-500/10 border-purple-500 shadow-lg"
                                    : "bg-white/5 border-white/5 hover:border-white/20"
                                    }`}
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-white truncate text-lg">{doc.title}</p>
                                        <p className="text-[12px] text-purple-400 font-bold mt-1 uppercase">
                                            Added: {formatDate(doc.createdAt)}
                                        </p>
                                    </div>

                                    {/* MASSIVE RED DELETE BUTTON */}
                                    <button
                                        onClick={(e) => handleDeleteDocument(doc.id, e)}
                                        className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xl flex items-center justify-center border-2 border-red-400/50"
                                        title="DELETE THIS FILE"
                                    >
                                        <Trash2 size={24} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chat Interface */}
                <div className="flex-1 glass-card flex flex-col p-0 overflow-hidden relative">
                    {selectedDoc ? (
                        <>
                            <div className="p-4 border-b-2 border-white/10 bg-white/5 flex justify-between items-center">
                                <h3 className="font-black text-xl flex items-center gap-2">
                                    <MessageSquare className="text-green-400" />
                                    <span className="text-purple-300 truncate max-w-[300px]">{selectedDoc.title}</span>
                                </h3>

                                <button
                                    onClick={(e) => handleDeleteDocument(selectedDoc.id, e as any)}
                                    className="flex items-center gap-2 px-6 py-2.5 text-base font-black text-white bg-red-600 hover:bg-red-700 border-4 border-red-500/30 rounded-2xl shadow-2xl transition-all"
                                >
                                    <Trash2 size={20} />
                                    DANGER: DELETE FILE
                                </button>
                            </div>

                            <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar bg-black/20">
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                        <div className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed ${m.role === "user"
                                            ? "bg-purple-600 text-white rounded-tr-none shadow-xl"
                                            : "bg-gray-800 text-white border-2 border-white/10 rounded-tl-none"
                                            }`}>
                                            {m.content || (loading && i === messages.length - 1 ? <Loader2 className="animate-spin text-purple-400" size={16} /> : "")}
                                        </div>
                                    </div>
                                ))}
                                <div ref={endRef} />
                            </div>

                            <form onSubmit={handleSendMessage} className="p-4 border-t-2 border-white/10 bg-white/5 flex gap-2">
                                <input
                                    className="input-field flex-1 text-lg py-4"
                                    placeholder="Type your question..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    disabled={loading}
                                />
                                <button
                                    type="submit"
                                    className="btn btn-primary px-10 shadow-xl flex items-center gap-2"
                                    disabled={loading || !input.trim()}
                                >
                                    <Send size={24} />
                                    <span className="font-black">SEND</span>
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-10 text-center">
                            <ShieldAlert size={80} className="text-red-500 mb-6 animate-bounce" />
                            <h4 className="text-3xl font-black text-white mb-4 uppercase">System Control Center</h4>
                            <p className="max-w-md text-lg opacity-80 mb-10">Select a document from the left to start chat or perform administrative actions (Delete).</p>

                            <div className="flex gap-4">
                                <div className="p-4 bg-red-500/10 border-2 border-red-500/30 rounded-3xl text-left">
                                    <p className="text-red-400 font-black mb-1">🔴 DELETE IS READY</p>
                                    <p className="text-xs opacity-60">High-power trash buttons are now active in the sidebar.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
