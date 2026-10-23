/* ──────────────────────────────────────────────────────────────────────────
   Бандитский район изнутри (12бе, автор 24.10.2026: «зона бандитов должна быть гораздо больше и должна
   сильнее напрягать игрока»). Правила словами — docs/CAREER.md «Бандитские районы: въехал — напрягись».
   Сами кварталы района — zones.js (inGang / inMask / gangMask), мзда у адреса — world.js, гопники
   прессуют прохожего — thugs.js. Только в карьере.

   Стройка (build — из world.js build, кусок 'world' поздней сборки, с зерном; всё тут — жребий по месту):
     • граффити на стенах домов района (GL.TAG_P стен, не больше GL.TAGS на район) — атлас 512×256, одна
       склейка — одна отрисовка на район; на въездах (улица пересекает край района) — крупно «РАЙОН ПОД НАМИ»
       на ближней к улице стене внутри (не чаще GL.ENTRY_GAP м);
     • сгоревшие машины на кирпичах у дворовых проездов (GL.WRECKS на район) — в склейку реквизита LIT,
       твёрдые (obb), под ними — пятно копоти;
     • мусор у подъездов (junk.js LITTER.GANG) и кучи у домов (world.js TRASH_GANG) — гуще, чем в городе.
   Кадр (step — из world.js step):
     • въехал — картинка темнее и грязнее: бурая виньетка поверх кадра (GL.DIM), плавно за GL.FADE с;
       звук — птицы смолкают, город тише, ветер сильнее, собаки лают и днём (ambience.js mood);
       первый въезд — всплывашка «бандитский район» (не чаще GL.TOAST_CD с);
     • у подъездов — стаи гопников (GL.FLOCK_N человек в спортивках, до GL.FLOCK_MAX стай рядом): стоят,
       поворачиваются за машиной ближе GL.LOOK_R, иногда кидают бутылку (GL.BOTTLE_*: попала — ½ сердца, не
       больше GL.BOTTLE_MAX раз за смену; только взрослая), стоишь рядом медленно — 1—2 идут к машине (GL.WALK_*),
       стучат по кузову и бурчат; уехал — возвращаются. Сбить — по общим правилам (быстрее 20 км/ч — сбит);
     • мопед-«хвост» (GL.TAIL_*): на въезде иногда сзади пристраивается мопед с гопником, держится в
       GL.TAIL_GAP м по твоему же следу, смотрит; выехал из района или прошло GL.TAIL_T — отстаёт и уезжает.
   Переменных игры модуль не видит — всё приходит в api (worldApi в game.js). Отладка: __dlv.GANGL.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import * as ZN from './zones.js';
import * as AMBI from './ambience.js';
import { holdFixed } from './people.js';
import { TIER } from './hits.js';
import { bodyGeo as mopedBody } from './mopeds.js';
import { ON as MOBILE, freeAfterUpload } from './mobile.js';
import * as WARM from './warmup.js';             // прогрев шейдеров при загрузке: граффити и бутылка — не посреди смены

export const GL = {
  // вид
  DIM: 0.9,                 // сила виньетки в глубине района (0…1): середина кадра темнее на ~¼, края — на ~¾
  FADE: 1.4,                // с — постоянная въезда / выезда
  TOAST_CD: 120,            // с — «бандитский район» не чаще
  // граффити и сгоревшие машины (на район)
  TAG_P: 0.13, TAG_END: 0.55, TAGS: 110, ENTRY_GAP: 120, ENTRY_R: 45,   // доля стен с меткой (торцов — больше), меток на район
  WRECK_STEP: 26, WRECK_P: 0.28, WRECKS: 18,
  // стаи у подъездов
  FLOCK_N: [3, 4], FLOCK_MAX: 2, FLOCK_R: [40, 100], FLOCK_FAR: 130, FLOCK_EVERY: [3, 7],
  LOOK_R: 50,
  BOTTLE_R: [9, 30], BOTTLE_P: 0.4, BOTTLE_T: [0.75, 1.0], BOTTLE_MISS: 1.3, BOTTLE_MAX: 2,
  WALK_R: 26, WALK_V: 2.6, WALK_T: 1.3, WALK_STAY: 9,
  // хвост
  TAIL_P: 0.45, TAIL_AFTER: [5, 12], TAIL_GAP: 15, TAIL_T: [30, 50], TAIL_V: 21, TAIL_CD: 60,
};
if (MOBILE) Object.assign(GL, { FLOCK_N: [2, 3], TAGS: 70, WRECKS: 8 });   // телефон: память и кадр

export const WRECK_AT = [];                      // сгоревшие машины: где (отладка, кадры)
export const ENTRIES = [];                       // надписи на въездах: где улица вошла в район и где стена (отладка, кадры)
export const ST = { tags: 0, entries: 0, wrecks: 0, flocks: 0, men: 0, bottles: 0, hits: 0, walks: 0, tails: 0, ko: 0, buildMs: 0, k: 0, inside: false, ms: 0, maxMs: 0 };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

const TRACK = ['#1d2a66', '#1b1b20', '#2a2d36', '#16305a', '#3a3a42', '#5a1d22'];
const L_LOOK_ADULT = [N_('Слышь, курьер!'), N_('Ты чё тут забыл?'), N_('Это наш район!'), N_('Вали отсюда, пиццамен!'), N_('Чё вылупился?'), N_('Пиццу оставь, сам вали')];
const L_LOOK_KIDS = [N_('Эй, курьер!'), N_('Ты чё тут забыл?'), N_('Это наш район!'), N_('Езжай отсюда!'), N_('Чё смотришь?')];
const L_WALK_ADULT = [N_('Открывай, поговорим'), N_('Чё встал, а?'), N_('Пиццей угостишь?'), N_('Номер запомнил, понял?')];
const L_WALK_KIDS = [N_('Открывай, поговорим'), N_('Чё встал, а?'), N_('Пиццей угостишь?'), N_('Номер запомнил!')];
const L_TAIL = [N_('Куда едем, курьер?'), N_('Мы за тобой'), N_('Не спеши, братан')];

let A = null;

/* ═════════════════ стройка ═════════════════ */
const TILE = { entry: 0, stranger: 1, tag0: 2 };   // атлас 512×384: две строки во всю ширину (4 : 1), снизу 4 квадратных
let ATLAS = null;
function atlas () {
  if (ATLAS) return ATLAS;
  const W = 512, H = 384, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const spray = (text, cx, cy, w, h, fill, line) => {
    let fs = h * 0.62;
    x.font = '900 ' + fs + 'px Impact, "Arial Black", sans-serif';
    const tw = x.measureText(text).width;
    if (tw > w * 0.92) { fs *= w * 0.92 / tw; x.font = '900 ' + fs + 'px Impact, "Arial Black", sans-serif'; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(cx, cy); x.rotate(-0.05 + (text.length % 3) * 0.03);
    x.lineJoin = 'round'; x.lineWidth = fs * 0.2; x.strokeStyle = line; x.strokeText(text, 0, 0);
    x.fillStyle = fill; x.fillText(text, 0, 0);
    // подтёки краски
    x.fillStyle = fill;
    const mw = x.measureText(text).width;
    for (let i = 0; i < 7; i++) { const dx = (hash(i, text.length, 3) - 0.5) * mw * 0.9, dl = fs * (0.25 + hash(i, text.length, 4) * 0.5); x.fillRect(dx, fs * 0.3, Math.max(2, fs * 0.05), dl); }
    x.restore();
  };
  spray(t('РАЙОН ПОД НАМИ'), 256, 64, 500, 124, '#e0302a', '#151214');
  spray(t('ЧУЖИМ ТУТ НЕ РАДЫ'), 256, 192, 500, 124, '#f2f0e8', '#151214');
  const TAGS = [[t('НАШИ'), '#f2c12e'], [t('ПЛАТИ'), '#e0302a'], [t('ВАЛИ'), '#3fa0e0'], ['$$$', '#5fd068']];
  TAGS.forEach(([s, col], i) => spray(s, 64 + i * 128, 320, 124, 110, col, '#151214'));
  const tex = new THREE.CanvasTexture(c);
  freeAfterUpload(tex);                           // телефон: холст — вон после загрузки в видеокарту (mobile.js)
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return (ATLAS = { tex, mat });
}
/* uv тайла: строки во всю ширину — 0, 1 (сверху), квадратные — 2…5 (снизу); холст — сверху вниз, v — снизу вверх */
function uvOf (i) {
  if (i < 2) return [0, 1 - (i + 1) / 3, 1, 1 - i / 3];
  const k = i - 2;
  return [k * 0.25, 0, k * 0.25 + 0.25, 1 / 3];
}

/* стены домов района: [x1, z1, x2, z2, nx, nz, b] — наружу от середины дома */
function wallsOf (b) {
  const p = b.p, n = p.length;
  let cx = 0, cz = 0;
  for (const q of p) { cx += q[0] / n; cz += q[1] / n; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 4) continue;
    let nx = dz / L, nz = -dx / L;
    if (nx * ((a[0] + c[0]) / 2 - cx) + nz * ((a[1] + c[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    out.push({ x1: a[0], z1: a[1], x2: c[0], z2: c[1], L, nx, nz, mx: (a[0] + c[0]) / 2, mz: (a[1] + c[1]) / 2 });
  }
  // торец — короткая стена длинного дома: на ней обычно нет окон, надпись читается целиком
  const Lmax = out.reduce((m, w) => Math.max(m, w.L), 0);
  for (const w of out) w.end = w.L < 17 && Lmax > w.L * 2.2 ? 1 : 0;
  return out;
}

export function* build (api) {
  A = api;
  if (!A.CAREER || ZN.LOOK_OFF) return;
  const t0 = performance.now();
  const M = ZN.gangMask();
  if (!M.length) return;
  const P = [], UV = [], I = [];
  const quad = (w, i, s, along, y0, hh) => {     // w — стена, i — тайл, s — полуширина, along — смещение середины вдоль стены
    const tx = (w.x2 - w.x1) / w.L, tz = (w.z2 - w.z1) / w.L;
    const cx = w.mx + tx * along + w.nx * 0.07, cz = w.mz + tz * along + w.nz * 0.07;
    const rx = w.nz, rz = -w.nx;                    // вправо для того, кто смотрит на стену снаружи
    const g = A.groundH(cx, cz) + y0, v0 = P.length / 3;
    P.push(cx - rx * s, g, cz - rz * s, cx + rx * s, g, cz + rz * s, cx + rx * s, g + hh * 2, cz + rz * s, cx - rx * s, g + hh * 2, cz - rz * s);
    const [u0, vb, u1, vt] = uvOf(i);
    UV.push(u0, vb, u1, vb, u1, vt, u0, vt);
    I.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  };
  // дома района: сетка 50 м — для въездов
  const HG = new Map(), houses = [];
  for (const b of A.CITY.buildings) {
    if (!b.p || b.p.length < 3) continue;
    let cx = 0, cz = 0;
    for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
    if (!ZN.inMask(cx, cz)) continue;
    const ws = wallsOf(b).filter(w => ZN.inMask(w.mx + w.nx * 3, w.mz + w.nz * 3));
    if (!ws.length) continue;
    const h = { b, cx, cz, ws, used: 0 };
    houses.push(h);
    const k = Math.floor(cx / 50) + ',' + Math.floor(cz / 50);
    if (!HG.has(k)) HG.set(k, []);
    HG.get(k).push(h);
  }
  yield 'gtags';
  // въезды: улица пересекла край района — на ближней стене внутри «РАЙОН ПОД НАМИ»
  const entries = [];
  for (const r of A.CITY.roads) {
    if (!(r.c <= 5) || !r.p) continue;
    let prev = null;
    for (let k = 1; k < r.p.length; k++) {
      const [ax, az] = r.p[k - 1], [bx, bz] = r.p[k], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 6));
      for (let q = 0; q <= n; q++) {
        const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n, inside = ZN.inMask(x, z);
        if (prev !== null && inside !== prev) {
          // точка въезда — чуть внутри
          const dx = (bx - ax) / (L || 1), dz = (bz - az) / (L || 1), sg = inside ? 1 : -1;
          entries.push({ x: x + dx * sg * 12, z: z + dz * sg * 12, fx: dx * sg, fz: dz * sg });
        }
        prev = inside;
      }
    }
  }
  const placed = [];
  for (const e of entries) {
    if (placed.some(p => Math.hypot(p.x - e.x, p.z - e.z) < GL.ENTRY_GAP)) continue;
    let best = null, bs = 1e9;
    const ci = Math.floor(e.x / 50), cj = Math.floor(e.z / 50);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const h of HG.get(i + ',' + j) || []) for (const w of h.ws) {
      if (w.L < 6.5) continue;
      const vx = e.x - w.mx, vz = e.z - w.mz, d = Math.hypot(vx, vz);
      if (d > GL.ENTRY_R || d < 6) continue;
      const face = (vx * w.nx + vz * w.nz) / d;         // стена смотрит на улицу
      if (face < 0.35) continue;
      const toward = -(w.nx * e.fx + w.nz * e.fz);       // и навстречу въезжающему — лучше (видно из-за руля издалека)
      const s = d * (1.6 - face) - toward * 30 - w.end * 25;   // торец без окон — лучше всего
      if (s < bs) { bs = s; best = w; }
    }
    if (!best) continue;
    const s = Math.min(2.6, best.L / 2 - 0.5);
    quad(best, TILE.entry, s, 0, 0.15, s * 0.25);   // 4 : 1, до 5,2 × 1,3 м — у земли, под окнами первого этажа (они с ~1,4 м)
    placed.push(e); ST.entries++;
    ENTRIES.push({ x: e.x, z: e.z, fx: e.fx, fz: e.fz, wx: best.mx, wz: best.mz, nx: best.nx, nz: best.nz, toward: -(best.nx * e.fx + best.nz * e.fz), end: best.end });
  }
  yield 'gentry';
  // мелкие метки на стенах
  let nTag = 0;
  for (const h of houses) {
    for (const w of h.ws) {
      if (nTag >= GL.TAGS * M.length) break;
      const r = hash(w.mx, w.mz, 41);
      if (r > (w.end ? GL.TAG_END : GL.TAG_P) || w.L < 5) continue;
      const big = w.end ? hash(w.mx, w.mz, 42) < 0.6 : false;
      const i = big ? (hash(w.mx, w.mz, 43) < 0.5 ? TILE.entry : TILE.stranger) : TILE.tag0 + ((hash(w.mx, w.mz, 44) * 4) | 0);
      const s = big ? Math.min(2.4, w.L / 2 - 0.4) : 0.5 + hash(w.mx, w.mz, 45) * 0.25;
      const along = (hash(w.mx, w.mz, 46) - 0.5) * Math.max(0, w.L - s * 2 - 1);
      quad(w, i, s, along, 0.12 + hash(w.mx, w.mz, 47) * 0.2, big ? s * 0.25 : s * 0.75);   // всё — у земли, под окнами первого этажа; крупные — 4 : 1 на торцах
      nTag++;
    }
  }
  ST.tags = nTag;
  if (I.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, atlas().mat);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    const grp = new THREE.Group();               // своя группа: cull.js не заберёт меш в «статику» (docs/AGENTS.md)
    grp.name = 'gang-tags';
    grp.add(mesh);
    A.scene.add(grp);
  }
  yield 'gwalls';
  // сгоревшие машины у дворовых проездов
  const wr = [];
  const ents = A.CITY.entrances || [];
  for (const m of M) {
    let n = 0;
    for (const r of A.CITY.roads) {
      if (r.c !== 7 || !r.p || n >= GL.WRECKS) continue;
      for (let k = 1; k < r.p.length && n < GL.WRECKS; k++) {
        const [ax, az] = r.p[k - 1], [bx, bz] = r.p[k], L = Math.hypot(bx - ax, bz - az);
        if (L < 10) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        for (let q = GL.WRECK_STEP / 2; q < L - 4 && n < GL.WRECKS; q += GL.WRECK_STEP) {
          const x0 = ax + ux * q, z0 = az + uz * q;
          if (!ZN.cellV(m, x0, z0) || hash(x0, z0, 61) > GL.WRECK_P) continue;
          const sg = hash(x0, z0, 62) < 0.5 ? 1 : -1, off = (r.w || 5) / 2 + 1.45;
          const x = x0 - uz * sg * off, z = z0 + ux * sg * off;
          if (!A.inBounds(x, z, 6) || A.inHouse(x, z, 2.8)) continue;
          const nr = A.nearestRoad(x, z);
          if (nr && nr.d < (nr.seg.w || 6) / 2 + 1.0) continue;
          if (wr.some(o => Math.hypot(o[0] - x, o[1] - z) < 9)) continue;
          if (ents.some(e => Math.abs(e[0] - x) < 8 && Math.abs(e[1] - z) < 8)) continue;
          wreck(x, z, Math.atan2(ux, uz) + (hash(x, z, 63) - 0.5) * 0.4, hash(x, z, 64));
          wr.push([x, z]); WRECK_AT.push([Math.round(x), Math.round(z), Math.round(x0), Math.round(z0), +ux.toFixed(3), +uz.toFixed(3)]); n++;
        }
      }
    }
  }
  ST.wrecks = wr.length;
  ST.buildMs = Math.round(performance.now() - t0);
}
/* сгоревшая машина на кирпичах: чёрный кузов в ржавых пятнах, окон нет, иногда открыт капот; копоть на земле */
function wreck (x, z, ry, h) {
  const cs = Math.cos(ry), sn = Math.sin(ry), gy = A.groundH(x, z);
  const at = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  const B = (w, hh, d, hex, lx, y, lz, rx = 0) => {
    const [px, pz] = at(lx, lz), g = A.boxGeo(w, hh, d);
    if (rx) g.rotateX(rx);
    A.put(A.LIT, g, hex, px, gy + y, pz, 0, ry, 0);
  };
  const body = h < 0.7 ? '#26221f' : '#3a2c24', rust = '#5c3926', ash = '#151312';
  for (const [lx, lz] of [[-0.6, -1.3], [0.6, -1.3], [-0.6, 1.3], [0.6, 1.3]]) B(0.3, 0.32, 0.3, '#8a4a36', lx, 0.16, lz);   // кирпичи
  B(1.65, 0.6, 4.1, body, 0, 0.62, 0);
  B(1.46, 0.5, 2.0, body, 0, 1.17, -0.25);
  B(1.5, 0.32, 1.7, ash, 0, 1.2, -0.25);            // окон нет — чёрная дыра салона
  for (let i = 0; i < 4; i++) B(0.35 + hash(x, z, 70 + i) * 0.4, 0.06, 0.4 + hash(x, z, 74 + i) * 0.6, rust, (hash(x, z, 78 + i) - 0.5) * 1.3, 0.93, (hash(x, z, 82 + i) - 0.5) * 3.4);
  for (const s of [-1, 1]) for (const lz of [-1.3, 1.3]) B(0.04, 0.38, 0.72, ash, s * 0.83, 0.5, lz);   // пустые арки
  if (h < 0.45) B(1.5, 0.05, 1.1, body, 0, 1.42, 1.75, -0.9); else B(1.5, 0.04, 1.0, rust, 0, 0.94, 1.5);   // капот
  // копоть пятном
  if (A.LITM && A.LITM.dtri) {
    A.LITM.color('#2a2623');
    const n = 9, R = 2.6;
    let p0 = null, pp = null;
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, rr = R * (0.8 + hash(x, z, 90 + (i % n)) * 0.45);
      const q = [x + Math.cos(a) * rr * 0.8, z + Math.sin(a) * rr * 1.2];
      if (pp) A.LITM.dtri(x, z, pp[0], pp[1], q[0], q[1], 0.045);
      if (!p0) p0 = q;
      pp = q;
    }
  }
  if (A.obb) A.obb(x, z, 2.1, 0.85, Math.atan2(cs, sn));
}

