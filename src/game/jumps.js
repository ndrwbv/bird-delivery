/* ──────────────────────────────────────────────────────────────────────────
   Большие трамплины (автор 17.10.2026: «чтобы прям высоко можно было прыгнуть и запрыгнуть
   на небольшой дом»). docs/CAREER.md → «Трамплины и крыши».

   Что: 15—25 горок 3—5 м высотой по городу — куча песка или щебня, бетонные плиты горкой,
   фура-автовоз с опущенной аппарелью, обломанная эстакада. Каждая смотрит на
   низкую крышу (ряд гаражей, одноэтажный магазин, цех — roofs.js): с разгона 70—90 км/ч
   машина садится на крышу, быстрее — перелетает, медленнее — падает перед домом (без урона).

   Где: build() ищет сам (горка — не на асфальте никакой дороги, кроме пешеходок: проверка «постройки не на дороге»). Для каждой плоской низкой крыши и каждого из 4 направлений (вдоль и
   поперёк дома) считает полёт той же физикой, что в game.js (подкид — по уклону горки, ×1,25
   скорости, тяжесть 22 м/с², сопротивление 0,3/с), и ставит горку так, чтобы на 70 и на 90 км/ч
   машина садилась на крышу. Годится, если:
     • горка — не на проезжей части улиц (до края полотна ≥ 1 м), не на тротуаре, не на парковке,
       не в воде, не в доме и не в чужом препятствии; земля под ней ровная (перепад ≤ 0,8 м);
     • за ней разгон RUN м по прямой без домов и препятствий, и на нём есть дорога (въезд с дороги);
     • между верхом горки и домом — ни дома, ни препятствия; в окне посадки крыша шире машины;
     • до подъезда ≥ 12 м, до пиццерии ≥ 60 м, до другой большой горки ≥ GAP м, до маленькой ≥ 30 м.
   Из годных — по одному на место, вразброс по городу, не больше MAX.

   Хуки: blocks(x, z, r) — горка, разгон и полёт заняты (адреса заказов, мелочь на газоне,
   сугробы туда не встают); landed(A) — машина села на крышу (достижение ROOFTOP, Толик один
   раз за смену); reset() — новая смена.
   ────────────────────────────────────────────────────────────────────────── */
import { t, N_ } from '../i18n/index.js';
import * as ROOFS from './roofs.js';

export const JUMP = {
  MAX: 22, GAP: 140, RUN: 38,
  V: [70, 80, 90],                 // км/ч: на этих скоростях — на крышу (ряд гаражей длинный)
  V2: [75, 80, 87],                // магазины и одноэтажки короче — окно уже
  BOOST: 1.25, G: 22, DRAG: 0.3,   // как в game.js driveStep (подкид с трамплина)
};
/* виды: H — высота, L — длина ската, W — ширина */
const KINDS = {
  sand: { H: 3.4, L: 11, W: 5, side: 1.6 },
  gravel: { H: 3.3, L: 11, W: 5, side: 1.6 },
  plates: { H: 3.2, L: 10, W: 4.6, side: 0 },
  truck: { H: 4.0, L: 12, W: 3.8, side: 0 },
  bridge: { H: 4.8, L: 16, W: 6, side: 0 },
};
export const LIST = [];
export const STATS = { roofs: 0, tried: 0, ok: 0, okRoof: {}, placed: 0, landings: 0, ms: 0, byKind: {}, why: {} };
const CLAIMS = [];                 // занятые прямоугольники: { cx, cz, ux, uz, hl, hw, x0…z1 }
let SAID = false;

/* полёт с верха горки: где машина опустится до высоты top (абс.); base — земля у горки */
function flight (k, v, base, top, wallAt) {
  const dt = 1 / 60;
  let vh = v * JUMP.BOOST, vy = v * JUMP.BOOST * k.H / k.L * 1.15, y = base + k.H, x = 0, clear = true;
  for (let i = 0; i < 400; i++) {
    vy -= JUMP.G * dt; y += vy * dt;
    vh -= vh * JUMP.DRAG * dt; x += vh * dt;
    if (x < wallAt && x > wallAt - 1.6 && y < top - ROOFS.ROOF.PASS + 0.25) clear = false;   // нос у стены — ниже её верха
    if (vy < 0 && y <= top) return { x, clear };
    if (y < base - 5) break;
  }
  return null;
}

