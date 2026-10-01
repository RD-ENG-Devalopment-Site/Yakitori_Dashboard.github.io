// Local transport PoC only. Test cookies and the GAS stub are NOT production authentication.
// No Google API, real credentials, Sheets, cloud resources, or application files are used.
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHash, randomUUID } = require('node:crypto');
const { chromium } = require('playwright');

const canonical = value => JSON.stringify(value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');

async function run() {
    const receipts = new Map();
    const redirectedResults = new Map();
    let effects = 0;
    let redirects = 0;
    let origin;
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, origin);
        const json = (status, body) => {
            response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify(body));
        };
        try {
            if (url.pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Local Transport Fixture</title><p>Test fixture only</p>'); return; }
            if (url.pathname === '/__test/login') {
                // Insecure HTTP is permitted ONLY in this disposable loopback test fixture.
                response.setHeader('Set-Cookie', '__test-session=synthetic; HttpOnly; SameSite=Lax; Path=/');
                json(200, { testOnly: true }); return;
            }
            if (url.pathname.startsWith('/gas-result/')) {
                const receipt = redirectedResults.get(url.pathname);
                redirectedResults.delete(url.pathname);
                json(receipt ? 200 : 404, receipt || { state: 'unknown' }); return;
            }
            if (url.pathname.startsWith('/api/')) {
                if (!request.headers.cookie?.includes('__test-session=synthetic')) {
                    json(401, { state: 'rejected', code: 'UNAUTHENTICATED' }); return;
                }
                if (request.method !== 'GET' && request.headers.origin !== origin) {
                    json(403, { state: 'rejected', code: 'FORBIDDEN' }); return;
                }
                if (url.pathname === '/api/status') {
                    const receipt = receipts.get(url.searchParams.get('requestId'));
                    json(receipt ? 200 : 404, receipt || { state: 'unknown' }); return;
                }
            }
            let raw = '';
            for await (const chunk of request) {
                raw += chunk;
                if (raw.length > 4096) { json(413, { state: 'rejected' }); return; }
            }
            const body = JSON.parse(raw);
            if (url.pathname === '/gas-exec') {
                const existing = receipts.get(body.requestId);
                let receipt;
                if (existing && existing.payloadHash !== hash(body.payload)) {
                    receipt = { state: 'rejected', code: 'IDEMPOTENCY_CONFLICT' };
                } else if (existing) receipt = existing;
                else if (body.payload.mode === 'pending') receipt = { requestId: body.requestId, payloadHash: hash(body.payload), state: 'unknown' };
                else if (body.payload.mode === 'reject') receipt = { requestId: body.requestId, payloadHash: hash(body.payload), state: 'rejected', code: 'VALIDATION_ERROR' };
                else if (body.payload.mode === 'old-trial') receipt = { requestId: 'older-operation', payloadHash: hash(body.payload), state: 'saved' };
                else {
                    receipt = { requestId: body.requestId, payloadHash: hash(body.payload), state: 'saved', recordId: 'synthetic-' + ++effects };
                    receipts.set(body.requestId, receipt);
                }
                const location = '/gas-result/' + randomUUID();
                redirectedResults.set(location, receipt);
                redirects++;
                response.writeHead(302, { Location: location }).end(); return;
            }
            if (url.pathname === '/api/save') {
                const upstream = await fetch(origin + '/gas-exec', {
                    method: 'POST', redirect: 'follow', body: JSON.stringify(body),
                    headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, signal: AbortSignal.timeout(2000)
                });
                const receipt = await upstream.json();
                if (receipt.code === 'IDEMPOTENCY_CONFLICT') { json(409, receipt); return; }
                if (receipt.requestId !== body.requestId || receipt.payloadHash !== hash(body.payload)) {
                    json(502, { state: 'unknown', code: 'UNVERIFIED_RECEIPT' }); return;
                }
                if (body.payload.mode === 'lost-response') { response.destroy(); return; }
                json(receipt.state === 'saved' ? 200 : receipt.state === 'rejected' ? 422 : 202, receipt); return;
            }
            json(404, { state: 'rejected' });
        } catch {
            if (!response.destroyed) json(502, { state: 'unknown', code: 'UPSTREAM_UNAVAILABLE' });
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    let browser;
    try {
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const context = await browser.newContext();
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage();
        await page.goto(origin);
        const save = (mode = 'saved', id = randomUUID(), trial = '8') => page.evaluate(async ({ mode, id, trial }) => {
            try {
                const response = await fetch('/api/save', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: id, action: 'record_trial', payload: { mode, trial, line: 'BBSKINR12', shift: 'B', prod: 77.6 } })
                });
                return { status: response.status, body: await response.json() };
            } catch { return { lostResponse: true }; }
        }, { mode, id, trial });
        assert.equal((await save()).status, 401);
        assert.equal(effects, 0);
        await page.evaluate(() => fetch('/__test/login', { method: 'POST' }));
        assert.equal(await page.evaluate(() => document.cookie), '');
        const id = randomUUID();
        const first = await save('saved', id);
        assert.equal(first.status, 200);
        assert.equal(first.body.state, 'saved');
        assert.deepEqual((await save('saved', id)).body, first.body);
        assert.equal(effects, 1);
        assert.equal((await save('saved', id, '9')).status, 409);
        assert.equal((await save('reject')).status, 422);
        assert.equal((await save('pending')).body.state, 'unknown');
        assert.equal((await save('old-trial')).body.code, 'UNVERIFIED_RECEIPT');
        const lostId = randomUUID();
        assert.equal((await save('lost-response', lostId)).lostResponse, true);
        const recovered = await page.evaluate(async id => (await fetch('/api/status?requestId=' + id)).json(), lostId);
        assert.equal(recovered.requestId, lostId);
        assert.equal(recovered.state, 'saved');
        assert.equal(effects, 2);
        assert.ok(redirects >= 7);
        console.log('PASS local readable JSON, upstream redirect, rejection, pending, exact receipt, retry and lost-response recovery');
        console.log('PoC only: production identity, signing, durable idempotency and deployment remain gated.');
        await context.close();
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
