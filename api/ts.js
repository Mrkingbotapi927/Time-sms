const express = require('express');
const puppeteer = require('puppeteer');

const router = express.Router();

const BASE_URL = "https://www.timesms.org";

const CREDENTIALS = {
    username: "Alisindhi077",
    password: "Alisindhi-077"
};

let browser;
let page;

// ================= INIT =================
async function initBrowser() {
    browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    page = await browser.newPage();

    await page.setUserAgent(
        "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/146.0 Mobile Safari/537.36"
    );

    console.log("🚀 Browser started");
}

// ================= LOGIN =================
async function login() {
    console.log("🔐 Logging in...");

    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });

    await page.type('input[name="username"]', CREDENTIALS.username);
    await page.type('input[name="password"]', CREDENTIALS.password);

    await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: "networkidle2" })
    ]);

    console.log("✅ Login success");
}

// ================= ROUTE =================
router.get('/', async (req, res) => {
    const { type } = req.query;

    if (!type || !['numbers', 'sms'].includes(type)) {
        return res.json({ error: "use ?type=numbers or ?type=sms" });
    }

    try {
        if (!browser) {
            await initBrowser();
            await login();
        }

        let url = "";

        if (type === "numbers") {
            url = `${BASE_URL}/agent/MySMSNumbers`;
        } else {
            url = `${BASE_URL}/agent/SMSCDRReports`;
        }

        await page.goto(url, { waitUntil: "networkidle2" });

        // Wait for table/data load
        await page.waitForTimeout(3000);

        // Extract page content OR API response
        const data = await page.evaluate(() => {
            return document.body.innerText;
        });

        res.send({
            success: true,
            type,
            data
        });

    } catch (err) {
        console.log("❌ Error:", err.message);

        res.json({
            error: "Failed",
            message: err.message
        });
    }
});

module.exports = router;
