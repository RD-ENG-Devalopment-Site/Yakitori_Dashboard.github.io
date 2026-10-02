var mx = new Set([
    `Skewer Yakitori Machine.STEP-9`,
    `Skewer Yakitori Machine.STEP-1`,
    `Skewer Yakitori Machine.STEP-8`,
    `Skewer Yakitori Machine.STEP-7`,
  ]),
  hx = {
    "Skewer Yakitori Machine.STEP-8": 1,
    "Skewer Yakitori Machine.STEP-1": 2,
    "Skewer Yakitori Machine.STEP-9": 3,
    "Skewer Yakitori Machine.STEP-7": 4,
  },
  gx = {
    "Skewer Yakitori Machine.STEP-1": `Yaki Conveyor_Part 16.4m-2`,
    "Skewer Yakitori Machine.STEP-7": `Yaki Conveyor_Part 16.4m-2`,
    "Skewer Yakitori Machine.STEP-8": `Yaki Conveyor_Part 16.4m-1`,
    "Skewer Yakitori Machine.STEP-9": `Yaki Conveyor_Part 16.4m-3`,
  },
  _x = {
    "Skewer Yakitori Machine.STEP-1": `Skewer Machine Base-1`,
    "Skewer Yakitori Machine.STEP-7": `Skewer Machine Base-7`,
    "Skewer Yakitori Machine.STEP-8": `Skewer Machine Base-8`,
    "Skewer Yakitori Machine.STEP-9": `Skewer Machine Base-9`,
  };
function vx(e) {
  return `./${e.replace(/^\/+/, ``)}`;
}
function yx(e) {
  return [`running`, `idle`, `maintenance`, `fault`].includes(e);
}
function Sx(e) {
  return mx.has(e.model_node_name);
}
var Cx = [
    {
      nodeName: `Yaki Conveyor_Part 16.4m-2`,
      label: `สายพานที่ 3 (สายพานฝั่งห้องคอนโทรล)`,
    },
    {
      nodeName: `Yaki Conveyor_Part 16.4m-3`,
      label: `สายพานที่ 2 (สายพานกลาง)`,
    },
    {
      nodeName: `Yaki Conveyor_Part 16.4m-1`,
      label: `สายพานที่ 1 (ฝั่งห้อง Yakitori)`,
    },
  ],
  wx = [
    `สายพานที่ 1 (ฝั่งห้อง Yakitori)`,
    `สายพานที่ 2 (สายพานกลาง) เครื่องที่ 1`,
    `สายพานที่ 2 (สายพานกลาง) เครื่องที่ 2`,
    `สายพานที่ 3 (สายพานฝั่งห้องคอนโทรล)`,
  ];
function Tx(e) {
  return gx[e.model_node_name] ?? ``;
}
function Ex(e, t) {
  return e.find((e) => e.nodeName === t)?.label ?? `-`;
}
function Dx(e, t) {
  return e.conveyor_name || `—`;
}
function Ox(e) {
  return hx[e] ?? null;
}
function kx(e) {
  let t = Ox(e.model_node_name),
    n = e.machine_name.trim();
  return t && /^Skewer Yakitori Machine \d+$/i.test(n)
    ? `Skewer Yakitori Machine ${t}`
    : e.machine_name;
}
function Ax(e) {
  let t = Ox(e.model_node_name);
  return t
    ? `M${t}`
    : e.model_node_name.replace(`Skewer Yakitori Machine.STEP-`, `M`);
}
function jx(e) {
  return kx(e);
}
function Mx(e) {
  return kx(e);
}
function Nx(e) {
  return e
    .filter(Sx)
    .sort(
      (e, t) => (Ox(e.model_node_name) ?? 999) - (Ox(t.model_node_name) ?? 999),
    );
}
function Px(e) {
  // GLTFLoader sanitizes spaces and punctuation in node names. Match the
  // original static names to the loaded nodes without changing model mapping.
  return e.trim().replace(/[\s_.\[\]:/]+/g, ``).toLowerCase();
}
function Fx(e, t) {
  if (!t) return null;
  let n = e.getObjectByName(t);
  if (n) return n;
  let r = Px(t),
    i = null;
  return (
    e.traverse((e) => {
      if (i || !e.name) return;
      let t = Px(e.name);
      (t === r || t.startsWith(r) || r.startsWith(t)) && (i = e);
    }),
    i
  );
}

