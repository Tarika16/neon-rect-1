"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, FileText, MessageSquare, Send, Loader2, Globe, CheckCircle, Trash2, User, Bot, Paperclip } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

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

    // Document Reader State
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
    const [isFetchingDoc, setIsFetchingDoc] = useState(false);

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

    const handleSelectDoc = async (docId: string) => {
        if (selectedDocId === docId) {
            setSelectedDocId(null);
            setSelectedDoc(null);
            return;
        }

        setSelectedDocId(docId);
        setIsFetchingDoc(true);
        try {
            const res = await fetch(`/api/documents?id=${docId}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedDoc(data);
            }
        } catch (e) {
            console.error("Failed to fetch doc content", e);
        } finally {
            setIsFetchingDoc(false);
        }
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

                <div className="flex-1 overflow-y-auto space-y-2 pr-2 mb-12 custom-scrollbar">
                    {documents.length === 0 && (
                        <p className="text-gray-400 text-center mt-10 text-sm">No documents in this workspace.</p>
                    )}
                    {documents.map((doc) => (
                        <div
                            key={doc.id}
                            onClick={() => handleSelectDoc(doc.id)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-2 group ${selectedDocId === doc.id
                                    ? "bg-purple-500/10 border-purple-500"
                                    : "bg-white/5 border-white/10 hover:border-white/20"
                                }`}
                        >
                            <FileText size={16} className={selectedDocId === doc.id ? "text-purple-400" : "text-gray-400"} />
                            <div className="flex-1 truncate">
                                <p className={`font-medium truncate text-sm ${selectedDocId === doc.id ? "text-white" : "text-gray-300 group-hover:text-white"}`}>
                                    {doc.title}
                                </p>
                            </div>
                            {selectedDocId === doc.id ? (
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                            ) : (
                                <CheckCircle size={14} className="text-green-500/30 group-hover:text-green-500/50" />
                            )}
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

            {/* Main Content Area: Split View if selectedDoc, else Chat only */}
            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Document Reader Pane */}
                {selectedDocId && (
                    <div className="flex-1 glass-card flex flex-col p-0 overflow-hidden animate-slide-up">
                        <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                            <h3 className="font-bold text-lg flex items-center gap-2 truncate">
                                <FileText className="text-blue-400" />
                                {selectedDoc?.title || "Loading..."}
                            </h3>
                            <button
                                onClick={() => setSelectedDocId(null)}
                                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5 border border-transparent hover:border-white/10"
                            >
                                Close
                            </button>
                        </div>
                        <div className="flex-1 p-6 overflow-y-auto bg-white/[0.02] custom-scrollbar">
                            {isFetchingDoc ? (
                                <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
                                    <Loader2 className="animate-spin" size={32} />
                                    <p className="text-sm font-medium">Extracting source text...</p>
                                </div>
                            ) : selectedDoc ? (
                                <div className="max-w-2xl mx-auto bg-[#fafafa10] p-8 rounded shadow-2xl border border-white/5 min-h-full">
                                    <div className="prose prose-invert prose-sm max-w-none">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {selectedDoc.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-gray-500 py-10">Failed to load document.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Workspace Chat Area */}
                <div className={`flex flex-col glass-card p-0 overflow-hidden relative transition-all duration-300 ${selectedDocId ? "w-1/2" : "flex-1"}`}>
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

                    <div className="flex-1 p-4 overflow-y-auto space-y-6 scroll-smooth custom-scrollbar">
                        {messages.map((m) => (
                            <div key={m.id} className={`flex gap-3 animate-slide-up ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                                {/* Avatar */}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg ${m.role === "user"
                                    ? "bg-gradient-to-br from-purple-500 to-indigo-600"
                                    : "bg-gradient-to-br from-emerald-500 to-teal-600"
                                    }`}>
                                    {m.role === "user" ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                                </div>

                                {/* Bubble */}
                                <div className={`max-w-[85%] group relative ${m.role === "user" ? "items-end" : "items-start"}`}>
                                    <div className={`px-4 py-3 rounded-2xl shadow-sm border transition-all hover:shadow-md ${m.role === "user"
                                        ? "bg-gradient-to-br from-purple-600 to-indigo-700 text-white rounded-tr-none border-purple-500/30"
                                        : "bg-white/5 text-gray-200 border-white/10 rounded-tl-none backdrop-blur-sm"
                                        }`}>
                                        <div className="prose prose-invert prose-sm max-w-none">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    code({ node, inline, className, children, ...props }: any) {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        return !inline && match ? (
                                                            <SyntaxHighlighter
                                                                style={atomDark}
                                                                language={match[1]}
                                                                PreTag="div"
                                                                className="rounded-lg !bg-black/50 !my-2 border border-white/5"
                                                                {...props}
                                                            >
                                                                {String(children).replace(/\n$/, '')}
                                                            </SyntaxHighlighter>
                                                        ) : (
                                                            <code className="bg-white/10 px-1 rounded text-pink-400" {...props}>
                                                                {children}
                                                            </code>
                                                        );
                                                    },
                                                    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed font-normal">{children}</p>,
                                                    ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                                                    ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                                                }}
                                            >
                                                {m.content}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-gray-500 mt-1 block opacity-0 group-hover:opacity-100 transition-opacity">
                                        {m.role === "user" ? "You" : "AI Assistant"}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-3 animate-fade-in">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600">
                                    <Bot size={16} className="text-white" />
                                </div>
                                <div className="bg-white/5 p-4 rounded-2xl rounded-tl-none border border-white/10 backdrop-blur-sm flex items-center gap-3">
                                    <div className="flex gap-1">
                                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce"></span>
                                    </div>
                                    <span className="text-gray-400 text-xs font-medium italic">
                                        AI is processing... {deepSearch && "(Searching Web)"}
                                    </span>
                                </div>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 bg-white/5 flex gap-2">
                        <input
                            className="input-field flex-1"
                            placeholder={deepSearch ? "Ask (Web Search Enabled)..." : "Ask about your documents..."}
                            value={input}
                            onChange={handleInputChange}
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            className="btn btn-primary shadow-lg shadow-purple-500/20"
                            disabled={isLoading || !input.trim()}
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
