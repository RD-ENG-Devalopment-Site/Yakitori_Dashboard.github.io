function doGet(e) {
  if (e && e.parameter && e.parameter.page === "api") {
    return getJsonStream(e);
  }

  return HtmlService.createHtmlOutputFromFile("DataEntry")
    .setTitle("APEX Flow Data Entry System")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var request = parseRequest_(e);

    var action = String(request.action || "").trim();
    if (action === "record_trial") {
      return jsonOutput_(saveExternalRecord_(request.payload || {}));
    }

    if (action === "validate_record_route") {
      return jsonOutput_(resolveRecordRoute_(request.payload || {}));
    }

    if (action === "approve_record") {
      return jsonOutput_(saveApprovalRecord_(request.payload || {}));
    }

    if (action === "record_breakdown") {
      return jsonOutput_(saveBreakdownRecord_(request.payload || {}));
    }

    if (action === "record_block_tracker") {
      return jsonOutput_(saveBlockTrackerRecord_(request.payload || {}));
    }

    if (action === "upsert_machine_layout") {
      return jsonOutput_(saveMachineLayoutRecord_(request.payload || {}));
    }

    if (action === "delete_block_tracker") {
      return jsonOutput_(deleteBlockTrackerRecord_(request.payload || {}));
    }

    if (action === "create_breakdown_sheet") {
      return jsonOutput_(createBreakdownSheet_());
    }

    if (action === "create_bl23_shift_b_sheet") {
      return jsonOutput_(createBl23gShiftBSheet());
    }

    if (action === "create_gz30_shift_b_sheet") {
      return jsonOutput_(createGz30gShiftBSheet());
    }

    if (action === "create_gz40_shift_b_sheet") {
      return jsonOutput_(createGz40gShiftBSheet());
    }

    if (action === "reset_gizzard_data") {
      return jsonOutput_(resetGizzardDataSheets_());
    }

    return jsonOutput_({
      status: "error",
      message: "Unknown action: " + action
    });
  } catch (error) {
    return jsonOutput_({
      status: "error",
      message: error.toString()
    });
  }
}

var BL23G_SOURCE_SHEET = "BL23gR15_DataLog";
var BL23G_SHIFT_B_SHEET = "BL23gR15_ShiftB_DataLog";
var BL23G_TARGET_PRODUCTIVITY = 130;
var BL23G_M1_PROJECT_KEY = "BL23G_M1";
var BL23G_M2_PROJECT_KEY = "BL23G_M2";
var BL23G_M1_SPREADSHEET_ID = "1o1dAQCU6mp43qzJcgst2wn5xH5-ILjMZ4nqrO5Txjhg";
var BL23G_M1_SOURCE_SHEET = "BL23gR15_M1_DataLog";
var BL23G_M1_SHIFT_B_SHEET = "BL23gR15_M1_ShiftB_DataLog";
var GZ30G_SOURCE_SHEET = "GZ30gR15_DataLog";
var GZ30G_SHIFT_B_SHEET = "GZ30gR15_ShiftB_DataLog";
var GZ30G_TARGET_PRODUCTIVITY = 69;
var GZ40G_SOURCE_SHEET = "GZ40gS18_DataLog";
var GZ40G_SHIFT_B_SHEET = "GZ40gS18_ShiftB_DataLog";
var GZ40G_TARGET_PRODUCTIVITY = 84;
var BREAKDOWN_LOG_SHEET = "MachineBreakdownLog";
var BLOCK_TRACKER_SHEET = "BlockTracker_DataLog";
var MACHINE_LAYOUT_SPREADSHEET_ID = "1o1dAQCU6mp43qzJcgst2wn5xH5-ILjMZ4nqrO5Txjhg";
var MACHINE_LAYOUT_SHEET = "MachineLayout_DataLog";
var MACHINE_LAYOUT_HEADERS = [
  "machine_id",
  "machine_name",
  "conveyor_name",
  "product_name",
  "installed_at",
  "machine_status",
  "last_breakdown_at",
  "breakdown_detail",
  "updated_at"
];

function ensureBreakdownLogSheet_(ss) {
  return ensureSheet_(ss, BREAKDOWN_LOG_SHEET, [
    "eventId",
    "createdAt",
    "breakdownDate",
    "line",
    "shift",
    "machineVersion",
    "conveyorPosition",
    "machineArea",
    "station",
    "eventType",
    "severity",
    "breakdownStatus",
    "startTime",
    "endTime",
    "durationMin",
    "lossProxy",
    "impactOutput",
    "affectedTrial",
    "rootCause",
    "actionTaken",
    "owner",
    "submitter",
    "note",
    "recordType"
  ]);
}

function isBl23gSheetName_(sheetName) {
  return String(sheetName || "").trim().toUpperCase().indexOf("BL23G") !== -1;
}

function normalizeLine_(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveBl23gSheetName_(shift) {
  return normalizeShift_(shift) === "B" ? BL23G_SHIFT_B_SHEET : BL23G_SOURCE_SHEET;
}

function isBl23gM1Project_(projectKey) {
  return String(projectKey || "").trim().toUpperCase() === BL23G_M1_PROJECT_KEY;
}

function getBl23gProjectConfig_(projectKey) {
  if (isBl23gM1Project_(projectKey)) {
    return {
      projectKey: BL23G_M1_PROJECT_KEY,
      spreadsheet: SpreadsheetApp.openById(BL23G_M1_SPREADSHEET_ID),
      sourceSheet: BL23G_M1_SOURCE_SHEET,
      shiftBSheet: BL23G_M1_SHIFT_B_SHEET
    };
  }

  return {
    projectKey: BL23G_M2_PROJECT_KEY,
    spreadsheet: SpreadsheetApp.getActiveSpreadsheet(),
    sourceSheet: BL23G_SOURCE_SHEET,
    shiftBSheet: BL23G_SHIFT_B_SHEET
  };
}

function isGz30gSheetName_(sheetName) {
  return String(sheetName || "").trim().toUpperCase().indexOf("GZ30G") !== -1;
}

function isGz40gSheetName_(sheetName) {
  return String(sheetName || "").trim().toUpperCase().indexOf("GZ40G") !== -1;
}

function isGizzardSheetName_(sheetName) {
  return isGz30gSheetName_(sheetName) || isGz40gSheetName_(sheetName);
}

function isBreakdownSheetName_(sheetName) {
  return String(sheetName || "").trim().toUpperCase() === String(BREAKDOWN_LOG_SHEET).trim().toUpperCase();
}

function resolveGizzardSheetName_(sheetName, shift) {
  if (isGz40gSheetName_(sheetName)) {
    return normalizeShift_(shift) === "B" ? GZ40G_SHIFT_B_SHEET : GZ40G_SOURCE_SHEET;
  }
  return normalizeShift_(shift) === "B" ? GZ30G_SHIFT_B_SHEET : GZ30G_SOURCE_SHEET;
}

function ensureShiftBSheetCopy_(ss, sourceSheetName, shiftBSheetName) {
  var sheet = ss.getSheetByName(shiftBSheetName);
  if (sheet) return sheet;

  var source = ss.getSheetByName(sourceSheetName);
  if (!source) throw new Error("Source sheet not found: " + sourceSheetName);

  sheet = source.copyTo(ss).setName(shiftBSheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow > 1 && lastCol > 0) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }
  return sheet;
}

