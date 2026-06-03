const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- TELEGRAM CREDENTIALS (UPDATED) ----------
const BOT_TOKEN = '8956593370:AAHT5wVCVoU_Vfkn7eJ79Ojlgpe0A30Ytbk';  // यही टोकन है (लेकिन public हो चुका है – revoke कर लेना)
const CHAT_ID = '-1003962870791';   // ✅ नया Chat ID (Supergroup)

// ---------- INDIAN BANK CONFIG ----------
const TARGET_URL = 'https://online.indianbank.bank.in/RetailBanking/';

const REGISTER_LINK_SELECTORS = ['a:contains("REGISTER")', 'a:contains("click here to REGISTER")'];
const MOBILE_TAB_SELECTORS = ['button:contains("Mobile")', 'label:contains("Mobile")'];
const MOBILE_INPUT_SELECTORS = ['#mobileNumber', '#mobile', 'input[placeholder*="Mobile Number"]'];
const REGISTER_BUTTON_SELECTORS = ['#registerNow', 'button:contains("Register Now")'];
const OTP_INDICATORS = ['Enter OTP', 'OTP sent', 'Enter 6 digit OTP'];

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

async function sendToTelegram(phone, status = '✅ OTP sent') {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: `${status}: ${phone}`
        });
        console.log(`📨 Telegram sent to group: ${phone}`);
    } catch(e) {
        console.error('❌ Telegram error:', e.message);
    }
}

async function findElement(page, selectors, timeout = 5000) {
    for (const selector of selectors) {
        try {
            await page.waitForSelector(selector, { timeout });
            return selector;
        } catch(e) {}
    }
    return null;
}

async function clickByText(page, text) {
    try {
        const [el] = await page.$x(`//*[contains(text(), '${text}')]`);
        if (el) { await el.click(); return true; }
    } catch(e) {}
    return false;
}

