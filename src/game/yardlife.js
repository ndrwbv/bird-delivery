/* ──────────────────────────────────────────────────────────────────────────
   Жизнь во дворах (автор 12.10.2026: «дворы пустоватые… надо, чтобы люди ходили и тусили во дворах:
   бухают, шашлыки жарят, катаются на горках, занимаются спортом»). Правила словами — docs/CAREER.md
   «Город: как выглядит» → «Жизнь во дворах».

   Только рядом с курьером: раз в секунду смотрим, какую сцену убрать (ушёл дальше YL.DROP м, наступила
   ночь, сменилась погода) и какую завести (до YL.WANT м, в кадре — не ближе YL.MIN_IN м, вне кадра —
   YL.MIN_OUT м). Сцены не ближе YL.GAP м друг к другу — на двор выходит 1—3. Люди сцены появляются
   по одному в кадр (из запаса людей, humanpool.js); в кадре — вырастают из земли за полсекунды.

   Сцены (KIND — где и когда, веса по сезону и времени):
     bench    — бабки на лавочке двора: 2—3, сидят, вертят головой за машиной, ворчат вслед;
     smoke    — курят у подъезда 1—2 (детская — смотрят в телефон);
     beer     — компания кругом 3—5 с пивом (детская — с газировкой), смеются, отпивают; остаётся и ночью;
     garage   — мужики у гаража-ракушки 2—3 с бутылкой (детская — с термосом);
     shashlik — мангал с дымком, один машет картонкой над углями, 2—4 стоят рядом (лето);
     domino   — столик и две лавки, четверо стучат костяшками (лето, межсезонье);
     ball     — 2—3 пинают мяч друг другу (лето);
     snowman  — лепят снеговика: один катает ком, растёт, ставят наверх, остальные лепят (зима);
     sled     — катаются с ледяной горки двора (seasons.js): лезут по ступенькам, едут сидя, обходят назад (зима).
   Плюс гуляющие (WALK): идут от подъезда к подъезду по прямой, которая не режет дома, заборчики и
   карманы парковки (проезд можно только перейти), стоят, идут дальше; у четверти — собака; зимой
   у части — лыжи и палки.

   Наезд — как на любого прохожего (hits.js): медленнее HITS.TIER.FALL — падает и встаёт обратно на
   место, быстрее — сбит (A.gibHuman, счёт «прохожих сбито»). Едешь на сцену быстрее YL.FLEE.KMH —
   разбегаются из-под колёс с поднятыми руками и возвращаются. Рядом кого-то сбили (game.js scare) —
   тоже разбегаются. Мангал, столик и снеговик сносятся машиной (летят клубы).

   init(api) — game.js; step(dt) — каждый кадр (CL.step); scare(x, z, r) — из game.js scare.
   ?noyl — без жизни во дворах (сравнить кадр). Отладка: __dlv.YLIFE (ST, SCENES, WALKERS, force(kind)).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import { holdFixed } from './people.js';
import * as SEAS from './seasons.js';
import * as PETW from './petwear.js';          // зимой собаки в одёжках (petwear.js)
import * as HITS from './hits.js';
import * as FXP from './fxpool.js';
import * as YARDS from './yards.js';
import * as YCARS from './yardcars.js';
import * as YMAZE from './yardmaze.js';          // клумбы, кусты, лесочки, заборы у тротуаров (yardmaze.js)
import * as COURTS from './courts.js';          // корты: сцены внутрь не встают (courts.js)
import * as LAWNP from './lawnprops.js';
import { onPave } from './pave.js';
import { inView } from './cull.js';
import { MOB, CLEAN } from './mobile.js';

export const YL = {
  WANT: 150, MIN_IN: 70, MIN_OUT: 30, DROP: 215, SCAN: 1,
  /* стоишь (медленнее STILL м/с: у клиента, домофон, разговор) — новые сцены и гуляющие не ближе MIN_IN, даже вне кадра
     (автор 23.10.2026, 0п0: «привёз заказ — после доставки рядом появляется множество людей»: пока стоял у двери,
     двор за спиной камеры заполнялся сценами с 22 м — развернулся, а вокруг толпа) */
  STILL: 2,
  SPOT_R: 118,                                   // место сцены у подъезда считаем, только когда подъезд ближе (мелочь газона уже собрана)
  SCENES: { day: 7, night: 3, rain: 3 },         // сцен рядом с курьером
  WALK: { day: 5, night: 2, rain: 2 },           // гуляющих
  PEOPLE: 30,                                    // всего людей модуля
  GAP: 30, GAP_SMALL: 16, SAME: 70,              // м между сценами; маленькие (лавочка, курилка) — GAP_SMALL; одна и та же — не ближе SAME
  ANIM: 50,                                      // ближе — шевелятся (дальше — дальняя модель-статуя)
  FLEE: { R: 16, LAT: 3.6, SPD: 4.3, T: [1.3, 2.2], KMH: 18 },
  TALK: [5, 11], SAY_R: 45, SAYS: 3,
  CLIENT: 14,                                    // не ближе к ждущему клиенту и его пину
  WALKER: { SPD: [1.0, 1.4], WAIT: [1.5, 6], DOG: 0.25, SKI: 0.3, NEAR: [15, 70], DROP: 175 },
};
const LOW = MOB.on;                              // телефон — меньше
let OFF = typeof location !== 'undefined' && /[?&]noyl\b/.test(location.search);

/* где и когда: веса по сезону (win — снег лежит, sum — тепло, mid — межсезонье), ночью — night (0 — нет) */
const KIND = {
  bench: { w: { win: 0.7, sum: 1.4, mid: 1.1, night: 0, rain: 0 }, gap: 'small' },
  smoke: { w: { win: 1, sum: 0.8, mid: 1, night: 1, rain: 1 }, gap: 'small' },
  beer: { w: { win: 0.8, sum: 1, mid: 1, night: 1.6, rain: 0.3 } },
  garage: { w: { win: 1.3, sum: 0.6, mid: 0.9, night: 0.9, rain: 0.6 } },
  shashlik: { w: { win: 0, sum: 1.6, mid: 0.7, night: 0.6, rain: 0 } },
  domino: { w: { win: 0, sum: 1.3, mid: 0.8, night: 0, rain: 0 } },
  ball: { w: { win: 0, sum: 1.1, mid: 0.6, night: 0, rain: 0 } },
  snowman: { w: { win: 1.3, sum: 0, mid: 0, night: 0, rain: 0 } },
  sled: { w: { win: 2.2, sum: 0, mid: 0, night: 0, rain: 0 } },
};

/* реплики — ru здесь, en в src/i18n/en.json */
const LINES = {
  beer: [N_('за нас!'), N_('ну, будем!'), N_('ха-ха-ха!'), N_('да ладно?!'), N_('ещё по одной?'), N_('а я ей говорю…'), N_('*ик*')],
  beerK: [N_('ха-ха-ха!'), N_('да ладно?!'), N_('а я ей говорю…'), N_('ну ты дал!')],
  garage: [N_('ну, за карбюратор!'), N_('Михалыч, наливай'), N_('сцепление менять надо'), N_('это не стук, это норма')],
  garageK: [N_('Михалыч, ключ на двенадцать!'), N_('сцепление менять надо'), N_('это не стук, это норма')],
  shashlik: [N_('под шашлычок!'), N_('Серёга, переворачивай!'), N_('мясо — огонь'), N_('кто взял кетчуп?')],
  shashlikK: [N_('Серёга, переворачивай!'), N_('мясо — огонь'), N_('кто взял кетчуп?')],
  domino: [N_('Рыба!'), N_('дубль!'), N_('пусто-пусто'), N_('ходи давай')],
  bench: [N_('наркоман!'), N_('носятся тут…'), N_('при Союзе такого не было'), N_('опять пиццу таскает'), N_('проститутка!')],
  benchK: [N_('носятся тут…'), N_('при Союзе такого не было'), N_('опять пиццу таскает'), N_('молодой человек, потише!')],
  sled: [N_('и-и-иха!'), N_('ещё разок!'), N_('держись!')],
  snowman: [N_('катай больше!'), N_('нос — морковку!'), N_('кривой какой-то')],
  ball: [N_('пас!'), N_('лови!'), N_('мимо!')],
  smoke: [N_('есть закурить?'), N_('кхе-кхе'), N_('дай огоньку')],
  smokeK: [N_('алло?'), N_('ага, щас выйду'), N_('мам, я у подъезда')],
  flee: [N_('ты чё?!'), N_('тормози!'), N_('псих!')],
};
const COL = { beer: '#5a7a2a', garage: '#6b5a3a', shashlik: '#a8552a', domino: '#3a5a8a', bench: '#8a3b5a', sled: '#3f7fd6', snowman: '#3f7fd6',
  ball: '#3f8f4d', smoke: '#5a5a6a', flee: '#c0392b' };

let A = null;
const SCENES = [], WALKERS = [];
let FRESH = 0, VIS = 130;                        // мест у подъездов посчитать за обход (дорого: до 54 проверок на место); дальность людей
const SPOT = new Map(), DOOR = new Map(), WPT = new Map();
let EG = null;                                   // подъезды в сетке по 50 м
const ST = { scanMax: 0, scanBig: 0, spawnMax: 0, spawnBig: 0, holdMax: 0, scenes: 0, people: 0, walkers: 0, spawned: 0, dropped: 0, hit: 0, falls: 0, flee: 0, knocked: 0, kinds: {}, says: 0, spotMs: 0, spots: 0 };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const hsh = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const dist = (x, z) => Math.sqrt((x - A.V.x) * (x - A.V.x) + (z - A.V.z) * (z - A.V.z));

