// Isolated read-only Viewer feed/error regression. Every mutation is blocked.
// The separate Layout protocol sandbox is not part of this Breakdown release.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const editable = ['machine_name', 'conveyor_name', 'product_name', 'installed_at', 'machine_status', 'last_breakdown_at', 'breakdown_detail'];
const nodeNames = ['Skewer Yakitori Machine.STEP-8', 'Skewer Yakitori Machine.STEP-1', 'Skewer Yakitori Machine.STEP-9', 'Skewer Yakitori Machine.STEP-7'];
function gasReadRecord(record) {
  const result = { ...record };
  for (const field of ['installed_at', 'last_breakdown_at']) {
    const value = result[field];
    if (!value) continue;
    // Deployed GAS reads these dates at Bangkok minute precision.
    result[field] = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : value.slice(0, 16).replace('T', ' ');
  }
  return result;
}

async function run() {
  let records = [1, 2, 3, 4].map(n => ({ machine_id: `YK-10${n}`, machine_name: `Sheet machine ${n}`, conveyor_name: `Machine conveyor ${n}`, product_name: 'BB SKIN 25G R12', installed_at: '2026-09-01 08:00:00', machine_status: ['running', 'idle', 'maintenance', 'fault'][n - 1], last_breakdown_at: '2026-09-20 10:00:00', breakdown_detail: `Layout summary ${n}`, updated_at: '2026-10-01 10:00:00' }));
  const expected = { machine_name: 'เครื่องทดสอบ M1 <b>safe name</b>', conveyor_name: 'สายพานเครื่องหนึ่ง · independent label', product_name: 'BB SKIN 35G F15', installed_at: '2026-10-01T16:59:00.000Z', machine_status: 'maintenance', last_breakdown_at: '2026-10-01T17:01:00.000Z', breakdown_detail: '<img src=x onerror="window.__unsafeText=true"> สรุป Layout เดิม' };
  records[0] = { machine_id: 'YK-101', ...expected, updated_at: '2026-10-02 00:01:00' };
  const breakdowns = [{ station: 'M1', breakdownStatus: 'Open', rootCause: 'Independent event', createdAt: '2026-10-01T02:00:00Z' }];
  const viewerWrites = [], errors = [], unexpectedRemote = [];
  let readMode = 'success', layoutReads = 0, reverse = false, releaseRead;
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      localStorage.setItem('yakitori-machine-metadata-v3-four-machine', JSON.stringify([{ machine_id: 'YK-101', machine_name: 'UNCONFIRMED DRAFT', product_name: 'UNCONFIRMED DRAFT', status: 'fault' }]));
      localStorage.setItem('yakitori-conveyor-labels-v3-four-machine', JSON.stringify([{ nodeName: 'Yaki Conveyor_Part 16.4m-2', label: 'UNCONFIRMED CONVEYOR' }]));
      localStorage.setItem('yakitori-machine-save-status-v1', 'UNCONFIRMED SAVED TIME');
    });
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      // Block every mutation, including same-origin requests from Viewer.
      if (!['GET', 'HEAD'].includes(req.method())) {
        viewerWrites.push(req.url()); return route.abort();
      }
      if (url.origin === origin) return route.continue();
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '/* Offline browser test uses system fonts. */' });
      if (url.hostname !== 'script.google.com') { unexpectedRemote.push(req.method() + ' ' + req.url()); return route.abort(); }
      if (url.searchParams.get('action') === 'read_breakdown') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', _records: breakdowns }) });
      assert.equal(url.searchParams.get('action'), 'read_machine_layout');
      layoutReads++;
      if (readMode === 'hold') await new Promise(resolve => { releaseRead = resolve; });
      if (readMode === 'offline') return route.abort('internetdisconnected');
      if (readMode === 'http') return route.fulfill({ status: 503, body: 'Unavailable' });
      if (readMode === 'json') return route.fulfill({ contentType: 'application/json', body: '{broken' });
      if (readMode === 'schema') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', records: {} }) });
      if (readMode === 'duplicate') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', records: [...records, records[0]] }) });
      if (readMode === 'status') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', records: records.map(record => ({ ...record, machine_status: 'invalid' })) }) });
      const readRecords = records.map(gasReadRecord);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', records: reverse ? [...readRecords].reverse() : readRecords }) });
    });
    const viewer = await context.newPage();
    viewer.on('pageerror', error => errors.push(error.message));
    await viewer.clock.install();
    await viewer.goto(origin + '/yakitori-machine-3d-viewer/index.html');
    await verifyViewer({ records, viewerWrites, errors, unexpectedRemote,
      setReadMode: mode => { readMode = mode; }, setReverse: value => { reverse = value; }, reads: () => layoutReads, releaseRead: () => releaseRead() }, viewer, expected);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