/* ═════════════════ кадр ═════════════════ */
const F = { k: 0, inT: 0, toastT: -1e9, flocks: [], spawnT: 2, ents: null, egrid: null, bottles: [], hurt: 0, session: null, tail: null, tailT: 0, tailCd: 0, trail: [], trailT: 0, wasIn: false, dim: null, dimO: -1 };
const HL = 2.7, HW = 1.35;

function live () {
  const S = A.S;
  return S && ['drive', 'back', 'handover', 'side'].includes(S.state) && !S.ride && !S.freeRun;
}
function dimEl () {
  if (F.dim || typeof document === 'undefined') return F.dim;
  const v = document.getElementById('view');
  if (!v) return null;
  const d = document.createElement('div');
  d.className = 'gang-dim';
  d.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;display:none;'
    + 'background:radial-gradient(ellipse 72% 68% at 50% 55%, rgba(52,40,24,0.26) 0%, rgba(42,30,16,0.46) 55%, rgba(14,9,5,0.84) 100%);';
  v.insertAdjacentElement('afterend', d);
  return (F.dim = d);
}
function setDim (k) {
  const el = dimEl();
  if (!el) return;
  const o = Math.round(k * GL.DIM * 50) / 50;
  if (o === F.dimO) return;
  F.dimO = o;
  el.style.display = o > 0 ? '' : 'none';
  el.style.opacity = String(o);
}

