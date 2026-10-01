const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createGasHarness({ activeSheets = {}, externalSheets = {} } = {}) {
    const mutations = [];
    const reads = [];
    function spreadsheet(initial, id) {
        const sheets = new Map();
        function sheet(name, initialRows = []) {
            const rows = initialRows.map(row => row.slice());
            const result = {
                rows,
                getName: () => name,
                getLastRow: () => rows.length,
                getLastColumn: () => Math.max(0, ...rows.map(row => row.length)),
                getDataRange: () => result.getRange(1, 1, Math.max(rows.length, 1), Math.max(result.getLastColumn(), 1)),
                getRange(row, column, height = 1, width = 1) {
                    const range = {
                        getValues: () => Array.from({ length: height }, (_, i) =>
                            Array.from({ length: width }, (_, j) => rows[row - 1 + i]?.[column - 1 + j] ?? '')),
                        getDisplayValues: () => range.getValues().map(values => values.map(String)),
                        setValues(values) {
                            mutations.push({ type: 'setValues', spreadsheet: id, sheet: name, row, column });
                            values.forEach((valuesRow, i) => {
                                rows[row - 1 + i] ||= [];
                                valuesRow.forEach((value, j) => { rows[row - 1 + i][column - 1 + j] = value; });
                            });
                            return range;
                        },
                        setValue: value => range.setValues([[value]]),
                        clearContent() {
                            mutations.push({ type: 'clearContent', spreadsheet: id, sheet: name });
                            return range.setValues(Array.from({ length: height }, () => Array(width).fill('')));
                        }
                    };
                    return range;
                },
                appendRow(values) {
                    mutations.push({ type: 'appendRow', spreadsheet: id, sheet: name });
                    rows.push(Array.from(values));
                    return result;
                },
                deleteRow(row) {
                    mutations.push({ type: 'deleteRow', spreadsheet: id, sheet: name, row });
                    rows.splice(row - 1, 1);
                },
                copyTo(target) {
                    mutations.push({ type: 'copySheet', spreadsheet: id, sheet: name });
                    return target.addSheet(name + ' copy', rows);
                },
                setName(next) {
                    mutations.push({ type: 'renameSheet', spreadsheet: id, sheet: name });
                    sheets.delete(name);
                    name = next;
                    sheets.set(name, result);
                    return result;
                }
            };
            sheets.set(name, result);
            return result;
        }
        const ss = {
            addSheet: sheet,
            getSheetByName(name) {
                reads.push({ spreadsheet: id, sheet: name });
                return sheets.get(name) || null;
            },
            insertSheet(name) {
                mutations.push({ type: 'insertSheet', spreadsheet: id, sheet: name });
                return sheet(name);
            }
        };
        Object.entries(initial).forEach(([name, rows]) => sheet(name, rows));
        return ss;
    }
    const active = spreadsheet(activeSheets, 'active');
    const external = spreadsheet(externalSheets, 'external');
    const context = vm.createContext({
        console,
        SpreadsheetApp: { getActiveSpreadsheet: () => active, openById: () => external, flush() {} },
        ContentService: {
            MimeType: { JSON: 'application/json' },
            createTextOutput: text => ({ getContent: () => text, setMimeType() { return this; } })
        },
        Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
        Utilities: { getUuid: () => 'synthetic-id', formatDate: () => '20260930-120000' },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        fetch() { throw new Error('Network access is forbidden in GAS unit tests'); },
        UrlFetchApp: { fetch() { throw new Error('Network access is forbidden in GAS unit tests'); } }
    });
    const source = fs.readFileSync(path.resolve(__dirname, '../../yakitori-gas-src/รหัส.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'GAS source', timeout: 1000 });
    return {
        context, active, external, mutations, reads,
        read: params => JSON.parse(context.getJsonStream({ parameter: params }).getContent()),
        post: request => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(request) } }).getContent())
    };
}

function trialRows(shift = 'A', productivity = 77.6) {
    const headers = Array.from({ length: 17 }, (_, i) => 'column' + i);
    headers.push('recordDate', 'createdAt');
    const row = ['8', 1, 2, 3, 4, 5, 15, productivity * 10, 10, 1, 4, 2, 2, 1, productivity, shift, 0,
        '2026-09-30', '2026-09-30T05:00:00Z'];
    return [headers, row];
}

module.exports = { createGasHarness, trialRows };
