/* ──────────────────────────────────────────────────────────────────────────
   Свои люди в каждой пиццерии (автор 16.10.2026: «в каждой пиццерии свой набор персонажей, и на смену
   выходят разные эти персонажи. Они все чем-то отличаются, их машины по-особенному выглядят. Типа какие-то
   заниженные, какие-то с наклейкой АК69 на заднем стекле. У каких-то написано "гангстер" на стекле»).
   Правила словами — docs/CAREER.md «Свои курьеры и конкуренты» → «Кто в какой пиццерии».

   У каждой из 8 пиццерий (районы — districts.js) — постоянный состав из 7 курьеров: имя, пол, характер
   одной строкой, лицо (постоянное зерно — то же лицо и в чате, и в паузе), 1—2 своих фразы для чата и своя
   машина: модель, цвет и особенности — заниженная (кузов ниже, колёса шире), тонировка, диски, спойлер,
   кенгурятник, ржавчина, ёлочка-вонючка, наклейки на заднем стекле. Шашка «Птицы Пиццы» на крыше — у всех.
   На смену выходят столько, сколько даёт ступень пиццерии (growth.js), жребием из состава; кто ездил прошлую
   смену в этой пиццерии — выпадает реже (CC.PREFER), имена в смене не повторяются никогда.

   Наклейки — одна текстура-атлас (canvas 1024×512) и один материал на все машины; у машины коллеги наклейки —
   один меш (+1 вызов отрисовки), всё остальное (спойлер, ржавчина, кенгурятник) — в склейке кузова (game.js
   rivalTemplate).

     CC.init({ THREE, ADULT, makePerson, faceDataURL, put, mergeGeos, spec, districtId })   — game.js, один раз
     CC.roster(i)       — состав пиццерии района i (номер в DIST.list()) → [член]
     CC.pick(i, n)      — n разных людей на смену (жребий, прошлую смену — реже)
     CC.person(m)       — человек для лица и падежей (makePerson: зерно от id, имя — t(m.n))
     CC.lines(m)        — свои фразы для чата (переведённые; мат — только во взрослой)
     CC.carOpts(m)      — опции makeCar: low, tint, wheel, chrome
     CC.dress(g, m)     — на готовую makeCar: колёса шире у заниженных, склейка мелочей, меш наклеек (userData.sticker)
     CC.STICK_MAT()     — общий материал наклеек
     CC.badge(m, size)  — HTML для таблицы смены: портрет + машинка-значок
   Отладка: __dlv.CREWC (roster, pick, last, atlas).
   ────────────────────────────────────────────────────────────────────────── */
import './crewcast.css';
import { t, N_, lang } from '../i18n/index.js';
import { RAKE } from './carbody.js';

export const CC = {
  PREFER: 2.5,          // вес того, кто не ездил прошлую смену в этой пиццерии (ездил — 1)
  STICK_H: 0.16,        // м — высота надписи-баннера наверху заднего стекла
  STICK_H2: 0.08,       // м — высота второй надписи внизу
  ICON_H: 0.15,         // м — значок («Ш», «!») в нижнем углу
  BIG: 1.5,             // короткие крупные надписи (АК69, ГАНГСТЕР, БОСС, JDM) — во столько раз выше
  COUPE_HI: 0.6,        // у купе верх заднего стекла закрывает крыло — надписи ниже этой доли стекла
  LOW: -0.13,           // м — заниженная: кузов ниже (как makeCar opts.low)
  WIDE: 1.3,            // заниженная: колёса шире во столько раз
};

/* ── наклейки на заднее стекло. txt — надпись (N_ — переводится), col — цвет букв, bg — подложка;
   icon — значок в квадрате; adult — только во взрослой; kids — чем заменить в детской ── */
