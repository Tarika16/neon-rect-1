

// Singleton to hold the embedding pipeline
let extractor: any = null;

// Function to get the pipeline
async function getPipeline() {
    if (!extractor) {
        const { pipeline, env } = await import("@xenova/transformers");

        // Vercel friendly configuration
        env.allowLocalModels = false;
        env.useBrowserCache = false;

        // Use a small, efficient model for embeddings
        extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    return extractor;
}

export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        const pipe = await getPipeline();
        const output = await pipe(text, { pooling: "mean", normalize: true });
        // Convert Float32Array to regular array
        return Array.from(output.data);
    } catch (error) {
        console.error("Embedding Error", error);
        throw new Error("Failed to generate embedding");
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
