/* ──────────────────────────────────────────────────────────────────────────
   Неровный газон (04.10.2026, трек «Наполнение мира», шаг 1).

   Земля — сетка высот с шагом TG (в Солнечном 16 м), каждая клетка — два
   плоских треугольника; по ним же считается groundH, по ним режется всё
   плоское (газоны, дорожки), на groundH ставятся деревья, лавки, люди и
   колёса машины. Поэтому рельеф — это просто добавка к высотам узлов сетки
   до того, как город начнут строить: всё остальное само ляжет на него.

   • Бугры 0,1—0,4 м — каждый узел чуть выше или ниже (шаг сетки — 16 м,
     так что бугор — это пологая волна шириной 30—50 м). Местами газон
     ровный: амплитуда — пятнами по ~160 м, где-то ноль.
   • Холмики 1—2,5 м, радиус 40—70 м — только на больших свободных газонах
     и пустырях (до ближайшей помехи не меньше HILL_CLEAR клеток), не ближе
     HILL_GAP м друг к другу.
   • Нигде рядом с тем, что должно быть ровным: дороги с тротуарами, проезды,
     дорожки, дома, участки из карты (промзоны, площадки, гаражи, ТЦ),
     площадки и спортполя, кладбища, вода, рельсы, ручьи, ограда города,
     подъезды (там пины заказов), остановки, вывески, КПП, ворота,
     пиццерии и гаражи карьеры. Узел «занят», если хоть один треугольник
     вокруг него задевает помеху (+ запас MARGIN), — у занятых узлов добавка
     ноль, значит треугольники под помехой не меняются вовсе. От занятых
     узлов добавка плавно растёт за FADE клеток.
   • Стройки, точки конкурентов и лагеря (construction.js freeLots) не
     встают туда, где добавка больше FLAT_OK.
   Детерминированно: всё — хэш от номера узла, каждый запуск одинаково.
   ?norelief — без рельефа (сравнить).
   ────────────────────────────────────────────────────────────────────────── */

export const RELIEF = {
  BUMP: [0.1, 0.4],      // бугры, м
  HILL: [1.0, 2.5],      // холмики, м
  HILL_R: [40, 70],      // радиус холмика, м
  HILL_CLEAR: 4.5,       // свободных клеток вокруг центра холмика
  HILL_GAP: 260,         // м между холмиками
  HILL_P: 0.4,           // доля подходящих мест, где холмик есть
  MARGIN: 3,             // м запаса вокруг помех
  FADE: [0.8, 2.6],      // клеток: от занятого узла добавка растёт от нуля до полной
  FLAT_OK: 0.12,         // м: стройке и точке — не больше
};

let OFF = null, G = null;
export const STATS = { on: false, ms: 0, blocked: 0, bumped: 0, hills: [], maxOff: 0 };

const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function vnoise (x, z, s) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/* TH — высоты узлов (меняются на месте), TER — {g, nx, nz, x0, z0},
   o: { roadHW(r) — полуширина дороги с тротуаром, spots — [[x, z, r]] свои помехи } */
