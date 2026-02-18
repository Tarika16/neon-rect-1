const http = require('http');
const querystring = require('querystring');

const HOST = '127.0.0.1';
const PORT = 3000;
const EMAIL = 'admin@neon.com';
const PASSWORD = 'password123';

// Helper for requests
function request(options, data = null, isMultipart = false) {
    return new Promise((resolve, reject) => {
        console.log(`> ${options.method} ${options.path}`);
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                console.log(`< ${res.statusCode} ${options.path}`);
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', (e) => reject(e));

        if (data) {
            if (!isMultipart) req.write(data);
        }

        if (!isMultipart) req.end();
        else return req;
    });
}

async function login() {
    console.log("1. Logging in...");

    const csrfRes = await request({ hostname: HOST, port: PORT, path: '/api/auth/csrf', method: 'GET' });
    const csrfToken = JSON.parse(csrfRes.body).csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    if (!cookies) return null;
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    const postData = querystring.stringify({
        email: EMAIL, password: PASSWORD, redirect: false, csrfToken: csrfToken, callbackUrl: '/'
    });

    const loginRes = await request({
        hostname: HOST, port: PORT, path: '/api/auth/callback/credentials', method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'Cookie': cookieHeader
        }
    }, postData);

    if (loginRes.statusCode !== 200 && loginRes.statusCode !== 302) return null;
    const sessionCookies = loginRes.headers['set-cookie'];
    if (!sessionCookies) return null;
    return sessionCookies.map(c => c.split(';')[0]).join('; ');
}

async function createWorkspace(cookie) {
    console.log("2. Creating RAG Workspace...");
    const data = JSON.stringify({ name: "RAG Test Workspace " + Date.now() });
    const res = await request({
        hostname: HOST, port: PORT, path: '/api/workspaces', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cookie': cookie }
    }, data);
    return JSON.parse(res.body).id;
}

async function uploadFile(cookie, workspaceId) {
    console.log(`3. Uploading Document to Workspace...`);
    const boundary = '----WebKitFormBoundaryRAGTest';
    const content = "The Project Apollo mission was designed to land humans on the Moon and bring them safely back to Earth. launched in 1961.";
    const postDataStart = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="apollo.txt"`,
        `Content-Type: text/plain`,
        '',
        content,
        `--${boundary}`,
        `Content-Disposition: form-data; name="workspaceId"`,
        '',
        workspaceId,
        `--${boundary}--`
    ].join('\r\n');

    const req = http.request({
        hostname: HOST, port: PORT, path: '/api/documents', method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': Buffer.byteLength(postDataStart),
            'Cookie': cookie
        }
    }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => console.log("Upload Status:", res.statusCode, body));
    });

    req.write(postDataStart);
    req.end();

    // Wait for embeddings to generate (it's async in the route but awaited before response, usually)
    // But since it's a heavy CPU task, give it a moment
    await new Promise(r => setTimeout(r, 5000));
}

async function chat(cookie, workspaceId, question) {
    console.log(`4. RAG Chat: "${question}"`);
    const data = JSON.stringify({ workspaceId, question, includeWebSearch: false });

    const res = await request({
        hostname: HOST, port: PORT, path: '/api/chat', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cookie': cookie }
    }, data);

    console.log("Chat Response:", res.body);
}

async function main() {
    try {
        const cookie = await login();
        if (!cookie) { console.error("Login failed"); return; }

        const workspaceId = await createWorkspace(cookie);
        if (!workspaceId) { console.error("Workspace failed"); return; }

        await uploadFile(cookie, workspaceId);

        // Test Semantic Search
        // Query implies knowledge from the doc ("Apollo", "Moon")
        await chat(cookie, workspaceId, "What was the goal of Project Apollo?");

    } catch (e) {
        console.error("Test failed", e);
    }
}

main();