/* занятое — ещё и по клеткам CC м (рамка + CR): blocks зовут сотни тысяч раз (дворы без пустых мест, yardfill.js) — не перебирать
   все горки города; вопрос с запасом r > CR — перебором, как раньше */
const CC = 32, CR = 8, CGRID = new Map();
const cck = (i, j) => (i + 8192) * 16384 + j + 8192;
function claim (cx, cz, ux, uz, hl, hw) {
  const ex = Math.abs(ux) * hl + Math.abs(uz) * hw, ez = Math.abs(uz) * hl + Math.abs(ux) * hw;
  const c = { cx, cz, ux, uz, hl, hw, x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez };
  CLAIMS.push(c);
  for (let i = Math.floor((c.x0 - CR) / CC); i <= Math.floor((c.x1 + CR) / CC); i++)
    for (let j = Math.floor((c.z0 - CR) / CC); j <= Math.floor((c.z1 + CR) / CC); j++) {
      const k = cck(i, j);
      let a = CGRID.get(k);
      if (!a) CGRID.set(k, a = []);
      a.push(c);
    }
}
/* занято ли: горка, разгон и полёт */
export function blocks (x, z, r = 0) {
  const L = r <= CR ? CGRID.get(cck(Math.floor(x / CC), Math.floor(z / CC))) : CLAIMS;
  if (!L) return false;
  for (let i = 0; i < L.length; i++) {
    const c = L[i];
    if (x < c.x0 - r || x > c.x1 + r || z < c.z0 - r || z > c.z1 + r) continue;
    const dx = x - c.cx, dz = z - c.cz, u = dx * c.ux + dz * c.uz, v = -dx * c.uz + dz * c.ux;
    if (Math.abs(u) < c.hl + r && Math.abs(v) < c.hw + r) return true;
  }
  return false;
}

/* A: groundH, inHouse, SOLIDS, busy(x,z,r) — чужое (дворы, карманы, корты…), smashNear(x,z,r), nearestRoad,
   onPave, inBounds, inPoly, CITY, pizzerias(), RAMPS, addRamp, obb, LITM, LIT, box */
