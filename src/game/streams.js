/* ──────────────────────────────────────────────────────────────────────────
   Речки и пруды (09.10.2026). Правила словами — docs/CAREER.md «Вода как вода»
   → «Речки и пруды».

   Раньше вода была только в Томи: семь речек карты (CITY.streams — линия и
   ширина) не рисовались вовсе, а пруды (CITY.green k:'water') лежали тонкой
   плёнкой на 3 см над землёй — их перекрывали газоны (4 см) и они мерцали с
   землёй. Теперь:
   • русло: узлы сетки рельефа вдоль речки и внутри пруда опускаются (carve —
     до сборки города, как relief.js): речка — на DIP_STREAM у оси, пруд — на
     DIP_POND дальше POND_DIP_R от берега. Узлы у дорог, домов, рельсов,
     подъездов и у Томи не трогаем;
   • вода — свой меш тем же шейдером, что Томь (water.js buildInland): волны,
     блик, пена у берега, круги от дождя, зимой лёд. Лежит на рельефе
     (как газон) на LIFT над землёй — не висит и не тонет. Глубина для
     шейдера (пена, мелкая бирюза) — в красном канале цвета вершины: у речки —
     «шатром» от берега к оси, у пруда — по расстоянию до берега;
   • берег речки — полоса мокрой земли (BANK м с каждой стороны), камыш
     кучками вдоль речек и по берегам прудов (в общей статике, без своих мешей);
   • где речку пересекает дорога (полотно и тротуар, не мост) — воды нет:
     лента обрывается у края тротуара (труба под дорогой); под мостом — течёт.
   Езда (game.js driveStep): at(x, z, y) — глубина, м. Речка — WADE (вброд:
   сильно тормозит, брызги, машина садится в воду); пруд — у берега мелко,
   глубже на SLOPE м на метр от берега (до DEEP по размеру пруда); с DROWN —
   тонешь, как в Томи. Первый раз вброд — Толик пишет в чат.
   Зимой (лёд воды > 0,6) at() — null: всё подо льдом, едешь по льду; глубокий
   пруд трещит и проваливается — ice.js (under() — вода без учёта льда).
   ?nostreams — как раньше (без речек, пруды плёнкой).
   ────────────────────────────────────────────────────────────────────────── */
import { t } from '../i18n/index.js';
import { walkHalf } from './pave.js';

export const CFG = {
  DIP_STREAM: 0.5,        // м: русло речки ниже земли (у оси)
  DIP_R: [6, 20],         // м от оси: полная глубина русла → ноль
  DIP_POND: 0.6,          // м: дно пруда ниже берега (вдали от берега)
  POND_DIP_R: [4, 24],    // м от берега внутрь: ноль → полная
  LIFT_STREAM: 0.058,     // вода над землёй: выше газонов (0,04—0,044) и полосы берега, ниже дорожек (0,07) и тротуаров
  LIFT_POND: 0.062,       // пруд чуть выше речки: где речка впадает — сверху пруд
  BANK: 1.6,              // м: мокрая земля по краю речки
  BANK_LIFT: 0.05,
  BANK_HEX: '#83845a',
  REED_HEX: ['#8d9a4c', '#a3a05a', '#7f8f45'],
  REED_STEP: 11,          // м между кучками камыша вдоль речки (жребий по месту)
  SHADE_C: 1.6,           // глубина «для глаза» у оси речки, м (пена у берега — у самой кромки)
  WADE: 0.45,             // глубина речки для езды, м
  SLOPE: 0.12,            // пруд: м глубины на метр от берега
  DEEP: [0.6, 4],         // пруд: самая большая глубина — по размеру (√площади / 20)
  EDGE: 0.15,             // пруд у самой кромки — уже по колено колёсам
  DROWN: 1.0,             // глубже — тонешь
  DRAG: 5,                // торможение в воде (доля скорости в секунду при глубине WADE)
  SINK: 0.55,             // машина садится в воду на эту долю глубины (не глубже 0,35 м)
};
const OFF = typeof location !== 'undefined' && /[?&]nostreams/.test(location.search);