/* подъезды района — сеткой 50 м, один раз */
function entsPrep () {
  if (F.egrid) return;
  F.egrid = new Map();
  const all = (A.CITY.entrances || []).concat(A.GEN_ENTR || []);
  for (const e of all) {
    if (!ZN.inMask(e[0], e[1])) continue;
    const k = Math.floor(e[0] / 50) + ',' + Math.floor(e[1] / 50);
    if (!F.egrid.has(k)) F.egrid.set(k, []);
    F.egrid.get(k).push(e);
  }
}

function thug () {
  const hex = pick(TRACK);
  const grp = A.makeHuman(null, { shirt: hex, pants: hex, cap: '#131317', fat: false, fem: false });
  const u = grp.userData;
  for (const [part, h, y] of [[u.legL, 0.62, -0.34], [u.legR, 0.62, -0.34], [u.armL, 0.42, -0.23], [u.armR, 0.42, -0.23]]) {
    if (!part) continue;
    const g = [];
    for (const s of [-1, 1]) A.box(g, 0.02, h, 0.03, '#f2f2f0', s * 0.078, y, 0);
    holdFixed(part, new THREE.Mesh(A.mergeGeos(g), A.HUMAN_VC));   // лампасы — в меш тела (people.js)
  }
  A.scene.add(grp);
  return { grp, u, x: 0, z: 0, h: 0, hx: 0, hz: 0, hh: 0, ph: rand(0, 6), dead: 0, bubble: null, bubT: 0, st: 'idle', tx: 0, tz: 0, throwT: 0, knockT: 0 };
}
function say (m, text, col) {
  if (!A.sayBubble || !m || m.dead) return;
  if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); }
  m.bubble = A.sayBubble(m.grp, text, col || '#d9342c', 2.7, 0);
  m.bubT = 2.6;
}
function unsay (m) { if (m && m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; } }
function drop (m) { unsay(m); if (!m.dead) { m.dead = 1; A.dropMesh(m.grp); } }
const place = (m, y = 0) => m.grp.position.set(m.x, A.groundH(m.x, m.z) + (A.curbAt ? A.curbAt(m.x, m.z) : 0) + y, m.z);

