// Run with: node --test tests/dashboard-regression.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = resolve(__dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const index = read('index.html');
const section = (source, start, end) => {
    const offset = source.indexOf(start);
    assert.ok(offset >= 0, start);
    const limit = source.indexOf(end, offset + start.length);
    assert.ok(limit > offset, end);
    return source.slice(offset, limit);
};
const pause = () => new Promise(resolve => setTimeout(resolve, 15));
const record = (line, shift, prod, trial = '1') => ({
    line, shift, prod, trial, eff: 999, man: 10, total: prod * 10,
    recordDate: '2026-09-30', createdAt: '2026-09-30T01:00:00Z'
});
const skinConfig = {
    prefix: 'skin', projectKey: 'SKIN', target: 120, color: '#50cd89',
    sheetsByShift: { A: 'skin-A', B: 'skin-B' }
};

for (const file of [
    'bb-skin-dashboard.js', 'bb-skin-35g-f15-dashboard.js',
    'neck-skin-40g-r15-dashboard.js',
    'BL23g Dashboard/BL23gM1_Main Dashboard_Yakitori.html',
    'BL23g Dashboard/BL23g_Main Dashboard_Yakitori.html'
]) {
    test('summary filters, baseline, zero and empty: ' + file, () => {
        const elements = new Map();
        let shift = 'all';
        const context = vm.createContext({
            document: { getElementById: id => {
                if (!elements.has(id)) elements.set(id, { textContent: '' });
                return elements.get(id);
            } },
            db: {
                baseline: { prod: 1000, shift: 'A' },
                '1_A': record('SKIN', 'A', 60),
                '2_A': record('SKIN', 'A', 0, '2'),
                '3_B': record('SKIN', 'B', 77.6, '3')
            },
            targetProductivity: 120,
            getVisibleKeys: () => ['baseline', '1_A', '2_A', '3_B'].filter(k =>
                shift === 'all' || k === 'baseline' || k.endsWith('_' + shift)),
            isBaselineRecord: k => k === 'baseline',
            compareRecordKeys: (a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0]),
            getTrialLabel: k => k.split('_')[0],
            getRecordShift: k => k.split('_')[1]
        });
        vm.runInContext(section(read(file), 'function updateTableSummary()', 'function renderTable()'), context);
        const text = id => elements.get('table-summary-' + id).textContent;
        context.updateTableSummary();
        assert.equal(text('best'), '77.6 ไม้/คน/ชม.');
        assert.equal(text('eff'), '38.22%');
        shift = 'B';
        context.updateTableSummary();
        assert.equal(text('eff'), '64.67%');
        assert.equal(text('latest-label'), 'ครั้งที่ 3 / Shift B');
        shift = 'A';
        context.updateTableSummary();
        assert.equal(text('latest'), '0.0 ไม้/คน/ชม.');
        assert.equal(text('best'), '60.0 ไม้/คน/ชม.');
        assert.equal(text('eff'), '25.00%');
        shift = 'C';
        context.updateTableSummary();
        assert.equal(text('latest'), '--');
        assert.equal(text('best'), '--');
        assert.equal(text('eff'), '--');
        assert.equal(text('target'), '120');
    });
}

function loader(fetch, configs = [skinConfig]) {
    const context = vm.createContext({
        console: { error() {}, warn() {} }, fetch, AbortSignal,
        requestAnimationFrame: callback => setTimeout(callback, 0),
        cancelAnimationFrame: clearTimeout,
        document: { hidden: false, getElementById: () => ({ classList: { contains: () => false } }) },
        window: { YakitoriRuntime: { buildApiUrl: (sheet, params) => {
            const url = new URL('https://test.invalid/api');
            if (sheet) url.searchParams.set('sheet', sheet);
            for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
            return url;
        } } },
        lineConfigs: configs, dashboardSnapshot: null, dashboardLoading: false,
        dashboardLoadGeneration: 0, dashboardRenderFrame: null,
        dashboardFeedsCompleted: 0, dashboardFeedsTotal: 0, lastDashboardRefreshAt: null,
        snapshots: []
    });
    vm.runInContext(section(index, 'function normalizeSheetData(', 'function renderProgressPanel('), context);
    vm.runInContext(section(index, 'async function loadDashboardLine(', 'function renderDashboardSnapshot('), context);
    context.renderDashboardSnapshot = () => context.snapshots.push(JSON.parse(JSON.stringify(context.dashboardSnapshot)));
    return context;
}
const response = rows => ({ ok: true, json: async () => ({ _records: rows }) });

