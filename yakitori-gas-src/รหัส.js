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

    if (action === "approve_record") {
      return jsonOutput_(saveApprovalRecord_(request.payload || {}));
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
var GZ30G_SOURCE_SHEET = "GZ30gR15_DataLog";
var GZ30G_SHIFT_B_SHEET = "GZ30gR15_ShiftB_DataLog";
var GZ30G_TARGET_PRODUCTIVITY = 69;
var GZ40G_SOURCE_SHEET = "GZ40gS18_DataLog";
var GZ40G_SHIFT_B_SHEET = "GZ40gS18_ShiftB_DataLog";
var GZ40G_TARGET_PRODUCTIVITY = 84;

function isBl23gSheetName_(sheetName) {
  return String(sheetName || "").trim().toUpperCase().indexOf("BL23G") !== -1;
}

function normalizeLine_(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveBl23gSheetName_(shift) {
  return normalizeShift_(shift) === "B" ? BL23G_SHIFT_B_SHEET : BL23G_SOURCE_SHEET;
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

function parseBl23gSheet_(sheet, defaultShift, db, records) {
  var data = sheet.getDataRange().getValues();
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

    db[recordKey] = {
      trial: trialKey,
      line: "BL23G",
      shift: shift,
      prod: Number(productivity),
      eff: Number(calculatedEff),
      man: totalMan,
      total: totalOutput,
      recordDate: "",
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
      recordDate: "",
      status: ""
    });
  }
}

function parseGizzardSheet_(sheet, defaultShift, db, records, lineLabel, targetProductivity) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var trialKey = row[0] ? row[0].toString().trim() : "";
    if (trialKey === "" || trialKey === "Default" || trialKey === "เดิม") continue;

    var shiftOffset = isShiftToken_(row[1]) ? 1 : 0;
    var shift = shiftOffset ? normalizeShift_(row[1], defaultShift) : normalizeShift_(defaultShift);
    var totalOutput = Number(row[7 + shiftOffset]) || 0;
    var totalMan = Number(row[8 + shiftOffset]) || 0;
    var productivity = totalMan > 0 ? (totalOutput / totalMan) : 0;

    var recordKey = buildRecordKey_(trialKey, shift);
    var cycleDetail = {
      prep: Number(row[1 + shiftOffset]) || 0,
      arrange: Number(row[2 + shiftOffset]) || 0,
      machine: Number(row[3 + shiftOffset]) || 0,
      inspec: Number(row[4 + shiftOffset]) || 0,
      pack: Number(row[5 + shiftOffset]) || 0
    };
    var layout = {
      prep: Number(row[9 + shiftOffset]) || 0,
      block: Number(row[10 + shiftOffset]) || 0,
      inspec: Number(row[11 + shiftOffset]) || 0,
      pack: Number(row[12 + shiftOffset]) || 0,
      op: Number(row[13 + shiftOffset]) || 0
    };
    var calculatedEff = (productivity / targetProductivity) * 100;
    var line = row[15 + shiftOffset] ? row[15 + shiftOffset].toString().trim() : lineLabel;
    var recordDate = row[14 + shiftOffset] ? row[14 + shiftOffset].toString().trim() : "";
    var status = row[20 + shiftOffset] ? row[20 + shiftOffset].toString().trim() : "";

    db[recordKey] = {
      trial: trialKey,
      line: line || lineLabel,
      shift: shift,
      prod: Number(productivity),
      eff: Number(calculatedEff),
      man: totalMan,
      total: totalOutput,
      recordDate: recordDate,
      status: status,
      ct_total: Number(row[6 + shiftOffset]) || 0,
      layout: layout,
      cycle_detail: cycleDetail
    };

    records.push({
      key: recordKey,
      trial: trialKey,
      line: line || lineLabel,
      shift: shift,
      prod: Number(productivity),
      eff: Number(calculatedEff),
      man: totalMan,
      total: totalOutput,
      recordDate: recordDate,
      status: status
    });
  }
}

function getJsonStream(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "GZ30gR15_DataLog";

  if (e && e.parameter && e.parameter.sheet) {
    sheetName = e.parameter.sheet.toString().trim();
  }

  if (isBl23gSheetName_(sheetName)) {
    var bl23Db = {};
    var bl23Records = [];

    var sourceSheet = ss.getSheetByName(BL23G_SOURCE_SHEET);
    if (sourceSheet) {
      parseBl23gSheet_(sourceSheet, "A", bl23Db, bl23Records);
    }

    if (sheetName === BL23G_SHIFT_B_SHEET) {
      bl23Db = {};
      bl23Records = [];
      var shiftBSheet = ss.getSheetByName(BL23G_SHIFT_B_SHEET);
      if (shiftBSheet) {
        parseBl23gSheet_(shiftBSheet, "B", bl23Db, bl23Records);
      }
    } else {
      var shiftB = ss.getSheetByName(BL23G_SHIFT_B_SHEET);
      if (shiftB) {
        parseBl23gSheet_(shiftB, "B", bl23Db, bl23Records);
      }
    }

    bl23Db._records = bl23Records;
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

    gizzardDb._records = gizzardRecords;
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

  db._records = records;
  return ContentService.createTextOutput(JSON.stringify(db))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveExternalRecord_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var line = normalizeLine_(payload.line);
  var requestedSheet = String(payload.sheet || payload.targetSheet || "").trim();
  var now = new Date();

  if (line === "BL23G" || isBl23gSheetName_(requestedSheet)) {
    var shift = normalizeShift_(payload.shift);
    var targetSheetName = resolveBl23gSheetName_(shift);
    var targetSheet = targetSheetName === BL23G_SHIFT_B_SHEET ? ensureBl23ShiftBSheet_(ss) : ss.getSheetByName(BL23G_SOURCE_SHEET);
    if (!targetSheet) {
      throw new Error("BL23G source sheet not found: " + BL23G_SOURCE_SHEET);
    }

    targetSheet.appendRow(buildBl23gRow_(payload, shift));
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

    gTargetSheet.appendRow([
      valueOrEmpty_(payload.trial),
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
      Number(payload.man_op) || 0
    ]);

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
        Number(formData.man_op)
      ];
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
