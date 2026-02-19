import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { auth } from "@/lib/auth";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const groq = createOpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY || "",
});

function extractVideoId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const contentType = req.headers.get("content-type") || "";

        // Handle screenshot upload fallback
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("screenshot") as File | null;

            if (!file) {
                return NextResponse.json({ error: "No screenshot file provided" }, { status: 400 });
            }

            // 4MB limit (Vercel serverless limit is ~4.5MB)
            if (file.size > 4 * 1024 * 1024) {
                return NextResponse.json({ error: "File exceeds 4MB limit for screenshots. Please use a smaller image." }, { status: 400 });
            }

            const bytes = await file.arrayBuffer();
            const base64 = Buffer.from(bytes).toString("base64");
            const mimeType = file.type || "image/png";

            // Use Vision LLM to analyze the screenshot
            const { text: analysis } = await generateText({
                model: groq("llama-3.2-90b-vision-preview"),
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `This is a screenshot of a YouTube video or educational content. Please analyze it and provide:

## Summary
A brief summary of what you can see in this screenshot.

## Study Notes
Based on the visible content, create structured study notes with:
- Key topics/concepts visible
- Any text, diagrams, or information shown
- Organized bullet points

## Transcript
Since this is a screenshot, provide a description of all visible text and content as a pseudo-transcript.

Be thorough and helpful. Format everything in clean Markdown.`,
                            },
                            {
                                type: "image",
                                image: `data:${mimeType};base64,${base64}`,
                            },
                        ],
                    },
                ],
            });

            // Parse the sections
            const summaryMatch = analysis.match(/## Summary\n([\s\S]*?)(?=## Study Notes|$)/);
            const notesMatch = analysis.match(/## Study Notes\n([\s\S]*?)(?=## Transcript|$)/);
            const transcriptMatch = analysis.match(/## Transcript\n([\s\S]*?)$/);

            return NextResponse.json({
                title: file.name.replace(/\.[^/.]+$/, "") || "Screenshot Analysis",
                videoId: null,
                source: "screenshot",
                summary: summaryMatch?.[1]?.trim() || analysis,
                studyNotes: notesMatch?.[1]?.trim() || "See summary above for extracted notes.",
                transcript: transcriptMatch?.[1]?.trim() || "Transcript extracted from screenshot — see summary.",
            });
        }

        // Handle manual transcript input
        const body = await req.json().catch(() => ({}));
        const { url, manualTranscript, title: manualTitle } = body;

        if (manualTranscript) {
            const transcript = manualTranscript;
            const title = manualTitle || "Pasted Transcript";

            // Plain text for LLM
            const llmTranscript = transcript.length > 80000
                ? transcript.slice(0, 80000) + "\n\n[Transcript truncated due to length]"
                : transcript;

            // Generate Summary
            const { text: summary } = await generateText({
                model: groq("llama-3.3-70b-versatile"),
                system: "You are an expert at summarizing educational content. Provide clear, concise summaries in Markdown format.",
                prompt: `Summarize this content titled "${title}":\n\n${llmTranscript}\n\nProvide a comprehensive summary covering:\n- Main topic and purpose\n- Key points discussed\n- Important conclusions or takeaways\n\nKeep it clear and well-organized with Markdown formatting.`,
            });

            // Generate Study Notes
            const { text: studyNotes } = await generateText({
                model: groq("llama-3.3-70b-versatile"),
                system: "You are an expert at creating study notes from educational content. Create clean, structured notes optimized for learning and revision.",
                prompt: `Create detailed study notes from this content titled "${title}":\n\n${llmTranscript}\n\nFormat the notes with:\n- Clear headings for each topic/section\n- Bullet points for key facts and concepts\n- Important definitions highlighted in **bold**\n- Any formulas, steps, or processes in numbered lists\n- A "Key Takeaways" section at the end\n\nMake the notes comprehensive enough for exam preparation.`,
            });

            return NextResponse.json({
                title,
                videoId: null,
                source: "manual",
                transcript: transcript, // In manual mode, the transcript is what they pasted
                summary,
                studyNotes,
            });
        }

        // Handle YouTube URL
        if (!url) {
            return NextResponse.json({ error: "Please provide a YouTube URL or a manual transcript" }, { status: 400 });
        }

        const videoId = extractVideoId(url);
        if (!videoId) {
            return NextResponse.json({ error: "Invalid YouTube URL. Please paste a valid YouTube video link." }, { status: 400 });
        }

        // Fetch video title from oembed (free, no API key)
        let videoTitle = "YouTube Video";
        try {
            const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
            if (oembedRes.ok) {
                const oembedData = await oembedRes.json();
                videoTitle = oembedData.title || videoTitle;
            }
        } catch { }

        // Fetch transcript
        let transcriptItems;
        try {
            transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
        } catch (e: any) {
            return NextResponse.json({
                error: "Could not fetch transcript. The video may not have captions enabled, or it may be private/restricted. Try uploading a screenshot instead.",
                canFallback: true,
            }, { status: 422 });
        }

        if (!transcriptItems || transcriptItems.length === 0) {
            return NextResponse.json({
                error: "No transcript available for this video. Try uploading a screenshot instead.",
                canFallback: true,
            }, { status: 422 });
        }

        // Build full transcript text with timestamps
        const fullTranscript = transcriptItems
            .map((item) => {
                const mins = Math.floor(item.offset / 60000);
                const secs = Math.floor((item.offset % 60000) / 1000);
                const timestamp = `${mins}:${secs.toString().padStart(2, "0")}`;
                return `[${timestamp}] ${item.text}`;
            })
            .join("\n");

        // Plain text for LLM (no timestamps, cleaner)
        const plainTranscript = transcriptItems.map((item) => item.text).join(" ");

        // Truncate if too long for LLM context (Groq has ~128k context for 70b)
        const maxChars = 80000;
        const llmTranscript = plainTranscript.length > maxChars
            ? plainTranscript.slice(0, maxChars) + "\n\n[Transcript truncated due to length]"
            : plainTranscript;

        // Generate Summary
        const { text: summary } = await generateText({
            model: groq("llama-3.3-70b-versatile"),
            system: "You are an expert at summarizing educational content. Provide clear, concise summaries in Markdown format.",
            prompt: `Summarize this YouTube video titled "${videoTitle}":\n\n${llmTranscript}\n\nProvide a comprehensive summary covering:\n- Main topic and purpose\n- Key points discussed\n- Important conclusions or takeaways\n\nKeep it clear and well-organized with Markdown formatting.`,
        });

        // Generate Study Notes
        const { text: studyNotes } = await generateText({
            model: groq("llama-3.3-70b-versatile"),
            system: "You are an expert at creating study notes from educational content. Create clean, structured notes optimized for learning and revision.",
            prompt: `Create detailed study notes from this YouTube video titled "${videoTitle}":\n\n${llmTranscript}\n\nFormat the notes with:\n- Clear headings for each topic/section\n- Bullet points for key facts and concepts\n- Important definitions highlighted in **bold**\n- Any formulas, steps, or processes in numbered lists\n- A "Key Takeaways" section at the end\n\nMake the notes comprehensive enough for exam preparation.`,
        });

        return NextResponse.json({
            title: videoTitle,
            videoId,
            source: "youtube",
            transcript: fullTranscript,
            summary,
            studyNotes,
        });

    } catch (error: any) {
        console.error("YouTube AI Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to process video" },
            { status: 500 }
        );
    }
}
