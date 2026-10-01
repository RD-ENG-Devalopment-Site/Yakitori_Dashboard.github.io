// Serve the exact Pages artifact under a repository subpath; Google writes are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { buildPages } = require('../scripts/build-pages.cjs');
const root = path.resolve(__dirname, '..');
const files = JSON.parse(fs.readFileSync(path.join(root, 'scripts/pages-files.json'), 'utf8'));

async function run() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yakitori-pages-browser-'));
    const site = path.join(temp, 'site');
    const prefix = '/Yakitori_Dashboard.github.io/';
    const missing = [];
    let server;
    let browser;
    try {
        buildPages({ root, outDir: site, files, metadata: {
            build: 'browser-test', commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
            builtAt: new Date().toISOString()
        } });
        server = http.createServer((request, response) => {
            const url = new URL(request.url, 'http://localhost');
            const relative = url.pathname.startsWith(prefix) ? decodeURIComponent(url.pathname.slice(prefix.length)) : '';
            const file = path.resolve(site, relative || 'index.html');
            if (!url.pathname.startsWith(prefix) || !file.startsWith(site + path.sep) ||
                !fs.existsSync(file) || !fs.statSync(file).isFile()) {
                missing.push(url.pathname); response.writeHead(404).end(); return;
            }
            const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
                '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' }[path.extname(file)] || 'application/octet-stream';
            response.setHeader('Content-Type', type);
            fs.createReadStream(file).pipe(response);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = 'http://127.0.0.1:' + server.address().port + prefix;
        const env = { ...process.env, YAKITORI_SITE_ROOT: site, YAKITORI_SITE_ORIGIN: origin };
        for (const script of ['dashboard-browser.cjs', 'block-tracker-browser.cjs']) {
            await new Promise((resolve, reject) => {
                const child = spawn(process.execPath, [path.join(__dirname, script)], { cwd: root, env, stdio: 'inherit' });
                child.on('error', reject);
                child.on('exit', code => code === 0 ? resolve() : reject(new Error(script + ' exited ' + code)));
            });
        }
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const page = await browser.newPage();
        const errors = [];
        let writes = 0;
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://script.google.com/**', route => {
            if (route.request().method() !== 'GET') { writes++; return route.abort(); }
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', records: [] }) });
        });
        const modelLoaded = page.waitForResponse(response => response.url().includes('models/layout_zone_sc4_yakitori.glb') && response.status() === 200);
        await page.goto(origin + 'yakitori-machine-3d-viewer/index.html');
        await Promise.all([page.waitForFunction(() => document.querySelector('canvas')), modelLoaded]);
        assert.deepEqual(errors, []);
        assert.equal(writes, 0);
        assert.deepEqual(missing, []);
        console.log('PASS Pages subpath: home/dashboard/Block Tracker suites and 3D assets; no missing public requests');
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
        assert.ok(path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('yakitori-pages-browser-'));
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
