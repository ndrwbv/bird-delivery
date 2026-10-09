/* ──────────────────────────────────────────────────────────────────────────
   Ночная жизнь — только взрослая версия (Стим, ADULT). Правила словами —
   docs/CONTENT.md «Ночная жизнь (только взрослая)». В детской сборке модуль
   не вызывается вовсе (game.js: if (ADULT) …).

   1. «Ночные бабочки» у обочины (WORK ниже).
      Места — WORK.SPOTS (8) точек на обочине, выбираются один раз при сборке
      города и всегда одни и те же: у промзон (участки «ind»), у гаражных
      кооперативов (участки «gar», гаражи Дяди Жени), у загородных трасс
      (магистрали c ≤ 2, вокруг почти нет домов). Не ближе GAP (380 м) друг
      к другу, не ближе 150 м к пиццериям; сначала по одному месту на район.
      На месте — 1–3 девушки (от места, не случайно), стоят лицом к дороге.
      Когда: с 22:00 до 5:00 по часам мира. Появляются и уходят только вне
      кадра (дальше HIDE_R 140 м или за спиной камеры), всего не больше CAP (10).
      Едешь мимо (ближе 30 м, быстрее 3 м/с) — машут рукой.
      Остановился рядом (медленнее SLOW_KMH 20 км/ч и ближе SAY_R 8 м) — одна
      говорит фразу в облачке (LINES, 8 штук, без пошлостей), раз в 6 с.
      Больше ничего не делают. Сбил — как любого прохожего (hits.js).
   2. Стрип-клуб «Клубничка» (CLUB ниже).
      Один на город: пристройка с витриной на первом этаже дома в районе
      «Центр» (или у «дома» карты) — на главной улице, рядом с кафе и барами.
      Ширина до 14 м, глубина 4,6 м, высота 3,8 м; неоновая вывеска на крыше,
      неоновые трубки вокруг витрины. За стеклом — розово-фиолетовый зал:
      сцена, 3 шеста, 3 танцовщицы в купальниках (крутятся у шеста, лезут
      вверх, танцуют), 5 силуэтов гостей спиной к улице, лучи прожекторов.
      Открыт с 17:00 до 6:00; днём витрина тёмная, вывеска не горит, зала не видно.
      Анимация — только ближе ANIM_R (150 м) и когда клуб в кадре; дальше
      SHOW_R (420 м) — весь клуб спрятан.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';
import { hourOf } from './econ.js';
import * as DIST from './districts.js';
import * as HITS from './hits.js';

export const WORK = {
  FROM: 22, TO: 5,              // часы мира
  SPOTS: 8, GAP: 380, PIZZA_GAP: 150,
  N: [1, 3], CAP: 10,
  WANT_R: 200, HIDE_R: 140, DROP_R: 260,
  WAVE_R: 30, SAY_R: 8, SLOW_KMH: 20, SAY_CD: 6, SAY_T: 3.2,
};
export const CLUB = {
  OPEN: 17, CLOSE: 6,           // часы мира
  W: 14, D: 4.6, H: 3.8,
  DANCERS: 3, GUESTS: 5,
  ANIM_R: 150, SHOW_R: 420, SEARCH_R: 900,
};

/* фразы — ru здесь, en в src/i18n/en.json */
const LINES = /*i18n*/ [
  'красавчик, подвезёшь?',
  'пиццу не заказывали, а вот…',
  'курьер, у тебя скидка!',
  'сладкий, пицца с ананасами есть?',
  'чаевые тоже принимаем',
  'а нас кто доставит?',
  'опять на часах? мы тоже',
  'горячее привёз? мы тоже горячие',
];

let A = null;
const SPOTS = [];
let LIVE_N = 0, scanT = 0;
const STATS = { spots: 0, live: 0, said: 0, hit: 0, club: null, clubAnim: 0 };
let CLUBO = null;

const hash = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const rand = (a, b) => a + Math.random() * (b - a);
const clockH = () => hourOf(A.ENV.t) % 24;
const nightNow = () => { const h = clockH(); return h >= WORK.FROM || h < WORK.TO; };
const clubOpen = () => { const h = clockH(); return h >= CLUB.OPEN || h < CLUB.CLOSE; };

/* общий кадр камеры: в кадре ли точка (с радиусом) */
const FR = new THREE.Frustum(), FM = new THREE.Matrix4(), SPH = new THREE.Sphere();
function frustum () { FM.multiplyMatrices(A.cam.projectionMatrix, A.cam.matrixWorldInverse); FR.setFromProjectionMatrix(FM); }
function inView (x, y, z, r) { SPH.center.set(x, y, z); SPH.radius = r; return FR.intersectsSphere(SPH); }

