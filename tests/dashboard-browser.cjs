// Requires Playwright and Edge. Run with: node tests/dashboard-browser.cjs
// All GAS requests are intercepted; this suite never writes production data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const siteRoot = process.env.YAKITORI_SITE_ROOT || root;
const urlFor = file => process.env.YAKITORI_SITE_ORIGIN
    ? new URL(file, process.env.YAKITORI_SITE_ORIGIN).href
    : 'file:///' + siteRoot.replace(/\\/g, '/') + '/' + file;
const row = (line, shift, prod, trial = '1') => ({
    line, shift, prod, trial, eff: 999, man: 10, total: prod * 10,
    recordDate: '2026-09-30', createdAt: '2026-09-30T01:00:00Z',
    layout: { prep: 2, block: 4, inspec: 2, pack: 1, op: 1 },
    cycle_detail: { prep: 0, arrange: 10, machine: 1, inspec: 4, pack: 5 }
});
const names = {
    BL23gR15_M1_DataLog: 'BL23G_M1', BL23gR15_DataLog: 'BL23G_M2',
    GZ40gS18_DataLog: 'GZ40', GZ30gR15_DataLog: 'GZ30'
};
const feed = (line, shift) => {
    const records = shift ? [row(line, shift, shift === 'A' ? 40.7 : 77.6)] :
        [row(line, 'A', 60), row(line, 'A', 78, '2'), row(line, 'B', 65)];
    return Object.assign({ _records: records }, Object.fromEntries(records.map(r => [r.trial + '_' + r.shift, r])));
};