test('first shift renders before delayed shift; requests are read-only', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const context = loader(async (url, options) => {
        assert.ok(!options.method || options.method === 'GET');
        const sheet = url.searchParams.get('sheet');
        if (sheet === 'skin-B') return pending;
        return response(sheet ? [record('SKIN', 'A', 60)] : []);
    });
    const done = context.renderDashboardData();
    await pause();
    assert.ok(context.snapshots.some(snapshot => snapshot.results[0].records.length === 1));
    assert.equal(context.dashboardSnapshot.results[0].loadingShifts.join(','), 'B');
    assert.equal(context.dashboardLoading, true);
    release(response([record('SKIN', 'B', 77.6)]));
    await done;
    assert.equal(context.dashboardSnapshot.results[0].records.length, 2);
    assert.equal(context.dashboardSnapshot.results[0].records[1].eff.toFixed(2), '64.67');
});

test('refresh retains valid stale data; successful empty clears it; recovery clears errors', async () => {
    let mode = 'valid';
    const context = loader(async url => {
        const sheet = url.searchParams.get('sheet');
        if (!sheet) return response([]);
        if (sheet === 'skin-B' && mode === 'failed') return { ok: false, status: 503 };
        if (sheet === 'skin-B' && mode === 'empty') return response([]);
        if (sheet === 'skin-B' && mode === 'wrong') return response([record('OTHER', 'B', 999)]);
        if (sheet === 'skin-B' && mode === 'timeout') throw new DOMException('Timed out', 'TimeoutError');
        return response([record('SKIN', sheet === 'skin-A' ? 'A' : 'B', 77.6)]);
    });
    await context.renderDashboardData();
    const initial = JSON.stringify(context.dashboardSnapshot.results);
    await context.renderDashboardData();
    assert.equal(JSON.stringify(context.dashboardSnapshot.results), initial);
    for (const modeValue of ['failed', 'timeout', 'wrong']) {
        mode = modeValue;
        await context.renderDashboardData();
        const result = context.dashboardSnapshot.results[0];
        assert.equal(result.records.length, 2);
        assert.equal(result.failedShifts.join(','), 'B');
        assert.equal(result.feedErrors.B, mode === 'wrong' ? 'route' : 'network');
        assert.ok(result.records.every(row => row.prod !== 999));
    }
    mode = 'empty';
    await context.renderDashboardData();
    assert.equal(context.dashboardSnapshot.results[0].records.length, 1);
    assert.equal(context.dashboardSnapshot.results[0].failedShifts.length, 0);
    mode = 'valid';
    await context.renderDashboardData();
    assert.equal(JSON.stringify(context.dashboardSnapshot.results), initial);
});

test('old generation cannot overwrite a newer refresh; overlapping refresh is ignored', async () => {
    let oldRelease;
    let old = true;
    let calls = 0;
    const pending = new Promise(resolve => { oldRelease = resolve; });
    const context = loader(async url => {
        calls++;
        if (!url.searchParams.get('sheet')) return response([]);
        if (old) return pending;
        return response([record('SKIN', url.searchParams.get('shift'), 120)]);
    });
    const first = context.renderDashboardData();
    await context.renderDashboardData();
    assert.equal(calls, 3);
    context.dashboardLoading = false;
    old = false;
    await context.renderDashboardData();
    oldRelease(response([record('SKIN', 'A', 10)]));
    await first;
    await pause();
    assert.ok(context.dashboardSnapshot.results[0].records.every(row => row.prod === 120));
});

test('skin configs and targets are present; revisions are deduplicated', () => {
    const configs = vm.runInNewContext(section(index, 'const lineConfigs =', 'let currentShiftFilter') + ';lineConfigs;');
    assert.equal(configs.length, 7);
    assert.deepEqual(Array.from(configs.slice(-3), item => item.target), [120, 120, 120]);
    assert.equal(configs[5].projectKey, 'BBSKINF15');
    assert.equal(configs[6].projectKey, 'NECKSKINR15');
    const context = loader(async () => response([]));
    const rows = context.normalizeSheetData({ _records: [
        record('SKIN', 'A', 100), record('SKIN', 'A', 80), record('SKIN', 'B', 60)
    ] });
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.shift === 'A').prod, 80);
});

