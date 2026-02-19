"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, FileText, MessageSquare, Send, Loader2, Trash2 } from "lucide-react";
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
    }, [messages]);

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

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !selectedDoc) return;

        const userMessage = input;
        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

        // Add placeholder for AI response
        const aiMessageId = Date.now().toString();
        setMessages((prev) => [...prev, { role: "ai", content: "" }]);
        setLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId: selectedDoc.id, question: userMessage }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed context processing");
            }

            if (!res.body) return;

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
                        if (lastMsg.role === "ai") {
                            lastMsg.content = accumulatedContent;
                        }
                        return newMsgs;
                    });
                }
            } catch (streamError: any) {
                console.error("Stream error:", streamError);
                throw new Error(`Connection lost: ${streamError.message}`);
            }

        } catch (error: any) {
            console.error("Chat Error:", error);
            setMessages((prev) => {
                const newMsgs = [...prev];
                const lastMsg = newMsgs[newMsgs.length - 1];
                if (lastMsg.role === "ai") {
                    lastMsg.content = `⚠️ Error: ${error.message || "Could not generate answer."}`;
                }
                return newMsgs;
            });
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
                        <FileText className="text-purple-400" /> Documents
                    </h2>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-primary btn-sm flex items-center gap-2"
                        disabled={uploading}
                    >
                        {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                        Upload
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".pdf,.txt"
                        onChange={handleUpload}
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
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
                            className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedDoc?.id === doc.id
                                ? "bg-purple-500/20 border-purple-500/50"
                                : "bg-white/5 border-white/10 hover:bg-white/10"
                                }`}
                        >
                            <p className="font-medium text-white truncate">{doc.title}</p>
                            <p className="text-xs text-gray-400 mt-1">{new Date(doc.createdAt).toLocaleDateString()}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Area: Chat */}
            <div className="flex-1 glass-card flex flex-col p-0 overflow-hidden relative">
                {selectedDoc ? (
                    <>
                        <div className="p-4 border-b border-white/10 bg-white/5">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <MessageSquare className="text-green-400" />
                                Chatting with: <span className="text-purple-300">{selectedDoc.title}</span>
                            </h3>
                        </div>

                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${m.role === "user"
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
                                placeholder="Ask a question about this document..."
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
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <FileText size={48} className="mb-4 opacity-50" />
                        <p>Select a document to verify content or ask questions.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
