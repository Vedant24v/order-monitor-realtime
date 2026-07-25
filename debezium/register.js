const fs = require('fs');
const path = require('path');
const http = require('http');

const CONNECT_URL = process.env.CONNECT_URL || 'http://localhost:8083/connectors';
const CONNECTOR_FILE = path.join(__dirname, 'register-postgres-connector.json');
const MAX_ATTEMPTS = 15;
const SLEEP_MS = 3000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendRequest(urlObj, payload) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => resolve({ statusCode: res.statusCode, body }));
            }
        );

        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
    });
}

async function register() {
    if (!fs.existsSync(CONNECTOR_FILE)) {
        console.error('Connector config file not found:', CONNECTOR_FILE);
        process.exit(1);
    }

    const payload = fs.readFileSync(CONNECTOR_FILE, 'utf8');
    const urlObj = new URL(CONNECT_URL);

    console.log(`Waiting for Kafka Connect at ${CONNECT_URL}...`);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const { statusCode, body } = await sendRequest(urlObj, payload);

            if (statusCode === 201) {
                console.log('✅ Connector registered successfully (HTTP 201).');
                console.log(body);
                return;
            } else if (statusCode === 409) {
                console.log('ℹ️ Connector already exists (HTTP 409). Ready!');
                return;
            } else {
                console.warn(`Attempt ${attempt}/${MAX_ATTEMPTS}: Kafka Connect returned HTTP ${statusCode}, retrying...`);
            }
        } catch (err) {
            console.log(`Attempt ${attempt}/${MAX_ATTEMPTS}: Kafka Connect not ready yet (${err.message})...`);
        }

        if (attempt < MAX_ATTEMPTS) {
            await sleep(SLEEP_MS);
        }
    }

    console.error('❌ Failed to register Debezium connector after maximum attempts. Check Kafka Connect container logs.');
    process.exit(1);
}

register();
