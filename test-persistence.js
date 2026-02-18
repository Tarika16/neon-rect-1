const http = require('http');
const querystring = require('querystring');

const HOST = 'localhost';
const PORT = 3000;
const EMAIL = 'admin@neon.com';
const PASSWORD = 'password123';

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
    const csrfRes = await request({ hostname: HOST, port: PORT, path: '/api/auth/csrf', method: 'GET' });
    const csrfToken = JSON.parse(csrfRes.body).csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    if (!cookies) throw new Error("No cookies from CSRF");
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    const postData = querystring.stringify({
        email: EMAIL, password: PASSWORD,
        redirect: false, csrfToken: csrfToken, callbackUrl: '/'
    });

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
    console.log("2. Creating Workspace...");
    const data = JSON.stringify({ name: "Persistence Test " + Date.now() });
    const res = await request({
        hostname: HOST, port: PORT, path: '/api/workspaces', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cookie': cookie }
    }, data);
    return JSON.parse(res.body).id;
}

async function sendChat(cookie, workspaceId) {
    console.log("3. Sending Chat Message...");
    const data = JSON.stringify({ workspaceId, question: "Hello", includeWebSearch: false });

    // We don't care about streaming here, just that it finishes so we can check DB
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: HOST, port: PORT, path: '/api/chat', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cookie': cookie }
        }, (res) => {
            res.on('data', () => { }); // Consuming stream
            res.on('end', resolve);
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function fetchHistory(cookie, workspaceId) {
    console.log("4. Fetching Chat History...");
    const res = await request({
        hostname: HOST, port: PORT, path: `/api/workspaces/${workspaceId}/messages`, method: 'GET',
        headers: { 'Cookie': cookie }
    });

    if (res.statusCode !== 200) throw new Error("Failed to fetch history");
    const messages = JSON.parse(res.body);
    console.log(`   Found ${messages.length} messages.`);
    if (messages.length >= 2) console.log("   SUCCESS: User and AI message found.");
    else console.warn("   WARNING: Less than 2 messages found. Might be timing issue with async save.");
}

async function deleteWorkspace(cookie, workspaceId) {
    console.log("5. Deleting Workspace...");
    const res = await request({
        hostname: HOST, port: PORT, path: `/api/workspaces/${workspaceId}`, method: 'DELETE',
        headers: { 'Cookie': cookie }
    });

    if (res.statusCode === 204) console.log("   SUCCESS: Workspace deleted (204).");
    else console.error(`   FAILED: Delete status ${res.statusCode}`);
}

async function main() {
    try {
        const cookie = await login();
        const wsId = await createWorkspace(cookie);
        await sendChat(cookie, wsId);

        // Wait a bit for async db write in 'onFinish'
        await new Promise(r => setTimeout(r, 2000));

        await fetchHistory(cookie, wsId);
        await deleteWorkspace(cookie, wsId);

    } catch (e) {
        console.error("Test Error:", e);
    }
}

main();