export function* build (A) {
  const t0 = performance.now();
  let ms = 0, tS = t0;
  const why = STATS.why, no = k => { why[k] = (why[k] || 0) + 1; return false; };
  // препятствия — своей сеткой: общая (indexSolids) собирается только после всего города
  const SG = new Map(), SC = 20;
  for (const s of A.SOLIDS) {
    if (s.deckY !== undefined) continue;
    for (let i = Math.floor((s.cx - s.ex) / SC); i <= Math.floor((s.cx + s.ex) / SC); i++)
      for (let j = Math.floor((s.cz - s.ez) / SC); j <= Math.floor((s.cz + s.ez) / SC); j++) { const k = i * 8191 + j; let a = SG.get(k); if (!a) SG.set(k, a = []); a.push(s); }
  }
  const solidAt = (x, z, r) => {
    for (const s of SG.get(Math.floor(x / SC) * 8191 + Math.floor(z / SC)) || []) {
      const dx = x - s.cx, dz = z - s.cz, lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
      if (Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r) return true;
    }
    return false;
  };
  ms += performance.now() - tS; yield 'solids'; tS = performance.now();
  // парковки — сеткой
  const LOT = new Map(), LC = 60;
  for (const l of A.CITY.lots || []) {
    if (l.k !== 'park') continue;                     // парковки; стройки и пустыри — можно (куча песка у стройки)
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of l.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const b = { p: l.p, x0, x1, z0, z1 };
    for (let i = Math.floor(x0 / LC); i <= Math.floor(x1 / LC); i++) for (let j = Math.floor(z0 / LC); j <= Math.floor(z1 / LC); j++) {
      const k = i * 8191 + j; let a = LOT.get(k); if (!a) LOT.set(k, a = []); a.push(b);
    }
  }
  const inLot = (x, z) => { for (const b of LOT.get(Math.floor(x / LC) * 8191 + Math.floor(z / LC)) || []) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && A.inPoly(x, z, b.p)) return true; return false; };
  const ENT = new Map(), EC = 30;
  for (const e of A.CITY.entrances || []) { const k = Math.floor(e[0] / EC) * 8191 + Math.floor(e[1] / EC); let a = ENT.get(k); if (!a) ENT.set(k, a = []); a.push(e); }
  const nearEnt = (x, z, r) => {
    for (let i = Math.floor((x - r) / EC); i <= Math.floor((x + r) / EC); i++) for (let j = Math.floor((z - r) / EC); j <= Math.floor((z + r) / EC); j++)
      for (const e of ENT.get(i * 8191 + j) || []) if (Math.abs(e[0] - x) < r && Math.abs(e[1] - z) < r) return true;
    return false;
  };
  const pzs = (A.pizzerias() || []).filter(Boolean);
  const onStreet = (x, z, m) => { const r = A.nearestRoad(x, z, 5, 1); return !!r && r.d < r.seg.w / 2 + m; };
  const onAnyRoad = (x, z) => { const r = A.nearestRoad(x, z, 7, 1); return !!r && r.d < r.seg.w / 2; };
  const onAsphalt = (x, z, m) => { const r = A.nearestRoad(x, z, 7, 1); return !!r && r.seg.c !== 6 && r.d < r.seg.w / 2 + m; };   // проезд во двор, к гаражам — тоже асфальт (не пешеходка)

  /* горка с верхом в T, смотрит по (dx, dz): годится ли */
  const fits = (k, Tx, Tz, dx, dz, g, base) => {
    const vx = -dz, vz = dx, L = k.L, W = k.W + k.side * 2;
    // сама горка
    for (let u = 0; u <= L + 1.5; u += 1.5) for (let v = -W / 2; v <= W / 2 + 0.01; v += W / 4) {
      const x = Tx - dx * (u - 1) + vx * v, z = Tz - dz * (u - 1) + vz * v;
      if (!A.inBounds(x, z, 30)) return no('bounds');
      const gh = A.groundH(x, z);
      if (gh < 0.5) return no('water');
      if (Math.abs(gh - base) > 0.8) return no('slope');
      if (A.inHouse(x, z, 1)) return no('house');
      if (solidAt(x, z, 0.8) || A.busy(x, z, 0.8)) return no('solid');
      if (A.smashNear(x, z, 0.6)) return no('smash');
      if (onStreet(x, z, 1)) return no('street');
      if (onAsphalt(x, z, 0.4)) return no('asphalt');
      if (A.onPave(x, z, 0.2)) return no('pave');
      if (inLot(x, z)) return no('lot');
    }
    const cx = Tx - dx * L / 2, cz = Tz - dz * L / 2;
    if (nearEnt(cx, cz, 12 + L / 2)) return no('door');
    if (pzs.some(P => Math.hypot(P.x - cx, P.z - cz) < 60)) return no('pizza');
    if (A.RAMPS.some(r => Math.hypot(r.x - cx, r.z - cz) < (r.kind === 'small' ? 30 : JUMP.GAP))) return no('near');
    // полёт: от верха до стены дома — пусто
    for (let u = 0.5; u < g - 0.6; u += 1) for (const v of [-1.2, 0, 1.2]) {
      const x = Tx + dx * u + vx * v, z = Tz + dz * u + vz * v;
      if (A.inHouse(x, z, 0.4) || solidAt(x, z, 0.6) || A.busy(x, z, 0.4) || A.smashNear(x, z, 0.4)) return no('flight');
    }
    // разгон: прямо, без домов и препятствий, с дорогой
    let road = false;
    for (let u = L + 1.5; u < L + JUMP.RUN; u += 1.5) for (const v of [-1.4, 0, 1.4]) {
      const x = Tx - dx * u + vx * v, z = Tz - dz * u + vz * v;
      if (!A.inBounds(x, z, 10) || A.groundH(x, z) < 0.5) return no('runWater');
      if (Math.abs(A.groundH(x, z) - base) > 2.5) return no('runSlope');
      if (A.inHouse(x, z, 0.8) || solidAt(x, z, 0.7) || A.busy(x, z, 0.6)) return no('run');
      if (A.smashNear(x, z, 0.5)) return no('runSmash');               // столб, знак, лавочка на разгоне
      if (!road && v === 0 && onAnyRoad(x, z)) road = true;
    }
    if (!road) return no('noRoad');
    return true;
  };

  const cands = [];
  let n = 0;
  for (const r of ROOFS.LIST) {
    if (++n % 40 === 0) { ms += performance.now() - tS; yield 'jumps'; tS = performance.now(); }
    if (r.g || r.kind === 'other') continue;          // скатные — не цель (садиться можно, целиться — нет)
    STATS.roofs++;
    const f = r.f;
    const cxR = ((f.a0 + f.a1) / 2) * f.ux + ((f.b0 + f.b1) / 2) * f.nx, czR = ((f.a0 + f.a1) / 2) * f.uz + ((f.b0 + f.b1) / 2) * f.nz;
    for (const [dx, dz, half] of [[f.ux, f.uz, (f.a1 - f.a0) / 2], [-f.ux, -f.uz, (f.a1 - f.a0) / 2], [f.nx, f.nz, (f.b1 - f.b0) / 2], [-f.nx, -f.nz, (f.b1 - f.b0) / 2]]) {
      if (half * 2 < 12) continue;
      // край крыши по оси: от середины назад, пока под нами крыша
      let e = -half - 1;
      while (e < half && ROOFS.heightOf(r, cxR + dx * e, czR + dz * e) !== ROOFS.heightOf(r, cxR + dx * e, czR + dz * e)) e += 0.5;
      const Ex = cxR + dx * e, Ez = czR + dz * e;
      // сколько крыши вперёд (и по бокам ±1,4 м — машина шире точки)
      let cov = 0;
      while (cov < 80) {
        const x = Ex + dx * (cov + 0.5), z = Ez + dz * (cov + 0.5);
        const ok = [-1.4, 0, 1.4].every(v => ROOFS.heightOf(r, x - dz * v, z + dx * v) === r.top);
        if (!ok) break;
        cov += 0.5;
      }
      if (cov < 9) continue;
      const base0 = A.groundH(Ex - dx * 14, Ez - dz * 14);
      const kinds = r.top - base0 > 3.3 ? ['bridge', 'truck'] : ['sand', 'gravel', 'plates', 'truck'];
      for (const kn of kinds) {
        STATS.tried++;
        const k = KINDS[kn];
        // окно посадки на 70…90 км/ч при зазоре g: подбираем g так, чтобы 70 км/ч сели на 1,5 м за краем
        // зазор g — чтобы окно посадки 70…90 км/ч легло на крышу как можно ровнее посередине
        let land = null, best = -Infinity;
        for (let g = 3; g <= 16; g += 0.5) {
          const base = A.groundH(Ex - dx * (g + k.L / 2), Ez - dz * (g + k.L / 2));
          const fl = (r.kind === 'gar' ? JUMP.V : JUMP.V2).map(v => flight(k, v / 3.6, base, r.top, g));
          if (fl.some(q => !q || !q.clear)) continue;
          const m = Math.min(fl[0].x - g - 1.5, g + cov - 2 - fl[2].x);
          if (m < 0 || m <= best) continue;
          best = m; land = { g, base, x: fl.map(q => +(q.x - g).toFixed(1)) };
        }
        if (!land) { no('window'); continue; }
        const Tx = Ex - dx * land.g, Tz = Ez - dz * land.g;
        if (!fits(k, Tx, Tz, dx, dz, land.g, land.base)) continue;
        STATS.ok++; STATS.okRoof[r.kind] = (STATS.okRoof[r.kind] || 0) + 1;
        cands.push({ r, kn, k, Tx, Tz, dx, dz, g: land.g, base: land.base, land: land.x, s: Math.random() + (kn === 'bridge' || kn === 'truck' ? 0.25 : 0) + (r.kind !== 'gar' ? 0.8 : 0) });   // не только гаражи: магазины и одноэтажки — вперёд
      }
    }
  }
  ms += performance.now() - tS; yield 'pick'; tS = performance.now();
  // выбор: вразброс, разные виды
  cands.sort((a, b) => b.s - a.s);
  const used = {};
  for (const c of cands) {
    if (LIST.length >= JUMP.MAX) break;
    const cx = c.Tx - c.dx * c.k.L / 2, cz = c.Tz - c.dz * c.k.L / 2;
    if (LIST.some(q => Math.hypot(q.x - cx, q.z - cz) < JUMP.GAP)) continue;
    if (LIST.some(q => q.roof === c.r)) continue;
    if ((used[c.kn] || 0) > JUMP.MAX / 3) continue;
    if (CLAIMS.length && blocks(cx, cz, 2)) continue;
    used[c.kn] = (used[c.kn] || 0) + 1;
    const ramp = A.addRamp(cx, cz, c.dx, c.dz, { L: c.k.L, W: c.k.W, H: c.k.H, kind: c.kn, sides: true, sideOut: c.k.side });
    ramp.roof = c.r; ramp.gap = c.g; ramp.land = c.land; ramp.top = +(c.r.top - c.base).toFixed(2);
    LIST.push(ramp);
    claim(cx, cz, c.dx, c.dz, c.k.L / 2 + 1.5, c.k.W / 2 + c.k.side + 1.2);                          // горка
    claim(c.Tx - c.dx * (c.k.L + JUMP.RUN / 2), c.Tz - c.dz * (c.k.L + JUMP.RUN / 2), c.dx, c.dz, JUMP.RUN / 2, 2.2);   // разгон
    claim(c.Tx + c.dx * c.g / 2, c.Tz + c.dz * c.g / 2, c.dx, c.dz, c.g / 2, 2);                            // полёт
    look(A, ramp, c.k);
    STATS.byKind[c.kn] = (STATS.byKind[c.kn] || 0) + 1;
  }
  STATS.placed = LIST.length;
  STATS.ms = Math.round(ms + performance.now() - tS);
}