function clearSheetDataRows_(sheet) {
  if (!sheet) return 0;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) return 0;

  sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  return lastRow - 1;
}

function dedupeRecordsByTrialAndShift_(records) {
  var byKey = {};
  var orderedKeys = [];

  (records || []).forEach(function(record) {
    if (!record) return;
    var trial = String(record.trial || "").trim();
    if (!trial || !isFinite(Number(trial))) return;
    var key = trial + "__" + normalizeShift_(record.shift, "A");
    var priorIndex = orderedKeys.indexOf(key);
    if (priorIndex !== -1) orderedKeys.splice(priorIndex, 1);
    byKey[key] = record;
    orderedKeys.push(key);
  });

  return orderedKeys.map(function(key) {
    return byKey[key];
  });
}

function summarizeRecords_(records) {
  var sorted = dedupeRecordsByTrialAndShift_(records).sort(function(a, b) {
    return Number(a.trial) - Number(b.trial);
  });
  if (!sorted.length) {
    return {
      latestProd: 0,
      latestTrial: "",
      latestShift: "",
      bestProd: 0,
      bestTrial: "",
      bestShift: "",
      count: 0
    };
  }

  var latest = sorted[sorted.length - 1];
  var best = sorted[0];
  for (var i = 1; i < sorted.length; i++) {
    if (Number(sorted[i].prod) > Number(best.prod)) {
      best = sorted[i];
    }
  }

  return {
    latestProd: Number(latest.prod) || 0,
    latestTrial: String(latest.trial || ""),
    latestShift: String(latest.shift || ""),
    bestProd: Number(best.prod) || 0,
    bestTrial: String(best.trial || ""),
    bestShift: String(best.shift || ""),
    count: sorted.length
  };
}

function summarizeRecordsByShift_(records) {
  var source = records || [];
  var result = {};
  ["A", "B"].forEach(function(shift) {
    result[shift] = summarizeRecords_(source.filter(function(item) {
      return normalizeShift_(item.shift) === shift;
    }));
  });
  return result;
}

function attachSummaryFields_(db, records) {
  var normalizedRecords = dedupeRecordsByTrialAndShift_(records);
  var overall = summarizeRecords_(normalizedRecords);
  var byShift = summarizeRecordsByShift_(normalizedRecords);

  db.latestProd = overall.latestProd;
  db.latestTrial = overall.latestTrial;
  db.latestShift = overall.latestShift;
  db.bestProd = overall.bestProd;
  db.bestTrial = overall.bestTrial;
  db.bestShift = overall.bestShift;
  db._summary = overall;
  db._summaryByShift = byShift;
  db._summaryByShiftA = byShift.A;
  db._summaryByShiftB = byShift.B;
  return db;
}

function ensureBl23ShiftBSheet_(ss) {
  var sheet = ss.getSheetByName(BL23G_SHIFT_B_SHEET);
  if (sheet) return sheet;

  var source = ss.getSheetByName(BL23G_SOURCE_SHEET);
  if (!source) throw new Error("Source sheet not found: " + BL23G_SOURCE_SHEET);

  sheet = source.copyTo(ss).setName(BL23G_SHIFT_B_SHEET);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow > 1 && lastCol > 0) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }
  return sheet;
}

function createBl23gShiftBSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureBl23ShiftBSheet_(ss);
  return {
    status: "success",
    sheet: sheet.getName()
  };
}

function createGz30gShiftBSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureShiftBSheetCopy_(ss, GZ30G_SOURCE_SHEET, GZ30G_SHIFT_B_SHEET);
  return {
    status: "success",
    sheet: sheet.getName()
  };
}

function createGz40gShiftBSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureShiftBSheetCopy_(ss, GZ40G_SOURCE_SHEET, GZ40G_SHIFT_B_SHEET);
  return {
    status: "success",
    sheet: sheet.getName()
  };
}

function createBreakdownSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureBreakdownLogSheet_(ss);
  return {
    status: "success",
    sheet: sheet.getName()
  };
}

function resetGizzardDataSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var targets = [
    { source: GZ30G_SOURCE_SHEET, shift: GZ30G_SHIFT_B_SHEET },
    { source: GZ40G_SOURCE_SHEET, shift: GZ40G_SHIFT_B_SHEET }
  ];

  var cleared = [];
  targets.forEach(function (target) {
    var sourceSheet = ss.getSheetByName(target.source);
    if (!sourceSheet) {
      throw new Error("Source sheet not found: " + target.source);
    }

    var shiftSheet = ensureShiftBSheetCopy_(ss, target.source, target.shift);
    cleared.push({
      sheet: target.source,
      rowsCleared: clearSheetDataRows_(sourceSheet)
    });
    cleared.push({
      sheet: target.shift,
      rowsCleared: clearSheetDataRows_(shiftSheet)
    });
  });

  return {
    status: "success",
    message: "Gizzard data sheets reset to header-only templates",
    cleared: cleared
  };
}

function buildBl23gRow_(payload, shift) {
  return [
    valueOrEmpty_(payload.trial),
    Number(payload.ct_prep) || 0,
    Number(payload.ct_arrange) || 0,
    Number(payload.ct_machine) || 0,
    Number(payload.ct_inspec) || 0,
    Number(payload.ct_pack) || 0,
    Number(payload.ct_total) || Number(payload.totalCt) || 0,
    Number(payload.yield_hour) || Number(payload.total) || 0,
    Number(payload.man_total) || Number(payload.man) || 0,
    Number(payload.man_prep) || 0,
    Number(payload.man_block) || 0,
    Number(payload.man_inspec) || 0,
    Number(payload.man_pack) || 0,
    Number(payload.man_op) || 0,
    Number(payload.productivity) || Number(payload.prod) || 0,
    normalizeShift_(shift),
    0
  ];
}

function normalizeAuditHeader_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findAuditHeaderColumn_(headers, names) {
  for (var i = 0; i < headers.length; i++) {
    var header = normalizeAuditHeader_(headers[i]);
    for (var j = 0; j < names.length; j++) {
      if (header === names[j]) return i + 1;
    }
  }
  return 0;
}