const MATS = {};
const lam = hex => MATS['l' + hex] || (MATS['l' + hex] = Object.assign(new THREE.MeshLambertMaterial({ color: hex, flatShading: true }), { userData: { keep: true } }));
const bas = hex => MATS['b' + hex] || (MATS['b' + hex] = Object.assign(new THREE.MeshBasicMaterial({ color: hex }), { userData: { keep: true } }));
function addBox (parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/* ═══════════════ 1. девушки у обочины ═══════════════ */

/* сетка-«сеточка» для чулок: ромбы на прозрачном */
let NET = null;
function netMat () {
  if (NET) return NET;
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d');
  x.strokeStyle = '#141014'; x.lineWidth = 1.4;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(16, 16); x.moveTo(16, 0); x.lineTo(0, 16); x.stroke();
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(2, 3);
  tx.magFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace;
  NET = new THREE.MeshLambertMaterial({ map: tx, transparent: true, alphaTest: 0.3 });
  NET.userData.keep = true;
  return NET;
}

const FURS = ['#f2ece4', '#f2a6c8', '#c89a5a', '#26222a', '#c8642a', '#b8b2c8'];
const MINIS = ['#e0287a', '#141216', '#c81e3a', '#7a2ac8', '#c8c8d8', '#d9a520'];
const TOPS = ['#ff4fa8', '#ff2a4a', '#ffd23f', '#8a2be2', '#ffffff', '#1b1a1f', '#3fd0c9'];
const BOOTS = ['#141216', '#c81e3a', '#f4f1ea', '#e0287a', '#5a2a7a'];
const HAIRS = ['#e8cf8f', '#f0e0b0', '#1a1a1a', '#8a3b22', '#d9537a', '#4a3020', '#c0c0c8'];

function woman (seed) {
  const r = k => hash(seed, k, 3.7);
  const at = (arr, k) => arr[Math.floor(r(k) * arr.length) % arr.length];
  const person = A.makePerson({ seed: (seed * 7919) >>> 0, fem: true, fat: false });
  const fur = at(FURS, 1), mini = at(MINIS, 2), top = at(TOPS, 3), boot = at(BOOTS, 4);
  Object.assign(person.look, {
    f: true, age: 'young', fat: false, shape: r(5) < 0.5 ? 'thin' : 'normal',
    top: 'jacket', jacket: fur, shirt: top, bottom: 'shorts', pants: mini, legs: person.look.skin, shoes: boot,
    hair: at(['long', 'ponytail', 'curly', 'bob', 'long'], 6), hairC: at(HAIRS, 7), head: 'none', glasses: r(8) < 0.15 ? 'sun' : 'none',
    eyes: 'lashes', lip: at(['#c23a4a', '#d9608a', '#8a2a3a', '#ff2a6a'], 9), blush: true, pack: null, brows: 'arched', mouth: r(10) < 0.5 ? 'full' : 'smirk',
  });
  const grp = A.makeHuman(person, { fem: true, fat: false, summer: true });
  const u = grp.userData, body = u.parts[2];
  // мини-юбка поверх шорт, меховой воротник и опушка куртки (к туловищу — прячется вместе с ним вдали)
  addBox(body, 0.5, 0.2, 0.32, lam(mini), 0, 0.66, 0);
  addBox(body, 0.48, 0.12, 0.34, lam(fur), 0, 1.31, 0);
  addBox(body, 0.5, 0.07, 0.31, lam(fur), 0, 0.72, 0.004);
  // сапоги до колена и чулки-сетка на бёдрах
  for (const leg of [u.legL, u.legR]) {
    addBox(leg, 0.2, 0.3, 0.21, lam(boot), 0, -0.55, 0.02);
    addBox(leg, 0.06, 0.12, 0.08, lam(boot), 0, -0.64, -0.08);           // каблук
    addBox(leg, 0.165, 0.27, 0.165, netMat(), 0, -0.27, 0);
  }
  // меховые манжеты и сумочка-клатч
  for (const arm of [u.armL, u.armR]) addBox(arm, 0.16, 0.08, 0.16, lam(fur), 0, -0.45, 0);
  addBox(u.armL, 0.05, 0.12, 0.18, lam(at(['#ffd23f', '#141216', '#e0287a', '#f4f1ea'], 11)), 0.05, -0.56, 0.02);
  A.scene.add(grp);
  return { grp, u, x: 0, z: 0, h: 0, ph: hash(seed, 1, 9) * 6, dead: 0, fall: null, wave: 0 };
}

/* место на обочине: ближайшая улица к точке (cx, cz), в 1,8 м за краем полотна, со стороны точки */
function roadside (cx, cz, maxCls, side) {
  const r = A.nearestRoad(cx, cz, maxCls, 2);
  if (!r || r.d > 120) return null;
  const s = r.seg, L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1;
  const ux = (s.x2 - s.x1) / L, uz = (s.z2 - s.z1) / L;
  let nx = -uz, nz = ux;
  if (side ? side < 0 : (cx - r.x) * nx + (cz - r.z) * nz < 0) { nx = -nx; nz = -nz; }
  const off = (s.w || 7) / 2 + 1.8;
  const x = r.x + nx * off, z = r.z + nz * off;
  if (!A.inBounds(x, z, 150) || A.inHouse(x, z, 1.5)) return null;          // не у края карты (там «дорога закрыта»)
  const o = A.nearestRoad(x, z, 7, 1);
  if (o && o.d < (o.seg.w || 5) / 2 + 0.8) return null;              // на другой дороге (перекрёсток, проезд)
  for (const k of [-1.6, 1.6]) if (A.inHouse(x + ux * k, z + uz * k, 0.5)) return null;
  return { x, z, ux, uz, h: Math.atan2(-nx, -nz) };                   // лицом к дороге
}
/* мало домов вокруг — окраина */
function emptyAround (x, z) {
  let n = 0;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, d = 25 + (i % 3) * 25; if (A.inHouse(x + Math.sin(a) * d, z + Math.cos(a) * d, 0)) n++; }
  return n <= 1;
}
function planSpots () {
  const C = A.CITY, cand = [];
  const centroid = p => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
  for (const l of C.lots || []) if (l.k === 'ind' || l.k === 'gar') cand.push({ c: centroid(l.p), kind: l.k, pri: 0 });
  for (const p of C.garlots || []) cand.push({ c: centroid(p), kind: 'gar', pri: 0 });
  const gar = (A.MAP.career && (A.MAP.career.garages || (A.MAP.career.garage ? [A.MAP.career.garage] : []))) || [];
  for (const g of gar) if (g && Number.isFinite(g.x)) cand.push({ c: [g.x + 30, g.z + 30], kind: 'gar', pri: 0 });
  // трассы: магистрали на окраине, через каждые 150 м
  for (const r of C.roads || []) {
    if (!(r.c <= 2) || !r.p || r.p.length < 2) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i], L = Math.hypot(x2 - x1, z2 - z1);
      for (let d = 75; d < L; d += 150) {
        const x = x1 + (x2 - x1) * d / L, z = z1 + (z2 - z1) * d / L;
        if (hash(x, z, 5) < 0.5 && emptyAround(x, z)) cand.push({ c: [x, z], kind: 'road', pri: 0, side: hash(x, z, 6) < 0.5 ? 1 : -1 });
      }
    }
  }
  const pz = DIST.has() ? DIST.list().map(d => d.pizza).filter(Boolean) : [C.meta && C.meta.home].filter(Boolean);
  const ok = [];
  for (const q of cand) {
    const s = roadside(q.c[0], q.c[1], 4, q.side);
    if (!s) continue;
    if (pz.some(p => Math.hypot(p[0] - s.x, p[1] - s.z) < WORK.PIZZA_GAP)) continue;
    if (gar.some(g => g && Math.hypot(g.x - s.x, g.z - s.z) < 25)) continue;
    if (CLUBO && Math.hypot(CLUBO.x - s.x, CLUBO.z - s.z) < 200) continue;
    ok.push({ ...s, kind: q.kind, pri: q.pri, key: hash(s.x, s.z, 2), dist: DIST.has() ? DIST.at(s.x, s.z) : 0 });
  }
  // промзоны, гаражи и трассы — по очереди (трасс-кандидатов в разы больше), внутри вида — по зерну места
  ok.sort((a, b) => a.key - b.key);
  const byKind = ['ind', 'gar', 'road'].map(k => ok.filter(s => s.kind === k));
  ok.length = 0;
  for (let i = 0; byKind.some(l => i < l.length); i++) for (const l of byKind) if (i < l.length) ok.push(l[i]);
  const far = s => SPOTS.every(o => Math.hypot(o.x - s.x, o.z - s.z) >= WORK.GAP);
  // сначала по одному месту на район, потом добираем лучшими
  const used = new Set();
  for (const s of ok) { if (SPOTS.length >= WORK.SPOTS) break; if (!used.has(s.dist) && far(s)) { used.add(s.dist); SPOTS.push(s); } }
  for (const s of ok) { if (SPOTS.length >= WORK.SPOTS) break; if (!SPOTS.includes(s) && far(s)) SPOTS.push(s); }
  SPOTS.forEach((s, i) => {
    const h = hash(s.x, s.z, 11);
    s.n = h < 0.3 ? 1 : h < 0.75 ? 2 : 3;
    s.i = i; s.people = []; s.live = false; s.sayT = 0; s.bubble = null; s.bubT = 0; s.last = -1; s.gen = 0;
  });
  STATS.spots = SPOTS.length;
}