/* ── обстановка: сезон, ночь, дождь ── */
function mode () {
  const ENV = A.ENV, snowy = SEAS.snowy(), night = (ENV.night || 0) > 0.55, rain = !snowy && (ENV.rain || 0) > 0.5;
  const sea = snowy ? 'win' : SEAS.warmth() < 0.35 ? 'sum' : 'mid';
  return { sea, night, rain, key: night ? 'night' : rain ? 'rain' : 'day' };
}
function weight (kind, M) {
  const w = KIND[kind].w;
  if (M.night) return w[M.sea] > 0 || kind === 'beer' || kind === 'garage' || kind === 'smoke' ? w.night : 0;
  if (M.rain) return w.rain;
  return w[M.sea];
}

/* ── места ── */
function ground (x, z) { return A.groundH(x, z) + A.curbAt(x, z); }
/* точка свободна под человека / вещь: не вода, не дом, не дорога (m — запас от края полотна), не тротуар и дорожка,
   не карман парковки, не заборчик и лавочка, не твёрдое (деревья, столбы), не мелочь газона (ракушки, бельё, песок) */
function ptOk (x, z, m, pave = true) {
  if (A.groundH(x, z) < 0.3 || !A.inBounds(x, z, 10)) return false;
  if (A.inHouse(x, z, 1.2)) return false;
  const r = A.nearestRoad(x, z, 7, 1);
  if (r && r.d < r.seg.w / 2 + m) return false;
  if (pave && onPave(x, z, 0.2)) return false;
  if (YCARS.blocks(x, z, 0.8)) return false;
  if (YARDS.blocks(x, z, 0.4)) return false;
  if (YMAZE.blocks(x, z, 0.4)) return false;
  if (COURTS.blocks(x, z, 0.4)) return false;
  if (A.solidAt(x, z, 0.5)) return false;
  if (LAWNP.busy(x, z, 1)) return false;
  return true;
}
function areaOk (x, z, r) {
  if (!ptOk(x, z, 2.5)) return false;
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (!ptOk(x + Math.sin(a) * r, z + Math.cos(a) * r, 1)) return false; }
  return true;
}
/* место сцены у подъезда i: 9—22 м перед дверью, вбок до 8 м; одно и то же для подъезда (по зерну) */
function yardSpot (i) {
  if (SPOT.has(i)) return SPOT.get(i);
  const t0 = performance.now();
  const [ex, ez, nx, nz] = A.CITY.entrances[i];
  let res = null;
  for (let k = 0; k < 6 && !res; k++) {
    const d = 9 + hsh(ex, ez, k) * 13, lat = (hsh(ez, ex, k + 7) - 0.5) * 16;
    const x = ex + nx * d + nz * lat, z = ez + nz * d - nx * lat;
    if (areaOk(x, z, 2.6)) res = { x, z, face: Math.atan2(-nx, -nz), i, big: areaOk(x, z, 4.2) ? 1 : 0, on: null };
  }
  SPOT.set(i, res);
  ST.spots++; ST.spotMs += performance.now() - t0;
  return res;
}
/* у двери подъезда — курят: в 1,8 м перед дверью */
function doorSpot (i) {
  if (DOOR.has(i)) return DOOR.get(i);
  const [ex, ez, nx, nz] = A.CITY.entrances[i];
  let res = null;
  for (const lat of [0.9, -0.9, 1.8, -1.8]) {
    const x = ex + nx * 1.9 + nz * lat, z = ez + nz * 1.9 - nx * lat;
    if (A.inHouse(x, z, 0.3) || A.solidAt(x, z, 0.35) || YCARS.blocks(x, z, 0.6) || YARDS.blocks(x, z, 0.25)) continue;
    const r = A.nearestRoad(x, z, 7, 1);
    if (r && r.seg.c <= 6 && r.d < r.seg.w / 2 + 0.6) continue;
    res = { x, z, face: Math.atan2(nx, nz), tx: nz, tz: -nx, i, on: null };
    break;
  }
  DOOR.set(i, res);
  return res;
}
/* куда ходят гуляющие: в 3,2 м перед дверью */
function walkPt (i) {
  if (WPT.has(i)) return WPT.get(i);
  const [ex, ez, nx, nz] = A.CITY.entrances[i];
  const x = ex + nx * 3.2, z = ez + nz * 3.2;
  const ok = !A.inHouse(x, z, 0.4) && !A.solidAt(x, z, 0.35) && !YCARS.blocks(x, z, 0.4) && !YARDS.blocks(x, z, 0.25) && A.groundH(x, z) >= 0.3;
  const res = ok ? { x, z, i } : null;
  WPT.set(i, res);
  return res;
}
/* прямая для гуляющего: не через дом, твёрдое, заборчик, карман; проезд — только перейти (≤ 3 точек на полотне) */
function lineOk (ax, az, bx, bz) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 1.5));
  let road = 0;
  for (let k = 1; k < n; k++) {
    const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
    if (A.inHouse(x, z, 0.5) || A.solidAt(x, z, 0.3) || YCARS.blocks(x, z, 0.2) || YARDS.blocks(x, z, 0.2)) return false;
    const r = A.nearestRoad(x, z, 7, 1);
    if (r && r.seg.c <= 7 && r.d < r.seg.w / 2 && ++road > 3) return false;
  }
  return true;
}
function entGrid () {
  if (EG) return EG;
  EG = new Map();
  const E = A.CITY.entrances;
  for (let i = 0; i < E.length; i++) { const k = Math.floor(E[i][0] / 50) * 65536 + Math.floor(E[i][1] / 50); let a = EG.get(k); if (!a) EG.set(k, a = []); a.push(i); }
  return EG;
}
function entsNear (x, z, R, fn) {
  const G = entGrid(), E = A.CITY.entrances;
  for (let i = Math.floor((x - R) / 50); i <= Math.floor((x + R) / 50); i++)
    for (let j = Math.floor((z - R) / 50); j <= Math.floor((z + R) / 50); j++) {
      const a = G.get(i * 65536 + j);
      if (a) for (const e of a) { const d = Math.hypot(E[e][0] - x, E[e][1] - z); if (d <= R) fn(e, d); }
    }
}

/* ── предметы в руки: в меш тела (people.js holdFixed) — без своих вызовов отрисовки ── */
const MATS = new Map();
function mat (hex) {
  let m = MATS.get(hex);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); m.userData.keep = true; MATS.set(hex, m); }
  return m;
}
function hold (grp, kind) {
  const u = grp.userData;
  let g = null, hex = 0, x = 0, y = -0.55, z = 0.1, bone = u.armR;
  switch (kind) {
    case 'bottle': g = new THREE.CylinderGeometry(0.045, 0.055, 0.27, 6); hex = pick([0x5a3a16, 0x2f5a2a, 0x6b4a1a]); break;
    case 'can': g = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8); hex = pick([0xe04836, 0x4f7fd6, 0x59b06a, 0xffd23f]); break;
    case 'cup': g = new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8); hex = pick([0xd95d5d, 0x4f7fd6, 0xf4f1ea]); break;
    case 'cig': g = new THREE.BoxGeometry(0.016, 0.09, 0.016); hex = 0xf4f1ea; y = -0.6; z = 0.06; break;
    case 'phone': g = new THREE.BoxGeometry(0.07, 0.13, 0.015); hex = 0x1f2328; y = -0.6; z = 0.09; break;
    case 'fan': g = new THREE.BoxGeometry(0.26, 0.22, 0.012); hex = 0xc9a46a; y = -0.64; z = 0.12; break;
    case 'pole': g = new THREE.BoxGeometry(0.03, 1.15, 0.03); hex = 0x2b2a30; y = -0.95; z = 0.05; break;
    default: return;
  }
  const m = new THREE.Mesh(g, mat(hex));
  m.position.set(x, y, z);
  holdFixed(bone, m);
  if (kind === 'pole') { const m2 = new THREE.Mesh(g.clone(), mat(hex)); m2.position.set(x, y, z); holdFixed(u.armL, m2); }
}
/* лыжи — на ноги, носками вперёд */
function skis (grp) {
  const u = grp.userData;
  for (const leg of [u.legL, u.legR]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 1.7), mat(pick([0xc9302c, 0x2f5fa8, 0xe0b13f])));
    m.position.set(0, -leg.position.y + 0.03, 0.25);
    holdFixed(leg, m);
  }
}