function spawnFlock (r0 = GL.FLOCK_R[0], r1 = GL.FLOCK_R[1]) {
  entsPrep();
  const V = A.V, sp = Math.hypot(V.vx, V.vz), hx = sp > 2 ? V.vx / sp : Math.sin(V.h), hz = sp > 2 ? V.vz / sp : Math.cos(V.h);
  const ci = Math.floor(V.x / 50), cj = Math.floor(V.z / 50), R1 = r1, cand = [];
  const pin = A.S && A.S.target;
  for (let i = ci - 3; i <= ci + 3; i++) for (let j = cj - 3; j <= cj + 3; j++) for (const e of F.egrid.get(i + ',' + j) || []) {
    const dx = e[0] - V.x, dz = e[1] - V.z, d = Math.hypot(dx, dz);
    if (d < r0 || d > R1) continue;
    if ((dx * hx + dz * hz) / d < -0.2) continue;                 // впереди или сбоку — чтобы увидеть
    if (F.flocks.some(f => Math.hypot(f.ex - e[0], f.ez - e[1]) < 30)) continue;
    if (pin && Math.hypot(pin.x - e[0], pin.z - e[1]) < 25) continue;   // у адреса — банда «Мзды», не стая
    cand.push(e);
  }
  if (!cand.length) return false;
  const e = pick(cand), [ex, ez, nx, nz] = e, tx = nz, tz = -nx;
  const n = Math.round(rand(GL.FLOCK_N[0], GL.FLOCK_N[1] + 0.49));
  const f = { ex, ez, men: [], thrown: !A.ADULT || !chance(GL.BOTTLE_P), slowT: 0, walking: 0, sayT: rand(1, 3) };
  const cx = ex + nx * 3.4, cz = ez + nz * 3.4;
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * 0.95, b = rand(-0.6, 0.9);
    let x = cx + tx * a + nx * b, z = cz + tz * a + nz * b;
    if (A.inHouse(x, z, 0.35)) { x = cx + rand(-1, 1); z = cz + rand(-1, 1); }
    if (A.inHouse(x, z, 0.35)) continue;
    const m = thug();
    m.x = m.hx = x; m.z = m.hz = z; m.h = m.hh = Math.atan2(cx - x + nx * 2, cz - z + nz * 2) + rand(-0.6, 0.6);
    // сидят на корточках — не все
    m.squat = chance(0.3) ? 1 : 0;
    f.men.push(m);
  }
  if (!f.men.length) return false;
  F.flocks.push(f); ST.flocks++; ST.men += f.men.length;
  return true;
}
function flockClear (f) { for (const m of f.men) drop(m); f.men = []; }

