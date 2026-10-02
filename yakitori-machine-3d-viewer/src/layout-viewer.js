// MachineLayout_DataLog is the only source of operational layout values.
// The vendor runtime and model components retain the original 3D implementation.
const Rx = { running: 'Running', idle: 'Idle / ไม่ใช้งาน', maintenance: 'Maintenance', fault: 'Fault', unknown: 'ไม่พบข้อมูล' };
function zx(machine) { return machine.status || 'unknown'; }
const LAYOUT_CACHE = 'yakitori-layout-confirmed-v1';
const IDS = ['YK-101', 'YK-102', 'YK-103', 'YK-104'];
const layoutFields = ['machine_name', 'conveyor_name', 'product_name', 'installed_at', 'machine_status', 'last_breakdown_at', 'breakdown_detail', 'updated_at'];
function validateRecords(records) {
  if (!Array.isArray(records)) throw new Error('รูปแบบข้อมูล Layout ไม่ถูกต้อง');
  const seen = new Set();
  return records.filter(record => IDS.includes(record?.machine_id)).map(record => {
    if (seen.has(record.machine_id)) throw new Error('พบ machine_id ซ้ำใน Sheet');
    seen.add(record.machine_id);
    if (layoutFields.some(field => typeof record[field] !== 'string')) throw new Error('ข้อมูล Layout ไม่ครบหรือชนิดข้อมูลไม่ถูกต้อง');
    if (!record.machine_name.trim() || !yx(record.machine_status)) throw new Error('ชื่อหรือสถานะเครื่องใน Sheet ไม่ถูกต้อง');
    return { machine_id: record.machine_id, ...Object.fromEntries(layoutFields.map(field => [field, record[field]])) };
  });
}
function readConfirmedCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(LAYOUT_CACHE));
    if (cached?.version !== 1 || !Number.isFinite(Date.parse(cached.readAt))) return null;
    return { records: validateRecords(cached.records), readAt: cached.readAt };
  } catch { return null; }
}
async function readLayout() {
  const url = window.YakitoriRuntime.buildApiUrl('MachineLayout_DataLog', { action: 'read_machine_layout', ts: Date.now() });
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (result.status !== 'success') throw new Error(result.message || result.error || 'อ่าน Sheet ไม่สำเร็จ');
  return validateRecords(result.records);
}
function applyLayout(staticMachines, records) {
  const byId = new Map(records.map(record => [record.machine_id, record]));
  return staticMachines.map(machine => {
    if (!IDS.includes(machine.machine_id)) return machine;
    const record = byId.get(machine.machine_id);
    return { ...machine, machine_name: record?.machine_name || `Skewer Yakitori Machine ${IDS.indexOf(machine.machine_id) + 1}`,
      conveyor_name: record?.conveyor_name || '', product_name: record?.product_name || '',
      installed_at: displayBangkokDate(record?.installed_at), last_breakdown_at: displayBangkokDate(record?.last_breakdown_at),
      remark: record?.breakdown_detail || '', updated_at: displayBangkokDate(record?.updated_at),
      status: record?.machine_status || 'unknown', layoutAvailable: Boolean(record) };
  });
}
function displayBangkokDate(value) {
  if (!value) return '';
  // Unzoned legacy values already mean Bangkok wall time. ISO values posted by
  // Configuration carry an offset and must be converted before display.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return value;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? new Date(instant + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ') : value;
}
const Vx = Qy(set => ({ machines: [], selectedMachineId: null,
  setMachines: machines => set(state => ({ machines, selectedMachineId: IDS.includes(state.selectedMachineId) ? state.selectedMachineId : IDS[0] })),
  selectMachine: id => { if (IDS.includes(id)) set({ selectedMachineId: id }); }
}));
const element = (tag, props, ...children) => v.createElement(tag, props, ...children);
function Hx() {
  const machines = Vx(state => state.machines), selectedId = Vx(state => state.selectedMachineId);
  const setMachines = Vx(state => state.setMachines), selectMachine = Vx(state => state.selectMachine);
  const [showGrid, setGrid] = v.useState(true), [showAxes, setAxes] = v.useState(false);
  const [hovered, setHovered] = v.useState(null), [command, setCommand] = v.useState(null);
  const [feed, setFeed] = v.useState({ loading: true, stale: false, readAt: '', error: '' });
  const staticRef = v.useRef(null), busy = v.useRef(false), alive = v.useRef(true);
  const refresh = v.useCallback(async () => {
    if (busy.current || !staticRef.current) return;
    busy.current = true;
    setFeed(previous => ({ ...previous, loading: true }));
    try {
      const records = await readLayout(), readAt = new Date().toISOString();
      if (!alive.current) return;
      setMachines(applyLayout(staticRef.current, records));
      setFeed({ loading: false, stale: false, readAt, error: '', empty: records.length === 0 });
      try { localStorage.setItem(LAYOUT_CACHE, JSON.stringify({ version: 1, records, readAt })); } catch {}
    } catch (error) {
      if (alive.current) setFeed(previous => ({ ...previous, loading: false, stale: Boolean(previous.readAt), error: error.message }));
    } finally { busy.current = false; }
  }, [setMachines]);
  v.useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        const response = await fetch(vx('data/machines.json'));
        if (!response.ok) throw new Error('โหลด mapping โมเดลไม่สำเร็จ');
        const staticMachines = await response.json();
        if (!alive.current) return;
        staticRef.current = staticMachines;
        const cache = readConfirmedCache();
        setMachines(applyLayout(staticMachines, cache?.records || []));
        const queryId = new URLSearchParams(location.search).get('machine');
        if (IDS.includes(queryId)) selectMachine(queryId);
        if (cache) setFeed({ loading: false, stale: true, readAt: cache.readAt, error: '' });
        await refresh();
      } catch (error) { if (alive.current) setFeed(previous => ({ ...previous, loading: false, error: error.message })); }
    })();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh, setMachines, selectMachine]);
  const selected = machines.find(machine => machine.machine_id === selectedId) || null;
  const controls = element(Ux, { machines: Nx(machines), conveyorLabels: Cx, selectedMachine: selected, selectedMachineId: selectedId,
    showGrid, showAxes, onSelectMachine: selectMachine, onCommand: type => setCommand({ type, id: Date.now() }),
    onToggleGrid: () => setGrid(value => !value), onToggleAxes: () => setAxes(value => !value) });
  return element('main', { className: 'app-shell' },
    element('section', { className: 'viewer-panel' },
      element('header', { className: 'topbar' }, element('h1', null, 'Yakitori Machine 3D Viewer'),
        element('div', { className: 'layout-feed' },
          element('p', { id: 'layoutFeedStatus', role: 'status', 'aria-live': 'polite', 'data-stale': String(feed.stale), 'data-loading': String(feed.loading) },
            feed.error ? `${feed.stale ? 'ข้อมูลเก่า · ' : 'ยังอ่านข้อมูลไม่ได้ · '}${feed.error} · กดโหลดล่าสุดเพื่อลองอีกครั้ง` :
              feed.loading ? 'กำลังอ่าน Layout…' : feed.empty ? 'ไม่พบข้อมูล Layout ใน Sheet' : feed.stale ? 'ข้อมูลเก่า · กำลังตรวจข้อมูลล่าสุด' : 'Layout จาก Google Sheet'),
          element('p', { id: 'layoutReadAt' }, `อ่านล่าสุด: ${feed.readAt ? new Date(feed.readAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ยังไม่ยืนยัน'} · Asia/Bangkok`),
          element('button', { id: 'refreshLayout', type: 'button', className: 'secondary-button', disabled: feed.loading, onClick: refresh }, 'โหลดล่าสุด'))),
      element('div', { className: 'viewer-stage', 'data-selected-machine': selectedId }, controls,
        machines.length ? element($v, { camera: { position: [8, 5, 10], fov: 42 }, shadows: true, dpr: [1, 1.5], gl: { antialias: true, toneMappingExposure: .82 } },
          element('color', { attach: 'background', args: ['#171c2a'] }), element('fog', { attach: 'fog', args: ['#171c2a', 26, 46] }),
          element('hemisphereLight', { args: ['#e9f7ff', '#20283a', 1.15] }), element('ambientLight', { intensity: .58 }),
          element('directionalLight', { position: [8, 12, 6], intensity: 1.35 }), element('directionalLight', { position: [-6, 7, -3], intensity: .55, color: '#8bdcff' }),
          element(v.Suspense, { fallback: element(hy, { center: true }, 'กำลังโหลดโมเดล 3D…') },
            element(Gx, { machines, conveyorLabels: Cx, selectedMachineId: selectedId, hoveredMachineId: hovered, onSelectMachine: selectMachine, onHoverMachine: setHovered, showGrid, showAxes, viewerCommand: command }))) : element('div', { className: 'stage-message' }, 'กำลังโหลด mapping โมเดล…'))),
    element('aside', { className: 'sidebar' }, element(Wx, { machine: selected })));
}
function Wx({ machine }) {
  if (!machine) return element('section', { className: 'card' }, element('h2', null, 'ข้อมูลเครื่องจักร'));
  const fields = [['machine_name', 'ชื่อเครื่องจักร', machine.machine_name], ['conveyor_name', 'ชื่อสายพานประจำเครื่อง', machine.conveyor_name],
    ['product_name', 'สินค้า', machine.product_name], ['installed_at', 'ติดตั้งล่าสุด (Asia/Bangkok)', machine.installed_at],
    ['machine_status', 'สถานะ Layout', Rx[zx(machine)]], ['last_breakdown_at', 'สรุป Breakdown ล่าสุดจาก Layout', machine.last_breakdown_at],
    ['breakdown_detail', 'รายละเอียดสรุปเดิม', machine.remark], ['updated_at', 'อัปเดตจาก Sheet', machine.updated_at]];
  return element('section', { className: 'card machine-summary', 'data-machine-id': machine.machine_id, 'data-model-node': machine.model_node_name },
    element('h2', null, machine.machine_name), element('p', { className: 'machine-id' }, `${Ax(machine)} · ${machine.machine_id}`),
    !machine.layoutAvailable && element('p', { className: 'layout-missing', role: 'status' }, 'ไม่พบข้อมูลเครื่องนี้ใน Sheet · ไม่มีสถานะ Layout ที่ยืนยันแล้ว'),
    element('dl', { className: 'layout-details' }, ...fields.flatMap(([key, label, value]) => [element('dt', { key: key + '-label' }, label), element('dd', { key, 'data-layout-field': key }, value || '—')])),
    element('p', { className: 'layout-note' }, 'สรุป Breakdown ใน Layout เป็นข้อมูลเดิม เหตุขัดข้องจริงดูได้ในแผง Machine Breakdown และ Breakdown Records'),
    element('a', { className: 'primary-button configuration-link', href: `../MachineConfiguration.html?machine=${encodeURIComponent(machine.machine_id)}` }, 'แก้ไขใน Machine Configuration'));
}