function ensureRecordAuditColumns_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var recordDateColumn = findAuditHeaderColumn_(headers, ["recorddate", "date"]);
  var createdAtColumn = findAuditHeaderColumn_(headers, ["createdat", "submittedat", "timestamp", "updatedat"]);

  if (!recordDateColumn) {
    recordDateColumn = sheet.getLastColumn() + 1;
    sheet.getRange(1, recordDateColumn).setValue("recordDate");
  }
  if (!createdAtColumn) {
    createdAtColumn = sheet.getLastColumn() + 1;
    sheet.getRange(1, createdAtColumn).setValue("createdAt");
  }

  return {
    recordDateColumn: recordDateColumn,
    createdAtColumn: createdAtColumn
  };
}

function inferBl23gProjectKey_(payload) {
  var line = normalizeLine_(payload && payload.line);
  var requestedSheet = String(payload && (payload.sheet || payload.targetSheet) || "").trim().toUpperCase();
  var projectKey = String(payload && payload.projectKey || "").trim().toUpperCase();
  var m1Sheets = [BL23G_M1_SOURCE_SHEET, BL23G_M1_SHIFT_B_SHEET].map(function (name) {
    return String(name).trim().toUpperCase();
  });
  var m2Sheets = [BL23G_SOURCE_SHEET, BL23G_SHIFT_B_SHEET].map(function (name) {
    return String(name).trim().toUpperCase();
  });

  var lineKey = line === BL23G_M1_PROJECT_KEY || line === BL23G_M2_PROJECT_KEY ? line : "";
  var sheetKey = m1Sheets.indexOf(requestedSheet) !== -1
    ? BL23G_M1_PROJECT_KEY
    : (m2Sheets.indexOf(requestedSheet) !== -1 ? BL23G_M2_PROJECT_KEY : "");

  if (lineKey && sheetKey && lineKey !== sheetKey) {
    throw new Error("BL23G routing conflict: line=" + line + ", sheet=" + requestedSheet);
  }

  // Visible line/dataset selections are authoritative. projectKey remains a
  // compatibility fallback for older clients that did not send both fields.
  return lineKey || sheetKey ||
    (projectKey === BL23G_M1_PROJECT_KEY ? BL23G_M1_PROJECT_KEY : BL23G_M2_PROJECT_KEY);
}

function resolveRecordRoute_(payload) {
  var line = normalizeLine_(payload && payload.line);
  var requestedSheet = String(payload && (payload.sheet || payload.targetSheet) || "").trim();
  var shift = normalizeShift_(payload && payload.shift);

  if (line === "BL23G" || line === BL23G_M1_PROJECT_KEY || line === BL23G_M2_PROJECT_KEY || isBl23gSheetName_(requestedSheet)) {
    var bl23ProjectKey = inferBl23gProjectKey_(payload);
    var bl23Config = getBl23gProjectConfig_(bl23ProjectKey);
    return {
      status: "success",
      projectKey: bl23ProjectKey,
      shift: shift,
      sheet: shift === "B" ? bl23Config.shiftBSheet : bl23Config.sourceSheet
    };
  }

  if (line === "GZ30G" || line === "GZ40G" || isGizzardSheetName_(requestedSheet)) {
    var isGz40 = line === "GZ40G" || isGz40gSheetName_(requestedSheet);
    return {
      status: "success",
      projectKey: isGz40 ? "GZ40G" : "GZ30G",
      shift: shift,
      sheet: resolveGizzardSheetName_(isGz40 ? GZ40G_SOURCE_SHEET : GZ30G_SOURCE_SHEET, shift)
    };
  }

  return {
    status: "success",
    projectKey: line,
    shift: shift,
    sheet: requestedSheet || "APEX_Flow_Records"
  };
}

function readAuditCell_(row, column) {
  if (!column || column < 1) return "";
  var value = row[column - 1];
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value || "").trim();
}

function parseBl23gSheet_(sheet, defaultShift, db, records) {
  var data = sheet.getDataRange().getValues();
  var headers = data.length ? data[0] : [];
  var recordDateColumn = findAuditHeaderColumn_(headers, ["recorddate", "date"]);
  var createdAtColumn = findAuditHeaderColumn_(headers, ["createdat", "submittedat", "timestamp", "updatedat"]);
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var trialKey = row[0] ? row[0].toString().trim() : "";
    if (trialKey === "" || trialKey === "Default") continue;

    var shift = normalizeShift_(row[15], defaultShift);
    var productivity = Number(row[14]) || 0;
    var totalMan = Number(row[8]) || 0;
    var totalOutput = Number(row[7]) || 0;
    if (!productivity && totalMan > 0) {
      productivity = totalOutput / totalMan;
    }

    var recordKey = buildRecordKey_(trialKey, shift);
    var cycleDetail = {
      prep: Number(row[1]) || 0,
      arrange: Number(row[2]) || 0,
      machine: Number(row[3]) || 0,
      inspec: Number(row[4]) || 0,
      pack: Number(row[5]) || 0
    };
    var layout = {
      prep: Number(row[9]) || 0,
      block: Number(row[10]) || 0,
      inspec: Number(row[11]) || 0,
      pack: Number(row[12]) || 0,
      op: Number(row[13]) || 0
    };
    var calculatedEff = (productivity / BL23G_TARGET_PRODUCTIVITY) * 100;
    var recordDate = readAuditCell_(row, recordDateColumn);
    var createdAt = readAuditCell_(row, createdAtColumn);

    db[recordKey] = {
      trial: trialKey,
      line: "BL23G",
      shift: shift,
      prod: Number(productivity),
      eff: Number(calculatedEff),
      man: totalMan,
      total: totalOutput,
      recordDate: recordDate,
      createdAt: createdAt,
      status: "",
      ct_total: Number(row[6]) || 0,
      layout: layout,
      cycle_detail: cycleDetail
    };

    records.push({
      key: recordKey,
      trial: trialKey,
      line: "BL23G",
      shift: shift,
      prod: Number(productivity),
      eff: Number(calculatedEff),
      man: totalMan,
      total: totalOutput,
      recordDate: recordDate,
      createdAt: createdAt,
      status: ""
    });
  }
}

