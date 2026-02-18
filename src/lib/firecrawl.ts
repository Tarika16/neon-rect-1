export interface FirecrawlSearchResult {
    title: string;
    url: string;
    markdown?: string;
    content?: string;
}

export async function searchFirecrawl(query: string, limit: number = 3): Promise<FirecrawlSearchResult[]> {
    const apiKey = process.env.FIRECRAWL_API_KEY;

    if (!apiKey) {
        console.warn("Firecrawl API Key is missing. Skipping web search.");
        return [];
    }

    try {
        console.log(`Firecrawl: Searching for "${query}"...`);
        const response = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                query: query,
                limit: limit,
                scrapeOptions: {
                    formats: ["markdown"]
                }
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Firecrawl API Error: ${response.status} - ${errorBody}`);
            return [];
        }

        const data = await response.json();

        // Map the results to our interface
        if (data.success && Array.isArray(data.data)) {
            console.log(`Firecrawl: Found ${data.data.length} results.`);
            return data.data.map((item: any) => ({
                title: item.title || "No Title",
                url: item.url,
                markdown: item.markdown,
                content: item.content
            }));
        }

        return [];

    } catch (error) {
        console.error("Firecrawl Exception:", error);
        return [];
    }
}
