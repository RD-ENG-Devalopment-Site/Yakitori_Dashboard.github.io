// Preparatory signed GAS adapter. BFF OAuth/session/CSRF and central write cutover are not deployed.
var BREAKDOWN_V2_HEADERS = ("eventId createdAt breakdownDate line shift machineVersion conveyorPosition machineArea station eventType severity breakdownStatus startTime endTime durationMin lossProxy impactOutput affectedTrial rootCause actionTaken owner submitter note recordType schemaVersion revision updatedAt machineId productCode productNameSnapshot layoutRevisionSnapshot layoutSnapshotSource symptom component stopCategory isMachineFailure batchRef repairStage assignedAt repairStartedAt startedAt restoredAt closedAt confirmedRootCause causePending causePendingReason verifiedBy verifiedAt verificationResult manpowerSnapshot lineRateSticksPerHourSnapshot estimatedOutputLoss lossMethod relatedEventId voidedAt voidReason lastRequestId payloadHash layoutSnapshotReason correctionReason isHistorical isMachineStop literalTextJson").split(" ");
var BREAKDOWN_LEDGER_HEADERS = ["requestId", "actor", "action", "payloadHash", "recordId", "revision", "state", "savedAt", "beforeJson", "afterJson", "receiptJson", "literalTextJson"];
function breakdownError_(code,message){
  var e=new Error(message);
  e.code=code;
  throw e;
}
function breakdownProperties_(){
  return typeof PropertiesService==="undefined"?{
    getProperty:function(){
      return null;
    }
  }:PropertiesService.getScriptProperties();
}
function breakdownWritesEnabled_(){
  return breakdownProperties_().getProperty("BREAKDOWN_WRITES_ENABLED")==="true";
}
function breakdownSpreadsheet_(){
  var id=breakdownProperties_().getProperty("BREAKDOWN_SPREADSHEET_ID");
  return id?SpreadsheetApp.openById(id):SpreadsheetApp.getActiveSpreadsheet();
}
function breakdownCanonical_(v){
  if(v===null||typeof v!=="object")return JSON.stringify(v);
  if(Array.isArray(v))return "["+v.map(breakdownCanonical_).join(",")+"]";
  return "{"+Object.keys(v).sort().map(function(k){
    return JSON.stringify(k)+":"+breakdownCanonical_(v[k]);
  }).join(",")+"}";
}
function breakdownHex_(bytes){
  return bytes.map(function(b){
    return ("0"+((b+256)%256).toString(16)).slice(-2);
  }).join("");
}
function breakdownHash_(v){
  return breakdownHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,breakdownCanonical_(v),Utilities.Charset.UTF_8));
}
function breakdownSafeCell_(v){
  return typeof v==="string"&&/^[=+@'-]/.test(v)?"'"+v:(v==null?"":v);
}
function breakdownRestoreLiterals_(record){
  // Keep an exact private representation: Sheets may strip the apostrophe escape,
  // while mocks/raw exports may retain it. Never infer original text from prefix alone.
  var literals=record.literalTextJson?JSON.parse(record.literalTextJson):{
  };
  Object.keys(literals).forEach(function(key){
    if(key!=="literalTextJson"&&Object.prototype.hasOwnProperty.call(record,key))record[key]=literals[key];
  });
  delete record.literalTextJson;
  return record;
}
function breakdownTable_(ss,name,required){
  var sheet=ss.getSheetByName(name);
  if(!sheet)breakdownError_("SCHEMA_REQUIRED","Administrator migration is required");
  var rows=sheet.getDataRange().getValues(),headers=(rows[0]||[]).map(String);
  if(headers.some(function(h,i){
    return !h||headers.indexOf(h)!==i;
  })||required.some(function(h){
    return headers.indexOf(h)<0;
  }))breakdownError_("SCHEMA_REQUIRED","Missing or ambiguous schema");
  return {
    sheet:sheet,headers:headers,records:rows.slice(1).map(function(row,i){
      var v={
      }; headers.forEach(function(h,j){
        v[h]=row[j];
      }); return {
        row:i+2,value:breakdownRestoreLiterals_(v)
      };
    })
  };
}
function breakdownPut_(table,v,row){
  var owned=table.sheet.getName()===BREAKDOWN_LOG_SHEET?BREAKDOWN_V2_HEADERS:BREAKDOWN_LEDGER_HEADERS;
  var range=row?table.sheet.getRange(row,1,1,table.headers.length):null;
  var old=range?range.getValues()[0]:[],formulas=range&&typeof range.getFormulas==="function"?range.getFormulas()[0]:[];
  var literals={
  };
  owned.forEach(function(h){
    if(h!=="literalTextJson"&&typeof v[h]==="string"&&/^[=+@'-]/.test(v[h]))literals[h]=v[h];
  });
  var cells=table.headers.map(function(h,i){
    if(h==="literalTextJson")return JSON.stringify(literals); return owned.indexOf(h)<0?(formulas[i]||(old[i]==null?"":old[i])):breakdownSafeCell_(v[h]);
  });
  if(range)range.setValues([cells]);
  else table.sheet.appendRow(cells);
}
function breakdownAuthorize_(r){
  if(r.protocolVersion!==2||!/^[A-Za-z0-9_-]{8,128}$/.test(String(r.requestId||"")))breakdownError_("INVALID_REQUEST","Protocol 2 and stable requestId required");
  var a=r.auth||{
  },p=breakdownProperties_();
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(a.keyId||""))breakdownError_("AUTH_REQUIRED","Signed envelope required");
  var secret=p.getProperty("BREAKDOWN_SIGNING_KEY_"+a.keyId),env=p.getProperty("BREAKDOWN_ENVIRONMENT");
  if(!secret||!env||a.environment!==env||typeof a.actor!=="string"||!a.actor||a.actor.length>200||!Array.isArray(a.roles)||!Array.isArray(a.stations))breakdownError_("AUTH_REQUIRED","Invalid signed identity");
  var issued=Date.parse(a.issuedAt);
  if(!isFinite(issued)||Math.abs(Date.now()-issued)>300000)breakdownError_("AUTH_EXPIRED","Expired signed envelope");
  var signed=JSON.parse(JSON.stringify(r));
  delete signed.auth.signature;
  var signature=breakdownHex_(Utilities.computeHmacSha256Signature(breakdownCanonical_(signed),secret,Utilities.Charset.UTF_8)),given=String(a.signature||""),diff=signature.length^given.length;
  for(var i=0; i<signature.length; i++)diff|=signature.charCodeAt(i)^(given.charCodeAt(i)||0);
  if(diff)breakdownError_("AUTH_REQUIRED","Signature rejected");
  var roles={
    record_breakdown:["breakdownReporter","breakdownEditor","breakdownAdmin"],update_breakdown:["breakdownEditor","breakdownAdmin"],close_breakdown:["breakdownApprover","breakdownAdmin"],correct_breakdown:["breakdownAdmin"],read_breakdown_event:["breakdownReporter","breakdownEditor","breakdownApprover","breakdownAdmin"],read_write_status:["breakdownReporter","breakdownEditor","breakdownApprover","breakdownAdmin"],migrate_breakdown_schema:["breakdownAdmin"]
  };
  if(!roles[r.action]||!a.roles.some(function(role){
    return roles[r.action].indexOf(role)>=0;
  }))breakdownError_("FORBIDDEN","Role does not permit action");
  return a;
}
function breakdownMigration_(ss,dryRun){
  var specs=[[BREAKDOWN_LOG_SHEET,BREAKDOWN_V2_HEADERS],["MutationIntents",BREAKDOWN_LEDGER_HEADERS],["WriteReceipts",BREAKDOWN_LEDGER_HEADERS],["MachineBreakdownAudit",BREAKDOWN_LEDGER_HEADERS]],report=[];
  specs.forEach(function(spec){
    var sheet=ss.getSheetByName(spec[0]),rows=sheet?sheet.getDataRange().getValues():[],headers=rows.length?rows[0].map(String):[]; if(headers.length===1&&headers[0]==="")headers=[]; var issues=[];
    if(headers.some(function(h,i){
      return !h||headers.indexOf(h)!==i;
    }))issues.push("ambiguous_headers");
    if(spec[0]===BREAKDOWN_LOG_SHEET&&rows.length>1){
      var index=headers.indexOf("eventId"),ids={
      }; rows.slice(1).forEach(function(row){
        if(row.every(function(v){
          return v==="";
        }))return; var id=index>=0?String(row[index]||""):""; if(!id)issues.push("missing_event_id"); else if(ids[id])issues.push("duplicate_event_id"); ids[id]=true;
      });
    }
    report.push({
      sheet:spec[0],missing:spec[1].filter(function(h){
        return headers.indexOf(h)<0;
      }),issues:issues,rowCount:Math.max(0,rows.length-1),exists:!!sheet
    });
  });
  if(report.some(function(r){
    return r.issues.length;
  }))return {
    status:"error",code:"MIGRATION_AMBIGUOUS",dryRun:dryRun,report:report
  };
  if(!dryRun)report.forEach(function(r){
    var sheet=ss.getSheetByName(r.sheet)||ss.insertSheet(r.sheet); if(r.missing.length){
      var last=sheet.getLastRow()?sheet.getLastColumn():0; sheet.getRange(1,last+1,1,r.missing.length).setValues([r.missing]);
    }
  });
  if(!dryRun){
    // Revision/schema backfill is administrator-reviewed and additive only.
    // Do not invent timestamps, root causes, loss estimates or operation metadata.
    var businessSheet=ss.getSheetByName(BREAKDOWN_LOG_SHEET);
    var data=businessSheet.getDataRange().getValues(),cols=data[0];
    data.slice(1).forEach(function(row,index){
      if(!row[cols.indexOf("eventId")])return;
      ["revision","schemaVersion"].forEach(function(field){
        var column=cols.indexOf(field);
        if(row[column]==null||row[column]==="")businessSheet.getRange(index+2,column+1).setValue(field==="revision"?1:2);
      });
    });
  }
  return {
    status:"success",dryRun:dryRun,report:report
  };
}
function breakdownTimestamp_(v,field){
  if(v==null||v==="")return "";
  var m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(String(v));
  if(!m||+m[2]<1||+m[2]>12||+m[3]<1||+m[3]>new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate()||+m[4]>23||+m[5]>59||+(m[6]||0)>59||!isFinite(Date.parse(v)))breakdownError_("VALIDATION","Invalid offset timestamp: "+field);
  if(Date.parse(v)>Date.now()+300000)breakdownError_("VALIDATION","Future timestamp: "+field);
  return new Date(v).toISOString();
}
function breakdownValidate_(r,before){
  var p=r.payload;
  if(!p||Array.isArray(p)||typeof p!=="object")breakdownError_("VALIDATION","Payload object required");
  var writable=("eventId station machineId productCode productNameSnapshot layoutRevisionSnapshot layoutSnapshotSource layoutSnapshotReason shift eventType stopCategory symptom component severity affectedTrial batchRef note owner assignedAt repairStartedAt repairStage restoredAt startedAt confirmedRootCause actionTaken causePending causePendingReason verifiedBy verifiedAt verificationResult relatedEventId correctionReason voidReason voidedAt breakdownStatus isHistorical isMachineStop").split(" ");
  Object.keys(p).forEach(function(k){
    if(writable.indexOf(k)<0)breakdownError_("VALIDATION","Unknown or protected field: "+k); var v=p[k]; if(v!==null&&typeof v!=="string"&&typeof v!=="boolean"&&typeof v!=="number")breakdownError_("VALIDATION","Invalid field type"); if(typeof v==="number"&&!isFinite(v))breakdownError_("VALIDATION","Invalid number"); if(typeof v==="string"){
      var max=k==="symptom"?500:k==="component"?100:["confirmedRootCause","actionTaken"].indexOf(k)>=0?2000:1000; if(v.length>max)breakdownError_("VALIDATION","Text too long: "+k);
    }
  });
  var create=r.action==="record_breakdown",v=JSON.parse(JSON.stringify(before||{
  }));
  Object.keys(p).forEach(function(k){
    v[k]=p[k];
  });
  if(create&&p.eventId)breakdownError_("VALIDATION","Event ID is server assigned");
  if(!/^M[1-4]$/.test(v.station||"")||v.machineId!=="YK-10"+v.station.slice(1))breakdownError_("VALIDATION","Machine mapping invalid");
  if(!Object.prototype.hasOwnProperty.call(productionRoutes_(),v.productCode))breakdownError_("VALIDATION","Unknown productCode");
  if(["A","B"].indexOf(v.shift)<0||!v.symptom||!String(v.symptom).trim()||!v.eventType||!v.stopCategory)breakdownError_("VALIDATION","Symptom, type, category and shift required");
  if(["Low","Medium","High","Critical"].indexOf(v.severity)<0)breakdownError_("VALIDATION","Invalid severity");
  if(["Machine","machine_failure","process","planned","Machine Failure","Process Stop","Planned Stop","Mechanical","Process","Planned"].indexOf(v.stopCategory)<0)breakdownError_("VALIDATION","Invalid stop category");
  if(["Machine","Planned","Machine Breakdown","Machine Failure","Process Stop","Planned Stop","machine_failure","process","planned","Breakdown","Mechanical","Electrical","Process","Other"].indexOf(v.eventType)<0)breakdownError_("VALIDATION","Invalid event type");
  ["isHistorical","isMachineStop","causePending"].forEach(function(k){
    if(v[k]!==undefined&&v[k]!==""&&typeof v[k]!=="boolean")breakdownError_("VALIDATION","Boolean required: "+k);
  });
  if(create){
    v.breakdownStatus="Open";
    v.repairStage="Reported";
    v.isMachineStop=["Machine","machine_failure","Machine Failure","Mechanical"].indexOf(v.stopCategory)>=0;
    v.isHistorical=v.isHistorical===true;
    if(p.breakdownStatus&&p.breakdownStatus!=="Open")breakdownError_("VALIDATION","Create must start Open");
  }
  if(["Open","Monitoring","Closed"].indexOf(v.breakdownStatus)<0||["Reported","Assigned","Repairing"].indexOf(v.repairStage)<0)breakdownError_("VALIDATION","Invalid workflow state");
  if(before){
    if(!Number.isInteger(r.expectedRevision)||r.expectedRevision!==Number(before.revision))breakdownError_("REVISION_CONFLICT","Event changed; reload first");
    if(r.action!=="correct_breakdown"&&["station","machineId","productCode","productNameSnapshot","layoutRevisionSnapshot","layoutSnapshotSource","startedAt","isHistorical","isMachineStop"].some(function(k){
      return Object.prototype.hasOwnProperty.call(p,k)&&p[k]!==before[k];
    }))breakdownError_("VALIDATION","Immutable event snapshot; use correction");
    if((before.breakdownStatus==="Closed"||before.voidedAt)&&r.action!=="correct_breakdown")breakdownError_("FORBIDDEN","Closed/voided event requires correction");
    if(before.breakdownStatus==="Monitoring"&&v.breakdownStatus==="Open"&&r.action!=="correct_breakdown")breakdownError_("VALIDATION","Restored machine failure requires a new related event");
    if(r.action!=="correct_breakdown"&&["Reported","Assigned","Repairing"].indexOf(v.repairStage)<["Reported","Assigned","Repairing"].indexOf(before.repairStage))breakdownError_("VALIDATION","Repair stage regression requires correction and reason");
  }
  if(r.action==="correct_breakdown"&&!String(v.correctionReason||"").trim())breakdownError_("VALIDATION","Correction reason required");
  if(r.action!=="correct_breakdown"&&(p.voidedAt||p.voidReason))breakdownError_("FORBIDDEN","Void requires correction action");
  if(v.voidedAt&&!String(v.voidReason||"").trim())breakdownError_("VALIDATION","Void reason required");
  if(r.action==="close_breakdown")v.breakdownStatus="Closed";
  ["startedAt","restoredAt","assignedAt","repairStartedAt","verifiedAt","voidedAt"].forEach(function(k){
    v[k]=breakdownTimestamp_(v[k],k);
  });
  if(!v.startedAt)breakdownError_("VALIDATION","startedAt required");
  var previous=Date.parse(v.startedAt);
  ["restoredAt","verifiedAt"].forEach(function(k){
    if(v[k]){
      if(Date.parse(v[k])<previous)breakdownError_("VALIDATION","Times out of order"); previous=Date.parse(v[k]);
    }
  });
  ["assignedAt","repairStartedAt"].forEach(function(k){
    if(v[k]&&Date.parse(v[k])<Date.parse(v.startedAt))breakdownError_("VALIDATION","Repair time before event");
  });
  var timeline=[v.startedAt,v.assignedAt,v.repairStartedAt,v.restoredAt,v.verifiedAt].filter(Boolean);
  for(var ti=1; ti<timeline.length; ti++)if(Date.parse(timeline[ti])<Date.parse(timeline[ti-1]))breakdownError_("VALIDATION","Lifecycle times out of order");
  if(v.repairStage!=="Reported"&&(!v.owner||!v.assignedAt))breakdownError_("VALIDATION","Owner and assignedAt required");
  if(v.repairStage==="Repairing"&&!v.repairStartedAt)breakdownError_("VALIDATION","repairStartedAt required");
  if(v.breakdownStatus!=="Open"&&(!v.restoredAt||!v.actionTaken))breakdownError_("VALIDATION","Restoration and action required");
  if(v.breakdownStatus==="Closed"){
    if(r.action!=="close_breakdown"&&r.action!=="correct_breakdown")breakdownError_("FORBIDDEN","Use close action");
    if(!v.owner||!v.verifiedBy||!v.verifiedAt||!v.verificationResult||(!v.confirmedRootCause&&!(v.causePending===true&&v.causePendingReason)))breakdownError_("VALIDATION","Complete close verification required");
    v.closedAt=v.closedAt||new Date().toISOString();
    if(Date.parse(v.verifiedAt)>Date.parse(v.closedAt))breakdownError_("VALIDATION","Verification after closure");
  }
  if(["configuration","confirmed","remote","manual"].indexOf(v.layoutSnapshotSource)<0)breakdownError_("VALIDATION","Invalid layout snapshot source");
  if(v.layoutSnapshotSource==="manual"&&!v.layoutSnapshotReason)breakdownError_("VALIDATION","Manual snapshot reason required");
  v.durationMin=v.restoredAt?(Date.parse(v.restoredAt)-Date.parse(v.startedAt))/60000:null;
  v.isMachineFailure=["Machine","machine_failure","Machine Failure","Mechanical"].indexOf(v.stopCategory)>=0;
  v.estimatedOutputLoss=null;
  v.lossMethod="unavailable";
  v.schemaVersion=2;
  v.line=v.productCode;
  v.recordType="record_breakdown";
  return v;
}
function breakdownReconcile_(business,intents,receipts,audit){
  intents.records.forEach(function(entry){
    var intent=entry.value; if(intent.state==="saved")return;
    var before=JSON.parse(intent.beforeJson||"null"),after=JSON.parse(intent.afterJson),found=business.records.filter(function(row){
      return row.value.eventId===intent.recordId;
    });
    if(found.length>1)breakdownError_("UNKNOWN","Duplicate event IDs require administrator recovery");
    var current=found.length?found[0].value:null;
    function matches(expected,actual){
      if(!expected)return !actual; return actual&&Object.keys(expected).every(function(k){
        return String(expected[k]==null?"":expected[k])===String(actual[k]==null?"":actual[k]);
      });
    }
    if(!matches(after,current)){
      if(!matches(before,current))breakdownError_("UNKNOWN","Durable intent cannot prove before/after state");
      breakdownPut_(business,after,found.length?found[0].row:null); SpreadsheetApp.flush();
      if(found.length)found[0].value=after; else business.records.push({
        row:business.sheet.getLastRow(),value:after
      });
    }
    if(!audit.records.some(function(row){
      return row.value.requestId===intent.requestId;
    })){
      breakdownPut_(audit,intent); audit.records.push({
        value:intent
      });
    }
    if(!receipts.records.some(function(row){
      return row.value.requestId===intent.requestId;
    })){
      breakdownPut_(receipts,intent); receipts.records.push({
        value:intent
      });
    }
    intent.state="saved"; breakdownPut_(intents,intent,entry.row); SpreadsheetApp.flush();
  });
}
function breakdownLayoutSnapshot_(value,auth){
  if(value.layoutSnapshotSource==="manual"){
    if(auth.roles.indexOf("breakdownAdmin")<0||!value.layoutSnapshotReason)breakdownError_("FORBIDDEN","Manual/historical snapshot requires administrator and reason");
    return;
  }
  if(value.isHistorical)breakdownError_("VALIDATION","Historical events require explicit manual snapshot");
  var aliases={
    "BL 23G R15 (M1)":"BL23G_M1","BL 23G R15 (M2)":"BL23G_M2","BB SKIN 25G R12":"BBSKINR12","NECK SKIN 40G R15":"NECKSKINR15","BB SKIN 35G F15":"BBSKINF15","GIZZARD 40G S18":"GZ40G","GIZZARD 30G R15":"GZ30G"
  };
  var records=readMachineLayoutRecords_().records.filter(function(row){
    return row.machine_id===value.machineId;
  });
  if(records.length!==1)breakdownError_("LAYOUT_UNAVAILABLE","Machine Configuration unavailable");
  var layout=records[0],product=aliases[String(layout.product_name||"").trim().toUpperCase()];
  if(!product||product!==value.productCode)breakdownError_("LAYOUT_CONFLICT","Machine product changed; reload Configuration");
  if(value.layoutRevisionSnapshot&&String(value.layoutRevisionSnapshot)!==String(layout.revision||layout.updated_at||""))breakdownError_("LAYOUT_CONFLICT","Configuration snapshot changed");
  value.productNameSnapshot=String(layout.product_name);
  value.layoutRevisionSnapshot=layout.revision||layout.updated_at||"";
  value.layoutSnapshotSource="configuration";
}
function breakdownProtocol2_(r){
  var bytes=encodeURIComponent(breakdownCanonical_(r)).replace(/%[A-F0-9]{2}/g,"x").length;
  if(bytes>65536)breakdownError_("PAYLOAD_TOO_LARGE","Body limit is 64 KiB UTF-8");
  var auth=breakdownAuthorize_(r),lock=LockService.getScriptLock(),locked=false;
  if(["read_write_status","read_breakdown_event","migrate_breakdown_schema"].indexOf(r.action)<0&&!breakdownWritesEnabled_())breakdownError_("WRITES_DISABLED","Breakdown writes disabled pending cutover");
  try{
    if(["read_write_status","read_breakdown_event"].indexOf(r.action)<0&&!breakdownProperties_().getProperty("BREAKDOWN_SPREADSHEET_ID"))breakdownError_("STORAGE_REQUIRED","Explicit Breakdown storage required for writes/migration");
    if(typeof lock.tryLock==="function"){
      locked=lock.tryLock(10000);
      if(!locked)breakdownError_("BUSY","Retry same requestId");
    }
    else{
      lock.waitLock(10000);
      locked=true;
    }
    var ss=breakdownSpreadsheet_();
    if(r.action==="migrate_breakdown_schema")return breakdownMigration_(ss,!r.payload||r.payload.dryRun!==false);
    var business=breakdownTable_(ss,BREAKDOWN_LOG_SHEET,BREAKDOWN_V2_HEADERS),intents=breakdownTable_(ss,"MutationIntents",BREAKDOWN_LEDGER_HEADERS),receipts=breakdownTable_(ss,"WriteReceipts",BREAKDOWN_LEDGER_HEADERS),audit=breakdownTable_(ss,"MachineBreakdownAudit",BREAKDOWN_LEDGER_HEADERS);
    if(r.action==="read_breakdown_event"){
      var event=business.records.filter(function(row){
        return row.value.eventId===String(r.payload&&r.payload.eventId||"");
      });
      if(event.length!==1)breakdownError_("NOT_FOUND","Exact event not found");
      if(auth.stations.indexOf(event[0].value.station)<0&&auth.stations.indexOf("*")<0)breakdownError_("FORBIDDEN","Station scope rejected");
      var record=JSON.parse(JSON.stringify(event[0].value));
      delete record.lastRequestId;
      delete record.payloadHash;
      return {
        status:"success",record:record,audit:audit.records.filter(function(row){
          return row.value.recordId===record.eventId;
        }).map(function(row){
          var v=row.value; return {
            eventId:v.recordId,revision:v.revision,requestId:v.requestId,action:v.action,actor:v.actor,before:JSON.parse(v.beforeJson),after:JSON.parse(v.afterJson),timestamp:v.savedAt
          };
        })
      };
    }
    // Status queries never reconcile another actor's intent or create business effects.
    if(r.action==="read_write_status"){
      var target=String(r.payload&&r.payload.requestId||r.requestId),receipt=receipts.records.filter(function(row){
        return row.value.requestId===target&&row.value.actor===auth.actor;
      });
      if(receipt.length)return {
        status:"success",receipt:JSON.parse(receipt[0].value.receiptJson)
      };
      var pending=intents.records.some(function(row){
        return row.value.requestId===target&&row.value.actor===auth.actor;
      });
      return {
        status:"success",protocolVersion:2,requestId:target,state:pending?"unknown":"not_found"
      };
    }
    var hash=breakdownHash_({
      action:r.action,expectedRevision:r.expectedRevision==null?null:r.expectedRevision,payload:r.payload
    }),existing=receipts.records.filter(function(row){
      return row.value.requestId===r.requestId;
    });
    var ownIntents=intents.records.filter(function(row){
      return row.value.requestId===r.requestId;
    });
    if(existing.length||ownIntents.length){
      var old=existing.length?existing[0].value:ownIntents[0].value;
      if(old.actor!==auth.actor||old.action!==r.action||old.payloadHash!==hash)breakdownError_("REQUEST_CONFLICT","Request ID already used");
      var intended=ownIntents.length?JSON.parse(ownIntents[0].value.afterJson):null;
      if(intended&&auth.stations.indexOf(intended.station)<0&&auth.stations.indexOf("*")<0)breakdownError_("FORBIDDEN","Station scope rejected");
      var original=ownIntents.length?JSON.parse(ownIntents[0].value.beforeJson||"null"):null;
      if(original&&auth.stations.indexOf(original.station)<0&&auth.stations.indexOf("*")<0)breakdownError_("FORBIDDEN","Original station scope rejected");
      if(ownIntents.length)breakdownReconcile_(business,{
        sheet:intents.sheet,headers:intents.headers,records:ownIntents
      },receipts,audit);
      return {
        status:"success",receipt:JSON.parse(old.receiptJson)
      };
    }
    var create=r.action==="record_breakdown",found=create?[]:business.records.filter(function(row){
      return row.value.eventId===String(r.payload&&r.payload.eventId||"");
    });
    if(!create&&found.length!==1)breakdownError_("NOT_FOUND","Exact event not found");
    var before=found.length?found[0].value:null;
    if(before&&auth.stations.indexOf(before.station)<0&&auth.stations.indexOf("*")<0)breakdownError_("FORBIDDEN","Original station scope rejected");
    var after=breakdownValidate_(r,before);
    if(auth.stations.indexOf(after.station)<0&&auth.stations.indexOf("*")<0)breakdownError_("FORBIDDEN","Station scope rejected");
    if(create||["station","machineId","productCode","productNameSnapshot","layoutSnapshotSource","layoutRevisionSnapshot","isHistorical"].some(function(field){return Object.prototype.hasOwnProperty.call(r.payload,field);}))breakdownLayoutSnapshot_(after,auth);
    // A fresh request never executes a different operation's durable intent.
    // Retry the original operation to reconcile it before changing the same machine.
    if(intents.records.some(function(row){
      return row.value.state!=="saved"&&JSON.parse(row.value.afterJson).station===after.station;
    }))breakdownError_("UNKNOWN","Unresolved machine operation; reconcile its original requestId");
    if(after.relatedEventId&&!business.records.some(function(row){
      return row.value.eventId===after.relatedEventId&&row.value.station===after.station;
    }))breakdownError_("VALIDATION","Related event not found on machine");
    if(after.breakdownStatus==="Open"&&!after.voidedAt&&after.isMachineStop&&!after.isHistorical&&business.records.some(function(row){
      var v=row.value; return v.eventId!==after.eventId&&v.station===after.station&&v.breakdownStatus==="Open"&&!v.voidedAt&&v.isHistorical!==true&&v.isMachineStop!==false;
    }))breakdownError_("ACTIVE_EVENT_CONFLICT","Machine already has an active stop");
    var now=new Date().toISOString();
    after.eventId=create?"BD-"+Utilities.getUuid():before.eventId;
    after.createdAt=create?now:before.createdAt;
    after.updatedAt=now;
    after.revision=create?1:Number(before.revision)+1;
    after.lastRequestId=r.requestId;
    after.payloadHash=hash;
    var receipt={
      protocolVersion:2,requestId:r.requestId,action:r.action,payloadHash:hash,recordId:after.eventId,revision:after.revision,state:"saved",savedAt:now
    };
    var intent={
      requestId:r.requestId,actor:auth.actor,action:r.action,payloadHash:hash,recordId:after.eventId,revision:after.revision,state:"pending",savedAt:now,beforeJson:JSON.stringify(before),afterJson:JSON.stringify(after),receiptJson:JSON.stringify(receipt)
    };
    breakdownPut_(intents,intent);
    SpreadsheetApp.flush();
    intents.records.push({
      row:intents.sheet.getLastRow(),value:intent
    });
    breakdownReconcile_(business,{
      sheet:intents.sheet,headers:intents.headers,records:[intents.records[intents.records.length-1]]
    },receipts,audit);
    return {
      status:"success",receipt:receipt
    };
  }
  finally{
    if(locked)lock.releaseLock();
  }
}
function breakdownPublicFeed_(sheet){
  var rows=sheet?sheet.getDataRange().getValues():[],headers=rows.length?rows[0].map(String):[],records=[];
  if(headers.some(function(h,i){
    return h&&headers.indexOf(h)!==i;
  }))breakdownError_("SCHEMA_INVALID","Duplicate headers");
  var publicFields=("eventId createdAt updatedAt breakdownDate line shift station machineId machineVersion machineArea conveyorPosition productCode productNameSnapshot layoutRevisionSnapshot layoutSnapshotSource eventType severity breakdownStatus repairStage startedAt restoredAt closedAt durationMin symptom component stopCategory isMachineFailure schemaVersion revision relatedEventId voidedAt isHistorical isMachineStop").split(" ");
  rows.slice(1).forEach(function(row){
    var raw={
    }; headers.forEach(function(h,i){
      raw[h]=row[i];
    }); breakdownRestoreLiterals_(raw); if(!raw.eventId)return; var v={
    }; publicFields.forEach(function(k){
      if(raw[k]!==undefined)v[k]=raw[k];
    }); v.id=v.eventId; v.key=v.eventId; v.breakdownId=v.eventId; v.updatedAt=v.updatedAt||v.createdAt; v.productCode=v.productCode||v.line; v.symptom=v.symptom||raw.rootCause||""; v.timeQuality=v.startedAt?"verified":"legacy_incomplete"; v.durationMin=v.startedAt&&v.restoredAt?(Date.parse(v.restoredAt)-Date.parse(v.startedAt))/60000:null; v.elapsedDowntimeMin=v.startedAt&&!v.restoredAt?Math.max(0,(Date.now()-Date.parse(v.startedAt))/60000):null; v.status=v.breakdownStatus||"Open"; records.push(v);
  });
  records.sort(function(a,b){
    return Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0);
  });
  return {
    status:"success",source:"sheet",schemaVersion:2,asOf:new Date().toISOString(),total:records.length,_records:records
  };
}