/* наезд — по общим правилам: быстрее TIER.FALL — сбит, медленнее — твёрдый, выталкиваем */
function contact (p, sp, fx, fz) {
  const V = A.V, ex = p.x - V.x, ez = p.z - V.z, al = ex * fx + ez * fz, ac = ex * fz - ez * fx;
  if (Math.abs(al) >= HL || Math.abs(ac) >= HW) return false;
  if (sp * 3.6 >= TIER.FALL) {
    unsay(p); p.dead = 1;
    A.dropMesh(p.grp);
    A.gibHuman({ x: p.x, z: p.z, grp: p.grp }, V.vx, V.vz);
    if (A.onRunOver) A.onRunOver();
    ST.ko++;
    return true;
  }
  const outW = HW - Math.abs(ac) + 0.05, outL = HL - Math.abs(al) + 0.05;
  if (outW <= outL) { const k = ac >= 0 ? outW : -outW; p.x += fz * k; p.z -= fx * k; }
  else { const k = al >= 0 ? outL : -outL; p.x += fx * k; p.z += fz * k; }
  return false;
}

/* бутылка: летит по дуге туда, где машина будет, с промахом */
let BOT_G = null, BOT_M = null;
const botMat = () => BOT_M || (BOT_M = new THREE.MeshLambertMaterial({ color: '#2f6b3a' }));
WARM.samplesFrom((T, geo) => (!A || !A.CAREER || ZN.LOOK_OFF) ? [] : [['граффити бандитского района (gangland.js atlas)', new T.Mesh(geo, atlas().mat)], ['бутылка гопника (gangland.js)', new T.Mesh(geo, botMat())]]);
function throwBottle (m) {
  const V = A.V, T = rand(GL.BOTTLE_T[0], GL.BOTTLE_T[1]);
  if (!BOT_G) { BOT_G = new THREE.BoxGeometry(0.08, 0.28, 0.08); botMat(); }
  const mesh = new THREE.Mesh(BOT_G, BOT_M);
  const y0 = A.groundH(m.x, m.z) + 1.9;
  const tx = V.x + V.vx * T + rand(-1, 1) * GL.BOTTLE_MISS, tz = V.z + V.vz * T + rand(-1, 1) * GL.BOTTLE_MISS;
  mesh.position.set(m.x, y0, m.z);
  A.scene.add(mesh);
  F.bottles.push({ mesh, x0: m.x, z0: m.z, y0, x1: tx, z1: tz, y1: A.groundH(tx, tz) + 1.1, T, t: 0 });
  ST.bottles++;
  if (A.Snd) A.Snd.fx('throw', s => s.blip(520, 0.08, 'triangle', 0.1), { x: m.x, z: m.z });
}
function bottleStep (dt) {
  const V = A.V, fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (let i = F.bottles.length - 1; i >= 0; i--) {
    const b = F.bottles[i];
    b.t += dt;
    const u = Math.min(1, b.t / b.T);
    const x = b.x0 + (b.x1 - b.x0) * u, z = b.z0 + (b.z1 - b.z0) * u, y = b.y0 + (b.y1 - b.y0) * u + 4 * 2.2 * u * (1 - u);
    b.mesh.position.set(x, y, z);
    b.mesh.rotation.x += dt * 14; b.mesh.rotation.z += dt * 9;
    // о кузов — по пути (последняя треть) или в конце
    const ex = x - V.x, ez = z - V.z, al = ex * fx + ez * fz, ac = ex * fz - ez * fx;
    const hit = u > 0.55 && Math.abs(al) < HL + 0.1 && Math.abs(ac) < HW + 0.1 && y < A.groundH(V.x, V.z) + 1.9;
    if (!hit && u < 1) continue;
    A.scene.remove(b.mesh);
    F.bottles.splice(i, 1);
    if (A.sparks) A.sparks(x, Math.max(y, A.groundH(x, z) + 0.2), z, hit ? 10 : 6);
    if (A.Snd) A.Snd.fx('glass', s => { s.noise(0.12, 0.2); s.blip(1800, 0.05, 'triangle', 0.08); }, { x, z }, hit ? 1 : 0.7);
    if (hit) {
      ST.hits++;
      if (F.hurt < GL.BOTTLE_MAX && A.hurt) { F.hurt++; A.hurt(1); }   // ½ сердца (hitHearts), с мятиной
      else { if (A.dent) A.dent(x, z, 5); if (A.S) A.S.shake = Math.max(A.S.shake || 0, 0.25); }
    }
  }
}