/* ── вещи сцены: одной склейкой с общим материалом людей (цвета вершин) — один вызов ── */
function propMesh (fn) {
  const L = [];
  fn((w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) => A.put(L, new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, ry, rz),
    (r, hex, x, y, z) => A.put(L, new THREE.IcosahedronGeometry(r, 1), hex, x, y, z));
  const m = new THREE.Mesh(A.mergeGeos(L), A.HUMAN_VC);
  return m;
}
function mangal () {
  return propMesh(b => {
    for (const [lx, lz] of [[-0.4, -0.14], [0.4, -0.14], [-0.4, 0.14], [0.4, 0.14]]) b(0.04, 0.62, 0.04, '#2b2a2e', lx, 0.31, lz);
    b(0.92, 0.26, 0.36, '#3a3a3e', 0, 0.74, 0);
    b(0.84, 0.03, 0.28, '#ff7a2a', 0, 0.88, 0);
    for (let k = 0; k < 5; k++) {
      const x = -0.32 + k * 0.16;
      b(0.012, 0.012, 0.5, '#c0c0c0', x, 0.92, 0);
      for (const zz of [-0.08, 0.03, 0.12]) b(0.05, 0.045, 0.06, k % 2 ? '#8a4a2a' : '#7a3a22', x, 0.93, zz);
    }
    b(0.42, 0.3, 0.28, '#3f7fd6', 0.9, 0.15, 0.35);      // сумка-холодильник
    b(0.44, 0.04, 0.3, '#f4f1ea', 0.9, 0.31, 0.35);
  });
}
function dominoTable () {
  return propMesh(b => {
    b(1.0, 0.06, 0.8, '#7a5a3a', 0, 0.98, 0);
    b(0.12, 0.95, 0.12, '#5c4a3a', 0, 0.48, 0);
    b(0.6, 0.06, 0.5, '#5c4a3a', 0, 0.03, 0);
    for (const sd of [-1, 1]) {
      b(1.6, 0.12, 0.34, '#8a6b4e', 0, 0.65, sd * 0.85);
      for (const lx of [-0.65, 0.65]) b(0.1, 0.6, 0.28, '#5c5560', lx, 0.3, sd * 0.85);
    }
    for (let k = 0; k < 9; k++) b(0.05, 0.015, 0.1, '#f4f1ea', -0.3 + (k % 5) * 0.12 + (k > 4 ? 0.06 : 0), 1.02, k > 4 ? 0.12 : -0.05, 0, k * 0.4, 0);
  });
}

/* ── люди ── */
const SAYS = new Set();
function unsay (sc) { if (sc.say) { if (sc.say.parent) sc.say.parent.remove(sc.say); sc.say.material.dispose(); SAYS.delete(sc.say); sc.say = null; } }
function say (sc, p, list, col) {
  if (!p || p.dead || SAYS.size >= YL.SAYS) return;
  unsay(sc);
  sc.say = A.sayBubble(p.grp, t(pick(list)), col || COL[sc.kind] || '#5a4a9a', 2.6);
  sc.sayT = 2.2; sc.speaker = p;
  SAYS.add(sc.say);
  ST.says++;
}
function spawnPerson (owner, s) {
  const grp = s.po ? A.freshHuman(s.o || {}, s.po) : A.makeHuman(null, s.o || {});
  const h0 = performance.now();
  if (s.item) hold(grp, s.item);
  if (s.ski) { skis(grp); hold(grp, 'pole'); }
  const hm = performance.now() - h0;
  if (hm > ST.holdMax) ST.holdMax = hm;
  const p = { owner, grp, u: grp.userData, role: s.role, x: s.x, z: s.z, hx: s.x, hz: s.z, face: s.face, seat: s.seat || 0, st: 'act',
    t: rand(0.5, 4), ph: rand(0, 6), dead: 0, talk: rand(0.3, 1), k: s.k || 0, gy: ground(s.x, s.z), sc0: grp.scale.clone(), grow: 0, flee: null, fall: null };
  grp.rotation.y = s.face;
  grp.position.set(p.x, p.gy + (p.seat ? 0.42 : 0), p.z);
  if (p.seat) sitPose(p.u);
  A.scene.add(grp);
  if (dist(p.x, p.z) < 140 && inView(p.x, 1, p.z, 2)) { p.grow = 0.02; grp.scale.copy(p.sc0).multiplyScalar(0.02); }
  ST.people++; ST.spawned++;
  return p;
}
function dropPerson (p) {
  if (!p.dead) { A.dropMesh(p.grp); p.dead = 1; ST.people--; }
}
function sitPose (u) {
  u.legL.rotation.x = u.legR.rotation.x = -1.45;
  u.armL.rotation.x = u.armR.rotation.x = -0.45;
}
function standPose (u, dt, k = 6) {
  for (const m of [u.legL, u.legR, u.armL, u.armR]) { m.rotation.x = damp(m.rotation.x, 0, k, dt); m.rotation.z = damp(m.rotation.z, 0, k, dt); }
  u.head.rotation.x = damp(u.head.rotation.x, 0, k, dt); u.head.rotation.y = damp(u.head.rotation.y, 0, k, dt);
}
function walkPose (u, ph, k = 0.8) {
  const sw = Math.sin(ph) * k;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
  u.armL.rotation.z = u.armR.rotation.z = 0;
}
function handsUp (u, dt) {
  u.armL.rotation.x = damp(u.armL.rotation.x, -2.9, 14, dt); u.armR.rotation.x = damp(u.armR.rotation.x, -2.9, 14, dt);
  u.armL.rotation.z = damp(u.armL.rotation.z, -0.3, 10, dt); u.armR.rotation.z = damp(u.armR.rotation.z, 0.3, 10, dt);
}
/* идти к точке: true — дошёл */
function walkTo (p, tx, tz, spd, dt, walkK = 0.8) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return true;
  const k = Math.min(1, spd * dt / d);
  p.x += dx * k; p.z += dz * k;
  p.ph += dt * spd * 5.5;
  p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(dx, dz), 9, dt);
  walkPose(p.u, p.ph, walkK);
  p.grp.position.set(p.x, ground(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.04, p.z);
  return false;
}

/* машина задела человека: медленно — упал и встал, быстрее — сбит. true — человека больше нет / лежит */
function carHit (p, sp, fx, fz, kmh) {
  if (sp < 3 || p.fall) return false;
  const dx = p.x - A.V.x, dz = p.z - A.V.z;
  if (Math.abs(dx * fx + dz * fz) >= A.CAR_L + 0.5 || Math.abs(dx * fz - dz * fx) >= A.CAR_W + 0.35) return false;
  if ((HITS.isFall(kmh) || HITS.survive(p, kmh))) {
    p.grp.rotation.z = 0;
    if (p.seat) { p.seat = 0; p.wasSeat = 1; }
    HITS.fall(p, A.V.vx, A.V.vz); ST.falls++;
    return true;
  }
  unsayOwner(p);
  A.dropMesh(p.grp); p.dead = 1; ST.people--; ST.hit++;
  A.gibHuman(p, A.V.vx, A.V.vz, kmh);
  if (A.runOver) A.runOver();
  return true;
}
function unsayOwner (p) { const sc = p.owner; if (sc && sc.speaker === p) unsay(sc); }

/* разбегаются: от линии, по которой едет машина (или от точки), руки вверх; потом — обратно на место */
function startFlee (p, ax, az, T) {
  if (p.dead || p.fall || p.flee) return;
  if (p.seat) { p.seat = 0; p.wasSeat = 1; }
  p.grp.rotation.z = 0;
  const l = Math.hypot(ax, az) || 1;
  p.flee = { ax: ax / l, az: az / l, t: T || rand(YL.FLEE.T[0], YL.FLEE.T[1]), frz: rand(0.1, 0.35) };
  p.st = 'flee';
  ST.flee++;
}
function fleeStep (p, dt) {
  const F = p.flee, u = p.u;
  if (F.frz > 0) { F.frz -= dt; handsUp(u, dt); p.grp.position.y = ground(p.x, p.z); return; }
  F.t -= dt;
  p.ph += dt * 16;
  p.x += F.ax * YL.FLEE.SPD * dt; p.z += F.az * YL.FLEE.SPD * dt;
  A.pushOut(p, 0.45);
  p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(F.ax, F.az), 10, dt);
  p.grp.position.set(p.x, ground(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.1, p.z);
  const sw = Math.sin(p.ph) * 1.1;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.armL.rotation.x = -2.6 + Math.sin(p.ph) * 0.5; u.armR.rotation.x = -2.6 - Math.sin(p.ph) * 0.5;
  u.armL.rotation.z = -0.3; u.armR.rotation.z = 0.3;
  if (F.t <= 0) { p.flee = null; p.st = 'back'; u.armL.rotation.z = u.armR.rotation.z = 0; }
}
/* обратно на своё место; true — пришёл */
function backStep (p, dt) {
  if (!walkTo(p, p.hx, p.hz, 1.5, dt)) { A.pushOut(p, 0.4); return false; }
  p.x = p.hx; p.z = p.hz; p.gy = ground(p.x, p.z);
  p.grp.rotation.y = p.face;
  if (p.wasSeat) { p.seat = 1; p.wasSeat = 0; sitPose(p.u); }
  p.grp.position.set(p.x, p.gy + (p.seat ? 0.42 : 0), p.z);
  p.st = 'act';
  return true;
}

/* ─────────────── сцены ─────────────── */
function newScene (kind, x, z, ry, anchor) {
  const sc = { kind, x, z, ry, anchor, ppl: [], q: [], prop: null, props: [], say: null, sayT: 0, speaker: null, talkT: rand(2, YL.TALK[1]), t: 0, ex: {} };
  ST.kinds[kind] = (ST.kinds[kind] || 0) + 1;
  return sc;
}
function addProp (sc, m, x, z, ry, y) {
  m.position.set(x, y === undefined ? A.groundH(x, z) : y, z);
  m.rotation.y = ry || 0;
  A.scene.add(m);
  sc.props.push(m);
  return m;
}
/* человек в очередь сцены: появится в одном из следующих кадров */
const P0 = (role, x, z, face, o) => ({ role, x, z, face, ...(o || {}) });
const drinkItem = () => (A.ADULT ? 'bottle' : 'can');
const anyone = () => (chance(0.35) ? { po: {} } : { o: { fat: chance(0.25) } });

