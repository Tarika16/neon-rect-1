"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Globe, Send, Loader2, Bot, User, Sparkles, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Source {
    id: number;
    type: "document" | "web";
    title: string;
    url?: string;
    content?: string;
}

interface Message {
    role: "user" | "ai";
    content: string;
    sources?: Source[];
    suggestions?: string[];
}

function stripMetadata(text: string): { cleanText: string; sources: Source[]; suggestions: string[] } {
    let cleanText = text;
    let sources: Source[] = [];
    let suggestions: string[] = [];

    // Strip new format: <<<SOURCES_JSON>>>...<<<END_SOURCES>>>
    const newMatch = cleanText.match(/<<<SOURCES_JSON>>>([\s\S]*?)<<<END_SOURCES>>>/);
    if (newMatch) {
        try { sources = JSON.parse(newMatch[1]); } catch { }
        cleanText = cleanText.replace(/<<<SOURCES_JSON>>>[\s\S]*?<<<END_SOURCES>>>/, "").trim();
    }

    // Strip old format: __SOURCES_METADATA__...
    if (cleanText.includes("__SOURCES_METADATA__")) {
        const parts = cleanText.split("__SOURCES_METADATA__");
        cleanText = parts[0].trim();
        if (!sources.length && parts[1]) {
            try { sources = JSON.parse(parts[1].trim()); } catch { }
        }
    }

    // Also strip any raw SOURCES_METADATA without underscores (seen in production)
    if (cleanText.includes("SOURCES_METADATA")) {
        cleanText = cleanText.split("SOURCES_METADATA")[0].trim();
    }

    // Strip suggested questions
    if (cleanText.includes("SUGGESTED_QUESTIONS:")) {
        const parts = cleanText.split("SUGGESTED_QUESTIONS:");
        cleanText = parts[0].trim();
        if (parts[1]) {
            suggestions = parts[1]
                .split("\n")
                .map(s => s.replace(/^\d+\.\s*/, "").replace(/^-\s*/, "").trim())
                .filter(s => s.length > 5);
        }
    }

    return { cleanText, sources, suggestions };
}

export default function DeepSearchPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [searchPhase, setSearchPhase] = useState("");
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
        setSearchPhase("Searching documents & web...");

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: userMessage,
                    includeWebSearch: true,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Search failed. Please try again.");
            }

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = "";

            if (!reader) throw new Error("No response body");

            // Add empty AI message for streaming
            setMessages(prev => [...prev, { role: "ai", content: "" }]);
            setSearchPhase("Generating answer...");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                accumulatedContent += text;

                // Clean the content for display
                const { cleanText, sources, suggestions } = stripMetadata(accumulatedContent);

                setMessages(prev => {
                    const newMsgs = [...prev];
                    const lastMsg = newMsgs[newMsgs.length - 1];
                    if (lastMsg && lastMsg.role === "ai") {
                        return [...newMsgs.slice(0, -1), { ...lastMsg, content: cleanText, sources, suggestions }];
                    }
                    return newMsgs;
                });

                if (cleanText.length > 20) setSearchPhase("");
            }

        } catch (error: any) {
            console.error("Deep Search Error:", error);
            setMessages(prev => [...prev, { role: "ai", content: `Sorry, something went wrong: ${error.message}` }]);
        } finally {
            setLoading(false);
            setSearchPhase("");
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)]">
            <div className="page-header flex justify-between items-center">
                <div>
                    <h1 className="flex items-center gap-3">
                        <Sparkles className="text-yellow-400" />
                        Deep Search
                    </h1>
                    <p className="text-gray-400 text-sm">AI-powered research across your documents and the web</p>
                </div>
            </div>

            <div className="flex-1 glass-card mt-4 flex flex-col overflow-hidden relative">
                {/* Search Phase Indicator */}
                {searchPhase && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-purple-600/90 backdrop-blur-sm text-white px-5 py-2 rounded-full shadow-lg flex items-center gap-2 border border-purple-400/30">
                        <Loader2 className="animate-spin" size={14} />
                        <span className="font-medium text-xs">{searchPhase}</span>
                    </div>
                )}

                <div className="flex-1 p-5 overflow-y-auto space-y-5 custom-scrollbar">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-5 opacity-70">
                            <div className="p-6 bg-purple-500/10 rounded-full border border-purple-500/20">
                                <Globe size={56} className="text-purple-400" />
                            </div>
                            <div className="max-w-md">
                                <h3 className="text-xl font-bold text-white mb-2">Deep Search</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    Ask any question — I&apos;ll search your uploaded documents and the web for answers.
                                </p>
                            </div>
                            <div className="flex gap-3 text-xs">
                                <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                                    <span className="text-purple-400">📂</span> Documents
                                </div>
                                <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                                    <span className="text-blue-400">🌐</span> Live Web
                                </div>
                                <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                                    <span className="text-green-400">🤖</span> AI Analysis
                                </div>
                            </div>
                        </div>
                    ) : (
                        messages.map((m, i) => (
                            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === "user"
                                    ? "bg-gradient-to-br from-purple-500 to-indigo-600"
                                    : "bg-gradient-to-br from-emerald-500 to-teal-600"
                                    }`}>
                                    {m.role === "user" ? <User size={15} className="text-white" /> : <Bot size={15} className="text-white" />}
                                </div>
                                <div className="max-w-[85%]">
                                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${m.role === "user"
                                        ? "bg-gradient-to-br from-purple-600 to-indigo-700 text-white rounded-tr-none"
                                        : "bg-white/5 text-gray-200 border border-white/10 rounded-tl-none backdrop-blur-sm"
                                        }`}>
                                        {m.content ? (
                                            <div className="prose prose-invert prose-sm max-w-none">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {m.content}
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            loading && i === messages.length - 1 && (
                                                <div className="flex items-center gap-2 text-emerald-400">
                                                    <Loader2 className="animate-spin" size={14} />
                                                    <span className="text-xs">Researching...</span>
                                                </div>
                                            )
                                        )}
                                    </div>

                                    {/* Sources */}
                                    {m.sources && m.sources.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {m.sources.map((s, idx) => (
                                                <a
                                                    key={idx}
                                                    href={s.url || "#"}
                                                    target={s.url ? "_blank" : undefined}
                                                    rel="noopener noreferrer"
                                                    className={`text-[10px] px-2 py-1 rounded-md flex items-center gap-1 transition-all ${s.type === "web"
                                                        ? "bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20"
                                                        : "bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20"
                                                        }`}
                                                >
                                                    {s.type === "web" ? <Globe size={10} /> : <span>📄</span>}
                                                    [{s.id}] {s.title?.slice(0, 35)}{s.title && s.title.length > 35 ? "..." : ""}
                                                    {s.url && <ExternalLink size={8} />}
                                                </a>
                                            ))}
                                        </div>
                                    )}

                                    {/* Suggested Questions */}
                                    {m.suggestions && m.suggestions.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {m.suggestions.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setInput(s)}
                                                    className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/20 transition-all text-left max-w-full font-medium"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={endRef} />
                </div>

                <form onSubmit={handleSearch} className="p-4 border-t border-white/10 bg-white/5 flex gap-3">
                    <div className="relative flex-1">
                        <input
                            className="input-field w-full py-3 pl-11 pr-4"
                            placeholder="Ask anything — searches documents and the web..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={loading}
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary px-6 flex items-center gap-2 transition-transform active:scale-95"
                        disabled={loading || !input.trim()}
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                        <span className="font-semibold">Search</span>
                    </button>
                </form>
            </div>
        </div>
    );
}
