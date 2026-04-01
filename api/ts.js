const express = require('express');
const axios = require('axios');
const router = express.Router();

// ====================== CONFIG ======================
const CREDENTIALS = {
    username: "Alisindhi077",
    password: "Alisindhi-077"
};

const BASE_URL = "https://www.timesms.org";

const COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 15; RMX3930 Build/AP3A.240905.015.A2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.120 Mobile Safari/537.36",
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-PK,en-US;q=0.9,en;q=0.8",
    "Upgrade-Insecure-Requests": "1",
    "X-Requested-With": "mark.via.gp",
    "Accept-Encoding": "gzip, deflate, br, zstd"
};

// ====================== STATE ======================
const STATE = {
    cookie: null,
    sessKey: "Q05RR0FST0JCUQ==",   // Tumhara working sesskey (fallback)
    isLoggingIn: false,
    lastLoginTime: Date.now()
};

// ====================== HELPERS ======================
function getTodayDate() {
    const d = new Date();
    return `\( {d.getFullYear()}- \){String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ====================== LOGIN ======================
async function performLogin() {
    if (STATE.isLoggingIn) return;
    STATE.isLoggingIn = true;

    console.log("🔄 Login attempt in progress...");

    try {
        const instance = axios.create({ timeout: 20000, withCredentials: true });

        // GET Login
        const r1 = await instance.get(`${BASE_URL}/login`, {
            headers: { ...COMMON_HEADERS, "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" }
        });

        let tempCookie = r1.headers['set-cookie']?.find(c => c.includes('PHPSESSID'))?.split(';')[0] || "";

        // Captcha
        const captchaMatch = r1.data.match(/What is (\d+)\s*\+\s*(\d+)\s*=\s*\?/i);
        const capt = captchaMatch ? parseInt(captchaMatch[1]) + parseInt(captchaMatch[2]) : 0;

        // POST Signin
        const r2 = await instance.post(`${BASE_URL}/signin`, 
            `username=\( {CREDENTIALS.username}&password= \){CREDENTIALS.password}&capt=${capt}`,
            {
                headers: {
                    ...COMMON_HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Origin": BASE_URL,
                    "Referer": `${BASE_URL}/login`,
                    "Sec-Fetch-Site": "same-origin",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Dest": "document",
                    "Cookie": tempCookie
                }
            }
        );

        // Update cookie
        if (r2.headers['set-cookie']) {
            const newCookie = r2.headers['set-cookie'].find(c => c.includes('PHPSESSID'));
            if (newCookie) STATE.cookie = newCookie.split(';')[0];
        } else if (tempCookie) {
            STATE.cookie = tempCookie;
        }

        console.log("✅ Cookie updated");

    } catch (e) {
        console.error("Login error:", e.message);
    } finally {
        STATE.isLoggingIn = false;
    }
}

setInterval(performLogin, 180000);

// ====================== MAIN ROUTE ======================
router.get('/', async (req, res) => {
    const { type } = req.query;

    if (!['numbers', 'sms'].includes(type)) {
        return res.status(400).json({ error: "Use ?type=numbers or ?type=sms" });
    }

    const ts = Date.now();
    const today = getTodayDate();
    let targetUrl = "";
    let referer = "";

    if (type === 'numbers') {
        referer = `${BASE_URL}/agent/MySMSNumbers`;
        targetUrl = `\( {BASE_URL}/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1&_= \){ts}`;
    } else {
        referer = `${BASE_URL}/agent/SMSCDRReports`;
        targetUrl = `\( {BASE_URL}/agent/res/data_smscdr.php?fdate1= \){today}%2000:00:00&fdate2=\( {today}%2023:59:59&frange=&fclient=&fnum=&fcli=&fgdate=&fgmonth=&fgrange=&fgclient=&fgnumber=&fgcli=&fg=0&sesskey= \){STATE.sessKey}&sEcho=2&iColumns=9&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&_=${ts}`;
    }

    try {
        console.log(`Fetching ${type} data...`);

        const response = await axios.get(targetUrl, {
            headers: {
                ...COMMON_HEADERS,
                "Referer": referer,
                "Sec-Fetch-Site": "same-origin",
                "Cookie": STATE.cookie || "PHPSESSID=86b02e0130890dbbe7c794a3a5c4e080"
            },
            timeout: 25000
        });

        if (typeof response.data === 'string' && 
            (response.data.includes("Direct Script Access Not Allowed") || response.data.includes("<html"))) {
            return res.status(403).json({ 
                error: "Access blocked",
                message: "Try updating sesskey manually or check login"
            });
        }

        res.set('Content-Type', 'application/json');
        res.send(response.data);

    } catch (error) {
        console.error(`Error in ${type}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

performLogin(); // initial login

module.exports = router;
