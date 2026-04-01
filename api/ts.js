const express = require('express');
const axios = require('axios');
const router = express.Router();

// ====================== CONFIGURATION ======================
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
    "Accept-Language": "en-PK,en-US;q=0.9,en;q=0.8"
};

// ====================== GLOBAL STATE ======================
const STATE = {
    cookie: null,
    sessKey: null,
    isLoggingIn: false,
    lastLoginTime: 0
};

// ====================== HELPER FUNCTIONS ======================
function getTodayDate() {
    const d = new Date();
    return `\( {d.getFullYear()}- \){String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function extractSessKey(html) {
    const match = html.match(/sesskey=([^&"'\s]+)/i);
    return match ? match[1] : null;
}

function isSessionValid() {
    return STATE.cookie && STATE.sessKey;
}

// ====================== LOGIN SERVICE ======================
async function performLogin(force = false) {
    const now = Date.now();
    if (STATE.isLoggingIn) return;
    if (!force && isSessionValid() && (now - STATE.lastLoginTime < 60000)) return;

    STATE.isLoggingIn = true;
    console.log("🔄 Logging into timesms.org Agent Panel...");

    try {
        const instance = axios.create({
            headers: COMMON_HEADERS,
            timeout: 15000,
            withCredentials: true
        });

        // Step 1: Get login page
        const r1 = await instance.get(`${BASE_URL}/login`);

        let tempCookie = "";
        if (r1.headers['set-cookie']) {
            const phpCookie = r1.headers['set-cookie'].find(c => c.includes('PHPSESSID'));
            if (phpCookie) tempCookie = phpCookie.split(';')[0];
        }

        // Step 2: Solve math captcha
        const match = r1.data.match(/What is (\d+) \+ (\d+) = \?/i);
        const captchaAnswer = match ? parseInt(match[1]) + parseInt(match[2]) : 0;

        if (captchaAnswer === 0) throw new Error("Captcha pattern not found");

        // Step 3: Login POST
        const r2 = await instance.post(`${BASE_URL}/signin`,
            new URLSearchParams({
                username: CREDENTIALS.username,
                password: CREDENTIALS.password,
                capt: captchaAnswer
            }), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": tempCookie,
                    "Referer": `${BASE_URL}/login`
                },
                maxRedirects: 0,
                validateStatus: () => true
            }
        );

        // Update cookie
        if (r2.headers['set-cookie']) {
            const newCookie = r2.headers['set-cookie'].find(c => c.includes('PHPSESSID'));
            if (newCookie) STATE.cookie = newCookie.split(';')[0];
        } else if (tempCookie) {
            STATE.cookie = tempCookie;
        }

        // Step 4: Get Dashboard to extract sesskey
        const r3 = await axios.get(DASHBOARD_URL, {
            headers: {
                ...COMMON_HEADERS,
                "Cookie": STATE.cookie,
                "Referer": `${BASE_URL}/agent/`
            }
        });

        const key = extractSessKey(r3.data);
        if (key) {
            STATE.sessKey = key;
            STATE.lastLoginTime = now;
            console.log(`✅ Login Success | SessKey: ${key}`);
        } else {
            throw new Error("Failed to extract sesskey from dashboard");
        }

    } catch (error) {
        console.error("❌ Login failed:", error.message);
        STATE.cookie = null;
        STATE.sessKey = null;
    } finally {
        STATE.isLoggingIn = false;
    }
}

// Auto refresh every 2 minutes
setInterval(() => performLogin(), 120000);

// ====================== MAIN ROUTE ======================
router.get('/', async (req, res) => {
    const { type } = req.query;

    if (!type || !['numbers', 'sms'].includes(type)) {
        return res.status(400).json({
            error: "Invalid type. Use ?type=numbers or ?type=sms"
        });
    }

    if (!isSessionValid()) {
        await performLogin(true);
        if (!isSessionValid()) {
            return res.status(503).json({ error: "Login failed. Try again later." });
        }
    }

    const ts = Date.now();
    const today = getTodayDate();
    let targetUrl = "";
    let referer = "";

    if (type === 'numbers') {
        referer = `${BASE_URL}/agent/MySMSNumbers`;
        targetUrl = `\( {BASE_URL}/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1&_= \){ts}`;
    } 
    else if (type === 'sms') {
        referer = `${BASE_URL}/agent/SMSCDRReports`;
        targetUrl = `\( {BASE_URL}/agent/res/data_smscdr.php?fdate1= \){today}%2000:00:00&fdate2=\( {today}%2023:59:59&frange=&fclient=&fnum=&fcli=&fgdate=&fgmonth=&fgrange=&fgclient=&fgnumber=&fgcli=&fg=0&sesskey= \){STATE.sessKey}&sEcho=2&iDisplayStart=0&iDisplayLength=-1&_=${ts}`;
    }

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                ...COMMON_HEADERS,
                "Cookie": STATE.cookie,
                "Referer": referer
            },
            timeout: 20000
        });

        // Check if session expired (HTML response)
        if (typeof response.data === 'string' && 
            (response.data.includes('<html') || response.data.toLowerCase().includes('login'))) {
            
            console.log("⚠️ Session expired, refreshing...");
            STATE.cookie = null;
            STATE.sessKey = null;
            await performLogin(true);
            return res.status(503).json({ message: "Session refreshed. Please try again." });
        }

        res.set('Content-Type', 'application/json');
        res.send(response.data);

    } catch (error) {
        console.error(`❌ Error fetching ${type}:`, error.message);

        if (error.response && [403, 401].includes(error.response.status)) {
            STATE.cookie = null;
            STATE.sessKey = null;
            await performLogin(true);
            return res.status(503).json({ message: "Session expired. Retrying..." });
        }

        res.status(500).json({ 
            error: "Failed to fetch data",
            details: error.message 
        });
    }
});

// Initial login
performLogin();

module.exports = router;
