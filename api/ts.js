const express = require('express');
const axios = require('axios');
const router = express.Router();

// ====================== CONFIG ======================
const CREDENTIALS = {
    username: "Alisindhi077",
    password: "Alisindhi-077"
};

const BASE_URL = "https://www.timesms.org";
const DASHBOARD_URL = `${BASE_URL}/agent/SMSDashboard`;

const COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 15; RMX3930 Build/AP3A.240905.015.A2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.120 Mobile Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": BASE_URL,
    "Accept-Language": "en-PK,en-US;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

// ====================== STATE ======================
const STATE = {
    cookie: null,
    sessKey: null,
    isLoggingIn: false,
    lastLoginTime: 0
};

// ====================== HELPERS ======================
function getTodayDate() {
    const d = new Date();
    return `\( {d.getFullYear()}- \){String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function extractSessKey(html) {
    let match = html.match(/sesskey=([^&"'\s]+)/i);
    if (match) return match[1];
    match = html.match(/sesskey["']\s*[:=]\s*["']([^"']+)["']/i);
    return match ? match[1] : null;
}

function isSessionValid() {
    return STATE.cookie && STATE.sessKey;
}

// ====================== IMPROVED LOGIN ======================
async function performLogin(force = false) {
    if (STATE.isLoggingIn) {
        console.log("⏳ Login already in progress...");
        return;
    }

    const now = Date.now();
    if (!force && isSessionValid() && (now - STATE.lastLoginTime < 90000)) return; // 1.5 min cooldown

    STATE.isLoggingIn = true;
    console.log("🔄 Starting login to https://www.timesms.org ...");

    try {
        const instance = axios.create({
            timeout: 18000,           // increased timeout
            withCredentials: true
        });

        // 1. Get Login Page
        console.log("→ Getting login page...");
        const r1 = await instance.get(`${BASE_URL}/login`, { headers: COMMON_HEADERS });

        let tempCookie = "";
        if (r1.headers['set-cookie']) {
            const c = r1.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            if (c) tempCookie = c.split(';')[0];
        }

        // 2. Solve Captcha
        const captchaMatch = r1.data.match(/What is (\d+)\s*\+\s*(\d+)\s*=\s*\?/i);
        const capt = captchaMatch ? parseInt(captchaMatch[1]) + parseInt(captchaMatch[2]) : 0;

        console.log(`→ Captcha solved: ${capt}`);

        if (capt === 0) {
            throw new Error("Captcha pattern not found on login page");
        }

        // 3. POST Login
        console.log("→ Sending login credentials...");
        const r2 = await instance.post(`${BASE_URL}/signin`, 
            `username=\( {CREDENTIALS.username}&password= \){CREDENTIALS.password}&capt=${capt}`, 
            {
                headers: {
                    ...COMMON_HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": tempCookie,
                    "Referer": `${BASE_URL}/login`
                }
            }
        );

        // Update cookie
        if (r2.headers['set-cookie']) {
            const newC = r2.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            if (newC) STATE.cookie = newC.split(';')[0];
        } else if (tempCookie) {
            STATE.cookie = tempCookie;
        }

        console.log("→ Cookie received");

        // 4. Get Dashboard for sesskey
        console.log("→ Getting dashboard for sesskey...");
        const r3 = await axios.get(DASHBOARD_URL, {
            headers: {
                ...COMMON_HEADERS,
                "Cookie": STATE.cookie,
                "Referer": `${BASE_URL}/agent/`
            },
            timeout: 18000
        });

        const key = extractSessKey(r3.data);
        if (!key) {
            console.log("HTML snippet:", r3.data.substring(0, 500)); // debug
            throw new Error("sesskey not found in dashboard");
        }

        STATE.sessKey = key;
        STATE.lastLoginTime = now;
        console.log(`✅ Login SUCCESS | SessKey: ${key}`);

    } catch (error) {
        console.error("❌ Login ERROR:", error.message);
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Response preview:", error.response.data?.substring?.(0, 300) || "No data");
        }
        STATE.cookie = null;
        STATE.sessKey = null;
    } finally {
        STATE.isLoggingIn = false;
    }
}

// Auto refresh (thoda slow kiya)
setInterval(() => performLogin(), 180000); // 3 minutes

// ====================== MAIN ROUTE ======================
router.get('/', async (req, res) => {
    const { type } = req.query;

    if (!['numbers', 'sms'].includes(type)) {
        return res.status(400).json({ error: "Use ?type=numbers or ?type=sms" });
    }

    console.log(`📥 Request received for type: ${type}`);

    if (!isSessionValid()) {
        console.log("No valid session, logging in...");
        await performLogin(true);
        if (!isSessionValid()) {
            return res.status(503).json({ error: "Login failed. Check server logs." });
        }
    }

    const ts = Date.now();
    const today = getTodayDate();
    let targetUrl = "", referer = "";

    if (type === 'numbers') {
        referer = `${BASE_URL}/agent/MySMSNumbers`;
        targetUrl = `\( {BASE_URL}/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1&_= \){ts}`;
    } else {
        referer = `${BASE_URL}/agent/SMSCDRReports`;
        targetUrl = `\( {BASE_URL}/agent/res/data_smscdr.php?fdate1= \){today}%2000:00:00&fdate2=\( {today}%2023:59:59&sesskey= \){STATE.sessKey}&sEcho=2&iDisplayStart=0&iDisplayLength=-1&_=${ts}`;
    }

    try {
        console.log(`→ Fetching ${type} data...`);
        const response = await axios.get(targetUrl, {
            headers: {
                ...COMMON_HEADERS,
                "Cookie": STATE.cookie,
                "Referer": referer
            },
            timeout: 25000
        });

        if (typeof response.data === 'string' && response.data.includes('<html')) {
            console.log("⚠️ Session expired detected");
            STATE.cookie = null;
            STATE.sessKey = null;
            return res.status(503).json({ message: "Session expired. Try again in few seconds." });
        }

        console.log(`✅ ${type} data fetched successfully`);
        res.set('Content-Type', 'application/json');
        res.send(response.data);

    } catch (e) {
        console.error(`❌ Fetch error for ${type}:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// Server start pe login
performLogin();

module.exports = router;
