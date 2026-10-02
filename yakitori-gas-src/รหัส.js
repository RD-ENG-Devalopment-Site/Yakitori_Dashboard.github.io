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
    if (["record_breakdown", "update_breakdown", "close_breakdown", "correct_breakdown", "read_write_status", "read_breakdown_event", "migrate_breakdown_schema"].indexOf(action) !== -1) {
      return jsonOutput_(breakdownProtocol2_(request));
    }
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
      breakdownError_("AUTH_REQUIRED", "Signed protocol 2 is required");
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
      breakdownError_("FORBIDDEN", "Use the signed administrator migration");
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
      code: error.code || "WRITE_FAILED",
      state: ["INVALID_REQUEST", "AUTH_REQUIRED", "AUTH_EXPIRED", "FORBIDDEN", "WRITES_DISABLED", "STORAGE_REQUIRED", "VALIDATION", "REVISION_CONFLICT", "NOT_FOUND", "REQUEST_CONFLICT", "ACTIVE_EVENT_CONFLICT", "LAYOUT_CONFLICT", "LAYOUT_UNAVAILABLE", "PAYLOAD_TOO_LARGE", "SCHEMA_REQUIRED", "INVALID_ROUTE"].indexOf(error.code) !== -1 ? "rejected" : (error.code === "BUSY" ? "pending" : "unknown"),
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
var BBSKIN_R12_PROJECT_KEY = "BBSKINR12";
var BBSKIN_R12_TARGET_PRODUCTIVITY = 120;
var BBSKIN_R12_SPREADSHEET_ID = "1o1dAQCU6mp43qzJcgst2wn5xH5-ILjMZ4nqrO5Txjhg";
var BBSKIN_R12_SHIFT_A_SHEET = "BBSKINR12_DataLog_Shift A";
var BBSKIN_R12_SHIFT_B_SHEET = "BBSKINR12_DataLog_Shift B";
var ADDITIONAL_SKIN_SPREADSHEET_ID = "1o1dAQCU6mp43qzJcgst2wn5xH5-ILjMZ4nqrO5Txjhg";
var ADDITIONAL_SKIN_LINES = {
  NECKSKINR15: {
    targetProductivity: 120,
    shiftA: "NECKSKINR15_Datalog_Shift A",
    shiftB: "NECKSKINR15_Datalog_Shift B"
  },
  BBSKINF15: {
    targetProductivity: 120,
    shiftA: "BBSKINF15_Datalog_Shift A",
    shiftB: "BBSKINF15_Datalog_Shift B"
  }
};
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

function isBbSkinProject_(line, sheetName) {
  var normalizedLine = normalizeLine_(line);
  var normalizedSheet = String(sheetName || "").trim().toUpperCase();
  return normalizedLine === BBSKIN_R12_PROJECT_KEY || normalizedSheet.indexOf("BBSKINR12_") === 0;
}

function resolveBbSkinSheetName_(shift) {
  return normalizeShift_(shift) === "B" ? BBSKIN_R12_SHIFT_B_SHEET : BBSKIN_R12_SHIFT_A_SHEET;
}

function getAdditionalSkinConfig_(line, sheetName) {
  var normalizedLine = normalizeLine_(line);
  var requestedSheet = String(sheetName || "").trim();
  if (ADDITIONAL_SKIN_LINES[normalizedLine]) {
    return { projectKey: normalizedLine, sheets: ADDITIONAL_SKIN_LINES[normalizedLine] };
  }
  for (var projectKey in ADDITIONAL_SKIN_LINES) {
    var sheets = ADDITIONAL_SKIN_LINES[projectKey];
    if (requestedSheet === sheets.shiftA || requestedSheet === sheets.shiftB) {
      return { projectKey: projectKey, sheets: sheets };
    }
  }
  return null;
}

