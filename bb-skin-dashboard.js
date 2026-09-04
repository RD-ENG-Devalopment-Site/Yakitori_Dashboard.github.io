// ==========================================
        // 1. ตัวแปรสำหรับจัดการข้อมูล (Global Variables)
        // ==========================================
        let db = {}; 
        let keys = [];
        
        // 🌟 แก้ไขจุดที่ 1: ปรับเปลี่ยนตัวแปรเป้าหมายหลักวิศวกรรมกระบวนการเป็น 130
        const targetProductivity = 71; 
        let actualBaseline = { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 };

        const popup = document.getElementById('iterDropdown');
        const icon = document.getElementById('dropdownIcon');
        let isOpen = false;
        let selectedDataIndex = -1;
        let selectedShiftFilter = 'all';
        let baselineKey = null;

        let trendChart;
        let cycleChart;
        let prodJourneyChart;
        let bottleneckChart;
        
        let chartLabels = [];
        let chartData = [];
        let viewKeys = [];

        if (window.Chart) Chart.defaults.color = '#a1a5b7';
        if (window.Chart) Chart.defaults.borderColor = '#323248';
        if (window.Chart) Chart.defaults.font.family = "'Sarabun', sans-serif";

        let bestTrialKey = "38"; 
        let gapComparisonKey = null;

        // ==========================================
        // 🌟 Web App URL
        // ==========================================
        const googleWebAppUrl = window.YakitoriRuntime.CONFIG.appsScriptUrl;

        window.addEventListener('load', loadData);

        // ==========================================
        // 🛠️ ดึงข้อมูลจาก Google Sheets หรือ Mock Data สำรอง
        // ==========================================
        const emptyMarkup = new Map(Array.from(document.querySelectorAll('[id]'))
            .filter(el => !el.querySelector('[id]') && !['SCRIPT','CANVAS','SELECT','BUTTON'].includes(el.tagName))
            .map(el => [el.id, el.innerHTML]));

        function clearDashboard(message) {
            [trendChart, cycleChart, prodJourneyChart, bottleneckChart].forEach(chart => chart && chart.destroy());
            trendChart = cycleChart = prodJourneyChart = bottleneckChart = null;
            emptyMarkup.forEach((html, id) => { document.getElementById(id).innerHTML = html; });
            document.getElementById('selectedIterText').textContent = message;
            document.getElementById('dropdownList').textContent = message;
            document.querySelectorAll('tbody').forEach(body => {
                body.innerHTML = '<tr><td colspan="20" class="p-6 text-center">' + message + '</td></tr>';
            });
            ['gapComparisonSelect','tableRoundSelect'].forEach(id => {
                const el = document.getElementById(id);
                el.innerHTML = '<option value="">ไม่มีข้อมูล</option>';
                el.disabled = true;
            });
            selectedDataIndex = -1;
        }

        async function loadData() {
            const status = document.getElementById('dataStatus');
            const retry = document.getElementById('reloadData');
            retry.disabled = true;
            status.textContent = 'กำลังโหลดข้อมูล BB Skin…';
            clearDashboard('กำลังโหลดข้อมูล…');
            try {
                if (!window.Chart) throw new Error('โหลดไลบรารีกราฟไม่สำเร็จ');
                const feeds = await Promise.all(['A','B'].map(async shift => {
                    const url = window.YakitoriRuntime.buildApiUrl('BBSKINR12_DataLog_Shift ' + shift, {
                        projectKey: 'BBSKINR12', shift, ts: Date.now()
                    });
                    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
                    if (!response.ok) throw new Error('โหลด Shift ' + shift + ' ไม่สำเร็จ (HTTP ' + response.status + ')');
                    const feed = await response.json();
                    if (feed.error) throw new Error(String(feed.error));
                    return feed;
                }));
                db = {};
                feeds.forEach(feed => Object.entries(feed).forEach(([key, record]) => {
                    if (!record || typeof record !== 'object' || !record.cycle_detail || !record.layout) return;
                    const trial = String(record.trial || '').trim();
                    if (!/^(?:[0-9]+(?:\\.[0-9]+)?|เดิม)$/.test(trial)) return;
                    const shift = String(record.shift).toUpperCase();
                    if (!['A','B'].includes(shift)) throw new Error('ข้อมูลกะไม่ถูกต้อง');
                    if (record.line !== 'BBSKINR12') throw new Error('GAS ยังไม่ใช่รุ่นที่รองรับ BB Skin กรุณาตรวจการเผยแพร่');
                    const total = Number(record.total) || 0;
                    const man = Number(record.man) || 0;
                    const prod = Number(record.prod) || (man ? total / man : 0);
                    db[trial + '_' + shift] = { ...record, trial, shift, total, man, prod, eff: prod / targetProductivity * 100 };
                }));
                keys = [];
                if (!Object.keys(db).length) {
                    clearDashboard('ยังไม่มีข้อมูล BB Skin');
                    status.textContent = 'ยังไม่มีข้อมูล BB Skin ในทั้งสองกะ';
                    return;
                }
                document.getElementById('gapComparisonSelect').disabled = false;
                document.getElementById('tableRoundSelect').disabled = false;
                initializeDashboardFromSheets();
                status.textContent = 'อัปเดตแล้ว • ' + keys.length + ' รายการ • ' + new Date().toLocaleString('th-TH');
            } catch (error) {
                db = {}; keys = []; viewKeys = [];
                clearDashboard('ไม่สามารถโหลดข้อมูลได้');
                status.textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + error.message + ' — กดโหลดใหม่เพื่อลองอีกครั้ง';
            } finally {
                retry.disabled = false;
            }
        }

        function initializeDashboardFromSheets() {
            const allSheetKeys = Object.keys(db).filter(isSelectableTrialKey);
            if (allSheetKeys.length === 0) return;
            
            allSheetKeys.sort(compareRecordKeys);
            
            keys.length = 0; 
            allSheetKeys.forEach(k => keys.push(k));

            bestTrialKey = findBestTrialKey();
            gapComparisonKey = bestTrialKey;

            baselineKey = keys.find(isBaselineRecord) || keys[0];

            let maxYield = Math.max(...keys.map(k => db[k] ? Number(db[k].total) : 0));
            if (maxYield === -Infinity) maxYield = 0;
            document.getElementById('header-max-yield').innerHTML = `${maxYield.toLocaleString()} <span class="text-xs font-normal text-[#6b7280]">ไม้/ชม.</span>`;

            selectedShiftFilter = 'all';
            syncShiftFilterSelect();
            refreshShiftView();

            let defaultKey = getVisibleKeys().slice(-1)[0] || baselineKey || keys[keys.length - 1] || "เดิม";
            selectIteration(defaultKey); 
        }

        function toggleDropdown() {
            isOpen = !isOpen;
            if (isOpen) {
                popup.classList.add('open');
                icon.style.transform = 'rotate(180deg)';
            } else {
                popup.classList.remove('open');
                icon.style.transform = 'rotate(0deg)';
            }
        }

        document.addEventListener('click', function(event) {
            const btn = document.getElementById('iterPickerBtn');
            if (isOpen && !popup.contains(event.target) && !btn.contains(event.target)) {
                toggleDropdown();
            }
        });

        function formatVal(val) {
            return Number(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}); 
        }

        function recalculateEfficiencyForAllRecords() {
            Object.keys(db).forEach(k => {
                if (db[k] && db[k].prod !== undefined) {
                    db[k].eff = (Number(db[k].prod) / targetProductivity) * 100;
                }
            });
        }

        function getCycleTotal(record) {
            const cycle = record && record.cycle_detail ? record.cycle_detail : {};
            return (Number(cycle.prep) || 0) + (Number(cycle.arrange) || 0) + (Number(cycle.machine) || 0) + (Number(cycle.inspec) || 0) + (Number(cycle.pack) || 0);
        }

        function findBestTrialKey(sourceKeys) {
            const scanKeys = Array.isArray(sourceKeys) && sourceKeys.length ? sourceKeys : keys;
            let bestKey = null;
            let bestScore = -Infinity;
            scanKeys.forEach(k => {
                if (isBaselineRecord(k)) return;
                const record = db[k];
                if (!record) return;

                const eff = Number(record.eff) || 0;
                const prod = Number(record.prod) || 0;
                const totalCt = getCycleTotal(record);
                const score = (eff * 1000000) + (prod * 1000) - totalCt;

                if (score > bestScore) {
                    bestScore = score;
                    bestKey = k;
                }
            });
            return bestKey || scanKeys.find(k => !isBaselineRecord(k)) || scanKeys[0] || "เดิม";
        }

        function highlightTableRow(key) {
            keys.forEach(k => {
                const row = document.getElementById(`row-${k}`);
                if (row) row.classList.remove('row-active');
            });
            const activeRow = document.getElementById(`row-${key}`);
            if (activeRow) activeRow.classList.add('row-active');
        }
        function isSelectableTrialKey(key) {
            const normalized = String(key || '').trim();
            return normalized !== '' && !normalized.startsWith('_');
        }

        function getTrialLabel(key) {
            const record = db[key] || {};
            return String(record.trial || String(key || '').split('__')[0]).trim();
        }

        function getRecordShift(key) {
            return String((db[key] && db[key].shift) || String(key || '').split('__')[1] || 'A').trim().toUpperCase();
        }

        function isBaselineRecord(key) {
            const trial = getTrialLabel(key);
            return trial === 'เดิม' || trial === 'Baseline';
        }

        function compareRecordKeys(a, b) {
            if (isBaselineRecord(a)) return -1;
            if (isBaselineRecord(b)) return 1;

            const trialA = getTrialLabel(a);
            const trialB = getTrialLabel(b);
            const numberA = Number(trialA);
            const numberB = Number(trialB);
            const trialCompare = Number.isFinite(numberA) && Number.isFinite(numberB)
                ? numberA - numberB
                : trialA.localeCompare(trialB, 'th', { numeric: true });

            return trialCompare || getRecordShift(a).localeCompare(getRecordShift(b));
        }

        function getVisibleKeys() {
            const shift = String(selectedShiftFilter || 'all').trim().toUpperCase();
            return keys.filter(k => {
                if (!isSelectableTrialKey(k)) return false;
                if (shift === 'ALL') return true;
                if (shift === 'B') {
                    return !isBaselineRecord(k) && getRecordShift(k) === 'B';
                }
                if (isBaselineRecord(k)) return true;
                return getRecordShift(k) === shift;
            });
        }

        function getSummaryBaselineKey() {
            const visibleKeys = getVisibleKeys();
            if (gapComparisonKey && db[gapComparisonKey]) {
                return visibleKeys.find(k => getRecordShift(k) === getRecordShift(gapComparisonKey)) || visibleKeys[0];
            }
            const shift = String(selectedShiftFilter || 'all').trim().toUpperCase();
            if (!visibleKeys.length) return baselineKey || keys[0] || "เดิม";
            if (shift === 'B') return visibleKeys[0];
            return keys.find(isBaselineRecord) || visibleKeys[0] || keys[0] || "เดิม";
        }

        function getCompareGapPercent(baseValue, selectedValue, inverse = false) {
            const base = Number(baseValue) || 0;
            const selected = Number(selectedValue) || 0;
            if (!base) return 0;
            return inverse ? ((base - selected) / base) * 100 : ((selected - base) / base) * 100;
        }

        function formatSignedPercent(value) {
            const num = Number(value) || 0;
            return (num > 0 ? "+" : "") + num.toFixed(1) + "%";
        }

        function applySummaryBadge(id, value, inverseBetter = false) {
            const el = document.getElementById(id);
            if (!el) return;
            const num = Number(value) || 0;
            el.innerText = formatSignedPercent(num);
            el.className = "text-sm font-bold font-en " + (inverseBetter ? (num <= 0 ? "text-[#50cd89]" : "text-[#f1416c]") : (num >= 0 ? "text-[#50cd89]" : "text-[#f1416c]"));
        }

        function refreshShiftView() {
            viewKeys = getVisibleKeys();
            if (!viewKeys.length) { clearDashboard('ยังไม่มีข้อมูลสำหรับกะนี้'); return; }
            document.getElementById('gapComparisonSelect').disabled = false;
            document.getElementById('tableRoundSelect').disabled = false;
            bestTrialKey = findBestTrialKey(viewKeys);
            gapComparisonKey = (viewKeys.includes(gapComparisonKey) ? gapComparisonKey : bestTrialKey);
            const summaryBaselineKey = getSummaryBaselineKey();

            chartLabels = viewKeys.map(k => {
                const trial = getTrialLabel(k);
                return String(selectedShiftFilter).toUpperCase() === "ALL" && !isBaselineRecord(k)
                    ? trial + " (" + getRecordShift(k) + ")"
                    : trial;
            });
            chartData = viewKeys.map(k => db[k] ? Number(db[k].prod) || 0 : 0);
            renderList();
            renderTable();
            initCharts();
            syncGapComparisonSelect();
            calculateExecutiveSummary(summaryBaselineKey, gapComparisonKey);
            initSummaryCharts(summaryBaselineKey, gapComparisonKey);
        }
        function syncShiftFilterSelect() {
            const select = document.getElementById('shiftFilterSelect');
            if (select && select.value !== selectedShiftFilter) {
                select.value = selectedShiftFilter;
            }
        }

        function syncGapComparisonSelect() {
            const select = document.getElementById('gapComparisonSelect');
            if (!select) return;

            const visibleKeys = getVisibleKeys();
            const compareKeys = visibleKeys.filter(k => !isBaselineRecord(k));
            const fallbackKey = compareKeys[compareKeys.length - 1] || visibleKeys[visibleKeys.length - 1] || baselineKey || keys[keys.length - 1] || "เดิม";

            if (!compareKeys.length) {
                select.innerHTML = '<option value="">No data</option>';
                select.value = '';
                gapComparisonKey = fallbackKey;
                return;
            }

            const currentKey = compareKeys.includes(gapComparisonKey) ? gapComparisonKey : (compareKeys.includes(bestTrialKey) ? bestTrialKey : fallbackKey);
            gapComparisonKey = currentKey;

            select.innerHTML = compareKeys.map(k => {
                const record = db[k] || {};
                const label = 'TRIAL ' + getTrialLabel(k) + ' / SHIFT ' + getRecordShift(k) + ' - ' + Number(record.prod || 0).toFixed(1);
                return '<option value="' + k + '">' + label + '</option>';
            }).join('');
            select.value = currentKey;
        }

        function setShiftFilter(shift) {
            selectedShiftFilter = String(shift || 'all').trim().toUpperCase() === 'ALL' ? 'all' : String(shift).toUpperCase();
            syncShiftFilterSelect();
            refreshShiftView();
            const nextKey = getVisibleKeys().slice(-1)[0];
            if (nextKey) {
                selectIteration(nextKey);
            }
        }

        function setGapComparison(key) {
            if (!key) return;
            gapComparisonKey = key;
            refreshShiftView();
        }
        function renderList() {
            const listContainer = document.getElementById('dropdownList');
            let html = '';
            getVisibleKeys().forEach(k => {
                const trial = getTrialLabel(k);
                let text = isBaselineRecord(k) ? trial : `ครั้งที่ ${trial} / Shift ${getRecordShift(k)}`;
                if (k === bestTrialKey) text += " 🏆 (Best)";
                let colorClass = isBaselineRecord(k) ? "text-white bg-[#323248]" : "text-[#a1a5b7] hover:bg-[#323248] hover:text-white";
                html += `<button onclick="selectIteration('${k}')" class="w-full text-center px-2 py-2 rounded text-xs font-medium border border-[#323248] ${colorClass} transition">${text}</button>`;
            });
            listContainer.innerHTML = html || '<div class="col-span-2 px-3 py-4 text-center text-[#6b7280] text-xs">No data for this shift</div>';
        }

        function renderRotatingInsight(key, data) {
            const record = data || {};
            const visibleKeys = getVisibleKeys().slice().sort(compareRecordKeys);
            const currentIndex = visibleKeys.indexOf(key);
            const previousKey = currentIndex > 0 ? visibleKeys[currentIndex - 1] : null;
            const previous = previousKey ? (db[previousKey] || {}) : null;
            const shift = getRecordShift(key);
            const shiftCode = shift === 'B' ? 1 : 0;
            const trialNumber = Number(getTrialLabel(key));
            const rotationIndex = ((Number.isFinite(trialNumber) ? trialNumber : 0) + shiftCode) % 12;
            const currentProd = Number(record.prod) || 0;
            const previousProd = Number(previous?.prod) || 0;
            const total = Number(record.total) || 0;
            const manpower = Number(record.man) || 0;
            const efficiency = Number(record.eff) || (targetProductivity ? (currentProd / targetProductivity) * 100 : 0);
            const previousEfficiency = Number(previous?.eff) || 0;
            const cycle = record.cycle_detail || {};
            const previousCycle = previous?.cycle_detail || {};
            const stations = [
                { key: 'prep', label: 'เตรียม RM', value: Number(cycle.prep) || 0 },
                { key: 'arrange', label: 'เรียงเนื้อ (คอขวด)', value: Number(cycle.arrange) || 0 },
                { key: 'machine', label: 'เข้าเครื่อง', value: Number(cycle.machine) || 0 },
                { key: 'inspec', label: 'เช็คสเปค', value: Number(cycle.inspec) || 0 },
                { key: 'pack', label: 'PACKING', value: Number(cycle.pack) || 0 }
            ];
            const bottleneck = stations.reduce((max, station) => station.value > max.value ? station : max, stations[0]);
            const previousBottleneckValue = Number(previousCycle[bottleneck.key]) || 0;
            const cycleTotal = stations.reduce((sum, station) => sum + station.value, 0);
            const previousCycleTotal = Object.keys(previousCycle).length
                ? ['prep', 'arrange', 'machine', 'inspec', 'pack'].reduce((sum, station) => sum + (Number(previousCycle[station]) || 0), 0)
                : 0;
            const prodGap = currentProd - previousProd;
            const prodGapPct = previousProd ? (prodGap / previousProd) * 100 : 0;
            const cycleGap = cycleTotal - previousCycleTotal;
            const targetGap = currentProd - targetProductivity;
            const targetGapPct = targetProductivity ? (targetGap / targetProductivity) * 100 : 0;
            const oppositeShift = shift === 'B' ? 'A' : 'B';
            const oppositeKeys = keys.filter(candidate => !isBaselineRecord(candidate) && getRecordShift(candidate) === oppositeShift).sort(compareRecordKeys);
            const oppositeKey = oppositeKeys[oppositeKeys.length - 1];
            const opposite = oppositeKey ? (db[oppositeKey] || {}) : null;
            const shiftGap = opposite ? currentProd - (Number(opposite.prod) || 0) : 0;
            const shiftGapPct = opposite && Number(opposite.prod) ? (shiftGap / Number(opposite.prod)) * 100 : 0;
            const bestLabel = bestTrialKey && db[bestTrialKey] ? `${Number(db[bestTrialKey].prod || 0).toFixed(1)} (Trial ${getTrialLabel(bestTrialKey)})` : 'ยังไม่มีข้อมูล';
            const sign = value => Number(value) > 0 ? '+' : '';
            const fixed = value => Number(value || 0).toFixed(2);
            const pct = value => `${sign(value)}${Number(value || 0).toFixed(1)}%`;
            const state = currentProd < previousProd ? 'negative' : (currentProd >= Number(db[bestTrialKey]?.prod || 0) ? 'best' : (efficiency >= previousEfficiency ? 'improving' : 'stable'));
            const action = `ทดลองลดเวลา ${bottleneck.label} ลง 0.50-1.00 วินาที และตรวจสอบผลใน Trial ถัดไป`;
            const templates = [
                { opening: `รอบนี้ ${getTrialLabel(key)} ของ ${shift} ทำ Productivity ได้ ${currentProd.toFixed(1)} ไม้/คน/ชม.`, bottleneck: `${bottleneck.label} ใช้เวลาสูงสุด ${fixed(bottleneck.value)} วินาที จึงเป็นจุดโฟกัสหลัก`, shift: previous ? `เมื่อเทียบรอบก่อน ผลผลิตเปลี่ยนแปลง ${sign(prodGap)}${prodGap.toFixed(1)} ไม้/คน/ชม. (${pct(prodGapPct)})` : `ยังไม่มีรอบก่อนหน้าใน ${shift} สำหรับใช้เปรียบเทียบ`, action, risk: `หากยังไม่ลดเวลาจุดนี้ จะมี Gap จาก Target ${targetProductivity} อยู่ที่ ${pct(targetGapPct)}` },
                { opening: `${getTrialLabel(key)} แสดง Efficiency ${efficiency.toFixed(2)}% จากกำลังคน ${manpower} คน`, bottleneck: `ข้อจำกัดของกระบวนการอยู่ที่ ${bottleneck.label} (${fixed(bottleneck.value)} วินาที)`, shift: opposite ? `${shift} ต่างจาก Shift ${oppositeShift} อยู่ ${sign(shiftGap)}${shiftGap.toFixed(1)} ไม้/คน/ชม. (${pct(shiftGapPct)})` : `ยังไม่มีข้อมูล Shift ${oppositeShift} สำหรับการเทียบ`, action: `ปรับสมดุลกำลังคนและวิธีทำงานบริเวณ ${bottleneck.label}`, risk: `ถ้าความต่างระหว่างกะเพิ่มขึ้น อาจทำให้มาตรฐานการผลิตไม่คงที่` },
                { opening: `ผลผลิตปัจจุบันอยู่ที่ ${currentProd.toFixed(1)} เมื่อเทียบกับ Best Record ${bestLabel}`, bottleneck: `เวลาที่ควรทบทวนก่อนคือ ${bottleneck.label} ซึ่งใช้ ${fixed(bottleneck.value)} วินาที`, shift: previous ? `Cycle Time ของรอบนี้เปลี่ยนจากรอบก่อน ${sign(cycleGap)}${fixed(cycleGap)} วินาที` : `รอบนี้เป็นจุดเริ่มต้นของชุดข้อมูลที่เลือก`, action: `นำวิธีทำงานจากรอบที่ดีที่สุดมาเทียบกับ ${bottleneck.label}`, risk: `หากความแตกต่างจาก Best Record ยังสูง อาจรักษาระดับผลผลิตไม่ได้` },
                { opening: `${shift} ของ ${getTrialLabel(key)} ให้ผลผลิต ${currentProd.toFixed(1)} ไม้/คน/ชม.`, bottleneck: `${bottleneck.label} เป็นจุดที่ควรตรวจสอบความสมดุลของงาน`, shift: opposite ? `ผลต่างระหว่าง ${shift} และ Shift ${oppositeShift} คือ ${sign(shiftGap)}${shiftGap.toFixed(1)} (${pct(shiftGapPct)})` : `ยังไม่มีข้อมูลอีกกะเพื่อยืนยันความแตกต่าง`, action: `ตรวจสอบมาตรฐานการจัดคนและลำดับงานของทั้งสองกะ`, risk: `มาตรฐานที่ไม่เท่ากันอาจทำให้ผลลัพธ์ระหว่างกะแตกต่างต่อเนื่อง` },
                { opening: `Cycle Time รวมของรอบนี้อยู่ที่ ${fixed(cycleTotal)} วินาที`, bottleneck: `${bottleneck.label} ใช้เวลา ${fixed(bottleneck.value)} วินาที สูงที่สุดในกระบวนการ`, shift: previous ? `Cycle Time รวมเปลี่ยนจากรอบก่อน ${sign(cycleGap)}${fixed(cycleGap)} วินาที` : `ยังไม่มีค่ารอบก่อนสำหรับวัดการเปลี่ยนแปลง`, action: `ทดลองลดเวลาที่ ${bottleneck.label} ก่อนประเมินทั้งไลน์`, risk: `การลดเวลาโดยไม่ติดตามคุณภาพอาจทำให้เกิด Rework เพิ่มขึ้น` },
                { opening: `รอบนี้ใช้กำลังคน ${manpower} คน และทำผลผลิตได้ ${currentProd.toFixed(1)} ไม้/คน/ชม.`, bottleneck: `ภาระงานที่ ${bottleneck.label} อาจไม่สมดุลกับจำนวนคนที่จัดไว้`, shift: opposite ? `เมื่อเทียบกับ Shift ${oppositeShift} มีผลต่าง Productivity ${pct(shiftGapPct)}` : `ยังไม่มีข้อมูลกำลังคนของ Shift ${oppositeShift} สำหรับเปรียบเทียบ`, action: `ทดลองโยกกำลังคนไปยัง ${bottleneck.label} และวัดผลซ้ำ`, risk: `การเพิ่มคนโดยไม่แก้ขั้นตอนอาจเพิ่มต้นทุนโดยไม่เพิ่มผลผลิต` },
                { opening: `${shift} มีสัญญาณปรับปรุงดีขึ้น โดย Productivity อยู่ที่ ${currentProd.toFixed(1)}`, bottleneck: `แม้ผลผลิตดีขึ้น แต่ ${bottleneck.label} ยังเป็นจุดจำกัด`, shift: previous ? `ผลผลิตดีขึ้นจากรอบก่อน ${pct(prodGapPct)}` : `รอบนี้เป็นข้อมูลแรกของ ${shift}`, action: `รักษาวิธีทำงานรอบนี้และยืนยันผลซ้ำอีก 1-2 รอบ`, risk: `ผลดีขึ้นเพียงครั้งเดียวอาจยังไม่เพียงพอสำหรับกำหนดเป็นมาตรฐานถาวร` },
                { opening: `รอบล่าสุดของ ${shift} ลดลงเหลือ ${currentProd.toFixed(1)} ไม้/คน/ชม.`, bottleneck: `${bottleneck.label} มีผลต่อการลดลงของผลผลิตมากที่สุด`, shift: previous ? `เมื่อเทียบรอบก่อน ผลต่างอยู่ที่ ${sign(prodGap)}${prodGap.toFixed(1)} (${pct(prodGapPct)})` : `ยังไม่มีรอบก่อนหน้าเพื่อยืนยันแนวโน้ม`, action: `ตรวจสอบสาเหตุหน้างานและยืนยันข้อมูลก่อนเริ่ม Trial ถัดไป`, risk: `หากแนวโน้มลดลงต่อเนื่อง Gap จาก Target จะเพิ่มขึ้น` },
                { opening: `${getTrialLabel(key)} ทำได้ ${currentProd.toFixed(1)} เทียบกับ Target ${targetProductivity}`, bottleneck: `ระยะห่างจากเป้าหมายสัมพันธ์กับเวลาที่ ${bottleneck.label}`, shift: `รอบนี้มี Gap จาก Target ${pct(targetGapPct)}`, action: `กำหนด Action เฉพาะจุดเพื่อปิด Gap ในรอบถัดไป`, risk: `หากไม่ลดเวลาคอขวด จะยังไม่สามารถแตะ Target ได้สม่ำเสมอ` },
                { opening: `ผลผลิตของรอบนี้อยู่ที่ ${currentProd.toFixed(1)} โดยต้องควบคุมคุณภาพควบคู่กัน`, bottleneck: `${bottleneck.label} ใช้เวลาสูง แต่เป็นขั้นตอนที่ต้องรักษาคุณภาพ`, shift: previous ? `ผลต่างจากรอบก่อนอยู่ที่ ${sign(prodGap)}${prodGap.toFixed(1)} ไม้/คน/ชม.` : `ยังไม่มีข้อมูลรอบก่อนเพื่อเทียบผลกระทบ`, action: `ลดเวลาเป็นขั้นและติดตาม Defect/Rework ร่วมกับ Productivity`, risk: `การเร่งผลผลิตโดยไม่ควบคุมคุณภาพอาจเพิ่มงานแก้ไข` },
                { opening: `${shift} มีแนวโน้มคงที่ที่ Productivity ${currentProd.toFixed(1)}`, bottleneck: `${bottleneck.label} ยังคงเป็นจุดที่ใช้เวลามากที่สุด`, shift: previous ? `ผลต่างจากรอบก่อนอยู่ที่ ${pct(prodGapPct)}` : `ควรเก็บข้อมูลต่อเนื่องก่อนสรุปแนวโน้ม`, action: `เก็บข้อมูลเพิ่มเพื่อยืนยันค่าพื้นฐานของกระบวนการ`, risk: `ถ้าจำนวนรอบยังน้อย ไม่ควรใช้เป็นมาตรฐานถาวร` },
                { opening: `จากข้อมูลรอบ ${getTrialLabel(key)} ควรให้ความสำคัญกับ ${bottleneck.label}`, bottleneck: `เวลาปัจจุบันของจุดนี้คือ ${fixed(bottleneck.value)} วินาที`, shift: previous ? `ผลลัพธ์ต่างจากรอบก่อน ${sign(prodGap)}${prodGap.toFixed(1)} ไม้/คน/ชม.` : `ยังไม่มีรอบก่อนเพื่อระบุแนวโน้ม`, action, risk: `ควรกำหนดเกณฑ์ผ่านก่อนทดลอง เพื่อป้องกันผลกระทบต่อคุณภาพและกำลังคน` }
            ];
            const template = templates[rotationIndex];
            const modeLabel = state === 'negative' ? 'ต้องติดตาม' : (state === 'best' ? 'Best Record' : (state === 'improving' ? 'กำลังดีขึ้น' : 'ติดตามต่อเนื่อง'));
            document.getElementById('insight-overall').innerHTML = `ผลผลิตตามสัดส่วนพนักงานอยู่ที่ <span class="font-bold text-[#009ef7] text-[15px]">${manpower} คน</span> ได้ ${currentProd.toFixed(1)} ไม้/คน/ชม. <span class="text-[#a1a5b7]">[ผลผลิตรวม ${total.toLocaleString()} ไม้/ชั่วโมง]</span> <span class="text-[#50cd89]">สถานะ: ${modeLabel}</span>`;
            const rows = [
                ['Opening', template.opening, '#009ef7'],
                ['Bottleneck', template.bottleneck, '#8b5cf6'],
                ['Shift comparison', template.shift, '#ffc700'],
                ['Action', template.action, '#f1416c'],
                ['Risk', template.risk, '#50cd89']
            ];
            document.getElementById('insight-steps').innerHTML = rows.map((row, index) => `
                <div class="flex items-start gap-4">
                    <div class="flex-shrink-0 w-6 h-6 rounded bg-[#2b2b40] border flex items-center justify-center text-xs font-bold mt-0.5" style="color:${row[2]};border-color:${row[2]}55">${index + 1}</div>
                    <div><h4 class="font-bold text-sm mb-1" style="color:${row[2]}">${row[0]}</h4><p class="text-[#a1a5b7] text-sm leading-relaxed">${row[1]}</p></div>
                </div>`).join('');
        }

        function renderInsight(key, data) {
            renderRotatingInsight(key, data);
            return;
            let roundText = isBaselineRecord(key) ? 'กระบวนการเดิม' : `Trial ${getTrialLabel(key)} / Shift ${getRecordShift(key)}`;
            document.getElementById('insight-round').innerText = `[${roundText}]`;
            
            let man = data.man || 0;
            let total = data.total || 0;
            let pProd = data.prod || (man > 0 ? (total / man) : 0);
            
            let layout = data.layout || { prep: 0, block: 0, inspec: 0, pack: 0, op: 0 }; 
            let cycle = data.cycle_detail || { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 }; 

            let arrangeGap = actualBaseline.arrange - cycle.arrange;
            let arrangeStatus = arrangeGap >= 0 
                ? `<span class="text-[#50cd89]">เร็วกว่ารอบเดิม ${Math.abs(arrangeGap).toFixed(2)} วินาที</span>`
                : `<span class="text-[#f1416c]">ใช้เวลาเพิ่มขึ้น ${Math.abs(arrangeGap).toFixed(2)} วินาที</span>`;

            let inspecGap = actualBaseline.inspec - cycle.inspec;
            let inspecStatus = inspecGap >= 0 
                ? `<span class="text-[#50cd89]">ใช้เวลาลดลง ${Math.abs(inspecGap).toFixed(2)} วินาที</span>`
                : `<span class="text-[#f1416c]">ใช้เวลาเพิ่มขึ้น ${Math.abs(inspecGap).toFixed(2)} วินาที</span>`;

            let headerHtml = `ผลผลิตตามสัดส่วนพนักงานทั้งกระบวนการอยู่ที่ <span class="font-bold text-[#009ef7] text-[15px]">${man} คน</span> ` +
                             `ได้จำนวนไม้อยู่ที่ <span class="font-bold text-[#50cd89] text-[15px]">${pProd.toFixed(1)} ไม้ / Hr / Man</span> ` +
                             `<span class="text-[#a1a5b7]">[ยอดการผลิตรวม ${total.toLocaleString()} ไม้/ชั่วโมง]</span> ` +
                             `พบสถานะการทำงานและจุดโฟกัสดังนี้:`;
            document.getElementById('insight-overall').innerHTML = headerHtml;

            let stepsHtml = `
                <div class="flex items-start gap-4">
                    <div class="flex-shrink-0 w-6 h-6 rounded bg-[#2b2b40] text-[#009ef7] border border-[#009ef7]/30 flex items-center justify-center text-xs font-bold mt-0.5">1</div>
                    <div>
                        <h4 class="text-white font-bold text-sm mb-1">เตรียม (RM)</h4>
                        <p class="text-[#a1a5b7] text-sm leading-relaxed">มีพนักงานปฏิบัติงาน <span class="text-[#50cd89]">${layout.prep} คน</span> ใช้เวลาในการเตรียมวัตถุดิบเฉลี่ย <span class="text-white">${cycle.prep} วินาที</span> เพื่อป้อนวัตถุดิบเข้าสู่กระบวนการต่อไป</p>
                    </div>
                </div>

                <div class="flex items-start gap-4">
                    <div class="flex-shrink-0 w-6 h-6 rounded bg-[#2b2b40] text-[#8b5cf6] border border-[#8b5cf6]/30 flex items-center justify-center text-xs font-bold mt-0.5">2</div>
                    <div>
                        <h4 class="text-[#8b5cf6] font-bold text-sm mb-1 flex items-center">เรียงเนื้อลงบล็อค <span class="text-[10px] bg-[rgba(139,92,246,0.15)] border border-[#8b5cf6]/50 px-2 py-0.5 rounded text-[#8b5cf6] ml-2 font-bold uppercase tracking-wider">คอขวดหลัก</span></h4>
                        <p class="text-[#a1a5b7] text-sm leading-relaxed">กระบวนการนี้ใช้เวลาเฉลี่ย <span class="text-white">${cycle.arrange} วินาที</span> (${arrangeStatus}) โดยจัดพนักงานลงไลน์ <span class="text-[#f1416c]">${layout.block} คน</span> <br><span class="text-[#009ef7] mt-1 inline-block">[Analysis: เวลาที่ใช้ในจุดนี้เป็นตัวแปรสำคัญที่สุดที่กำหนด Capacity รวมที่ ${total.toLocaleString()} ไม้/ชั่วโมง การทำ Line Balancing ควรโฟกัสความเร็วของพนักงานจุดนี้เป็นหลัก]</span></p>
                    </div>
                </div>

                <div class="flex items-start gap-4">
                    <div class="flex-shrink-0 w-6 h-6 rounded bg-[#2b2b40] text-[#ffc700] border border-[#ffc700]/30 flex items-center justify-center text-xs font-bold mt-0.5">3</div>
                    <div>
                        <h4 class="text-white font-bold text-sm mb-1">เข้าเครื่องเสียบ</h4>
                        <p class="text-[#a1a5b7] text-sm leading-relaxed">ควบคุมการเดินเครื่องจักร (Machine Time) โดยพนักงาน <span class="text-[#50cd89]">${layout.op} คน</span> ใช้เวลาอยู่ที่ <span class="text-white">${cycle.machine} วินาที</span></p>
                    </div>
                </div>

                <div class="flex items-start gap-4">
                    <div class="flex-shrink-0 w-6 h-6 rounded bg-[#2b2b40] text-[#f1416c] border border-[#f1416c]/30 flex items-center justify-center text-xs font-bold mt-0.5">4</div>
                    <div>
                        <h4 class="text-white font-bold text-sm mb-1">การเช็คสเปค</h4>
                        <p class="text-[#a1a5b7] text-sm leading-relaxed">พนักงานตรวจสอบ <span class="text-[#50cd89]">${layout.inspec} คน</span> ใช้เวลาในการเช็คสเปคสินค้าเฉลี่ย <span class="text-white">${cycle.inspec} วินาที</span> (${inspecStatus}) <br><span class="text-[#a1a5b7] mt-1 inline-block">หากเวลาในจุดนี้สูงขึ้น อาจบ่งบอกถึงปัญหาสินค้า Rework จากเครื่องเสียบไม้ที่ทำให้ทำงานล่าช้าลง</span></p>
                    </div>
                </div>

                <div class="flex items-start gap-4">
                    <div class="flex-shrink-0 w-6 h-6 rounded bg-[#2b2b40] text-[#50cd89] border border-[#50cd89]/30 flex items-center justify-center text-xs font-bold mt-0.5">5</div>
                    <div>
                        <h4 class="text-white font-bold text-sm mb-1">การ Packing</h4>
                        <p class="text-[#a1a5b7] text-sm leading-relaxed">พนักงานบรรจุ <span class="text-[#50cd89]">${layout.pack} คน</span> ปิดจบกระบวนการด้วยเวลา <span class="text-white">${cycle.pack} วินาที</span> ประสิทธิภาพในจุดนี้สามารถรองรับการดันยอดผลิตที่ ${total.toLocaleString()} ไม้/ชั่วโมงได้อย่างราบรื่น</p>
                    </div>
                </div>
            `;
            document.getElementById('insight-steps').innerHTML = stepsHtml;
        }

        function updateGapAnalysis(key, currentData) {
            const tbody = document.getElementById('gapTableBody');
            if(!tbody) return;
            const selectedHeader = isBaselineRecord(key)
                ? 'ข้อมูลเดิม (วิ)'
                : `TRIAL ${getTrialLabel(key)} / SHIFT ${getRecordShift(key)} (วิ)`;
            const headerEl = document.getElementById('gap-header-selected');
            if (headerEl) headerEl.innerText = selectedHeader;
            const cycle = currentData.cycle_detail || { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 };
            const totalCurrent = Number(cycle.prep || 0) + Number(cycle.arrange || 0) + Number(cycle.machine || 0) + Number(cycle.inspec || 0) + Number(cycle.pack || 0);
            const totalActual = Number(actualBaseline.prep) + Number(actualBaseline.arrange) + Number(actualBaseline.machine) + Number(actualBaseline.inspec) + Number(actualBaseline.pack);
            const totalGap = totalCurrent - totalActual;
            const totalPercent = totalActual > 0 ? (totalGap / totalActual) * 100 : 0;
            const gapColor = totalGap > 0 ? 'text-[#f1416c]' : (totalGap < 0 ? 'text-[#50cd89]' : 'text-[#a1a5b7]');
            const gapSign = totalGap > 0 ? '+' : '';

            const rowsData = [
                {
                    name: '1. เตรียม RM',
                    actual: actualBaseline.prep,
                    current: Number(cycle.prep) || 0,
                },
                {
                    name: '2. เรียงเนื้อ (คอขวด)',
                    actual: actualBaseline.arrange,
                    current: Number(cycle.arrange) || 0,
                },
                {
                    name: '3. เข้าเครื่อง',
                    actual: actualBaseline.machine,
                    current: Number(cycle.machine) || 0,
                },
                {
                    name: '4. เช็คสเปค',
                    actual: actualBaseline.inspec,
                    current: Number(cycle.inspec) || 0,
                },
                {
                    name: '5. PACKING',
                    actual: actualBaseline.pack,
                    current: Number(cycle.pack) || 0,
                },
                {
                    name: 'TOTAL CT',
                    actual: totalActual,
                    current: totalCurrent,
                    total: true
                }
            ];

            let html = '';
            rowsData.forEach((row) => {
                const gap = Number(row.current) - Number(row.actual);
                const percent = Number(row.actual) > 0 ? (gap / Number(row.actual)) * 100 : 0;
                const rowGapColor = gap > 0 ? 'text-[#f1416c]' : (gap < 0 ? 'text-[#50cd89]' : 'text-[#a1a5b7]');
                const rowGapSign = gap > 0 ? '+' : '';
                const rowPctColor = percent > 0 ? 'text-[#f1416c]' : (percent < 0 ? 'text-[#50cd89]' : 'text-[#a1a5b7]');
                const bottleneck = !row.total && percent > 10;
                const nameClass = row.total ? 'font-bold text-white text-right' : `text-white text-left pl-6 ${bottleneck ? 'text-[#f1416c] font-bold' : ''}`;
                const displayName = row.total
                    ? 'ระยะเวลารวม (TOTAL CT)'
                    : bottleneck
                        ? `${row.name} <span class="text-xs text-[#f1416c] ml-1">(Bottleneck)</span>`
                        : row.name;

                html += `
                    <tr class="${row.total ? 'bg-[#1e1e2d] text-center border-t-2 border-[#323248]' : (bottleneck ? 'bg-[rgba(241,65,108,0.05)] border-l-4 border-[#f1416c] transition duration-150 text-center' : 'hover:bg-[#2b2b40] border-l-4 border-transparent transition duration-150 text-center')}">
                        <td class="p-4 ${nameClass}">${displayName}</td>
                        <td class="p-4 font-bold text-[#009ef7]">${formatVal(row.actual)}</td>
                        <td class="p-4 font-bold text-white">${formatVal(row.current)}</td>
                        <td class="p-4 font-bold ${rowGapColor}">${rowGapSign}${formatVal(gap)}</td>
                        <td class="p-4 font-bold ${row.total ? (totalGap > 0 ? 'text-[#f1416c]' : (totalGap < 0 ? 'text-[#50cd89]' : 'text-[#a1a5b7]')) : rowPctColor}">${row.total ? `${gapSign}${formatVal(totalPercent)}%` : `${rowGapSign}${formatVal(percent)}%`}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
        }

        function renderTable() {
            return renderLegacyTable();
            const tableBody = document.getElementById('tableBody');
            const allKeys = getVisibleKeys();
            const dataKeys = allKeys.filter(k => !isBaselineRecord(k));
            const keys = tableShiftFilter === 'ALL'
                ? allKeys
                : allKeys.filter(k => isBaselineRecord(k) || getRecordShift(k) === tableShiftFilter);
            if (!keys.length) {
                tableBody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-[#a1a5b7]">ยังไม่มีข้อมูลสำหรับ Shift นี้</td></tr>';
                return;
            }

            const filteredDataKeys = keys.filter(k => !isBaselineRecord(k));
            const latestKey = filteredDataKeys[filteredDataKeys.length - 1] || keys[keys.length - 1];
            const bestKey = [...filteredDataKeys].sort((a, b) => (Number(db[b]?.prod) || 0) - (Number(db[a]?.prod) || 0))[0] || latestKey;
            const summaryKeys = filteredDataKeys.length ? filteredDataKeys : dataKeys;
            const avgEff = summaryKeys.length
                ? summaryKeys.reduce((sum, k) => sum + (Number(db[k]?.eff) || 0), 0) / summaryKeys.length
                : 0;

            const labelFor = k => isBaselineRecord(k)
                ? 'กระบวนการเดิม'
                : `ครั้งที่ ${getTrialLabel(k)} / Shift ${getRecordShift(k)}`;
            const summaryLatest = document.getElementById('table-summary-latest');
            const summaryLatestLabel = document.getElementById('table-summary-latest-label');
            const summaryBest = document.getElementById('table-summary-best');
            const summaryBestLabel = document.getElementById('table-summary-best-label');
            const summaryEff = document.getElementById('table-summary-eff');
            const summaryTarget = document.getElementById('table-summary-target');
            if (summaryLatest && latestKey) summaryLatest.textContent = `${(Number(db[latestKey]?.prod) || 0).toFixed(1)} ไม้/คน/ชม.`;
            if (summaryLatestLabel && latestKey) summaryLatestLabel.textContent = labelFor(latestKey);
            if (summaryBest && bestKey) summaryBest.textContent = `${(Number(db[bestKey]?.prod) || 0).toFixed(1)} ไม้/คน/ชม.`;
            if (summaryBestLabel && bestKey) summaryBestLabel.textContent = `${labelFor(bestKey)} (Best)`;
            if (summaryEff) summaryEff.textContent = `${avgEff.toFixed(2)}%`;
            if (summaryTarget) summaryTarget.textContent = `${targetProductivity.toFixed(0)}`;

            if (!tableSelectedKey || !keys.includes(tableSelectedKey)) tableSelectedKey = latestKey;
            const roundSelect = document.getElementById('tableRoundSelect');
            if (roundSelect) {
                roundSelect.innerHTML = keys.map(k => `<option value="${k}" ${k === tableSelectedKey ? 'selected' : ''}>${labelFor(k)}</option>`).join('');
            }
            const shiftSelect = document.getElementById('tableShiftSelect');
            if (shiftSelect) {
                shiftSelect.innerHTML = '<option value="ALL">All Shifts</option><option value="A">Shift A</option><option value="B">Shift B</option>';
                shiftSelect.value = tableShiftFilter;
            }

            const d = db[tableSelectedKey] || db[latestKey];
            const selectedKey = d ? (db[tableSelectedKey] ? tableSelectedKey : latestKey) : null;
            if (!d || !selectedKey) {
                tableBody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-[#a1a5b7]">ยังไม่มีข้อมูล</td></tr>';
                return;
            }
            const cycle = d.cycle_detail || { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 };
            const layout = d.layout || { prep: 0, block: 0, inspec: 0, pack: 0, op: 0 };
            const totalCt = ['prep', 'arrange', 'machine', 'inspec', 'pack'].reduce((sum, key) => sum + (Number(cycle[key]) || 0), 0);
            const cycleText = `RM ${formatVal(Number(cycle.prep) || 0)} · เรียง ${formatVal(Number(cycle.arrange) || 0)} · เข้าเครื่อง ${formatVal(Number(cycle.machine) || 0)} · เช็ค ${formatVal(Number(cycle.inspec) || 0)} · Pack ${formatVal(Number(cycle.pack) || 0)}`;
            const manpowerText = `เตรียม ${layout.prep || 0} · เรียง ${layout.block || 0} · Inspec ${layout.inspec || 0} · แพ็ค ${layout.pack || 0} · Operate ${layout.op || 0}`;
            tableBody.innerHTML = `
                <tr class="bg-[#1e1e2d]">
                    <td class="p-4 font-bold text-white">${labelFor(selectedKey)}${selectedKey === bestKey ? ' ⭐' : ''}</td>
                    <td class="p-4 font-bold text-[#50cd89]">${(Number(d.prod) || 0).toFixed(1)}</td>
                    <td class="p-4 text-[#a1a5b7]">${(Number(d.eff) || 0).toFixed(2)}%</td>
                    <td class="p-4 text-[#8b5cf6] text-xs">${cycleText}</td>
                    <td class="p-4 font-bold text-white">${formatVal(totalCt)} วิ</td>
                    <td class="p-4 font-bold text-[#009ef7]">${d.man || 0} คน</td>
                    <td class="p-4 text-[#a1a5b7] text-xs">${manpowerText}</td>
                </tr>`;
        }

        function renderLegacyTable() {
            const tableBody = document.getElementById('tableBody');
            let html = '';
            getVisibleKeys().forEach(k => {
                const d = db[k];
                if (!d) return;
                let titleText = isBaselineRecord(k)
                    ? 'กระบวนการเดิม'
                    : `ครั้งที่ ${getTrialLabel(k)} / Shift ${getRecordShift(k)}`;
                if (k === bestTrialKey) titleText += ' ⭐ (Best)';
                const cycle = d.cycle_detail || { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 };
                const layout = d.layout || { prep: 0, block: 0, inspec: 0, pack: 0, op: 0 };
                const m_prep = Number(cycle.prep) || 0;
                const m_arrange = Number(cycle.arrange) || 0;
                const m_machine = Number(cycle.machine) || 0;
                const m_inspec = Number(cycle.inspec) || 0;
                const m_pack = Number(cycle.pack) || 0;
                const total_ct = m_prep + m_arrange + m_machine + m_inspec + m_pack;
                const totalOutput = Number(d.total) || 0;
                html += `
                    <tr id="row-${k}" class="hover:bg-[#2b2b40] transition duration-150 cursor-pointer text-center" onclick="selectIteration('${k}')">
                        <td class="p-3 font-medium text-white sticky left-0 bg-[#1e1e2d] border-r border-[#323248] text-left">${titleText}</td>
                        <td class="p-3 text-[#50cd89] font-bold">${(Number(d.prod) || 0).toFixed(1)}</td>
                        <td class="p-3">${(Number(d.eff) || 0).toFixed(2)}%</td>
                        <td class="p-3 border-l border-[#323248] text-[#009ef7] bg-[rgba(139,92,246,0.05)]">${formatVal(m_prep)}</td>
                        <td class="p-3 bg-[rgba(139,92,246,0.05)] text-[#8b5cf6] font-bold text-[15px]">${formatVal(m_arrange)}</td>
                        <td class="p-3 bg-[rgba(139,92,246,0.05)] text-[#ffc700]">${formatVal(m_machine)}</td>
                        <td class="p-3 bg-[rgba(139,92,246,0.05)] text-[#f1416c]">${formatVal(m_inspec)}</td>
                        <td class="p-3 bg-[rgba(139,92,246,0.05)] text-[#50cd89]">${formatVal(m_pack)}</td>
                        <td class="p-3 bg-[#2b2b40] font-bold text-white border-l border-[#323248]">${formatVal(total_ct)}</td>
                        <td class="p-3 bg-[#2b2b40] font-bold text-[#009ef7]">${totalOutput.toLocaleString()}</td>
                        <td class="p-3 border-l border-[#323248] text-[#009ef7] font-bold bg-[rgba(0,158,247,0.05)]">${d.man || 0}</td>
                        <td class="p-3 bg-[rgba(0,158,247,0.05)] text-[#a1a5b7]">${layout.prep || 0}</td>
                        <td class="p-3 bg-[rgba(0,158,247,0.05)] text-[#a1a5b7]">${layout.block || 0}</td>
                        <td class="p-3 bg-[rgba(0,158,247,0.05)] text-[#a1a5b7]">${layout.inspec || 0}</td>
                        <td class="p-3 bg-[rgba(0,158,247,0.05)] text-[#a1a5b7]">${layout.pack || 0}</td>
                        <td class="p-3 bg-[rgba(0,158,247,0.05)] text-[#a1a5b7]">${layout.op || 0}</td>
                    </tr>`;
            });
            tableBody.innerHTML = html;
        }

        function setTableShift(shift) {
            tableShiftFilter = String(shift || 'all').toUpperCase();
            renderTable();
        }

        function selectTableRecord(key) {
            tableSelectedKey = key;
            renderTable();
            selectIteration(key);
        }

        function calculateExecutiveSummary(baselineKey, selectedKey) {
            const baseline = db[baselineKey];
            const selected = db[selectedKey] || baseline;

            if(!baseline || !selected) return;

            const baseLabel = isBaselineRecord(baselineKey)
                ? "Original Process"
                : "Trial " + getTrialLabel(baselineKey) + " / Shift " + getRecordShift(baselineKey);
            const selectedLabel = isBaselineRecord(selectedKey)
                ? "Selected Process"
                : "Trial " + getTrialLabel(selectedKey) + " / Shift " + getRecordShift(selectedKey);
            document.getElementById("lbl-summary-prod").innerText = baseLabel + " vs " + selectedLabel + " (Productivity)";
            document.getElementById("lbl-summary-eff").innerText = baseLabel + " vs " + selectedLabel + " (Efficiency)";
            document.getElementById("lbl-summary-arrange").innerText = baseLabel + " vs " + selectedLabel + " (Cycle Time)";
            document.getElementById("lbl-summary-total").innerText = baseLabel + " vs " + selectedLabel + " (Total Output)";

            const badgeIds = ["growth-prod", "growth-eff", "growth-arrange", "growth-total"];
            badgeIds.forEach(id => {
                const badge = document.getElementById(id);
                if (badge && badge.previousElementSibling) {
                    badge.previousElementSibling.innerText = "Gap %";
                }
            });

            const baseCycle = baseline.cycle_detail || { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 };
            const selectedCycle = selected.cycle_detail || { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 };
            const baseTotalCT = (Number(baseCycle.prep)||0) + (Number(baseCycle.arrange)||0) + (Number(baseCycle.machine)||0) + (Number(baseCycle.inspec)||0) + (Number(baseCycle.pack)||0);
            const selectedTotalCT = (Number(selectedCycle.prep)||0) + (Number(selectedCycle.arrange)||0) + (Number(selectedCycle.machine)||0) + (Number(selectedCycle.inspec)||0) + (Number(selectedCycle.pack)||0);

            document.getElementById("val-t1-prod").innerText = Number(baseline.prod || 0).toFixed(1);
            document.getElementById("val-best-prod").innerText = Number(selected.prod || 0).toFixed(1);
            applySummaryBadge("growth-prod", getCompareGapPercent(baseline.prod, selected.prod));

            document.getElementById("val-t1-eff").innerText = Number(baseline.eff || 0).toFixed(2);
            document.getElementById("val-best-eff").innerText = Number(selected.eff || 0).toFixed(2);
            applySummaryBadge("growth-eff", getCompareGapPercent(baseline.eff, selected.eff));

            document.getElementById("val-t1-total-ct").innerText = Number(baseTotalCT || 0).toFixed(2);
            document.getElementById("val-best-total-ct").innerText = Number(selectedTotalCT || 0).toFixed(2);
            applySummaryBadge("growth-arrange", getCompareGapPercent(baseTotalCT, selectedTotalCT), true);

            document.getElementById("val-t1-total").innerText = Number(baseline.total || 0).toLocaleString();
            document.getElementById("val-best-total").innerText = Number(selected.total || 0).toLocaleString();
            applySummaryBadge("growth-total", getCompareGapPercent(baseline.total, selected.total));

            renderExecutiveGapTable(baselineKey, selectedKey);
        }
        function renderExecutiveGapTable(baselineKeyParam, selectedKeyParam) {
            const tableBody = document.getElementById('executiveGapTableBody');
            if(!tableBody) return;

            const visibleKeys = getVisibleKeys();
            if(!visibleKeys.length) return;

            const baselineKey = (baselineKeyParam && db[baselineKeyParam]) ? baselineKeyParam : visibleKeys[0];
            const selectedKey = (selectedKeyParam && db[selectedKeyParam])
                ? selectedKeyParam
                : (gapComparisonKey && db[gapComparisonKey]
                    ? gapComparisonKey
                    : (bestTrialKey && db[bestTrialKey] ? bestTrialKey : visibleKeys[visibleKeys.length - 1]));
            const baseline = db[baselineKey];
            const selected = db[selectedKey] || baseline;
            if(!baseline || !selected) return;

            const rowsData = [
                { name: 'G1', target: 71, note: 'เป้าหมายหลัก BB Skin' },
                { name: 'G2', target: 69, note: 'เกณฑ์เปรียบเทียบ BB Skin' },
                { name: 'G3', target: 65, note: 'เกณฑ์เปรียบเทียบ BB Skin' },
                { name: 'G4', target: 60, note: 'เกณฑ์เปรียบเทียบ BB Skin' }
            ];

            const baselineProd = Number(baseline.prod) || 0;
            const selectedProd = Number(selected.prod) || 0;
            const baselineLabel = isBaselineRecord(baselineKey)
                ? 'การทดลองรอบแรก'
                : `TRIAL ${getTrialLabel(baselineKey)} / SHIFT ${getRecordShift(baselineKey)}`;
            const selectedLabel = isBaselineRecord(selectedKey)
                ? 'ล่าสุด'
                : `TRIAL ${getTrialLabel(selectedKey)} / SHIFT ${getRecordShift(selectedKey)}`;

            document.getElementById('gap-header-t1').innerText = baselineLabel;
            document.getElementById('gap-dyn-header').innerText = selectedLabel;

            let html = '';
            rowsData.forEach(row => {
                const baselineGap = baselineProd - row.target;
                const baselineGapPct = row.target > 0 ? (baselineGap / row.target) * 100 : 0;
                const selectedGap = selectedProd - row.target;
                const selectedGapPct = row.target > 0 ? (selectedGap / row.target) * 100 : 0;
                const baselineGapColor = baselineGap >= 0 ? 'text-[#50cd89]' : 'text-[#f1416c]';
                const selectedGapColor = selectedGap >= 0 ? 'text-[#50cd89]' : 'text-[#f1416c]';
                const rowBgStyle = row.name === 'Target ใหม่' ? 'bg-[rgba(80,205,137,0.03)]' : 'hover:bg-[#2b2b40]';

                html += `<tr class="${rowBgStyle} transition duration-150">
                    <td class="p-3 text-white font-medium pl-4">${row.name}</td>
                    <td class="p-3 text-center font-en text-white font-bold">${row.target}</td>
                    <td class="p-3 text-center font-en font-bold text-[#009ef7] bg-[rgba(0,158,247,0.05)]">${baselineProd.toFixed(1)}</td>
                    <td class="p-3 text-center font-en font-bold ${baselineGapColor}">${baselineGap >= 0 ? '+' : ''}${baselineGap.toFixed(1)}</td>
                    <td class="p-3 text-center font-en font-bold ${baselineGapColor}">${baselineGapPct.toFixed(1)}%</td>
                    <td class="p-3 text-center font-en font-bold text-[#8b5cf6] bg-[rgba(139,92,246,0.05)]">${selectedProd.toFixed(1)}</td>
                    <td class="p-3 text-center font-en font-bold ${selectedGapColor}">${selectedGap >= 0 ? '+' : ''}${selectedGap.toFixed(1)}</td>
                    <td class="p-3 text-center font-en font-bold ${selectedGapColor}">${selectedGapPct.toFixed(1)}%</td>
                </tr>`;
            });

            tableBody.innerHTML = html;
        }
        function selectIteration(key) {
            const data = db[key];
            if(!data) return;
            const sameShift = keys.filter(k => getRecordShift(k) === getRecordShift(key));
            const first = db[sameShift[0]] || data;
            actualBaseline = { ...first.cycle_detail };
            tableSelectedKey = key;
            tableShiftFilter = getRecordShift(key);
            renderTable();
            document.getElementById('header-actual-yield').textContent = Number(first.total).toLocaleString();
            gapComparisonKey = key;
            syncGapComparisonSelect();
            calculateExecutiveSummary(sameShift[0] || key, key);
            initSummaryCharts(sameShift[0] || key, key);
            selectedDataIndex = viewKeys.indexOf(key);

            let titleText = isBaselineRecord(key)
                ? 'กระบวนการเดิม'
                : `ปรับปรุงกระบวนการครั้งที่ ${getTrialLabel(key)} / Shift ${getRecordShift(key)}`;
            let roundLabel = isBaselineRecord(key)
                ? '(เดิม)'
                : `(ครั้งที่ ${getTrialLabel(key)} / Shift ${getRecordShift(key)})`;

            document.getElementById('selectedIterText').innerText = titleText;
            
            let totalOutput = data.total || 0;
            let totalMan = data.man || 0;
            document.getElementById('header-current-yield').innerHTML = `${totalOutput.toLocaleString()} <span class="text-xs font-normal text-[#6b7280]">ไม้/ชม.</span>`;
            document.getElementById('header-current-man').innerHTML = `${totalMan} <span class="text-xs font-normal text-[#6b7280]">คน</span>`;
            document.getElementById('header-selected-round').innerText = roundLabel;
            document.getElementById('header-man-round').innerText = roundLabel;

            let cycle = data.cycle_detail || { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 };
            let layout = data.layout || { prep: 0, block: 0, inspec: 0, pack: 0, op: 0 };

            let m_prep = Number(cycle.prep) || 0;
            let m_arrange = Number(cycle.arrange) || 0;
            let m_machine = Number(cycle.machine) || 0;
            let m_inspec = Number(cycle.inspec) || 0;
            let m_pack = Number(cycle.pack) || 0;
            let total_ct = m_prep + m_arrange + m_machine + m_inspec + m_pack;

            const kpiProdEl = document.getElementById('kpi-prod');
            kpiProdEl.innerText = (data.prod || 0).toFixed(1);
            if (data.prod >= targetProductivity) {
                kpiProdEl.style.color = '#50cd89'; 
            } else {
                kpiProdEl.style.color = '#f1416c'; 
            }

            document.getElementById('kpi-eff').innerText = (data.eff || 0).toFixed(2) + '%';
            document.getElementById('kpi-cycle').innerHTML = `${formatVal(total_ct)} <span class="text-lg font-normal text-[#a1a5b7]">Sec</span>`;
            document.getElementById('kpi-total').innerText = totalOutput.toLocaleString();
            
            document.getElementById('kpi-man').innerText = totalMan;
            document.getElementById('man-prep').innerText = layout.prep;
            document.getElementById('man-block').innerText = layout.block;
            document.getElementById('man-inspec').innerText = layout.inspec;
            document.getElementById('man-pack').innerText = layout.pack;
            document.getElementById('man-op').innerText = layout.op;

            document.getElementById('ct-prep').innerHTML = `${formatVal(m_prep)}`;
            document.getElementById('ct-arrange').innerHTML = `${formatVal(m_arrange)}`;
            document.getElementById('ct-machine').innerHTML = `${formatVal(m_machine)}`;
            document.getElementById('ct-inspec').innerHTML = `${formatVal(m_inspec)}`;
            document.getElementById('ct-pack').innerHTML = `${formatVal(m_pack)}`;
            document.getElementById('ct-total').innerHTML = `${formatVal(total_ct)}`;
            document.getElementById('ct-yield').innerHTML = totalOutput.toLocaleString();

            updateGapAnalysis(key, data);
            renderInsight(key, data);
            if (trendChart) {
                const pRadii = new Array(chartLabels.length).fill(3);
                const pColors = new Array(chartLabels.length).fill('#1e1e2d');
                if (selectedDataIndex !== -1) {
                    pRadii[selectedDataIndex] = 8;
                    pColors[selectedDataIndex] = '#50cd89'; 
                }
                trendChart.data.datasets[0].pointRadius = pRadii;
                trendChart.data.datasets[0].pointBorderColor = pColors;
                trendChart.update();
            }

            if (cycleChart) {
                const bgArrange = new Array(chartLabels.length).fill('rgba(139, 92, 246, 0.3)');
                const bgMachine = new Array(chartLabels.length).fill('rgba(255, 199, 0, 0.3)');
                const bgInspec = new Array(chartLabels.length).fill('rgba(241, 65, 108, 0.3)');
                const bgPack = new Array(chartLabels.length).fill('rgba(80, 205, 137, 0.3)');

                const pRadiiLine = new Array(chartLabels.length).fill(3);
                const pColorsLine = new Array(chartLabels.length).fill('#1e1e2d');
                const pBorderColorsLine = new Array(chartLabels.length).fill('#009ef7');

                if (selectedDataIndex !== -1) {
                    bgArrange[selectedDataIndex] = '#8b5cf6'; 
                    bgMachine[selectedDataIndex] = '#ffc700'; 
                    bgInspec[selectedDataIndex] = '#f1416c';    
                    bgPack[selectedDataIndex] = '#50cd89';      
                    
                    pRadiiLine[selectedDataIndex] = 8;
                    pColorsLine[selectedDataIndex] = '#009ef7';
                    pBorderColorsLine[selectedDataIndex] = '#fff';
                }

                cycleChart.data.datasets[0].pointRadius = pRadiiLine;
                cycleChart.data.datasets[0].pointBackgroundColor = pColorsLine;
                cycleChart.data.datasets[0].pointBorderColor = pBorderColorsLine;
                
                cycleChart.data.datasets[1].backgroundColor = bgArrange;
                cycleChart.data.datasets[2].backgroundColor = bgMachine;
                cycleChart.data.datasets[3].backgroundColor = bgInspec;
                cycleChart.data.datasets[4].backgroundColor = bgPack;
                cycleChart.update();
            }

            highlightTableRow(key);
            if (isOpen) toggleDropdown();
        }

        // ==========================================
        // 7. การตั้งค่าและสร้างกราฟหลัก
        // ==========================================
        const gapLabelPlugin = {
            id: 'gapLabelPlugin',
            afterDatasetsDraw(chart, args, plugins) {
                const lineCtx = chart.ctx;
                const targetLineY = chart.scales.y.getPixelForValue(targetProductivity);
                lineCtx.save();
                lineCtx.beginPath();
                lineCtx.moveTo(chart.chartArea.left, targetLineY);
                lineCtx.lineTo(chart.chartArea.right, targetLineY);
                lineCtx.strokeStyle = '#f1416c';
                lineCtx.setLineDash([5, 5]);
                lineCtx.stroke();
                lineCtx.restore();
                if (selectedDataIndex === -1) return;
                const ctx = chart.ctx;
                const meta = chart.getDatasetMeta(0);
                const point = meta.data[selectedDataIndex];
                if (!point) return;

                const value = chart.data.datasets[0].data[selectedDataIndex] || 0;
                const diff = Math.abs(targetProductivity - value).toFixed(1); 
                const x = point.x;
                const y = point.y;
                const targetY = chart.scales.y.getPixelForValue(targetProductivity);

                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.moveTo(x, y);ctx.lineTo(x, targetY);
                ctx.lineWidth = 1.5; ctx.strokeStyle = '#f1416c'; ctx.stroke();

                ctx.font = 'bold 12px Inter, Sarabun';
                const text = `Gap ${diff}`;
                const textWidth = ctx.measureText(text).width;
                const textX = x; const textY = (y + targetY) / 2;

                ctx.fillStyle = '#1e1e2d'; ctx.fillRect(textX - textWidth / 2 - 8, textY - 12, textWidth + 16, 24);
                ctx.strokeStyle = '#323248'; ctx.setLineDash([]); ctx.lineWidth = 1;
                ctx.strokeRect(textX - textWidth / 2 - 8, textY - 12, textWidth + 16, 24);

                ctx.fillStyle = '#f1416c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(text, textX, textY);

                const currentKey = viewKeys[selectedDataIndex];
                const effValue = db[currentKey] ? db[currentKey].eff : 0;
                const effText = `Eff: ${effValue.toFixed(2)}%`;
                ctx.font = 'bold 11px Inter, Sarabun';
                const effWidth = ctx.measureText(effText).width; const effY = y + 20;

                ctx.fillStyle = '#1e1e2d'; ctx.fillRect(x - effWidth / 2 - 6, effY - 10, effWidth + 12, 20);
                ctx.strokeStyle = '#50cd89'; ctx.strokeRect(x - effWidth / 2 - 6, effY - 10, effWidth + 12, 20);
                ctx.fillStyle = '#50cd89'; ctx.fillText(effText, x, effY);
                ctx.restore();
            }
        };

        function initCharts() {
            const trendCtx = document.getElementById('trendChart').getContext('2d');
            if (trendChart) trendChart.destroy();
            trendChart = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [
                        {
                            label: 'Productivity', data: chartData,
                            borderColor: '#009ef7', backgroundColor: 'rgba(0, 158, 247, 0.1)', borderWidth: 2,
                            pointBackgroundColor: '#1e1e2d', pointBorderColor: '#009ef7', pointBorderWidth: 2, pointRadius: 3,
                            fill: true, tension: 0.2
                        },
                        {
                            // 🌟 แก้ไขจุดที่ 2: ปรับเส้นประเป้าหมายสีแดง (Target Line) ของกราฟหลักเป็น 130
                            label: 'เป้าหมาย', data: Array(chartLabels.length).fill(targetProductivity),
                            borderColor: '#f1416c', borderDash: [5, 5], borderWidth: 2, pointRadius: 0, fill: false
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { 
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed.y !== null) label += context.parsed.y;
                                    if (context.datasetIndex === 0) {
                                        const dataKey = viewKeys[context.dataIndex];
                                        const eff = db[dataKey] ? db[dataKey].eff : 0;
                                        return [label, `Efficiency: ${eff.toFixed(2)}%`];
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    // 🌟 แก้ไขจุดที่ 3: ขยายสเกลค่าสูงสุดของแกน Y (Max Value) จากเดิม 120 ไปให้สอดคล้องกับเส้นเป้าหมาย 130
                    scales: { y: { beginAtZero: true, suggestedMax: 80, grid: { color: '#2b2b40' } }, x: { offset: true, grid: { display: false } } }
                },
                plugins: [gapLabelPlugin]
            });

            const cycleChartCtx = document.getElementById('cycleChart').getContext('2d');
            if (cycleChart) cycleChart.destroy();
            cycleChart = new Chart(cycleChartCtx, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [
                        {
                            label: 'เวลารวมทั้งหมด',
                            data: viewKeys.map(k => {
                                const cycle = db[k] ? db[k].cycle_detail : null;
                                return cycle ? (Number(cycle.prep)||0)+(Number(cycle.arrange)||0)+(Number(cycle.machine)||0)+(Number(cycle.inspec)||0)+(Number(cycle.pack)||0) : 0;
                            }),
                            type: 'line', borderColor: '#009ef7', backgroundColor: '#009ef7', borderWidth: 2,
                            pointRadius: new Array(chartLabels.length).fill(3), pointBackgroundColor: '#1e1e2d',
                            pointBorderColor: new Array(chartLabels.length).fill('#009ef7'), pointBorderWidth: 2,
                            yAxisID: 'y', tension: 0.2, fill: false
                        },
                        {
                            label: '2. เรียงเนื้อ',
                            data: viewKeys.map(k => db[k] && db[k].cycle_detail ? Number(db[k].cycle_detail.arrange) || 0 : 0),
                            backgroundColor: new Array(chartLabels.length).fill('rgba(139, 92, 246, 0.3)'),
                            stack: 'Stack 0', yAxisID: 'y', borderRadius: 4
                        },
                        {
                            label: '3. เข้าเครื่อง',
                            data: viewKeys.map(k => db[k] && db[k].cycle_detail ? Number(db[k].cycle_detail.machine) || 0 : 0),
                            backgroundColor: new Array(chartLabels.length).fill('rgba(255, 199, 0, 0.3)'),
                            stack: 'Stack 0', yAxisID: 'y', borderRadius: 4
                        },
                        {
                            label: '4. เช็คสเปค',
                            data: viewKeys.map(k => db[k] && db[k].cycle_detail ? Number(db[k].cycle_detail.inspec) || 0 : 0),
                            backgroundColor: new Array(chartLabels.length).fill('rgba(241, 65, 108, 0.3)'),
                            stack: 'Stack 0', yAxisID: 'y', borderRadius: 4
                        },
                        {
                            label: '5. PACKING',
                            data: viewKeys.map(k => db[k] && db[k].cycle_detail ? Number(db[k].cycle_detail.pack) || 0 : 0),
                            backgroundColor: new Array(chartLabels.length).fill('rgba(80, 205, 137, 0.3)'),
                            stack: 'Stack 0', yAxisID: 'y', borderRadius: 4
                        },
                        {
                            label: '1. เตรียม RM',
                            data: viewKeys.map(k => Number(db[k]?.cycle_detail?.prep) || 0),
                            backgroundColor: 'rgba(0, 158, 247, 0.3)',
                            stack: 'Stack 0', yAxisID: 'y', borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        x: { stacked: true, grid: { display: false } },
                        y: {
                            stacked: true, type: 'linear', display: true, position: 'left',
                            title: { display: true, text: 'เวลา (Sec)', color: '#a1a5b7', font: { size: 10 } },
                            grid: { color: '#2b2b40' }
                        }
                    },
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }
                }
            });
        }

        function initSummaryCharts(baselineKey, selectedKey) {
            const baseline = db[baselineKey] || { prod: 0, eff: 0, total: 0, cycle_detail: { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 } };
            const selected = db[selectedKey] || baseline;
            const baseCycle = baseline.cycle_detail || { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 };
            const selectedCycle = selected.cycle_detail || { prep: 0, arrange: 0, machine: 0, inspec: 0, pack: 0 };
            const baseTotalCT = (Number(baseCycle.prep)||0) + (Number(baseCycle.arrange)||0) + (Number(baseCycle.machine)||0) + (Number(baseCycle.inspec)||0) + (Number(baseCycle.pack)||0);
            const selectedTotalCT = (Number(selectedCycle.prep)||0) + (Number(selectedCycle.arrange)||0) + (Number(selectedCycle.machine)||0) + (Number(selectedCycle.inspec)||0) + (Number(selectedCycle.pack)||0);

            const baseLabel = isBaselineRecord(baselineKey)
                ? "Original Process"
                : "Trial " + getTrialLabel(baselineKey) + " / Shift " + getRecordShift(baselineKey);
            const selectedLabel = isBaselineRecord(selectedKey)
                ? "Selected Process"
                : "Trial " + getTrialLabel(selectedKey) + " / Shift " + getRecordShift(selectedKey);
            const compareLabel = baseLabel + " vs " + selectedLabel;

            const compareCanvas = document.getElementById("bottleneckChart");
            const rightTitle = compareCanvas ? compareCanvas.closest(".bg-card") : null;
            if (rightTitle) {
                const titleEl = rightTitle.querySelector("h3");
                const subtitleEl = rightTitle.querySelector("span.text-xs");
                if (titleEl) titleEl.innerText = "Comparison Gap Overview (Baseline vs Selected)";
                if (subtitleEl) subtitleEl.innerText = "Gap Analysis: %Gap (Positive = Better, Negative = Worse)";
            }

            const prodJourneyChartCtx = document.getElementById("prodJourneyChart").getContext("2d");
            if (prodJourneyChart) prodJourneyChart.destroy();
            prodJourneyChart = new Chart(prodJourneyChartCtx, {
                type: "bar",
                data: {
                    labels: [baseLabel + " (Baseline)", selectedLabel + " (Selected)", "Target (Target)"],
                    datasets: [
                        {
                            label: "Productivity (sticks/person/hour)",
                            data: [baseline.prod, selected.prod, targetProductivity],
                            backgroundColor: ["#323248", "#009ef7", "#50cd89"],
                            borderRadius: 4, barPercentage: 0.5, yAxisID: "y"
                        },
                        {
                            label: "Efficiency (%)",
                            data: [baseline.eff, selected.eff, 100.0],
                            type: "line", borderColor: "#50cd89", borderWidth: 3,
                            pointBackgroundColor: "#1e1e2d", pointBorderColor: "#50cd89", pointBorderWidth: 2, pointRadius: 5, yAxisID: "y1"
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } },
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, suggestedMax: 80, title: { display: true, text: "Productivity", color: "#a1a5b7", font: { size: 10 } }, grid: { color: "#2b2b40" } },
                        y1: { beginAtZero: true, suggestedMax: 100, position: "right", grid: { display: false }, title: { display: true, text: "Efficiency (%)", color: "#a1a5b7", font: { size: 10 } } }
                    }
                },
                plugins: [{
                    id: "targetLineSummary",
                    afterDraw: chart => {
                        const ctx = chart.ctx;
                        const yG2 = chart.scales.y.getPixelForValue(69);
                        const yG1 = chart.scales.y.getPixelForValue(targetProductivity);
                        const xAxis = chart.scales.x;
                        ctx.save();
                        ctx.beginPath(); ctx.moveTo(xAxis.left, yG2); ctx.lineTo(xAxis.right, yG2);
                        ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(241, 65, 108, 0.6)"; ctx.setLineDash([5, 5]); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(xAxis.left, yG1); ctx.lineTo(xAxis.right, yG1);
                        ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(241, 65, 108, 1)"; ctx.setLineDash([]); ctx.stroke();
                        ctx.restore();
                    }
                }]
            });

            const comparisonMetrics = [
                { label: "Productivity", value: getCompareGapPercent(baseline.prod, selected.prod), color: "#009ef7" },
                { label: "Efficiency", value: getCompareGapPercent(baseline.eff, selected.eff), color: "#50cd89" },
                { label: "Cycle Time Reduction", value: getCompareGapPercent(baseTotalCT, selectedTotalCT, true), color: "#8b5cf6" },
                { label: "Total Output", value: getCompareGapPercent(baseline.total, selected.total), color: "#f1416c" }
            ];

            const comparisonChartCtx = document.getElementById("bottleneckChart").getContext("2d");
            if (bottleneckChart) bottleneckChart.destroy();
            bottleneckChart = new Chart(comparisonChartCtx, {
                type: "bar",
                data: {
                    labels: comparisonMetrics.map(item => item.label),
                    datasets: [{
                        label: "Gap % vs Baseline",
                        data: comparisonMetrics.map(item => item.value),
                        backgroundColor: comparisonMetrics.map(item => item.value >= 0 ? item.color : "#f1416c"),
                        borderRadius: 8,
                        barPercentage: 0.55,
                        categoryPercentage: 0.7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: "y",
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => " " + compareLabel + ": " + formatSignedPercent(ctx.raw)
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            grid: { color: "#2b2b40" },
                            ticks: { color: "#a1a5b7", callback: value => value + "%" },
                            title: { display: true, text: "%Gap (Positive = Better)", color: "#a1a5b7", font: { size: 10 } }
                        },
                        y: {
                            grid: { display: false },
                            ticks: { color: "#a1a5b7" }
                        }
                    }
                },
                plugins: [{
                    id: "comparisonGapZeroLine",
                    afterDraw: chart => {
                        const { ctx, chartArea, scales } = chart;
                        if (!chartArea) return;
                        const zeroX = scales.x.getPixelForValue(0);
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(zeroX, chartArea.top);
                        ctx.lineTo(zeroX, chartArea.bottom);
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = "rgba(161,165,183,0.45)";
                        ctx.setLineDash([4, 4]);
                        ctx.stroke();
                        ctx.restore();
                    }
                }]
            });
        }