var Bx = {
    "Skewer Yakitori Machine.STEP-1": {
      center: [0.180097, 0.261553, -5.05844],
      size: [1.2, 1.1, 1.9],
      markerOffsetY: 0.72,
    },
    "Skewer Yakitori Machine.STEP-7": {
      center: [0.180097, 0.251503, 1.62206],
      size: [1.2, 1.1, 1.9],
      markerOffsetY: 0.72,
    },
    "Skewer Yakitori Machine.STEP-8": {
      center: [2.6301, 0.261553, -5.05844],
      size: [1.2, 1.1, 1.9],
      markerOffsetY: 0.72,
    },
    "Skewer Yakitori Machine.STEP-9": {
      center: [-2.0699, 0.261553, -5.05844],
      size: [1.2, 1.1, 1.9],
      markerOffsetY: 0.72,
    },
  };
function Ux({
  machines: e,
  conveyorLabels: t,
  selectedMachine: n,
  selectedMachineId: r,
  showGrid: i,
  showAxes: a,
  onSelectMachine: o,
  onCommand: s,
  onToggleGrid: c,
  onToggleAxes: l,
}) {
  return (0, $.jsxs)(`div`, {
    className: `viewer-overlay`,
    children: [
      (0, $.jsxs)(`div`, {
        className: `selected-chip`,
        children: [
          (0, $.jsx)(`span`, { className: `chip-label`, children: `Selected` }),
          (0, $.jsx)(`strong`, { children: n ? kx(n) : `No machine selected` }),
          n
            ? (0, $.jsxs)(`div`, {
                className: `selected-chip-meta`,
                children: [
                  (0, $.jsx)(`span`, { children: n.product_name }),
                  (0, $.jsx)(`span`, {
                    className: `status-pill is-${zx(n)}`,
                    children: Rx[zx(n)],
                  }),
                ],
              })
            : null,
        ],
      }),
      (0, $.jsxs)(`div`, {
        className: `viewer-toolbar`,
        "aria-label": `Viewer controls`,
        children: [
          (0, $.jsxs)(`select`, {
            className: `machine-select`,
            "aria-label": `Quick select machine`,
            value: r ?? ``,
            onChange: (e) => o(e.target.value || null),
            children: [
              (0, $.jsx)(`option`, { value: ``, children: `Quick select` }),
              e.map((e) =>
                (0, $.jsx)(
                  `option`,
                  { value: e.machine_id, children: kx(e) },
                  e.machine_id,
                ),
              ),
            ],
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            title: `Isometric view`,
            onClick: () => s(`viewIso`),
            children: `Iso`,
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            title: `Top view`,
            onClick: () => s(`viewTop`),
            children: `Top`,
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            title: `Front view`,
            onClick: () => s(`viewFront`),
            children: `Front`,
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            title: `Side view`,
            onClick: () => s(`viewSide`),
            children: `Side`,
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            title: `Reset view`,
            onClick: () => s(`reset`),
            children: `Reset`,
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            title: `Fit model`,
            onClick: () => s(`fit`),
            children: `Fit`,
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            title: `Zoom in`,
            onClick: () => s(`zoomIn`),
            children: `+`,
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            title: `Zoom out`,
            onClick: () => s(`zoomOut`),
            children: `-`,
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            className: i ? `is-active` : ``,
            title: `Toggle grid`,
            onClick: c,
            children: `Grid`,
          }),
          (0, $.jsx)(`button`, {
            type: `button`,
            className: a ? `is-active` : ``,
            title: `Toggle axes`,
            onClick: l,
            children: `Axes`,
          }),
        ],
      }),
      (0, $.jsxs)(`div`, {
        className: `usage-hint`,
        children: [
          (0, $.jsx)(`span`, { children: `Drag to rotate` }),
          (0, $.jsx)(`span`, { children: `Scroll to zoom` }),
          (0, $.jsx)(`span`, { children: `Click machine to view` }),
        ],
      }),
      n
        ? (0, $.jsxs)(`div`, {
            className: `viewer-info-panel`,
            "aria-label": `Selected machine details`,
            children: [
              (0, $.jsx)(`span`, {
                className: `viewer-info-label`,
                children: `Machine Focus`,
              }),
              (0, $.jsxs)(`div`, {
                className: `viewer-info-grid`,
                children: [
                  (0, $.jsxs)(`div`, {
                    children: [
                      (0, $.jsx)(`span`, { children: `ชื่อเครื่องจักร` }),
                      (0, $.jsx)(`b`, { children: kx(n) }),
                    ],
                  }),
                  (0, $.jsxs)(`div`, {
                    children: [
                      (0, $.jsx)(`span`, { children: `ชื่อสายพาน` }),
                      (0, $.jsx)(`b`, { children: Dx(n, t) }),
                    ],
                  }),
                  (0, $.jsxs)(`div`, {
                    children: [
                      (0, $.jsx)(`span`, { children: `สินค้า` }),
                      (0, $.jsx)(`b`, { children: n.product_name }),
                    ],
                  }),
                  (0, $.jsxs)(`div`, {
                    children: [
                      (0, $.jsx)(`span`, { children: `ติดตั้งล่าสุด` }),
                      (0, $.jsx)(`b`, { children: n.installed_at ?? `-` }),
                    ],
                  }),
                  (0, $.jsxs)(`div`, {
                    className: `full-width`,
                    children: [
                      (0, $.jsx)(`span`, { children: `Machine status` }),
                      (0, $.jsx)(`b`, {
                        className: `status-text is-${zx(n)}`,
                        children: Rx[zx(n)],
                      }),
                    ],
                  }),
                  (0, $.jsxs)(`div`, {
                    className: `full-width`,
                    children: [
                      (0, $.jsx)(`span`, { children: `Break down ล่าสุด` }),
                      (0, $.jsx)(`b`, { children: n.last_breakdown_at ?? `-` }),
                    ],
                  }),
                ],
              }),
            ],
          })
        : null,
      (0, $.jsxs)(`div`, {
        className: `conveyor-legend`,
        "aria-label": `Conveyor labels`,
        children: [
          (0, $.jsxs)(`div`, {
            className: `legend-heading`,
            children: [`Machines `, e.length],
          }),
          (0, $.jsx)(`div`, {
            className: `machine-overview`,
            children: e.map((e) =>
              (0, $.jsxs)(
                `button`,
                {
                  type: `button`,
                  onClick: () => o(e.machine_id),
                  children: [
                    (0, $.jsx)(`span`, {
                      className: `machine-overview-dot is-${zx(e)}`,
                    }),
                    (0, $.jsx)(`strong`, { children: Ax(e) }),
                    (0, $.jsx)(`span`, { children: kx(e) }),
                  ],
                },
                e.machine_id,
              ),
            ),
          }),
          (0, $.jsxs)(`div`, {
            className: `legend-heading`,
            children: [`Conveyors `, wx.length],
          }),
          wx.map((e) =>
            (0, $.jsxs)(
              `div`,
              {
                children: [
                  (0, $.jsx)(`span`, {}),
                  (0, $.jsx)(`strong`, { children: e }),
                ],
              },
              e,
            ),
          ),
        ],
      }),
    ],
  });
}