const sm = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * k, z - az - dz * k);
};
const inPoly = (P, x, z) => {
  let c = false;
  for (let i = 0, k = P.length - 1; i < P.length; k = i++) {
    const xi = P[i][0], zi = P[i][1], xk = P[k][0], zk = P[k][1];
    if ((zi > z) !== (zk > z) && x < xi + (z - zi) / (zk - zi) * (xk - xi)) c = !c;
  }
  return c;
};
/* расстояние до берега пруда, не дальше cap (дальше — cap): рёбра — сеткой по EG м, смотрим 3×3 клетки */
const EG = 36;
function shoreD (P, x, z, cap = EG) {
  if (!P.eg) {
    P.eg = grid(EG);
    const p = P.p;
    for (let i = 0, k = p.length - 1; i < p.length; k = i++)
      P.eg.add(Math.min(p[k][0], p[i][0]), Math.min(p[k][1], p[i][1]), Math.max(p[k][0], p[i][0]), Math.max(p[k][1], p[i][1]), [p[k][0], p[k][1], p[i][0], p[i][1]]);
  }
  let d = cap;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const L = P.eg.at(x + a * EG, z + b * EG);
    if (L) for (const e of L) { const q = segD(x, z, e[0], e[1], e[2], e[3]); if (q < d) d = q; }
  }
  return d;
}
const bboxOf = p => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; } return { x0, z0, x1, z1 }; };
const areaOf = p => { let a = 0; for (let i = 0, k = p.length - 1; i < p.length; k = i++) a += p[k][0] * p[i][1] - p[i][0] * p[k][1]; return Math.abs(a / 2); };

/* сетка поиска: клетка C м → список */
function grid (C) {
  const M = new Map(), key = (i, j) => (i + 4096) * 8192 + j + 4096;
  return {
    add (x0, z0, x1, z1, v) {
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
        for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const k = key(i, j); let a = M.get(k); if (!a) M.set(k, a = []); a.push(v); }
    },
    at (x, z) { return M.get(key(Math.floor(x / C), Math.floor(z / C))); },
  };
}

const PONDS = [];          // { p, bb, maxD, name }
const RIVS = [];           // { p, w, name } — речки, что рисуем
const WGRID = grid(64);    // для езды: куски речек [ax, az, bx, bz, hw] и пруды
let A = null, DRY = null, SEEN = false;
export const STATS = { on: false, carved: 0, ponds: 0, streams: 0, pieces: 0, cuts: 0, reeds: 0, ms: 0 };

/* ── русло: до сборки города (game.js, сразу после relief.js) ──
   CITY — карта, TH — высоты узлов (меняются на месте), TER — { g, nx, nz, x0, z0 },
   o: { roadHW(r) — полуширина дороги с тротуаром, far(x, z) — точка далеко за забором (не рисуем),
        spots — [[x, z, r]] — свои места, где земля ровная (пиццерии, гаражи) } */