function spawn (s) {
  s.gen++;
  for (let k = 0; k < s.n; k++) {
    const p = woman(s.i * 131 + k * 17 + s.gen * 977);
    const off = (k - (s.n - 1) / 2) * 1.3;
    p.x = s.x + s.ux * off + (hash(s.x, k, 4) - 0.5) * 0.4;
    p.z = s.z + s.uz * off + (hash(s.z, k, 4) - 0.5) * 0.4;
    p.h = s.h + (hash(k, s.x, 8) - 0.5) * 0.9;
    s.people.push(p);
  }
  s.live = true;
  LIVE_N += s.n;
}
function despawn (s) {
  dropBubble(s);
  for (const p of s.people) if (!p.dead) A.dropMesh(p.grp);
  LIVE_N -= s.n;
  s.people = []; s.live = false;
}
function dropBubble (s) {
  if (!s.bubble) return;
  if (s.bubble.parent) s.bubble.parent.remove(s.bubble);
  s.bubble.material.dispose(); s.bubble = null;
}
function say (s, p, text) {
  dropBubble(s);
  s.bubble = A.sayBubble(p.grp, text, '#c2185b', 2.75);
  s.bubT = WORK.SAY_T;
}

function workStep (dt) {
  const V = A.V, night = nightNow();
  if ((scanT -= dt) <= 0) {
    scanT = 0.5;
    frustum();
    for (const s of SPOTS) {
      const d = Math.hypot(s.x - V.x, s.z - V.z);
      const hidden = d > WORK.HIDE_R || !inView(s.x, 1, s.z, 3);
      if (!s.live && night && d < WORK.WANT_R && hidden && LIVE_N + s.n <= WORK.CAP) spawn(s);
      else if (s.live && (d > WORK.DROP_R || (!night && hidden))) despawn(s);
    }
  }
  const sp = Math.hypot(V.vx, V.vz), kmh = sp * 3.6, fx = Math.sin(V.h), fz = Math.cos(V.h);
  let live = 0;
  for (const s of SPOTS) {
    if (!s.live) continue;
    const dS = Math.hypot(s.x - V.x, s.z - V.z);
    if (s.bubble && (s.bubT -= dt) <= 0) dropBubble(s);
    s.sayT -= dt;
    let near = null, nd = Infinity;
    for (const p of s.people) {
      if (p.dead) continue;
      live++;
      const g = p.grp, u = p.u;
      g.visible = dS < 130;
      if (p.fall) {
        if (HITS.fallStep(p, dt)) continue;
        p.h = s.h; g.rotation.set(0, p.h, 0);
        if (s.sayT < 3) { say(s, p, t('эй, полегче!')); s.sayT = WORK.SAY_CD; }
      }
      const d = Math.hypot(p.x - V.x, p.z - V.z);
      if (d < nd) { nd = d; near = p; }
      // наезд — как на любого прохожего (hits.js: медленно — упала и встала, быстрее — сбита)
      if (sp > 3) {
        const dx = p.x - V.x, dz = p.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < A.CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < A.CAR_W + 0.35) {
          if (HITS.isFall(kmh)) { if (!p.fall) HITS.fall(p, V.vx, V.vz); continue; }
          p.dead = 1;
          if (s.bubble && s.bubble.parent === g) dropBubble(s);
          A.dropMesh(g);
          A.gibHuman(p, V.vx, V.vz, kmh);
          A.runOver();
          STATS.hit++;
          continue;
        }
      }
      if (!g.visible) continue;
      // поза: вес на одну ногу, рука на бедре; едешь мимо — машет
      p.ph += dt;
      const wantWave = d < WORK.WAVE_R && sp > 3 ? 1 : 0;
      p.wave += (wantWave - p.wave) * Math.min(1, dt * 5);
      g.position.set(p.x, A.groundH(p.x, p.z) + A.curbAt(p.x, p.z), p.z);
      const toCar = Math.atan2(V.x - p.x, V.z - p.z) - p.h;             // машет — полуоборотом к машине
      g.rotation.set(0, p.h + Math.atan2(Math.sin(toCar), Math.cos(toCar)) * 0.5 * p.wave, Math.sin(p.ph * 1.3) * 0.05);
      u.legL.rotation.x = 0.08; u.legR.rotation.x = -0.12;
      u.armL.rotation.x = -0.15; u.armL.rotation.z = 0.55;                  // рука на бедре
      u.armR.rotation.x = -0.2 - p.wave * 2.5;
      u.armR.rotation.z = p.wave ? -0.25 + Math.sin(p.ph * 9) * 0.45 * p.wave : 0;
      u.head.rotation.y = Math.sin(p.ph * 0.6) * 0.25;
    }
    // остановился рядом — фраза
    if (near && nd < WORK.SAY_R && kmh < WORK.SLOW_KMH && s.sayT <= 0) {
      let k = (Math.random() * LINES.length) | 0;
      if (k === s.last) k = (k + 1) % LINES.length;
      s.last = k;
      say(s, near, t(LINES[k]));
      s.sayT = WORK.SAY_CD;
      STATS.said++;
      if (A.Snd) A.Snd.fx('talk-f', v => v.blip(760, 0.06, 'triangle', 0.05));
    }
  }
  STATS.live = live;
}