function parseGizzardSheet_(sheet, defaultShift, db, records, lineLabel, targetProductivity) {
  var data = sheet.getDataRange().getValues();
  var headers = data.length ? data[0] : [];
  var recordDateColumn = findAuditHeaderColumn_(headers, ["recorddate", "date"]);
  var createdAtColumn = findAuditHeaderColumn_(headers, ["createdat", "submittedat", "timestamp", "updatedat"]);
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var trialKey = row[0] ? row[0].toString().trim() : "";
    if (trialKey === "" || trialKey === "Default" || trialKey === "เดิม") continue;

    var hasStructuredShift = isShiftToken_(row[15]) || isShiftToken_(row[16]);
    var hasLegacyShift = !hasStructuredShift && isShiftToken_(row[1]);
    var shift = hasStructuredShift
      ? normalizeShift_(row[15], defaultShift)
      : (hasLegacyShift ? normalizeShift_(row[1], defaultShift) : normalizeShift_(defaultShift));
    var dataOffset = hasStructuredShift ? 0 : (hasLegacyShift ? 1 : 0);
    var totalOutput = Number(row[7 + dataOffset]) || 0;
    var totalMan = Number(row[8 + dataOffset]) || 0;
    var productivity = Number(row[14 + dataOffset]) || 0;
    if (!productivity && totalMan > 0) {
      productivity = totalOutput / totalMan;
    }

    var recordKey = buildRecordKey_(trialKey, shift);
    var cycleDetail = {
      prep: Number(row[1 + dataOffset]) || 0,
      arrange: Number(row[2 + dataOffset]) || 0,
      machine: Number(row[3 + dataOffset]) || 0,
      inspec: Number(row[4 + dataOffset]) || 0,
      pack: Number(row[5 + dataOffset]) || 0
    };
    var layout = {
      prep: Number(row[9 + dataOffset]) || 0,
      block: Number(row[10 + dataOffset]) || 0,
      inspec: Number(row[11 + dataOffset]) || 0,
      pack: Number(row[12 + dataOffset]) || 0,
      op: Number(row[13 + dataOffset]) || 0
    };
    var calculatedEff = (productivity / targetProductivity) * 100;
    var line = lineLabel;
    var recordDate = readAuditCell_(row, recordDateColumn);
    var createdAt = readAuditCell_(row, createdAtColumn);

    db[recordKey] = {
      trial: trialKey,
      line: line,
      shift: shift,
      prod: Number(productivity),
      eff: Number(calculatedEff),
      man: totalMan,
      total: totalOutput,
      recordDate: recordDate,
      createdAt: createdAt,
      status: "",
      ct_total: Number(row[6 + dataOffset]) || 0,
      layout: layout,
      cycle_detail: cycleDetail
    };

    records.push({
      key: recordKey,
      trial: trialKey,
      line: line,
      shift: shift,
      prod: Number(productivity),
      eff: Number(calculatedEff),
      man: totalMan,
      total: totalOutput,
      recordDate: recordDate,
      createdAt: createdAt,
      status: ""
    });
  }
}