const STICK = {
  ak69: { big: 1, txt: N_('АК69'), col: '#f4f1ea', font: '900 50px Impact, "Arial Black", sans-serif', kids: 'boss' },
  gang: { big: 1, txt: N_('ГАНГСТЕР'), col: '#f4f1ea', font: 'italic 900 46px Georgia, "Times New Roman", serif' },
  classic: { txt: N_('Боевая классика'), col: '#f4f1ea', font: 'italic bold 42px Georgia, serif' },
  unsure: { txt: N_('Не уверен — не обгоняй'), col: '#ffffff', font: 'bold 38px Arial, sans-serif' },
  kids: { txt: N_('Дети в машине'), col: '#1b1a1f', bg: '#ffd21f', font: 'bold 38px Arial, sans-serif' },
  dgaf: { txt: N_('Мне похуй'), col: '#f4f1ea', font: '900 46px Impact, "Arial Black", sans-serif', adult: true },
  eyes: { txt: N_('Смотри в оба'), col: '#f4f1ea', font: 'bold 42px Arial, sans-serif' },
  boss: { big: 1, txt: N_('БОСС'), col: '#e8c95e', font: '900 50px Impact, "Arial Black", sans-serif' },
  princess: { txt: N_('Принцесса'), col: '#ff8ac0', font: 'italic bold 44px Georgia, serif' },
  jdm: { big: 1, txt: 'JDM', col: '#f4f1ea', font: '900 50px Impact, "Arial Black", sans-serif' },
  nottaxi: { txt: N_('Я не такси'), col: '#ffd21f', font: 'bold 42px Arial, sans-serif' },
  dacha: { txt: N_('На дачу!'), col: '#9be07a', font: 'bold 44px Arial, sans-serif' },
  spikes: { icon: 'spikes' },     // «Ш» в красном треугольнике — шипы (зима же)
  newbie: { icon: 'newbie' },     // «!» на жёлтом — начинающий водитель
};

/* ── составы. n — имя, f — женщина, a — возраст (y — молодой, o — старый; без — взрослый), pace — как водит
   (game.js RIVAL_SPEC: 0 — средне, 1 — гонит, 2 — аккуратно, 3 — злой, расталкивает поток), who — характер,
   say — свои фразы в чат (adult: true — только взрослая).
   car: m — модель, hex — цвет, low — заниженная, tint — тонировка, wheel — диски (cap / steel / alloy / gold / black / red),
   chrome — хромированные бамперы, spoiler, bull — кенгурятник, rust — ржавчина, tree — ёлочка, st — наклейки (1—2) ── */
const M = (id, n, f, pace, who, car, say, a) => ({ id, n, f: !!f, pace, who, car, say, a });
/* Пока автор не утвердил новых коллег, машины доставки и рейтинг остаются,
   а именные персонажи прежнего состава не появляются в игре. */
const ORDER = ['south', 'ring', 'avenue', 'center', 'old', 'east', 'north', 'west'];
const CREW = Object.fromEntries(ORDER.map((district, di) => [district,
  Array.from({ length: 7 }, (_, i) => M(district + '-courier-' + (i + 1), N_('Курьер'), i % 3 === 1, i % 4,
    N_('Доставляет заказы'), { m: ['sedan', 'hatch', 'smart', 'coupe', 'suv', 'cn', 'sedan'][i],
      hex: ['#344557', '#bc684f', '#77a38e', '#7a728f', '#b7a073', '#546d78', '#8b7764'][(i + di) % 7],
      st: [] }, [], null))]));


let A = null;
const LAST = new Map();             // район → id тех, кто ездил прошлую смену
const PEOPLE = new Map();           // id:язык → человек
export const DEBUG = { CREW, STICK, CC, LAST, atlas: null, force: null };

export function init (api) { A = api; }

const keyOf = i => {
  const id = A && A.districtId ? A.districtId(i) : null;
  return CREW[id] ? id : ORDER[((i | 0) % ORDER.length + ORDER.length) % ORDER.length];
};
/** состав пиццерии района i */
export function roster (i) { return CREW[keyOf(i)]; }

