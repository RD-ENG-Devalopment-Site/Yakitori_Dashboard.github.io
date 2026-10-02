const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createBreakdownAdapter } = require('../scripts/breakdown-bff-adapter.cjs');
const { canonical } = require('../breakdown-domain.js');
const config = { origin: 'https://portal.example.test', gasUrl: 'https://script.google.com/macros/s/staging_test/exec', environment: 'staging', keyId: 'test', signingKey: 'local-test-only', writesEnabled: true, authenticate: async () => ({ subject: 'verified-sub', roles: ['breakdownReporter'], stations: ['M1'], csrfToken: 'server-csrf' }) };
function request(body, extras = {}) { return { url: '/api/breakdown?action=submit', method: 'POST', headers: { origin: config.origin, 'x-csrf-token': 'server-csrf' }, body: JSON.stringify(body), ...extras }; }
test('server adapter rejects anonymous, forged identity and CSRF without contacting GAS', async () => {
    const adapter = createBreakdownAdapter({ ...config, fetchImpl: async () => { throw Error('must never contact GAS'); } });
    assert.equal((await adapter(request({ actor: 'forged' }))).status, 400);
    assert.equal((await adapter(request({}, { headers: {} }))).status, 403);
    const anonymous = createBreakdownAdapter({ ...config, authenticate: async () => null });
    assert.equal((await anonymous(request({}))).status, 401);
});
test('server adapter signs server identity, not browser claims; status uses fresh envelope operation', async () => {
    let signed;
    const adapter = createBreakdownAdapter({ ...config, fetchImpl: async (url, options) => { signed = JSON.parse(options.body); return { ok: true, url, json: async () => ({ status: 'success' }) }; } });
    assert.equal((await adapter(request({ protocolVersion: 2, requestId: 'original', action: 'record_breakdown', payload: {} }))).status, 200);
    const signature = signed.auth.signature; delete signed.auth.signature;
    assert.equal(signature, crypto.createHmac('sha256', config.signingKey).update(canonical(signed)).digest('hex'));
    assert.equal(signed.auth.actor, 'verified-sub');
    await adapter(request({ requestId: 'original' }, { url: '/api/breakdown?action=status' }));
    assert.equal(signed.action, 'read_write_status'); assert.equal(signed.payload.requestId, 'original'); assert.notEqual(signed.requestId, 'original');
});
test('invalid JSON is rejected; actual backend capability gates health and redirects are constrained', async () => {
    const adapter = createBreakdownAdapter({ ...config, fetchImpl: async url => ({ ok: true, url: String(url), json: async () => ({ status: 'success', writeProtocolVersion: null }) }) });
    assert.equal((await adapter(request({}, { body: '{broken' }))).status, 400);
    const health = await adapter({ url: '/api/breakdown?action=health', method: 'GET' });
    assert.equal(health.body.breakdownWritesEnabled, false);
    const badRedirect = createBreakdownAdapter({ ...config, fetchImpl: async () => ({ ok: true, url: 'https://evil.example/redirect', json: async () => ({ status: 'success' }) }) });
    assert.equal((await badRedirect({ url: '/api/breakdown?action=health', method: 'GET' })).status, 502);
    assert.throws(() => createBreakdownAdapter({ ...config, origin: 'http://insecure.test' }), /configuration/);
});
