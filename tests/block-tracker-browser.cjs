// Playwright + Edge. GAS is mocked; no production POST is permitted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const siteRoot = path.resolve(process.env.YAKITORI_SITE_ROOT || root);
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const safe = { recordId: 'BT-SYNTHETIC', name: 'Tail Block (S18)', onLineUsed: 13, onLineDamaged: 1, spareAvailable: 2, spareDamaged: 0, image: png };
const injectedName = '<em data-injected="yes">literal</em><img src=x onerror="window.xssExecuted=true">';
const malicious = { ...safe, name: injectedName, image: 'data:image/svg+xml;base64,PHN2Zz4=', onLineUsed: '" autofocus onfocus="window.xssExecuted=true' };

async function run() {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const file = path.resolve(siteRoot, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(siteRoot + path.sep)) { response.writeHead(404).end(); return; }
        if (url.searchParams.has('baseline')) {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(execFileSync('git', ['show', 'HEAD:' + path.relative(siteRoot, file).replace(/\\/g, '/')], { cwd: root }));
            return;
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
        response.setHeader('Content-Type', type + (type.startsWith('text/') ? '; charset=utf-8' : ''));
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    let writes = 0;
    try {
        async function pageFor(file, cached = [safe], remote = cached) {
            const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            await context.addInitScript(records => localStorage.setItem('apex-block-tracker', JSON.stringify(records)), cached);
            await context.route('**/yakitori-recording-auth.js*', route => route.fulfill({ contentType: 'text/javascript', body:
                'window.YakitoriAuth={isAuthenticated:()=>true,mountSessionControls(){},requireSession(){}};' }));
            let release;
            const wait = new Promise(resolve => { release = resolve; });
            await context.route('https://script.google.com/**', async route => {
                if (route.request().method() !== 'GET') { writes++; await route.abort(); return; }
                await wait;
                await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', records: remote }) });
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(origin + '/' + file, { waitUntil: 'domcontentloaded' });
            return { page, context, errors, release };
        }

        for (const file of ['BlockTracker.html', 'BlockTrackerRecord.html']) {
            const state = await pageFor(file, [malicious], [malicious]);
            const { page } = state;
            const table = file === 'BlockTracker.html' ? '#inventoryTable' : '#recordTable';
            await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('literal'), table);
            assert.equal(await page.locator(table + ' em, ' + table + ' svg, ' + table + ' [onerror], ' + table + ' [onfocus]').count(), 0);
            assert.ok((await page.locator(table).textContent()).includes(injectedName));
            assert.equal(await page.evaluate(() => window.xssExecuted), undefined);
            if (file === 'BlockTrackerRecord.html') assert.equal(await page.locator('.quick-edit').first().inputValue(), '0');
            state.release();
            await page.waitForTimeout(100);
            assert.equal(await page.locator(table + ' img').count(), 0);
            assert.deepEqual(state.errors, []);
            console.log('PASS cached and remote XSS sinks: ' + file);
            if (file === 'BlockTrackerRecord.html') {
                await page.locator('#name').fill('Synthetic upload');
                for (const field of ['onLineUsed', 'onLineDamaged', 'spareAvailable', 'spareDamaged']) await page.locator('#' + field).fill('1');
                await page.locator('#image').setInputFiles({ name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
                await page.locator('#recordForm button[type="submit"], #recordForm button:not([type])').click();
                assert.ok((await page.locator('#image').evaluate(input => input.validationMessage)).includes('PNG'));
                assert.equal(await page.locator('#recordTable tr').count(), 1);
                assert.equal(writes, 0);
                console.log('PASS invalid image retains form and never submits');
            }
            await state.context.close();
        }

        // Compare the unchanged inventory geometry with committed visual truth.
        const current = await pageFor('BlockTracker.html');
        const baseline = await pageFor('BlockTracker.html?baseline=1');
        current.release(); baseline.release();
        const out = path.join(root, 'output', 'recording-security');
        fs.mkdirSync(out, { recursive: true });
        for (const width of [1440, 390]) {
            for (const state of [baseline, current]) {
                await state.page.setViewportSize({ width, height: 900 });
                await state.page.evaluate(() => document.fonts.ready);
                await state.page.waitForTimeout(150);
            }
            const geometry = page => page.locator('#inventoryTable tr').first().evaluate(row => ({
                width: Math.round(row.getBoundingClientRect().width),
                height: Math.round(row.getBoundingClientRect().height),
                cells: Array.from(row.children, cell => ({ className: cell.className, text: cell.textContent }))
            }));
            assert.deepEqual(await geometry(current.page), await geometry(baseline.page));
            await baseline.page.screenshot({ path: path.join(out, 'inventory-baseline-' + width + '.png'), fullPage: true });
            await current.page.screenshot({ path: path.join(out, 'inventory-current-' + width + '.png'), fullPage: true });
            console.log('PASS incumbent inventory geometry at ' + width + 'px');
        }
        await current.context.close(); await baseline.context.close();
        assert.equal(writes, 0);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