function resolveAdditionalSkinSheetName_(config, shift) {
  return normalizeShift_(shift) === "B" ? config.sheets.shiftB : config.sheets.shiftA;
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
  breakdownError_("FORBIDDEN", "Use the signed administrator migration");
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

function productionRoutes_() {
  var routes = {};
  routes[BL23G_M1_PROJECT_KEY] = { kind: "bl", line: "BL23G", target: BL23G_TARGET_PRODUCTIVITY, spreadsheetId: BL23G_M1_SPREADSHEET_ID, shiftA: BL23G_M1_SOURCE_SHEET, shiftB: BL23G_M1_SHIFT_B_SHEET };
  routes[BL23G_M2_PROJECT_KEY] = { kind: "bl", line: "BL23G", target: BL23G_TARGET_PRODUCTIVITY, shiftA: BL23G_SOURCE_SHEET, shiftB: BL23G_SHIFT_B_SHEET };
  routes.GZ30G = { kind: "gizzard", line: "GZ30G", target: GZ30G_TARGET_PRODUCTIVITY, shiftA: GZ30G_SOURCE_SHEET, shiftB: GZ30G_SHIFT_B_SHEET };
  routes.GZ40G = { kind: "gizzard", line: "GZ40G", target: GZ40G_TARGET_PRODUCTIVITY, shiftA: GZ40G_SOURCE_SHEET, shiftB: GZ40G_SHIFT_B_SHEET };
  routes[BBSKIN_R12_PROJECT_KEY] = { kind: "skin", line: BBSKIN_R12_PROJECT_KEY, target: BBSKIN_R12_TARGET_PRODUCTIVITY, spreadsheetId: BBSKIN_R12_SPREADSHEET_ID, shiftA: BBSKIN_R12_SHIFT_A_SHEET, shiftB: BBSKIN_R12_SHIFT_B_SHEET };
  Object.keys(ADDITIONAL_SKIN_LINES).forEach(function(key) {
    var config = ADDITIONAL_SKIN_LINES[key];
    routes[key] = { kind: "skin", line: key, target: config.targetProductivity, spreadsheetId: ADDITIONAL_SKIN_SPREADSHEET_ID, shiftA: config.shiftA, shiftB: config.shiftB };
  });
  return routes;
}

function invalidRoute_(message) {
  var error = new Error(message);
  error.code = "INVALID_ROUTE";
  throw error;
}

function resolveProductionRoute_(payload, writing) {
  payload = payload || {};
  var routes = productionRoutes_();
  var requestedSheet = String(payload.sheet || payload.targetSheet || "").trim();
  if (payload.sheet && payload.targetSheet && normalizeLine_(payload.sheet) !== normalizeLine_(payload.targetSheet)) {
    invalidRoute_("Conflicting sheet selections");
  }
  var projectKey = "";
  var sheetShift = "";
  if (requestedSheet) {
    Object.keys(routes).forEach(function(key) {
      ["A", "B"].forEach(function(shift) {
        if (normalizeLine_(routes[key]["shift" + shift]) === normalizeLine_(requestedSheet)) {
          projectKey = key;
          sheetShift = shift;
        }
      });
    });
    if (!projectKey) invalidRoute_("Unknown production sheet");
  }

  var hasBlFamily = false;
  [payload.line, payload.projectKey].forEach(function(value) {
    var key = normalizeLine_(value);
    if (!key) return;
    if (key === "BL23G") { hasBlFamily = true; return; }
    if (key === "GZ30") key = "GZ30G";
    if (key === "GZ40") key = "GZ40G";
    if (!Object.prototype.hasOwnProperty.call(routes, key)) invalidRoute_("Unknown production project");
    if (projectKey && projectKey !== key) invalidRoute_("Conflicting project and sheet selections");
    projectKey = key;
  });
  if (hasBlFamily) {
    if (!projectKey) projectKey = BL23G_M2_PROJECT_KEY;
    if (routes[projectKey].kind !== "bl") invalidRoute_("Conflicting BL23G project selection");
  }
  // The parameterless legacy public feed was Gizzard 30G, not an arbitrary sheet.
  if (!projectKey) {
    if (writing) invalidRoute_("A production project or sheet is required");
    projectKey = "GZ30G";
  }
  var config = routes[projectKey];
  var shift = normalizeLine_(payload.shift);
  if (shift === "SHIFT A") shift = "A";
  if (shift === "SHIFT B") shift = "B";
  if (shift && shift !== "A" && shift !== "B") invalidRoute_("Invalid shift");
  // BL/Gizzard source names represent a two-shift dataset in existing callers.
  if (shift && sheetShift && shift !== sheetShift && (config.kind === "skin" || sheetShift === "B")) {
    invalidRoute_("Conflicting sheet and shift selections");
  }
  var shifts = shift ? [shift]
    : (sheetShift === "B" || (config.kind === "skin" && sheetShift) ? [sheetShift] : ["A", "B"]);
  if (writing) shifts = [shift || sheetShift || "A"];
  return { projectKey: projectKey, config: config, shifts: shifts };
}

function productionSpreadsheet_(config) {
  return config.spreadsheetId ? SpreadsheetApp.openById(config.spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
}

function resolveRecordRoute_(payload) {
  var route = resolveProductionRoute_(payload, true);
  var shift = route.shifts[0];
  return { status: "success", projectKey: route.projectKey, shift: shift, sheet: route.config["shift" + shift] };
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
    var calculatedEff = targetProductivity > 0 ? (productivity / targetProductivity) * 100 : 0;
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
  try {
    var params = e && e.parameter || {};
    var action = String(params.action || "").trim().toLowerCase();
    if (action === "read_health") {
      var targets = {};
      var routes = productionRoutes_();
      Object.keys(routes).forEach(function(key) { targets[key] = routes[key].target; });
      return jsonOutput_({ status: "success", apiVersion: "20261002-breakdown-2", targets: targets, writeProtocolVersion: 2, breakdownWritesEnabled: breakdownWritesEnabled_() });
    }
    if (action === "read_breakdown_event") {
      var detailFeed = breakdownPublicFeed_(breakdownSpreadsheet_().getSheetByName(BREAKDOWN_LOG_SHEET));
      var detail = detailFeed._records.filter(function(record) { return record.eventId === String(params.eventId || params.id || ""); });
      return jsonOutput_(detail.length === 1 ? {status:"success",record:detail[0],_records:detail} : {status:"error",code:"NOT_FOUND",_records:[]});
    }
    if (action && ["read_breakdown", "read_block_tracker", "read_machine_layout"].indexOf(action) === -1) {
      invalidRoute_("Unknown read action");
    }
    if (action) {
      var requestedProject = normalizeLine_(params.projectKey);
      var expectedSheet = action === "read_breakdown" ? BREAKDOWN_LOG_SHEET
        : (action === "read_block_tracker" ? BLOCK_TRACKER_SHEET : MACHINE_LAYOUT_SHEET);
      if (params.sheet && normalizeLine_(params.sheet) !== normalizeLine_(expectedSheet)) {
        invalidRoute_("Conflicting action and sheet selections");
      }
      if (requestedProject && requestedProject !== BL23G_M1_PROJECT_KEY &&
          !(action === "read_breakdown" && requestedProject === BL23G_M2_PROJECT_KEY)) {
        invalidRoute_("Invalid storage project");
      }
      if (action === "read_block_tracker") return jsonOutput_(readBlockTrackerRecords_());
      if (action === "read_machine_layout") return jsonOutput_(readMachineLayoutRecords_());
      return jsonOutput_(buildBreakdownFeed_(breakdownSpreadsheet_().getSheetByName(BREAKDOWN_LOG_SHEET)));
    }
    if (isBreakdownSheetName_(params.sheet)) {
      var breakdownProject = normalizeLine_(params.projectKey);
      if (breakdownProject && breakdownProject !== BL23G_M1_PROJECT_KEY && breakdownProject !== BL23G_M2_PROJECT_KEY) {
        invalidRoute_("Invalid breakdown project");
      }
      return jsonOutput_(buildBreakdownFeed_(breakdownSpreadsheet_().getSheetByName(BREAKDOWN_LOG_SHEET)));
    }

    var route = resolveProductionRoute_(params, false);
    var ss = productionSpreadsheet_(route.config);
    var db = {};
    var records = [];
    var foundSheet = false;
    route.shifts.forEach(function(shift) {
      var sheet = ss.getSheetByName(route.config["shift" + shift]);
      if (!sheet) {
        if (route.shifts.length === 1 || route.config.kind === "skin") {
          var missing = new Error("Production sheet is unavailable");
          missing.code = "SHEET_NOT_FOUND";
          throw missing;
        }
        return;
      }
      foundSheet = true;
      if (route.config.kind === "bl") parseBl23gSheet_(sheet, shift, db, records);
      else parseGizzardSheet_(sheet, shift, db, records, route.config.line, route.config.target);
    });
    if (!foundSheet) {
      var unavailable = new Error("Production sheets are unavailable");
      unavailable.code = "SHEET_NOT_FOUND";
      throw unavailable;
    }
    db._records = dedupeRecordsByTrialAndShift_(records);
    attachSummaryFields_(db, db._records);
    return jsonOutput_(db);
  } catch (error) {
    return jsonOutput_({
      status: "error",
      code: error.code || "READ_FAILED",
      error: error.code ? error.message : "Unable to read the requested feed",
      _records: []
    });
  }
}

function buildBreakdownFeed_(sheet) {
  return breakdownPublicFeed_(sheet);
}

function saveExternalRecord_(payload) {
  var route = resolveProductionRoute_(payload, true);
  var ss = productionSpreadsheet_(route.config);
  var shift = route.shifts[0];
  var sheetName = route.config["shift" + shift];
  var sheet = shift === "B" && route.config.kind !== "skin"
    ? ensureShiftBSheetCopy_(ss, route.config.shiftA, route.config.shiftB)
    : ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Production sheet is unavailable");

  var audit = ensureRecordAuditColumns_(sheet);
  var nextRow = sheet.getLastRow() + 1;
  sheet.appendRow(buildBl23gRow_(payload, shift));
  sheet.getRange(nextRow, audit.recordDateColumn).setValue(valueOrEmpty_(payload.recordDate || payload.date));
  sheet.getRange(nextRow, audit.createdAtColumn).setValue(new Date().toISOString());
  return { status: "success", message: "Record saved to " + sheetName, sheet: sheetName };
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
  breakdownError_("AUTH_REQUIRED", "Legacy breakdown writes are disabled");
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
  var ss = SpreadsheetApp.openById(BL23G_M1_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(BLOCK_TRACKER_SHEET);
  if (!sheet) return { status: "success", sheet: BLOCK_TRACKER_SHEET, records: [] };
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
    return saveExternalRecord_(formData || {});
  } catch (error) {
    return { status: "error", code: error.code || "WRITE_FAILED", message: "Save failed: " + error.toString() };
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
  var ss = SpreadsheetApp.openById(MACHINE_LAYOUT_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MACHINE_LAYOUT_SHEET);
  if (!sheet) return { status: "success", records: [] };
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