function getJsonStream(e) {
  var projectKey = e && e.parameter && e.parameter.projectKey
    ? String(e.parameter.projectKey).trim().toUpperCase()
    : BL23G_M2_PROJECT_KEY;
  var bl23Config = getBl23gProjectConfig_(projectKey);
  var ss = bl23Config.spreadsheet;
  var sheetName = "GZ30gR15_DataLog";
  var requestedAction = e && e.parameter && e.parameter.action
    ? String(e.parameter.action).trim().toLowerCase()
    : "";

  if (requestedAction === "read_block_tracker") {
    return ContentService.createTextOutput(JSON.stringify(readBlockTrackerRecords_()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (requestedAction === "read_machine_layout") {
    return ContentService.createTextOutput(JSON.stringify(readMachineLayoutRecords_()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (e && e.parameter && e.parameter.sheet) {
    sheetName = e.parameter.sheet.toString().trim();
  }

  if (requestedAction === "read_breakdown" || isBreakdownSheetName_(sheetName)) {
    var breakdownSheet = ensureBreakdownLogSheet_(ss);
    return ContentService.createTextOutput(JSON.stringify(buildBreakdownFeed_(breakdownSheet)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (isBl23gSheetName_(sheetName)) {
    var bl23Db = {};
    var bl23Records = [];

    var sourceSheet = ss.getSheetByName(bl23Config.sourceSheet);
    if (sourceSheet) {
      parseBl23gSheet_(sourceSheet, "A", bl23Db, bl23Records);
    }

    if (sheetName === bl23Config.shiftBSheet) {
      bl23Db = {};
      bl23Records = [];
      var shiftBSheet = ss.getSheetByName(bl23Config.shiftBSheet);
      if (shiftBSheet) {
        parseBl23gSheet_(shiftBSheet, "B", bl23Db, bl23Records);
      }
    } else {
      var shiftB = ss.getSheetByName(bl23Config.shiftBSheet);
      if (shiftB) {
        parseBl23gSheet_(shiftB, "B", bl23Db, bl23Records);
      }
    }

    bl23Records = dedupeRecordsByTrialAndShift_(bl23Records);
    bl23Db._records = bl23Records;
    attachSummaryFields_(bl23Db, bl23Records);
    return ContentService.createTextOutput(JSON.stringify(bl23Db))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (isGizzardSheetName_(sheetName)) {
    var gizzardDb = {};
    var gizzardRecords = [];
    var gizzardTarget = isGz40gSheetName_(sheetName) ? GZ40G_TARGET_PRODUCTIVITY : GZ30G_TARGET_PRODUCTIVITY;
    var gizzardLine = isGz40gSheetName_(sheetName) ? "GZ40G" : "GZ30G";
    var gizzardSourceSheetName = isGz40gSheetName_(sheetName) ? GZ40G_SOURCE_SHEET : GZ30G_SOURCE_SHEET;
    var gizzardShiftSheetName = isGz40gSheetName_(sheetName) ? GZ40G_SHIFT_B_SHEET : GZ30G_SHIFT_B_SHEET;

    var gizzardSource = ss.getSheetByName(gizzardSourceSheetName);
    if (gizzardSource) {
      parseGizzardSheet_(gizzardSource, "A", gizzardDb, gizzardRecords, gizzardLine, gizzardTarget);
    }

    if (sheetName === gizzardShiftSheetName) {
      gizzardDb = {};
      gizzardRecords = [];
      var gizzardShiftOnly = ss.getSheetByName(gizzardShiftSheetName);
      if (gizzardShiftOnly) {
        parseGizzardSheet_(gizzardShiftOnly, "B", gizzardDb, gizzardRecords, gizzardLine, gizzardTarget);
      }
    } else {
      var gizzardShift = ss.getSheetByName(gizzardShiftSheetName);
      if (gizzardShift) {
        parseGizzardSheet_(gizzardShift, "B", gizzardDb, gizzardRecords, gizzardLine, gizzardTarget);
      }
    }

    gizzardRecords = dedupeRecordsByTrialAndShift_(gizzardRecords);
    gizzardDb._records = gizzardRecords;
    attachSummaryFields_(gizzardDb, gizzardRecords);
    return ContentService.createTextOutput(JSON.stringify(gizzardDb))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Sheet not found: " + sheetName }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var targetProductivity = 69;
  if (sheetName.indexOf("BL23g") !== -1) {
    targetProductivity = BL23G_TARGET_PRODUCTIVITY;
  } else if (sheetName.indexOf("GZ40g") !== -1) {
    targetProductivity = 84;
  } else if (sheetName.indexOf("GZ30g") !== -1) {
    targetProductivity = 69;
  }

  var data = sheet.getDataRange().getValues();
  var db = {};
  var records = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var trialKey = row[0] ? row[0].toString().trim() : "";
    if (trialKey === "" || trialKey === "Default") continue;
    if (trialKey === "เดิม") continue;

    if (sheetName.indexOf("BL23g") !== -1 && isShiftToken_(row[1])) continue;
    var shiftOffset = sheetName.indexOf("BL23g") !== -1 ? 0 : (isShiftToken_(row[1]) ? 1 : 0);
    var totalMan = Number(row[8 + shiftOffset]) || 0;
    var totalOutput = Number(row[7 + shiftOffset]) || 0;
    var calculatedProd = totalMan > 0 ? (totalOutput / totalMan) : 0;
    var calculatedEff = (calculatedProd / targetProductivity) * 100;
    var shift = sheetName.indexOf("BL23g") !== -1 ? normalizeShift_(row[15 + shiftOffset], "A") : (shiftOffset ? normalizeShift_(row[1]) : "A");
    var recordKey = buildRecordKey_(trialKey, shift);
    var line = row[15 + shiftOffset] ? row[15 + shiftOffset].toString().trim() : "";
    var recordDate = row[14 + shiftOffset] ? row[14 + shiftOffset].toString().trim() : "";
    var record = {
      key: recordKey,
      trial: trialKey,
      line: line,
      shift: shift,
      prod: Number(calculatedProd),
      eff: Number(calculatedEff),
      man: totalMan,
      total: totalOutput,
      recordDate: recordDate,
      status: row[20 + shiftOffset] ? row[20 + shiftOffset].toString().trim() : ""
    };

    records.push(record);
    db[recordKey] = {
      trial: trialKey,
      prod: Number(calculatedProd),
      eff: Number(calculatedEff),
      man: totalMan,
      total: totalOutput,
      shift: shift,
      line: line,
      recordDate: recordDate,
      layout: {
        prep: Number(row[9 + shiftOffset]) || 0,
        block: Number(row[10 + shiftOffset]) || 0,
        inspec: Number(row[11 + shiftOffset]) || 0,
        pack: Number(row[12 + shiftOffset]) || 0,
        op: Number(row[13 + shiftOffset]) || 0
      },
      cycle_detail: {
        prep: Number(row[1 + shiftOffset]) || 0,
        arrange: Number(row[2 + shiftOffset]) || 0,
        machine: Number(row[3 + shiftOffset]) || 0,
        inspec: Number(row[4 + shiftOffset]) || 0,
        pack: Number(row[5 + shiftOffset]) || 0
      }
    };
  }

  records = dedupeRecordsByTrialAndShift_(records);
  db._records = records;
  attachSummaryFields_(db, records);
  return ContentService.createTextOutput(JSON.stringify(db))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildBreakdownFeed_(sheet) {
  var data = sheet ? sheet.getDataRange().getValues() : [];
  if (!data.length) {
    return {
      status: "success",
      source: "sheet",
      sheet: BREAKDOWN_LOG_SHEET,
      updatedAt: "",
      total: 0,
      _records: []
    };
  }

  var headers = data[0].map(function(header) {
    return String(header || "").trim();
  });
  var records = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowMap = {};
    var hasValue = false;

    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      if (!header) continue;
      rowMap[header] = row[j];
      if (row[j] !== "" && row[j] !== null && row[j] !== undefined) {
        hasValue = true;
      }
    }

    if (!hasValue) continue;

    var eventId = valueOrEmpty_(rowMap.eventId || rowMap.breakdownId || ("BD-ROW-" + i));
    var createdAt = valueOrEmpty_(rowMap.createdAt);
    var breakdownDate = valueOrEmpty_(rowMap.breakdownDate || rowMap.recordDate || rowMap.date);
    var shift = normalizeShift_(rowMap.shift, "A");
    var line = normalizeLine_(rowMap.line || rowMap.productLine);
    var record = {
      eventId: eventId,
      breakdownId: eventId,
      key: eventId,
      id: eventId,
      createdAt: createdAt,
      updatedAt: createdAt,
      breakdownDate: breakdownDate,
      recordDate: breakdownDate,
      line: line,
      productLine: line,
      shift: shift,
      machineVersion: valueOrEmpty_(rowMap.machineVersion),
      conveyorPosition: valueOrEmpty_(rowMap.conveyorPosition),
      machineArea: valueOrEmpty_(rowMap.machineArea || rowMap.machine),
      machine: valueOrEmpty_(rowMap.machineArea || rowMap.machine),
      station: valueOrEmpty_(rowMap.station),
      eventType: valueOrEmpty_(rowMap.eventType || rowMap.breakdownType),
      breakdownType: valueOrEmpty_(rowMap.eventType || rowMap.breakdownType),
      severity: valueOrEmpty_(rowMap.severity || "Medium"),
      breakdownStatus: valueOrEmpty_(rowMap.breakdownStatus || rowMap.status || "Open"),
      status: valueOrEmpty_(rowMap.breakdownStatus || rowMap.status || "Open"),
      startTime: valueOrEmpty_(rowMap.startTime),
      endTime: valueOrEmpty_(rowMap.endTime),
      durationMin: Number(rowMap.durationMin) || 0,
      lossProxy: Number(rowMap.lossProxy) || 0,
      impactOutput: Number(rowMap.impactOutput) || 0,
      affectedTrial: valueOrEmpty_(rowMap.affectedTrial || rowMap.trial),
      trial: valueOrEmpty_(rowMap.affectedTrial || rowMap.trial),
      rootCause: valueOrEmpty_(rowMap.rootCause || rowMap.issue),
      issue: valueOrEmpty_(rowMap.rootCause || rowMap.issue),
      actionTaken: valueOrEmpty_(rowMap.actionTaken || rowMap.actionNote),
      actionNote: valueOrEmpty_(rowMap.actionTaken || rowMap.actionNote),
      owner: valueOrEmpty_(rowMap.owner || rowMap.pic),
      pic: valueOrEmpty_(rowMap.owner || rowMap.pic),
      submitter: valueOrEmpty_(rowMap.submitter || rowMap.createdBy),
      createdBy: valueOrEmpty_(rowMap.submitter || rowMap.createdBy),
      note: valueOrEmpty_(rowMap.note || rowMap.comment),
      comment: valueOrEmpty_(rowMap.note || rowMap.comment),
      recordType: valueOrEmpty_(rowMap.recordType || "record_breakdown")
    };

    records.push(record);
  }

  records.sort(function(a, b) {
    var aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    var bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return {
    status: "success",
    source: "sheet",
    sheet: sheet.getName(),
    updatedAt: records.length ? records[0].createdAt : "",
    total: records.length,
    _records: records
  };
}

function saveExternalRecord_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var line = normalizeLine_(payload.line);
  var requestedSheet = String(payload.sheet || payload.targetSheet || "").trim();
  var now = new Date();

  if (line === "BL23G" || line === BL23G_M1_PROJECT_KEY || line === BL23G_M2_PROJECT_KEY || isBl23gSheetName_(requestedSheet)) {
    var bl23Route = resolveRecordRoute_(payload);
    var bl23Config = getBl23gProjectConfig_(bl23Route.projectKey);
    ss = bl23Config.spreadsheet;
    var shift = bl23Route.shift;
    var targetSheetName = bl23Route.sheet;
    var targetSheet = targetSheetName === bl23Config.shiftBSheet
      ? ensureShiftBSheetCopy_(ss, bl23Config.sourceSheet, bl23Config.shiftBSheet)
      : ss.getSheetByName(bl23Config.sourceSheet);
    if (!targetSheet) {
      throw new Error("BL23G source sheet not found: " + bl23Config.sourceSheet);
    }

    var blAuditColumns = ensureRecordAuditColumns_(targetSheet);
    var blNextRow = targetSheet.getLastRow() + 1;
    targetSheet.appendRow(buildBl23gRow_(payload, shift));
    targetSheet.getRange(blNextRow, blAuditColumns.recordDateColumn).setValue(valueOrEmpty_(payload.recordDate || payload.date));
    targetSheet.getRange(blNextRow, blAuditColumns.createdAtColumn).setValue(now.toISOString());
    return {
      status: "success",
      message: "Record saved to " + targetSheetName,
      sheet: targetSheetName
    };
  }

  if (line === "GZ30G" || line === "GZ40G" || isGizzardSheetName_(requestedSheet)) {
    var gShift = normalizeShift_(payload.shift);
    var isGz40 = line === "GZ40G" || isGz40gSheetName_(requestedSheet);
    var gSourceSheetName = isGz40 ? GZ40G_SOURCE_SHEET : GZ30G_SOURCE_SHEET;
    var gShiftSheetName = isGz40 ? GZ40G_SHIFT_B_SHEET : GZ30G_SHIFT_B_SHEET;
    var gTargetSheetName = gShift === "B" ? gShiftSheetName : gSourceSheetName;
    var gTargetSheet = gTargetSheetName === gShiftSheetName
      ? ensureShiftBSheetCopy_(ss, gSourceSheetName, gShiftSheetName)
      : ss.getSheetByName(gSourceSheetName);
    if (!gTargetSheet) {
      throw new Error("Source sheet not found: " + gSourceSheetName);
    }

    var gAuditColumns = ensureRecordAuditColumns_(gTargetSheet);
    var gNextRow = gTargetSheet.getLastRow() + 1;
    gTargetSheet.appendRow(buildBl23gRow_(payload, gShift));
    gTargetSheet.getRange(gNextRow, gAuditColumns.recordDateColumn).setValue(valueOrEmpty_(payload.recordDate || payload.date));
    gTargetSheet.getRange(gNextRow, gAuditColumns.createdAtColumn).setValue(now.toISOString());

    return {
      status: "success",
      message: "Record saved to " + gTargetSheetName,
      sheet: gTargetSheetName
    };
  }

  var sheetName = requestedSheet || "APEX_Flow_Records";
  var sheet = ensureSheet_(ss, sheetName, [
    "trial",
    "shift",
    "ct_prep",
    "ct_arrange",
    "ct_machine",
    "ct_inspec",
    "ct_pack",
    "ct_total",
    "yield_hour",
    "man_total",
    "man_prep",
    "man_block",
    "man_inspec",
    "man_pack",
    "man_op",
    "recordDate",
    "line",
    "issue",
    "actionNote",
    "submitter",
    "comment",
    "status",
    "recordType",
    "createdAt"
  ]);

  var recordShift = normalizeShift_(payload.shift);
  var row = [
    valueOrEmpty_(payload.trial),
    recordShift,
    Number(payload.ct_prep) || 0,
    Number(payload.ct_arrange) || 0,
    Number(payload.ct_machine) || 0,
    Number(payload.ct_inspec) || 0,
    Number(payload.ct_pack) || 0,
    Number(payload.ct_total) || Number(payload.total) || 0,
    Number(payload.yield_hour) || Number(payload.prod) || 0,
    Number(payload.man_total) || Number(payload.man) || 0,
    Number(payload.man_prep) || 0,
    Number(payload.man_block) || 0,
    Number(payload.man_inspec) || 0,
    Number(payload.man_pack) || 0,
    Number(payload.man_op) || 0,
    valueOrEmpty_(payload.recordDate || payload.date),
    valueOrEmpty_(payload.line),
    valueOrEmpty_(payload.issue),
    valueOrEmpty_(payload.actionNote || payload.action_note),
    valueOrEmpty_(payload.submitter || payload.createdBy),
    valueOrEmpty_(payload.comment),
    String(payload.status || "pending"),
    "record_trial",
    now.toISOString()
  ];

  sheet.appendRow(row);
  return {
    status: "success",
    message: "Record saved to " + sheetName,
    sheet: sheetName
  };
}

function saveApprovalRecord_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureSheet_(ss, "ApprovalLog", [
    "approvedAt",
    "trial",
    "shift",
    "sheet",
    "line",
    "status",
    "approverName",
    "approvalNote",
    "recordType",
    "payloadJson"
  ]);

  var row = [
    valueOrEmpty_(payload.approvedAt || new Date().toISOString()),
    valueOrEmpty_(payload.trial),
    normalizeShift_(payload.shift),
    valueOrEmpty_(payload.sheet || payload.targetSheet),
    valueOrEmpty_(payload.line),
    valueOrEmpty_(payload.status || "approved"),
    valueOrEmpty_(payload.approverName || payload.approver),
    valueOrEmpty_(payload.approvalNote || payload.note),
    "approve_record",
    JSON.stringify(payload)
  ];

  sheet.appendRow(row);
  return {
    status: "success",
    message: "Approval saved to ApprovalLog"
  };
}

function saveBreakdownRecord_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();
  var timeZone = Session.getScriptTimeZone() || "Asia/Bangkok";
  var sheetName = String(payload.sheetName || payload.sheet || BREAKDOWN_LOG_SHEET).trim();
  var sheet = ensureBreakdownLogSheet_(ss);

  var row = [
    "BD-" + Utilities.formatDate(now, timeZone, "yyyyMMdd-HHmmss"),
    now.toISOString(),
    valueOrEmpty_(payload.breakdownDate || payload.recordDate || payload.date),
    valueOrEmpty_(payload.line),
    normalizeShift_(payload.shift),
    valueOrEmpty_(payload.machineVersion),
    valueOrEmpty_(payload.conveyorPosition),
    valueOrEmpty_(payload.machineArea || payload.machine),
    valueOrEmpty_(payload.station),
    valueOrEmpty_(payload.eventType || payload.breakdownType),
    valueOrEmpty_(payload.severity || "Medium"),
    valueOrEmpty_(payload.breakdownStatus || payload.status || "Open"),
    valueOrEmpty_(payload.startTime),
    valueOrEmpty_(payload.endTime),
    Number(payload.durationMin) || 0,
    Number(payload.lossProxy) || 0,
    Number(payload.impactOutput) || 0,
    valueOrEmpty_(payload.affectedTrial || payload.trial),
    valueOrEmpty_(payload.rootCause || payload.issue),
    valueOrEmpty_(payload.actionTaken || payload.actionNote),
    valueOrEmpty_(payload.owner || payload.pic),
    valueOrEmpty_(payload.submitter || payload.createdBy),
    valueOrEmpty_(payload.note || payload.comment),
    "record_breakdown"
  ];

  sheet.appendRow(row);
  return {
    status: "success",
    message: "Breakdown saved to " + sheetName,
    sheet: sheetName
  };
}

function getBlockTrackerSheet_() {
  var ss = SpreadsheetApp.openById(BL23G_M1_SPREADSHEET_ID);
  return ensureSheet_(ss, BLOCK_TRACKER_SHEET, [
    "Record ID",
    "Recorded At",
    "Block Name",
    "On Line Used",
    "On Line Damaged",
    "Spare Available",
    "Spare Damaged",
    "Image Reference",
    "Updated At"
  ]);
}

function saveBlockTrackerRecord_(payload) {
  var sheet = getBlockTrackerSheet_();
  var now = new Date().toISOString();
  var recordId = String(payload.recordId || payload.id || "").trim();
  if (!recordId) {
    recordId = "BT-" + Utilities.getUuid();
  }

  var row = [
    recordId,
    valueOrEmpty_(payload.recordedAt || now),
    valueOrEmpty_(payload.name || payload.blockName),
    Number(payload.onLineUsed) || 0,
    Number(payload.onLineDamaged) || 0,
    Number(payload.spareAvailable) || 0,
    Number(payload.spareDamaged) || 0,
    valueOrEmpty_(payload.imageReference),
    now
  ];
  var lastRow = sheet.getLastRow();
  var ids = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === recordId) {
      sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
      return { status: "success", operation: "updated", recordId: recordId, sheet: BLOCK_TRACKER_SHEET };
    }
  }
  sheet.appendRow(row);
  return { status: "success", operation: "created", recordId: recordId, sheet: BLOCK_TRACKER_SHEET };
}

function deleteBlockTrackerRecord_(payload) {
  var recordId = String(payload.recordId || payload.id || "").trim();
  if (!recordId) throw new Error("recordId is required");
  var sheet = getBlockTrackerSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { status: "success", operation: "not_found", recordId: recordId };
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === recordId) {
      sheet.deleteRow(i + 2);
      return { status: "success", operation: "deleted", recordId: recordId, sheet: BLOCK_TRACKER_SHEET };
    }
  }
  return { status: "success", operation: "not_found", recordId: recordId };
}

function readBlockTrackerRecords_() {
  var sheet = getBlockTrackerSheet_();
  var values = sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue;
    records.push({
      recordId: String(row[0]),
      recordedAt: valueOrEmpty_(row[1]),
      name: valueOrEmpty_(row[2]),
      onLineUsed: Number(row[3]) || 0,
      onLineDamaged: Number(row[4]) || 0,
      spareAvailable: Number(row[5]) || 0,
      spareDamaged: Number(row[6]) || 0,
      imageReference: valueOrEmpty_(row[7]),
      updatedAt: valueOrEmpty_(row[8])
    });
  }
  return { status: "success", sheet: BLOCK_TRACKER_SHEET, records: records };
}

function saveData(formData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = formData.targetSheet;
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return {
        status: "error",
        message: "Sheet not found: " + sheetName
      };
    }

    var newRow = [
      formData.trial,
      Number(formData.ct_prep),
      Number(formData.ct_arrange),
      Number(formData.ct_machine),
      Number(formData.ct_inspec),
      Number(formData.ct_pack),
      Number(formData.ct_total),
      Number(formData.yield_hour),
      Number(formData.man_total),
      Number(formData.man_prep),
      Number(formData.man_block),
      Number(formData.man_inspec),
      Number(formData.man_pack),
      Number(formData.man_op)
    ];

    if (String(sheetName).indexOf("BL23g") !== -1) {
      var shift = normalizeShift_(formData.shift);
      if (shift === "B") {
        sheet = ensureBl23ShiftBSheet_(ss);
      }
      newRow = [
        formData.trial,
        Number(formData.ct_prep),
        Number(formData.ct_arrange),
        Number(formData.ct_machine),
        Number(formData.ct_inspec),
        Number(formData.ct_pack),
        Number(formData.ct_total),
        Number(formData.yield_hour),
        Number(formData.man_total),
        Number(formData.man_prep),
        Number(formData.man_block),
        Number(formData.man_inspec),
        Number(formData.man_pack),
        Number(formData.man_op),
        Number(formData.productivity) || 0,
        shift,
        0
      ];
    } else if (String(sheetName).indexOf("GZ30g") !== -1 || String(sheetName).indexOf("GZ40g") !== -1) {
      var gShift = normalizeShift_(formData.shift);
      var isGz40Sheet = String(sheetName).indexOf("GZ40g") !== -1;
      var gSourceSheetName = isGz40Sheet ? GZ40G_SOURCE_SHEET : GZ30G_SOURCE_SHEET;
      var gShiftSheetName = isGz40Sheet ? GZ40G_SHIFT_B_SHEET : GZ30G_SHIFT_B_SHEET;
      sheet = gShift === "B"
        ? ensureShiftBSheetCopy_(ss, gSourceSheetName, gShiftSheetName)
        : ss.getSheetByName(gSourceSheetName);
      if (!sheet) {
        return {
          status: "error",
          message: "Sheet not found: " + gSourceSheetName
        };
      }
      newRow = buildBl23gRow_(formData, gShift);
    }

    sheet.appendRow(newRow);
    return {
      status: "success",
      message: "Saved trial " + formData.trial + " to " + sheetName
    };
  } catch (error) {
    return {
      status: "error",
      message: "Save failed: " + error.toString()
    };
  }
}

function repairBl23DataLayout() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("BL23gR15_DataLog");
  if (!sheet) throw new Error("Sheet not found: BL23gR15_DataLog");

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { status: "success", repaired: 0 };

  var values = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 16)).getValues();
  var repaired = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!isShiftToken_(row[1])) continue;

    var corrected = [
      row[0],
      Number(row[2]) || 0,
      Number(row[3]) || 0,
      Number(row[4]) || 0,
      Number(row[5]) || 0,
      Number(row[6]) || 0,
      Number(row[7]) || 0,
      Number(row[8]) || 0,
      Number(row[9]) || 0,
      Number(row[10]) || 0,
      Number(row[11]) || 0,
      Number(row[12]) || 0,
      Number(row[13]) || 0,
      Number(row[14]) || 0,
      normalizeShift_(row[1]),
      0
    ];

    sheet.getRange(i + 2, 1, 1, corrected.length).setValues([corrected]);
    repaired++;
  }

  return { status: "success", repaired: repaired };
}