/* ═══════════════ 2. стрип-клуб ═══════════════ */

function signTex () {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#12060f'; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#ff4fb0'; x.lineWidth = 5; x.shadowColor = '#ff4fb0'; x.shadowBlur = 14;
  x.strokeRect(8, 8, 496, 112);
  // клубничка: ягода и листики
  x.shadowBlur = 10; x.fillStyle = '#ff2a4a';
  x.beginPath(); x.moveTo(30, 44); x.quadraticCurveTo(62, 30, 94, 44); x.quadraticCurveTo(90, 92, 62, 108); x.quadraticCurveTo(34, 92, 30, 44); x.fill();
  x.fillStyle = '#59e06a'; x.beginPath(); x.moveTo(40, 42); x.lineTo(62, 24); x.lineTo(84, 42); x.lineTo(62, 36); x.fill();
  x.fillStyle = '#ffe680'; for (const [a, b] of [[50, 58], [70, 56], [60, 72], [48, 80], [74, 78], [62, 92]]) x.fillRect(a, b, 4, 5);
  x.fillStyle = '#ffd6f0'; x.shadowColor = '#ff4fb0'; x.shadowBlur = 18;
  x.font = 'bold 52px sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillText(t('Клубничка'), 112, 54);
  x.font = 'bold 22px sans-serif'; x.fillStyle = '#c9a0ff'; x.shadowColor = '#9a5cff';
  x.fillText(t('ночной клуб · 18+ · до утра'), 114, 100);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
function wallTex () {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#2a0838'); g.addColorStop(0.55, '#7a1a78'); g.addColorStop(1, '#ff4fa8');
  x.fillStyle = g; x.fillRect(0, 0, 128, 64);
  // пятна прожекторов и зеркальная полоса
  for (const [a, r] of [[22, 12], [64, 16], [106, 12]]) {
    const q = x.createRadialGradient(a, 30, 1, a, 30, r);
    q.addColorStop(0, 'rgba(255,220,255,.75)'); q.addColorStop(1, 'rgba(255,120,220,0)');
    x.fillStyle = q; x.fillRect(a - r, 30 - r, r * 2, r * 2);
  }
  x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, 8, 128, 3);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

/* дом под клуб: стена у главной улицы, перед ней место под пристройку */
function findWall () {
  const C = A.CITY, D = CLUB.D;
  let target = C.meta && C.meta.home;
  if (DIST.has()) { const L = DIST.list(); const c = L.find(d => /Центр/i.test(d.name)) || L[Math.min(3, L.length - 1)]; if (c && c.pizza) target = c.pizza; }
  if (!target) return null;
  const pz = DIST.has() ? DIST.list().map(d => d.pizza).filter(Boolean) : [target];
  const bars = (C.pois || []).filter(p => p.k === 'food' || p.k === 'cafe').map(p => p.w ? [p.w[0], p.w[1]] : [p.x, p.z]).filter(p => Number.isFinite(p[0]));
  // только данные карты (сборка идёт до деревьев и лавочек — они потом обходят пристройку): место всегда одно и то же
  const busy = [...(C.entrances || []).map(e => [e[0], e[1]]), ...(C.trees || []).map(q => Array.isArray(q) ? q : [q.x, q.z]), ...(C.stops || []).map(q => Array.isArray(q) ? q : [q.x, q.z])]
    .filter(p => p && Number.isFinite(p[0]) && Math.hypot(p[0] - target[0], p[1] - target[1]) < CLUB.SEARCH_R + 50);
  let best = null;
  for (const b of C.buildings) {
    const p = b.p, n = p.length;
    if (!p || n < 3) continue;
    const d0 = Math.hypot(p[0][0] - target[0], p[0][1] - target[1]);
    if (d0 > CLUB.SEARCH_R) continue;
    let cx = 0, cz = 0;
    for (const q of p) { cx += q[0]; cz += q[1]; }
    cx /= n; cz /= n;
    if (pz.some(q => Math.hypot(q[0] - cx, q[1] - cz) < 70)) continue;   // не дом с пиццерией
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n];
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 12) continue;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      let ox = -dz / len, oz = dx / len;
      if (ox * (mx - cx) + oz * (mz - cz) < 0) { ox = -ox; oz = -oz; }
      const ux = dx / len, uz = dz / len, W = Math.min(len - 2, CLUB.W);
      const at = (al, out) => [mx + ux * al + ox * out, mz + uz * al + oz * out];
      const road = A.nearestRoad(...at(0, D + 4), 3, 1);
      if (!road || road.d > 10) continue;
      // пристройка не на дороге и не на чужом доме; перед ней — тротуар хотя бы 3 м
      let fit = true;
      for (let al = -W / 2; al <= W / 2 + 0.01 && fit; al += W / 4) for (const out of [0.6, D / 2, D, D + 3]) {
        const [x, z] = at(al, out);
        if (A.inHouse(x, z, 0.3)) { fit = false; break; }
        const r = A.nearestRoad(x, z, 7, 1);
        if (r && r.d < (r.seg.w || 5) / 2 + (out > D ? 0.3 : 3)) { fit = false; break; }
      }
      if (!fit) continue;
      const [fx, fz] = at(0, D / 2), R = W / 2 + 1.5;
      if (busy.some(q => Math.hypot(q[0] - fx, q[1] - fz) < R && Math.abs((q[0] - mx) * ox + (q[1] - mz) * oz) < D + 1.2 && Math.abs((q[0] - mx) * ux + (q[1] - mz) * uz) < W / 2 + 1)) continue;
      const dist = Math.hypot(mx - target[0], mz - target[1]);
      if (dist < 120) continue;                                             // не вплотную к пиццерии района
      const nearBars = bars.filter(q => Math.hypot(q[0] - mx, q[1] - mz) < 120).length;
      const score = dist - Math.min(3, nearBars) * 90 - (road.seg.c <= 2 ? 80 : 0) - W * 6;
      if (!best || score < best.score) best = { score, mx, mz, ox, oz, ux, uz, W, len, road, b };
    }
  }
  return best;
}