export function carve (CITY, TH, TER, o = {}) {
  if (OFF) return STATS;
  const t0 = performance.now();
  const TG = TER.g, NX = TER.nx, NZ = TER.nz, X0 = TER.x0, Z0 = TER.z0;
  const far = o.far || (() => false);
  // речки и пруды, что рисуем: хоть одна точка не «далеко за забором»
  for (const g of CITY.green || []) {
    if (g.k !== 'water' || !g.p || g.p.length < 3 || g.p.every(q => far(q[0], q[1]))) continue;
    const a = areaOf(g.p);
    PONDS.push({ p: g.p, bb: bboxOf(g.p), area: a, maxD: Math.max(CFG.DEEP[0], Math.min(CFG.DEEP[1], Math.sqrt(a) / 20)), name: g.n || '' });
  }
  for (const s of CITY.streams || []) if (s.p && s.p.length > 1 && !s.p.every(q => far(q[0], q[1]))) RIVS.push({ p: s.p, w: s.w || 6, name: s.n || '' });

  // узлы, которые не трогаем: дороги с тротуаром, дома, рельсы, подъезды, места, пиццерии, Томь и её берег
  const B = new Uint8Array(NX * NZ);
  // считаем только у воды: клетки по 64 м, которые задевают речки (+ DIP_R) и пруды
  const NEAR = new Set(), NC = 64, nk = (i, j) => i * 100000 + j;
  const nearBox = (x0, z0, x1, z1) => { for (let i = Math.floor(x0 / NC); i <= Math.floor(x1 / NC); i++) for (let j = Math.floor(z0 / NC); j <= Math.floor(z1 / NC); j++) NEAR.add(nk(i, j)); };
  const isNear = (x0, z0, x1, z1) => { for (let i = Math.floor(x0 / NC); i <= Math.floor(x1 / NC); i++) for (let j = Math.floor(z0 / NC); j <= Math.floor(z1 / NC); j++) if (NEAR.has(nk(i, j))) return true; return false; };
  for (const s of RIVS) for (let q = 1; q < s.p.length; q++) { const [ax, az] = s.p[q - 1], [bx, bz] = s.p[q]; nearBox(Math.min(ax, bx) - 24, Math.min(az, bz) - 24, Math.max(ax, bx) + 24, Math.max(az, bz) + 24); }
  for (const P of PONDS) nearBox(P.bb.x0 - 24, P.bb.z0 - 24, P.bb.x1 + 24, P.bb.z1 + 24);
  const seg = (ax, az, bx, bz, r) => {
    if (!isNear(Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r)) return;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - X0) / TG)), i1 = Math.min(NX - 1, Math.ceil((Math.max(ax, bx) + r - X0) / TG));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - Z0) / TG)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(az, bz) + r - Z0) / TG));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (segD(X0 + i * TG, Z0 + j * TG, ax, az, bx, bz) <= r) B[j * NX + i] = 1;
  };
  const line = (p, r) => { for (let k = 1; k < p.length; k++) seg(p[k - 1][0], p[k - 1][1], p[k][0], p[k][1], r); };
  const reach = TG * 1.415 + 2;               // узел трогает треугольники вокруг себя — запас на них
  const roadHW = o.roadHW || (r => (r.w || 9) / 2 + 2.5);
  for (const r of CITY.roads || []) line(r.p, roadHW(r) + reach);
  for (const r of CITY.rails || []) line(r.p, 4 + reach);
  for (const b of CITY.buildings || []) {
    const q = bboxOf(b.p);
    if (!isNear(q.x0 - reach, q.z0 - reach, q.x1 + reach, q.z1 + reach)) continue;
    const i0 = Math.max(0, Math.floor((q.x0 - reach - X0) / TG)), i1 = Math.min(NX - 1, Math.ceil((q.x1 + reach - X0) / TG));
    const j0 = Math.max(0, Math.floor((q.z0 - reach - Z0) / TG)), j1 = Math.min(NZ - 1, Math.ceil((q.z1 + reach - Z0) / TG));
    for (let j = j0; j <= j1; j++) B.fill(1, j * NX + i0, j * NX + i1 + 1);
  }
  for (const e of CITY.entrances || []) seg(e[0], e[1], e[0], e[1], 10);
  for (const p of CITY.pois || []) seg(p.p[0], p.p[1], p.p[0], p.p[1], 8);
  for (const s of CITY.stops || []) seg(s.p[0], s.p[1], s.p[0], s.p[1], 6);
  for (const s of o.spots || []) seg(s[0], s[1], s[0], s[1], s[2]);
  for (let k = 0; k < B.length; k++) if (TH[k] < 2) B[k] = 1;   // Томь и пляж — не наше (water.js, beach)

  const CV = new Float32Array(NX * NZ);
  // речки: у оси — полная глубина, к DIP_R[1] — ноль
  const R1 = CFG.DIP_R[1];
  for (const s of RIVS) {
    const p = s.p;
    for (let q = 1; q < p.length; q++) {
      const ax = p[q - 1][0], az = p[q - 1][1], bx = p[q][0], bz = p[q][1];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R1 - X0) / TG)), i1 = Math.min(NX - 1, Math.ceil((Math.max(ax, bx) + R1 - X0) / TG));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R1 - Z0) / TG)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(az, bz) + R1 - Z0) / TG));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * NX + i; if (B[k]) continue;
        const d = segD(X0 + i * TG, Z0 + j * TG, ax, az, bx, bz);
        if (d < R1) CV[k] = Math.max(CV[k], CFG.DIP_STREAM * (1 - sm(CFG.DIP_R[0], R1, d)));
      }
    }
  }
  // пруды: у берега ноль, вглубь — до DIP_POND
  for (const P of PONDS) {
    const b = P.bb, p = P.p;
    for (let j = Math.max(0, Math.ceil((b.z0 - Z0) / TG)); j <= Math.min(NZ - 1, Math.floor((b.z1 - Z0) / TG)); j++) {
      const z = Z0 + j * TG, xs = [];                       // строка узлов: где она входит в пруд и выходит
      for (let a = 0, c = p.length - 1; a < p.length; c = a++) if ((p[a][1] > z) !== (p[c][1] > z)) xs.push(p[a][0] + (z - p[a][1]) / (p[c][1] - p[a][1]) * (p[c][0] - p[a][0]));
      xs.sort((u, v) => u - v);
      for (let q = 0; q + 1 < xs.length; q += 2)
        for (let i = Math.max(0, Math.ceil((xs[q] - X0) / TG)); i <= Math.min(NX - 1, Math.floor((xs[q + 1] - X0) / TG)); i++) {
          const k = j * NX + i; if (B[k]) continue;
          CV[k] = Math.max(CV[k], CFG.DIP_POND * sm(CFG.POND_DIP_R[0], CFG.POND_DIP_R[1], shoreD(P, X0 + i * TG, z)));
        }
    }
  }
  let n = 0;
  for (let k = 0; k < CV.length; k++) if (CV[k] > 0.005) { TH[k] -= CV[k]; n++; }
  Object.assign(STATS, { on: true, carved: n, ponds: PONDS.length, streams: RIVS.length, ms: Math.round(performance.now() - t0), msCarve: Math.round(performance.now() - t0) });
  return STATS;
}

