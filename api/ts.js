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
    "X-Requested-With": "mark.via.gp"
};

// ====================== STATE ======================
const STATE = {
    cookie: null,
    sessKey: "Q05RR0FST0JCUQ==",   // Working sesskey (manual)
    isLoggingIn: false
};

// ====================== HELPERS ======================
function getTodayDate() {
    const d = new Date();
    return `\( {d.getFullYear()}- \){String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ====================== MAIN ROUTE ======================
router.get('/', async (req, res) => {
    const { type } = req.query;

    // URL validation
    if (!type || !['numbers', 'sms'].includes(type)) {
        return res.status(400).json({ 
            error: "Invalid type",
            message: "Use ?type=numbers or ?type=sms",
            example: "/api/ts?type=sms"
        });
    }

    console.log(`📥 Request received → type: ${type}`);

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
        console.log(`→ Fetching from: ${targetUrl.substring(0, 100)}...`);

        const response = await axios.get(targetUrl, {
            headers: {
                ...COMMON_HEADERS,
                "Referer": referer,
                "Sec-Fetch-Site": "same-origin",
                "Cookie": STATE.cookie || "PHPSESSID=86b02e0130890dbbe7c794a3a5c4e080"
            },
            timeout: 30000
        });

        // Check for common errors
        if (typeof response.data === 'string') {
            if (response.data.includes("Direct Script Access Not Allowed")) {
                return res.status(403).json({ 
                    error: "Access Blocked",
                    message: "Site ne direct access block kar diya hai"
                });
            }
            if (response.data.includes("<html")) {
                return res.status(503).json({ 
                    error: "Session expired",
                    message: "Login refresh karna pad sakta hai"
                });
            }
        }

        console.log(`✅ ${type} data fetched successfully`);
        res.set('Content-Type', 'application/json');
        res.send(response.data);

    } catch (error) {
        console.error(`❌ Error fetching ${type}:`, error.message);
        res.status(500).json({ 
            error: "Failed to fetch data",
            details: error.message 
        });
    }
});

module.exports = router;
