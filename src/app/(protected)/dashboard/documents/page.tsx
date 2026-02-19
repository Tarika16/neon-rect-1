"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, FileText, MessageSquare, Send, Loader2, Trash2, Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Document {
    id: string;
    title: string;
    createdAt: string;
}

interface ChatMessage {
    role: "user" | "ai";
    content: string;
    sources?: any[];
}

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
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
            const res = await fetch("/api/documents?t=" + Date.now());
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
            setMessages([{ role: "ai", content: `I've processed **${newDoc.title}**. Ask me anything about it!` }]);
        } catch (error: any) {
            alert(`Upload Error: ${error.message}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this document?")) return;

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
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !selectedDoc) return;

        const userMessage = input;
        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
        setLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId: selectedDoc.id, question: userMessage }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `Server Error: ${res.status}`);
            }

            if (!res.body) throw new Error("No response from server.");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = "";

            // Add empty AI message for streaming
            setMessages(prev => [...prev, { role: "ai", content: "" }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                accumulatedContent += text;

                // Strip sources metadata from display
                let displayContent = accumulatedContent;
                if (displayContent.includes("__SOURCES_METADATA__")) {
                    displayContent = displayContent.split("__SOURCES_METADATA__")[0].trim();
                }
                // Strip suggested questions from display
                if (displayContent.includes("SUGGESTED_QUESTIONS:")) {
                    displayContent = displayContent.split("SUGGESTED_QUESTIONS:")[0].trim();
                }

                setMessages(prev => {
                    const newMsgs = [...prev];
                    const lastMsg = newMsgs[newMsgs.length - 1];
                    if (lastMsg && lastMsg.role === "ai") {
                        // Parse sources if available
                        let sources: any[] = [];
                        if (accumulatedContent.includes("__SOURCES_METADATA__")) {
                            try {
                                const metaPart = accumulatedContent.split("__SOURCES_METADATA__")[1].trim();
                                sources = JSON.parse(metaPart);
                            } catch { }
                        }
                        return [...newMsgs.slice(0, -1), { ...lastMsg, content: displayContent, sources }];
                    }
                    return newMsgs;
                });
            }

        } catch (error: any) {
            console.error("Chat Error:", error);
            setMessages((prev) => [
                ...prev,
                { role: "ai", content: `Sorry, an error occurred: ${error.message}` }
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)]">
            <div className="flex flex-1 gap-6 overflow-hidden mt-4">
                {/* Sidebar Documents List */}
                <div className="w-1/3 glass-card flex flex-col p-4">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <FileText className="text-purple-400" size={20} /> Documents
                        </h2>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-semibold shadow-lg transition-all text-sm"
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

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {documents.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="p-4 bg-purple-500/10 rounded-full mb-4">
                                    <FileText size={32} className="text-purple-400/60" />
                                </div>
                                <p className="text-gray-400 text-sm">No documents yet</p>
                                <p className="text-gray-500 text-xs mt-1">Upload a PDF, TXT, DOCX, or CSV file</p>
                            </div>
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
                                className={`p-3 rounded-xl cursor-pointer transition-all border group ${selectedDoc?.id === doc.id
                                    ? "bg-purple-500/15 border-purple-500/50 shadow-md shadow-purple-500/10"
                                    : "bg-white/5 border-white/5 hover:border-white/15 hover:bg-white/8"
                                    }`}
                            >
                                <div className="flex justify-between items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-white truncate text-sm">{doc.title}</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            {formatDate(doc.createdAt)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteDocument(doc.id, e)}
                                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        title="Delete document"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chat Interface */}
                <div className="flex-1 glass-card flex flex-col p-0 overflow-hidden">
                    {selectedDoc ? (
                        <>
                            <div className="px-5 py-3 border-b border-white/10 bg-white/5 flex justify-between items-center">
                                <h3 className="font-semibold text-base flex items-center gap-2">
                                    <MessageSquare className="text-green-400" size={18} />
                                    <span className="text-white truncate max-w-[300px]">{selectedDoc.title}</span>
                                </h3>
                                <button
                                    onClick={(e) => handleDeleteDocument(selectedDoc.id, e as any)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                >
                                    <Trash2 size={14} />
                                    Delete
                                </button>
                            </div>

                            <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${m.role === "user"
                                            ? "bg-gradient-to-br from-purple-500 to-indigo-600"
                                            : "bg-gradient-to-br from-emerald-500 to-teal-600"
                                            }`}>
                                            {m.role === "user" ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
                                        </div>
                                        <div className={`max-w-[85%] ${m.role === "user" ? "items-end" : "items-start"}`}>
                                            <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${m.role === "user"
                                                ? "bg-gradient-to-br from-purple-600 to-indigo-700 text-white rounded-tr-none"
                                                : "bg-white/5 text-gray-200 border border-white/10 rounded-tl-none"
                                                }`}>
                                                {m.content ? (
                                                    <div className="prose prose-invert prose-sm max-w-none">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                            {m.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                ) : (
                                                    loading && i === messages.length - 1 && (
                                                        <div className="flex items-center gap-2 text-purple-400">
                                                            <Loader2 className="animate-spin" size={14} />
                                                            <span className="text-xs">Thinking...</span>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                            {/* Sources */}
                                            {m.sources && m.sources.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {m.sources.map((s: any, idx: number) => (
                                                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300">
                                                            [{s.id}] {s.title?.slice(0, 30)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {loading && messages.length > 0 && messages[messages.length - 1].content && (
                                    <div className="flex gap-3">
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600">
                                            <Bot size={14} className="text-white" />
                                        </div>
                                        <div className="bg-white/5 px-4 py-3 rounded-2xl rounded-tl-none border border-white/10 flex items-center gap-2">
                                            <div className="flex gap-1">
                                                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce"></span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={endRef} />
                            </div>

                            <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 bg-white/5 flex gap-2">
                                <input
                                    className="input-field flex-1 py-3"
                                    placeholder="Ask a question about this document..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    disabled={loading}
                                />
                                <button
                                    type="submit"
                                    className="btn btn-primary px-5 flex items-center gap-2"
                                    disabled={loading || !input.trim()}
                                >
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-10 text-center">
                            <div className="p-6 bg-purple-500/10 rounded-full border border-purple-500/20 mb-6">
                                <MessageSquare size={48} className="text-purple-400/60" />
                            </div>
                            <h4 className="text-xl font-bold text-white mb-2">Document Chat</h4>
                            <p className="max-w-sm text-sm opacity-70">
                                Select a document from the left panel to start asking questions, or upload a new file.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