function Gx({
  machines: e,
  conveyorLabels: t,
  selectedMachineId: n,
  hoveredMachineId: r,
  onSelectMachine: i,
  onHoverMachine: a,
  showGrid: o,
  showAxes: s,
  viewerCommand: c,
}) {
  k_(state => {
    const stage = document.querySelector('.viewer-stage');
    if (stage) stage.dataset.cameraPosition = state.camera.position.toArray().map(value => value.toFixed(4)).join(',');
  });
  let l = Jx(vx(`models/layout_zone_sc4_yakitori.glb`)),
    { camera: u } = O_(),
    d = (0, v.useRef)(new Map()),
    f = (0, v.useRef)(null),
    [p, m] = (0, v.useState)([]),
    [h, g] = (0, v.useState)([]),
    [_, y] = (0, v.useState)([]),
    b = (0, v.useMemo)(
      () => new Map(e.map((e) => [e.model_node_name, e])),
      [e],
    ),
    x = (0, v.useMemo)(
      () => new Map(e.filter(Sx).map((e) => [e.model_node_name, e])),
      [e],
    ),
    S = (0, v.useMemo)(() => new Map(e.map((e) => [e.machine_id, e])), [e]),
    C = () => {
      let e = new ii().setFromObject(l.scene),
        t = new G(),
        n = new G();
      return (
        e.getSize(t),
        e.getCenter(n),
        { boundingBox: e, size: t, center: n, maxSize: Math.max(t.x, t.y, t.z) }
      );
    },
    w = (0, v.useMemo)(() => C(), [l.scene]),
    T = (e = `viewIso`, t = 0.72) => {
      let { size: n, center: r, maxSize: i } = C();
      (e === `viewTop`
        ? u.position.set(r.x, r.y + i * 1.18 * t, r.z + 0.01)
        : e === `viewFront`
          ? u.position.set(r.x, r.y + n.y * 0.42, r.z + i * 1.08 * t)
          : e === `viewSide`
            ? u.position.set(r.x + i * 1.08 * t, r.y + n.y * 0.42, r.z)
            : u.position.set(
                r.x + n.x * 0.9 * t,
                r.y + n.y * 0.8 * t,
                r.z + n.z * 1.1 * t,
              ),
        u.lookAt(r),
        u.updateProjectionMatrix(),
        f.current?.target.copy(r),
        f.current?.update());
    };
  ((0, v.useEffect)(() => {
    let n = new Map(),
      r = [],
      i = [],
      a = [];
    l.scene.traverse((e) => {
        const staticName = Array.from(x.keys()).find(name => Px(name) === Px(e.name || ''));
        if (!staticName || n.has(staticName)) return;
        let t = x.get(staticName);
      if (!t) return;
        let a = Fx(l.scene, _x[staticName] ?? ``) ?? e,
        o = new ii().setFromObject(a),
        s = new G(),
        c = new G(),
        u = new G();
      (o.getCenter(c), o.getSize(u), s.copy(c), (s.y = o.max.y + 0.1));
      let d = u
        .clone()
        .multiply(new G(1.12, 1.9, 1.3))
        .max(new G(0.9, 0.5, 0.82));
        (n.set(staticName, e),
        r.push({
          machineId: t.machine_id,
          label: Ax(t),
          name: kx(t),
          status: zx(t),
          position: s,
        }),
        i.push({ machineId: t.machine_id, center: c, size: d }));
    });
    for (let e of t) {
        let t = Fx(l.scene, e.nodeName);
      if (!t) continue;
      let n = new ii().setFromObject(t),
        r = new G(),
        i = new G();
      (n.getCenter(r),
        n.getSize(i),
        (r.y += i.y * 1.05 + 0.28),
        a.push({ ...e, position: r }));
    }
    for (let t of e.filter(Sx)) {
      let e = Bx[t.model_node_name];
      if (!e || i.some((e) => e.machineId === t.machine_id)) continue;
      let n = new G(...e.center),
        a = new G(...e.size),
        o = n.clone();
      ((o.y += e.markerOffsetY),
        r.push({
          machineId: t.machine_id,
          label: Ax(t),
          name: kx(t),
          status: zx(t),
          position: o,
        }),
        i.push({ machineId: t.machine_id, center: n, size: a }));
    }
    ((d.current = n), m(r), g(i), y(a));
  }, [t, l.scene, x, e]),
    (0, v.useEffect)(() => {
      l.scene.traverse((e) => {
        if (
          ((e.visible = !0),
          (e.castShadow = !1),
          (e.receiveShadow = !1),
          !(`isMesh` in e) || !e.isMesh)
        )
          return;
        let t = e;
        t.frustumCulled = !1;
        let n = Array.isArray(t.material) ? t.material : [t.material];
        for (let e of n) {
          if (!e) continue;
          `side` in e && (e.side = 2);
          let t = e.name.toLowerCase(),
            n = `opacity` in e && typeof e.opacity == `number` ? e.opacity : 1;
          if (
            ((e.transparent ||
              t.includes(`glass`) ||
              t.includes(`clear`) ||
              n < 0.5) &&
              ((e.transparent = !0),
              (e.opacity = Math.max(n, 0.62)),
              (e.depthWrite = !1),
              (e.depthTest = !0)),
            !e || !(`color` in e) || !(e.color instanceof q))
          ) {
            e.needsUpdate = !0;
            continue;
          }
          let r = { h: 0, s: 0, l: 0 };
          (e.color.getHSL(r),
            r.s < 0.1 && r.l > 0.45
              ? e.color.offsetHSL(0, 0, -0.22)
              : r.l > 0.78
                ? e.color.offsetHSL(0, 0, -0.2)
                : r.l > 0.62 && e.color.offsetHSL(0, 0, -0.1),
            `envMapIntensity` in e &&
              typeof e.envMapIntensity == `number` &&
              (e.envMapIntensity = Math.min(e.envMapIntensity, 0.18)),
            `roughness` in e &&
              typeof e.roughness == `number` &&
              (e.roughness = Math.max(e.roughness, 0.72)),
            `metalness` in e &&
              typeof e.metalness == `number` &&
              (e.metalness = Math.min(e.metalness, 0.16)),
            (e.needsUpdate = !0));
        }
      });
    }, [l.scene]),
    (0, v.useEffect)(() => {
      T(`viewIso`, 0.72);
    }, [u, l.scene]),
    (0, v.useEffect)(() => {
      if (c) {
        if (c.type === `zoomIn` || c.type === `zoomOut`) {
          let e = f.current?.target ?? new G(),
            t = u.position.clone().sub(e);
          (t.multiplyScalar(c.type === `zoomIn` ? 0.82 : 1.18),
            u.position.copy(e.clone().add(t)),
            u.updateProjectionMatrix(),
            f.current?.update());
          return;
        }
        if (c.type === `fit`) {
          T(`viewIso`, 0.56);
          return;
        }
        if (c.type === `reset`) {
          T(`viewIso`, 0.72);
          return;
        }
        T(c.type);
      }
    }, [c]));
  let E = (e) => {
      let t = e;
      for (; t;) {
      let e = b.get(t.name) || Array.from(b.values()).find(machine => Px(machine.model_node_name) === Px(t.name || ''));
        if (e) return e;
        t = t.parent;
      }
      return null;
    },
    D = n
      ? (() => {
          let e = S.get(n)?.model_node_name ?? ``;
          return d.current.get(e) ?? Fx(l.scene, e) ?? null;
        })()
      : null,
    O = n ? (S.get(n) ?? null) : null,
    k = r
      ? (() => {
          let e = S.get(r)?.model_node_name ?? ``;
          return d.current.get(e) ?? Fx(l.scene, e) ?? null;
        })()
      : null,
    A = n ? (h.find((e) => e.machineId === n) ?? null) : null;
  return (
    (0, v.useEffect)(() => {
      if (!D) return;
      let e = new ii().setFromObject(D),
        t = new G(),
        n = new G();
      (e.getCenter(t), e.getSize(n));
      let r = f.current?.target ?? t,
        i = u.position.clone().sub(r).normalize();
      i.lengthSq() === 0 && i.set(1, 0.65, 1).normalize();
      let a = Math.max(n.x, n.y, n.z, 0.8) * 4.2;
      (u.position.copy(t.clone().add(i.multiplyScalar(a))),
        u.lookAt(t),
        u.updateProjectionMatrix(),
        f.current?.target.copy(t),
        f.current?.update());
    }, [n, D, u]),
    (0, $.jsxs)($.Fragment, {
      children: [
        (0, $.jsx)(`primitive`, {
          object: l.scene,
          onPointerMove: (e) => {
            let t = E(e.object);
            t && a(t.machine_id);
          },
          onPointerOut: () => a(null),
          onPointerDown: (e) => {
            let t = E(e.object);
            t && (e.stopPropagation(), i(t.machine_id));
          },
        }),
        h.map((e) =>
          (0, $.jsxs)(
            `mesh`,
            {
              position: e.center,
              onPointerMove: (t) => {
                (t.stopPropagation(), a(e.machineId));
              },
              onPointerOut: () => a(null),
              onPointerDown: (t) => {
                (t.stopPropagation(), i(e.machineId));
              },
              children: [
                (0, $.jsx)(`boxGeometry`, {
                  args: [e.size.x, e.size.y, e.size.z],
                }),
                (0, $.jsx)(`meshBasicMaterial`, {
                  transparent: !0,
                  opacity: 0,
                  colorWrite: !1,
                  depthWrite: !1,
                }),
              ],
            },
            e.machineId,
          ),
        ),
        p.map((e) =>
          (0, $.jsx)(
            hy,
            {
              position: e.position,
              zIndexRange: [3, 0],
              center: !0,
              distanceFactor: 9,
              children: (0, $.jsx)(`button`, {
                type: `button`,
                title: e.name,
                className: `machine-marker is-status-${e.status}${e.machineId === n ? ` is-selected` : ``}${e.machineId === r ? ` is-hovered` : ``}`,
                onClick: () => i(e.machineId),
                children: e.label,
              }),
            },
            e.machineId,
          ),
        ),
        _.map((e) =>
          (0, $.jsx)(
            hy,
            {
              position: e.position,
              zIndexRange: [3, 0],
              center: !0,
              distanceFactor: 10,
              children: (0, $.jsx)(`div`, {
                className: `conveyor-label`,
                "data-model-node": e.nodeName,
                children: e.label,
              }),
            },
            e.nodeName,
          ),
        ),
        O && A ? (0, $.jsx)(Kx, { machine: O, hitbox: A }) : null,
        k && r !== n ? (0, $.jsx)(qx, { target: k, tone: `hover` }) : null,
        D ? (0, $.jsx)(qx, { target: D, tone: `selected` }) : null,
        o
          ? (0, $.jsx)(`gridHelper`, {
              args: [Math.max(w.maxSize * 2.4, 36), 40, `#55f0b8`, `#36506c`],
              position: [w.center.x, w.boundingBox.min.y - 0.06, w.center.z],
            })
          : null,
        s
          ? (0, $.jsx)(Gy, {
              alignment: `bottom-right`,
              margin: [88, 88],
              children: (0, $.jsx)(Jy, {
                axisColors: [`#ff6b6b`, `#55f0b8`, `#5cc8ff`],
                labelColor: `#f4fbff`,
              }),
            })
          : null,
        (0, $.jsx)(Oy, {
          ref: f,
          makeDefault: !0,
          enableDamping: !0,
          dampingFactor: 0.08,
        }),
      ],
    })
  );
}
function Kx({ machine: e, hitbox: t }) {
  let n = (0, v.useRef)(null),
    r = t.center.y - t.size.y * 0.46,
    i = t.center.clone();
  return (
    (i.y += t.size.y * 0.34 + 0.08),
    k_((e) => {
      let t = 1 + Math.sin(e.clock.elapsedTime * 2.6) * 0.06;
      n.current?.scale.setScalar(t);
    }),
    (0, $.jsxs)($.Fragment, {
      children: [
        (0, $.jsxs)(`group`, {
          ref: n,
          position: [t.center.x, r, t.center.z],
          children: [
            (0, $.jsxs)(`mesh`, {
              rotation: [-Math.PI / 2, 0, 0],
              children: [
                (0, $.jsx)(`ringGeometry`, {
                  args: [
                    Math.max(t.size.x * 0.28, 0.46),
                    Math.max(t.size.x * 0.4, 0.64),
                    48,
                  ],
                }),
                (0, $.jsx)(`meshBasicMaterial`, {
                  color: `#ffd24d`,
                  transparent: !0,
                  opacity: 0.96,
                  side: 2,
                  depthTest: !1,
                }),
              ],
            }),
            (0, $.jsxs)(`mesh`, {
              position: [0, 0.015, 0],
              rotation: [-Math.PI / 2, 0, 0],
              children: [
                (0, $.jsx)(`ringGeometry`, {
                  args: [
                    Math.max(t.size.x * 0.48, 0.72),
                    Math.max(t.size.x * 0.56, 0.86),
                    48,
                  ],
                }),
                (0, $.jsx)(`meshBasicMaterial`, {
                  color: `#ff7b39`,
                  transparent: !0,
                  opacity: 0.8,
                  side: 2,
                  depthTest: !1,
                }),
              ],
            }),
          ],
        }),
        (0, $.jsx)(hy, {
          position: i,
          zIndexRange: [3, 0],
          center: !0,
          distanceFactor: 8,
          children: (0, $.jsxs)(`div`, {
            className: `selected-machine-beacon`,
            children: [
              (0, $.jsx)(`strong`, { children: Mx(e) }),
              (0, $.jsxs)(`span`, { children: [`สินค้า `, e.product_name] }),
            ],
          }),
        }),
      ],
    })
  );
}
function qx({ target: e, tone: t }) {
  let [n, r] = (0, v.useState)(() => ({
    center: new G(),
    size: new G(1, 1, 1),
  }));
  if (
    ((0, v.useEffect)(() => {
      let t = new ii().setFromObject(e),
        n = new G(),
        i = new G();
      (t.getCenter(n), t.getSize(i), r({ center: n, size: i.addScalar(0.06) }));
    }, [e]),
    n.size.x === 0 || n.size.y === 0 || n.size.z === 0)
  )
    return null;
  let i = t === `selected` ? `#ffd24d` : `#1c8a69`,
    a = t === `selected` ? 0.16 : 0.05;
  return (0, $.jsxs)(`group`, {
    position: n.center,
    children: [
      (0, $.jsxs)(`mesh`, {
        children: [
          (0, $.jsx)(`boxGeometry`, { args: [n.size.x, n.size.y, n.size.z] }),
          (0, $.jsx)(`meshBasicMaterial`, {
            color: i,
            transparent: !0,
            opacity: a,
          }),
        ],
      }),
      (0, $.jsxs)(`lineSegments`, {
        children: [
          (0, $.jsx)(`edgesGeometry`, {
            args: [new ys(n.size.x, n.size.y, n.size.z)],
          }),
          (0, $.jsx)(`lineBasicMaterial`, { color: i }),
        ],
      }),
    ],
  });
}
function Jx(e) {
  return N_(lb, e, (e) => {
    // This GLB's embedded image declares PNG but its bytes are DDS. Select the
    // decoder by the actual buffer signature, preserving the original model.
    e.register(parser => ({
      name: 'APEX_embedded_image_decoder',
      loadTexture(index) {
        const texture = parser.json.textures[index], image = parser.json.images[texture.source];
        if (image.bufferView === undefined) return null;
        return parser.getDependency('bufferView', image.bufferView).then(buffer => {
          const dds = new DataView(buffer).getUint32(0, true) === 0x20534444;
          const loader = dds ? { isImageBitmapLoader: parser.textureLoader.isImageBitmapLoader,
            load: (_url, done, progress, fail) => parser.textureLoader.load(vx('data/embedded-normal.png'), done, progress, fail) } : parser.textureLoader;
          return parser.loadTextureImage(index, texture.source, loader);
        });
      }
    }));
    let t = new ib();
    (t.setDecoderPath(vx(`draco/`)),
      e.setDRACOLoader(t),
      e.manager.addHandler(/\.dds$/i, new $y()));
  });
}
