require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- HARDCODED TELEGRAM CREDENTIALS ----------
const BOT_TOKEN = '8956593370:AAHT5wVCVoU_Vfkn7eJ79Ojlgpe0A30Ytbk';  // <-- tera token
const CHAT_ID = '8261652786';  // <-- tera chat id

// ---------- REST OF CONFIG ----------
const TARGET_URL = process.env.TARGET_URL || 'https://indsmart.com/register';
const INPUT_SELECTOR = process.env.INPUT_SELECTOR || '#mobile_number';
const BUTTON_SELECTOR = process.env.BUTTON_SELECTOR || '#register_btn';
const SUCCESS_TEXT = process.env.SUCCESS_TEXT || 'Registration successful';

let isRunning = false;
let numberQueue = [];
let currentIndex = 0;

// ---------- API ROUTES ----------
app.post('/start', (req, res) => {
    if (isRunning) return res.json({ status: 'already running' });
    const { numbers } = req.body;
    if (!numbers || !numbers.trim()) return res.json({ status: 'error', msg: 'No numbers' });
    numberQueue = numbers.split(/[\n,]+/).map(n => n.trim()).filter(n => n);
    currentIndex = 0;
    isRunning = true;
    res.json({ status: 'started', total: numberQueue.length });
    runAutomation();
});

app.post('/stop', (req, res) => {
    isRunning = false;
    res.json({ status: 'stopped' });
});

app.get('/status', (req, res) => {
    res.json({ isRunning, current: currentIndex, total: numberQueue.length });
});

async function sendToTelegram(phone) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: `✅ Registered: ${phone}`
        });
        console.log(`📨 TG sent: ${phone}`);
    } catch(e) { console.error('TG error:', e.message); }
}

async function runAutomation() {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        while (isRunning && currentIndex < numberQueue.length) {
            const number = numberQueue[currentIndex];
            console.log(`🔁 ${currentIndex+1}/${numberQueue.length}: ${number}`);
            const page = await browser.newPage();
            try {
                await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
                await page.waitForSelector(INPUT_SELECTOR, { timeout: 10000 });
                await page.type(INPUT_SELECTOR, number);
                await page.click(BUTTON_SELECTOR);
                await page.waitForTimeout(4000);
                const body = await page.evaluate(() => document.body.innerText);
                if (body.toLowerCase().includes(SUCCESS_TEXT.toLowerCase())) {
                    console.log(`✅ Registered: ${number}`);
                    await sendToTelegram(number);
                } else {
                    console.log(`❌ Failed: ${number}`);
                }
            } catch(err) {
                console.error(`Error on ${number}:`, err.message);
            } finally {
                await page.close();
            }
            currentIndex++;
        }
    } catch(err) {
        console.error('Browser error:', err);
    } finally {
        if (browser) await browser.close();
        isRunning = false;
    }
}

