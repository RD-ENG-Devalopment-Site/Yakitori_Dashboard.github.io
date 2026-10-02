const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const D = require('../breakdown-domain.js');
test('M1–M4 mapping and unknown station remain explicit', () => {
    D.stations.forEach((s, i) => assert.equal(D.machineId(s), 'YK-10' + (i + 1)));
    assert.equal(D.stationOf({ machineId: 'YK-104' }), 'M4');
    assert.equal(D.machineId('M8'), '');
});
test('canonical duration crosses midnight and days; legacy never invents end date', () => {
    assert.equal(D.duration({ startedAt: '2026-10-02T23:50:00+07:00', restoredAt: '2026-10-03T00:20:00+07:00' }).durationMin, 30);
    assert.equal(D.duration({ startedAt: '2026-10-01T00:00:00Z', restoredAt: '2026-10-03T00:00:00Z' }).durationMin, 2880);
    assert.equal(D.duration({ breakdownDate: '2026-10-02', startTime: '23:50', endTime: '00:20' }).durationMin, null);
    assert.equal(D.duration({ startedAt: '2026-10-02T00:00:00Z' }, Date.parse('2026-10-02T01:00:00Z')).elapsedDowntimeMin, 60);
});
test('old Open outranks new Closed and Monitoring; void excluded, snapshot unchanged', () => {
    const records = [{ eventId: 'open', station: 'M1', breakdownStatus: 'Open', createdAt: '2020-01-01', productNameSnapshot: 'old' }, { eventId: 'closed', station: 'M1', breakdownStatus: 'Closed', createdAt: '2026-01-01' }, { eventId: 'monitor', station: 'M1', breakdownStatus: 'Monitoring', createdAt: '2026-02-01' }, { eventId: 'void', station: 'M1', breakdownStatus: 'Open', voidedAt: '2026-03-01' }];
    const state = D.machineState(records, 'M1');
    assert.equal(state.latest.eventId, 'open'); assert.equal(state.activeCount, 2); assert.equal(state.latest.productNameSnapshot, 'old');
});
test('historical and non-machine stops do not block current availability', () => {
    assert.equal(D.activeForMachine([{ station: 'M1', breakdownStatus: 'Open', isHistorical: true }, { station: 'M1', breakdownStatus: 'Open', isMachineFailure: false }], 'M1').length, 0);
});
function client(transport, storage = new Map()) {
    const context = { BreakdownDomain: D, BREAKDOWN_TRANSPORT: transport, crypto: crypto.webcrypto, TextEncoder, URL, Date, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }, fetch: async () => { throw Error('unexpected network'); } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../breakdown-client.js'), 'utf8'), context);
    return context.BreakdownClient;
}
const health = () => ({ writeProtocolVersion: 2, breakdownWritesEnabled: true, readableTransport: true, session: { authenticated: true, subject: 'verified-user' } });
function receipt(op) {
    return { protocolVersion: 2, requestId: op.requestId, action: op.action, payloadHash: crypto.createHash('sha256').update(D.canonical({ action: op.action, expectedRevision: op.expectedRevision ?? null, payload: op.payload })).digest('hex'), recordId: op.payload.eventId || 'BD-1', revision: (op.expectedRevision || 0) + 1, state: 'saved', savedAt: '2026-10-02T00:00:00Z' };
}
test('receipt exact match and saved requests are not reused for a new incident', async () => {
    const ids = [];
    const c = client({ health, submit: async op => { ids.push(op.requestId); return receipt(op); } });
    await c.health();
    assert.equal((await c.mutate('record_breakdown', { station: 'M1' })).confirmed, true);
    assert.equal((await c.mutate('record_breakdown', { station: 'M1' })).confirmed, true);
    assert.notEqual(ids[0], ids[1]);
});
test('wrong hash/event/revision/action receipt cannot confirm', async () => {
    for (const patch of [{ payloadHash: 'bad' }, { recordId: 'other' }, { revision: 99 }, { action: 'close_breakdown' }, { requestId: 'other' }]) {
        const c = client({ health, submit: async op => ({ ...receipt(op), ...patch }) }); await c.health();
        assert.equal((await c.mutate('update_breakdown', { eventId: 'BD-1' }, 2)).state, 'unknown');
    }
});
test('pending operation survives reload and queries original status; account changes isolate it', async () => {
    const storage = new Map(); let original;
    const transport = { health, submit: async op => { original = op; throw Error('lost response'); }, status: async id => { assert.equal(id, original.requestId); return receipt(original); } };
    let c = client(transport, storage); await c.health(); assert.equal((await c.mutate('record_breakdown', { station: 'M1' })).state, 'unknown');
    c = client(transport, storage); await c.health(); assert.equal((await c.status(original.requestId)).confirmed, true);
    const other = client({ ...transport, health: () => ({ ...health(), session: { authenticated: true, subject: 'another-user' } }) }, storage); await other.health(); await assert.rejects(other.status(original.requestId), /STATUS_UNAVAILABLE/);
});
test('legacy health or unauthenticated readable transport cannot write; invalid feeds reject', async () => {
    const c = client({ health: () => ({ writeProtocolVersion: null }), submit: () => { throw Error('must not submit'); }, readRecords: () => ({ status: 'error', _records: [] }) });
    await c.health(); assert.equal(c.getCapabilities().writesEnabled, false); assert.equal((await c.mutate('record_breakdown', {})).code, 'WRITES_DISABLED'); await assert.rejects(c.readRecords(), /Invalid breakdown feed/);
});
test('unavailable durable draft storage prevents dispatch', async () => {
    let sent = false;
    const context = { BreakdownDomain: D, BREAKDOWN_TRANSPORT: { health, submit: () => { sent = true; } }, crypto: crypto.webcrypto, TextEncoder, URL, Date, localStorage: { getItem: () => null, setItem: () => { throw Error('quota'); } } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../breakdown-client.js'), 'utf8'), context);
    await context.BreakdownClient.health();
    assert.equal((await context.BreakdownClient.mutate('record_breakdown', {})).code, 'DRAFT_STORAGE_UNAVAILABLE');
    assert.equal(sent, false);
});
test('authenticated receipt recovery remains available when emergency write gate is disabled', async () => {
    const storage = new Map(); let op;
    let c = client({ health, submit: async operation => { op = operation; throw Error('lost'); } }, storage);
    await c.health(); await c.mutate('record_breakdown', { station: 'M1' });
    c = client({ health: () => ({ ...health(), breakdownWritesEnabled: false }), status: async () => receipt(op) }, storage);
    await c.health(); assert.equal(c.getCapabilities().writesEnabled, false); assert.equal((await c.status(op.requestId)).confirmed, true);
});
test('definitive write rejection permits a new operation, status-query rejection does not discard pending write', async () => {
    let mode = 'reject', pending; const ids = [];
    const c = client({ health, submit: async op => { ids.push(op.requestId); pending = op; return mode === 'reject' ? { status: 'error', code: 'VALIDATION', state: 'rejected' } : { state: 'unknown' }; }, status: async () => ({ status: 'error', code: 'FORBIDDEN', state: 'rejected' }) });
    await c.health(); assert.equal((await c.mutate('record_breakdown', {})).state, 'rejected');
    mode = 'unknown'; await c.mutate('record_breakdown', {}); assert.notEqual(ids[0], ids[1]);
    assert.equal((await c.status(pending.requestId)).state, 'unknown');
    await c.mutate('record_breakdown', {}); assert.equal(ids[1], ids[2]);
});
