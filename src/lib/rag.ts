

// Singleton to hold the embedding pipeline
let extractor: any = null;

// Function to get the pipeline
// Function to get the pipeline
async function getPipeline() {
    if (extractor) return extractor;

    try {
        console.log("RAG: Initializing Xenova pipeline...");
        const { pipeline, env } = await import("@xenova/transformers");

        // Vercel friendly configuration
        env.allowLocalModels = false;
        env.useBrowserCache = false;

        // Use a persistent cache if possible, but for Vercel /tmp is best
        env.cacheDir = "/tmp";

        // Performance optimizations
        // @ts-ignore
        env.backends.onnx.wasm.numThreads = 1;
        // @ts-ignore
        env.backends.onnx.wasm.proxy = false;

        extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
        console.log("RAG: Xenova pipeline initialized successfully.");
        return extractor;
    } catch (e: any) {
        console.error("RAG: Xenova model failed to load:", e.message);
        throw e;
    }
}

export async function generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
        try {
            const isOpenRouter = apiKey.startsWith("sk-or-");
            const baseUrl = isOpenRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";
            const model = isOpenRouter ? "openai/text-embedding-3-small" : "text-embedding-3-small";

            const response = await fetch(`${baseUrl}/embeddings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                    ...(isOpenRouter && { "HTTP-Referer": "https://neon-admin-dashboard.vercel.app", "X-Title": "NeonBoard" })
                },
                body: JSON.stringify({
                    input: text.slice(0, 8000),
                    model: model,
                    dimensions: 384 // <--- ESSENTIAL FOR DB COMPATIBILITY
                })
            });

            const result = await response.json();
            if (result.data?.[0]?.embedding) {
                return result.data[0].embedding;
            }
            console.error("RAG: OpenAI API returned error:", result);
        } catch (apiError: any) {
            console.error("RAG: OpenAI API call failed:", apiError.message);
        }
    }

    // Fallback to local Xenova (384-dim)
    try {
        const pipe = await getPipeline();
        if (pipe) {
            const output = await pipe(text, { pooling: "mean", normalize: true });
            return Array.from(output.data);
        }
    } catch (e: any) {
        console.error("RAG: Xenova fallback also failed:", e.message);
    }

    throw new Error("No embedding engine available (OpenAI failed and Xenova failed)");
}

export function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        let slice = text.slice(start, end);

        // Try to break at a newline or space if we are not at the end
        if (end < text.length) {
            const lastSpace = slice.lastIndexOf(' ');
            if (lastSpace > chunkSize * 0.8) { // Only break if space is near the end
                slice = slice.slice(0, lastSpace);
                start += lastSpace + 1 - overlap; // Move start back for overlap
            } else {
                start += chunkSize - overlap;
            }
        } else {
            start += chunkSize - overlap;
        }

        if (slice.trim().length > 0) {
            chunks.push(slice.trim());
        }
    }
    return chunks;
}
