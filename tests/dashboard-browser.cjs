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
        await verifyF15ShiftRecovery(browser);
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

async function verifyF15ShiftRecovery(browser) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const dashboard = await browser.newPage({ viewport });
        const errors = [];
        let mode = 'b-only';
        let requests = 0;
        let attempts = { A: 0, B: 0 };
        dashboard.on('pageerror', error => errors.push(error.message));
        await dashboard.addInitScript(() => {
            const nativeTimeout = window.setTimeout.bind(window);
            window.setTimeout = (fn, delay, ...args) => nativeTimeout(fn,
                delay === 45000 && window.f15TestTimeout ? 200 : delay === 1000 ? 1 : delay, ...args);
        });
        const bRecord = {
            ...row('BBSKINF15', 'B', 41.9), total: 628, man: 15, ct_total: 85.95,
            recordDate: '2026-09-27T17:00:00Z', createdAt: '2026-09-29T06:18:22.302Z',
            layout: { prep: 3, block: 8, inspec: 2, pack: 2, op: 0 },
            cycle_detail: { prep: 25.2, arrange: 28.5, machine: 1.25, inspec: 15.5, pack: 15.5 }
        };
        await dashboard.route('https://script.google.com/**', route => {
            assert.equal(route.request().method(), 'GET'); requests++;
            const shift = new URL(route.request().url()).searchParams.get('shift');
            attempts[shift]++;
            if (mode === 'timeout' && shift === 'A' && attempts[shift] === 1) return;
            if (mode === 'failed' || (mode === 'partial' && shift === 'A') ||
                (mode === 'recover' && shift === 'A' && attempts[shift] === 1)) {
                return route.fulfill({ status: 503, body: 'unavailable' });
            }
            const records = mode === 'empty' || (mode === 'b-only' && shift === 'A') ||
                (mode === 'a-only' && shift === 'B') ? [] : [{ ...bRecord, shift }];
            const body = Object.assign({ _records: records }, Object.fromEntries(records.map(r => [r.trial + '__' + r.shift, r])));
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await dashboard.goto(urlFor('BB Skin 35G F15 Dashboard.html'));
        await dashboard.locator('#dataStatus').filter({ hasText: 'อัปเดตแล้ว' }).waitFor({ state: 'attached' });
        const headers = async () => {
            assert.match(await dashboard.locator('#header-max-yield').innerText(), /628/);
            assert.match(await dashboard.locator('#header-current-yield').innerText(), /628/);
            assert.match(await dashboard.locator('#header-current-man').innerText(), /15/);
            assert.match(await dashboard.locator('#header-actual-yield').innerText(), /1,800/);
        };
        const populated = async shift => {
            await headers();
            assert.match(await dashboard.locator('#header-selected-round').innerText(), new RegExp('Shift ' + shift, 'i'));
            assert.equal(await dashboard.locator('#kpi-prod').innerText(), '41.9');
            assert.equal(await dashboard.locator('#kpi-eff').innerText(), '34.92%');
            assert.match(await dashboard.locator('#kpi-cycle').innerText(), /85.95/);
            assert.equal(await dashboard.locator('#kpi-total').innerText(), '628');
            assert.match(await dashboard.locator('#tableBody').innerText(), /41.9/);
            assert.match(await dashboard.locator('#table-summary-latest-label').innerText(), new RegExp('Shift ' + shift, 'i'));
            assert.match(await dashboard.locator('#dataStatus').innerText(), /อัปเดตแล้ว.*1 รายการ/);
            assert.equal(await dashboard.locator('#gapComparisonSelect').isEnabled(), true);
            assert.equal(await dashboard.locator('#tableRoundSelect').isEnabled(), true);
            assert.match(await dashboard.locator('#executiveGapTableBody').innerText(), /-65.1%/);
            assert.equal(await dashboard.evaluate(() => [trendChart, cycleChart, prodJourneyChart, bottleneckChart].filter(Boolean).length), 4);
        };
        const emptyShift = async shift => {
            await headers();
            assert.equal(await dashboard.locator('#kpi-prod').innerText(), '--');
            assert.equal(await dashboard.locator('#dataStatus').innerText(), 'ยังไม่มีข้อมูลสำหรับ Shift ' + shift);
            assert.equal(await dashboard.locator('#gapComparisonSelect').isEnabled(), false);
            assert.equal(await dashboard.locator('#tableRoundSelect').isEnabled(), false);
        };
        const initialRequests = requests;
        for (let cycle = 0; cycle < 3; cycle++) {
            await dashboard.locator('#shiftFilterSelect').selectOption('A'); await emptyShift('A');
            await dashboard.locator('#shiftFilterSelect').selectOption('B'); await populated('B');
            await dashboard.locator('#shiftFilterSelect').selectOption('all'); await populated('B');
        }
        assert.equal(requests, initialRequests, 'Filters must use loaded data, not call GAS again');
        await dashboard.waitForFunction(() => [trendChart, cycleChart, prodJourneyChart, bottleneckChart].every(chart =>
            chart && chart.getDatasetMeta(0).data.every(point => Math.abs(point.y - point.getProps(['y'], true).y) < 0.1)));
        await dashboard.screenshot({ path: path.join(root, 'output/f15-shift-recovery-' + viewport.width + '.png') });
        mode = 'empty'; await dashboard.evaluate(() => loadData());
        assert.match(await dashboard.locator('#dataStatus').innerText(), /ในทั้งสองกะ/);
        assert.match(await dashboard.locator('#header-current-yield').innerText(), /--/);
        mode = 'failed'; await dashboard.evaluate(() => loadData());
        assert.match(await dashboard.locator('#dataStatus').innerText(), /โหลดข้อมูลไม่สำเร็จ/);
        mode = 'a-only'; await dashboard.evaluate(() => loadData());
        await dashboard.locator('#shiftFilterSelect').selectOption('B'); await emptyShift('B');
        await dashboard.locator('#shiftFilterSelect').selectOption('A'); await populated('A');
        const reload = async nextMode => {
            mode = nextMode; attempts = { A: 0, B: 0 };
            await dashboard.getByRole('button', { name: 'โหลดใหม่', exact: true }).click();
            await dashboard.waitForFunction(() => !isLoadingData);
            assert.equal(await dashboard.locator('#reloadData').isEnabled(), true);
        };
        await dashboard.locator('#shiftFilterSelect').selectOption('all');
        await reload('recover');
        assert.deepEqual(attempts, { A: 2, B: 1 });
        assert.match(await dashboard.locator('#dataStatus').innerText(), /อัปเดตแล้ว.*2 รายการ/);
        assert.equal(await dashboard.locator('.data-status-bar').getAttribute('data-state'), 'success');
        await dashboard.evaluate(() => { window.f15TestTimeout = true; });
        await reload('timeout');
        assert.deepEqual(attempts, { A: 2, B: 1 });
        assert.match(await dashboard.locator('#dataStatus').innerText(), /อัปเดตแล้ว.*2 รายการ/);
        await dashboard.evaluate(() => { window.f15TestTimeout = false; });
        await reload('partial');
        assert.deepEqual(attempts, { A: 2, B: 1 });
        assert.match(await dashboard.locator('#dataStatus').innerText(), /ข้อมูลยังไม่ครบทั้งสองกะ.*Shift A/);
        assert.equal(await dashboard.locator('#kpi-prod').innerText(), '41.9');
        await dashboard.locator('#shiftFilterSelect').selectOption('A');
        assert.match(await dashboard.locator('#dataStatus').innerText(), /ยังโหลดข้อมูล Shift A ไม่สำเร็จ/);
        assert.doesNotMatch(await dashboard.locator('#dataStatus').innerText(), /ยังไม่มีข้อมูลสำหรับ Shift A/);
        assert.equal(await dashboard.locator('#kpi-prod').innerText(), '--');
        // Retrying with A still unavailable must not show B's KPI under an A filter.
        await reload('partial');
        assert.equal(await dashboard.locator('#shiftFilterSelect').inputValue(), 'A');
        assert.equal(await dashboard.locator('#kpi-prod').innerText(), '--');
        await dashboard.locator('#shiftFilterSelect').selectOption('B');
        await reload('failed');
        assert.deepEqual(attempts, { A: 2, B: 2 });
        assert.equal(await dashboard.locator('#kpi-prod').innerText(), '41.9');
        assert.match(await dashboard.locator('#dataStatus').innerText(), /ข้อมูลก่อนหน้า \(ยังไม่ได้อัปเดต\)/);
        await dashboard.locator('#shiftFilterSelect').selectOption('all');
        assert.match(await dashboard.locator('#dataStatus').innerText(), /ข้อมูลก่อนหน้า \(ยังไม่ได้อัปเดต\)/);
        await dashboard.screenshot({ path: path.join(root, 'output/f15-data-warning-' + viewport.width + '.png') });
        await reload('valid');
        assert.doesNotMatch(await dashboard.locator('#dataStatus').innerText(), /ก่อนหน้า|ไม่สำเร็จ/);
        assert.match(await dashboard.locator('#dataStatus').innerText(), /2 รายการ/);
        assert.equal(await dashboard.locator('#dataStatus').isVisible(), true);
        const statusBar = await dashboard.locator('.data-status-bar').boundingBox();
        const retryButton = await dashboard.locator('#reloadData').boundingBox();
        assert.ok(retryButton.height >= 44 && retryButton.x >= statusBar.x);
        assert.ok(retryButton.x + retryButton.width <= viewport.width);
        await dashboard.waitForFunction(() => [trendChart, cycleChart, prodJourneyChart, bottleneckChart].every(chart =>
            chart && chart.getDatasetMeta(0).data.every(point => Math.abs(point.y - point.getProps(['y'], true).y) < 0.1)));
        await dashboard.screenshot({ path: path.join(root, 'output/f15-data-loading-' + viewport.width + '.png') });
        assert.deepEqual(errors, []);
        console.log('PASS F15 ' + viewport.width + ': shift recovery, timeout/503 retry, partial error vs empty, labelled stale refresh and retry button; GET only');
        await dashboard.close();
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