function repairBl23ProductivityLayout() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("BL23gR15_DataLog");
  if (!sheet) throw new Error("Sheet not found: BL23gR15_DataLog");

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { status: "success", repaired: 0 };

  var values = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 17)).getValues();
  var repaired = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!isShiftToken_(row[14])) continue;

    var productivity = Number(row[7]) || 0;
    var totalMan = Number(row[8]) || 0;
    var corrected = [
      row[0],
      Number(row[1]) || 0,
      Number(row[2]) || 0,
      Number(row[3]) || 0,
      Number(row[4]) || 0,
      Number(row[5]) || 0,
      Number(row[6]) || 0,
      Math.round(productivity * totalMan),
      totalMan,
      Number(row[9]) || 0,
      Number(row[10]) || 0,
      Number(row[11]) || 0,
      Number(row[12]) || 0,
      Number(row[13]) || 0,
      productivity,
      normalizeShift_(row[14]),
      0
    ];

    sheet.getRange(i + 2, 1, 1, corrected.length).setValues([corrected]);
    repaired++;
  }

  return { status: "success", repaired: repaired };
}

function parseRequest_(e) {
  var data = {};

  if (e && e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
    } catch (jsonError) {
      data = {};
    }
  }

  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (key) {
      if (data[key] === undefined) {
        data[key] = e.parameter[key];
      }
    });
  }

  return data;
}