async function verifyViewer(state, viewer, expected) {
  const { records } = state;
  const field = name => viewer.locator(`[data-layout-field="${name}"]`);
  const summary = viewer.locator('.machine-summary');
  const stage = viewer.locator('.viewer-stage');
  const waitLoaded = () => viewer.waitForFunction(() => document.getElementById('layoutFeedStatus')?.dataset.loading === 'false');
  const refresh = async () => { await viewer.locator('#refreshLayout').click(); await waitLoaded(); };
  const camera = () => stage.getAttribute('data-camera-position');
  await waitLoaded();
  await viewer.waitForFunction(() => document.querySelector('.viewer-stage')?.dataset.cameraPosition);
  const renderedDates = { installed_at: '2026-10-01 23:59', last_breakdown_at: '2026-10-02 00:01' };
  for (const name of editable.filter(name => name !== 'machine_status')) assert.equal(await field(name).textContent(), renderedDates[name] || expected[name], `Viewer reads shared Sheet ${name}`);
  assert.equal(await field('machine_status').textContent(), 'Maintenance');
  assert.equal(await field('updated_at').textContent(), '2026-10-02 00:01:00');
  assert.match(await viewer.locator('#layoutReadAt').textContent(), /Asia\/Bangkok/);
  assert.equal(await viewer.locator('input,textarea,[contenteditable="true"]').count(), 0);
  assert.equal(await viewer.locator('select:not(.machine-select)').count(), 0);
  assert.equal(await viewer.getByRole('button', { name: /unlock|lock|save changes/i }).count(), 0);
  assert.equal(await viewer.evaluate(() => Boolean(window.__unsafeText)), false);
  assert.equal(await summary.locator('img,b').count(), 0, 'HTML fields render as plain text');
  assert.ok(!(await viewer.locator('body').textContent()).includes('UNCONFIRMED'));
  assert.match(await viewer.locator('.configuration-link').getAttribute('href'), /MachineConfiguration\.html\?machine=YK-101$/);
  assert.match(await viewer.locator('.viewer-info-panel').textContent(), /BB SKIN 35G F15/);
  assert.ok((await viewer.locator('.viewer-info-panel').textContent()).includes(expected.machine_name));
  assert.ok((await viewer.locator('.viewer-info-panel').textContent()).includes(expected.conveyor_name));
  await viewer.waitForFunction(() => document.querySelector('.breakdown-status-card.status-open'));
  assert.match(await viewer.locator('.breakdown-status-card.status-open').textContent(), /Independent event/);
  // All operational statuses and immutable node identities use the same Sheet store.
  const statusLabels = ['Maintenance', 'Idle / ไม่ใช้งาน', 'Maintenance', 'Fault'];
  for (let n = 0; n < 4; n++) {
    await viewer.locator('.machine-select').selectOption(records[n].machine_id);
    assert.equal(await summary.getAttribute('data-machine-id'), records[n].machine_id);
    assert.equal(await summary.getAttribute('data-model-node'), nodeNames[n]);
    assert.equal(await field('machine_name').textContent(), records[n].machine_name);
    assert.equal(await field('conveyor_name').textContent(), records[n].conveyor_name);
    assert.equal(await field('machine_status').textContent(), statusLabels[n]);
    assert.equal(await viewer.locator('.selected-chip .status-pill').getAttribute('class'), `status-pill is-${records[n].machine_status}`);
    assert.equal(await viewer.locator('.machine-marker').filter({ hasText: `M${n + 1}` }).getAttribute('class').then(value => value.includes(`is-status-${records[n].machine_status}`)), true);
  }
  const physical = await viewer.locator('.conveyor-label').evaluateAll(nodes => nodes.map(node => [node.dataset.modelNode, node.textContent]).sort());
  assert.ok(physical.some(([node]) => node === 'Yaki Conveyor_Part 16.4m-2'), `physical conveyor DOM: ${JSON.stringify(physical)}`);
  assert.ok(physical.every(([, text]) => !text.includes('Machine conveyor')));
  await viewer.getByTitle('Top view').click();
  await viewer.waitForTimeout(350);
  const before = await camera();
  await viewer.getByTitle('Zoom in').click();
  await viewer.waitForTimeout(350);
  assert.notEqual(await camera(), before, 'camera controls work');
  await viewer.getByTitle('Toggle axes').click();
  await viewer.getByTitle('Toggle grid').click();
  const preservedCamera = await camera();
  state.setReverse(true);
  records[3].machine_name = 'Updated machine four';
  records[3].conveyor_name = 'Distinct machine four conveyor';
  records[3].product_name = 'Gizzard 30G R15';
  await refresh();
  assert.equal(await stage.getAttribute('data-selected-machine'), 'YK-104');
  assert.equal(await field('machine_name').textContent(), 'Updated machine four');
  assert.equal(await field('conveyor_name').textContent(), 'Distinct machine four conveyor');
  assert.equal(await camera(), preservedCamera, 'Layout refresh preserves camera');
  assert.match(await viewer.getByTitle('Toggle axes').getAttribute('class'), /is-active/);
  assert.equal(await viewer.getByTitle('Toggle grid').getAttribute('class'), '');
  assert.deepEqual(await viewer.locator('.conveyor-label').evaluateAll(nodes => nodes.map(node => [node.dataset.modelNode, node.textContent]).sort()), physical, 'shared conveyor labels do not depend on row order');
  const readsBeforeHold = state.reads();
  state.setReadMode('hold');
  await viewer.locator('#refreshLayout').click();
  await viewer.waitForTimeout(100);
  assert.equal(await viewer.locator('#refreshLayout').isDisabled(), true);
  await viewer.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await viewer.waitForTimeout(100);
  assert.equal(state.reads(), readsBeforeHold + 1, 'pending refresh prevents overlapping responses');
  state.setReadMode('success'); state.releaseRead(); await waitLoaded();
  const readsBeforeTimer = state.reads();
  records[3].product_name = 'Timer refreshed product';
  await viewer.clock.fastForward(60001);
  await viewer.waitForFunction(() => document.querySelector('[data-layout-field="product_name"]').textContent === 'Timer refreshed product');
  assert.ok(state.reads() > readsBeforeTimer, '60-second refresh reads the Sheet');
  assert.equal(await camera(), preservedCamera);
  records[3].product_name = 'Visibility refreshed product';
  await viewer.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await viewer.waitForFunction(() => document.querySelector('[data-layout-field="product_name"]').textContent === 'Visibility refreshed product');
  for (const mode of ['offline', 'http', 'json', 'schema', 'duplicate', 'status']) {
    state.setReadMode(mode); await refresh();
    assert.equal(await viewer.locator('#layoutFeedStatus').getAttribute('data-stale'), 'true', `${mode} displays stale confirmed data`);
    assert.match(await viewer.locator('#layoutFeedStatus').textContent(), /ข้อมูลเก่า/);
    assert.equal(await field('product_name').textContent(), 'Visibility refreshed product');
  }
  state.setReadMode('success'); await refresh();
  assert.equal(await viewer.locator('#layoutFeedStatus').getAttribute('data-stale'), 'false');
  const savedRecords = structuredClone(records);
  records.splice(0); await refresh();
  assert.match(await viewer.locator('#layoutFeedStatus').textContent(), /ไม่พบข้อมูล Layout/);
  assert.equal(await field('machine_status').textContent(), 'ไม่พบข้อมูล');
  assert.equal(await field('product_name').textContent(), '—');
  assert.equal(await stage.getAttribute('data-selected-machine'), 'YK-104');
  records.push(...savedRecords); await refresh();
  assert.equal(await field('product_name').textContent(), 'Visibility refreshed product');
  await viewer.setViewportSize({ width: 390, height: 844 });
  assert.ok(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Viewer fits mobile viewport');
  for (const title of ['Isometric view', 'Top view', 'Front view', 'Side view', 'Reset view', 'Fit model', 'Zoom in', 'Zoom out', 'Toggle grid', 'Toggle axes']) {
    const box = await viewer.getByTitle(title).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `mobile control remains accessible: ${title}`);
  }
  const toolbarBox = await viewer.locator('.viewer-toolbar').boundingBox();
  const legendBox = await viewer.locator('.conveyor-legend').boundingBox();
  const breakdownBox = await viewer.locator('#breakdown-status-panel').boundingBox();
  assert.ok(toolbarBox.y + toolbarBox.height <= legendBox.y && legendBox.y + legendBox.height <= breakdownBox.y, 'mobile controls/legend/breakdown do not overlap');
  const screenshots = path.join(root, 'output/machine-viewer-readonly');
  fs.mkdirSync(screenshots, { recursive: true });
  await viewer.screenshot({ path: path.join(screenshots, 'mobile.png'), fullPage: true });
  await viewer.setViewportSize({ width: 768, height: 1024 });
  assert.ok(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Viewer fits tablet viewport');
  await viewer.screenshot({ path: path.join(screenshots, 'tablet.png'), fullPage: true });
  await viewer.setViewportSize({ width: 1440, height: 1000 });
  await viewer.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true });
  // Confirmed cache can survive a failed reload; legacy drafts never supply a status.
  state.setReadMode('offline');
  await viewer.reload(); await waitLoaded();
  assert.equal(await viewer.locator('#layoutFeedStatus').getAttribute('data-stale'), 'true');
  assert.equal(await field('product_name').textContent(), expected.product_name);
  await viewer.evaluate(() => localStorage.removeItem('yakitori-layout-confirmed-v1'));
  await viewer.reload(); await waitLoaded();
  assert.equal(await viewer.locator('#layoutFeedStatus').getAttribute('data-stale'), 'false');
  assert.match(await viewer.locator('#layoutFeedStatus').textContent(), /ยังอ่านข้อมูลไม่ได้/);
  assert.equal(await field('machine_status').textContent(), 'ไม่พบข้อมูล');
  assert.equal(await field('product_name').textContent(), '—');
  assert.ok(!(await viewer.locator('body').textContent()).includes('UNCONFIRMED'));
  state.setReadMode('success');
  assert.deepEqual(state.viewerWrites, [], 'Viewer never writes');
  assert.deepEqual(state.unexpectedRemote, [], 'no unmocked remote traffic');
  assert.deepEqual(state.errors, []);
  console.log('PASS: Viewer seven-field confirmed feed, Bangkok dates, statuses/mapping, safe read-only UI, legacy cache ignored, refresh/camera, row-order conveyor labels, stale errors, empty Sheet, mobile; all mutations blocked');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