/** n разных людей на смену: жребий с весами, кто ездил прошлую смену — реже */
export function pick (i, n) {
  const k = keyOf(i), last = LAST.get(k) || [], out = [];
  if (DEBUG.force) {                                  // отладка: __dlv.CREWC.force = ['so-gosha', …] — эти люди (из любой пиццерии)
    const all = Object.values(CREW).flat();
    return DEBUG.force.map(id => all.find(m => m.id === id)).filter(Boolean).slice(0, n);
  }
  const pool = CREW[k].slice();
  n = Math.max(0, Math.min(n | 0, pool.length));
  while (out.length < n) {
    const w = pool.map(m => (last.includes(m.id) ? 1 : CC.PREFER));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), j = 0;
    while (j < pool.length - 1 && (r -= w[j]) > 0) j++;
    const m = pool.splice(j, 1)[0];
    if (!out.some(o => o.id === m.id)) out.push(m);     // в составе имена разные, но на всякий случай
  }
  LAST.set(k, out.map(m => m.id));
  return out;
}

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const AGE = { y: 'young', o: 'old' };
/** человек: лицо от зерна id (одно и то же всегда), имя — из состава */
export function person (m) {
  const key = m.id + ':' + lang();                    // язык сменили — падежи заново
  if (!PEOPLE.has(key)) PEOPLE.set(key, A.makePerson({ seed: hash(m.id), fem: m.f, first: t(m.n) + ' ' + m.id.split('-').at(-1), age: AGE[m.a] || 'adult' }));
  return PEOPLE.get(key);
}
/** свои фразы в чат */
export function lines (m) {
  return (m.say || []).filter(l => typeof l === 'string' || !l.adult || (A && A.ADULT)).map(l => t(typeof l === 'string' ? l : l.m));
}
export function carOpts (m) {
  const c = m.car;
  return { low: !!c.low, tint: !!c.tint, wheel: c.wheel, chrome: c.chrome ? '#cfd3d8' : undefined };
}
/* наклейки с учётом версии: мат — только взрослая, АК — в детской «БОСС» */
function stickers (m) {
  const out = [];
  for (let k of m.car.st || []) {
    if (!A.ADULT && STICK[k] && (STICK[k].adult || STICK[k].kids)) k = STICK[k].kids || null;
    if (k && STICK[k] && !out.includes(k)) out.push(k);
  }
  return out;
}

/* ─────────────── атлас наклеек ─────────────── */
const AW = 1024, AH = 512, CW = 512, CH = 64, ICON = 64;
let ATLAS = null, MAT = null;
function atlas () {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas');
  c.width = AW; c.height = AH;
  const x = c.getContext('2d');
  const cells = {};
  let ti = 0, ii = 0;
  for (const k in STICK) {
    const s = STICK[k];
    if (s.icon) {
      const cx = ii * ICON, cy = AH - ICON; ii++;
      drawIcon(x, s.icon, cx, cy);
      cells[k] = { u0: cx / AW, u1: (cx + ICON) / AW, v0: 0, v1: ICON / AH, asp: 1, icon: true };
      continue;
    }
    const cx = (ti % 2) * CW, cy = ((ti / 2) | 0) * CH; ti++;
    const txt = t(s.txt);
    x.font = s.font;
    const tw = x.measureText(txt).width, pad = s.bg ? 14 : 6, room = CW - pad * 2;
    const sx = Math.min(1, room / Math.max(1, tw)), uw = Math.ceil(tw * sx + pad * 2);
    if (s.bg) { x.fillStyle = s.bg; x.strokeStyle = '#1b1a1f'; x.lineWidth = 3; x.beginPath(); x.roundRect(cx + 2, cy + 4, uw - 4, CH - 8, 8); x.fill(); x.stroke(); }
    x.save();
    x.translate(cx + pad, cy + CH / 2 + 2);
    x.scale(sx, 1);
    x.textBaseline = 'middle'; x.textAlign = 'left'; x.lineJoin = 'round';
    if (!s.bg) { x.strokeStyle = 'rgba(20,18,24,.85)'; x.lineWidth = 6; x.strokeText(txt, 0, 0); }
    x.fillStyle = s.col; x.fillText(txt, 0, 0);
    x.restore();
    cells[k] = { u0: cx / AW, u1: (cx + uw) / AW, v0: 1 - (cy + CH) / AH, v1: 1 - cy / AH, asp: uw / CH };
  }
  const tex = new A.THREE.CanvasTexture(c);
  tex.colorSpace = A.THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  ATLAS = { tex, cells, canvas: c };
  DEBUG.atlas = ATLAS;
  return ATLAS;
}
function drawIcon (x, kind, cx, cy) {
  const m = cx + ICON / 2;
  if (kind === 'spikes') {
    // белый треугольник с красной каймой, «Ш» посередине
    x.beginPath(); x.moveTo(m, cy + 4); x.lineTo(cx + ICON - 4, cy + ICON - 6); x.lineTo(cx + 4, cy + ICON - 6); x.closePath();
    x.fillStyle = '#d8262e'; x.fill();
    x.beginPath(); x.moveTo(m, cy + 15); x.lineTo(cx + ICON - 13, cy + ICON - 11); x.lineTo(cx + 13, cy + ICON - 11); x.closePath();
    x.fillStyle = '#f4f1ea'; x.fill();
    x.fillStyle = '#1b1a1f'; x.font = 'bold 22px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('Ш', m, cy + ICON - 22);
  } else if (kind === 'newbie') {
    x.fillStyle = '#ffd21f'; x.strokeStyle = '#1b1a1f'; x.lineWidth = 3;
    x.beginPath(); x.roundRect(cx + 6, cy + 6, ICON - 12, ICON - 12, 4); x.fill(); x.stroke();
    x.fillStyle = '#1b1a1f'; x.font = '900 40px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('!', m, cy + ICON / 2 + 2);
  }
}
/** общий материал наклеек (один на все машины) */
export function STICK_MAT () {
  if (MAT) return MAT;
  MAT = new A.THREE.MeshLambertMaterial({ map: atlas().tex, alphaTest: 0.45 });
  MAT.userData.shared = true;
  return MAT;
}

