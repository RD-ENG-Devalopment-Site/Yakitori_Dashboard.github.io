const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createGasHarness, trialRows } = require('./helpers/gas-harness.cjs');

const routes = [
    ['BL23G_M1', 'BL23gR15_M1_DataLog', 'BL23gR15_M1_ShiftB_DataLog', 130],
    ['BL23G_M2', 'BL23gR15_DataLog', 'BL23gR15_ShiftB_DataLog', 130],
    ['GZ30G', 'GZ30gR15_DataLog', 'GZ30gR15_ShiftB_DataLog', 69],
    ['GZ40G', 'GZ40gS18_DataLog', 'GZ40gS18_ShiftB_DataLog', 84],
    ['BBSKINR12', 'BBSKINR12_DataLog_Shift A', 'BBSKINR12_DataLog_Shift B', 120],
    ['BBSKINF15', 'BBSKINF15_Datalog_Shift A', 'BBSKINF15_Datalog_Shift B', 120],
    ['NECKSKINR15', 'NECKSKINR15_Datalog_Shift A', 'NECKSKINR15_Datalog_Shift B', 120]
];

test('every production line/shift resolves to a canonical allowlisted write route without opening Sheets', () => {
    const h = createGasHarness();
    for (const [line, a, b] of routes) {
        for (const shift of ['A', 'B']) {
            const route = h.context.resolveRecordRoute_({ line, projectKey: line, shift, sheet: shift === 'A' ? a : b });
            assert.equal(route.projectKey, line);
            assert.equal(route.shift, shift);
            assert.equal(route.sheet, shift === 'A' ? a : b);
        }
    }
    assert.equal(h.reads.length, 0);
    assert.equal(h.mutations.length, 0);
});

test('legacy BL/Gizzard base-dataset Shift B and sheet-only RPC selections remain valid', () => {
    const h = createGasHarness();
    for (const [line, a, b] of routes.slice(0, 4)) {
        assert.equal(h.context.resolveRecordRoute_({ line, sheet: a, shift: 'B' }).sheet, b);
        assert.equal(h.context.resolveRecordRoute_({ targetSheet: a, shift: 'B' }).sheet, b);
        assert.equal(h.context.resolveRecordRoute_({ targetSheet: b }).shift, 'B');
    }
    assert.equal(h.context.resolveRecordRoute_({ line: 'BL23G', targetSheet: routes[0][1], shift: 'A' }).projectKey, 'BL23G_M1');
    assert.equal(h.context.resolveRecordRoute_({ line: 'GZ40', shift: 'B' }).projectKey, 'GZ40G');
});

const invalid = [
    {}, { line: 'UNKNOWN' }, { line: '__proto__' }, { line: 'constructor' },
    { line: 'BBSKINR12', sheet: 'not-a-real-sheet', shift: 'B' },
    { line: 'BL23G_M1', projectKey: 'BL23G_M2', shift: 'A' },
    { line: 'GZ30G', sheet: 'GZ40gS18_DataLog', shift: 'A' },
    { line: 'BL23G', sheet: 'GZ30gR15_DataLog' },
    { line: 'BBSKINF15', sheet: 'NECKSKINR15_Datalog_Shift B', shift: 'B' },
    { projectKey: 'BBSKINR12', sheet: 'BBSKINR12_DataLog_Shift A', shift: 'B' },
    { line: 'NECKSKINR15', shift: 'C' },
    { line: 'GZ30G', sheet: 'GZ30gR15_ShiftB_DataLog', shift: 'A' },
    { sheet: 'prefix-GZ30gR15_DataLog' },
    { line: 'BL23G_M2', sheet: 'BL23gR15_DataLog', targetSheet: 'BL23gR15_ShiftB_DataLog' }
];

test('invalid write routes never append, create or access a requested Sheet, including RPC fallback', () => {
    for (const payload of invalid) {
        const h = createGasHarness();
        assert.throws(() => h.context.resolveRecordRoute_(payload), /project|sheet|shift|BL23G/i);
        const result = h.post({ action: 'record_trial', payload });
        assert.equal(result.status, 'error');
        assert.equal(result.code, 'INVALID_ROUTE');
        assert.equal(h.context.saveData(payload).code, 'INVALID_ROUTE');
        assert.equal(h.reads.length, 0);
        assert.equal(h.mutations.length, 0);
    }
});

test('invalid read routes return structured errors rather than another product feed', () => {
    const h = createGasHarness({ activeSheets: { GZ30gR15_DataLog: trialRows() } });
    for (const params of invalid.slice(1)) {
        const body = h.read(params);
        assert.equal(body.status, 'error', JSON.stringify(params));
        assert.equal(body.code, 'INVALID_ROUTE', JSON.stringify(params));
        assert.deepEqual(body._records, []);
    }
    assert.equal(h.reads.length, 0);
    assert.equal(h.mutations.length, 0);
});

