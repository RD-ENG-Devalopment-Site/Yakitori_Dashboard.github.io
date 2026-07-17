(function () {
    'use strict';

    const API_URL = 'https://script.google.com/macros/s/AKfycbzCP20irjQdA65MEQXeB4KW8kkvmYRMJYbL8Zm1IdklPpKvvmTIIFcx0Zs_pm3Nwyel/exec';
    const HISTORY_KEY = 'yakitori-breakdown-history';
    const MACHINES = ['M1', 'M2', 'M3', 'M4'];
    const REFRESH_INTERVAL_MS = 60 * 1000;

    function getMachineCode(record) {
        const station = String(record?.station || '').trim().toUpperCase();
        if (MACHINES.includes(station)) return station;

        const text = [record?.machineArea, record?.machine, record?.conveyorPosition]
            .filter(Boolean)
            .join(' ')
            .toUpperCase();
        const match = text.match(/\bM([1-4])\b/);
        return match ? `M${match[1]}` : '';
    }

    function getEventTime(record) {
        const created = Date.parse(record?.createdAt || record?.updatedAt || '');
        if (Number.isFinite(created)) return created;

        const local = Date.parse(`${record?.breakdownDate || ''}T${record?.startTime || '00:00'}`);
        return Number.isFinite(local) ? local : 0;
    }

    function formatEventTime(record) {
        const date = new Date(getEventTime(record));
        if (!Number.isFinite(date.getTime()) || date.getTime() === 0) return '-';
        return date.toLocaleString('th-TH', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });
    }

    function normalizeStatus(record) {
        const value = String(record?.breakdownStatus || record?.status || 'Open').trim().toLowerCase();
        if (value === 'closed') return 'closed';
        if (value === 'monitoring') return 'monitoring';
        return 'open';
    }

    function readLocalHistory() {
        try {
            const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (_) {
            return [];
        }
    }

    async function readBreakdowns() {
        const url = new URL(API_URL);
        url.searchParams.set('page', 'api');
        url.searchParams.set('sheet', 'MachineBreakdownLog');
        url.searchParams.set('action', 'read_breakdown');

        try {
            const response = await fetch(url.toString(), { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            const records = Array.isArray(payload?._records) ? payload._records : [];
            return { records, source: 'Google Sheet' };
        } catch (_) {
            return { records: readLocalHistory(), source: 'Browser preview' };
        }
    }

    function latestByMachine(records) {
        const result = Object.fromEntries(MACHINES.map(machine => [machine, null]));
        records.forEach(record => {
            const machine = getMachineCode(record);
            if (!machine) return;
            if (!result[machine] || getEventTime(record) > getEventTime(result[machine])) {
                result[machine] = record;
            }
        });
        return result;
    }

    function injectStyles() {
        if (document.getElementById('breakdown-sync-style')) return;
        const style = document.createElement('style');
        style.id = 'breakdown-sync-style';
        style.textContent = `
            .machine-marker.bd-open { background:#cf334f !important; border-color:#ff91a4 !important; box-shadow:0 0 0 3px rgba(241,65,108,.24),0 0 18px rgba(241,65,108,.82) !important; }
            .machine-marker.bd-monitoring { background:#b58000 !important; border-color:#ffe07a !important; box-shadow:0 0 0 3px rgba(255,199,0,.22),0 0 18px rgba(255,199,0,.7) !important; }
            .machine-marker.bd-closed { background:#177a59 !important; border-color:#7bf0be !important; }
            .breakdown-status-panel { position:absolute; left:18px; bottom:18px; z-index:7; width:min(330px,calc(100% - 36px)); padding:12px; border:1px solid rgba(150,177,210,.24); border-radius:12px; background:rgba(15,22,36,.9); backdrop-filter:blur(12px); color:#e9f3ff; font:12px/1.35 Inter,system-ui,sans-serif; }
            .breakdown-status-panel__head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:9px; color:#9fc3ff; }
            .breakdown-status-panel__head button { border:0; background:transparent; color:#a8c9ff; font:inherit; cursor:pointer; }
            .breakdown-status-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
            .breakdown-status-card { appearance:none; width:100%; padding:9px; border:1px solid #2c425c; border-radius:8px; background:#172337; color:inherit; text-align:left; cursor:pointer; }
            .breakdown-status-card:hover { border-color:#7baeff; }
            .breakdown-status-card strong { display:block; font-size:13px; }
            .breakdown-status-card span { display:block; margin-top:3px; color:#aec0d5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .breakdown-status-card em { display:inline-block; margin-top:5px; padding:2px 5px; border-radius:999px; background:#2b3c52; color:#bcd0e7; font-style:normal; font-size:10px; }
            .breakdown-status-card.status-open em { background:rgba(241,65,108,.2); color:#ff9eb2; }
            .breakdown-status-card.status-monitoring em { background:rgba(255,199,0,.18); color:#ffe17d; }
            .breakdown-status-card.status-closed em { background:rgba(80,205,137,.18); color:#8bf2bb; }
        `;
        document.head.appendChild(style);
    }

    function statusLabel(status) {
        return { open: 'Breakdown เปิดอยู่', monitoring: 'กำลังติดตาม', closed: 'ปิดงานแล้ว' }[status] || 'ปกติ';
    }

    function decorateMarkers(latest) {
        document.querySelectorAll('.machine-marker').forEach(marker => {
            const machine = String(marker.textContent || '').trim().toUpperCase();
            if (!MACHINES.includes(machine)) return;
            marker.classList.remove('bd-open', 'bd-monitoring', 'bd-closed');
            const record = latest[machine];
            if (!record) {
                marker.title = `${machine}: ไม่มีรายการ Breakdown`;
                return;
            }
            const status = normalizeStatus(record);
            marker.classList.add(`bd-${status}`);
            marker.title = `${machine}: ${statusLabel(status)} — ${record.rootCause || record.eventType || 'Breakdown'}`;
        });
    }

    function selectMachine(machine) {
        const buttons = Array.from(document.querySelectorAll('.machine-marker'));
        const marker = buttons.find(button => String(button.textContent || '').trim().toUpperCase() === machine);
        marker?.click();
    }

    function renderPanel(latest, source) {
        const stage = document.querySelector('.viewer-stage');
        if (!stage) return;
        let panel = document.getElementById('breakdown-status-panel');
        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'breakdown-status-panel';
            panel.className = 'breakdown-status-panel';
            stage.appendChild(panel);
        }

        panel.innerHTML = `
            <div class="breakdown-status-panel__head">
                <strong>สถานะ Machine Breakdown</strong>
                <button type="button" id="breakdown-refresh">รีเฟรช</button>
            </div>
            <div class="breakdown-status-grid">
                ${MACHINES.map(machine => {
                    const record = latest[machine];
                    const status = record ? normalizeStatus(record) : 'closed';
                    const description = record ? (record.rootCause || record.eventType || 'Breakdown') : 'ไม่มีรายการ';
                    return `<button type="button" class="breakdown-status-card status-${status}" data-breakdown-machine="${machine}"><strong>${machine}</strong><span>${description}</span><em>${record ? `${statusLabel(status)} · ${formatEventTime(record)}` : 'ปกติ'}</em></button>`;
                }).join('')}
            </div>
            <div style="margin-top:8px;color:#7589a3;font-size:10px">แหล่งข้อมูล: ${source} · อัปเดตอัตโนมัติทุก 1 นาที</div>
        `;
        panel.querySelector('#breakdown-refresh')?.addEventListener('click', refresh);
        panel.querySelectorAll('[data-breakdown-machine]').forEach(button => {
            button.addEventListener('click', () => selectMachine(button.dataset.breakdownMachine));
        });
    }

    async function refresh() {
        const { records, source } = await readBreakdowns();
        const latest = latestByMachine(records);
        renderPanel(latest, source);
        decorateMarkers(latest);
    }

    function start() {
        injectStyles();
        refresh();
        window.setInterval(refresh, REFRESH_INTERVAL_MS);
    }

    window.addEventListener('load', start, { once: true });
})();
