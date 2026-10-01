// Synthetic in-memory Sheets only. No credentials and no production network.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createGasHarness, trialRows } = require('./helpers/gas-harness.cjs');

test('reviewed public GAS entry points match the inventory; auth closure remains a later gate', () => {
    const { context } = createGasHarness();
    const names = Object.keys(context).filter(key => typeof context[key] === 'function' && !key.endsWith('_') && key !== 'fetch').sort();
    assert.deepEqual(names, [
        'createBl23gShiftBSheet', 'createGz30gShiftBSheet', 'createGz40gShiftBSheet',
        'doGet', 'doPost', 'getJsonStream', 'repairBl23DataLayout', 'repairBl23ProductivityLayout', 'saveData'
    ]);
});

test('GAS targets retain BL/Gizzard values and all three skin targets at 120', () => {
    const { context: gas } = createGasHarness();
    assert.equal(gas.BL23G_TARGET_PRODUCTIVITY, 130);
    assert.equal(gas.GZ40G_TARGET_PRODUCTIVITY, 84);
    assert.equal(gas.GZ30G_TARGET_PRODUCTIVITY, 69);
    assert.equal(gas.BBSKIN_R12_TARGET_PRODUCTIVITY, 120);
    assert.equal(gas.ADDITIONAL_SKIN_LINES.BBSKINF15.targetProductivity, 120);
    assert.equal(gas.ADDITIONAL_SKIN_LINES.NECKSKINR15.targetProductivity, 120);
});

for (const [project, sheet] of [
    ['BBSKINR12', 'BBSKINR12_DataLog_Shift B'],
    ['BBSKINF15', 'BBSKINF15_Datalog_Shift B'],
    ['NECKSKINR15', 'NECKSKINR15_Datalog_Shift B']
]) {
    test('skin feed preserves identity, output and target efficiency: ' + project, () => {
        const harness = createGasHarness({ externalSheets: { [sheet]: trialRows('B') } });
        const body = harness.read({ projectKey: project, sheet, shift: 'B' });
        assert.equal(body._records.length, 1);
        assert.equal(body._records[0].line, project);
        assert.equal(body._records[0].prod, 77.6);
        assert.equal(body._records[0].total, 776);
        assert.equal(body._records[0].eff.toFixed(1), '64.7');
        assert.equal(body['8__B'].prod, 77.6);
        assert.equal(harness.mutations.length, 0);
    });
}

test('baseline BL/M1/M2 and legacy sheet-only Gizzard clients remain readable', () => {
    const harness = createGasHarness({
        activeSheets: { BL23gR15_DataLog: trialRows(), GZ40gS18_DataLog: trialRows(), GZ30gR15_DataLog: trialRows() },
        externalSheets: { BL23gR15_M1_DataLog: trialRows() }
    });
    for (const params of [
        { sheet: 'BL23gR15_DataLog' },
        { sheet: 'BL23gR15_M1_DataLog', projectKey: 'BL23G_M1' },
        { sheet: 'GZ40gS18_DataLog' },
        { sheet: 'GZ30gR15_DataLog' }
    ]) assert.equal(harness.read(params)._records.length, 1);
    assert.equal(harness.mutations.length, 0);
});

test('harness captures business and schema writes without contacting Google', () => {
    const harness = createGasHarness({ activeSheets: { BL23gR15_DataLog: trialRows() } });
    const result = harness.context.saveExternalRecord_({ line: 'BL23G_M2', shift: 'A', trial: '9', prod: 80 });
    assert.equal(result.status, 'success');
    assert.ok(harness.mutations.some(item => item.type === 'appendRow'));
    assert.equal(harness.active.getSheetByName('BL23gR15_DataLog').getLastRow(), 3);
});
