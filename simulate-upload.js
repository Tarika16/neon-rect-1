const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const EMAIL = "admin@neon.com";
const PASSWORD = "password123";
const HOST = "localhost";
const PORT = 3000;

// Helper to standard request
function request(options, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// 1. Login to get cookie
async function login() {
    console.log("Logging in...");
    // NextAuth v5 credentials login is tricky with raw HTTP because of CSRF.
    // However, we can use the proper flow:
    // 1. GET /api/auth/csrf
    // 2. POST /api/auth/callback/credentials

    // Step 1: CSRF
    const csrfRes = await request({
        hostname: HOST, port: PORT, path: '/api/auth/csrf', method: 'GET'
    });

    const csrfCookie = csrfRes.headers['set-cookie'][0].split(';')[0];
    const csrfJson = JSON.parse(csrfRes.body);
    const csrfToken = csrfJson.csrfToken;

    console.log("CSRF Token:", csrfToken);

    // Step 2: Credentials
    const postData = new URLSearchParams({
        csrfToken: csrfToken,
        email: EMAIL,
        password: PASSWORD,
        json: 'true'
    }).toString();

    const loginRes = await request({
        hostname: HOST, port: PORT, path: '/api/auth/callback/credentials', method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'Cookie': csrfCookie
        }
    }, postData);

    console.log("Login Response Status:", loginRes.statusCode);
    // console.log("Login Response Headers:", loginRes.headers);
    console.log("Login Response Body:", loginRes.body);

    // Extract session cookie
    const cookies = loginRes.headers['set-cookie'];
    console.log("Raw Cookies Type:", typeof cookies);
    console.log("Raw Cookies:", cookies);

    if (!cookies) throw new Error("Login failed (no cookies)");

    // Safety check for array
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

    const finalCookie = cookieArray.map(c => c ? c.split(';')[0] : '').join('; ');

    console.log("Logged in. Cookie length:", finalCookie.length);
    fs.writeFileSync('cookie.txt', finalCookie);
    return finalCookie;
}

// 2. Upload File
async function upload(cookie) {
    console.log("Uploading file...");

    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    // const filePath = path.join(__dirname, 'test', 'data', '05-versions-space.pdf');
    const filePath = path.join(__dirname, 'sample.txt');
    const fileContent = fs.readFileSync(filePath);

    let body = `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="test-upload.txt"\r\n`;
    body += `Content-Type: text/plain\r\n\r\n`;

    const bodyHead = Buffer.from(body);
    const bodyTail = Buffer.from(`\r\n--${boundary}--\r\n`);

    const totalLength = bodyHead.length + fileContent.length + bodyTail.length;

    const options = {
        hostname: HOST,
        port: PORT,
        path: '/api/documents',
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': totalLength,
            'Cookie': cookie
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);

        req.write(bodyHead);
        req.write(fileContent);
        req.write(bodyTail);
        req.end();
    });
}

// 3. Chat with Document
async function chat(cookie, documentId) {
    console.log(`Chatting with document ${documentId}...`);

    const postData = JSON.stringify({
        documentId: documentId,
        question: "What is this document about?"
    });

    const options = {
        hostname: HOST,
        port: PORT,
        path: '/api/chat',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Cookie': cookie
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function main() {
    try {
        const cookie = await login();
        if (!cookie) return;

        console.log("Cookie saved. Proceeding to upload.");

        const res = await upload(cookie);
        if (res) {
            console.log("Upload Status:", res.statusCode);
            console.log("Upload Body:", res.body);

            if (res.statusCode === 200) {
                console.log("SUCCESS: File uploaded!");
                let doc;
                try {
                    doc = JSON.parse(res.body);
                    console.log("Document ID:", doc.id);
                } catch (e) {
                    console.error("Failed to parse upload response:", res.body);
                    return;
                }

                // Now test chat
                const chatRes = await chat(cookie, doc.id);
                console.log("Chat Status:", chatRes.statusCode);
                console.log("Chat Response:", chatRes.body);

                if (chatRes.statusCode === 200) {
                    console.log("SUCCESS: Chat working!");
                } else {
                    console.error("FAILURE: Chat failed.");
                }
            } else {
                console.error("FAILURE: Check logs.");
            }
        }
    } catch (e) {
        console.error("Script Error:", e);
    }
}

main();