function sceneBeer (sp) {
  const sc = newScene('beer', sp.x, sp.z, sp.face, sp);
  const n = 3 + ((Math.random() * 3) | 0), rad = 1.0 + n * 0.14, turn = rand(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = turn + i / n * Math.PI * 2 + rand(-0.2, 0.2), x = sp.x + Math.sin(a) * rad, z = sp.z + Math.cos(a) * rad;
    sc.q.push(P0('drink', x, z, Math.atan2(sp.x - x, sp.z - z), { item: chance(0.85) ? drinkItem() : null, ...anyone() }));
  }
  return sc;
}
function sceneShashlik (sp) {
  const sc = newScene('shashlik', sp.x, sp.z, sp.face, sp);
  const ry = sp.face, cs = Math.cos(ry), sn = Math.sin(ry);
  const W = (lx, lz) => [sp.x + lx * cs + lz * sn, sp.z - lx * sn + lz * cs];
  sc.prop = addProp(sc, mangal(), sp.x, sp.z, ry);
  const [gx, gz] = W(0, -0.75);
  sc.q.push(P0('griller', gx, gz, ry, { item: 'fan', o: { fat: chance(0.4) } }));
  const n = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * 0.75 + rand(-0.15, 0.15), r = rand(1.9, 2.4);
    const [x, z] = W(Math.sin(a) * r, Math.cos(a) * r);
    sc.q.push(P0('drink', x, z, Math.atan2(sp.x - x, sp.z - z), { item: A.ADULT ? (chance(0.8) ? 'bottle' : 'cup') : 'cup', ...anyone() }));
  }
  return sc;
}
function sceneDomino (sp) {
  const sc = newScene('domino', sp.x, sp.z, sp.face, sp);
  const ry = sp.face, cs = Math.cos(ry), sn = Math.sin(ry);
  const W = (lx, lz) => [sp.x + lx * cs + lz * sn, sp.z - lx * sn + lz * cs];
  sc.prop = addProp(sc, dominoTable(), sp.x, sp.z, ry);
  let k = 0;
  for (const sd of [-1, 1]) for (const lx of [-0.42, 0.42]) {
    const [x, z] = W(lx, sd * 0.85);
    sc.q.push(P0('domino', x, z, sd < 0 ? ry : ry + Math.PI, { seat: 1, k: k++, o: { fem: false, fat: chance(0.35) } }));
  }
  sc.ex.turn = 0; sc.ex.slamT = rand(1, 2.5);
  return sc;
}
function sceneBall (sp) {
  const sc = newScene('ball', sp.x, sp.z, sp.face, sp);
  const n = chance(0.6) ? 3 : 2, turn = rand(0, 6.28), rad = n === 3 ? 2.9 : 2.6;
  for (let i = 0; i < n; i++) {
    const a = turn + i / n * Math.PI * 2, x = sp.x + Math.sin(a) * rad, z = sp.z + Math.cos(a) * rad;
    sc.q.push(P0('kick', x, z, Math.atan2(sp.x - x, sp.z - z), { k: i, ...anyone() }));
  }
  const ball = new THREE.Mesh(BALL_GEO(), mat(0xf4f4ee));
  addProp(sc, ball, sp.x, sp.z, 0, ground(sp.x, sp.z) + 0.2);
  sc.ex = { ball, from: 0, to: 1, s: 1, T: 1, wait: rand(0.5, 1.5) };
  return sc;
}
let BGEO = null, SGEO = null;
const BALL_GEO = () => BGEO || (BGEO = new THREE.IcosahedronGeometry(0.17, 1));
const SNOW_GEO = () => SGEO || (SGEO = new THREE.IcosahedronGeometry(1, 1));
function sceneSnowman (sp) {
  const sc = newScene('snowman', sp.x, sp.z, sp.face, sp);
  const snow = mat(0xe8edf3), gy = A.groundH(sp.x, sp.z);
  const base = addProp(sc, new THREE.Mesh(SNOW_GEO(), snow), sp.x, sp.z, 0, gy + 0.5);
  base.scale.setScalar(0.6);
  const roll = addProp(sc, new THREE.Mesh(SNOW_GEO(), snow), sp.x + 1.7, sp.z, 0, gy + 0.2);
  roll.scale.setScalar(0.2);
  sc.ex = { base, roll, ph: 'roll', r: 0.2, goal: 0.44, top: 1.25, a: rand(0, 6.28), t: 0, stage: 0, gy };
  sc.q.push(P0('roller', sp.x + 2.3, sp.z, 0, anyone()));
  const n = 1 + (chance(0.5) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.28), x = sp.x + Math.sin(a) * 1.0, z = sp.z + Math.cos(a) * 1.0;
    sc.q.push(P0('pat', x, z, Math.atan2(sp.x - x, sp.z - z), anyone()));
  }
  return sc;
}
function sceneBench (b) {
  const sc = newScene('bench', b.x, b.z, b.ry, b);
  b.taken = 1;
  const n = chance(0.55) ? 3 : 2, cs = Math.cos(b.ry), sn = Math.sin(b.ry);
  const offs = n === 3 ? [-0.8, 0, 0.8] : chance(0.5) ? [-0.55, 0.55] : [-0.8, 0.3];
  for (const o of offs) {
    const x = b.x + o * cs, z = b.z - o * sn;
    sc.q.push(P0('babka', x, z, b.ry, { seat: 1, po: { fem: true, age: 'old' }, o: {} }));
  }
  return sc;
}
function sceneSmoke (ds) {
  const sc = newScene('smoke', ds.x, ds.z, ds.face, ds);
  const n = chance(0.45) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const lat = n === 2 ? (i ? 0.55 : -0.55) : 0, x = ds.x + ds.tx * lat, z = ds.z + ds.tz * lat;
    const face = ds.face + (n === 2 ? (i ? -0.9 : 0.9) : rand(-0.4, 0.4));
    sc.q.push(P0(A.ADULT ? 'smoke' : 'phone', x, z, face, { item: A.ADULT ? 'cig' : 'phone', ...anyone() }));
  }
  return sc;
}
function sceneGarage (g) {
  const nr = A.nearestRoad(g.x, g.z, 5, 2);
  if (!nr) return null;
  let dx = nr.x - g.x, dz = nr.z - g.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const tx = dz, tz = -dx, ppl = [];
  for (const lat of [-1.3, 0, 1.3]) {
    const d = rand(3.6, 4.4), x = g.x + dx * d + tx * lat, z = g.z + dz * d + tz * lat;
    if (!ptOk(x, z, 0.8, false)) continue;
    ppl.push([x, z]);
  }
  if (ppl.length < 2) return null;
  const sc = newScene('garage', g.x + dx * 4, g.z + dz * 4, Math.atan2(-dx, -dz), g);
  ppl.forEach(([x, z], i) => {
    const face = Math.atan2(g.x - x, g.z - z) + rand(-0.5, 0.5);
    sc.q.push(P0('garage', x, z, face, { item: i < 2 ? (A.ADULT ? 'bottle' : 'cup') : null, o: { fem: false, fat: chance(0.45) } }));
  });
  return sc;
}
function sceneSled (S) {
  const sc = newScene('sled', S.x, S.z, S.ry, S);
  S.busy = 1;
  const k = S.k, cs = Math.cos(S.ry), sn = Math.sin(S.ry), gy = A.groundH(S.x, S.z);
  const W = (lx, lz) => [S.x + lx * cs + lz * sn, S.z - lx * sn + lz * cs];
  const tilt = Math.atan2(S.H - 0.1, S.L);
  sc.ex = { W, gy, z0: 1.2 * k, z1: 1.2 * k + S.L * Math.cos(tilt), zEnd: 1.2 * k + S.L + 2.4, foot: -1.2 * k - 2.0, side: 2.0 * k + 0.7 };
  const n = chance(0.5) ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const [x, z] = W(0, sc.ex.foot - i * 0.8);
    sc.q.push(P0('sled', x, z, S.ry, { k: i, ...anyone() }));
  }
  if (chance(0.6)) {
    const [x, z] = W(sc.ex.side + 1.2, sc.ex.zEnd - 0.5);
    const [lx, lz] = W(0, sc.ex.zEnd - 1);
    if (ptOk(x, z, 1)) sc.q.push(P0('watch', x, z, Math.atan2(lx - x, lz - z), anyone()));
  }
  return sc;
}

function dropScene (sc) {
  for (const p of sc.ppl) dropPerson(p);
  for (const m of sc.props) { A.scene.remove(m); if (m.geometry !== BGEO && m.geometry !== SGEO) m.geometry.dispose(); }
  unsay(sc);
  if (sc.anchor) {
    if (sc.kind === 'bench') sc.anchor.taken = 0;
    else if (sc.kind === 'sled') sc.anchor.busy = 0;
    else sc.anchor.on = null;
  }
  sc.q.length = 0; sc.ppl.length = 0; sc.props.length = 0;
  ST.dropped++;
}

