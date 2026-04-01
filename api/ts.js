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
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
};

// ====================== STATE ======================
const STATE = {
    cookie: "",
    sessKey: "",
    lastLoginTime: 0
};

// ====================== LOGIN FUNCTION ======================
async function loginAndGetSession() {
    console.log("🔐 Logging in...");

    try {
        const response = await axios.post(
            `${BASE_URL}/login`,
            new URLSearchParams({
                username: CREDENTIALS.username,
                password: CREDENTIALS.password
            }),
            {
                headers: {
                    ...COMMON_HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                maxRedirects: 0,
                validateStatus: status => status < 500
            }
        );

        // ✅ Extract cookie
        const cookies = response.headers['set-cookie'];
        if (!cookies) throw new Error("No cookie received");

        STATE.cookie = cookies.map(c => c.split(';')[0]).join('; ');

        // ✅ Get sesskey from dashboard page
        const dashboard = await axios.get(`${BASE_URL}/agent/MySMSNumbers`, {
            headers: {
                ...COMMON_HEADERS,
                "Cookie": STATE.cookie
            }
        });

        const match = dashboard.data.match(/sesskey=([A-Za-z0-9=]+)/);
        if (!match) throw new Error("sesskey not found");

        STATE.sessKey = match[1];
        STATE.lastLoginTime = Date.now();

        console.log("✅ Login success");
    } catch (err) {
        console.error("❌ Login failed:", err.message);
        throw err;
    }
}

// ====================== DATE ======================
function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ====================== MAIN ROUTE ======================
router.get('/', async (req, res) => {
    const { type } = req.query;

    if (!type || !['numbers', 'sms'].includes(type)) {
        return res.status(400).json({ error: "Use ?type=numbers or ?type=sms" });
    }

    try {
        // 🔄 Auto login if needed (every 10 min)
        if (!STATE.cookie || Date.now() - STATE.lastLoginTime > 10 * 60 * 1000) {
            await loginAndGetSession();
        }

        const ts = Date.now();
        const today = getTodayDate();

        let url = "";
        let referer = "";

        if (type === "numbers") {
            referer = `${BASE_URL}/agent/MySMSNumbers`;

            url = `${BASE_URL}/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1&_=${ts}`;
        } else {
            referer = `${BASE_URL}/agent/SMSCDRReports`;

            url = `${BASE_URL}/agent/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&sesskey=${STATE.sessKey}&sEcho=2&iDisplayStart=0&iDisplayLength=-1&_=${ts}`;
        }

        console.log("🌐 URL:", url);

        const response = await axios.get(url, {
            headers: {
                ...COMMON_HEADERS,
                "Referer": referer,
                "Cookie": STATE.cookie
            }
        });

        // 🚨 If blocked → retry login once
        if (typeof response.data === "string" && response.data.includes("Direct Script Access")) {
            console.log("⚠️ Session expired, retrying login...");
            await loginAndGetSession();

            const retry = await axios.get(url, {
                headers: {
                    ...COMMON_HEADERS,
                    "Referer": referer,
                    "Cookie": STATE.cookie
                }
            });

            return res.send(retry.data);
        }

        res.send(response.data);

    } catch (err) {
        res.status(500).json({
            error: "Failed",
            message: err.message
        });
    }
});

module.exports = router;
