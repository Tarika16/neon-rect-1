"use client";

import { useState, useRef } from "react";
import {
    Youtube, Send, Loader2, FileText, BookOpen, ScrollText,
    Copy, Download, Check, Upload, ImageIcon, AlertCircle, X,
    Type, Link as LinkIcon
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Tab = "summary" | "notes" | "transcript";
type InputMode = "youtube" | "manual";

interface Result {
    title: string;
    videoId: string | null;
    source: "youtube" | "screenshot" | "manual";
    summary: string;
    studyNotes: string;
    transcript: string;
}

export default function YouTubeAIPage() {
    const [inputMode, setInputMode] = useState<InputMode>("youtube");
    const [url, setUrl] = useState("");
    const [manualTranscript, setManualTranscript] = useState("");
    const [manualTitle, setManualTitle] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<Result | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("summary");
    const [copied, setCopied] = useState(false);
    const [showScreenshotUpload, setShowScreenshotUpload] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleAnalyze = async (e: React.FormEvent) => {
        e.preventDefault();

        if (inputMode === "youtube" && !url.trim()) return;
        if (inputMode === "manual" && !manualTranscript.trim()) return;
        if (loading) return;

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const payload = inputMode === "youtube"
                ? { url }
                : { manualTranscript, title: manualTitle };

            const res = await fetch("/api/youtube", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.canFallback) {
                    setError(data.error);
                    setShowScreenshotUpload(true);
                } else {
                    setError(data.error || "Failed to process input");
                }
                return;
            }

            setResult(data);
            setActiveTab("summary");
            setShowScreenshotUpload(false);
        } catch (err: any) {
            setError(err.message || "Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleScreenshotUpload = async (file: File) => {
        if (file.size > 4 * 1024 * 1024) {
            setError("File exceeds 4MB limit for screenshots. Please use a smaller image.");
            return;
        }

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const formData = new FormData();
            formData.append("screenshot", file);

            const res = await fetch("/api/youtube", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to analyze screenshot");
                return;
            }

            setResult(data);
            setActiveTab("summary");
            setShowScreenshotUpload(false);
        } catch (err: any) {
            setError(err.message || "Upload failed");
        } finally {
            setLoading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
            handleScreenshotUpload(file);
        } else {
            setError("Please drop an image file (PNG, JPG, etc.)");
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleScreenshotUpload(file);
    };

    const getTabContent = () => {
        if (!result) return "";
        switch (activeTab) {
            case "summary": return result.summary;
            case "notes": return result.studyNotes;
            case "transcript": return result.transcript;
        }
    };

    const handleCopy = async () => {
        const content = getTabContent();
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const content = getTabContent();
        const labels = { summary: "Summary", notes: "Study-Notes", transcript: "Transcript" };
        const blob = new Blob([content], { type: "text/markdown" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${result?.title || "youtube"}-${labels[activeTab]}.md`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "summary", label: "Summary", icon: <FileText size={15} /> },
        { id: "notes", label: "Study Notes", icon: <BookOpen size={15} /> },
        { id: "transcript", label: "Transcript", icon: <ScrollText size={15} /> },
    ];

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] gap-5">
            {/* Header */}
            <div className="page-header">
                <h1 className="flex items-center gap-3">
                    <Youtube className="text-red-500" />
                    YouTube AI
                </h1>
                <p className="text-gray-400 text-sm">Analyze YouTube videos or paste transcripts to generate study materials</p>
            </div>

            {/* Input Options Card */}
            <div className="glass-card overflow-hidden">
                {/* Mode Selector */}
                <div className="flex border-b border-white/10 bg-white/[0.02]">
                    <button
                        onClick={() => { setInputMode("youtube"); setError(""); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${inputMode === "youtube"
                            ? "text-red-400 bg-red-500/5 border-b-2 border-red-500"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                            }`}
                    >
                        <LinkIcon size={16} />
                        YouTube URL
                    </button>
                    <button
                        onClick={() => { setInputMode("manual"); setError(""); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${inputMode === "manual"
                            ? "text-purple-400 bg-purple-500/5 border-b-2 border-purple-500"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                            }`}
                    >
                        <Type size={16} />
                        Paste Transcript
                    </button>
                    <button
                        onClick={() => setShowScreenshotUpload(!showScreenshotUpload)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${showScreenshotUpload
                            ? "text-amber-400 bg-amber-500/5 border-b-2 border-amber-500"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                            }`}
                    >
                        <ImageIcon size={16} />
                        Screenshot
                    </button>
                </div>

                <div className="p-5">
                    {/* YouTube URL Mode */}
                    {inputMode === "youtube" && !showScreenshotUpload && (
                        <form onSubmit={handleAnalyze} className="flex gap-3">
                            <div className="relative flex-1">
                                <input
                                    className="input-field w-full py-3 pl-12 pr-4 text-base"
                                    placeholder="Paste YouTube URL here... (e.g. https://youtube.com/watch?v=...)"
                                    value={url}
                                    onChange={(e) => { setUrl(e.target.value); setError(""); }}
                                    disabled={loading}
                                />
                                <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 text-red-400/60" size={20} />
                            </div>
                            <button
                                type="submit"
                                className="btn btn-primary px-7 flex items-center gap-2 text-base font-semibold transition-transform active:scale-95"
                                disabled={loading || !url.trim()}
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                                Analyze
                            </button>
                        </form>
                    )}

                    {/* Manual Transcript Mode */}
                    {inputMode === "manual" && !showScreenshotUpload && (
                        <form onSubmit={handleAnalyze} className="space-y-4">
                            <div className="flex gap-3">
                                <input
                                    className="input-field flex-1 py-3 px-4"
                                    placeholder="Topic/Title (optional)"
                                    value={manualTitle}
                                    onChange={(e) => setManualTitle(e.target.value)}
                                    disabled={loading}
                                />
                                <button
                                    type="submit"
                                    className="btn btn-primary px-7 flex items-center gap-2 font-semibold transition-transform active:scale-95 whitespace-nowrap"
                                    disabled={loading || !manualTranscript.trim()}
                                >
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : <BookOpen size={18} />}
                                    Generate Notes
                                </button>
                            </div>
                            <textarea
                                className="input-field w-full h-32 p-4 resize-none"
                                placeholder="Paste the transcript or text content here..."
                                value={manualTranscript}
                                onChange={(e) => { setManualTranscript(e.target.value); setError(""); }}
                                disabled={loading}
                            />
                        </form>
                    )}

                    {/* Screenshot Upload Fallback */}
                    {showScreenshotUpload && (
                        <div className="animate-fade-in">
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => fileRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${dragOver
                                    ? "border-amber-500 bg-amber-500/10"
                                    : "border-white/10 hover:border-white/20 hover:bg-white/5"
                                    }`}
                            >
                                <ImageIcon size={32} className="mx-auto mb-3 text-gray-500" />
                                <p className="text-gray-400 text-sm">
                                    Drag &amp; drop a screenshot of educational content here, or <span className="text-amber-400 font-semibold">click to browse</span>
                                </p>
                                <p className="text-gray-500 text-xs mt-1">PNG, JPG, WebP — up to 4MB</p>
                            </div>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-red-400 text-sm">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="glass-card flex-1 flex flex-col items-center justify-center gap-4">
                    <div className="relative">
                        <div className={`w-16 h-16 rounded-full border-4 border-t-transparent animate-spin ${inputMode === "youtube" ? "border-red-500" : "border-purple-500"
                            }`} />
                        {inputMode === "youtube" ? (
                            <Youtube className="absolute inset-0 m-auto text-red-400" size={24} />
                        ) : (
                            <Type className="absolute inset-0 m-auto text-purple-400" size={24} />
                        )}
                    </div>
                    <div className="text-center">
                        <p className="text-white font-semibold text-lg">Processing Content...</p>
                        <p className="text-gray-400 text-sm mt-1">
                            {inputMode === "youtube" ? "Extracting transcript and generating notes" : "Analyzing text and generating study material"}
                        </p>
                    </div>
                </div>
            )}

            {/* Results */}
            {result && !loading && (
                <div className="glass-card flex-1 flex flex-col overflow-hidden animate-slide-up">
                    {/* Header Details */}
                    <div className="p-4 border-b border-white/10 bg-white/5">
                        <div className="flex items-start gap-4">
                            {result.videoId && (
                                <div className="w-40 h-24 rounded-lg overflow-hidden shrink-0 bg-black/50 shadow-lg">
                                    <img
                                        src={`https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`}
                                        alt={result.title}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <h2 className="text-lg font-bold text-white truncate">{result.title}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${result.source === "youtube"
                                        ? "bg-red-500/15 text-red-400 border-red-500/20"
                                        : result.source === "manual"
                                            ? "bg-purple-500/15 text-purple-400 border-purple-500/20"
                                            : "bg-amber-500/15 text-amber-400 border-amber-500/20"
                                        }`}>
                                        {result.source === "youtube" ? "YouTube Video" : result.source === "manual" ? "Pasted Text" : "Screenshot Analysis"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-white/10 bg-white/[0.02]">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 ${activeTab === tab.id
                                    ? "text-purple-400 border-purple-500 bg-purple-500/5"
                                    : "text-gray-400 border-transparent hover:text-white hover:bg-white/5"
                                    }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}

                        <div className="ml-auto flex items-center gap-2 pr-3">
                            <button
                                onClick={handleCopy}
                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
                                title="Copy to clipboard"
                            >
                                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                            </button>
                            <button
                                onClick={handleDownload}
                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
                                title="Download as Markdown"
                            >
                                <Download size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                        <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {getTabContent()}
                            </ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!result && !loading && (
                <div className="glass-card flex-1 flex flex-col items-center justify-center text-center opacity-60">
                    <div className="p-6 bg-red-500/10 rounded-full border border-red-500/20 mb-5">
                        <Youtube size={56} className="text-red-400/70" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Transform Content into Knowledge</h3>
                    <p className="text-gray-400 text-sm max-w-md">
                        The AI will analyze your content, generate a summary, and create structured study notes for you.
                    </p>
                    <div className="flex gap-3 mt-5 text-xs">
                        <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                            <span>📝</span> Summary
                        </div>
                        <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                            <span>📚</span> Study Notes
                        </div>
                        <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                            <span>🎯</span> Transcript
                        </div>
                        <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                            <span>📸</span> Screenshot Fallback
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