function flockStep (f, dt, sp, fx, fz) {
  const V = A.V, gang = F.ge;                      // у адреса держит банда «Мзды» — к машине не идут
  const dCar = Math.hypot(f.ex - V.x, f.ez - V.z);
  // медленно рядом — идут к машине
  if (!f.walking && !gang && dCar < GL.WALK_R && sp < 2.2) { if ((f.slowT += dt) > GL.WALK_T) startWalk(f); }
  else if (!f.walking) f.slowT = Math.max(0, f.slowT - dt);
  // реплика, когда машина рядом
  if (dCar < GL.LOOK_R * 0.7 && (f.sayT -= dt) <= 0) {
    f.sayT = rand(3.5, 7);
    const who = f.men.filter(m => !m.dead);
    if (who.length) say(pick(who), t(pick(A.ADULT ? L_LOOK_ADULT : L_LOOK_KIDS)));
  }
  // бутылка — раз на стаю, когда машина в дальности броска
  if (!f.thrown && dCar > GL.BOTTLE_R[0] && dCar < GL.BOTTLE_R[1]) {
    const who = f.men.filter(m => !m.dead && m.st === 'idle');
    if (who.length) { f.thrown = true; const m = pick(who); m.throwT = 0.55; }
  }
  for (const m of f.men) {
    if (m.dead) continue;
    const u = m.u;
    if (m.bubble && (m.bubT -= dt) <= 0) unsay(m);
    const dx = V.x - m.x, dz = V.z - m.z, d = Math.hypot(dx, dz);
    let walk = false;
    if (m.st === 'walk' || m.st === 'back') {
      const tx = m.st === 'walk' ? m.tx : m.hx, tz = m.st === 'walk' ? m.tz : m.hz;
      const ddx = tx - m.x, ddz = tz - m.z, dd = Math.hypot(ddx, ddz);
      if (dd > 0.35) {
        const k = Math.min(1, GL.WALK_V * dt / dd), nx = m.x + ddx * k, nz = m.z + ddz * k;
        if (!A.inHouse(nx, nz, 0.3)) { m.x = nx; m.z = nz; walk = true; }
        m.h = damp(m.h, m.h + wrap(Math.atan2(ddx, ddz) - m.h), 8, dt);
      } else if (m.st === 'back') { m.st = 'idle'; m.squat = 0; }
      else { m.st = 'stand'; m.stay = GL.WALK_STAY; say(m, t(pick(A.ADULT ? L_WALK_ADULT : L_WALK_KIDS))); }
      if (m.st === 'walk') { const [ax, az] = sidePt(m.side); m.tx = ax; m.tz = az; }
    } else if (m.st === 'stand') {
      const [ax, az] = sidePt(m.side);
      if (Math.hypot(ax - m.x, az - m.z) > 3 || sp > 4 || (m.stay -= dt) <= 0) m.st = 'back';
      m.h = damp(m.h, m.h + wrap(Math.atan2(dx, dz) - m.h), 6, dt);
      if ((m.knockT -= dt) <= 0) {                // стучит по кузову
        m.knockT = rand(1.2, 2.2);
        if (A.Snd) A.Snd.fx('kick', s => s.noise(0.06, 0.12), { x: m.x, z: m.z }, 0.7);
        if (A.S) A.S.shake = Math.max(A.S.shake || 0, 0.12);
        if (u.armR) u.armR.rotation.x = -1.6;
      }
    } else if (d < GL.LOOK_R) {
      m.h = damp(m.h, m.h + wrap(Math.atan2(dx, dz) - m.h), 3, dt);   // смотрят на машину
    } else m.h = damp(m.h, m.h + wrap(m.hh - m.h), 1.5, dt);
    // бросок: замах и бросок
    if (m.throwT > 0) {
      m.throwT -= dt;
      m.h = damp(m.h, m.h + wrap(Math.atan2(dx, dz) - m.h), 10, dt);
      if (u.armR) u.armR.rotation.x = m.throwT > 0.2 ? -2.6 : -0.6;
      if (m.throwT <= 0) throwBottle(m);
    }
    m.ph += dt * (walk ? 7 : 1.6);
    const sw = walk ? Math.sin(m.ph) * 0.55 : 0;
    const sq = m.squat && m.st === 'idle' ? 1 : 0;
    if (u.legL) { u.legL.rotation.x = sq ? -1.5 : sw; u.legR.rotation.x = sq ? -1.5 : -sw; }
    if (u.armL && m.throwT <= 0 && m.st !== 'stand') { u.armL.rotation.x = walk ? -sw * 0.5 : -0.15 + Math.sin(m.ph) * 0.06; u.armR.rotation.x = walk ? sw * 0.5 : -0.2 + Math.sin(m.ph * 1.3) * 0.08; }
    else if (u.armR && m.st === 'stand') u.armR.rotation.x = damp(u.armR.rotation.x, -0.3, 6, dt);
    if (contact(m, sp, fx, fz)) continue;
    place(m, sq ? -0.42 : 0);
    m.grp.rotation.y = m.h;
  }
  if (f.walking && f.men.every(m => m.dead || m.st === 'idle')) f.walking = 0;
}
/* у машины: водительская дверь, пассажирская */
function sidePt (s) {
  const V = A.V, fx = Math.sin(V.h), fz = Math.cos(V.h), rx = fz, rz = -fx;
  return [V.x + rx * 2.3 * s + fx * 0.4, V.z + rz * 2.3 * s + fz * 0.4];
}
function startWalk (f) {
  const who = f.men.filter(m => !m.dead && m.st === 'idle' && m.throwT <= 0);
  if (!who.length) return;
  const n = Math.min(who.length, chance(0.5) ? 2 : 1);
  for (let i = 0; i < n; i++) { const m = who[i]; m.st = 'walk'; m.side = i ? -1 : 1; m.squat = 0; }
  f.walking = 1; f.slowT = 0; ST.walks++;
}