/* ── вид ── всё в склейку статики (LITM, LIT) */
function look (A, r, k) {
  const M = A.LITM, { x, z, ux, uz, y, L, W, H } = r, vx = -uz, vz = ux;
  const P = (u, v, h) => [x + ux * u + vx * v, y + h, z + uz * u + vz * v];
  const Q = (a, b, c, d, hex) => { M.color(hex); M.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], 0, 1, 0); };
  const T = (a, b, c, hex) => { M.color(hex); M.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
  const hAt = u => H * (u + L / 2) / L;
  const ry = Math.atan2(-uz, ux);                    // box: ширина — вдоль ската
  const bx = (w, h, d, hex, u, v, y0) => { const p = P(u, v, y0 + h / 2); A.box(A.LIT, w, h, d, hex, p[0], p[1], p[2], ry); };
  const n = Math.round(L / 1.5), du = L / n;
  if (r.kind === 'sand' || r.kind === 'gravel') {
    const C = r.kind === 'sand' ? ['#d2b47c', '#c7a86f', '#bb9c63', '#a88b55'] : ['#8f8a84', '#858079', '#7a756e', '#6b665f'];
    const S = k.side;
    for (let i = 0; i < n; i++) {
      const u0 = -L / 2 + i * du, u1 = u0 + du, h0 = hAt(u0) + 0.03, h1 = hAt(u1) + 0.03;
      Q(P(u0, -W / 2, h0), P(u1, -W / 2, h1), P(u1, W / 2, h1), P(u0, W / 2, h0), C[i % 2]);
      for (const sd of [-1, 1]) Q(P(u0, sd * W / 2, h0), P(u1, sd * W / 2, h1), P(u1 + 0.3, sd * (W / 2 + S + h1 * 0.25), 0), P(u0 + 0.3, sd * (W / 2 + S + h0 * 0.25), 0), C[2 + (i % 2)]);
    }
    // верх и задний склон
    Q(P(L / 2, -W / 2, H + 0.03), P(L / 2, W / 2, H + 0.03), P(L / 2 + 1.4, W / 2 + S, 0), P(L / 2 + 1.4, -W / 2 - S, 0), C[2]);
    for (const sd of [-1, 1]) T(P(L / 2, sd * W / 2, H + 0.03), P(L / 2 + 1.4, sd * (W / 2 + S), 0), P(L / 2 + 0.3, sd * (W / 2 + S + H * 0.25), 0), C[3]);
    // камни и колея
    for (let i = 0; i < 7; i++) { const u = -L / 2 + 1 + (i * 37 % 10) / 10 * (L - 2), v = (i % 2 ? 1 : -1) * (W / 2 + 0.4 + (i % 3) * 0.3); bx(0.5, 0.35, 0.45, C[3], u, v, hAt(u) * 0.55); }
    for (const v of [-0.85, 0.85]) Q(P(-L / 2, v - 0.22, 0.06), P(L / 2, v - 0.22, H + 0.06), P(L / 2, v + 0.22, H + 0.06), P(-L / 2, v + 0.22, 0.06), C[3]);
    // знак стройки у подножия
    bx(0.1, 1.6, 0.1, '#5b5f66', -L / 2 - 1, W / 2 + S + 1, 0);
    bx(0.08, 0.7, 0.9, '#f2c230', -L / 2 - 1, W / 2 + S + 1, 1.3);
  } else if (r.kind === 'plates') {
    const sl = 6, th = H / sl;
    for (let i = 0; i < n; i++) {
      const u0 = -L / 2 + i * du, u1 = u0 + du, h0 = hAt(u0) + 0.03, h1 = hAt(u1) + 0.03;
      Q(P(u0, -W / 2, h0), P(u1, -W / 2, h1), P(u1, W / 2, h1), P(u0, W / 2, h0), i % 3 === 2 ? '#8d8880' : '#a8a49c');
    }
    // бока — плиты слоями (видно торцы), каждая чуть торчит
    for (let s = 0; s < sl; s++) {
      const h0 = s * th, h1 = h0 + th, uA = -L / 2 + L * h1 / H, out = (s % 2) * 0.25;
      for (const sd of [-1, 1]) {
        Q(P(uA, sd * (W / 2 + out), h0), P(L / 2 + out, sd * (W / 2 + out), h0), P(L / 2 + out, sd * (W / 2 + out), h1), P(uA, sd * (W / 2 + out), h1), s % 2 ? '#9a958d' : '#8a857d');
        Q(P(uA, sd * (W / 2 + out), h1 - 0.04), P(L / 2 + out, sd * (W / 2 + out), h1 - 0.04), P(L / 2 + out, sd * (W / 2 + out), h1), P(uA, sd * (W / 2 + out), h1), '#5d5a55');
      }
      Q(P(L / 2 + out, -W / 2 - out, h0), P(L / 2 + out, W / 2 + out, h0), P(L / 2 + out, W / 2 + out, h1), P(L / 2 + out, -W / 2 - out, h1), s % 2 ? '#9a958d' : '#8a857d');
      for (const sd of [-1, 1]) T(P(-L / 2 + L * h0 / H, sd * (W / 2 + out), h0), P(uA, sd * (W / 2 + out), h0), P(uA, sd * (W / 2 + out), h1), '#8a857d');
    }
    // петли арматуры на верхней плите
    for (const v of [-W / 3, W / 3]) bx(0.08, 0.35, 0.5, '#6b4a3a', L / 2 - 0.5, v, H);
    // жёлто-чёрная полоса на въезде
    for (let i = 0; i < 6; i++) Q(P(-L / 2, -W / 2 + i * W / 6, 0.05), P(-L / 2 + 0.6, -W / 2 + i * W / 6, 0.05 + H * 0.06), P(-L / 2 + 0.6, -W / 2 + (i + 1) * W / 6, 0.05 + H * 0.06), P(-L / 2, -W / 2 + (i + 1) * W / 6, 0.05), i % 2 ? '#1f1d24' : '#f2c230');
  } else if (r.kind === 'truck') {
    // аппарель и верхняя палуба автовоза: две колеи из рифлёного железа, рама синяя
    for (let i = 0; i < n; i++) {
      const u0 = -L / 2 + i * du, u1 = u0 + du, h0 = hAt(u0) + 0.04, h1 = hAt(u1) + 0.04;
      Q(P(u0, -W / 2, h0 - 0.02), P(u1, -W / 2, h1 - 0.02), P(u1, W / 2, h1 - 0.02), P(u0, W / 2, h0 - 0.02), '#2b2d33');
      for (const v of [-0.95, 0.95]) Q(P(u0, v - 0.55, h0), P(u1, v - 0.55, h1), P(u1, v + 0.55, h1), P(u0, v + 0.55, h0), i % 2 ? '#8a939d' : '#9aa3ad');
    }
    for (const sd of [-1, 1]) {
      const v = sd * W / 2;
      Q(P(-L / 2, v, 0), P(L / 2, v, H - 0.6), P(L / 2, v, H + 0.25), P(-L / 2, v, 0.5), '#2f6db5');   // борт рамы
      T(P(-L / 2 + 2, v, 0), P(L / 2, v, 0), P(L / 2, v, H - 0.6), '#3b3e45');                          // под палубой — тень
      for (let i = 0; i < 4; i++) { const u = -L / 2 + 3 + i * 2.2; bx(0.6, 1.0, 0.45, '#16161a', u, v + sd * 0.1, 0); }   // колёса
      for (let i = 0; i <= 4; i++) { const u = -L / 2 + 1.5 + i * (L - 2) / 4; bx(0.12, 0.9, 0.12, '#2f6db5', u, v, hAt(u)); }   // стойки ограждения
    }
    // кабина впереди: ниже палубы — с разгона перелетаешь, шагом скатился — встаёшь на её крышу
    const cu = L / 2 + 1.5, cw = W - 0.2, ch = 2.9;
    bx(2.4, ch, cw, '#e8e2d6', cu, 0, 0.3);
    bx(0.08, 1.0, cw - 0.4, '#25313d', cu + 1.21, 0, 1.7);                        // лобовое
    bx(2.5, 0.25, cw + 0.1, '#c94a3a', cu, 0, 1.0);                               // полоса
    for (const sd of [-1, 1]) bx(0.9, 0.9, 0.4, '#16161a', cu + 0.3, sd * (cw / 2 - 0.1), 0);
    const c = P(cu, 0, 0), s = A.obb(c[0], c[2], 1.2, cw / 2, Math.atan2(uz, ux));
    s.topY = y + ch + 0.3;
    const pts = [P(cu - 1.2, -cw / 2, 0), P(cu + 1.2, -cw / 2, 0), P(cu + 1.2, cw / 2, 0), P(cu - 1.2, cw / 2, 0)].map(q => [q[0], q[2]]);
    ROOFS.add(pts, y + ch + 0.3, { kind: 'other', force: true });
  } else if (r.kind === 'bridge') {
    // обломанная эстакада: насыпь под низом, дальше — плита на опорах, конец оборван, торчит арматура
    const dk = 0.7;
    for (let i = 0; i < n; i++) {
      const u0 = -L / 2 + i * du, u1 = u0 + du, h0 = hAt(u0) + 0.04, h1 = hAt(u1) + 0.04;
      Q(P(u0, -W / 2, h0), P(u1, -W / 2, h1), P(u1, W / 2, h1), P(u0, W / 2, h0), '#55535b');
      if (i % 2 === 0) Q(P(u0, -0.08, h0 + 0.01), P(u1, -0.08, h1 + 0.01), P(u1, 0.08, h1 + 0.01), P(u0, 0.08, h0 + 0.01), '#e8e4da');
      for (const v of [-W / 2 + 0.35, W / 2 - 0.35]) Q(P(u0, v - 0.06, h0 + 0.01), P(u1, v - 0.06, h1 + 0.01), P(u1, v + 0.06, h1 + 0.01), P(u0, v + 0.06, h0 + 0.01), '#e3c13a');
    }
    const uE = -L / 2 + L * 0.4;                                                  // где кончается насыпь
    for (const sd of [-1, 1]) {
      const v = sd * W / 2;
      T(P(-L / 2, v, 0), P(uE, v, 0), P(uE, v, hAt(uE)), '#8c7a5e');                                   // насыпь
      Q(P(uE, v, hAt(uE) - dk), P(L / 2, v, H - dk), P(L / 2, v, H + 0.04), P(uE, v, hAt(uE) + 0.04), '#a8a399');   // торец плиты
      // парапет: столбики и перила
      for (let i = 0; i <= 6; i++) { const u = -L / 2 + 0.5 + i * (L - 1) / 6; bx(0.15, 0.9, 0.15, '#b7b2a8', u, v - sd * 0.1, hAt(u)); }
      Q(P(-L / 2 + 0.5, v - sd * 0.1, hAt(-L / 2 + 0.5) + 0.8), P(L / 2 - 0.5, v - sd * 0.1, hAt(L / 2 - 0.5) + 0.8), P(L / 2 - 0.5, v - sd * 0.1, hAt(L / 2 - 0.5) + 0.95), P(-L / 2 + 0.5, v - sd * 0.1, hAt(-L / 2 + 0.5) + 0.95), '#c9c4ba');
    }
    // под плитой — тень и опоры
    Q(P(uE, -W / 2, hAt(uE) - dk), P(L / 2, -W / 2, H - dk), P(L / 2, W / 2, H - dk), P(uE, W / 2, hAt(uE) - dk), '#3d3b40');
    Q(P(uE, -W / 2, 0), P(uE, W / 2, 0), P(uE, W / 2, hAt(uE) - dk), P(uE, -W / 2, hAt(uE) - dk), '#4a4650');
    for (const v of [-W / 3, W / 3]) bx(0.9, H - dk, 0.9, '#a39e95', L / 2 - 1.6, v, 0);
    // оборванный торец и арматура
    Q(P(L / 2, -W / 2, H - dk), P(L / 2, W / 2, H - dk), P(L / 2, W / 2, H + 0.04), P(L / 2, -W / 2, H + 0.04), '#8e897f');
    for (let i = 0; i < 7; i++) { const v = -W / 2 + 0.5 + i * (W - 1) / 6; bx(0.9 + (i % 3) * 0.3, 0.06, 0.06, '#5a3b2c', L / 2 + 0.4, v, H - 0.3 - (i % 2) * 0.25); }
    // знак «проезд закрыт» у въезда — сбоку
    bx(0.1, 1.5, 0.1, '#5b5f66', -L / 2 - 0.5, W / 2 + 1, 0);
    bx(0.08, 0.8, 0.8, '#d13b2e', -L / 2 - 0.5, W / 2 + 1, 1.2);
  }
}

/* ── села на крышу ── A: { ach(stat), canSay(), say(text) } */
const ROOF_LINES = /*i18n*/ [
  N_('ты чё на крыше делаешь?? клиент внизу, а не у голубей'),
  N_('мне пишут, что наша машина на крыше. скажи, что это не ты'),
  N_('Карлсон, блин. слезай с крыши, пицца стынет'),
];
export function landed (A) {
  STATS.landings++;
  A.ach('roof');
  if (!SAID && A.canSay()) { SAID = true; A.say(t(ROOF_LINES[Math.floor(Math.random() * ROOF_LINES.length)])); }
}
export function reset () { SAID = false; }

export const DEBUG = { JUMP, KINDS, LIST, STATS, CLAIMS, blocks, flight };
