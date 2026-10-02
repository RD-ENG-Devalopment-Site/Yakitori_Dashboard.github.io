// Local overlay fixture only: no production writes, no core React rebuild claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require('playwright');
async function run() {
    const script = fs.readFileSync(require.resolve('../yakitori-machine-3d-viewer/breakdown-sync.js'));
    const server = http.createServer((req, res) => {
        if (req.url === '/sync.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); return res.end(script); }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<html><head></head><body><main class="viewer-stage"><button class="machine-marker" style="background:green">M1</button><button class="machine-marker">M2</button><button class="machine-marker">M3</button><button class="machine-marker">M4</button></main><script src="/sync.js"></script></body></html>');
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage(); let mode = 'records';
        await page.addInitScript(() => { window.YakitoriRuntime = { buildApiUrl: () => 'https://script.google.com/macros/s/mock/exec?action=read_breakdown' }; });
        await page.route('https://script.google.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(mode === 'error' ? { status: 'error', _records: [] } : { status: 'success', _records: mode === 'empty' ? [] : [{ station: 'M1', eventId: 'old-open', breakdownStatus: 'Open', createdAt: '2020-01-01', symptom: '<img src=x onerror="window.pwned=1"> เครื่องขัดข้อง' }, { station: 'M1', eventId: 'new-closed', breakdownStatus: 'Closed', createdAt: '2026-01-01', symptom: 'closed latest' }, { station: 'M1', breakdownStatus: 'Monitoring', createdAt: '2026-02-01', symptom: 'monitoring newer' }, { station: 'M2', breakdownStatus: 'Open', voidedAt: '2026-01-01', symptom: 'voided' }] }) }));
        await page.goto('http://127.0.0.1:' + server.address().port);
        await page.waitForSelector('#breakdown-status-panel');
        assert.match(await page.locator('[data-breakdown-machine="M1"]').textContent(), /<img.*Breakdown เปิดอยู่/);
        assert.equal(await page.locator('#breakdown-status-panel img').count(), 0);
        assert.equal(await page.evaluate(() => window.pwned), undefined);
        assert.equal(await page.locator('.machine-marker').first().evaluate(el => el.style.background), 'green');
        assert.match(await page.locator('[data-breakdown-machine="M2"]').textContent(), /ไม่มีเหตุที่เปิดอยู่/);
        mode = 'error'; await page.locator('#breakdown-refresh').click(); await page.waitForFunction(() => document.querySelector('#breakdown-status-panel').textContent.includes('ข้อมูลเก่า'));
        assert.match(await page.locator('[data-breakdown-machine="M1"]').textContent(), /Breakdown เปิดอยู่/);
        mode = 'empty'; await page.locator('#breakdown-refresh').click(); await page.waitForFunction(() => !document.querySelector('#breakdown-status-panel').textContent.includes('<img'));
        assert.match(await page.locator('[data-breakdown-machine="M1"]').textContent(), /ไม่มีเหตุที่เปิดอยู่/);
        assert.equal(await page.locator('.machine-marker').first().getAttribute('data-breakdown-status'), null);
        console.log('PASS overlay active precedence, literal HTML, untouched Layout dot, void exclusion, stale retention and confirmed empty');
    } finally { await browser.close(); await new Promise(r => server.close(r)); }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
