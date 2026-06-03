const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- YOUR TELEGRAM CREDENTIALS ----------
const BOT_TOKEN = '8956593370:AAHT5wVCVoU_Vfkn7eJ79Ojlgpe0A30Ytbk';
const CHAT_ID = '8956593370';

// ---------- INDIAN BANK CONFIGURATION ----------
const TARGET_URL = 'https://online.indianbank.bank.in/RetailBanking/';

// Selectors for the flow (inspect and update if needed)
const REGISTER_LINK_SELECTORS = [
    'a:contains("REGISTER")',
    'a:contains("click here to REGISTER")',
    'a[href*="register"]',
    '#registerLink',
    '.register-link'
];

const MOBILE_TAB_SELECTORS = [
    'button:contains("Mobile")',
    'label:contains("Mobile")',
    '#mobileTab',
    '.nav-link[data-target="#mobile"]',
    'input[value="Mobile"]'
];

const MOBILE_INPUT_SELECTORS = [
    '#mobileNumber',
    '#mobile',
    '#phone',
    'input[name="mobileNumber"]',
    'input[placeholder*="Mobile Number"]',
    'input[type="tel"]'
];

const REGISTER_BUTTON_SELECTORS = [
    '#registerNow',
    '#submit',
    'button:contains("Register Now")',
    'button:contains("Register")',
    'input[value="Register Now"]'
];

const OTP_PAGE_INDICATORS = [
    'Enter OTP',
    'OTP sent',
    'verification code',
    'Enter 6 digit OTP'
];

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

async function sendToTelegram(phone, status = '✅ OTP triggered') {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: `${status}: ${phone}`
        });
        console.log(`📨 Telegram sent: ${phone} (${status})`);
    } catch(e) {
        console.error('❌ Telegram error:', e.message);
    }
}

// Helper: find element by multiple selectors
async function findElement(page, selectors, timeout = 5000) {
    for (const selector of selectors) {
        try {
            await page.waitForSelector(selector, { timeout });
            return selector;
        } catch(e) {}
    }
    return null;
}

// Helper: click element by text content (fallback)
async function clickByText(page, text) {
    try {
        const [el] = await page.$x(`//*[contains(text(), '${text}')]`);
        if (el) {
            await el.click();
            return true;
        }
    } catch(e) {}
    return false;
}

async function processNumber(browser, number) {
    const page = await browser.newPage();
    try {
        console.log(`🌐 Processing: ${number}`);
        
        // 1. Go to main page
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // 2. Click REGISTER link (try selectors then text)
        let clicked = false;
        const linkSelector = await findElement(page, REGISTER_LINK_SELECTORS, 5000);
        if (linkSelector) {
            await page.click(linkSelector);
            clicked = true;
        } else {
            clicked = await clickByText(page, 'REGISTER');
        }
        if (!clicked) {
            console.log(`❌ Could not find REGISTER link for ${number}`);
            return false;
        }
        await page.waitForTimeout(3000);
        
        // 3. Switch to Mobile tab (if needed)
        const mobileTab = await findElement(page, MOBILE_TAB_SELECTORS, 5000);
        if (mobileTab) {
            await page.click(mobileTab);
            await page.waitForTimeout(1500);
        } else {
            // try text click
            await clickByText(page, 'Mobile');
        }
        
        // 4. Find mobile input and type number
        const mobileInput = await findElement(page, MOBILE_INPUT_SELECTORS, 5000);
        if (!mobileInput) {
            console.log(`❌ No mobile input field found for ${number}`);
            return false;
        }
        await page.click(mobileInput, { clickCount: 3 });
        await page.type(mobileInput, number);
        
        // 5. Click Register Now button
        const regBtn = await findElement(page, REGISTER_BUTTON_SELECTORS, 5000);
        if (regBtn) {
            await page.click(regBtn);
        } else {
            const clickedReg = await clickByText(page, 'Register Now');
            if (!clickedReg) {
                console.log(`❌ No Register button found for ${number}`);
                return false;
            }
        }
        
        // 6. Wait for OTP page to appear (success indicator)
        await page.waitForTimeout(5000);
        const body = await page.evaluate(() => document.body.innerText.toLowerCase());
        let otpSent = false;
        for (const indicator of OTP_PAGE_INDICATORS) {
            if (body.includes(indicator.toLowerCase())) {
                otpSent = true;
                break;
            }
        }
        
        if (otpSent) {
            console.log(`✅ OTP triggered for ${number}`);
            await sendToTelegram(number, '✅ OTP sent (registration initiated)');
            return true;
        } else {
            console.log(`⚠️ OTP page not detected for ${number}, but request may have been sent`);
            await sendToTelegram(number, '⚠️ Attempted - check bank portal');
            return false;
        }
    } catch(err) {
        console.error(`Error on ${number}:`, err.message);
        return false;
    } finally {
        await page.close();
    }
}

