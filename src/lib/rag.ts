

// Singleton to hold the embedding pipeline
let extractor: any = null;

// Function to get the pipeline
// Function to get the pipeline
async function getPipeline() {
    if (!extractor) {
        try {
            const { pipeline, env } = await import("@xenova/transformers");

            // Vercel friendly configuration
            env.allowLocalModels = false;
            env.useBrowserCache = false;
            env.cacheDir = "/tmp";

            // Force WASM backend
            // @ts-ignore
            env.backends.onnx.wasm.numThreads = 1;

            extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
        } catch (e) {
            console.warn("Xenova local model failed to load, will attempt OpenAI fallback if configured.", e);
            return null;
        }
    }
    return extractor;
}

export async function generateEmbedding(text: string): Promise<number[]> {
    // Priority 1: OpenAI/OpenRouter Embedding (Fastest & most reliable on Vercel)
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
                    input: text,
                    model: model
                })
            });
            const result = await response.json();
            if (result.data?.[0]?.embedding) {
                return result.data[0].embedding;
            }
            console.error("OpenAI Embedding Error:", result);
        } catch (apiError) {
            console.error("OpenAI API call failed:", apiError);
        }
    }

    // Priority 2: Local Xenova (Fallback)
    try {
        const pipe = await getPipeline();
        if (pipe) {
            const output = await pipe(text, { pooling: "mean", normalize: true });
            return Array.from(output.data);
        }
        throw new Error("No embedding engine available (OpenAI key missing and Xenova failed)");
    } catch (error: any) {
        console.error("Embedding core failure:", error);
        throw error;
    }
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