/* ─────────────── машина ───────────────
   g — готовая makeCar(hex, true, model, false, carOpts(m)): колёса шире у заниженных; мелочи (спойлер, кенгурятник,
   ржавчина, ёлочка) — одним мешем с цветом по вершинам (rivalTemplate склеит его с кузовом); наклейки — мешем
   userData.sticker на общем материале атласа. */
export function dress (g, m) {
  const THREE = A.THREE, c = m.car, S = A.spec(c.m), u = g.userData;
  const W = S.W, hl = S.L / 2, dy = c.low ? CC.LOW : 0;
  const y0 = 0.42 + S.h / 2 + dy, top = 0.42 + S.h + dy;
  const rk = RAKE[c.m] || RAKE.sedan, rb = Math.min(rk.b, S.cab * 0.3);
  const cb = S.cz - S.cab / 2, roofRear = cb + rb, roofY = top + S.ch + 0.1;
  const r = rng(hash(m.id));
  const parts = [];
  const box = (w, h, d, hex, x, y, z, rx = 0) => A.put(parts, new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx);
  // заниженная: колёса шире и чуть наружу (кузов уже ниже — makeCar opts.low)
  if (c.low) for (const w of u.wheels) { w.geometry.scale(CC.WIDE, 1, 1); w.parent.position.x += Math.sign(w.parent.position.x) * 0.045; }
  // спойлер: у седана — крыло на крышке багажника, у остальных — козырёк над задним стеклом (у купе свой есть)
  if (c.spoiler && c.m !== 'coupe') {
    if (S.trunk) {
      for (const sx of [-0.55, 0.55]) box(0.07, 0.24, 0.1, '#1b1a1f', sx, top + 0.3, -hl + 0.3);
      box(W - 0.16, 0.05, 0.34, '#1b1a1f', 0, top + 0.43, -hl + 0.3, -0.12);
    } else {
      box(W - 0.32, 0.05, 0.34, '#1b1a1f', 0, roofY - 0.02, roofRear - 0.08, 0.18);
      for (const sx of [-1, 1]) box(0.05, 0.12, 0.3, '#1b1a1f', sx * (W / 2 - 0.18), roofY - 0.06, roofRear - 0.06);
    }
  }
  // кенгурятник: две стойки, три перекладины, решётка
  if (c.bull) {
    const z = hl + 0.2, yb = y0 - 0.32, yt = top + 0.08, hh = yt - yb;
    for (const sx of [-1, 1]) {
      box(0.07, hh, 0.07, '#2a2a2e', sx * W * 0.34, yb + hh / 2, z);
      box(0.06, 0.06, 0.24, '#2a2a2e', sx * W * 0.34, y0 - 0.05, z - 0.12);
    }
    for (const y of [yt, y0 + 0.02, yb + 0.08]) box(W * 0.68 + 0.07, 0.06, 0.07, '#2a2a2e', 0, y, z);
    for (const sx of [-0.14, 0.14]) box(0.05, hh * 0.8, 0.05, '#3a3a40', sx, yb + hh * 0.45, z + 0.02);
  }
  // ржавчина: рыжие пятна по низу дверей, у арок и на заднем бампере (места — от зерна, одни и те же)
  if (c.rust) {
    const RUST = ['#8a4a22', '#6b3518', '#a0602e', '#7a4020'];
    const lo = y0 - S.h / 2 + 0.05;
    for (const s of [-1, 1]) {
      const spots = [[S.bz + 0.42, 0], [S.bz - 0.4, 0], [S.fz + 0.4, 0], [S.cz + (r() - 0.5) * 0.8, 0], [S.cz + (r() - 0.5) * 1.2, 1]];
      for (const [z0, hi] of spots) {
        const n = 2 + ((r() * 2) | 0);
        for (let k = 0; k < n; k++) {
          const w = 0.12 + r() * 0.22, h = 0.06 + r() * 0.12;
          box(0.012, h, w, RUST[(r() * RUST.length) | 0], s * (W / 2 + 0.077 + k * 0.001), lo + h / 2 + (hi ? 0.12 + r() * 0.1 : r() * 0.08), z0 + (r() - 0.5) * 0.18);
        }
      }
    }
    for (let k = 0; k < 3; k++) box(0.14 + r() * 0.2, 0.05 + r() * 0.06, 0.012, RUST[k % RUST.length], (r() - 0.5) * (W - 0.4), y0 - 0.06 + (r() - 0.5) * 0.06, -hl - 0.085);
  }
  // ёлочка-вонючка: висит на лобовом под зеркалом (стекло непрозрачное — снаружи, вплотную к нему)
  const wsF = u.glass && u.glass[0], wsB = u.glass && u.glass[1];
  if (c.tree && wsF) {
    const P = pane(wsF, false);
    if (P) {
      const at = (v, o) => P.B.clone().addScaledVector(P.u, v * P.L).addScaledVector(P.n, o);
      const p0 = at(0.72, 0.03);
      A.put(parts, new THREE.ConeGeometry(0.05, 0.13, 4), '#2f9a3a', 0.16, p0.y, p0.z);
      A.put(parts, new THREE.BoxGeometry(0.01, 0.1, 0.01), '#f4f1ea', 0.16, p0.y + 0.1, p0.z);
    }
  }
  if (parts.length) {
    const mesh = new THREE.Mesh(A.mergeGeos(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.userData.crewExtra = 1;
    g.add(mesh);
  }
  // наклейки: баннер наверху заднего стекла, второе — внизу (значок — в углу)
  const st = stickers(m).slice(0, c.m === 'coupe' ? 1 : 2);   // у купе открытого стекла мало — только первая
  if (st.length && wsB) {
    const P = pane(wsB, true), cells = atlas().cells;
    if (P) {
      const pos = [], uv = [], nor = [], idx = [];
      const quad = (cell, vc, h, xc) => {
        let w = h * cell.asp;
        const room = 2 * (P.w0 + (P.w1 - P.w0) * vc) - 0.12;
        if (w > room) { h *= room / w; w = room; }
        const C = P.B.clone().addScaledVector(P.u, vc * P.L).addScaledVector(P.n, 0.012);
        const b = pos.length / 3;
        // зритель сзади смотрит вдоль +z: левый край надписи — на +x
        const pts = [[xc + w / 2, -h / 2, cell.u0, cell.v0], [xc - w / 2, -h / 2, cell.u1, cell.v0], [xc - w / 2, h / 2, cell.u1, cell.v1], [xc + w / 2, h / 2, cell.u0, cell.v1]];
        for (const [px, py, tu, tv] of pts) {
          pos.push(px, C.y + P.u.y * py, C.z + P.u.z * py); uv.push(tu, tv); nor.push(P.n.x, P.n.y, P.n.z);
        }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      };
      // где на стекле свободно: снизу его у седана и купе закрывает крышка багажника, у купе сверху — его крыло
      const lidY = S.trunk ? top + 0.16 + 0.03 : -1e9;
      let lo = Math.max(0.03, (lidY - P.B.y) / (P.u.y * P.L)), hi = c.m === 'coupe' ? CC.COUPE_HI : 0.97;
      const big = k => (STICK[k].big ? CC.BIG : 1);
      const hs = st.map((k, i) => (cells[k].icon ? CC.ICON_H : i === 0 ? CC.STICK_H * big(k) : CC.STICK_H2 * big(k)));
      // две надписи не влезают — обе мельче
      const need = (st.length > 1 ? hs[0] + hs[1] + 0.03 : hs[0]) / P.L, room = hi - lo;
      const k0 = need > room ? room / need : 1;
      st.forEach((k, i) => {
        const cell = cells[k], h = hs[i] * k0;
        if (!cell) return;
        if (cell.icon && (i > 0 || st.length === 1)) {
          const vc = lo + h / 2 / P.L, half = P.w0 + (P.w1 - P.w0) * vc - 0.07;
          quad(cell, vc, h, (i ? -1 : 1) * (half - h / 2));      // значок — в нижнем углу: второй — справа (для зрителя), один — слева
        } else if (i === 0) quad(cell, hi - h / 2 / P.L, h, 0);    // первая надпись — баннером наверху
        else quad(cell, lo + h / 2 / P.L, h, -0.1);                // вторая — внизу, правее
      });
      if (idx.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        const sm = new THREE.Mesh(geo, STICK_MAT());
        sm.userData.sticker = 1;
        g.add(sm);
      }
    }
  }
  return g;
}

/* стекло (квадрат на наклоне, carbody.js cabin → pane): низ B, ось вверх по стеклу u, длина L, наружу n, полуширины низа и верха */
function pane (mesh, back) {
  const THREE = A.THREE, p = mesh.geometry.attributes.position;
  if (!p || p.count < 4) return null;
  mesh.updateMatrix();
  const v = new THREE.Vector3();
  let ymin = 1e9, ymax = -1e9;
  const pts = [];
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrix); pts.push(v.clone()); ymin = Math.min(ymin, v.y); ymax = Math.max(ymax, v.y); }
  const bot = pts.filter(q => q.y < ymin + 0.01), tp = pts.filter(q => q.y > ymax - 0.01);
  const avg = a => a.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(1 / a.length);
  const B = avg(bot), T = avg(tp);
  B.x = 0; T.x = 0;
  const w0 = Math.max(...bot.map(q => Math.abs(q.x))), w1 = Math.max(...tp.map(q => Math.abs(q.x)));
  const d = T.clone().sub(B), L = d.length();
  if (L < 0.05) return null;
  const uu = d.multiplyScalar(1 / L);
  // наружу: у заднего — назад и вверх, у лобового — вперёд и вверх
  const n = back ? new THREE.Vector3(0, uu.z, -uu.y) : new THREE.Vector3(0, -uu.z, uu.y);
  if (n.y < 0) n.negate();
  return { B, T, u: uu, L, n: n.normalize(), w0, w1 };
}