/* вещи сцены снесли (мангал, столик, снеговик, лавочка): сидевшие встают, все просто стоят и смотрят */
function unprop (sc) {
  sc.ex.down = 1;
  if (sc.ex.ball) sc.ex.ball = null;
  if (sc.kind === 'snowman') sc.ex.ph = 'done';
  for (const p of sc.ppl) {
    if (p.dead) continue;
    if (p.seat || p.wasSeat) {
      const sat = p.seat && !p.fall && !p.flee;
      p.seat = 0; p.wasSeat = 0; p.u.legL.rotation.x = p.u.legR.rotation.x = 0; if (!p.fall && !p.flee) p.grp.position.y = p.gy;
      // сидела на снесённой лавочке — падает с неё и встаёт (автор 23.10.2026, 0п2: «сидящие зависают в позе»)
      if (sat && sc.kind === 'bench') { const V = A.V; HITS.fall(p, V.vx || Math.sin(p.face) * 4, V.vz || Math.cos(p.face) * 4); ST.falls++; }
    }
    if (p.role === 'domino' || p.role === 'griller' || p.role === 'roller' || p.role === 'babka' || p.role === 'kick') p.role = 'watch';
  }
}

/* ── позы сцен ── */
function act (p, dt, sc, near) {
  const u = p.u;
  p.ph += dt;
  switch (p.role) {
    case 'drink': case 'garage': {
      if (!near) break;
      p.t -= dt;
      const sip = p.t < 0 && p.t > -1.2;
      if (p.t < -1.4) p.t = rand(3, 8);
      const hasIt = sc.kind !== 'garage' || p !== sc.ppl[2];
      u.armR.rotation.x = damp(u.armR.rotation.x, hasIt ? (sip ? -2.3 : -0.55) : -0.15, 8, dt);
      u.armR.rotation.z = damp(u.armR.rotation.z, hasIt ? 0 : 0.35, 6, dt);
      u.head.rotation.x = damp(u.head.rotation.x, sip && hasIt ? -0.4 : 0.05, 8, dt);
      const talking = sc.speaker === p && sc.say;
      u.armL.rotation.x = talking ? -0.9 + Math.sin(p.ph * 6) * 0.4 : Math.sin(p.ph * 1.7) * 0.25 * p.talk;
      p.grp.rotation.z = Math.sin(p.ph * 0.9) * 0.04;
      p.grp.position.y = p.gy + (talking ? Math.abs(Math.sin(p.ph * 12)) * 0.03 : 0);
      break;
    }
    case 'smoke': {
      // затяжка раз в 4—8 с, выдох — клуб дыма у лица
      p.t -= dt;
      const up = p.t < 0 && p.t > -1.3;
      if (p.t < -1.3) {
        p.t = rand(4, 8);
        if (near) { const fx = Math.sin(p.grp.rotation.y), fz = Math.cos(p.grp.rotation.y); FXP.part('puff', p.x + fx * 0.3, p.gy + 1.65, p.z + fz * 0.3, 0xcfcfcf, 0.22, 0.5, { vy: 0.5, vx: fx * 0.7, vz: fz * 0.7, life: 1.6, max: 1.6, grow: 2.4 }); }
      }
      if (!near) break;
      u.armR.rotation.x = damp(u.armR.rotation.x, up ? -2.1 : -0.35, 7, dt);
      u.armR.rotation.z = damp(u.armR.rotation.z, up ? 0.45 : 0.1, 7, dt);
      u.armL.rotation.z = -0.2;
      p.grp.rotation.z = Math.sin(p.ph * 0.7) * 0.03;
      break;
    }
    case 'phone':
      if (!near) break;
      u.armR.rotation.x = -1.15; u.head.rotation.x = 0.35;
      u.armL.rotation.x = Math.sin(p.ph * 0.6) > 0.7 ? -1.0 : 0;
      break;
    case 'babka': {
      if (!near) break;
      // голова — за машиной, если близко; иначе оглядывает двор
      const d = dist(p.x, p.z);
      const want = d < 32 ? clamp(wrap(Math.atan2(A.V.x - p.x, A.V.z - p.z) - p.face), -1.15, 1.15) : Math.sin(p.ph * 0.35 + p.k) * 0.6;
      u.head.rotation.y = damp(u.head.rotation.y, want, 4, dt);
      const talking = sc.speaker === p && sc.say;
      u.armL.rotation.x = talking ? -0.9 + Math.sin(p.ph * 7) * 0.35 : -0.45;
      break;
    }
    case 'domino': {
      if (!near) break;
      const slam = sc.ex.turn === p.k && sc.ex.slamT < 0.45;
      const k = slam ? sc.ex.slamT / 0.45 : 0;
      u.armR.rotation.x = damp(u.armR.rotation.x, slam ? (k > 0.35 ? -2.5 : -1.05) : -1.2, slam ? 25 : 6, dt);
      u.armL.rotation.x = -1.15;
      u.head.rotation.x = 0.3;
      break;
    }
    case 'griller':
      if (!near) break;
      u.head.rotation.x = 0.35;
      u.armR.rotation.x = -1.05 + Math.sin(p.ph * 13) * 0.3;
      u.armR.rotation.z = 0.25;
      u.armL.rotation.x = -0.7;
      break;
    case 'pat':
      if (!near) break;
      u.armL.rotation.x = -1.0 + Math.sin(p.ph * 6) * 0.18;
      u.armR.rotation.x = -1.0 - Math.sin(p.ph * 6) * 0.18;
      u.head.rotation.x = 0.25;
      break;
    case 'watch':
      if (!near) break;
      if (Math.sin(p.ph * 0.5 + p.k) > 0.85) { u.armL.rotation.x = u.armR.rotation.x = -1.4; u.armL.rotation.z = -0.3 + Math.abs(Math.sin(p.ph * 14)) * 0.3; u.armR.rotation.z = -u.armL.rotation.z; }
      else standPose(u, dt);
      break;
  }
}
/* домино: по очереди стучат костяшкой */
function dominoStep (sc, dt) {
  const E = sc.ex;
  if ((E.slamT -= dt) <= 0) {
    E.turn = (E.turn + 1) % 4; E.slamT = rand(1.4, 3.2) + 0.45;
    if (chance(0.15) && dist(sc.x, sc.z) < YL.SAY_R) say(sc, sc.ppl.find(p => p.k === E.turn), LINES.domino);
  }
}
/* мяч: летит дугой от одного к другому, тот пинает дальше */
function ballStep (sc, dt) {
  const E = sc.ex, live = sc.ppl.filter(p => !p.dead && p.st === 'act' && !p.fall);
  if (live.length < 2) { E.ball.visible = false; return; }
  E.ball.visible = true;
  const from = live[E.from % live.length], to = live[E.to % live.length];
  if (E.s >= 1) {
    if ((E.wait -= dt) > 0) { E.ball.position.set(to.x + Math.sin(to.face) * 0.5, ground(to.x, to.z) + 0.17, to.z + Math.cos(to.face) * 0.5); return; }
    // пинает следующий
    E.from = E.to % live.length;
    let nx = (Math.random() * live.length) | 0;
    if (nx === E.from) nx = (nx + 1) % live.length;
    E.to = nx; E.s = 0; E.T = rand(0.8, 1.2); E.wait = rand(0.4, 1.6); E.h = rand(0.5, 2.2);
    const kk = live[E.from];
    if (kk) { kk.kick = 0.35; if (chance(0.12) && dist(sc.x, sc.z) < YL.SAY_R) say(sc, kk, LINES.ball); }
    return;
  }
  E.s = Math.min(1, E.s + dt / E.T);
  const ax = from.x + Math.sin(from.face) * 0.5, az = from.z + Math.cos(from.face) * 0.5, bx = to.x + Math.sin(to.face) * 0.5, bz = to.z + Math.cos(to.face) * 0.5;
  const x = ax + (bx - ax) * E.s, z = az + (bz - az) * E.s;
  E.ball.position.set(x, ground(x, z) + 0.17 + Math.sin(E.s * Math.PI) * E.h, z);
  E.ball.rotation.x += dt * 9;
  for (const p of live) {
    const u = p.u;
    p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(E.ball.position.x - p.x, E.ball.position.z - p.z), 5, dt);
    if (p.kick > 0) { p.kick -= dt; u.legR.rotation.x = -1.1; } else u.legR.rotation.x = damp(u.legR.rotation.x, 0, 8, dt);
  }
}
/* снеговик: катают ком (растёт), ставят наверх; потом голову */
function snowStep (sc, dt) {
  const E = sc.ex, R = sc.ppl.find(p => p.role === 'roller' && !p.dead);
  if (!R || R.st !== 'act' || R.fall) return;
  const u = R.u;
  if (E.ph === 'roll') {
    E.a += dt * 0.32;
    const rr = 1.7 + E.stage * 0.3, x = sc.x + Math.sin(E.a) * rr, z = sc.z + Math.cos(E.a) * rr;
    const fa = E.a + Math.PI / 2;
    R.x = x - Math.sin(fa) * (0.55 + E.r); R.z = z - Math.cos(fa) * (0.55 + E.r);
    R.ph += dt * 3;
    R.grp.rotation.y = fa;
    walkPose(u, R.ph, 0.45);
    u.armL.rotation.x = u.armR.rotation.x = -1.3;
    R.grp.position.set(R.x, ground(R.x, R.z), R.z);
    E.r = Math.min(E.goal, E.r + dt * 0.012);
    E.roll.scale.setScalar(E.r);
    E.roll.position.set(x, E.gy + E.r, z);
    E.roll.rotation.x += dt * 0.8 / E.r;
    if (E.r >= E.goal) { E.ph = 'lift'; E.t = 0; E.fx = x; E.fz = z; }
  } else if (E.ph === 'lift') {
    E.t += dt / 1.6;
    const k = Math.min(1, E.t);
    const y = E.gy + E.r + (E.top - E.r) * Math.sin(k * Math.PI / 2);
    E.roll.position.set(E.fx + (sc.x - E.fx) * k, y, E.fz + (sc.z - E.fz) * k);
    u.armL.rotation.x = u.armR.rotation.x = damp(u.armL.rotation.x, -2.6, 6, dt);
    if (k >= 1) {
      // ком встал — следующий меньше (голова); голова встала — стоят, любуются
      if (E.stage === 0) {
        const mid = new THREE.Mesh(SNOW_GEO(), E.roll.material);
        mid.scale.setScalar(E.r); mid.position.copy(E.roll.position);
        addProp(sc, mid, mid.position.x, mid.position.z, 0, mid.position.y);
        E.stage = 1; E.r = 0.15; E.goal = 0.32; E.top = 1.25 + 0.44 + 0.3; E.ph = 'roll';
        E.roll.scale.setScalar(E.r);
        if (dist(sc.x, sc.z) < YL.SAY_R) say(sc, R, LINES.snowman);
      } else { E.ph = 'done'; R.hx = R.x; R.hz = R.z; R.face = Math.atan2(sc.x - R.x, sc.z - R.z); R.role = 'pat'; }
    }
  }
}
/* горка: лезет по ступенькам, едет сидя, встаёт, обходит назад */
function sledStep (sc, p, dt, near) {
  const E = sc.ex, S = sc.anchor, u = p.u;
  if (!p.sl) p.sl = { ph: 'queue', t: 0.5 + p.k * 2.2, s: 0, v: 0, back: 0 };
  const L = p.sl;
  switch (L.ph) {
    case 'queue': {
      const [x, z] = E.W(0, E.foot - 0.3);
      if (!walkTo(p, x, z, 1.3, dt)) return;
      standPose(u, dt); p.grp.rotation.y = damp(p.grp.rotation.y, S.ry, 6, dt);
      if ((L.t -= dt) <= 0 && !sc.ppl.some(q => q !== p && q.sl && (q.sl.ph === 'climb' || q.sl.ph === 'top'))) { L.ph = 'climb'; L.s = 0; }
      return;
    }
    case 'climb': {
      L.s = Math.min(1, L.s + dt / 1.8);
      const lz = E.foot - 0.3 + (0.2 - E.foot + 0.3) * L.s, [x, z] = E.W(0, lz);
      p.x = x; p.z = z; p.ph += dt * 7;
      walkPose(u, p.ph, 0.6);
      p.grp.rotation.y = S.ry;
      p.grp.position.set(x, E.gy + S.H * Math.min(1, L.s * 1.15), z);
      if (L.s >= 1) { L.ph = 'top'; L.t = rand(0.4, 0.9); }
      return;
    }
    case 'top': {
      const [x, z] = E.W(0, E.z0 - 0.3);
      p.x = x; p.z = z;
      sitPose(u);
      p.grp.position.set(x, E.gy + S.H - 0.29, z);
      if ((L.t -= dt) <= 0) { L.ph = 'slide'; L.s = E.z0 - 0.3; L.v = 1; if (chance(0.25) && near) say(sc, p, LINES.sled); }
      return;
    }
    case 'slide': {
      const onChute = L.s < E.z1;
      L.v = onChute ? Math.min(7.5, L.v + 6 * dt) : Math.max(0, L.v - 4.5 * dt);
      L.s += L.v * dt;
      const [x, z] = E.W(0, L.s);
      p.x = x; p.z = z;
      const f = clamp((L.s - E.z0) / (E.z1 - E.z0), 0, 1), ys = onChute ? (S.H + 0.04) + f * (0.24 - S.H - 0.04) : 0.09;
      p.grp.position.set(x, E.gy + ys - 0.29, z);
      u.legL.rotation.x = u.legR.rotation.x = -1.45;
      u.armL.rotation.x = u.armR.rotation.x = L.v > 4 ? -2.6 : -0.6;
      if (L.s >= E.zEnd || (!onChute && L.v <= 0.05)) { L.ph = 'up'; L.t = 0.5; }
      return;
    }
    case 'up':
      standPose(u, dt, 10);
      p.grp.position.y = ground(p.x, p.z);
      if ((L.t -= dt) <= 0) { L.ph = 'back'; L.back = 0; }
      return;
    case 'back': {
      const pts = [E.W(E.side, Math.min(L.s, E.zEnd)), E.W(E.side, E.foot - 0.3), E.W(0, E.foot - 0.3)];
      const [tx, tz] = pts[L.back];
      if (walkTo(p, tx, tz, 1.5, dt)) { if (++L.back >= pts.length) { L.ph = 'queue'; L.t = rand(0.5, 2.5); } }
      return;
    }
  }
}