/* ── сборка: вода, берег, камыш (game.js, рядом с WATER.build) ──
   api: { WATER, LITM, Mesher, RSEG, CITY, groundH, surfaceAt, splash, Snd, CHAT, Store, toast, V, live() } */
export function build (api) {
  A = api;
  if (OFF) return null;
  const t0 = performance.now();
  // где сухо: полотно и тротуар дороги (не моста) и рельсы (не мост) — туда воду не кладём, там не мокнешь
  DRY = grid(48);
  for (const s of api.RSEG) {
    if (s.b) continue;
    const h = walkHalf(s) + 0.3;
    DRY.add(Math.min(s.x1, s.x2) - h, Math.min(s.z1, s.z2) - h, Math.max(s.x1, s.x2) + h, Math.max(s.z1, s.z2) + h, [s.x1, s.z1, s.x2, s.z2, h]);
  }
  for (const r of api.CITY.rails || []) if (!r.b) for (let i = 1; i < r.p.length; i++) {   // ж/д мост (b) — речка течёт под ним
    const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
    DRY.add(Math.min(x1, x2) - 3.5, Math.min(z1, z2) - 3.5, Math.max(x1, x2) + 3.5, Math.max(z1, z2) + 3.5, [x1, z1, x2, z2, 3.5]);
  }
  const M = api.Mesher(), L = api.LITM;
  const ENC = d => Math.round(Math.max(0, Math.min(1, d / 4)) * 255);
  // ── речки: куски между дорогами; половинки ленты — глубина «шатром» от берега к оси ──
  let cur = null;                                              // ось текущего куска: ax, az, bx, bz, hw
  M.color('#6fb0c9');
  M.grad((x, z, c, i) => {
    let d;
    if (cur.disc) d = Math.hypot(x - cur.ax, z - cur.az);
    else { const dx = cur.bx - cur.ax, dz = cur.bz - cur.az, l = Math.hypot(dx, dz) || 1; d = Math.abs(((x - cur.ax) * dz - (z - cur.az) * dx) / l); }
    c[i] = ENC(CFG.SHADE_C * Math.max(0, 1 - d / cur.hw)); c[i + 1] = 0; c[i + 2] = 0;
  });
  let pieces = 0, cuts = 0, reeds = 0;
  for (const s of RIVS) {
    const hw = s.w / 2, p = s.p;
    // режем по сухому: точки через ~1 м; кусок — подряд мокрые
    const runs = [];
    let run = null;
    for (let q = 1; q < p.length; q++) {
      const ax = p[q - 1][0], az = p[q - 1][1], bx = p[q][0], bz = p[q][1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
      for (let k = q === 1 ? 0 : 1; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        const dry = dryAt(x, z, hw * 0.6);
        if (dry) { if (run) { runs.push(run); run = null; cuts++; } continue; }
        if (!run) run = [];
        // вершины карты и концы куска — точками; середина прямой — не нужна
        if (k === 0 || k === n || !run.length) run.push([x, z]);
        else if (dryAt(ax + (bx - ax) * (k + 1) / n, az + (bz - az) * (k + 1) / n, hw * 0.6)) run.push([x, z]);
      }
    }
    if (run) runs.push(run);
    for (const r of runs) {
      if (r.length < 2) continue;
      pieces++;
      for (let q = 1; q < r.length; q++) {
        const ax = r[q - 1][0], az = r[q - 1][1], bx = r[q][0], bz = r[q][1], l = Math.hypot(bx - ax, bz - az);
        if (l < 0.05) continue;
        const nx = -(bz - az) / l * hw, nz = (bx - ax) / l * hw;
        cur = { ax, az, bx, bz, hw };
        M.dtri(ax, az, bx, bz, bx + nx, bz + nz, CFG.LIFT_STREAM); M.dtri(ax, az, bx + nx, bz + nz, ax + nx, az + nz, CFG.LIFT_STREAM);
        M.dtri(ax, az, ax - nx, az - nz, bx - nx, bz - nz, CFG.LIFT_STREAM); M.dtri(ax, az, bx - nx, bz - nz, bx, bz, CFG.LIFT_STREAM);
        { const m = hw + CFG.BANK + 4; WGRID.add(Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m, [ax, az, bx, bz, hw]); }
        // берег: мокрая земля шире воды, под ней (общая статика)
        L.color(CFG.BANK_HEX).ribbon(ax, az, bx, bz, s.w + CFG.BANK * 2, CFG.BANK_LIFT);
        if (q < r.length - 1) {
          L.disc(bx, bz, hw + CFG.BANK, CFG.BANK_LIFT, 9);
          cur = { ax: bx, az: bz, hw, disc: true };
          M.disc(bx, bz, hw, CFG.LIFT_STREAM, 9);
        }
        // камыш: кучками вдоль берега, сторона и место — жребий по месту
        for (let u = hash(ax | 0, az | 0, 3) * CFG.REED_STEP; u < l; u += CFG.REED_STEP * (0.7 + hash(ax | 0, u | 0, 5) * 0.8)) {
          const side = hash(bx | 0, u | 0, 7) < 0.5 ? -1 : 1, off = hw + 0.2 + hash(az | 0, u | 0, 9) * 1.6;
          const x = ax + (bx - ax) * u / l + nx / hw * off * side, z = az + (bz - az) * u / l + nz / hw * off * side;
          if (dryAt(x, z, 2)) continue;
          reed(L, x, z, api.groundH(x, z)); reeds++;
        }
      }
    }
  }
  STATS.msRiv = Math.round(performance.now() - t0);
  // ── пруды: на рельефе, глубина для глаза — по расстоянию до берега ──
  // пруды внахлёст (озеро у водохранилища): глубина — по общему берегу (больше из двух), лежат на разной высоте
  let P = null;
  for (const a of PONDS) a.over = PONDS.filter(b => b !== a && b.bb.x0 < a.bb.x1 && b.bb.x1 > a.bb.x0 && b.bb.z0 < a.bb.z1 && b.bb.z1 > a.bb.z0);
  M.grad((x, z, c, i) => {
    let d = Math.min(P.maxD, CFG.SLOPE * shoreD(P, x, z));
    for (const Q of P.over) if (x > Q.bb.x0 && x < Q.bb.x1 && z > Q.bb.z0 && z < Q.bb.z1 && inPoly(Q.p, x, z)) d = Math.max(d, Math.min(Q.maxD, CFG.SLOPE * shoreD(Q, x, z)));
    c[i] = ENC(d); c[i + 1] = 0; c[i + 2] = 0;
  });
  PONDS.forEach((pd, n) => {
    P = pd;
    M.poly(pd.p, CFG.LIFT_POND + n * 0.0007);
    WGRID.add(pd.bb.x0 - 4, pd.bb.z0 - 4, pd.bb.x1 + 4, pd.bb.z1 + 4, pd);
    // камыш по берегу пруда: в воде у кромки
    const p = pd.p;
    for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
      const ax = p[k][0], az = p[k][1], bx = p[i][0], bz = p[i][1], l = Math.hypot(bx - ax, bz - az);
      for (let u = hash(ax | 0, az | 0, 13) * 16; u < l; u += 14 + hash(bx | 0, u | 0, 17) * 12) {
        const x0 = ax + (bx - ax) * u / l, z0 = az + (bz - az) * u / l, nx = -(bz - az) / l, nz = (bx - ax) / l;
        // внутрь пруда на 1—2 м
        const o = 1 + hash(x0 | 0, z0 | 0, 19);
        let x = x0 + nx * o, z = z0 + nz * o;
        if (!inPoly(p, x, z)) { x = x0 - nx * o; z = z0 - nz * o; }
        if (dryAt(x, z, 2) || pd.over.some(Q => inPoly(Q.p, x0, z0))) continue;   // край внутри соседнего пруда — не берег
        reed(L, x, z, api.groundH(x, z)); reeds++;
      }
    }
  });
  M.grad(null);
  STATS.msPond = Math.round(performance.now() - t0);
  const mesh = api.WATER.buildInland(M);
  Object.assign(STATS, { pieces, cuts, reeds, ms: STATS.ms + Math.round(performance.now() - t0) });
  try { SEEN = !!api.Store.get('dlv-wade', 0); } catch (e) { SEEN = false; }
  return mesh;
}

