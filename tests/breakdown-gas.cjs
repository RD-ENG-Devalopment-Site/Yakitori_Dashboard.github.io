const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createGasHarness}=require('./helpers/gas-harness.cjs');

function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
function fixture({enabled=true}={}){
  const h=createGasHarness();let uuid=0,releases=0;
  const props={BREAKDOWN_ENVIRONMENT:'sandbox',BREAKDOWN_SIGNING_KEY_test:'test-only-not-a-real-secret',BREAKDOWN_SPREADSHEET_ID:'sandbox-sheet',BREAKDOWN_WRITES_ENABLED:String(enabled)};
  h.context.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null})};
  Object.assign(h.context.Utilities,{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},getUuid:()=>String(++uuid),computeDigest:(_,v)=>Array.from(crypto.createHash('sha256').update(v).digest()),computeHmacSha256Signature:(v,key)=>Array.from(crypto.createHmac('sha256',key).update(v).digest())});
  h.context.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{releases++;}})};
  h.external.addSheet('MachineLayout_DataLog',[
    Array.from(h.context.MACHINE_LAYOUT_HEADERS),
    ...[1,2,3,4].map(i=>['YK-10'+i,'Machine '+i,'Conveyor',i%2?'BL 23G R15 (M1)':'BB SKIN 35G F15','','running','','',''])
  ]);
  function signed(action,payload={},extra={}){
    const r={protocolVersion:2,requestId:'request-'+(++uuid),action,payload,...extra};
    r.auth={environment:'sandbox',keyId:'test',issuedAt:new Date().toISOString(),actor:'verified-sub-1',roles:['breakdownAdmin'],stations:['*'],...extra.auth};
    delete r.auth.signature;r.auth.signature=crypto.createHmac('sha256',props.BREAKDOWN_SIGNING_KEY_test).update(canonical(r)).digest('hex');return r;
  }
  h.signed=signed;h.props=props;h.releases=()=>releases;h.migrate=()=>h.post(signed('migrate_breakdown_schema',{dryRun:false}));
  h.create=(payload={})=>signed('record_breakdown',{station:'M1',machineId:'YK-101',productCode:'BL23G_M1',productNameSnapshot:'Example',layoutSnapshotSource:'confirmed',shift:'A',eventType:'Machine',stopCategory:'Machine',symptom:'Sensor blocked',severity:'Medium',startedAt:'2026-09-29T23:50:00+07:00',...payload});
  return h;
}
function receipt(h,r){const result=h.post(r);assert.equal(result.status,'success',JSON.stringify(result));assert.equal(result.receipt.state,'saved');return result.receipt;}