function ensureSheet_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (headers && headers.length && sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function ensureMachineLayoutSheet_() {
  var ss = SpreadsheetApp.openById(MACHINE_LAYOUT_SPREADSHEET_ID);
  return ensureSheet_(ss, MACHINE_LAYOUT_SHEET, MACHINE_LAYOUT_HEADERS);
}

function parseMachineLayoutDate_(value) {
  var text = String(value || "").trim();
  if (!text) return "";

  var localMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (localMatch) {
    return new Date(
      Number(localMatch[1]),
      Number(localMatch[2]) - 1,
      Number(localMatch[3]),
      Number(localMatch[4] || 0),
      Number(localMatch[5] || 0),
      Number(localMatch[6] || 0)
    );
  }

  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? text : parsed;
}

function formatMachineLayoutDate_(value, includeSeconds) {
  if (Object.prototype.toString.call(value) !== "[object Date]" || isNaN(value.getTime())) {
    return valueOrEmpty_(value);
  }

  return Utilities.formatDate(
    value,
    Session.getScriptTimeZone() || "Asia/Bangkok",
    includeSeconds ? "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd HH:mm"
  );
}

function saveMachineLayoutRecord_(payload) {
  var machineId = String(payload.machine_id || "").trim();
  if (!machineId) throw new Error("machine_id is required");

  var allowedStatuses = ["running", "idle", "maintenance", "fault"];
  var machineStatus = String(payload.machine_status || "idle").trim().toLowerCase();
  if (allowedStatuses.indexOf(machineStatus) === -1) {
    throw new Error("Invalid machine_status: " + machineStatus);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = ensureMachineLayoutSheet_();
    var targetRow = sheet.getLastRow() + 1;
    var isUpdate = false;

    if (sheet.getLastRow() > 1) {
      var machineIds = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
      for (var index = 0; index < machineIds.length; index++) {
        if (String(machineIds[index][0] || "").trim() === machineId) {
          targetRow = index + 2;
          isUpdate = true;
          break;
        }
      }
    }

    var updatedAt = new Date();
    var row = [
      machineId,
      String(payload.machine_name || "").trim(),
      String(payload.conveyor_name || "").trim(),
      String(payload.product_name || "").trim(),
      parseMachineLayoutDate_(payload.installed_at),
      machineStatus,
      parseMachineLayoutDate_(payload.last_breakdown_at),
      String(payload.breakdown_detail || "").trim(),
      updatedAt
    ];

    sheet.getRange(targetRow, 1, 1, MACHINE_LAYOUT_HEADERS.length).setValues([row]);
    SpreadsheetApp.flush();

    return {
      status: "success",
      operation: isUpdate ? "updated" : "created",
      machine_id: machineId,
      row: targetRow,
      updated_at: formatMachineLayoutDate_(updatedAt, true)
    };
  } finally {
    lock.releaseLock();
  }
}

function readMachineLayoutRecords_() {
  var sheet = ensureMachineLayoutSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { status: "success", records: [] };
  }

  var values = sheet.getRange(2, 1, lastRow - 1, MACHINE_LAYOUT_HEADERS.length).getValues();
  var records = values
    .filter(function (row) { return String(row[0] || "").trim() !== ""; })
    .map(function (row) {
      return {
        machine_id: String(row[0] || "").trim(),
        machine_name: valueOrEmpty_(row[1]),
        conveyor_name: valueOrEmpty_(row[2]),
        product_name: valueOrEmpty_(row[3]),
        installed_at: formatMachineLayoutDate_(row[4], false),
        machine_status: String(row[5] || "idle").trim().toLowerCase(),
        last_breakdown_at: formatMachineLayoutDate_(row[6], false),
        breakdown_detail: valueOrEmpty_(row[7]),
        updated_at: formatMachineLayoutDate_(row[8], true)
      };
    });

  return { status: "success", records: records };
}

function valueOrEmpty_(value) {
  return value === undefined || value === null ? "" : value;
}

function normalizeShift_(value, fallbackB, fallbackC) {
  var shift = String(value || fallbackB || fallbackC || "A").trim().toUpperCase();
  if (shift === "SHIFT A") shift = "A";
  if (shift === "SHIFT B") shift = "B";
  if (shift !== "A" && shift !== "B") shift = "A";
  return shift;
}

function buildRecordKey_(trial, shift) {
  var normalizedTrial = String(trial || "").trim();
  var normalizedShift = normalizeShift_(shift);
  return normalizedTrial + "__" + normalizedShift;
}

function isShiftToken_(value) {
  var shift = String(value || "").trim().toUpperCase();
  return shift === "A" || shift === "B" || shift === "SHIFT A" || shift === "SHIFT B";
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