function dancer (seed, skinTint) {
  const person = A.makePerson({ seed: (seed * 104729) >>> 0, fem: true, fat: false });
  const L = person.look;
  Object.assign(L, { f: true, age: 'young', fat: false, shape: 'thin', head: 'none', glasses: 'none', pack: null, eyes: 'lashes', lip: '#ff2a6a', blush: true,
    hair: ['long', 'ponytail', 'curly'][seed % 3], hairC: ['#e8cf8f', '#1a1a1a', '#d9537a'][seed % 3], shoes: '#e8e0f0' });
  const grp = A.makeHuman(person, { fem: true, fat: false, shirt: L.skin, pants: L.skin, summer: true });
  if (A.unLod) A.unLod(grp);                     // всегда ближний вариант: дальний — одним мешем, без купальника
  const u = grp.userData, body = u.parts[2];
  const kit = ['#ff2a8a', '#141216', '#f4f1ea'][seed % 3], km = lam(kit);
  for (const s of [-1, 1]) addBox(body, 0.15, 0.11, 0.035, km, s * 0.085, 1.12, 0.135);   // купальник: чашки
  addBox(body, 0.455, 0.035, 0.27, km, 0, 1.15, 0);
  addBox(body, 0.455, 0.12, 0.275, km, 0, 0.75, 0);                                        // низ
  for (const leg of [u.legL, u.legR]) addBox(leg, 0.19, 0.18, 0.26, lam('#e8e0f0'), 0, -0.62, 0.03);   // туфли на платформе
  // «под розовым светом»: свет зала свой, от ночи на улице не темнеет
  const vc = new THREE.MeshBasicMaterial({ vertexColors: true, color: skinTint }); vc.userData.keep = true;
  grp.traverse(o => {
    if (!o.isMesh) return;
    if (o.material === A.HUMAN_VC) o.material = vc;
    else if (o.material.map) { const m = new THREE.MeshBasicMaterial({ map: o.material.map, alphaTest: 0.5, color: skinTint }); m.userData.keep = true; o.material = m; }
    else if (o.material.isMeshLambertMaterial) { const m = new THREE.MeshBasicMaterial({ color: o.material.color.clone().multiply(new THREE.Color(skinTint)) }); m.userData.keep = true; o.material = m; }
  });
  return grp;
}