/* ─────────────── гуляющие ─────────────── */
function dogMesh () {
  const C = pick(['#c9a46a', '#2b2a30', '#f4f1ea', '#8a5a3a', '#6b6560', '#d9b36a']), D = '#2b2a30';
  const s = rand(0.75, 1.15), coat = PETW.coatFor(PETW.PW.HOME);   // с хозяином — зимой все одеты
  const m = propMesh(b => {
    b(0.26 * s, 0.24 * s, 0.62 * s, C, 0, 0.42 * s, 0);
    b(0.2 * s, 0.2 * s, 0.24 * s, C, 0, 0.58 * s, 0.38 * s);
    b(0.12 * s, 0.1 * s, 0.14 * s, C, 0, 0.53 * s, 0.53 * s);
    b(0.05 * s, 0.05 * s, 0.03 * s, D, 0, 0.56 * s, 0.61 * s);
    for (const sd of [-1, 1]) b(0.06 * s, 0.1 * s, 0.05 * s, C, sd * 0.07 * s, 0.71 * s, 0.33 * s);
    for (const [lx, lz] of [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]]) b(0.07 * s, 0.32 * s, 0.07 * s, C, lx * s, 0.16 * s, lz * s);
    b(0.05 * s, 0.05 * s, 0.26 * s, C, 0, 0.55 * s, -0.4 * s, -0.7, 0, 0);
    PETW.wear(b, { w: 0.26 * s, h: 0.24 * s, d: 0.62 * s, y: 0.42 * s, z: 0 }, coat,
      [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]].map(([lx, lz]) => [lx * s, lz * s, 0.07 * s, 0.32 * s, 0.32 * s]));
  });
  return m;
}
function spawnWalker (M) {
  // старт — у подъезда в 30—140 м, вне кадра (или дальше 90 м)
  const cand = [];
  entsNear(A.V.x, A.V.z, 140, (i, d) => { if (d > 30) cand.push(i); });
  for (let k = 0; k < 6 && cand.length; k++) {
    const i = cand.splice((Math.random() * cand.length) | 0, 1)[0], w = walkPt(i);
    if (!w || A.nearClient(w.x, w.z, YL.CLIENT)) continue;
    const d = dist(w.x, w.z);
    if (d < 90 && inView(w.x, 1, w.z, 2)) continue;
    if (d < YL.MIN_IN && still()) continue;                  // стоишь — не рядом за спиной (0п0)
    const ski = M.sea === 'win' && !M.night && chance(YL.WALKER.SKI), dog = !ski && chance(YL.WALKER.DOG);
    const grp = chance(0.4) ? A.freshHuman({}, {}) : A.makeHuman(null, { fat: chance(0.2) });
    if (ski) { skis(grp); hold(grp, 'pole'); }
    A.scene.add(grp);
    const p = { owner: null, grp, u: grp.userData, role: ski ? 'ski' : 'walk', x: w.x, z: w.z, hx: w.x, hz: w.z, face: 0, st: 'act', ph: rand(0, 6), dead: 0,
      spd: ski ? 1.8 : rand(YL.WALKER.SPD[0], YL.WALKER.SPD[1]) * (grp.userData.fat ? 0.85 : 1), tgt: null, wait: rand(0.2, 1.5), from: i, legs: 0, gy: ground(w.x, w.z), dog: null };
    grp.position.set(p.x, p.gy, p.z);
    if (dog) {
      const dm = dogMesh();
      A.scene.add(dm);
      p.dog = { m: dm, x: p.x + 1, z: p.z, a: rand(0, 6.28), t: 0, ph: 0, sit: 0 };
      dm.position.set(p.dog.x, ground(p.dog.x, p.dog.z), p.dog.z);
    }
    WALKERS.push(p); ST.walkers++; ST.people++; ST.spawned++;
    return true;
  }
  return false;
}
function dropWalker (p) {
  dropPerson(p);
  if (p.dog) { A.scene.remove(p.dog.m); p.dog.m.geometry.dispose(); p.dog = null; }
  ST.walkers--;
}
/* куда дальше: проверка прямой дорогая (до ~50 точек) — не больше двух подъездов за кадр, не вышло — через 0,3 с снова */
function nextTarget (p) {
  const c = [];
  entsNear(p.x, p.z, YL.WALKER.NEAR[1], (i, d) => { if (d > YL.WALKER.NEAR[0] && i !== p.from) c.push(i); });
  for (let k = 0; k < 2 && c.length; k++) {
    const i = c.splice((Math.random() * c.length) | 0, 1)[0], w = walkPt(i);
    if (!w || !lineOk(p.x, p.z, w.x, w.z)) continue;
    p.tgt = w; p.from = i;
    return true;
  }
  return false;
}
function walkerStep (p, dt, sp, fx, fz, kmh) {
  const d = dist(p.x, p.z), u = p.u;
  if (p.fall) { if (HITS.fallStep(p, dt)) return; p.st = 'act'; }
  if (carHit(p, sp, fx, fz, kmh)) { if (p.dead && p.dog) { A.scene.remove(p.dog.m); p.dog.m.geometry.dispose(); p.dog = null; } return; }
  p.grp.visible = d < VIS;
  if (p.st === 'flee') { fleeStep(p, dt); dogStep(p, dt); return; }
  if (p.st === 'back') { p.st = 'act'; p.tgt = null; p.wait = rand(0.5, 2); }
  // встал у машины, что медленно ползёт впереди, — ждёт, пока проедет
  if (sp < 3 && Math.abs(p.x - A.V.x) < 4.5 && Math.abs(p.z - A.V.z) < 4.5) { standPose(u, dt); dogStep(p, dt); return; }
  if (!p.tgt) {
    if ((p.wait -= dt) > 0) { standPose(u, dt); dogStep(p, dt); return; }
    if (!nextTarget(p)) { p.wait = (p.miss = (p.miss || 0) + 1) > 8 ? rand(2, 5) : 0.3; if (p.miss > 8) p.miss = 0; return; }
    p.miss = 0;
  }
  const spd = p.spd;
  if (p.role === 'ski') {
    // лыжник: скользит, ноги — попеременно, палки толкают
    const dx = p.tgt.x - p.x, dz = p.tgt.z - p.z, dd = Math.hypot(dx, dz);
    if (dd < 0.3) arrive(p);
    else {
      const k = Math.min(1, spd * dt / dd);
      p.x += dx * k; p.z += dz * k; p.ph += dt * 3.2;
      p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(dx, dz), 6, dt);
      const s = Math.sin(p.ph);
      u.legL.rotation.x = s * 0.35; u.legR.rotation.x = -s * 0.35;
      u.armL.rotation.x = -0.6 - s * 0.5; u.armR.rotation.x = -0.6 + s * 0.5;
      p.grp.position.set(p.x, ground(p.x, p.z), p.z);
    }
  } else if (walkTo(p, p.tgt.x, p.tgt.z, spd, dt)) arrive(p);
  else A.pushOut(p, 0.35);
  dogStep(p, dt);
}
function arrive (p) {
  p.tgt = null;
  p.wait = rand(YL.WALKER.WAIT[0], YL.WALKER.WAIT[1]) * (p.dog ? 1.6 : 1);
  // дошёл до подъезда вне кадра — иногда заходит домой (а у другого подъезда выйдет новый)
  if (chance(0.3) && !inView(p.x, 1, p.z, 2) && dist(p.x, p.z) > 25) p.home = 1;
}
function dogStep (p, dt) {
  const D = p.dog;
  if (!D) return;
  D.t -= dt;
  if (D.t <= 0) { D.a = rand(0, 6.28); D.r = rand(1.2, 3.2); D.t = rand(1.5, 4); D.sit = p.tgt ? 0 : chance(0.4) ? 1 : 0; }
  const tx = p.x + Math.sin(D.a) * D.r, tz = p.z + Math.cos(D.a) * D.r;
  const dx = tx - D.x, dz = tz - D.z, dd = Math.hypot(dx, dz);
  let moving = false;
  if (dd > 0.3 && !D.sit) {
    const k = Math.min(1, (dd > 4 ? 3.5 : 2) * dt / dd);
    D.x += dx * k; D.z += dz * k; moving = true;
    D.m.rotation.y = damp(D.m.rotation.y, Math.atan2(dx, dz), 8, dt);
  }
  // машина рядом и быстро — отпрыгивает
  const sp = Math.hypot(A.V.vx, A.V.vz);
  if (sp > 3 && Math.abs(D.x - A.V.x) < A.CAR_L + 0.6 && Math.abs(D.z - A.V.z) < A.CAR_L + 0.6) {
    const ax = D.x - A.V.x, az = D.z - A.V.z, l = Math.hypot(ax, az) || 1;
    D.x += ax / l * 2.2; D.z += az / l * 2.2;
  }
  D.ph += dt * (moving ? 14 : 0);
  D.m.position.set(D.x, ground(D.x, D.z) + (moving ? Math.abs(Math.sin(D.ph)) * 0.05 : 0), D.z);
  D.m.rotation.x = D.sit ? -0.35 : 0;
  D.m.visible = p.grp.visible;
}

