"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Globe, FileText, Send, Loader2, BookOpen, ExternalLink, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
    role: "user" | "ai";
    content: string;
    sources?: any[];
}

export default function DeepSearchPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>("");
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = input;
        setInput("");
        setMessages(prev => [...prev, { role: "user", content: userMessage }]);
        setLoading(true);
        setStatus("🔍 Analyzing query...");

        try {
            // We use a modified version of the chat API that handles global search
            setStatus("📂 Searching internal documents...");

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: userMessage,
                    includeWebSearch: true,
                    // Note: Not passing documentId/workspaceId means global search if we update the API
                    // For now, our API expects one of them. We'll use a workaround or check most recent.
                }),
            });

            if (!res.ok) throw new Error("Search failed. Check API Keys.");

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = "";

            if (!reader) throw new Error("No response body");

            setStatus("🌐 Fetching web data (Deep Search)...");

            // Initial AI message placeholder
            setMessages(prev => [...prev, { role: "ai", content: "" }]);

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

                // Once we start getting text, we clear the status
                if (accumulatedContent.length > 10) setStatus("");
            }

        } catch (error: any) {
            console.error(error);
            setMessages(prev => [...prev, { role: "ai", content: `❌ Error: ${error.message}` }]);
        } finally {
            setLoading(false);
            setStatus("");
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)]">
            <div className="page-header flex justify-between items-center">
                <div>
                    <h1 className="flex items-center gap-3">
                        <Sparkles className="text-yellow-400 animate-pulse" />
                        Deep Search
                    </h1>
                    <p className="text-gray-400">Combined AI research across documents and the entire web.</p>
                </div>
            </div>

            <div className="flex-1 glass-card mt-6 flex flex-col overflow-hidden relative">
                {/* Status Overlay */}
                {status && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-purple-600/90 text-white px-6 py-2 rounded-full shadow-2xl flex items-center gap-3 animate-bounce border border-purple-400">
                        <Loader2 className="animate-spin" size={18} />
                        <span className="font-bold text-sm uppercase tracking-tighter">{status}</span>
                    </div>
                )}

                <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar bg-black/40">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-60">
                            <div className="p-8 bg-purple-500/10 rounded-full border-2 border-purple-500/20">
                                <Globe size={80} className="text-purple-400" />
                            </div>
                            <div className="max-w-md">
                                <h3 className="text-2xl font-black text-white mb-2">Ready for Deep Research?</h3>
                                <p className="text-gray-400">Ask any complex question. I'll search your uploaded documents and crawl the web for the latest information using Firecrawl.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-xs font-bold uppercase">
                                <div className="p-3 bg-white/5 rounded-xl border border-white/10">📂 Doc Knowledge</div>
                                <div className="p-3 bg-white/5 rounded-xl border border-white/10">🌐 Real-time Web</div>
                            </div>
                        </div>
                    ) : (
                        messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[90%] p-6 rounded-3xl text-sm leading-relaxed shadow-2xl ${m.role === "user"
                                    ? "bg-purple-600 text-white rounded-tr-none"
                                    : "bg-gray-800/80 text-white border-2 border-white/10 rounded-tl-none backdrop-blur-md"
                                    }`}>
                                    <div className="prose prose-invert max-w-none">
                                        <ReactMarkdown>
                                            {m.content}
                                        </ReactMarkdown>
                                    </div>

                                    {loading && i === messages.length - 1 && m.role === "ai" && !m.content && (
                                        <div className="flex items-center gap-3 text-purple-400">
                                            <Loader2 className="animate-spin" size={20} />
                                            <span className="font-bold animate-pulse">Consulting all sources...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={endRef} />
                </div>

                <form onSubmit={handleSearch} className="p-6 border-t-2 border-white/10 bg-white/5 flex gap-4">
                    <div className="relative flex-1">
                        <input
                            className="input-field w-full text-lg py-5 pl-14 pr-6 focus:ring-4 ring-purple-500/20 transition-all"
                            placeholder="What would you like to research today?"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={loading}
                        />
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-purple-400" size={24} />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary px-12 shadow-2xl flex items-center gap-3 transition-transform active:scale-95"
                        disabled={loading || !input.trim()}
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Send size={24} />}
                        <span className="font-black text-xl">SEARCH</span>
                    </button>
                </form>
            </div>
        </div>
    );
}