function buildClub () {
  const f = findWall();
  if (!f) return null;
  const { W } = f, D = CLUB.D, H = CLUB.H;
  const ry = Math.atan2(f.ox, f.oz);
  const at = (al, out) => [f.mx + f.ux * al + f.ox * out, f.mz + f.uz * al + f.oz * out];
  // пол — по самой высокой точке земли под пристройкой, иначе склон торчит сквозь пол
  let gy = -Infinity;
  for (const al of [-W / 2, 0, W / 2]) for (const out of [0.3, D / 2, D]) gy = Math.max(gy, A.groundH(...at(al, out)));
  gy += 0.05;
  // в системе группы: +Z — на улицу, X — вдоль стены (знак сверим по ux)
  const root = new THREE.Group();
  root.position.set(f.mx, gy, f.mz);
  root.rotation.y = ry;
  root.updateMatrixWorld(true);
  const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion);
  const sx = lx.x * f.ux + lx.z * f.uz > 0 ? 1 : -1;                     // локальный X → вдоль ux
  const P = (al, out) => at(al * sx, out);
  // коробка пристройки — в общую склейку города (темнеет ночью вместе с домами)
  const dark = '#2a1f2e', trim = '#151018';
  for (const s of [-1, 1]) { const [x, z] = at(s * (W / 2 - 0.15), D / 2); A.box(A.LIT, 0.3, H, D, dark, x, gy + H / 2, z, ry); }
  { const [x, z] = at(0, D / 2); A.box(A.LIT, W + 0.4, 0.35, D + 0.4, trim, x, gy + H + 0.17, z, ry); }
  { const [x, z] = at(0, D - 0.15); A.box(A.LIT, W, 0.9, 0.3, trim, x, gy + H - 0.45, z, ry); A.box(A.LIT, W, 0.5, 0.3, trim, x, gy + 0.25, z, ry); }
  const doorAl = W / 2 - 1.3, winW = W - 2.8, winC = -1.3;                // дверь с краю, витрина — остальное
  for (const al of [winC - winW / 2, winC + winW / 2, doorAl + 0.8, winC - winW / 6, winC + winW / 6]) {
    const [x, z] = P(al, D - 0.15); A.box(A.LIT, 0.22, H - 1.4, 0.32, trim, x, gy + 0.5 + (H - 1.4) / 2, z, ry);
  }
  { const [x, z] = P(0, D / 2); A.obb(x, z, W / 2, D / 2, Math.atan2(-f.ox, f.oz)); }   // в пристройку не въехать
  if (A.addFoot) A.addFoot([at(-W / 2, 0.2), at(W / 2, 0.2), at(W / 2, D), at(-W / 2, D)]);
  // вывеска на крыше: подложка и неон
  const signW = Math.min(W - 1, 7.5), signH = signW / 4;
  { const [x, z] = at(0, D - 0.35); A.box(A.LIT, signW + 0.3, signH + 0.3, 0.25, trim, x, gy + H + 0.35 + signH / 2, z, ry); }
  const signMat = new THREE.MeshBasicMaterial({ map: signTex() });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), signMat);
  sign.position.set(0, H + 0.35 + signH / 2, D - 0.2);
  root.add(sign);
  // зал: стены, пол, потолок (свой свет — MeshBasic, днём гаснет)
  const hall = new THREE.Group(); root.add(hall);
  const wallM = new THREE.MeshBasicMaterial({ map: wallTex() });
  const floorM = new THREE.MeshBasicMaterial({ color: '#3a1238' }), ceilM = new THREE.MeshBasicMaterial({ color: '#1c0820' }), sideM = new THREE.MeshBasicMaterial({ color: '#5a1a62' });
  const pl = (w, h, m, x, y, z, rx, ry2) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.set(x, y, z); o.rotation.set(rx || 0, ry2 || 0, 0); hall.add(o); return o; };
  pl(W - 0.3, H, wallM, 0, H / 2, 0.08);
  pl(W - 0.3, D, floorM, 0, 0.03, D / 2, -Math.PI / 2);
  pl(W - 0.3, D, ceilM, 0, H - 0.02, D / 2, Math.PI / 2);
  pl(D, H, sideM, -(W / 2 - 0.31), H / 2, D / 2, 0, Math.PI / 2);
  pl(D, H, sideM, W / 2 - 0.31, H / 2, D / 2, 0, -Math.PI / 2);
  // сцена с неоновой кромкой и шесты
  const stW = Math.min(W - 3, 9), stZ = 1.05;
  addBox(hall, stW, 0.5, 1.6, new THREE.MeshBasicMaterial({ color: '#2a0a30' }), 0, 0.25, stZ);
  const edgeM = new THREE.MeshBasicMaterial({ color: '#ff4fb0' });
  addBox(hall, stW, 0.05, 0.05, edgeM, 0, 0.5, stZ + 0.8);
  const poleM = new THREE.MeshBasicMaterial({ color: '#f0eef8' });
  const poleGeo = new THREE.CylinderGeometry(0.035, 0.035, H - 0.5, 8);
  const dancers = [];
  const tints = ['#ffc8ec', '#e8c0ff', '#ffd0e0'];
  for (let i = 0; i < CLUB.DANCERS; i++) {
    const px = (i - (CLUB.DANCERS - 1) / 2) * (stW / CLUB.DANCERS);
    const pole = new THREE.Mesh(poleGeo, poleM);
    pole.position.set(px, 0.5 + (H - 0.5) / 2, stZ);
    hall.add(pole);
    const piv = new THREE.Group(); piv.position.set(px, 0.5, stZ); hall.add(piv);
    const g = dancer(i, tints[i]);
    g.position.set(0, 0, 0.3);
    piv.add(g);
    dancers.push({ g, u: g.userData, piv, mode: ['spin', 'climb', 'sway'][i % 3], ph: i * 1.7 });
  }
  // гости: тёмные силуэты спиной к улице на табуретах
  const guestM = new THREE.MeshBasicMaterial({ color: '#12060f' });
  const guests = [];
  for (let i = 0; i < CLUB.GUESTS; i++) {
    const gx = (i - (CLUB.GUESTS - 1) / 2) * ((W - 2) / CLUB.GUESTS) + (hash(i, W, 1) - 0.5) * 0.5, gz = 3.3 + hash(i, W, 2) * 0.6;   // у витрины: с улицы — ниже сцены
    const g = new THREE.Group(); g.position.set(gx, 0, gz); hall.add(g);
    addBox(g, 0.36, 0.45, 0.36, guestM, 0, 0.22, 0);                     // табурет
    addBox(g, 0.5, 0.55, 0.3, guestM, 0, 0.72, 0);                        // спина
    addBox(g, 0.32, 0.32, 0.3, guestM, 0, 1.17, 0);                       // голова
    const arm = new THREE.Group(); arm.position.set(0.3, 0.95, 0); g.add(arm);
    addBox(arm, 0.13, 0.5, 0.13, guestM, 0, -0.25, 0);
    guests.push({ g, arm, up: 0, ph: hash(i, 3, 3) * 6 });
  }
  // лучи прожекторов
  const beams = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.MeshBasicMaterial({ color: '#ff6ad0', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.9, H - 0.6, 12, 1, true), m);
    b.position.set((i ? 1 : -1) * stW / 4, H / 2 + 0.25, stZ + 0.3);
    hall.add(b);
    beams.push(b);
  }
  // стекло витрины и двери, неоновые трубки по краю витрины
  const glassM = new THREE.MeshBasicMaterial({ color: '#ff9ad8', transparent: true, opacity: 0.12, depthWrite: false });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, H - 1.4), glassM);
  glass.position.set(winC, 0.5 + (H - 1.4) / 2, D - 0.12); root.add(glass);
  const doorM = new THREE.MeshBasicMaterial({ color: '#1a0a1c' });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.3), doorM);
  door.position.set(doorAl, 1.15, D + 0.02); root.add(door);
  const tubeA = new THREE.MeshBasicMaterial({ color: '#ff4fb0' }), tubeB = new THREE.MeshBasicMaterial({ color: '#b46cff' });
  const nT = 8;
  for (let i = 0; i < nT; i++) {
    const w = winW / nT, xx = winC - winW / 2 + (i + 0.5) * w;
    addBox(root, w * 0.92, 0.06, 0.06, i % 2 ? tubeB : tubeA, xx, H - 0.95, D + 0.03);
    addBox(root, w * 0.92, 0.06, 0.06, i % 2 ? tubeA : tubeB, xx, 0.55, D + 0.03);
  }
  addBox(root, 1.3, 0.06, 0.06, tubeA, doorAl, 2.4, D + 0.03);              // над дверью
  // розовое пятно света на тротуаре
  const poolM = new THREE.MeshBasicMaterial({ color: '#ff4fb0', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 20), poolM);
  pool.rotation.x = -Math.PI / 2; pool.scale.set(W / 2, 2.4, 1); pool.position.set(winC * 0.5, 0.08, D + 2.2);
  root.add(pool);
  A.scene.add(root);
  const [cx, cz] = at(0, D / 2);
  const C = {
    root, hall, sign, signMat, wallM, floorM, ceilM, sideM, glassM, tubeA, tubeB, poolM, edgeM, pool, beams, dancers, guests,
    x: cx, z: cz, ox: f.ox, oz: f.oz, W, street: f.road.seg.name || '', b: f.b, open: null, t: 0, flick: 2, tube: 0,
  };
  return C;
}