/* ─────────────── кадр ─────────────── */
let scanT = 0, WALK_DUE = 0;
function caps (M) {
  const k = LOW ? (CLEAN ? CLEAN.yardLife : 0.6) : A.hideR().people < 130 ? 0.75 : 1;   // телефон: 0,4 (mobile.js CLEAN, 11бз; ?mobclean=0 — 0,6)
  return { scenes: Math.max(1, Math.round(YL.SCENES[M.key] * k)), walk: Math.max(1, Math.round(YL.WALK[M.key] * k)) };
}
function farFrom (x, z, gap, kind) {
  for (const sc of SCENES) {
    const d = Math.hypot(sc.x - x, sc.z - z);
    if (d < gap || (sc.kind === kind && d < YL.SAME)) return false;
  }
  return true;
}
const still = () => { const V = A.V; return V.vx * V.vx + V.vz * V.vz < YL.STILL * YL.STILL; };
function okDist (x, z) {
  const d = dist(x, z);
  if (d > YL.WANT) return false;
  return d > (still() || inView(x, 1, z, 4) ? YL.MIN_IN : YL.MIN_OUT);
}
/* кандидаты на новую сцену вида kind → [{ x, z, make }] */
function candidates (kind, M) {
  const out = [], V = A.V, gapK = KIND[kind].gap === 'small' ? YL.GAP_SMALL : YL.GAP;
  const yard = big => entsNear(V.x, V.z, YL.WANT, (i, d) => {
    let s = SPOT.get(i);
    if (s === undefined) { if (d > YL.SPOT_R || FRESH <= 0) return; FRESH--; s = yardSpot(i); }
    if (!s || s.on || (big && !s.big) || !okDist(s.x, s.z) || !farFrom(s.x, s.z, gapK, kind) || A.nearClient(s.x, s.z, YL.CLIENT)) return;
    out.push(s);
  });
  switch (kind) {
    case 'beer': case 'shashlik': case 'domino': case 'snowman': yard(false); break;
    case 'ball': yard(true); break;
    case 'smoke':
      entsNear(V.x, V.z, YL.WANT, i => {
        const s = doorSpot(i);
        if (s && !s.on && okDist(s.x, s.z) && farFrom(s.x, s.z, gapK, kind) && !A.nearClient(s.x, s.z, YL.CLIENT)) out.push(s);
      });
      break;
    case 'bench':
      for (const b of A.BENCHES) {
        if (b.taken || (b.prop && b.prop.down) || Math.abs(b.x - V.x) > YL.WANT || Math.abs(b.z - V.z) > YL.WANT) continue;
        if (!okDist(b.x, b.z) || !farFrom(b.x, b.z, gapK, kind) || A.nearClient(b.x, b.z, YL.CLIENT)) continue;
        out.push(b);
      }
      break;
    case 'garage':
      LAWNP.itemsNear('garage', V.x, V.z, YL.WANT, g => {
        if (!g.on && okDist(g.x, g.z) && farFrom(g.x, g.z, gapK, kind) && !A.nearClient(g.x, g.z, YL.CLIENT)) out.push(g);
      });
      break;
    case 'sled':
      if (SEAS.warmth() < 0.6) break;
      for (const S of SEAS.slides()) {
        if (S.busy || (S.it && S.it.down) || Math.abs(S.x - V.x) > YL.WANT || Math.abs(S.z - V.z) > YL.WANT) continue;
        if (!okDist(S.x, S.z) || !farFrom(S.x, S.z, gapK, kind)) continue;
        out.push(S);
      }
      break;
  }
  return out;
}
const MAKE = { beer: sceneBeer, shashlik: sceneShashlik, domino: sceneDomino, ball: sceneBall, snowman: sceneSnowman, bench: sceneBench, smoke: sceneSmoke, garage: sceneGarage, sled: sceneSled };
let FORCE = null;
function trySpawn (M) {
  const many = k => SCENES.filter(s => s.kind === k).length >= (KIND[k].gap === 'small' ? 3 : 2);     // одной сцены — не больше двух разом (лавочек и курилок — трёх)
  const kinds = Object.keys(KIND).map(k => [k, FORCE === k ? 100 : many(k) ? 0 : weight(k, M)]).filter(([, w]) => w > 0);
  for (let tries = 0; tries < 3 && kinds.length; tries++) {
    let sum = 0;
    for (const [, w] of kinds) sum += w;
    let r = Math.random() * sum, ki = 0;
    for (; ki < kinds.length - 1; ki++) { r -= kinds[ki][1]; if (r <= 0) break; }
    const kind = kinds[ki][0];
    kinds.splice(ki, 1);
    const c = candidates(kind, M);
    if (!c.length) continue;
    // из ближних пяти — случайный: сцены там, где их видно
    c.sort((a, b) => dist(a.x, a.z) - dist(b.x, b.z));
    const an = c[(Math.random() * Math.min(5, c.length)) | 0];
    const sc = MAKE[kind](an);
    if (!sc) { an.on = 'no'; continue; }
    if (kind !== 'bench' && kind !== 'sled') an.on = sc;
    sc.M = M.key + M.sea;
    SCENES.push(sc); ST.scenes++;
    if (FORCE === kind) FORCE = null;
    return sc;
  }
  return null;
}
/* сцена ещё к месту при этой обстановке */
function fits (sc, M) {
  if (weight(sc.kind, M) <= 0) return false;
  if (sc.kind === 'sled' && (!SEAS.snowy() || (sc.anchor.it && sc.anchor.it.down))) return false;
  if (sc.kind === 'snowman' && !SEAS.snowy()) return false;
  return true;
}

