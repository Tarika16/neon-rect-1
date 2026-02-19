

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
    // CRITICAL: We MUST use the 384-dimensional model to match the DB schema 'vector(384)'.
    // OpenAI's text-embedding-3-small is 1536-dim and will cause silent failures.

    // Priority 1: Local Xenova (MiniLM-L6-v2 is 384-dim)
    try {
        const pipe = await getPipeline();
        if (pipe) {
            const output = await pipe(text, { pooling: "mean", normalize: true });
            return Array.from(output.data);
        }
    } catch (error: any) {
        console.warn("Xenova embedding failed, falling back to API if available:", error.message);
    }

    // Priority 2: OpenAI Fallback (ONLY if forced or Xenova fails, but must be compatible)
    // NOTE: This usually won't match 384-dim unless using a specific model/truncate.
    // For now, we prefer erroring or Xenova to prevent DB corruption.

    throw new Error("No embedding engine available or dimension mismatch (Xenova failed and OpenAI is 1536-dim)");
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