const C_ON = { wall: new THREE.Color('#ffffff'), floor: new THREE.Color('#3a1238'), ceil: new THREE.Color('#1c0820'), side: new THREE.Color('#5a1a62'), glass: new THREE.Color('#ff9ad8') };
const C_OFF = { wall: new THREE.Color('#141218'), floor: new THREE.Color('#0e0c10'), ceil: new THREE.Color('#0c0a0e'), side: new THREE.Color('#121016'), glass: new THREE.Color('#1c2630') };
function setOpen (C, on) {
  C.open = on;
  const K = on ? C_ON : C_OFF;
  C.wallM.color.copy(K.wall); C.floorM.color.copy(K.floor); C.ceilM.color.copy(K.ceil); C.sideM.color.copy(K.side);
  C.glassM.color.copy(K.glass); C.glassM.opacity = on ? 0.12 : 0.85;
  C.signMat.color.set(on ? '#ffffff' : '#3a3036');
  C.tubeA.color.set(on ? '#ff4fb0' : '#2a1a26'); C.tubeB.color.set(on ? '#b46cff' : '#221a2a'); C.edgeM.color.set(on ? '#ff4fb0' : '#1a1018');
  C.pool.visible = on;
  for (const b of C.beams) b.visible = on;
  for (const d of C.dancers) d.piv.visible = on;
  for (const g of C.guests) g.g.visible = on;
}

