export interface WebSearchResult {
    title: string;
    url: string;
    markdown?: string;
    content?: string;
}

/**
 * Search the web using DuckDuckGo HTML (no API key needed).
 * Falls back to Firecrawl if FIRECRAWL_API_KEY is set.
 */
export async function searchFirecrawl(query: string, limit: number = 3): Promise<WebSearchResult[]> {
    // Try Firecrawl first if key exists
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (firecrawlKey) {
        const results = await searchWithFirecrawl(query, limit, firecrawlKey);
        if (results.length > 0) return results;
    }

    // Free fallback: DuckDuckGo HTML search
    return await searchWithDuckDuckGo(query, limit);
}

async function searchWithFirecrawl(query: string, limit: number, apiKey: string): Promise<WebSearchResult[]> {
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
                scrapeOptions: { formats: ["markdown"] }
            })
        });

        if (!response.ok) {
            console.error(`Firecrawl API Error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
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

async function searchWithDuckDuckGo(query: string, limit: number): Promise<WebSearchResult[]> {
    try {
        console.log(`DeepSearch: Searching DuckDuckGo for "${query}"...`);

        const encodedQuery = encodeURIComponent(query);
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9"
            }
        });

        if (!response.ok) {
            console.error(`DuckDuckGo search failed: ${response.status}`);
            return [];
        }

        const html = await response.text();
        const results = parseDuckDuckGoResults(html, limit);
        console.log(`DeepSearch: Found ${results.length} results from DuckDuckGo`);

        // Fetch content from top results
        const enrichedResults: WebSearchResult[] = [];
        for (const result of results.slice(0, limit)) {
            try {
                const pageContent = await fetchPageContent(result.url);
                enrichedResults.push({
                    ...result,
                    content: pageContent || result.content,
                    markdown: pageContent || result.content
                });
            } catch {
                enrichedResults.push(result);
            }
        }

        return enrichedResults;
    } catch (error) {
        console.error("DuckDuckGo search error:", error);
        return [];
    }
}

function parseDuckDuckGoResults(html: string, limit: number): WebSearchResult[] {
    const results: WebSearchResult[] = [];

    // Parse result links from DuckDuckGo HTML
    // DuckDuckGo HTML results have <a class="result__a" href="..."> and <a class="result__snippet" ...>
    const resultBlocks = html.split(/class="result__body"/gi);

    for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
        const block = resultBlocks[i];

        // Extract URL from result__a link  
        const urlMatch = block.match(/href="([^"]*uddg=([^&"]+))/i) ||
            block.match(/href="(https?:\/\/[^"]+)"/i);

        let url = "";
        if (urlMatch) {
            // DuckDuckGo wraps URLs with a redirect, decode it
            if (urlMatch[2]) {
                url = decodeURIComponent(urlMatch[2]);
            } else {
                url = urlMatch[1];
            }
        }

        // Extract title
        const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</i);
        const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim() : "";

        // Extract snippet
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
        let snippet = "";
        if (snippetMatch) {
            snippet = snippetMatch[1]
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#x27;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, ' ')
                .trim();
        }

        if (url && title) {
            results.push({ title, url, content: snippet });
        }
    }

    return results;
}

async function fetchPageContent(url: string): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html"
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const html = await response.text();

        // Extract meaningful text from HTML (strip tags, scripts, styles)
        let text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[\s\S]*?<\/header>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#x27;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();

        // Limit to first ~2000 chars of meaningful content
        if (text.length > 2000) {
            text = text.slice(0, 2000) + "...";
        }

        return text.length > 50 ? text : null; // Skip if too short
    } catch {
        return null;
    }
}