async function processNumber(browser, number) {
    const page = await browser.newPage();
    try {
        console.log(`🌐 Processing: ${number}`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Click REGISTER link
        let clicked = await findElement(page, REGISTER_LINK_SELECTORS, 5000);
        if (clicked) await page.click(clicked);
        else await clickByText(page, 'REGISTER');
        await page.waitForTimeout(3000);
        
        // Click Mobile tab
        const mobileTab = await findElement(page, MOBILE_TAB_SELECTORS, 5000);
        if (mobileTab) await page.click(mobileTab);
        else await clickByText(page, 'Mobile');
        await page.waitForTimeout(1500);
        
        // Enter mobile number
        const mobileInput = await findElement(page, MOBILE_INPUT_SELECTORS, 5000);
        if (!mobileInput) throw new Error('Mobile input not found');
        await page.click(mobileInput, { clickCount: 3 });
        await page.type(mobileInput, number);
        
        // Click Register Now
        const regBtn = await findElement(page, REGISTER_BUTTON_SELECTORS, 5000);
        if (regBtn) await page.click(regBtn);
        else await clickByText(page, 'Register Now');
        
        // Wait for OTP page
        await page.waitForTimeout(5000);
        const body = await page.evaluate(() => document.body.innerText.toLowerCase());
        const otpSent = OTP_INDICATORS.some(ind => body.includes(ind.toLowerCase()));
        
        if (otpSent) {
            console.log(`✅ OTP triggered for ${number}`);
            await sendToTelegram(number);
            return true;
        } else {
            console.log(`⚠️ No OTP page for ${number}`);
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
        let launchOptions = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        };
        // Try to find system Chrome on Render
        const possiblePaths = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
        for (const path of possiblePaths) {
            try {
                const fs = require('fs');
                if (fs.existsSync(path)) {
                    launchOptions.executablePath = path;
                    console.log(`✅ Using Chrome: ${path}`);
                    break;
                }
            } catch(e) {}
        }
        browser = await puppeteer.launch(launchOptions);
        
        while (isRunning && currentIndex < numberQueue.length) {
            const number = numberQueue[currentIndex];
            console.log(`🔁 ${currentIndex+1}/${numberQueue.length}: ${number}`);
            await processNumber(browser, number);
            currentIndex++;
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

// ---------- FRONTEND (same beautiful UI) ----------
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Indsmart Auto</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',sans-serif;}
body{background:linear-gradient(135deg,#0b1120,#19233c);min-height:100vh;display:flex;justify-content:center;align-items:center;padding:24px;}
.glass{background:rgba(255,255,255,0.08);backdrop-filter:blur(12px);border-radius:48px;padding:24px;max-width:750px;width:100%;border:1px solid rgba(255,255,255,0.15);}
.card{background:white;border-radius:32px;padding:28px;}
h1{font-size:28px;display:flex;gap:10px;align-items:center;margin-bottom:6px;}
.badge{background:#1e3a8a;color:white;border-radius:40px;padding:4px 12px;font-size:12px;}
.sub{color:#4b5563;margin-bottom:24px;border-left:3px solid #3b82f6;padding-left:12px;}
textarea{width:100%;padding:14px;border-radius:24px;border:1px solid #cbd5e1;font-family:monospace;margin:16px 0;background:#f8fafc;}
.btn-group{display:flex;gap:14px;margin:20px 0;}
button{flex:1;padding:12px;border:none;border-radius:60px;font-weight:600;cursor:pointer;transition:0.2s;}
.btn-start{background:#10b981;color:white;}
.btn-stop{background:#ef4444;color:white;}
.status-card{background:#f1f5f9;border-radius:24px;padding:14px;margin:20px 0;text-align:center;}
.log{background:#0f172a;color:#a5f3fc;padding:16px;border-radius:24px;height:260px;overflow-y:auto;font-family:monospace;font-size:12px;}
.log-entry{border-bottom:1px solid #1e293b;padding:6px 0;}
.success{color:#4ade80;}
.error{color:#f87171;}
footer{text-align:center;margin-top:20px;font-size:12px;color:#94a3b8;}
</style>
</head>
<body>
<div class="glass"><div class="card">
<h1>🏦 Indsmart Auto <span class="badge">Fixed</span></h1>
<div class="sub">Indian Bank – Mobile number OTP trigger to Telegram</div>
<textarea id="numbers" rows="4" placeholder="Enter numbers (one per line or comma)&#10;9444391619&#10;9444391900"></textarea>
<div class="btn-group"><button id="startBtn" class="btn-start">✨ Start</button><button id="stopBtn" class="btn-stop">⏹ Stop</button></div>
<div id="statusBox" class="status-card">⚪ Idle</div>
<div id="logArea" class="log">📝 Log will appear here...</div>
<footer>Backend: indsmart-auto.onrender.com | Chat ID updated</footer>
</div></div>
<script>
const startBtn=document.getElementById('startBtn'),stopBtn=document.getElementById('stopBtn'),numbersText=document.getElementById('numbers'),logArea=document.getElementById('logArea'),statusBox=document.getElementById('statusBox');
function addLog(msg,t='info'){const d=document.createElement('div');d.className='log-entry';if(t==='success')d.classList.add('success');if(t==='error')d.classList.add('error');d.textContent=new Date().toLocaleTimeString()+' - '+msg;logArea.appendChild(d);d.scrollIntoView({behavior:'smooth',block:'end'});}
async function fetchStatus(){try{const res=await fetch('/status');const d=await res.json();if(d.isRunning)statusBox.innerHTML=\`🟢 Running - \${d.current}/\${d.total}\`;else statusBox.innerHTML='⚪ Idle';}catch(e){statusBox.innerHTML='🔴 Backend unreachable';}}
setInterval(fetchStatus,2000);fetchStatus();
startBtn.onclick=async()=>{const n=numbersText.value.trim();if(!n){addLog('❌ Enter numbers','error');return;}addLog('🚀 Starting...','info');try{const res=await fetch('/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({numbers:n})});const d=await res.json();if(d.status==='started')addLog(\`✅ Started with \${d.total}\`,'success');else addLog(\`⚠️ \${d.msg}\`,'error');}catch(e){addLog('❌ Backend unreachable','error');}};
stopBtn.onclick=async()=>{await fetch('/stop',{method:'POST'});addLog('⏹ Stopped','info');};
</script>
</body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server ready on port ${PORT}`));