test('unsigned, bad signature, wrong role, wrong environment, expired and default gate reject before Sheet access',()=>{
  const h=fixture({enabled:false});
  const cases=[{action:'record_breakdown',payload:{}},h.create(),h.create({},),h.signed('record_breakdown',{}, {auth:{roles:['viewer']}}),h.signed('record_breakdown',{}, {auth:{environment:'production'}}),h.signed('record_breakdown',{}, {auth:{issuedAt:'2020-01-01T00:00:00Z'}})];
  cases[2].auth.signature='0'.repeat(64);
  for(const r of cases)assert.equal(h.post(r).status,'error');
  assert.equal(h.reads.length,0);assert.equal(h.mutations.length,0);
  assert.equal(h.post({action:'create_breakdown_sheet'}).code,'FORBIDDEN');
  assert.throws(()=>h.context.saveBreakdownRecord_({}),/Legacy/);
  assert.throws(()=>h.context.createBreakdownSheet_(),/migration/);
});
test('signed dry-run is lookup-only; additive migration retains reordered/custom columns and detects ambiguous IDs',()=>{
  const h=fixture();h.external.addSheet('MachineBreakdownLog',[['note','eventId','customFormula'],['old','=BD-old','=SUM(1,2)']]);
  const before=JSON.stringify(h.external.getSheetByName('MachineBreakdownLog').rows);
  h.mutations.length=0;
  assert.equal(h.post(h.signed('migrate_breakdown_schema',{dryRun:true})).status,'success');assert.equal(h.mutations.length,0);
  assert.equal(h.migrate().status,'success');const migrated=h.external.getSheetByName('MachineBreakdownLog').rows;assert.deepEqual(migrated[1].slice(0,3),JSON.parse(before)[1]);assert.equal(migrated[1][migrated[0].indexOf('revision')],1);assert.equal(migrated[1][migrated[0].indexOf('startedAt')],undefined);
  const bad=fixture();bad.external.addSheet('MachineBreakdownLog',[['eventId','eventId'],['same','same']]);
  assert.equal(bad.migrate().code,'MIGRATION_AMBIGUOUS');assert.equal(bad.mutations.length,0);
});
test('storage must be explicit for writes and remains common for all machine/product mappings',()=>{
  const h=fixture();delete h.props.BREAKDOWN_SPREADSHEET_ID;
  assert.equal(h.post(h.create()).code,'STORAGE_REQUIRED');assert.equal(h.reads.length,0);
  h.props.BREAKDOWN_SPREADSHEET_ID='sandbox-sheet';h.migrate();
  for(let i=1;i<=4;i++)receipt(h,h.create({station:'M'+i,machineId:'YK-10'+i,productCode:i%2?'BL23G_M1':'BBSKINF15',shift:i%2?'A':'B'}));
  assert.equal(h.external.getSheetByName('MachineBreakdownLog').rows.length,5);
  assert.equal(h.active.getSheetByName('MachineBreakdownLog'),null);
});
test('single event lifecycle uses same ID, revisions and offset-aware 30-minute downtime, private fields excluded',()=>{
  const h=fixture();h.migrate();const first=receipt(h,h.create({symptom:'=HYPERLINK("bad")',note:'private note'}));
  const common={eventId:first.recordId,owner:'Technician',assignedAt:'2026-09-29T23:55:00+07:00',repairStage:'Repairing',repairStartedAt:'2026-09-30T00:00:00+07:00'};
  receipt(h,h.signed('update_breakdown',common,{expectedRevision:1}));
  receipt(h,h.signed('update_breakdown',{eventId:first.recordId,breakdownStatus:'Monitoring',restoredAt:'2026-09-30T00:20:00+07:00',actionTaken:'Replace sensor'},{expectedRevision:2}));
  const closed=receipt(h,h.signed('close_breakdown',{eventId:first.recordId,verifiedBy:'Inspector',verifiedAt:'2026-09-30T00:30:00+07:00',verificationResult:'Passed',causePending:true,causePendingReason:'Under investigation'},{expectedRevision:3}));
  assert.equal(closed.recordId,first.recordId);assert.equal(closed.revision,4);assert.equal(h.external.getSheetByName('MachineBreakdownLog').rows.length,2);
  const result=h.read({action:'read_breakdown_event',eventId:first.recordId});assert.equal(result.record.durationMin,30);assert.equal(result.record.symptom,'=HYPERLINK("bad")');assert.equal(result.record.createdAt,h.read({action:'read_breakdown'})._records[0].createdAt);
  assert.doesNotMatch(JSON.stringify(result),/payloadHash|lastRequestId|verified-sub|private note/);
  assert.equal(h.read({action:'read_breakdown_event',eventId:'absent'}).code,'NOT_FOUND');
});
test('identical retry returns exact hash receipt; request reuse/active stop/revision conflicts never overwrite',()=>{
  const h=fixture();h.migrate();const r=h.create();const first=receipt(h,r);const effects=h.mutations.length;
  assert.deepEqual(receipt(h,r),first);assert.equal(h.mutations.length,effects);
  assert.equal(first.payloadHash,crypto.createHash('sha256').update(canonical({action:r.action,expectedRevision:null,payload:r.payload})).digest('hex'));
  assert.equal(h.post(h.signed(r.action,{...r.payload,symptom:'different'},{requestId:r.requestId})).code,'REQUEST_CONFLICT');
  assert.equal(h.post(h.create()).code,'ACTIVE_EVENT_CONFLICT');
  receipt(h,h.signed('update_breakdown',{eventId:first.recordId,note:'first edit'},{expectedRevision:1}));
  assert.equal(h.post(h.signed('update_breakdown',{eventId:first.recordId,note:'stale'},{expectedRevision:1})).code,'REVISION_CONFLICT');
});
test('unknown/protected fields, invalid dates, mappings and closure reject without mutation',()=>{
  const h=fixture();h.migrate();
  const bad=[{durationMin:99},{actor:'fake'},{sheet:'evil'},{symptom:'x'.repeat(501)},{startedAt:'2026-02-31T12:00:00+07:00'},{startedAt:'2026-09-29T12:00:00'},{machineId:'YK-104'},{productCode:'constructor'},{shift:'C'},{severity:'Impossible'}];
  const effects=h.mutations.length;
  for(const p of bad)assert.equal(h.post(h.create(p)).code,'VALIDATION');assert.equal(h.mutations.length,effects);
  const first=receipt(h,h.create());const baseline=h.mutations.length;
  assert.equal(h.post(h.signed('close_breakdown',{eventId:first.recordId},{expectedRevision:1})).code,'VALIDATION');assert.equal(h.mutations.length,baseline);
});
test('crashes after intent/business/audit/receipt reconcile without duplicate event or revision',()=>{
  for(const target of ['MutationIntents','MachineBreakdownLog','MachineBreakdownAudit','WriteReceipts']){
    const h=fixture();h.migrate();const request=h.create();const sheet=h.external.getSheetByName(target),append=sheet.appendRow;let fail=true;
    sheet.appendRow=function(values){const result=append(values);if(fail){fail=false;throw new Error('Injected response loss after '+target);}return result;};
    assert.equal(h.post(request).status,'error');
    const saved=receipt(h,request);assert.equal(saved.revision,1);assert.equal(h.external.getSheetByName('MachineBreakdownLog').rows.length,2);assert.equal(h.external.getSheetByName('WriteReceipts').rows.length,2);assert.equal(h.external.getSheetByName('MachineBreakdownAudit').rows.length,2);assert.ok(h.releases()>=3);
  }
});
test('update crash after atomic row mutation recovers; tampered state remains unknown without overwrite',()=>{
  const h=fixture();h.migrate();const first=receipt(h,h.create()),sheet=h.external.getSheetByName('MachineBreakdownLog'),getRange=sheet.getRange;
  let fail=true;sheet.getRange=function(...args){const range=getRange(...args),set=range.setValues;range.setValues=function(v){const result=set(v);if(fail&&args[0]===2){fail=false;throw new Error('crash');}return result;};return range;};
  const update=h.signed('update_breakdown',{eventId:first.recordId,note:'updated'},{expectedRevision:1});assert.equal(h.post(update).status,'error');assert.equal(receipt(h,update).revision,2);assert.equal(sheet.rows.length,2);
  const other=fixture();other.migrate();const s=other.external.getSheetByName('MachineBreakdownLog');s.appendRow=function(){throw new Error('before business');};const r=other.create();assert.equal(other.post(r).status,'error');const intents=other.external.getSheetByName('MutationIntents').rows;const id=intents[1][intents[0].indexOf('recordId')];s.rows.push(s.rows[0].map(header=>header==='eventId'?id:header==='revision'?44:''));
  assert.equal(other.post(r).code,'UNKNOWN');assert.equal(s.rows.length,2);
});
test('status is actor-scoped and never exposes another actor receipt; lock busy has zero effects',()=>{
  const h=fixture();h.migrate();const r=h.create(),saved=receipt(h,r);
  assert.deepEqual(h.post(h.signed('read_write_status',{requestId:r.requestId})).receipt,saved);
  assert.equal(h.post(h.signed('read_write_status',{requestId:r.requestId},{auth:{actor:'other-sub'}})).state,'not_found');
  const effects=h.mutations.length;h.context.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock:()=>assert.fail('not acquired')})};assert.equal(h.post(h.create({station:'M2',machineId:'YK-102'})).code,'BUSY');assert.equal(h.mutations.length,effects);
});
test('correction/void requires admin and reason, produces audit, preserves custom formula',()=>{
  const h=fixture();h.migrate();const first=receipt(h,h.create()),sheet=h.external.getSheetByName('MachineBreakdownLog');sheet.rows[0].push('customFormula');sheet.rows[1].push('=SUM(1,2)');
  assert.equal(h.post(h.signed('correct_breakdown',{eventId:first.recordId,voidedAt:'2026-09-30T00:20:00+07:00',voidReason:'Wrong machine'},{expectedRevision:1})).code,'VALIDATION');
  receipt(h,h.signed('correct_breakdown',{eventId:first.recordId,correctionReason:'Wrong machine',voidedAt:'2026-09-30T00:20:00+07:00',voidReason:'Wrong machine'},{expectedRevision:1}));
  assert.equal(sheet.rows[1].at(-1),'=SUM(1,2)');assert.equal(h.external.getSheetByName('MachineBreakdownAudit').rows.length,3);
});
test('signed private detail exposes audit only with station permission and is lookup-only even with pending intents',()=>{
  const h=fixture();h.migrate();const saved=receipt(h,h.create());const mutations=h.mutations.length;
  const detail=h.post(h.signed('read_breakdown_event',{eventId:saved.recordId}));assert.equal(detail.status,'success');assert.equal(detail.audit.length,1);assert.equal(detail.audit[0].actor,'verified-sub-1');assert.equal(detail.record.payloadHash,undefined);
  assert.equal(h.post(h.signed('read_breakdown_event',{eventId:saved.recordId},{auth:{stations:['M2']}})).code,'FORBIDDEN');assert.equal(h.mutations.length,mutations);
});
test('fresh invalid/forbidden requests do not recover an unrelated pending business mutation',()=>{
  const h=fixture();h.migrate();const sheet=h.external.getSheetByName('MachineBreakdownLog');const append=sheet.appendRow;let fail=true;sheet.appendRow=v=>{if(fail){fail=false;throw new Error('before business');}return append(v);};
  const original=h.create();assert.equal(h.post(original).status,'error');const effects=h.mutations.length;
  assert.equal(h.post(h.create({symptom:''})).code,'VALIDATION');
  assert.equal(h.post(h.signed('record_breakdown',h.create().payload,{auth:{stations:['M2']}})).code,'FORBIDDEN');assert.equal(h.mutations.length,effects);assert.equal(sheet.rows.length,1);
  assert.equal(receipt(h,original).revision,1);
});
test('UTF8 body limit, literal apostrophes/formulas, zero/false custom cells and timeline order',()=>{
  const h=fixture();h.migrate();assert.equal(h.post(h.signed('record_breakdown',{note:'ก'.repeat(24000)})).code,'PAYLOAD_TOO_LARGE');
  const first=receipt(h,h.create({symptom:"'=literal formula-looking",note:'=1+1'})),sheet=h.external.getSheetByName('MachineBreakdownLog');sheet.rows[0].push('zero','flag');sheet.rows[1].push(0,false);
  assert.equal(h.read({action:'read_breakdown'})._records[0].symptom,"'=literal formula-looking");
  const bad=h.signed('update_breakdown',{eventId:first.recordId,owner:'T',repairStage:'Repairing',assignedAt:'2026-09-30T00:10:00+07:00',repairStartedAt:'2026-09-30T00:00:00+07:00'},{expectedRevision:1});assert.equal(h.post(bad).code,'VALIDATION');
  receipt(h,h.signed('update_breakdown',{eventId:first.recordId,note:'edited'},{expectedRevision:1}));assert.equal(sheet.rows[1].at(-2),0);assert.equal(sheet.rows[1].at(-1),false);
});
test('Configuration mismatch/staleness rejects; manual override needs admin/reason; planned stops not failures',()=>{
  const h=fixture();h.migrate();const effects=h.mutations.length;
  const mismatch=h.post(h.create({productCode:'BBSKINR12'}));assert.equal(mismatch.code,'LAYOUT_CONFLICT');assert.equal(mismatch.state,'rejected');assert.equal(h.post(h.create({layoutRevisionSnapshot:'forged-version'})).code,'LAYOUT_CONFLICT');assert.equal(h.mutations.length,effects);
  const missing=fixture();missing.migrate();missing.external.getSheetByName('MachineLayout_DataLog').rows.splice(1);const unavailable=missing.post(missing.create());assert.equal(unavailable.code,'LAYOUT_UNAVAILABLE');assert.equal(unavailable.state,'rejected');
  const manual=h.create({productCode:'BBSKINR12',layoutSnapshotSource:'manual',layoutSnapshotReason:'Historical incident reviewed',isHistorical:true});assert.equal(h.post(h.signed(manual.action,manual.payload,{auth:{roles:['breakdownReporter']}})).code,'FORBIDDEN');
  receipt(h,manual);const planned=receipt(h,h.create({eventType:'Planned',stopCategory:'Planned'}));const record=h.read({action:'read_breakdown_event',eventId:planned.recordId}).record;assert.equal(record.isMachineStop,false);assert.equal(record.isMachineFailure,false);assert.equal(record.productNameSnapshot,'BL 23G R15 (M1)');
});
test('station-moving correction needs both original and resulting station scopes',()=>{
  const h=fixture();h.migrate();const first=receipt(h,h.create()),effects=h.mutations.length;
  const correction={eventId:first.recordId,station:'M2',machineId:'YK-102',correctionReason:'Wrong machine'};
  assert.equal(h.post(h.signed('correct_breakdown',correction,{expectedRevision:1,auth:{stations:['M2']}})).code,'FORBIDDEN');
  assert.equal(h.post(h.signed('correct_breakdown',correction,{expectedRevision:1,auth:{stations:['M1']}})).code,'FORBIDDEN');
  assert.equal(h.mutations.length,effects);
  assert.equal(h.post(h.signed('correct_breakdown',correction,{expectedRevision:1})).code,'LAYOUT_CONFLICT');
  const corrected=receipt(h,h.signed('correct_breakdown',{...correction,productCode:'BBSKINF15',layoutRevisionSnapshot:''},{expectedRevision:1}));
  assert.equal(h.read({action:'read_breakdown_event',eventId:corrected.recordId}).record.productNameSnapshot,'BB SKIN 35G F15');
});
test('definitive validation errors are rejected, uncertain failures stay unknown/pending, stage cannot regress',()=>{
  const h=fixture();h.migrate();assert.equal(h.post(h.create({symptom:''})).state,'rejected');
  const first=receipt(h,h.create());receipt(h,h.signed('update_breakdown',{eventId:first.recordId,owner:'T',assignedAt:'2026-09-29T23:55:00+07:00',repairStage:'Repairing',repairStartedAt:'2026-09-30T00:00:00+07:00'},{expectedRevision:1}));
  const effects=h.mutations.length;const result=h.post(h.signed('update_breakdown',{eventId:first.recordId,repairStage:'Assigned'},{expectedRevision:2}));assert.equal(result.code,'VALIDATION');assert.equal(result.state,'rejected');assert.equal(h.mutations.length,effects);
  h.context.LockService={getScriptLock:()=>({tryLock:()=>false})};assert.equal(h.post(h.create()).state,'pending');
  const other=fixture();other.migrate();other.external.getSheetByName('MachineBreakdownLog').appendRow=()=>{throw new Error('failure');};assert.equal(other.post(other.create()).state,'unknown');
});