/* кучка камыша: 4—7 травинок-треугольников (две стороны), высота 0,9—1,7 м */
function reed (L, x, z, y) {
  const n = 4 + Math.floor(hash(x | 0, z | 0, 23) * 4);
  L.color(CFG.REED_HEX[Math.floor(hash(z | 0, x | 0, 29) * CFG.REED_HEX.length)]);
  for (let b = 0; b < n; b++) {
    const a = hash(x | 0, b, 31) * Math.PI * 2, r = hash(z | 0, b, 37) * 0.7;
    const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, h = 0.9 + hash(b, x | 0, 41) * 0.8;
    const lean = (hash(b, z | 0, 43) - 0.5) * 0.5, wa = a + 1.57, w = 0.09;
    const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
    const x1 = bx + Math.cos(wa) * w, z1 = bz + Math.sin(wa) * w, x2 = bx - Math.cos(wa) * w, z2 = bz - Math.sin(wa) * w;
    L.tri(x1, y, z1, x2, y, z2, tx, y + h, tz);
    L.tri(x2, y, z2, x1, y, z1, tx, y + h, tz);
  }
}

/* сухо: на полотне или тротуаре дороги (не моста), на рельсах; m — запас, м */
function dryAt (x, z, m = 0) {
  const a = DRY && DRY.at(x, z);
  if (!a) return false;
  for (const s of a) if (segD(x, z, s[0], s[1], s[2], s[3]) < s[4] + m) return true;
  return false;
}

