// Neck Skin 40G R15 — blank dashboard template
// Data intentionally starts empty. Connect Shift A/B feeds here when ready.
(() => {
    const EMPTY_MESSAGE = 'ยังไม่มีข้อมูล NECK SKIN 40G R15';
    let isOpen = false;
    let activeShift = 'all';
    const charts = [];

    const byId = (id) => document.getElementById(id);
    const emptyRow = (message, columns = 20) =>
        `<tr><td colspan="${columns}" class="p-8 text-center text-[#7e8299]">${message}</td></tr>`;

    function shiftLabel(value) {
        if (value === 'A' || value === 'B') return `Shift ${value}`;
        return 'Shift A และ Shift B';
    }

    function setEmptyTables(message) {
        const tables = [
            ['tableBody', 20],
            ['gapTableBody', 5],
            ['tableBodyCompact', 7],
            ['executiveGapTableBody', 8]
        ];
        tables.forEach(([id, columns]) => {
            const body = byId(id);
            if (body) body.innerHTML = emptyRow(message, columns);
        });
    }

    function setEmptySelect(id) {
        const select = byId(id);
        if (!select) return;
        select.innerHTML = '<option value="">ไม่มีข้อมูล</option>';
        select.disabled = true;
    }

    function chartOptions(yTitle) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: { grid: { color: 'rgba(50,50,72,.55)' }, ticks: { color: '#7e8299' } },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(50,50,72,.55)' },
                    ticks: { color: '#7e8299' },
                    title: { display: Boolean(yTitle), text: yTitle, color: '#a1a5b7' }
                }
            }
        };
    }

    function createBlankChart(id, type, yTitle) {
        const canvas = byId(id);
        if (!canvas || !window.Chart) return;
        charts.push(new Chart(canvas, {
            type,
            data: { labels: [], datasets: [] },
            options: chartOptions(yTitle)
        }));
    }

    function initializeBlankDashboard() {
        if (window.Chart) {
            Chart.defaults.color = '#a1a5b7';
            Chart.defaults.borderColor = '#323248';
            Chart.defaults.font.family = "'Sarabun', sans-serif";
            createBlankChart('trendChart', 'line', 'ไม้/คน/ชั่วโมง');
            createBlankChart('cycleChart', 'line', 'วินาที/ไม้');
            createBlankChart('prodJourneyChart', 'bar', 'Productivity / Efficiency');
            createBlankChart('bottleneckChart', 'bar', 'วินาที/ไม้');
        }

        setEmptyTables(`${EMPTY_MESSAGE} — ${shiftLabel(activeShift)}`);
        ['gapComparisonSelect', 'tableRoundSelect', 'tableShiftSelect'].forEach(setEmptySelect);

        const dropdownList = byId('dropdownList');
        if (dropdownList) {
            dropdownList.innerHTML = [
                '<div class="col-span-2 p-4 text-center text-sm text-[#7e8299]">',
                'ยังไม่มีรอบการปรับปรุงสำหรับ Shift A และ Shift B',
                '</div>'
            ].join('');
        }

        const insightOverall = byId('insight-overall');
        if (insightOverall) insightOverall.textContent = 'ส่วนวิเคราะห์จะพร้อมใช้งานเมื่อมีการเชื่อมต่อข้อมูลรอบการผลิต';
        const insightSteps = byId('insight-steps');
        if (insightSteps) insightSteps.innerHTML = '<p class="text-sm text-[#7e8299] text-center py-4">ยังไม่มีข้อมูลสำหรับวิเคราะห์</p>';
        const status = byId('dataStatus');
        if (status) status.textContent = 'หน้าเปล่าพร้อมเชื่อมข้อมูล NECK SKIN 40G R15 สำหรับ Shift A และ Shift B';
    }

    window.toggleDropdown = function toggleDropdown() {
        const popup = byId('iterDropdown');
        const icon = byId('dropdownIcon');
        if (!popup || !icon) return;
        isOpen = !isOpen;
        popup.classList.toggle('open', isOpen);
        icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    };

    window.setShiftFilter = function setShiftFilter(value) {
        activeShift = ['A', 'B'].includes(value) ? value : 'all';
        const message = `${EMPTY_MESSAGE} — ${shiftLabel(activeShift)}`;
        setEmptyTables(message);
        const selected = byId('selectedIterText');
        if (selected) selected.textContent = shiftLabel(activeShift);
    };

    window.setGapComparison = () => {};
    window.setTableShift = () => {};
    window.selectTableRecord = () => {};

    document.addEventListener('click', (event) => {
        const popup = byId('iterDropdown');
        const button = byId('iterPickerBtn');
        if (isOpen && popup && button && !popup.contains(event.target) && !button.contains(event.target)) {
            window.toggleDropdown();
        }
    });

    window.addEventListener('load', initializeBlankDashboard);
})();