async function runAutomation() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });
        
        while (isRunning && currentIndex < numberQueue.length) {
            const number = numberQueue[currentIndex];
            console.log(`🔁 ${currentIndex+1}/${numberQueue.length}: ${number}`);
            await processNumber(browser, number);
            currentIndex++;
            // random delay between attempts (2-5 sec)
            if (isRunning && currentIndex < numberQueue.length) {
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
            }
        }
    } catch(err) {
        console.error('Browser error:', err);
    } finally {
        if (browser) await browser.close();
        isRunning = false;
        console.log('🏁 Automation finished');
    }
}

// ---------- FRONTEND (beautiful UI) ----------
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Indsmart Auto - Indian Bank</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }
        body { background: linear-gradient(135deg, #0b1120, #19233c); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 24px; }
        .glass { background: rgba(255,255,255,0.08); backdrop-filter: blur(12px); border-radius: 48px; padding: 24px; max-width: 750px; width: 100%; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 25px 45px rgba(0,0,0,0.3); }
        .card { background: white; border-radius: 32px; padding: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
        h1 { font-size: 28px; font-weight: 700; display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
        .badge { background: #1e3a8a; color: white; border-radius: 40px; padding: 4px 12px; font-size: 12px; }
        .sub { color: #4b5563; margin-bottom: 24px; border-left: 3px solid #3b82f6; padding-left: 12px; }
        textarea { width: 100%; padding: 14px; border-radius: 24px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 15px; margin: 16px 0; background: #f8fafc; resize: vertical; }
        textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
        .btn-group { display: flex; gap: 14px; margin: 20px 0; flex-wrap: wrap; }
        button { flex: 1; padding: 12px; border: none; border-radius: 60px; font-weight: 600; font-size: 16px; cursor: pointer; transition: 0.2s; }
        .btn-start { background: linear-gradient(95deg, #10b981, #059669); color: white; }
        .btn-stop { background: #ef4444; color: white; }
        .btn-start:hover, .btn-stop:hover { transform: translateY(-2px); filter: brightness(1.05); }
        .status-card { background: #f1f5f9; border-radius: 24px; padding: 14px 18px; margin: 20px 0; text-align: center; font-weight: 600; }
        .log { background: #0f172a; color: #a5f3fc; padding: 16px; border-radius: 24px; height: 260px; overflow-y: auto; font-family: monospace; font-size: 12px; line-height: 1.5; }
        .log-entry { border-bottom: 1px solid #1e293b; padding: 6px 0; }
        .success { color: #4ade80; }
        .error { color: #f87171; }
        footer { text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8; }
    </style>
</head>
<body>
<div class="glass">
<div class="card">
    <h1>🏦 Indsmart Auto <span class="badge">Indian Bank</span></h1>
    <div class="sub">Mobile registration – OTP trigger & Telegram alert</div>
    <textarea id="numbers" rows="4" placeholder="Enter mobile numbers (one per line or comma separated)&#10;9444391619&#10;9444391900"></textarea>
    <div class="btn-group">
        <button id="startBtn" class="btn-start">✨ Start Automation</button>
        <button id="stopBtn" class="btn-stop">⏹ Stop</button>
    </div>
    <div id="statusBox" class="status-card">⚪ Status: Idle</div>
    <div id="logArea" class="log">📝 Log will appear here...</div>
    <footer>⚡ Backend live | OTP trigger → Telegram alert | Auto continue</footer>
</div>
</div>
<script>
    const API_BASE = '';
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
        if (!numbers) { addLog('❌ Enter numbers first', 'error'); return; }
        addLog('🚀 Starting...', 'info');
        try {
            const res = await fetch('/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numbers })
            });
            const data = await res.json();
            if (data.status === 'started') addLog(\`✅ Started with \${data.total} numbers\`, 'success');
            else addLog(\`⚠️ \${data.msg || data.status}\`, 'error');
        } catch(e) { addLog('❌ Backend unreachable', 'error'); }
    };
    stopBtn.onclick = async () => {
        await fetch('/stop', { method: 'POST' });
        addLog('⏹ Stop requested', 'info');
    };
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