/* вода в точке: { d — глубина, м; y — уровень воды; kind — 'stream' | 'pond' } или null (сухо).
   y — где сейчас машина (на мосту над речкой — сухо) */
export function at (x, z, y) {
  if (!A) return null;
  if (A.WATER.ice() > 0.6) return null;                               // зимой всё подо льдом: едешь по льду; глубокий пруд — трещит и проваливается (ice.js)
  return under(x, z, y);
}
/* вода в точке без учёта льда (ice.js: сколько воды подо льдом) — как at() */
export function under (x, z, y) {
  if (!A) return null;
  const a = WGRID.at(x, z);
  if (!a) return null;
  let d = 0, kind = null;
  for (const s of a) {
    if (s.p) {
      const b = s.bb;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !inPoly(s.p, x, z)) continue;
      const dd = Math.max(CFG.EDGE, Math.min(s.maxD, CFG.SLOPE * shoreD(s, x, z)));
      if (dd > d) { d = dd; kind = 'pond'; }
    } else if (d < CFG.WADE && segD(x, z, s[0], s[1], s[2], s[3]) < s[4]) { d = CFG.WADE; kind = 'stream'; }
  }
  if (!kind || dryAt(x, z)) return null;
  const g = A.groundH(x, z);
  if (y !== undefined && A.surfaceAt(x, z, y) - g > 0.6) return null;   // на мосту
  return { d, y: g + (kind === 'pond' ? CFG.LIFT_POND : CFG.LIFT_STREAM), kind };
}

