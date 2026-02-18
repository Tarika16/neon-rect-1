const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const HOST = '127.0.0.1';
const PORT = 3000;
const EMAIL = 'admin@neon.com';
const PASSWORD = 'password123';

// Helper for requests
function request(options, data = null, isMultipart = false) {
    return new Promise((resolve, reject) => {
        console.log(`> Req: ${options.method} ${options.path}`);
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                console.log(`< Res: ${res.statusCode} ${options.path}`);
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', (e) => {
            console.error(`! Err: ${e.message}`);
            reject(e);
        });

        if (data) {
            if (isMultipart) {
                // written directly to stream
            } else {
                req.write(data);
            }
        }

        if (!isMultipart) req.end();
        else return req; // Return req for manual piping
    });
}

async function login() {
    console.log("1. Logging in...");

    // 1. Get CSRF Token
    const csrfRes = await request({
        hostname: HOST,
        port: PORT,
        path: '/api/auth/csrf',
        method: 'GET'
    });

    let csrfToken = "";
    try {
        const json = JSON.parse(csrfRes.body);
        csrfToken = json.csrfToken;
    } catch (e) {
        console.error("Failed to get CSRF token", csrfRes.body);
        return null;
    }

    const cookies = csrfRes.headers['set-cookie'];
    if (!cookies) {
        console.error("No Set-Cookie in CSRF response");
        return null;
    }
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    // 2. Credentials Login
    const postData = querystring.stringify({
        email: EMAIL,
        password: PASSWORD,
        redirect: false,
        csrfToken: csrfToken,
        callbackUrl: '/'
    });

    const loginRes = await request({
        hostname: HOST,
        port: PORT,
        path: '/api/auth/callback/credentials',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'Cookie': cookieHeader
        }
    }, postData);

    if (loginRes.statusCode !== 200 && loginRes.statusCode !== 302) {
        console.error("Login failed", loginRes.statusCode, loginRes.body);
        return null;
    }

    const sessionCookies = loginRes.headers['set-cookie'];
    if (!sessionCookies) {
        console.error("No Set-Cookie in Login response. Location:", loginRes.headers['location']);
        return null;
    }
    const finalCookie = sessionCookies.map(c => c.split(';')[0]).join('; ');
    console.log("Login successful! Session Cookie obtained.");
    return finalCookie;
}

async function createWorkspace(cookie) {
    console.log("2. Creating Workspace...");
    const data = JSON.stringify({ name: "Automated Test Workspace " + Date.now() });

    const res = await request({
        hostname: HOST,
        port: PORT,
        path: '/api/workspaces',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'Cookie': cookie
        }
    }, data);

    if (res.statusCode !== 200) {
        console.error("Workspace creation failed", res.statusCode, res.body);
        return null;
    }

    const workspace = JSON.parse(res.body);
    console.log("Workspace created:", workspace.id, workspace.name);
    return workspace.id;
}

async function uploadFile(cookie, workspaceId, filename, content) {
    console.log(`3. Uploading ${filename} to Workspace...`);
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';

    const postDataStart = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${filename}"`,
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
        hostname: HOST,
        port: PORT,
        path: '/api/documents',
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': Buffer.byteLength(postDataStart),
            'Cookie': cookie
        }
    }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log(`Upload ${filename} status:`, res.statusCode);
            if (res.statusCode === 200) {
                console.log("Upload success:", body);
            } else {
                console.error("Upload failed:", body);
            }
        });
    });

    req.write(postDataStart);
    req.end();

    // Small delay to ensure DB write
    await new Promise(r => setTimeout(r, 1000));
}

async function chat(cookie, workspaceId, question, deepSearch = false) {
    console.log(`4. Chatting (DeepSearch: ${deepSearch})... Question: ${question}`);

    const data = JSON.stringify({
        workspaceId: workspaceId,
        question: question,
        includeWebSearch: deepSearch
    });

    const res = await request({
        hostname: HOST,
        port: PORT,
        path: '/api/chat',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'Cookie': cookie
        }
    }, data);

    console.log("Chat Response Code:", res.statusCode);
    console.log("Chat Body:", res.body);
}

async function main() {
    try {
        const cookie = await login();
        if (!cookie) return;

        const workspaceId = await createWorkspace(cookie);
        if (!workspaceId) return;

        // Upload 2 files
        await uploadFile(cookie, workspaceId, "policy_a.txt", "Policy A: Employees effectively work 4 days a week.");
        await uploadFile(cookie, workspaceId, "policy_b.txt", "Policy B: Remote work is allowed globally.");

        // Chat
        await chat(cookie, workspaceId, "Compare Policy A and B.", false);

        // Deep Search Chat (Will fail if no API key, but we test the route)
        await chat(cookie, workspaceId, "What is the capital of France?", true);

    } catch (e) {
        console.error("Test failed", e);
    }
}

main();