function clubStep (dt) {
  const C = CLUBO;
  if (!C) return;
  const V = A.V, d = Math.hypot(C.x - V.x, C.z - V.z);
  C.root.visible = d < CLUB.SHOW_R;
  if (!C.root.visible) return;
  const open = clubOpen();
  if (open !== C.open) setOpen(C, open);
  if (!open) return;
  C.t += dt;
  // неон: вывеска изредка мигает, трубки бегут
  if ((C.flick -= dt) <= 0) C.flick = rand(3, 7);
  const fl = C.flick < 0.32 && ((C.flick * 30) | 0) % 2 === 0;
  C.signMat.color.setScalar(fl ? 0.35 : 1);
  if ((C.tube -= dt) <= 0) {
    C.tube = 0.45;
    C.ph = !C.ph;
    C.tubeA.color.set(C.ph ? '#ff4fb0' : '#5a1a48'); C.tubeB.color.set(C.ph ? '#4a2a6a' : '#b46cff');
  }
  if (d > CLUB.ANIM_R) return;
  frustum();
  if (!inView(C.x, 2, C.z, C.W / 2 + 2)) return;
  STATS.clubAnim++;
  const tt = C.t;
  for (const q of C.dancers) {
    const u = q.u, k = tt + q.ph;
    if (q.mode === 'spin') {                      // крутится вокруг шеста, держась одной рукой
      q.piv.rotation.y += dt * 1.1;
      q.g.rotation.set(0, Math.PI / 2, Math.sin(k * 2) * 0.12 - 0.15);
      u.armL.rotation.set(-2.8, 0, 0.35);
      u.armR.rotation.set(-0.6 + Math.sin(k * 2.2) * 0.5, 0, -0.3);
      u.legL.rotation.x = Math.sin(k * 2) * 0.45; u.legR.rotation.x = -0.25 - Math.sin(k * 2) * 0.25;
      q.g.position.y = 0;
    } else if (q.mode === 'climb') {              // лезет вверх и медленно соскальзывает, ноги обвиты
      q.piv.rotation.y += dt * 0.5;
      const up = (Math.sin(k * 0.55) * 0.5 + 0.5) * 1.1;
      q.g.position.set(0, up, 0.2);
      q.g.rotation.set(0, 0, Math.sin(k * 1.5) * 0.08);
      u.armL.rotation.set(-2.9, 0, -0.2); u.armR.rotation.set(-2.7, 0, 0.2);
      u.legL.rotation.x = -0.7; u.legR.rotation.x = 0.5;
    } else {                                     // танцует у шеста лицом к залу
      q.piv.rotation.y = Math.sin(k * 0.4) * 0.6;
      q.g.position.set(0, Math.abs(Math.sin(k * 2.4)) * 0.05, 0.35);
      q.g.rotation.set(0, Math.sin(k * 0.8) * 0.4, Math.sin(k * 2.4) * 0.12);
      u.armL.rotation.set(-2.6 + Math.sin(k * 2.4) * 0.3, 0, 0.3); u.armR.rotation.set(-2.6 - Math.sin(k * 2.4) * 0.3, 0, -0.3);
      u.legL.rotation.x = Math.sin(k * 2.4) * 0.2; u.legR.rotation.x = -Math.sin(k * 2.4) * 0.2;
    }
  }
  for (const g of C.guests) {                    // иногда кто-то поднимает руку
    g.ph += dt;
    if (g.up <= 0 && Math.random() < dt * 0.15) g.up = rand(1.2, 2.2);
    g.up -= dt;
    g.arm.rotation.x = g.up > 0 ? -2.6 + Math.sin(g.ph * 8) * 0.25 : 0;
    g.g.rotation.z = Math.sin(g.ph * 1.7) * 0.03;
  }
  for (let i = 0; i < C.beams.length; i++) {
    const b = C.beams[i];
    b.rotation.z = Math.sin(tt * 0.9 + i * 2) * 0.35;
    b.material.color.setHSL(0.8 + Math.sin(tt * 0.5 + i) * 0.12, 1, 0.6);
  }
}

/* ═══════════════ подключение ═══════════════ */

/* один раз при сборке города (game.js buildCity, только ADULT) */
export function build (api) {
  A = api;
  try { CLUBO = buildClub(); } catch (e) { console.warn('nightlife: club', e); CLUBO = null; }
  if (CLUBO) STATS.club = { x: Math.round(CLUBO.x), z: Math.round(CLUBO.z), W: Math.round(CLUBO.W * 10) / 10, street: CLUBO.street };
  planSpots();
  if (typeof window !== 'undefined' && window.__dlv) window.__dlv.NIGHT = DEBUG;
  else if (typeof window !== 'undefined') setTimeout(() => { if (window.__dlv) window.__dlv.NIGHT = DEBUG; }, 0);
}
export function step (dt, api) {
  if (api) A = Object.assign(A || {}, api);
  if (!A || !A.ENV) return;
  workStep(dt);
  clubStep(dt);
}

export const DEBUG = {
  WORK, CLUB, SPOTS, STATS, LINES,
  get club () { return CLUBO; },
  get live () { return LIVE_N; },
  hour: () => clockH(),
  rescan: () => { scanT = 0; },
};