// ---------- FRONTEND (same as before) ----------
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Indsmart Auto</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }
        body {
            background: linear-gradient(135deg, #0b1120, #19233c);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 24px;
        }
        .glass {
            background: rgba(255,255,255,0.08);
            backdrop-filter: blur(12px);
            border-radius: 48px;
            padding: 24px;
            max-width: 750px;
            width: 100%;
            border: 1px solid rgba(255,255,255,0.15);
            box-shadow: 0 25px 45px rgba(0,0,0,0.3);
        }
        .card {
            background: white;
            border-radius: 32px;
            padding: 28px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        h1 { font-size: 28px; font-weight: 700; display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
        .sub { color: #4b5563; margin-bottom: 24px; border-left: 3px solid #3b82f6; padding-left: 12px; }
        textarea { width: 100%; padding: 14px; border-radius: 24px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 15px; margin: 16px 0; background: #f8fafc; resize: vertical; }
        textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
        .btn-group { display: flex; gap: 14px; margin: 20px 0; flex-wrap: wrap; }
        button { flex: 1; padding: 12px; border: none; border-radius: 60px; font-weight: 600; font-size: 16px; cursor: pointer; transition: 0.2s; }
        .btn-start { background: linear-gradient(95deg, #10b981, #059669); color: white; box-shadow: 0 4px 12px rgba(16,185,129,0.3); }
        .btn-start:hover { transform: translateY(-2px); filter: brightness(1.05); }
        .btn-stop { background: #ef4444; color: white; box-shadow: 0 4px 12px rgba(239,68,68,0.3); }
        .btn-stop:hover { transform: translateY(-2px); }
        .status-card { background: #f1f5f9; border-radius: 24px; padding: 14px 18px; margin: 20px 0; text-align: center; font-weight: 600; }
        .log { background: #0f172a; color: #a5f3fc; padding: 16px; border-radius: 24px; height: 260px; overflow-y: auto; font-family: 'Monaco', monospace; font-size: 12px; line-height: 1.5; }
        .log-entry { border-bottom: 1px solid #1e293b; padding: 6px 0; }
        .success { color: #4ade80; }
        .error { color: #f87171; }
        footer { text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8; }
        .badge { display: inline-block; background: #3b82f6; color: white; border-radius: 40px; padding: 4px 12px; font-size: 12px; margin-left: 8px; }
    </style>
</head>
<body>
<div class="glass">
<div class="card">
    <h1>📱 Indsmart Auto <span class="badge">v2.0</span></h1>
    <div class="sub">Automatic registration with Telegram alerts – just paste numbers</div>
    <textarea id="numbers" rows="4" placeholder="Enter mobile numbers (one per line or comma separated)&#10;9876543210&#10;9876543211,9876543212"></textarea>
    <div class="btn-group">
        <button id="startBtn" class="btn-start">✨ Start Automation</button>
        <button id="stopBtn" class="btn-stop">⏹ Stop</button>
    </div>
    <div id="statusBox" class="status-card">⚪ Status: Idle</div>
    <div id="logArea" class="log">📝 Log will appear here...</div>
    <footer>⚡ Backend runs on Render/Railway • Telegram bot embedded</footer>
</div>
</div>
<script>
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const numbersText = document.getElementById('numbers');
    const logArea = document.getElementById('logArea');
    const statusBox = document.getElementById('statusBox');

    function addLog(msg, type = 'info') {
        const div = document.createElement('div');
        div.className = 'log-entry';
        if (type === 'success') div.classList.add('success');
        if (type === 'error') div.classList.add('error');
        div.textContent = new Date().toLocaleTimeString() + ' - ' + msg;
        logArea.appendChild(div);
        div.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    async function fetchStatus() {
        try {
            const res = await fetch('/status');
            const data = await res.json();
            if (data.isRunning) statusBox.innerHTML = \`🟢 Status: Running - \${data.current}/\${data.total}\`;
            else statusBox.innerHTML = '⚪ Status: Idle';
        } catch(e) { statusBox.innerHTML = '🔴 Status: Backend unreachable'; }
    }
    setInterval(fetchStatus, 2000);
    fetchStatus();

    startBtn.onclick = async () => {
        const numbers = numbersText.value.trim();
        if (!numbers) { addLog('❌ Please enter numbers first', 'error'); return; }
        addLog('🚀 Starting automation...', 'info');
        try {
            const res = await fetch('/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numbers })
            });
            const data = await res.json();
            if (data.status === 'started') addLog(\`✅ Started with \${data.total} numbers\`, 'success');
            else addLog(\`⚠️ \${data.msg || data.status}\`, 'error');
        } catch(e) { addLog('❌ Failed to connect to backend', 'error'); }
    };
    stopBtn.onclick = async () => {
        try {
            await fetch('/stop', { method: 'POST' });
            addLog('⏹ Stop command sent', 'info');
        } catch(e) { addLog('❌ Stop failed', 'error'); }
    };
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