/* ── хвост: мопед с гопником держится сзади по твоему следу ── */
function trailStep (dt) {
  const V = A.V;
  if ((F.trailT -= dt) > 0) return;
  F.trailT = 0.15;
  const L = F.trail, last = L[L.length - 1];
  if (last && Math.hypot(V.x - last.x, V.z - last.z) < 0.8) return;
  const s = last ? last.s + Math.hypot(V.x - last.x, V.z - last.z) : 0;
  if (last && Math.hypot(V.x - last.x, V.z - last.z) > 25) L.length = 0;   // прыжок (перенос, телепорт) — след сначала
  L.push({ x: V.x, z: V.z, s: L.length ? s : 0 });
  if (L.length > 400) L.splice(0, L.length - 400);
}
function trailAt (s) {
  const L = F.trail;
  if (!L.length) return null;
  if (s <= L[0].s) return [L[0].x, L[0].z, L.length > 1 ? Math.atan2(L[1].x - L[0].x, L[1].z - L[0].z) : 0];
  for (let i = 1; i < L.length; i++) {
    if (L[i].s < s) continue;
    const a = L[i - 1], b = L[i], k = (s - a.s) / Math.max(0.01, b.s - a.s);
    return [a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, Math.atan2(b.x - a.x, b.z - a.z)];
  }
  const b = L[L.length - 1];
  return [b.x, b.z, A.V.h];
}
function tailSpawn () {
  const L = F.trail;
  if (L.length < 10) return false;
  const end = L[L.length - 1].s, s0 = Math.max(L[0].s, end - 55);
  if (end - s0 < 30) return false;
  const hex = pick(TRACK);
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(mopedBody(A, '#3c4048').clone(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const man = A.makeHuman(null, { shirt: hex, pants: hex, cap: '#131317', fat: false, fem: false });
  const u = man.userData;
  if (u.legL) { u.legL.rotation.x = -1.45; u.legR.rotation.x = -1.45; }
  if (u.armL) { u.armL.rotation.x = -0.8; u.armR.rotation.x = -0.8; u.armL.rotation.z = 0.3; u.armR.rotation.z = -0.3; }
  man.position.set(0, 0.14, -0.2);
  g.add(man);
  A.scene.add(g);
  F.tail = { g, man, u, s: s0, v: 0, t: rand(GL.TAIL_T[0], GL.TAIL_T[1]), out: 0, leave: 0, x: 0, z: 0, h: 0, sayT: rand(4, 8), dead: 0 };
  ST.tails++;
  return true;
}
function tailClear () {
  const T = F.tail;
  if (!T) return;
  if (T.bubble) { T.man.remove(T.bubble); T.bubble.material.dispose(); }
  A.scene.remove(T.g);
  T.g.children[0].geometry.dispose(); T.g.children[0].material.dispose();
  if (!T.dead) A.dropMesh(T.man);
  F.tail = null;
}
function tailStep (dt, inside, sp) {
  const T = F.tail, V = A.V;
  if (!T) return;
  const L = F.trail;
  const end = L.length ? L[L.length - 1].s : 0;
  T.t -= dt;
  if (!inside) T.out += dt; else T.out = 0;
  if (!T.leave && (T.t <= 0 || T.out > 8)) T.leave = 1;
  if (T.leave) {
    // отстаёт: тормозит и сворачивает вбок
    T.v = damp(T.v, 0, 0.8, dt);
    T.h += dt * 0.8;
    T.x += Math.sin(T.h) * T.v * dt; T.z += Math.cos(T.h) * T.v * dt;
    if (Math.hypot(T.x - V.x, T.z - V.z) > 70 || T.v < 0.5) { tailClear(); F.tailCd = GL.TAIL_CD; }
  } else {
    const want = end - GL.TAIL_GAP;
    T.v = clamp((want - T.s) * 1.4 + sp, 0, GL.TAIL_V);
    T.s = Math.min(want, T.s + T.v * dt);
    const p = trailAt(T.s);
    if (p) { T.x = p[0]; T.z = p[1]; T.h = T.h + wrap(p[2] - T.h) * Math.min(1, dt * 6); }
    if ((T.sayT -= dt) <= 0 && Math.hypot(T.x - V.x, T.z - V.z) < 24) {
      T.sayT = rand(8, 14);
      if (T.bubble) { T.man.remove(T.bubble); T.bubble.material.dispose(); }
      T.bubble = A.sayBubble ? A.sayBubble(T.man, t(pick(L_TAIL)), '#d9342c', 2.7, 0) : null;
      T.bubT = 2.6;
    }
  }
  if (T.bubble && (T.bubT -= dt) <= 0) { T.man.remove(T.bubble); T.bubble.material.dispose(); T.bubble = null; }
  // наехал задом / развернулся в него
  if (!T.dead && Math.hypot(T.x - V.x, T.z - V.z) < 2.2 && sp * 3.6 >= TIER.FALL) {
    T.dead = 1; T.leave = 1; T.v = 0;
    A.dropMesh(T.man);
    A.gibHuman({ x: T.x, z: T.z, grp: T.man }, V.vx, V.vz);
    if (A.onRunOver) A.onRunOver();
    ST.ko++;
  }
  T.g.position.set(T.x, A.groundH(T.x, T.z), T.z);
  T.g.rotation.y = T.h;
  T.g.rotation.z = T.leave ? 0 : clamp(wrap(T.h - (T.ph || T.h)) * -6, -0.25, 0.25);
  T.ph = T.h;
  if (T.u && T.u.head) T.u.head.rotation.y = clamp(wrap(Math.atan2(V.x - T.x, V.z - T.z) - T.h), -1, 1);   // смотрит на машину
}

function clearAll () {
  for (const f of F.flocks) flockClear(f);
  F.flocks = [];
  for (const b of F.bottles) A.scene.remove(b.mesh);
  F.bottles = [];
  tailClear();
}

export function step (dt, api, ge) {
  const t0 = performance.now();
  stepIn(dt, api, ge);
  const ms = performance.now() - t0;
  ST.ms = ST.ms * 0.98 + ms * 0.02; if (ms > ST.maxMs) ST.maxMs = ms;
}
function stepIn (dt, api, ge) {
  if (api) A = api;
  if (ZN.LOOK_OFF) return;
  F.ge = ge || '';
  if (!A || !A.CAREER) return;
  if (typeof window !== 'undefined' && window.__dlv && !window.__dlv.GANGL) window.__dlv.GANGL = DEBUG;
  const S = A.S, V = A.V;
  if (!S || S.state === 'title' || S.state === 'over' || S.state === 'dying') {
    if (F.flocks.length || F.tail || F.bottles.length) clearAll();
    if (F.k > 0) { F.k = 0; setDim(0); AMBI.mood(0); }
    return;
  }
  // новая смена — бутылки снова больно
  const sn = A.shiftN ? A.shiftN() : 0;
  if (sn !== F.session) { F.session = sn; F.hurt = 0; }
  const inside = ZN.inGang(V.x, V.z);
  ST.inside = inside;
  const want = inside ? 1 : 0;
  F.k = damp(F.k, want, 1 / GL.FADE, dt);
  if (F.k < 0.01 && !inside) F.k = 0;
  ST.k = Math.round(F.k * 100) / 100;
  setDim(F.k);
  AMBI.mood(F.k);
  const on = live();
  if (inside && !F.wasIn && on) {
    if (performance.now() - F.toastT > GL.TOAST_CD * 1000 && A.toast) { F.toastT = performance.now(); A.toast(t('бандитский район: тут трясут мзду')); }
    if (!F.tail && F.tailCd <= 0 && chance(GL.TAIL_P)) F.tailT = rand(GL.TAIL_AFTER[0], GL.TAIL_AFTER[1]);
  }
  F.wasIn = inside;
  const sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  trailStep(dt);
  if (F.tailCd > 0) F.tailCd -= dt;
  if (!on) { if (F.flocks.length || F.tail) clearAll(); return; }
  // хвост
  if (!F.tail && F.tailT > 0 && inside) { F.tailT -= dt; if (F.tailT <= 0) tailSpawn(); }
  tailStep(dt, inside, sp);
  // стаи
  for (let i = F.flocks.length - 1; i >= 0; i--) {
    const f = F.flocks[i];
    if (Math.hypot(f.ex - V.x, f.ez - V.z) > GL.FLOCK_FAR || f.men.every(m => m.dead)) { flockClear(f); F.flocks.splice(i, 1); continue; }
    flockStep(f, dt, sp, fx, fz);
  }
  if (inside && F.flocks.length < GL.FLOCK_MAX && (F.spawnT -= dt) <= 0) {
    F.spawnT = spawnFlock() ? rand(GL.FLOCK_EVERY[0], GL.FLOCK_EVERY[1]) : 1.5;
  }
  bottleStep(dt);
}

export const DEBUG = {
  GL, ST, F, ZONES: ZN.MSTAT,
  inGang: (x, z) => ZN.inGang(x, z),
  ENTRIES, WRECK_AT,
  flock: (r0, r1) => { F.spawnT = 0; return spawnFlock(r0, r1); },
  tail: () => { F.tailCd = 0; return F.tail ? true : tailSpawn(); },
  throw: () => { const m = F.flocks.flatMap(f => f.men).find(q => !q.dead); if (m) throwBottle(m); return !!m; },
  clear: () => clearAll(),
  get state () { return { ...ST, flocksAll: ST.flocks, menAll: ST.men, thrown: ST.bottles, flocks: F.flocks.length, men: F.flocks.reduce((n, f) => n + f.men.filter(m => !m.dead).length, 0), tail: !!F.tail, tailGap: F.tail ? Math.round(Math.hypot(F.tail.x - A.V.x, F.tail.z - A.V.z)) : -1, bottles: F.bottles.length, hurt: F.hurt, trail: F.trail.length, trailS: F.trail.length ? Math.round(F.trail[F.trail.length - 1].s) : 0 }; },
};
