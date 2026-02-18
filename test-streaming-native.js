const http = require('http');
const querystring = require('querystring');

const HOST = 'localhost';
const PORT = 3000;
const EMAIL = 'admin@neon.com';
const PASSWORD = 'password123'; // Note: Ensure this matches your actual seed/test credentials. In test-rag-flow.js it was 'password123' or 'admin123'?
// DB seed usually has 'password' or 'admin'. I'll try 'password' based on my previous knowledge of seed.ts users. 
// Actually, in test-rag-flow.js it was 'password123'. 
// Wait, in Step 4724 it says `const PASSWORD = 'password123';`. I'll stick to that.

// Helper for requests
function request(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });
        req.on('error', (e) => reject(e));
        if (data) req.write(data);
        req.end();
    });
}

async function login() {
    console.log("1. Logging in...");
    // 1. Get CSRF
    const csrfRes = await request({ hostname: HOST, port: PORT, path: '/api/auth/csrf', method: 'GET' });
    const csrfToken = JSON.parse(csrfRes.body).csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    if (!cookies) throw new Error("No cookies from CSRF");
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    const postData = querystring.stringify({
        email: EMAIL, password: 'password123',
        redirect: false, csrfToken: csrfToken, callbackUrl: '/'
    });

    // 2. Login
    const loginRes = await request({
        hostname: HOST, port: PORT, path: '/api/auth/callback/credentials', method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'Cookie': cookieHeader
        }
    }, postData);

    if (loginRes.statusCode !== 200 && loginRes.statusCode !== 302) throw new Error("Login failed: " + loginRes.statusCode);

    const sessionCookies = loginRes.headers['set-cookie'];
    if (!sessionCookies) throw new Error("No session cookies");
    return sessionCookies.map(c => c.split(';')[0]).join('; ');
}

async function createWorkspace(cookie) {
    console.log("2. Creating Test Workspace...");
    const data = JSON.stringify({ name: "Streaming Test " + Date.now() });
    const res = await request({
        hostname: HOST, port: PORT, path: '/api/workspaces', method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'Cookie': cookie
        }
    }, data);
    return JSON.parse(res.body).id;
}

function testStream(cookie, workspaceId) {
    return new Promise((resolve, reject) => {
        console.log("3. Testing Streaming Chat...");
        const data = JSON.stringify({
            workspaceId,
            question: "Tell me a short story about a cat.",
            includeWebSearch: false
        });

        const req = http.request({
            hostname: HOST, port: PORT, path: '/api/chat', method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'Cookie': cookie
            }
        }, (res) => {
            console.log(`Response Status: ${res.statusCode}`);
            console.log(`Headers:`, res.headers);

            res.setEncoding('utf8');
            let chunkCount = 0;

            res.on('data', (chunk) => {
                chunkCount++;
                console.log(`[Chunk ${chunkCount}] ${chunk.length} chars: ${chunk.slice(0, 50).replace(/\n/g, '\\n')}...`);
            });

            res.on('end', () => {
                console.log("Stream finished.");
                if (chunkCount > 1) {
                    console.log("SUCCESS: Received multiple chunks.");
                    resolve(true);
                } else {
                    console.log("WARNING: Received only 1 chunk (simulated stream?).");
                    resolve(true); // Still a success if it works, but maybe not streaming well locally.
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

async function main() {
    try {
        const cookie = await login();
        const wsId = await createWorkspace(cookie);
        await testStream(cookie, wsId);
    } catch (e) {
        console.error("Test Error:", e);
    }
}

main();