test('storage GETs are lookup-only and schema-compatible even when their sheets do not exist', () => {
    const h = createGasHarness();
    assert.deepEqual(h.read({ action: 'read_breakdown' })._records, []);
    assert.deepEqual(h.read({ sheet: 'MachineBreakdownLog' })._records, []);
    assert.deepEqual(h.read({ action: 'read_block_tracker' }).records, []);
    assert.deepEqual(h.read({ action: 'read_machine_layout' }).records, []);
    assert.equal(h.mutations.length, 0);
});

test('storage action/project conflicts and unknown actions do not fall through', () => {
    const h = createGasHarness();
    for (const params of [
        { action: 'read_unknown' },
        { action: 'read_breakdown', projectKey: 'BBSKINF15' },
        { action: 'read_block_tracker', sheet: 'GZ30gR15_DataLog' },
        { sheet: 'MachineBreakdownLog', projectKey: 'UNKNOWN' }
    ]) assert.equal(h.read(params).code, 'INVALID_ROUTE');
    assert.equal(h.reads.length, 0);
    assert.equal(h.mutations.length, 0);
});

test('all seven feeds preserve targets and legacy combined/B-only read behavior', () => {
    const activeSheets = {}, externalSheets = {};
    for (const [project, a, b] of routes) {
        const sheets = ['BL23G_M2', 'GZ30G', 'GZ40G'].includes(project) ? activeSheets : externalSheets;
        sheets[a] = trialRows('A', 60);
        sheets[b] = trialRows('B', 77.6);
    }
    const h = createGasHarness({ activeSheets, externalSheets });
    for (const [project, a, b, target] of routes) {
        const explicit = h.read({ projectKey: project, sheet: b, shift: 'B' });
        assert.equal(explicit._records.length, 1);
        assert.equal(explicit._records[0].shift, 'B');
        assert.equal(explicit._records[0].eff.toFixed(3), (77.6 / target * 100).toFixed(3));
        const isSkin = target === 120;
        assert.equal(h.read({ projectKey: project, sheet: a })._records.length, isSkin ? 1 : 2);
    }
    assert.equal(h.read({})._records[0].line, 'GZ30G');
    assert.equal(h.read({ sheet: routes[0][1] })._records.length, 2);
    assert.equal(h.mutations.length, 0);
});

test('skin feeds support legacy shift-column rows without changing output or dates', () => {
    const [headers, row] = trialRows('B');
    const legacy = [[headers[0], 'shift', ...headers.slice(1, 15), ...headers.slice(17)],
        [row[0], 'B', ...row.slice(1, 15), ...row.slice(17)]];
    const h = createGasHarness({ externalSheets: { 'BBSKINF15_Datalog_Shift B': legacy } });
    const feed = h.read({ projectKey: 'BBSKINF15', shift: 'B' });
    assert.equal(feed._records[0].line, 'BBSKINF15');
    assert.equal(feed._records[0].prod, 77.6);
    assert.equal(feed._records[0].recordDate, '2026-09-30');
    assert.equal(feed._records[0].eff.toFixed(1), '64.7');
});

test('missing production sheet is an explicit error without creating or falling back', () => {
    const h = createGasHarness();
    for (const [project, a] of routes) assert.equal(h.read({ projectKey: project, sheet: a, shift: 'A' }).code, 'SHEET_NOT_FOUND');
    assert.equal(h.mutations.length, 0);
});

test('known skin writes use the correct external sheet and preserve positional business columns', () => {
    for (const [project, a, b] of routes.slice(4)) {
        for (const shift of ['A', 'B']) {
            const sheet = shift === 'A' ? a : b;
            const h = createGasHarness({ externalSheets: { [sheet]: trialRows(shift) } });
            const result = h.context.saveExternalRecord_({ line: project, projectKey: project, sheet, shift,
                trial: '9', prod: 80, total: 800, man: 10, recordDate: '2026-09-30' });
            assert.equal(result.sheet, sheet);
            const saved = h.external.getSheetByName(sheet).rows[2];
            assert.equal(saved[0], '9');
            assert.equal(saved[7], 800);
            assert.equal(saved[8], 10);
            assert.equal(saved[14], 80);
            assert.equal(saved[15], shift);
            assert.equal(saved[17], '2026-09-30');
            assert.equal(h.read({ projectKey: project, sheet, shift })._records.length, 2);
            assert.equal(h.mutations.filter(item => item.type === 'appendRow').length, 1);
        }
    }
});

test('health metadata is additive, read-only and contains no deployment secrets or spreadsheet IDs', () => {
    const h = createGasHarness();
    const health = h.read({ action: 'read_health' });
    assert.equal(health.writeProtocolVersion, null);
    for (const [project, , , target] of routes) assert.equal(health.targets[project], target);
    assert.equal(h.reads.length, 0);
    assert.equal(h.mutations.length, 0);
    assert.doesNotMatch(JSON.stringify(health), /spreadsheetId|signature|secret|actor/i);
});
