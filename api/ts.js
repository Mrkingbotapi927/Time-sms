const express = require('express');
const axios = require('axios');
const router = express.Router();

// ====================== CONFIG ======================
const BASE_URL = "https://www.timesms.org";

const COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9"
};

// ====================== GLOBAL STATE ======================
const STATE = {
    cookie: null,
    sessKey: null,
    isLoggingIn: false,
    lastLoginTime: 0
};
// ====================== DATE ======================
function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ====================== ROUTE ======================
router.get('/', async (req, res) => {
    const { type } = req.query;

    if (!type || !['numbers', 'sms'].includes(type)) {
        return res.status(400).json({
            error: "Use ?type=numbers or ?type=sms"
        });
    }

    try {
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

        // block check
        if (typeof response.data === "string" && response.data.includes("Direct Script Access")) {
            return res.status(403).json({
                error: "Session expired",
                message: "Update cookie + sesskey again"
            });
        }

        res.send(response.data);

    } catch (err) {
        console.error("❌ Error:", err.message);

        res.status(500).json({
            error: "Failed",
            message: err.message
        });
    }
});

module.exports = router;
