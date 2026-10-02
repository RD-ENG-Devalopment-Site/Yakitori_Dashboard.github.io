// Local HTTP fixture only. All Google traffic is mocked; no production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createGasHarness } = require('./helpers/gas-harness.cjs');
const { chromium } = require('playwright');
const root = path.resolve(__dirname,'..');
function verifyGasWorkflow(report,updates) {
  const h = createGasHarness();
  let uuid = 0;
  const props = {BREAKDOWN_ENVIRONMENT:'sandbox',BREAKDOWN_SIGNING_KEY_fixture:'fixture-only-key',BREAKDOWN_SPREADSHEET_ID:'sandbox-breakdown',BREAKDOWN_WRITES_ENABLED:'true'};
  h.context.PropertiesService = {getScriptProperties:()=>({getProperty:key=>props[key]??null})};
  Object.assign(h.context.Utilities,{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},getUuid:()=>String(++uuid),computeDigest:(_,value)=>Array.from(crypto.createHash('sha256').update(value).digest()),computeHmacSha256Signature:(value,key)=>Array.from(crypto.createHmac('sha256',key).update(value).digest())});
  h.context.LockService = {getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
  h.external.addSheet('MachineLayout_DataLog',[Array.from(h.context.MACHINE_LAYOUT_HEADERS),['YK-101','Machine 1','Conveyor 1','BB SKIN 25G R12','','running','','','2026-10-01 10:00:00']]);
  function canonical(v) { return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v); }
  function sign(op) {
    const request = {...op,auth:{environment:'sandbox',keyId:'fixture',issuedAt:new Date().toISOString(),actor:'verified-fixture',roles:['breakdownAdmin'],stations:['*']}};
    request.auth.signature = crypto.createHmac('sha256',props.BREAKDOWN_SIGNING_KEY_fixture).update(canonical(request)).digest('hex'); return request;
  }
  assert.equal(h.post(sign({protocolVersion:2,requestId:'migration-browser-fixture',action:'migrate_breakdown_schema',payload:{dryRun:false}})).status,'success');
  // The exact payload captured from the browser is passed unchanged to production GAS source.
  const first = h.post(sign(report)); assert.equal(first.status,'success',JSON.stringify(first));
  assert.equal(first.receipt.state,'saved');
  const id = first.receipt.recordId;
  for (const op of updates) {
    const result = h.post(sign({...op,payload:{...op.payload,eventId:id}}));
    assert.equal(result.status,'success',JSON.stringify({action:op.action,payload:op.payload,result}));
    assert.equal(result.receipt.recordId,id);
  }
  const record = h.read({action:'read_breakdown_event',eventId:id}).record;
  assert.equal(record.revision,5); assert.equal(record.breakdownStatus,'Closed'); assert.equal(record.durationMin,30);
  assert.equal(h.external.getSheetByName('MachineBreakdownLog').rows.length,2);
  const stale = h.post(sign({protocolVersion:2,requestId:'stale-ui-fixture',action:'update_breakdown',expectedRevision:1,payload:{eventId:id,note:'stale'}}));
  assert.equal(stale.code,'REVISION_CONFLICT'); assert.equal(stale.state,'rejected');
  const invalid = h.post(sign({...report,requestId:'invalid-ui-fixture',payload:{...report.payload,symptom:''}}));
  assert.equal(invalid.code,'VALIDATION'); assert.equal(invalid.state,'rejected');
  console.log('PASS actual browser report + lifecycle payloads through GAS source harness (verified fixture signature, no network)');
  return invalid;
}
async function run() {
  const server = http.createServer((req,res) => {
    const file = path.resolve(root,'.' + new URL(req.url,'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)] || 'text/plain');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const output = path.join(root,'output/breakdown-workflow'); fs.mkdirSync(output,{recursive:true});
    const context = await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:output,size:{width:1440,height:1000}}});
    const errors = [], googlePosts = [];
    await context.route('https://script.google.com/**',route => {
      if (route.request().method() !== 'GET') { googlePosts.push(route.request().postData()); return route.fulfill({status:403,body:'blocked'}); }
      const action = new URL(route.request().url()).searchParams.get('action');
      return route.fulfill({contentType:'application/json',body:JSON.stringify(action === 'read_machine_layout' ? {status:'success',records:[1,2,3,4].map(n=>({machine_id:'YK-10'+n,product_name:'BB SKIN 25G R12',machine_status:'running',updated_at:'2026-10-01 10:00:00'}))} : {status:'success',_records:[],writeProtocolVersion:1})});
    });
    await context.addInitScript(() => {
      const records = JSON.parse(sessionStorage.getItem('fixture-records') || 'null') || [{eventId:'BD-other',station:'M2',machineId:'YK-102',productCode:'BBSKINR12',shift:'B',breakdownStatus:'Closed',revision:1,startedAt:'2026-10-01T01:00:00Z',restoredAt:'2026-10-01T01:30:00Z',symptom:'Other'}];
      let unknown = false, feedFails = false, nextRejection = null;
      const receipts = new Map(), calls = [];
      const canonical = value => Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : value && typeof value === 'object' ? '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}' : JSON.stringify(value);
      window.fixture = {records,calls,setUnknown:v=>unknown=v,setFeedFails:v=>feedFails=v,rejectNext:v=>nextRejection=v};
      window.BREAKDOWN_TRANSPORT = {
        health:async()=>({writeProtocolVersion:2,breakdownWritesEnabled:true,readableTransport:true,session:{authenticated:true,subject:'fixture-user',roles:[sessionStorage.getItem('fixture-role')||'breakdownAdmin'],stations:['*']}}),
        readRecords:async()=>{ if(feedFails) throw new Error('fixture offline'); return {status:'success',_records:records,asOf:new Date().toISOString()}; },
        readEvent:async id=>({status:'success',record:records.find(r=>r.eventId===id)||null,audit:[{revision:1,action:'record_breakdown',reason:'<img src=x onerror=alert(1)>'}]}),
        submit:async op=>{
          calls.push(op);
          if (nextRejection) { const rejection = nextRejection; nextRejection = null; return rejection; }
          if (receipts.has(op.requestId)) return receipts.get(op.requestId);
          const old = records.find(r=>r.eventId===op.payload.eventId);
          if(op.expectedRevision !== undefined && old?.revision !== op.expectedRevision) return {state:'rejected',code:'REVISION_CONFLICT'};
          const record = {...old,...op.payload,eventId:old?.eventId||'BD-fixture',revision:(old?.revision||0)+1,breakdownStatus:op.action==='close_breakdown'?'Closed':op.payload.breakdownStatus||old?.breakdownStatus||'Open'};
          if(old) records.splice(records.indexOf(old),1,record); else records.push(record);
          sessionStorage.setItem('fixture-records',JSON.stringify(records));
          const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical({action:op.action,expectedRevision:op.expectedRevision??null,payload:op.payload})));
          const result = {record,receipt:{protocolVersion:2,requestId:op.requestId,action:op.action,payloadHash:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),recordId:record.eventId,revision:record.revision,state:'saved',savedAt:new Date().toISOString()}};
          receipts.set(op.requestId,result);
          if(unknown) {unknown=false;throw new Error('response lost');}
          return result;
        },
        status:async id=>receipts.get(id)||{state:'unknown'}
      };
    });
    const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    const origin = 'http://127.0.0.1:' + server.address().port;
    await page.goto(origin+'/MachineBreakdownLog.html');
    await page.waitForFunction(()=>document.querySelector('[data-machine-product="M1"]').textContent==='BB SKIN 25G R12');
    const originalTheme = await page.evaluate(() => ({
      bodyFont: getComputedStyle(document.body).fontFamily,
      panel: getComputedStyle(document.querySelector('header.card')).backgroundColor,
      primary: getComputedStyle(document.getElementById('saveReport')).backgroundColor,
      field: getComputedStyle(document.querySelector('[name="startedAt"]')).backgroundColor,
      navigation: getComputedStyle(document.querySelector('.recording-nav')).textDecorationLine,
      eyebrow: document.querySelector('.bd-log-eyebrow').textContent
    }));
    assert.match(originalTheme.bodyFont,/Sarabun/);
    assert.equal(originalTheme.panel,'rgb(27, 27, 41)');
    assert.equal(originalTheme.primary,'rgb(255, 199, 0)');
    assert.equal(originalTheme.field,'rgb(21, 21, 33)');
    assert.equal(originalTheme.navigation,'none');
    assert.equal(originalTheme.eyebrow,'Internal Factory Tool');
    assert.equal(await page.locator('[name="productLine"]').inputValue(),'BBSKINR12');
    assert.equal(await page.locator('select[data-machine-status],select[data-machine-product]').count(),0);
    await page.locator('[name="symptom"]').fill('<img src=x onerror=window.attacked=true> ไม้ค้าง');
    await page.locator('[name="startedAt"]').fill('2026-09-29T23:50');
    await page.evaluate(()=>fixture.setUnknown(true));
    await page.locator('#saveReport').click();
    await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('ยังยืนยันผลไม่ได้'));
    assert.equal(await page.locator('[name="symptom"]').inputValue(),'<img src=x onerror=window.attacked=true> ไม้ค้าง');
    await page.locator('#checkReceipt').click();
    await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('ยืนยันบันทึกแล้ว'));
    assert.equal(await page.evaluate(()=>fixture.calls.length),1);
    assert.equal(await page.evaluate(()=>fixture.records.length),2);
    const reportOperation = await page.evaluate(()=>fixture.calls[0]);
    assert.equal(await page.locator('#breakdownHistory img').count(),0);
    for (const width of [1440,768,390]) { await page.setViewportSize({width,height:1000}); assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); await page.screenshot({path:path.join(output,'log-'+width+'.png'),fullPage:true}); }
    await page.goto(origin+'/MachineBreakdownEventDetail.html?id=BD-fixture');
    await page.waitForFunction(()=>!document.getElementById('detailApp').hidden);
    await page.locator('[name="owner"]').fill('ช่างซ่อม');
    await page.locator('[name="assignedAt"]').fill('2026-09-29T23:55');
    await page.locator('[data-action="assign"]').click();
    await page.waitForFunction(()=>fixture.records.find(r=>r.eventId==='BD-fixture').revision===2);
    await page.locator('[name="repairStartedAt"]').fill('2026-09-30T00:00');
    await page.locator('[data-action="repair"]').click();
    await page.waitForFunction(()=>fixture.records.find(r=>r.eventId==='BD-fixture').revision===3);
    await page.locator('[name="confirmedRootCause"]').fill('sensor ชำรุด');
    await page.locator('[name="actionTaken"]').fill('เปลี่ยน sensor');
    await page.locator('[name="restoredAt"]').fill('2026-09-30T00:20');
    await page.locator('[data-action="monitor"]').click();
    await page.waitForFunction(()=>fixture.records.find(r=>r.eventId==='BD-fixture').breakdownStatus==='Monitoring');
    await page.locator('[data-action="close"]').click();
    assert.match(await page.locator('#feedback').textContent(),/ข้อมูลปิดงานไม่ครบ/);
    await page.locator('[name="verifiedBy"]').fill('ผู้ตรวจรับ');
    await page.locator('[name="verifiedAt"]').fill('2026-09-30T00:30');
    await page.locator('[name="verificationResult"]').fill('ทดลองเดินผ่าน');
    await page.locator('[data-action="close"]').click();
    await page.waitForFunction(()=>fixture.records.find(r=>r.eventId==='BD-fixture').breakdownStatus==='Closed');
    assert.equal(await page.evaluate(()=>fixture.records.length),2);
    assert.equal(await page.evaluate(()=>fixture.records.find(r=>r.eventId==='BD-fixture').revision),5);
    const workflowOperations = await page.evaluate(()=>fixture.calls);
    const actualValidationRejection = verifyGasWorkflow(reportOperation,workflowOperations);
    // Detail must not switch to a different event.
    await page.goto(origin+'/MachineBreakdownEventDetail.html?id=missing');
    await page.waitForFunction(()=>!document.getElementById('emptyState').hidden);
    assert(await page.locator('#detailApp').isHidden());
    // Independent page fixture exposes an existing exact ID and safe audit text.
    await page.goto(origin+'/MachineBreakdownEventDetail.html?id=BD-other');
    await page.waitForFunction(()=>!document.getElementById('detailApp').hidden);
    assert.equal(await page.locator('#metricId').textContent(),'BD-other');
    assert.equal(await page.locator('#detailTimeline img').count(),0);
    await page.locator('[name="owner"]').fill('ช่าง');
    await page.locator('[name="actionTaken"]').fill('เปลี่ยน sensor');
    await page.locator('[name="correctionReason"]').fill('แก้ข้อมูลตรวจรับ');
    await page.locator('[data-action="correct"]').click();
    await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('ยืนยันบันทึกแล้ว'));
    assert.equal(await page.evaluate(()=>fixture.calls[0].expectedRevision),1);
    assert.equal(await page.evaluate(()=>fixture.records.length),2);
    await page.screenshot({path:path.join(output,'detail-390.png'),fullPage:true});
    await page.goto(origin+'/MachineBreakdownEvents.html');
    await page.waitForFunction(()=>document.getElementById('eventsCountLabel').textContent==='2 / 2 events');
    await page.locator('[name="station"]').selectOption('M1');
    assert.equal(await page.locator('#eventsCountLabel').textContent(),'1 / 2 events');
    await page.locator('[name="station"]').selectOption('M2');
    await page.locator('[name="shift"]').selectOption('A');
    assert.equal(await page.locator('#eventsCountLabel').textContent(),'0 / 2 events');
    await page.locator('[name="shift"]').selectOption('B');
    assert.equal(await page.locator('#eventsCountLabel').textContent(),'1 / 2 events');
    await page.evaluate(()=>fixture.setFeedFails(true)); await page.locator('#reloadEvents').click();
    await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('stale'));
    assert.equal(await page.locator('#eventsCountLabel').textContent(),'1 / 2 events');
    await page.evaluate(()=>{fixture.setFeedFails(false);fixture.records.splice(0);}); await page.locator('#reloadEvents').click();
    await page.waitForFunction(()=>document.getElementById('eventsCountLabel').textContent==='0 / 0 events');
    // A machine that has actually been restored may report a new stop, linked to the Monitoring event.
    await page.evaluate(()=>sessionStorage.setItem('fixture-records',JSON.stringify([{eventId:'BD-monitoring',station:'M1',machineId:'YK-101',productCode:'BBSKINR12',shift:'A',eventType:'Machine',stopCategory:'Machine',isMachineFailure:true,breakdownStatus:'Monitoring',revision:4,startedAt:'2026-09-29T16:50:00Z',restoredAt:'2026-09-29T17:20:00Z',symptom:'Previous stop'}])));
    await page.goto(origin+'/MachineBreakdownLog.html');
    await page.waitForFunction(()=>document.querySelector('[data-machine-product="M1"]').textContent==='BB SKIN 25G R12');
    await page.locator('[name="startedAt"]').fill('2026-10-01T08:00');
    await page.locator('[name="symptom"]').fill('เครื่องหยุดซ้ำหลังคืนเครื่อง');
    await page.locator('#saveReport').click();
    await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('ยืนยันบันทึกแล้ว'));
    assert.equal(await page.evaluate(()=>fixture.calls[0].payload.relatedEventId),'BD-monitoring');
    assert.equal(await page.evaluate(()=>fixture.calls[0].payload.layoutSnapshotSource),'configuration');
    assert.equal(await page.evaluate(()=>fixture.calls[0].payload.isMachineStop),true);
    // Process and planned events do not acquire the active machine-failure guard.
    await page.goto(origin+'/MachineBreakdownLog.html');
    await page.waitForFunction(()=>document.querySelector('[data-machine-product="M1"]').textContent==='BB SKIN 25G R12');
    await page.locator('[name="eventType"]').selectOption('Process');
    await page.locator('[name="symptom"]').fill('รอวัตถุดิบ');
    await page.locator('#saveReport').click();
    await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('ยืนยันบันทึกแล้ว'));
    assert.equal(await page.evaluate(()=>fixture.calls[0].payload.isMachineStop),false);
    assert.equal(await page.evaluate(()=>fixture.calls[0].payload.relatedEventId),undefined);
    await page.locator('[name="eventType"]').selectOption('Planned');
    await page.locator('[name="symptom"]').fill('หยุดตามแผน');
    await page.locator('#saveReport').click();
    await page.waitForFunction(()=>fixture.calls.length===2);
    assert.equal(await page.evaluate(()=>fixture.calls[1].payload.isMachineStop),false);
    await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('ยืนยันบันทึกแล้ว'));
    // Use the actual GAS error shape rather than a handwritten rejected fixture.
    await page.evaluate(rejection=>fixture.rejectNext(rejection),actualValidationRejection);
    await page.locator('[name="eventType"]').selectOption('Process');
    await page.locator('[name="symptom"]').fill('เก็บข้อความเมื่อ server ปฏิเสธ');
    await page.locator('#saveReport').click();
    await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('ระบบไม่รับคำขอ'));
    assert.equal(await page.locator('[name="symptom"]').inputValue(),'เก็บข้อความเมื่อ server ปฏิเสธ');
    assert(await page.locator('#checkReceipt').isHidden());
    assert(await page.locator('#saveReport').isEnabled());
    // Server-verified reporter role cannot operate detail workflow controls.
    await page.evaluate(()=>sessionStorage.setItem('fixture-role','breakdownReporter'));
    await page.goto(origin+'/MachineBreakdownEventDetail.html?id=BD-fixture');
    await page.waitForFunction(()=>!document.getElementById('detailApp').hidden);
    assert.equal(await page.locator('[data-action]:enabled').count(),0);
    // Backfill assigns schema/revision, not trustworthy timestamps or actionable status.
    await page.evaluate(()=>{
      sessionStorage.setItem('fixture-role','breakdownAdmin');
      sessionStorage.setItem('fixture-records',JSON.stringify([{eventId:'BD-legacy',station:'M1',machineId:'YK-101',productCode:'BBSKINR12',shift:'A',breakdownStatus:'Open',repairStage:'Reported',revision:1,schemaVersion:2,breakdownDate:'2026-09-01',startTime:'10:00',symptom:'บันทึกเดิม'}]));
    });
    await page.goto(origin+'/MachineBreakdownEventDetail.html?id=BD-legacy');
    await page.waitForFunction(()=>!document.getElementById('detailApp').hidden);
    assert(await page.locator('#legacyWarning').isVisible());
    assert.match(await page.locator('#legacyWarning').textContent(),/legacy_incomplete/);
    assert.equal(await page.locator('[data-action="assign"]:enabled,[data-action="repair"]:enabled,[data-action="update"]:enabled,[data-action="monitor"]:enabled,[data-action="close"]:enabled').count(),0);
    assert(await page.locator('[data-action="correct"]').isEnabled());
    assert(await page.locator('[data-action="void"]').isEnabled());
    assert.equal(googlePosts.length,0); assert.deepEqual(errors,[]);
    await context.close();
    console.log('PASS breakdown mock browser: exact receipt recovery, same request, drafts, XSS, exact ID, revision correction, filters, stale/empty and 1440/768/390. No production writes.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