/* мокро ли тут для деревьев, травы и мелочи на газоне (trees.js, forest.js, lawnprops.js):
   в речке с берегом (+ m) или в пруду (и ближе m к его берегу). До сборки (build) — нигде */
export function wet (x, z, m = 0) {
  const a = WGRID.at(x, z);
  if (!a) return false;
  for (const s of a) {
    if (s.p) {
      const b = s.bb;
      if (x < b.x0 - m || x > b.x1 + m || z < b.z0 - m || z > b.z1 + m) continue;
      if (inPoly(s.p, x, z) || (m > 0 && shoreD(s, x, z, m) < m)) return true;
    } else if (segD(x, z, s[0], s[1], s[2], s[3]) < s[4] + CFG.BANK + m) return true;
  }
  return false;
}

/* торможение в воде: доля скорости в секунду */
export const drag = d => CFG.DRAG * Math.min(1.4, d / CFG.WADE);
/* насколько машина садится в воду, м */
export const sinkBy = d => Math.min(0.35, d * CFG.SINK);

/* каждый кадр (game.js): брызги из-под колёс, плеск, подсказка Толика.
   V.wade — глубина под машиной (driveStep), 0 — сухо */
const FX = { t: 0, snd: 0, was: false };
export function step (dt) {
  if (!A || OFF) return;
  const V = A.V, d = V.wade || 0;
  FX.t -= dt; FX.snd -= dt;
  if (!d || !A.live()) { FX.was = false; return; }
  const sp = Math.hypot(V.vx, V.vz);
  if (!FX.was && sp > 2) { A.Snd.fx('splash', s => s.noise(0.35, 0.3)); FX.snd = 0.9; }
  FX.was = true;
  if (sp > 2 && FX.t <= 0) {
    FX.t = sp > 8 ? 0.16 : 0.3;
    const fx = Math.sin(V.h), fz = Math.cos(V.h), side = Math.random() < 0.5 ? -1 : 1;
    A.splash(V.x + fx * 1.6 + fz * side * 1.0, V.z + fz * 1.6 - fx * side * 1.0);
  }
  if (sp > 4 && FX.snd <= 0) { FX.snd = 0.8; A.Snd.fx('splash', s => s.noise(0.2, 0.2)); }
  if (!SEEN && sp > 1) {
    SEEN = true;
    try { A.Store.set('dlv-wade', 1); } catch (e) { /* — */ }
    if (A.CHAT && A.CHAT.say) A.CHAT.say(t('вброд по речке? ну ты капитан. только в пруд не суйся — там с головой'));
  }
}

export const DEBUG = { CFG, STATS, PONDS, RIVS, at, under, dryAt, wet, get seen () { return SEEN; }, set seen (v) { SEEN = !!v; } };
