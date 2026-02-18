const { spawn } = require('child_process');
const http = require('http');

// Helper to run curl commands for login/setup if needed, 
// using the existing logic from test-rag-flow.js style but purely node-fetch style

async function testStreaming() {
    const fetch = (await import('node-fetch')).default;
    const { CookieJar } = await import('tough-cookie');
    const { fetch: fetchCookie } = await import('node-fetch-cookies');

    const cookieJar = new CookieJar();
    const client = require('node-fetch-cookies').fetch(cookieJar);

    const BASE_URL = 'http://localhost:3000';

    console.log("1. Logging in...");
    // Simulate Login (using credentials from previous tests)
    const loginRes = await client(`${BASE_URL}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            email: 'admin@neon.com',
            password: 'password',
            redirect: 'false',
            callbackUrl: '/'
        })
    });

    if (!loginRes.ok) {
        console.error("Login failed", loginRes.status);
        return;
    }
    console.log("Login successful.");

    // 2. Create Workspace
    const wsName = `StreamTest-${Date.now()}`;
    const wsRes = await client(`${BASE_URL}/api/workspaces`, {
        method: 'POST',
        body: JSON.stringify({ name: wsName })
    });
    const wsData = await wsRes.json();
    const workspaceId = wsData.id;
    console.log(`Workspace created: ${workspaceId}`);

    // 3. Send Chat Request with Streaming
    console.log("3. Sending Chat Query (Streaming)...");
    const chatRes = await client(`${BASE_URL}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({
            workspaceId,
            question: "What is this workspace about?", // Should be empty/generic answer
            includeWebSearch: false
        })
    });

    if (!chatRes.ok) {
        console.error("Chat request failed", chatRes.status, await chatRes.text());
        return;
    }

    console.log("Response headers:", chatRes.headers.get('content-type'));

    // Check for streaming
    if (!chatRes.body) {
        console.error("No response body!");
        return;
    }

    console.log("--- Stream Start ---");
    let fullText = "";

    for await (const chunk of chatRes.body) {
        const text = chunk.toString();
        // process.stdout.write(text); // Streaming output
        console.log(`[Chunk] ${text.length} bytes: ${text.slice(0, 50).replace(/\n/g, '\\n')}...`);
        fullText += text;
    }
    console.log("\n--- Stream End ---");
    console.log("Full response length:", fullText.length);

    if (fullText.length > 0) {
        console.log("Test PASSED: Received text stream.");
    } else {
        console.log("Test FAILED: Empty response.");
    }
}

testStreaming().catch(console.error);