function rng (seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* ─────────────── таблица смены: портрет и машинка ─────────────── */
const ICONS = new Map();
function carIcon (m) {
  if (ICONS.has(m.id)) return ICONS.get(m.id);
  const c = m.car, low = c.low ? 1.5 : 0, glass = c.tint ? '#1a1c22' : '#9cc3e6';
  const cab = { sedan: 'M8 6 L11 2.5 H19 L22 6', coupe: 'M9 6 L13 3 H19 L23 6', hatch: 'M7 6 L10 2.5 H23 L24 6', smart: 'M8 6 L10 1.8 H19 L20 6',
    suv: 'M6 6 L8 1.8 H23 L24 6', cn: 'M6 6 L9 2 H23 L24.5 6' }[c.m] || 'M8 6 L11 2.5 H19 L22 6';
  const svg = '<svg class="cc-car" viewBox="0 0 30 13" aria-hidden="true"><g transform="translate(0 ' + low + ')">' +
    '<path d="' + cab + ' Z" fill="' + glass + '" stroke="#33210c" stroke-width=".8"/>' +
    '<rect x="2" y="5.6" width="26" height="4" rx="1.4" fill="' + c.hex + '" stroke="#33210c" stroke-width=".8"/>' +
    '<rect x="11" y=".4" width="7" height="1.6" fill="#f0522a"/>' +
    (c.spoiler ? '<rect x="1" y="4" width="4" height="1" fill="#1b1a1f"/>' : '') +
    (c.bull ? '<rect x="28" y="5" width="1.2" height="5" fill="#2a2a2e"/>' : '') + '</g>' +
    '<circle cx="8" cy="10.4" r="2.2" fill="#221c19"/><circle cx="22" cy="10.4" r="2.2" fill="#221c19"/></svg>';
  ICONS.set(m.id, svg);
  return svg;
}
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
/** портрет и машинка перед именем в таблице смены (паузa); характер — подсказкой на портрете */
export function badge (m, size = 32) {
  let face = '';
  try { face = A.faceDataURL(person(m), size); } catch (e) { face = ''; }
  return (face ? '<img class="cc-face" src="' + face + '" alt="" title="' + esc(t(m.who)) + '">' : '') + carIcon(m);
}