test('F15 empty-shift recovery preserves the A/B overview and restores status and controls', () => {
    const source = read('bb-skin-35g-f15-dashboard.js');
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { innerHTML: '--', textContent: '', disabled: false });
        return elements.get(id);
    };
    const headerIds = ['header-max-yield', 'header-current-yield', 'header-current-man', 'header-selected-round', 'header-man-round'];
    const emptyMarkup = new Map([...headerIds, 'kpi-prod'].map(id => [id, '--']));
    let renders = 0;
    let selections = 0;
    const context = vm.createContext({
        document: { getElementById: element, querySelectorAll: () => [] },
        db: { '1_B': { ...record('BBSKINF15', 'B', 41.9), total: 628, man: 15 } },
        keys: ['1_B'], selectedShiftFilter: 'all', selectedDataIndex: 0,
        baselineKey: '1_B', bestTrialKey: '1_B', gapComparisonKey: '1_B',
        lastDataUpdatedAt: new Date('2026-10-01T04:00:00Z'),
        overviewHeaderIds: new Set(headerIds), emptyMarkup,
        trendChart: null, cycleChart: null, prodJourneyChart: null, bottleneckChart: null,
        applyPendingTargetLabels: () => { element('header-actual-yield').textContent = '1,800'; },
        compareRecordKeys: () => 0,
        getTrialLabel: key => context.db[key].trial,
        getRecordShift: key => context.db[key].shift,
        isBaselineRecord: () => false,
        getVisibleKeys: () => context.keys.filter(key => context.selectedShiftFilter === 'all' || context.db[key].shift === context.selectedShiftFilter),
        findBestTrialKey: visible => visible[0], getSummaryBaselineKey: () => '1_B',
        renderList() {}, renderTable: () => { renders++; }, initCharts() {},
        syncGapComparisonSelect() {}, calculateExecutiveSummary() {}, initSummaryCharts() {},
        selectIteration: () => { selections++; }
    });
    for (const [start, end] of [
        ['function clearDashboard(', 'async function loadData()'],
        ['function hasCompleteHeaderMetrics(', 'function getVisibleKeys()'],
        ['function refreshShiftView()', 'function syncGapComparisonSelect()'],
        ['function setShiftFilter(', 'function setGapComparison(']
    ]) vm.runInContext(section(source, start, end), context);
    const assertOverview = () => {
        assert.match(element('header-max-yield').innerHTML, /628/);
        assert.match(element('header-current-yield').innerHTML, /628/);
        assert.match(element('header-current-man').innerHTML, /15/);
        assert.match(element('header-selected-round').innerText, /Shift B/);
    };
    for (let cycle = 0; cycle < 3; cycle++) {
        context.setShiftFilter('all'); assertOverview();
        context.setShiftFilter('A'); assertOverview();
        assert.equal(element('selectedIterText').textContent, 'ยังไม่มีข้อมูลสำหรับ Shift A');
        assert.equal(element('dataStatus').textContent, 'ยังไม่มีข้อมูลสำหรับ Shift A');
        assert.equal(element('gapComparisonSelect').disabled, true);
        assert.equal(element('tableRoundSelect').disabled, true);
        context.setShiftFilter('B'); assertOverview();
        assert.match(element('dataStatus').textContent, /อัปเดตแล้ว • Shift B • 1 รายการ/);
        assert.equal(element('gapComparisonSelect').disabled, false);
        assert.equal(element('tableRoundSelect').disabled, false);
    }
    assert.equal(renders, 6);
    assert.equal(selections, 6);
    assert.equal(context.keys.length, 1);
    assert.equal(context.db['1_B'].total, 628);
    // Loading/errors clear the whole overview, but never overwrite the caller's status.
    element('dataStatus').textContent = 'โหลดข้อมูลไม่สำเร็จ';
    context.clearDashboard('ไม่สามารถโหลดข้อมูลได้');
    assert.equal(element('header-current-yield').innerHTML, '--');
    assert.equal(element('dataStatus').textContent, 'โหลดข้อมูลไม่สำเร็จ');
    assert.equal(element('header-actual-yield').textContent, '1,800');
    context.keys = []; context.db = {};
    context.setShiftFilter('all');
    assert.match(element('dataStatus').textContent, /ในทั้งสองกะ/);
    assert.equal(element('header-max-yield').innerHTML, '--');
});