export function addRelief (CITY, TH, TER, o = {}) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('norelief')) return STATS;
  const t0 = performance.now();
  const TG = TER.g, NX = TER.nx, NZ = TER.nz, X0 = TER.x0, Z0 = TER.z0, N = NX * NZ;
  G = { TG, NX, NZ, X0, Z0 };
  const B = new Uint8Array(N);
  const reach = TG * 1.415 + RELIEF.MARGIN;
  const ci = x => Math.round((x - X0) / TG), cj = z => Math.round((z - Z0) / TG);
  const box = (x0, z0, x1, z1) => {
    const i0 = Math.max(0, Math.floor((x0 - X0) / TG)), i1 = Math.min(NX - 1, Math.ceil((x1 - X0) / TG));
    const j0 = Math.max(0, Math.floor((z0 - Z0) / TG)), j1 = Math.min(NZ - 1, Math.ceil((z1 - Z0) / TG));
    for (let j = j0; j <= j1; j++) B.fill(1, j * NX + i0, j * NX + i1 + 1);
  };
  const seg = (ax, az, bx, bz, hw) => {
    const r = hw + reach, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - X0) / TG)), i1 = Math.min(NX - 1, Math.ceil((Math.max(ax, bx) + r - X0) / TG));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - Z0) / TG)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(az, bz) + r - Z0) / TG));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = X0 + i * TG, pz = Z0 + j * TG;
      let t = ((px - ax) * dx + (pz - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - ax - dx * t, ez = pz - az - dz * t;
      if (ex * ex + ez * ez <= r * r) B[j * NX + i] = 1;
    }
  };
  const line = (p, hw) => { for (let k = 1; k < p.length; k++) seg(p[k - 1][0], p[k - 1][1], p[k][0], p[k][1], hw); };
  const poly = p => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
    box(x0 - reach, z0 - reach, x1 + reach, z1 + reach);
  };
  const pt = (x, z, r) => seg(x, z, x, z, r);
  const roadHW = o.roadHW || (r => (r.w || 9) / 2 + 2.5);

  for (const r of CITY.roads || []) line(r.p, roadHW(r));
  for (const q of CITY.paths || []) line(q, 1.2);
  for (const b of CITY.buildings || []) poly(b.p);
  for (const l of CITY.lots || []) if (l.k !== 'park') poly(l.p);
  for (const p of CITY.garlots || []) poly(p);
  for (const m of CITY.malls || []) poly(m.p);
  for (const g of CITY.green || []) if (g.k !== 'park' && g.k !== 'green') poly(g.p);
  for (const r of CITY.rails || []) line(r.p, 4);
  for (const s of CITY.streams || []) line(s.p, (s.w || 6) / 2 + 3);
  for (const f of CITY.fence || []) line(f, 3);
  if (CITY.border && CITY.border.length > 2) line([...CITY.border, CITY.border[0]], 3);
  for (const e of CITY.entrances || []) pt(e[0], e[1], 10);
  for (const p of CITY.pois || []) { pt(p.p[0], p.p[1], 8); if (p.w) pt(p.w[0], p.w[1], 6); }
  for (const s of CITY.stops || []) pt(s.p[0], s.p[1], 6);
  for (const k of CITY.kpp || []) pt(k.p[0], k.p[1], 15);
  for (const g of CITY.gates || []) pt(g[0], g[1], 8);
  for (const c of CITY.crossings || []) pt(c[0], c[1], 6);
  for (const c of CITY.levelx || []) pt(c[0], c[1], 10);
  for (const c of CITY.closed || []) pt(c[0], c[1], 10);
  for (const s of CITY.stations || []) pt(s.p[0], s.p[1], 40);
  for (const w of CITY.worship || []) if (w.p) { if (Array.isArray(w.p[0])) poly(w.p); else pt(w.p[0], w.p[1], 30); }
  for (const s of o.spots || []) pt(s[0], s[1], s[2]);
  // вода и берег: узел низко — занят
  for (let k = 0; k < N; k++) if (TH[k] < 1.2) B[k] = 1;
  // за оградой города (если есть) — не трогаем
  if (CITY.border && CITY.border.length > 2) {
    const P = CITY.border;
    for (let j = 0; j < NZ; j++) {
      const z = Z0 + j * TG, xs = [];
      for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
        const za = P[a][1], zb = P[b][1];
        if ((za > z) !== (zb > z)) xs.push(P[a][0] + (z - za) / (zb - za) * (P[b][0] - P[a][0]));
      }
      xs.sort((u, v) => u - v);
      let i = 0;
      for (let q = 0; q <= xs.length; q++) {
        const end = q < xs.length ? Math.min(NX, Math.max(0, Math.ceil((xs[q] - X0) / TG))) : NX;
        if (q % 2 === 0) B.fill(1, j * NX + i, j * NX + Math.max(i, end));
        i = Math.max(i, end);
      }
    }
  }
  // края сетки — заняты
  for (let i = 0; i < NX; i++) { B[i] = 1; B[(NZ - 1) * NX + i] = 1; }
  for (let j = 0; j < NZ; j++) { B[j * NX] = 1; B[j * NX + NX - 1] = 1; }

  // расстояние до занятого узла, в клетках (фаска 1 / 1,41, два прохода)
  const D = new Float32Array(N);
  for (let k = 0; k < N; k++) D[k] = B[k] ? 0 : 1e9;
  const S2 = Math.SQRT2;
  for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const k = j * NX + i; if (!D[k]) continue;
    D[k] = Math.min(D[k], D[k - 1] + 1, D[k - NX] + 1, D[k - NX - 1] + S2, D[k - NX + 1] + S2);
  }
  for (let j = NZ - 2; j > 0; j--) for (let i = NX - 2; i > 0; i--) {
    const k = j * NX + i; if (!D[k]) continue;
    D[k] = Math.min(D[k], D[k + 1] + 1, D[k + NX] + 1, D[k + NX + 1] + S2, D[k + NX - 1] + S2);
  }

  OFF = new Float32Array(N);
  const [b0, b1] = RELIEF.BUMP, [f0, f1] = RELIEF.FADE;
  let blocked = 0, bumped = 0;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i;
    if (B[k]) { blocked++; continue; }
    const fade = sm(f0, f1, D[k]);
    const nl = vnoise(i / 10, j / 10, 7);                       // где бугристо, где ровно — пятнами ~160 м
    const amp = nl < 0.32 ? 0 : nl < 0.38 ? b0 * (nl - 0.32) / 0.06 : b0 + (b1 - b0) * sm(0.38, 0.85, nl);
    if (!amp) continue;
    const w = (vnoise(i / 2.2, j / 2.2, 11) - 0.5) * 2 * 0.7 + (hash(i, j, 13) - 0.5) * 2 * 0.3;
    OFF[k] = amp * w * fade;
    if (OFF[k]) bumped++;
  }
  // холмики: центры — узлы с большим запасом до помех
  const hills = [], cand = [];
  for (let k = 0; k < N; k++) if (D[k] >= RELIEF.HILL_CLEAR && D[k] < 1e8) cand.push(k);
  cand.sort((a, b) => hash(a % NX, (a / NX) | 0, 17) - hash(b % NX, (b / NX) | 0, 17));
  for (const k of cand) {
    const i = k % NX, j = (k / NX) | 0;
    if (hash(i, j, 19) > RELIEF.HILL_P) continue;
    const x = X0 + i * TG, z = Z0 + j * TG;
    if (hills.some(h => Math.hypot(h.x - x, h.z - z) < RELIEF.HILL_GAP)) continue;
    const R = Math.min((D[k] - 1.6) * TG, RELIEF.HILL_R[0] + (RELIEF.HILL_R[1] - RELIEF.HILL_R[0]) * hash(i, j, 23));
    if (R < RELIEF.HILL_R[0] * 0.9) continue;
    const H = RELIEF.HILL[0] + (RELIEF.HILL[1] - RELIEF.HILL[0]) * hash(i, j, 29);
    hills.push({ x, z, r: Math.round(R), h: +H.toFixed(2) });
    const n = Math.ceil(R / TG);
    for (let b = -n; b <= n; b++) for (let a = -n; a <= n; a++) {
      const ii = i + a, jj = j + b; if (ii < 1 || jj < 1 || ii >= NX - 1 || jj >= NZ - 1) continue;
      const kk = jj * NX + ii; if (B[kk]) continue;
      const r = Math.hypot(a, b) * TG / R; if (r >= 1) continue;
      const c = Math.cos(r * Math.PI / 2);
      OFF[kk] += H * c * c * sm(f0, f1, D[kk]);
    }
  }
  let mx = 0;
  for (let k = 0; k < N; k++) if (OFF[k]) { TH[k] += OFF[k]; if (Math.abs(OFF[k]) > mx) mx = Math.abs(OFF[k]); }
  Object.assign(STATS, { on: true, ms: Math.round(performance.now() - t0), blocked, bumped, hills, maxOff: +mx.toFixed(2) });
  return STATS;
}

/* добавка рельефа в точке — той же интерполяцией, что groundH (0 — ровно, как в карте) */
export function reliefAt (x, z) {
  if (!OFF) return 0;
  const { TG, NX, NZ, X0, Z0 } = G;
  const u = (x - X0) / TG, v = (z - Z0) / TG;
  let i = Math.floor(u), j = Math.floor(v);
  if (i < 0) i = 0; else if (i > NX - 2) i = NX - 2;
  if (j < 0) j = 0; else if (j > NZ - 2) j = NZ - 2;
  const fu = u - i, fv = v - j, k = j * NX + i;
  if (fu + fv <= 1) return OFF[k] + (OFF[k + 1] - OFF[k]) * fu + (OFF[k + NX] - OFF[k]) * fv;
  const h11 = OFF[k + NX + 1];
  return h11 + (OFF[k + NX] - h11) * (1 - fu) + (OFF[k + 1] - h11) * (1 - fv);
}
