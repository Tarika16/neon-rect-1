const http = require('http');
const querystring = require('querystring');

const HOST = '127.0.0.1';
const PORT = 3000;
const EMAIL = 'admin@neon.com';
const PASSWORD = 'password123';

// Helper for requests
function request(options, data = null, isMultipart = false) {
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

        if (data) {
            if (!isMultipart) req.write(data);
        }

        if (!isMultipart) req.end();
        else return req;
    });
}

async function login() {
    console.log("1. Logging in...");

    try {
        const csrfRes = await request({ hostname: HOST, port: PORT, path: '/api/auth/csrf', method: 'GET' });
        if (csrfRes.statusCode !== 200) throw new Error(`CSRF failed: ${csrfRes.statusCode}`);

        const csrfToken = JSON.parse(csrfRes.body).csrfToken;
        // Handle set-cookie array or string
        const cookies = csrfRes.headers['set-cookie'];
        if (!cookies) throw new Error("No CSRF cookies set");
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

        if (loginRes.statusCode !== 200 && loginRes.statusCode !== 302) {
            console.log("Login Body:", loginRes.body);
            throw new Error(`Login failed: ${loginRes.statusCode}`);
        }

        const sessionCookies = loginRes.headers['set-cookie'];
        if (!sessionCookies) throw new Error("No Session cookies set");
        return sessionCookies.map(c => c.split(';')[0]).join('; ');
    } catch (e) {
        console.error("Login Error:", e);
        return null;
    }
}

async function createWorkspace(cookie) {
    console.log("2. Creating Debug Workspace...");
    const data = JSON.stringify({ name: "Debug Workspace " + Date.now() });
    const res = await request({
        hostname: HOST, port: PORT, path: '/api/workspaces', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cookie': cookie }
    }, data);

    if (res.statusCode !== 200) {
        console.error("Workspace Create Error:", res.statusCode, res.body);
        return null;
    }
    return JSON.parse(res.body).id;
}

async function uploadFile(cookie, workspaceId) {
    console.log(`3. Uploading Document to Workspace...`);
    const boundary = '----WebKitFormBoundaryDebugUpload';
    const content = "This is a debug document to test the upload functionality.";
    const postDataStart = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="debug.txt"`,
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
        res.on('end', () => {
            console.log("Upload Status Code:", res.statusCode);
            console.log("Upload Response Body:", body);
        });
    });

    req.on('error', (e) => console.error("Upload Request Error:", e));
    req.write(postDataStart);
    req.end();
}

async function main() {
    const cookie = await login();
    if (!cookie) return;

    const workspaceId = await createWorkspace(cookie);
    if (!workspaceId) return;

    await uploadFile(cookie, workspaceId);
}

main();