async function run() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = [];
        let mode = 'initial';
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://script.google.com/**', async route => {
            assert.equal(route.request().method(), 'GET');
            const url = new URL(route.request().url());
            const sheet = url.searchParams.get('sheet');
            const project = url.searchParams.get('projectKey');
            const shift = url.searchParams.get('shift');
            if (mode === 'initial') await new Promise(resolve => setTimeout(resolve,
                project === 'NECKSKINR15' && shift === 'B' ? 3000 : 100));
            if (mode === 'failed' && project === 'NECKSKINR15' && shift === 'B') {
                return route.fulfill({ status: 503, body: 'unavailable' });
            }
            const body = !sheet || (mode === 'empty' && project === 'NECKSKINR15' && shift === 'B')
                ? { _records: [] }
                : feed(mode === 'wrong' && project === 'BBSKINF15' ? 'OTHER' : project || names[sheet], shift);
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.goto(urlFor('index.html'));
        const neck = page.locator('#progressPanelList [data-line="neckskin"]');
        await page.waitForFunction(() => document.querySelector('[data-line="neckskin"]')?.innerText.includes('40.7'),
            {}, { timeout: 25000 });
        assert.match(await neck.innerText(), /กำลังโหลดข้อมูล/);
        console.log('PASS progressive: NECK A visible while B still pending');
        await page.waitForFunction(() => typeof dashboardLoading !== 'undefined' && !dashboardLoading);
        await page.waitForTimeout(75);
        assert.deepEqual(errors, []);
        assert.equal(await page.locator('#progressPanelList [data-line]').count(), 7);
        assert.equal(await page.locator('#compareBody [data-line]').count(), 7);
        assert.match(await neck.innerText(), /77.6/);
        mode = 'valid';
        await page.evaluate(() => {
            window.auditRoot = document.querySelector('#progressPanelList').firstElementChild;
            window.auditMutationCount = 0;
            new MutationObserver(rows => window.auditMutationCount += rows.length).observe(
                document.querySelector('#progressPanelList'),
                { childList: true, subtree: true, attributes: true, characterData: true });
        });
        const refresh = async () => {
            await page.evaluate(() => renderDashboardData());
            await page.waitForTimeout(75);
        };
        for (let round = 0; round < 3; round++) await refresh();
        assert.equal(await page.evaluate(() => window.auditMutationCount), 0);
        assert.equal(await page.evaluate(() =>
            window.auditRoot === document.querySelector('#progressPanelList').firstElementChild), true);
        console.log('PASS three unchanged refreshes: zero progress DOM mutations');
        mode = 'failed';
        await refresh();
        assert.match(await neck.innerText(), /77.6/);
        assert.match(await neck.innerText(), /ข้อมูลก่อนหน้า/);
        mode = 'empty';
        await refresh();
        assert.doesNotMatch(await neck.innerText(), /77.6/);
        assert.match(await neck.innerText(), /ยังไม่มีข้อมูล/);
        console.log('PASS stale fallback and successful empty');
        mode = 'wrong';
        await refresh();
        assert.match(await page.locator('[data-line="bbskinf15"]').first().innerText(), /ข้อมูลก่อนหน้า/);
        assert.ok(!await page.evaluate(() =>
            dashboardSnapshot.results.find(x => x.prefix === 'bbskinf15').records.some(r => r.line === 'OTHER')));
        console.log('PASS wrong product rejected, valid stale records preserved');
        await page.evaluate(() => { setActiveShiftFilter('A'); renderDashboardSnapshot(true); });
        assert.doesNotMatch(await neck.innerText(), /Shift B/);
        await page.evaluate(() => {
            setActiveShiftFilter('all');
            dateRange = { from: '2026-10-01', to: '2026-10-02' };
            renderDashboardSnapshot(true);
        });
        assert.doesNotMatch(await neck.innerText(), /40.7/);
        await page.evaluate(() => { dateRange = { from: '', to: '' }; renderDashboardSnapshot(true); });
        assert.match(await neck.innerText(), /40.7/);
        console.log('PASS shift/date filters and restoration');
        fs.mkdirSync(path.join(root, 'output'), { recursive: true });
        await page.locator('#progressPanelList').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(root, 'output/dashboard-recheck-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#sidebarToggle').click();
        await page.waitForTimeout(350);
        await page.locator('#progressPanelList').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        assert.ok(await page.evaluate(() => {
            const cards = document.querySelector('[data-line="neckskin"]').children;
            const a = cards[1].getBoundingClientRect();
            const b = cards[2].getBoundingClientRect();
            return b.left >= a.right && a.width >= 170 && b.width >= 170;
        }), 'Mobile shift columns must not overlap');
        await page.screenshot({ path: path.join(root, 'output/dashboard-recheck-mobile.png') });
        assert.deepEqual(errors, []);
        await page.close();
        console.log('PASS home desktop/mobile: no overflow or runtime errors');
        for (const file of [
            'BB Skin Dashboard.html', 'BB Skin 35G F15 Dashboard.html', 'Neck Skin 40G R15 Dashboard.html',
            'BL23g Dashboard/BL23gM1_Main Dashboard_Yakitori.html',
            'BL23g Dashboard/BL23g_Main Dashboard_Yakitori.html'
        ]) {
            const dashboard = await browser.newPage();
            const dashboardErrors = [];
            dashboard.on('pageerror', error => dashboardErrors.push(error.message));
            await dashboard.route('https://script.google.com/**', route => {
                assert.equal(route.request().method(), 'GET');
                const url = new URL(route.request().url());
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
                    feed(url.searchParams.get('projectKey'), url.searchParams.get('shift'))) });
            });
            await dashboard.goto(urlFor(file));
            await dashboard.waitForFunction(() => document.querySelector('#table-summary-eff')?.textContent.includes('%'),
                {}, { timeout: 25000 });
            assert.match(await dashboard.locator('#table-summary-target').innerText(), file.startsWith('BL') ? /130/ : /120/);
            await dashboard.evaluate(() => setShiftFilter('B'));
            assert.match(await dashboard.locator('#table-summary-latest-label').innerText(), /Shift B/);
            assert.deepEqual(dashboardErrors, []);
            console.log('PASS DOM summary and Shift B: ' + file);
            await dashboard.close();
        }
        const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
            .split('\n').filter(file => /\.(html|js)$/.test(file));
        let count = 0;
        for (const file of files) {
            const source = fs.readFileSync(path.join(root, file), 'utf8');
            if (file.endsWith('.js')) {
                if (source.includes('import.meta') || /^\s*(import|export)\s/m.test(source)) {
                    const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' });
                    assert.equal(result.status, 0, 'Module syntax: ' + file);
                } else new vm.Script(source, { filename: file });
            } else {
                for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
                    if (!/\bsrc\s*=|type\s*=\s*["'](?:module|application\/)/i.test(match[1])) {
                        new vm.Script(match[2], { filename: file });
                        count++;
                    }
                }
            }
        }
        console.log(JSON.stringify({ staticFiles: files.length, inlineScripts: count, syntaxErrors: 0 }));
    } finally {
        await browser.close();
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