export function scare (x, z, r = 26) {
  if (!A) return;
  const one = p => { if (!p.dead && !p.fall && Math.hypot(p.x - x, p.z - z) < r) startFlee(p, p.x - x, p.z - z, rand(2, 3.2)); };
  for (const sc of SCENES) for (const p of sc.ppl) one(p);
  for (const p of WALKERS) one(p);
}

export function step (dt) {
  if (!A || OFF || A.intro()) return;
  const V = A.V, M = mode();
  let busy = 0;                                    // в этом кадре уже родили сцену или гуляющего — человек сцены подождёт кадр
  if ((scanT -= dt) <= 0) {
    scanT = YL.SCAN;
    const t0 = performance.now();
    const C = caps(M);
    // убрать: далеко, не к обстановке (вне кадра или дальше 90 м), все сбиты, место занял клиент
    for (let i = SCENES.length - 1; i >= 0; i--) {
      const sc = SCENES[i], d = dist(sc.x, sc.z);
      const gone = sc.ppl.length && !sc.q.length && sc.ppl.every(p => p.dead);
      const misfit = !fits(sc, M) && (d > 90 || !inView(sc.x, 1, sc.z, 6));
      const full = SCENES.length >= C.scenes && d > YL.WANT - 5 && (d > VIS || !inView(sc.x, 1, sc.z, 6));   // мест нет — дальние уступают ближним дворам
      if (d > YL.DROP || gone || misfit || full) { dropScene(sc); SCENES.splice(i, 1); ST.scenes--; }
    }
    FRESH = 3;
    const made = SCENES.length < C.scenes && ST.people < YL.PEOPLE ? trySpawn(M) : null;
    for (let i = WALKERS.length - 1; i >= 0; i--) {
      const p = WALKERS[i], d = dist(p.x, p.z);
      if (p.dead || d > YL.WALKER.DROP || (p.home && !p.tgt) || (WALKERS.length > C.walk && d > 90 && !inView(p.x, 1, p.z, 2))) { dropWalker(p); WALKERS.splice(i, 1); }
    }
    // гуляющий — не в том же кадре, что новая сцена (её вещи — склейка, ~1—3 мс на «Деке»), а в следующем (18.10.2026)
    if (made) busy = 1;
    if (WALKERS.length < C.walk && ST.people < YL.PEOPLE) { if (made) WALK_DUE = 1; else if (spawnWalker(M)) busy = 1; }
    const ms = performance.now() - t0;
    if (ms > ST.scanMax) ST.scanMax = ms;
    if (ms > 2) ST.scanBig++;
  }
  else if (WALK_DUE) { WALK_DUE = 0; if (WALKERS.length < caps(M).walk && ST.people < YL.PEOPLE && spawnWalker(M)) busy = 1; }
  // по человеку в кадр из очередей сцен
  if (!busy) for (const sc of SCENES) if (sc.q.length) {
    const t0 = performance.now();
    sc.ppl.push(spawnPerson(sc, sc.q.shift()));
    const ms = performance.now() - t0;
    if (ms > ST.spawnMax) ST.spawnMax = ms;
    if (ms > 2) ST.spawnBig++;
    break;
  }

  const sp = Math.sqrt(V.vx * V.vx + V.vz * V.vz), kmh = sp * 3.6, fx = Math.sin(V.h), fz = Math.cos(V.h);
  const visR = VIS = A.hideR().people;
  for (const sc of SCENES) {
    const dC = dist(sc.x, sc.z), seen = dC < visR && inView(sc.x, 1, sc.z, 5), near = seen && dC < YL.ANIM;
    sc.t += dt;
    // едешь на сцену — разбегаются из-под колёс (в стороны от линии машины)
    if (kmh > YL.FLEE.KMH && dC < YL.FLEE.R + 6) {
      for (const p of sc.ppl) {
        if (p.dead || p.fall || p.flee) continue;
        const dx = p.x - V.x, dz = p.z - V.z, al = dx * fx + dz * fz, ac = dx * fz - dz * fx;
        if (al > 0 && al < YL.FLEE.R && Math.abs(ac) < YL.FLEE.LAT) {
          const side = ac >= 0 ? 1 : -1;
          startFlee(p, fz * side + fx * 0.3, -fx * side + fz * 0.3);
          if (!sc.say && chance(0.5)) say(sc, p, LINES.flee, COL.flee);
        }
      }
    }
    // вещи сцены сносятся машиной
    if (sc.prop && sc.prop.visible && sp > 3 && Math.abs(sc.prop.position.x - V.x) < A.CAR_L + 0.6 && Math.abs(sc.prop.position.z - V.z) < A.CAR_L + 0.6) {
      const dx = sc.prop.position.x - V.x, dz = sc.prop.position.z - V.z;
      if (Math.abs(dx * fx + dz * fz) < A.CAR_L + 0.4 && Math.abs(dx * fz - dz * fx) < A.CAR_W + 0.5) {
        for (const m of sc.props) { m.visible = false; A.puff(m.position.x, 0.5, m.position.z, sc.kind === 'shashlik'); }
        ST.knocked++;
        unprop(sc);
        scare(sc.x, sc.z, 12);
      }
    }
    // лавочку снесли — бабки встают
    if (sc.kind === 'bench' && !sc.ex.down && sc.anchor.prop && sc.anchor.prop.down) unprop(sc);
    // дымок над мангалом
    if (sc.kind === 'shashlik' && sc.prop && sc.prop.visible && seen && (sc.ex.smT = (sc.ex.smT || 0) - dt) <= 0) {
      sc.ex.smT = dC < 60 ? 0.22 : 0.5;
      const m = sc.prop;
      FXP.part('puff', m.position.x + rand(-0.3, 0.3), m.position.y + 1.0, m.position.z + rand(-0.1, 0.1), chance(0.5) ? 0xd8d5d0 : 0xbdb8b2, rand(0.3, 0.45), 0.55,
        { vy: rand(0.7, 1.2), vx: rand(-0.2, 0.2), vz: rand(-0.2, 0.2), life: rand(1.8, 2.8), max: 2.8, grow: 2.6 });
    }
    if (sc.kind === 'domino') dominoStep(sc, dt);
    if (sc.kind === 'ball' && sc.ex.ball) ballStep(sc, dt);
    if (sc.kind === 'snowman' && sc.props[0] && sc.props[0].visible) snowStep(sc, dt);
    for (const p of sc.ppl) {
      if (p.dead) continue;
      if (p.fall) { if (HITS.fallStep(p, dt)) continue; p.st = 'back'; }
      if (carHit(p, sp, fx, fz, kmh)) continue;
      p.grp.visible = dC < visR;
      if (p.grow > 0) { p.grow = Math.min(1, p.grow + dt * 2); p.grp.scale.copy(p.sc0).multiplyScalar(p.grow); if (p.grow >= 1) p.grow = 0; }
      if (p.st === 'flee') { fleeStep(p, dt); continue; }
      if (p.st === 'back') { if (!backStep(p, dt)) continue; if (p.sl) p.sl.ph = 'queue'; }
      if (p.role === 'sled') { sledStep(sc, p, dt, near); continue; }
      if (p.role === 'roller' && sc.ex.ph !== 'done') continue;      // катает ком — snowStep
      act(p, dt, sc, near);
    }
    // болтают: реплика над головой, если курьер рядом
    if (sc.sayT > 0 && (sc.sayT -= dt) <= 0) unsay(sc);
    if ((sc.talkT -= dt) <= 0) {
      sc.talkT = rand(YL.TALK[0], YL.TALK[1]);
      const L = LINES[sc.kind + (A.ADULT ? '' : 'K')] || LINES[sc.kind];
      const live = sc.ppl.filter(p => !p.dead && p.st === 'act' && !p.fall);
      if (L && live.length && dC < YL.SAY_R && seen && sc.kind !== 'domino' && sc.kind !== 'ball') {
        if (sc.kind !== 'bench' || dC < 25) say(sc, pick(live), L);
      }
    }
  }
  for (const p of WALKERS) if (!p.dead) walkerStep(p, dt, sp, fx, fz, kmh);
}

export function init (api) {
  A = api;
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.YLIFE = DEBUG; }, 0);
}

const DEBUG = {
  YL, KIND, ST, SCENES, WALKERS, SPOT, get off () { return OFF; }, set off (v) { OFF = !!v; if (OFF) DEBUG.dropAll(); },
  /* следующая сцена — этого вида (если есть место) */
  force (kind) { FORCE = kind; scanT = 0; },
  mode: () => (A ? mode() : null),
  /* сколько людей модуля и всех людей ближе r к машине */
  count (r = 150) {
    let mine = 0;
    for (const sc of SCENES) for (const p of sc.ppl) if (!p.dead && dist(p.x, p.z) < r) mine++;
    for (const p of WALKERS) if (!p.dead && dist(p.x, p.z) < r) mine++;
    return { mine, scenes: SCENES.map(s => [s.kind, Math.round(dist(s.x, s.z)), s.ppl.filter(p => !p.dead).length]), walkers: WALKERS.length };
  },
  dropAll () { for (const sc of SCENES) dropScene(sc); SCENES.length = 0; ST.scenes = 0; for (const p of WALKERS) dropWalker(p); WALKERS.length = 0; },
};
