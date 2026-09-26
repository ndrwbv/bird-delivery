/* ──────────────────────────────────────────────────────────────────────────
   Доставка — заготовка.

   Город целиком, как в ГТА: едешь куда хочешь, маршрут до адреса
   прокладывается по улицам и перерисовывается на ходу. Картинка снята
   с «Downhill Hamster Rescue» на phaser.io — плоская заливка, пастель,
   и кадр рендерится втрое меньше экрана, отчего пиксель крупный.

   Открытый Phaser 3д не умеет (Mesh и Plane из четвёрки выпилены), та
   игра сделана на закрытом Phaser AE. Поэтому рендер здесь — three.js,
   тот же, что во всех остальных заготовках lab/.

   Петля: в пиццерии дают заказ → по асфальту загорается маршрут → везёшь
   по адресу → вручил, получил деньги → вернулся за следующим. Машины бьют
   ресурс, бургеры на тротуарах разлетаются, на заказ есть время.
   ────────────────────────────────────────────────────────────────────────── */

import * as THREE from './vendor/three.module.min.js';

/* ─────────────── мелочь ─────────────── */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const lerp = (a, b, t) => a + (b - a) * t;

/* ?intro — вместо игры катсцена-вступление к выпуску (см. раздел «вступление») */
const INTRO = new URLSearchParams(location.search).has('intro');
if (INTRO) document.body.classList.add('intro');

/* Улицы вымышленные и нарочно дурацкие — половина шутки в самом адресе */
const STREETS = [
  'улица Розовых Фламинго',
  'улица Кеков',
  'улица Дизраптовая',
  'улица Буйных Голов',
  'улица Длинноких',
  'улица Кукуева',
  'улица Шпингалетова',
  'улица Балбесов',
  'улица Омелтова',
  'Додстерная улица',
  'улица Тудейная',
  'проезд Имени Проезда',
  'улица Второго Этажа',
  'переулок Тот Самый',
  'улица Огурцовая',
  'бульвар Нерабочий',
  'улица Кривая, но прямая',
  'проезд Мимо',
  'улица Полтретьего',
  'тупик Оптимистов',
  'улица Незабудочная',
  'проспект Обычный',
  'улица Сковородкина',
  'переулок Задумчивый',
];

const HOUSES_FUN = [
  'дом 7, корпус «ы»',
  'дом 0, но он есть',
  'дом 13, подъезд примерно',
  'дом 4 дробь 4 дробь ещё раз 4',
  'дом напротив того дома',
  'дом без номера',
  'дом 21, вход со двора, двора нет',
  'дом 2, но выглядит как 3',
  'дом 8, там поймёшь',
  'дом 5, звонок не там',
];

/* ─────────────── звук: синтез, файлов нет ─────────────── */
const Snd = {
  on: true, ctx: null,
  boot () {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.on = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);
  },
  resume () { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  blip (f, d, type, v) {
    if (!this.ctx || !this.on) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.value = f;
    g.gain.value = v || 0.16;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + d);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + d);
  },
  noise (d, v) {
    if (!this.ctx || !this.on) return;
    const n = this.ctx.sampleRate * d;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = v || 0.28;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1300;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
  },
  crash (v) { this.noise(0.4, clamp(v / 40, 0.1, 0.5)); this.blip(90, 0.22, 'sawtooth', 0.2); },
  squish () { this.noise(0.13, 0.2); this.blip(210, 0.1, 'triangle', 0.12); },
  coin () { [880, 1174, 1568].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 'square', 0.12), i * 70)); },
  order () { [520, 700].forEach((f, i) => setTimeout(() => this.blip(f, 0.1, 'square', 0.12), i * 90)); },
  tick () { this.blip(1400, 0.05, 'square', 0.07); },
  boom () { this.noise(0.7, 0.55); this.blip(70, 0.5, 'sawtooth', 0.26); },
  spark () { this.noise(0.07, 0.12); },
  fail () { [440, 330, 220, 150].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.15), i * 140)); },
};

/* ─────────────── рендер: маленький кадр, растянутый на экран ───────────────
   Ровно этим Hamster Rescue и берёт — крупный пиксель вместо сглаживания. */

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
const PIXEL = 2;   // лица коллег должны читаться, поэтому кадр крупнее

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8daf4);
scene.fog = new THREE.Fog(0xd8edfa, 150, 520);

const cam = new THREE.PerspectiveCamera(64, 1, 0.3, 900);

scene.add(new THREE.HemisphereLight(0xeaf7ff, 0xa8bb98, 1.5));
const sun = new THREE.DirectionalLight(0xfff6e4, 1.45);
sun.position.set(120, 180, 90);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xdfeaff, 0.5));

function resize () {
  const w = canvas.clientWidth || 640, h = canvas.clientHeight || 360;
  renderer.setPixelRatio(1);
  renderer.setSize(Math.max(200, Math.round(w / PIXEL)), Math.max(112, Math.round(h / PIXEL)), false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  sizeRadar();
}
addEventListener('resize', resize);

/* ─────────────── склейка статики в один меш ─────────────── */

function paint (g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function put (list, g, hex, x, y, z, rx = 0, ry = 0, rz = 0) {
  // икосаэдры приходят без индекса — склейке он нужен всем одинаково
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  paint(g, hex);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  list.push(g);
  return g;
}
const box = (list, w, h, d, hex, x, y, z, ry = 0) =>
  put(list, new THREE.BoxGeometry(w, h, d), hex, x, y, z, 0, ry, 0);
const quad = (list, w, h, hex, x, y, z, rx = -Math.PI / 2, ry = 0) =>
  put(list, new THREE.PlaneGeometry(w, h), hex, x, y, z, rx, ry, 0);

function mergeGeos (list) {
  let vn = 0, iN = 0;
  for (const g of list) { vn += g.attributes.position.count; iN += g.index.count; }
  const pos = new Float32Array(vn * 3), nor = new Float32Array(vn * 3), col = new Float32Array(vn * 3);
  const idx = vn > 65535 ? new Uint32Array(iN) : new Uint16Array(iN);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ─────────────── план города ───────────────
   Честная сетка: пять проспектов на пять улиц, между ними кварталы.
   Всё в метрах, дороги двусторонние, движение правостороннее. */

const GRID = [-195, -117, -39, 39, 117, 195];  // и по X, и по Z
const RW = 14;                                 // ширина полотна
const EDGE = 195;
const BOUNDS = { x0: -214, x1: 214, z0: -214, z1: 214 };
const LANE = 3.4;                              // смещение от осевой до центра полосы
const ZEBRA = RW / 2 + 3;                      // зебра, она же место перехода для пешеходов

const SOLIDS = [];
const solid = (x0, z0, x1, z1) => SOLIDS.push({ x0, z0, x1, z1 });

/* Пешеходов надо держать снаружи геометрии, а перебирать для каждого все
   препятствия дорого — раскладываем их по клеткам сорок на сорок метров. */
const SCELL = 40, SOLID_GRID = new Map(), NO_SOLIDS = [];
const scellKey = (x, z) => Math.floor(x / SCELL) + ',' + Math.floor(z / SCELL);

function indexSolids () {
  SOLID_GRID.clear();
  for (const s of SOLIDS)
    for (let i = Math.floor(s.x0 / SCELL); i <= Math.floor(s.x1 / SCELL); i++)
      for (let j = Math.floor(s.z0 / SCELL); j <= Math.floor(s.z1 / SCELL); j++) {
        const k = i + ',' + j;
        if (!SOLID_GRID.has(k)) SOLID_GRID.set(k, []);
        SOLID_GRID.get(k).push(s);
      }
}

/* выталкиваем по меньшему проникновению — человек скользит вдоль стены */
function pushOut (p, r) {
  const near = SOLID_GRID.get(scellKey(p.x, p.z)) || NO_SOLIDS;
  for (const s of near) {
    if (p.x < s.x0 - r || p.x > s.x1 + r || p.z < s.z0 - r || p.z > s.z1 + r) continue;
    const dxl = p.x - (s.x0 - r), dxr = (s.x1 + r) - p.x;
    const dzl = p.z - (s.z0 - r), dzr = (s.z1 + r) - p.z;
    const m = Math.min(dxl, dxr, dzl, dzr);
    if (m === dxl) p.x = s.x0 - r;
    else if (m === dxr) p.x = s.x1 + r;
    else if (m === dzl) p.z = s.z0 - r;
    else p.z = s.z1 + r;
  }
}

const LIT = [];    // ламберт — всё материальное
const FLAT = [];   // бейсик — разметка и вывески, не ловят свет

const HOUSES = [];   // дома-адреса: куда возят пиццу
const PARKED = [];   // припаркованные машины у бордюра
const PARKINGS = []; // дворовые парковки: центр и въезд, на въезде может стоять шлагбаум
const PARKS = [[0, 3], [3, 0], [4, 4], [1, 1]];   // кварталы без домов — сквер с прудом
const RINGS = [];    // тротуарные кольца кварталов — маршруты бургеров
const YARD_RINGS = []; // дорожки внутри дворов — по ним ходит часть коллег
let PIZZA = null;    // пиццерия

/* ─── земля, дороги, разметка ─── */
function buildGround () {
  quad(LIT, 900, 900, '#a6d189', 0, -0.02, 0);                   // трава под всем городом

  for (const x of GRID) box(LIT, RW, 0.1, 2 * EDGE + RW, '#9aa0ab', x, 0.05, 0);
  for (const z of GRID) box(LIT, 2 * EDGE + RW, 0.1, RW, '#9aa0ab', 0, 0.06, z);

  // кварталы приподняты — это и есть тротуар
  for (let i = 0; i < GRID.length - 1; i++)
    for (let j = 0; j < GRID.length - 1; j++) {
      const x0 = GRID[i] + RW / 2, x1 = GRID[i + 1] - RW / 2;
      const z0 = GRID[j] + RW / 2, z1 = GRID[j + 1] - RW / 2;
      box(LIT, x1 - x0, 0.22, z1 - z0, '#dcd7ce', (x0 + x1) / 2, 0.11, (z0 + z1) / 2);
      box(LIT, x1 - x0 - 16, 0.04, z1 - z0 - 16, '#b2d99a', (x0 + x1) / 2, 0.24, (z0 + z1) / 2); // двор, вокруг — тротуар
      RINGS.push({ x0: x0 + 3.2, x1: x1 - 3.2, z0: z0 + 3.2, z1: z1 - 3.2 });
    }

  // осевая: прерывистая белая вдоль всех улиц, мимо перекрёстков
  const dash = (w, d, x, z) => quad(FLAT, w, d, '#f2efe6', x, 0.13, z);
  for (const x of GRID) for (let z = -EDGE; z < EDGE; z += 7) {
    if (GRID.some(g => Math.abs(z - g) < RW / 2 + 3)) continue;
    dash(0.4, 3, x, z);
  }
  for (const z of GRID) for (let x = -EDGE; x < EDGE; x += 7) {
    if (GRID.some(g => Math.abs(x - g) < RW / 2 + 3)) continue;
    dash(3, 0.4, x, z);
  }
  // зебра: полосы вдоль движения, поперёк — на всю ширину полотна
  for (const x of GRID) for (const z of GRID) {
    for (const s2 of [-1, 1]) {
      for (let i = -4; i <= 4; i++) {
        quad(FLAT, 0.8, 4.2, '#f2efe6', x + i * 1.55, 0.135, z + s2 * ZEBRA);
        quad(FLAT, 4.2, 0.8, '#f2efe6', x + s2 * ZEBRA, 0.135, z + i * 1.55);
      }
    }
  }
  // углы кварталов срезаны асфальтом — перекрёсток перестаёт быть квадратом
  for (let i = 0; i < GRID.length - 1; i++)
    for (let j = 0; j < GRID.length - 1; j++) {
      const x0 = GRID[i] + RW / 2, x1 = GRID[i + 1] - RW / 2;
      const z0 = GRID[j] + RW / 2, z1 = GRID[j + 1] - RW / 2;
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]])
        quad(LIT, 7.5, 7.5, '#9aa0ab', cx, 0.235, cz, -Math.PI / 2, Math.PI / 4);
    }

  // стоп-линии и стрелки направлений перед каждым перекрёстком
  for (const x of GRID) for (const z of GRID) {
    for (const s2 of [-1, 1]) {
      quad(FLAT, RW / 2 - 1, 0.7, '#f2efe6', x - s2 * (LANE), 0.136, z + s2 * (ZEBRA + 3.2));
      quad(FLAT, 0.7, RW / 2 - 1, '#f2efe6', x + s2 * (ZEBRA + 3.2), 0.136, z + s2 * (LANE));
      // стрелка «прямо» на своей полосе
      const ax = x - s2 * LANE, az = z + s2 * (ZEBRA + 7);
      quad(FLAT, 0.4, 2.2, '#f2efe6', ax, 0.136, az);
      put(FLAT, new THREE.CircleGeometry(0.75, 3), '#f2efe6', ax, 0.136, az - s2 * 1.6,
          -Math.PI / 2, s2 > 0 ? Math.PI : 0);
      const bx = x + s2 * (ZEBRA + 7), bz = z + s2 * LANE;
      quad(FLAT, 2.2, 0.4, '#f2efe6', bx, 0.136, bz);
      put(FLAT, new THREE.CircleGeometry(0.75, 3), '#f2efe6', bx + s2 * 1.6, 0.136, bz,
          -Math.PI / 2, s2 > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }

  // бордюр по краю мира — чтобы город не обрывался в пустоту
  for (const s of [-1, 1]) {
    box(LIT, 2 * EDGE + RW + 8, 1.6, 2.4, '#8fb178', 0, 0.8, s * (EDGE + RW / 2 + 3));
    box(LIT, 2.4, 1.6, 2 * EDGE + RW + 8, '#8fb178', s * (EDGE + RW / 2 + 3), 0.8, 0);
  }
}

/* ─── дома, деревья, фонари ─── */
const WALLS = ['#e9bcc8', '#c7d9ef', '#f0dcae', '#c2e0cd', '#d9c8ea', '#eecfb4', '#e6d3c0'];

function building (cx, cz, w, d, floors, hex, faceAxis, faceSign) {
  const h = 4 + floors * 3.4;
  box(LIT, w, h, d, hex, cx, h / 2 + 0.22, cz);

  // крыша: плоская с парапетом, двускатная или с уступом — дома перестают быть одинаковыми
  const roof = (Math.random() * 3) | 0;
  if (roof === 0) {
    box(LIT, w + 1.2, 0.8, d + 1.2, '#b0a2a9', cx, h + 0.5, cz);
    if (chance(0.5)) box(LIT, 2.2, 1.8, 2.2, '#9c8f96', cx + rand(-w / 4, w / 4), h + 1.6, cz);  // будка выхода
  } else if (roof === 1) {
    const rg = new THREE.CylinderGeometry(Math.min(w, d) * 0.58, Math.min(w, d) * 0.58, Math.max(w, d) + 0.6, 4, 1);
    rg.rotateY(Math.PI / 4);        // конёк наверх, а не ребром
    rg.rotateZ(Math.PI / 2);        // ось цилиндра ложится вдоль X
    if (d > w) rg.rotateY(Math.PI / 2);
    put(LIT, rg, pick(['#9a6b5e', '#7d6a80', '#6f8a72', '#8a7a5e']), cx, h + 0.4, cz);
  } else {
    box(LIT, w + 1, 0.7, d + 1, '#b0a2a9', cx, h + 0.35, cz);
    box(LIT, w * 0.62, 3.2, d * 0.62, hex, cx, h + 1.9, cz);
    box(LIT, w * 0.62 + 0.8, 0.6, d * 0.62 + 0.8, '#b0a2a9', cx, h + 3.7, cz);
  }
  // балконы на паре этажей — фасад оживает
  if (chance(0.55)) {
    const fx0 = faceAxis === 'x' ? faceSign * (w / 2 + 0.5) : 0;
    const fz0 = faceAxis === 'z' ? faceSign * (d / 2 + 0.5) : 0;
    for (let f = 1; f < floors; f++) {
      if (!chance(0.6)) continue;
      const y = 3.4 + f * 3.4;
      box(LIT, faceAxis === 'x' ? 1.1 : w * 0.5, 0.16, faceAxis === 'x' ? d * 0.5 : 1.1,
          '#cdc6c0', cx + fx0, y - 0.4, cz + fz0);
      box(LIT, faceAxis === 'x' ? 1.1 : w * 0.5, 0.9, faceAxis === 'x' ? 0.12 : 1.1,
          '#b5aca6', cx + fx0 + (faceAxis === 'x' ? 0 : 0), y + 0.1,
          cz + fz0 + (faceAxis === 'z' ? 0.5 : 0));
    }
  }
  // окна лентами по всем четырём стенам
  for (let f = 0; f < floors; f++) {
    const y = 3.4 + f * 3.4;
    for (const [aw, ax, az, ry] of [[w - 2.4, 0, d / 2 + 0.06, 0], [w - 2.4, 0, -d / 2 - 0.06, 0],
                                    [d - 2.4, w / 2 + 0.06, 0, Math.PI / 2], [d - 2.4, -w / 2 - 0.06, 0, Math.PI / 2]]) {
      const n = Math.max(1, Math.floor(aw / 3.4));
      for (let i = 0; i < n; i++) {
        const off = -aw / 2 + aw / n * (i + 0.5);
        const hex2 = chance(0.28) ? '#ffe9a8' : '#8fb0cc';
        const px = cx + (ry ? ax : off), pz = cz + (ry ? off : az);
        put(FLAT, new THREE.PlaneGeometry(1.7, 2), hex2, px, y + 0.22, pz, 0, ry ? Math.sign(ax) * Math.PI / 2 : (az > 0 ? 0 : Math.PI), 0);
      }
    }
  }
  // дверь и козырёк со стороны улицы
  const fx = faceAxis === 'x' ? faceSign * (w / 2 + 0.08) : 0;
  const fz = faceAxis === 'z' ? faceSign * (d / 2 + 0.08) : 0;
  const ry = faceAxis === 'x' ? faceSign * Math.PI / 2 : (faceSign > 0 ? 0 : Math.PI);
  put(FLAT, new THREE.PlaneGeometry(2.2, 3), '#6b4c3a', cx + fx, 1.72, cz + fz, 0, ry, 0);
  const awn = pick(['#d9534f', '#3f8f6d', '#3a6ea8', '#c98b2e']);
  box(LIT, faceAxis === 'x' ? 1.6 : 6, 0.4, faceAxis === 'x' ? 6 : 1.6, awn,
      cx + fx * 1.3, 3.6, cz + fz * 1.3);
  solid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  return { x: cx + fx, z: cz + fz, ry };
}

function tree (x, z) {
  box(LIT, 0.55, 2.6, 0.55, '#7a5a3c', x, 1.5, z);
  put(LIT, new THREE.IcosahedronGeometry(1.85, 0), '#5aa04a', x, 4.1, z);
  put(LIT, new THREE.IcosahedronGeometry(1.3, 0), '#6fb05a', x + 0.5, 5.2, z - 0.35);
  solid(x - 0.55, z - 0.55, x + 0.55, z + 0.55);
}

function lamp (x, z) {
  addProp(x, z, 0, 'lamp', g => {
    propBox(g, 0.28, 6, 0.28, '#585460', 0, 3.2, 0);
    propBox(g, 1.6, 0.25, 0.3, '#585460', 0.7, 6.1, 0);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    bulb.position.set(1.3, 5.95, 0);
    g.add(bulb);
    g.userData.bulb = bulb;
  }, 0.9);
}

/* ─── двор: газон, дорожки, площадка, лавочки ───
   Половина заказов едет сюда, поэтому двор должен быть проезжим:
   заборчик ставим кусками и всегда оставляем заезды. */
const BENCHES = [];

/* Куда лавочку развернуть. Модель смотрит в +Z при ry = 0, то есть
   направление взгляда — (sin ry, cos ry). Нужна ближайшая дорога:
   сидят лицом к улице, а не в забор и не в стену дома. */
function faceRoad (x, z) {
  let bx = GRID[0], bz = GRID[0];
  for (const g of GRID) {
    if (Math.abs(g - x) < Math.abs(bx - x)) bx = g;
    if (Math.abs(g - z) < Math.abs(bz - z)) bz = g;
  }
  return Math.abs(bx - x) < Math.abs(bz - z)
    ? (bx > x ? Math.PI / 2 : -Math.PI / 2)
    : (bz > z ? 0 : Math.PI);
}

/* Уличный реквизит живёт отдельными мешами, а не в склейке: только так
   его можно снести машиной. Каждый объект висит на пивоте в точке
   основания — от удара пивот заваливается набок. */
const PROPS = [];
const TILT_AXIS = new THREE.Vector3();

function addProp (x, z, ry, kind, build, r) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, z);
  const inner = new THREE.Group();
  inner.rotation.y = ry;
  build(inner);
  pivot.add(inner);
  scene.add(pivot);
  const p = { pivot, inner, x, z, ry, kind, r, down: 0, tilt: 0, tiltV: 0, ax: 1, az: 0 };
  PROPS.push(p);
  return p;
}

const propMat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
const propBox = (g, w, h, d, hex, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), propMat(hex));
  m.position.set(x, y, z);
  g.add(m);
  return m;
};

function bench (x, z, ry) {
  if (ry === undefined) ry = faceRoad(x, z);
  const p = addProp(x, z, ry, 'bench', g => {
    propBox(g, 2.6, 0.18, 0.7, '#8a6b4e', 0, 0.62, 0);
    propBox(g, 2.6, 0.7, 0.16, '#8a6b4e', 0, 1.05, -0.28);
    propBox(g, 0.18, 0.5, 0.6, '#5c5560', -1.15, 0.3, 0);
    propBox(g, 0.18, 0.5, 0.6, '#5c5560', 1.15, 0.3, 0);
  }, 1.7);
  BENCHES.push({ x, z, ry, prop: p });
  return p;
}

function buildYard (r) {
  const x0 = r.x0, x1 = r.x1, z0 = r.z0, z1 = r.z1;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (x1 - x0 < 13 || z1 - z0 < 13) return;      // двора не осталось
  box(LIT, x1 - x0 - 2, 0.03, 3, '#cdc6bb', cx, 0.25, cz);
  box(LIT, 3, 0.03, z1 - z0 - 2, '#cdc6bb', cx, 0.25, cz);

  // детская площадка: песочница, горка, качели
  box(LIT, 6, 0.12, 6, '#e6d3a8', cx, 0.3, cz);
  box(LIT, 6.4, 0.3, 0.4, '#a8814e', cx, 0.4, cz - 3);
  box(LIT, 6.4, 0.3, 0.4, '#a8814e', cx, 0.4, cz + 3);
  box(LIT, 0.4, 0.3, 6.4, '#a8814e', cx - 3, 0.4, cz);
  box(LIT, 0.4, 0.3, 6.4, '#a8814e', cx + 3, 0.4, cz);
  box(LIT, 1.2, 2.2, 1.2, '#d95d5d', cx - 1.6, 1.4, cz);
  put(LIT, new THREE.BoxGeometry(1.1, 0.2, 3.6), '#4f7fd6', cx + 0.4, 1.5, cz, 0.55, 0, 0);
  box(LIT, 0.2, 2.2, 0.2, '#59b06a', cx + 2.4, 1.4, cz - 1.4);
  box(LIT, 0.2, 2.2, 0.2, '#59b06a', cx + 2.4, 1.4, cz + 1.4);
  box(LIT, 0.2, 0.2, 3.2, '#59b06a', cx + 2.4, 2.5, cz);
  box(LIT, 0.7, 0.12, 0.4, '#e0b13f', cx + 2.4, 1.2, cz - 0.7);
  solid(cx - 3.2, cz - 3.2, cx + 3.2, cz + 3.2);

  bench(cx - 5.5, cz - 4); bench(cx + 5.5, cz + 4); bench(cx - 4, cz + 5.5);

  // Дворовая парковка: полоса с разметкой вдоль края двора и въезд со
  // стороны двора. Шлагбаум потом вешается именно на этот въезд.
  if (chance(0.55))
  {
    const pw = Math.min(19, x1 - x0 - 4), pd = 7;
    const side = chance(0.5) ? 1 : -1;
    const pz = side > 0 ? z1 - pd / 2 - 1 : z0 + pd / 2 + 1;
    box(LIT, pw, 0.05, pd, '#9aa0ab', cx, 0.27, pz);
    for (let i = 1; i < 5; i++)
      quad(FLAT, 0.35, pd - 1.4, '#f2efe6', cx - pw / 2 + i * pw / 5, 0.31, pz);
    quad(FLAT, pw, 0.35, '#f2efe6', cx, 0.31, pz - side * (pd / 2 - 0.4));
    for (let i = 0; i < 5; i++)
      if (chance(0.55)) PARKED.push([cx - pw / 2 + (i + 0.5) * pw / 5, pz + side * 0.4, 0]);
    PARKINGS.push({ cx, cz: pz, ex: cx, ez: pz - side * (pd / 2 + 3.5) });
  }
  for (let i = 0; i < 3; i++)
    if (chance(0.6)) tree(lerp(x0 + 5, x1 - 5, Math.random()), lerp(z0 + 5, z1 - 5, Math.random()));

}

/* ─── парковка у дома: карман от бордюра внутрь квартала ───
   Второй вид парковки помимо дворовой: заезжаешь прямо с улицы. */
function streetParking (cx, cz, ax, sg, len) {
  const dep = 9;
  box(LIT, ax === 'z' ? len : dep, 0.05, ax === 'z' ? dep : len, '#9aa0ab', cx, 0.27, cz);
  const n = Math.max(3, Math.floor(len / 3.8));
  for (let i = 1; i < n; i++) {
    const t = -len / 2 + i * len / n;
    if (ax === 'z') quad(FLAT, 0.35, dep - 1.8, '#f2efe6', cx + t, 0.31, cz);
    else quad(FLAT, dep - 1.8, 0.35, '#f2efe6', cx, 0.31, cz + t);
  }
  for (let i = 0; i < n; i++) {
    if (!chance(0.5)) continue;
    const t = -len / 2 + (i + 0.5) * len / n;
    if (ax === 'z') PARKED.push([cx + t, cz - sg * 0.8, 0]);
    else PARKED.push([cx - sg * 0.8, cz + t, Math.PI / 2]);
  }
  PARKINGS.push({
    cx, cz,
    ex: ax === 'z' ? cx : cx + sg * (dep / 2 + 3),
    ez: ax === 'z' ? cz + sg * (dep / 2 + 3) : cz,
  });
}

/* ─── витиеватый подъезд: три колена от бордюра во двор ───
   Живая изгородь вдоль них настоящая, так что срезать не выйдет —
   но двор открыт с других сторон, в тупике не запрёшься. */
function windingDrive (cx, cz, ax, sg, deep) {
  const W = 6, turn = 11;
  const fwd = (a, b, l) => ax === 'z' ? [a, b - sg * l] : [a - sg * l, b];
  const sideStep = (a, b, l) => ax === 'z' ? [a + l, b] : [a, b + l];

  let [x, z] = [cx, cz];
  const legs = [];
  let [nx, nz] = fwd(x, z, deep * 0.38); legs.push([x, z, nx, nz]); [x, z] = [nx, nz];
  [nx, nz] = sideStep(x, z, turn); legs.push([x, z, nx, nz]); [x, z] = [nx, nz];
  [nx, nz] = fwd(x, z, deep * 0.45); legs.push([x, z, nx, nz]);

  for (const [ax0, az0, ax1, az1] of legs) {
    const mx = (ax0 + ax1) / 2, mz = (az0 + az1) / 2;
    const w = Math.abs(ax1 - ax0) + W, d = Math.abs(az1 - az0) + W;
    box(LIT, w, 0.04, d, '#9aa0ab', mx, 0.27, mz);
    // изгородь вдоль длинной стороны колена
    const along = Math.abs(ax1 - ax0) > Math.abs(az1 - az0);
    for (const sd of [-1, 1]) {
      const hx = along ? mx : mx + sd * (W / 2 + 0.5);
      const hz = along ? mz + sd * (W / 2 + 0.5) : mz;
      const hw = along ? w - 1 : 1.1, hd = along ? 1.1 : d - 1;
      box(LIT, hw, 1.1, hd, '#5f8a52', hx, 0.8, hz);
      solid(hx - hw / 2, hz - hd / 2, hx + hw / 2, hz + hd / 2);
    }
  }
}

/* ─── парк: квартал без домов ─── */
function buildPark (cx, cz, x0, x1, z0, z1) {
  box(LIT, x1 - x0 - 2, 0.05, z1 - z0 - 2, '#8fc474', cx, 0.25, cz);
  put(LIT, new THREE.BoxGeometry(x1 - x0 + 6, 0.04, 3.4), '#d5cdbf', cx, 0.29, cz, 0, Math.PI / 4, 0);
  put(LIT, new THREE.BoxGeometry(x1 - x0 + 6, 0.04, 3.4), '#d5cdbf', cx, 0.29, cz, 0, -Math.PI / 4, 0);
  const pz = cz - (z1 - z0) / 5;
  put(LIT, new THREE.CylinderGeometry(6.2, 6.2, 0.1, 14), '#b8b09c', cx, 0.27, pz);
  put(LIT, new THREE.CylinderGeometry(5.5, 5.5, 0.12, 14), '#6fb0c9', cx, 0.3, pz);
  for (let i = 0; i < 14; i++) {
    const tx = lerp(x0 + 3, x1 - 3, Math.random()), tz = lerp(z0 + 3, z1 - 3, Math.random());
    if (Math.hypot(tx - cx, tz - pz) < 8) continue;
    tree(tx, tz);
  }
  for (const [bx, bz] of [[cx - 8, cz + 8], [cx + 8, cz + 8], [cx + 9, cz - 6], [cx - 9, cz - 6]])
    bench(bx, bz);
  lamp(cx - 6, cz + 2); lamp(cx + 6, cz - 2);
}

/* ─── пиццерия: широкая, оранжевая, её видно с перекрёстка ─── */
function buildPizzeria (cx, cz) {
  const w = 26, d = 18, h = 9;
  box(LIT, w, h, d, '#f4eee5', cx, h / 2 + 0.22, cz);
  box(LIT, w + 1.4, 1, d + 1.4, '#b0a2a9', cx, h + 0.6, cz);
  box(FLAT, w - 4, 2.4, 0.5, '#ff6900', cx, h - 1.4, cz + d / 2 + 0.3);      // вывеска
  box(LIT, w - 2, 0.5, 3.2, '#ff6900', cx, 4.6, cz + d / 2 + 1.4);           // козырёк
  put(FLAT, new THREE.PlaneGeometry(w - 6, 3.4), '#cfe3f2', cx, 2.4, cz + d / 2 + 0.07); // витрина
  put(FLAT, new THREE.PlaneGeometry(3, 3.4), '#6b4c3a', cx + w / 2 - 4, 1.92, cz + d / 2 + 0.09);
  solid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  PIZZA = { x: cx, z: cz + d / 2 + 15, name: 'пиццерия' };
}

function buildBlocks () {
  for (let i = 0; i < GRID.length - 1; i++)
    for (let j = 0; j < GRID.length - 1; j++) {
      const x0 = GRID[i] + RW / 2, x1 = GRID[i + 1] - RW / 2;
      const z0 = GRID[j] + RW / 2, z1 = GRID[j + 1] - RW / 2;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

      if (i === 2 && j === 2) { buildPizzeria(cx, cz); continue; }   // центральный квартал — пиццерия
      if (PARKS.some(pk => pk[0] === i && pk[1] === j)) { buildPark(cx, cz, x0, x1, z0, z1); continue; }

      // По дому на сторону, фасадом на улицу и в шести метрах от бордюра —
      // чтобы тротуар остался проходимым. Двор считаем по тому, что дома не
      // заняли: иначе дворовая дорожка шла сквозь здание и гость оказывался
      // внутри стены, где его не видно.
      const INSET = 6;
      const inner = { x0, x1, z0, z1 };
      // Домами занимаем одну сторону по X и одну по Z, изредка третью.
      // На все четыре квартал не рассчитан: дома съедали двор целиком,
      // и гостю негде было стоять на виду.
      const zSide = chance(0.5) ? 1 : -1, xSide = chance(0.5) ? 1 : -1;
      const sides = [
        { ax: 'z', sg: zSide, along: cx + rand(-6, 6) },
        { ax: 'x', sg: xSide, along: cz + rand(-6, 6) },
      ];
      if (chance(0.35)) sides.push({ ax: 'z', sg: -zSide, along: cx + rand(-6, 6) });
      for (const s of sides) {
        const w = s.ax === 'x' ? rand(9, 12) : rand(13, 19);
        const d = s.ax === 'x' ? rand(13, 18) : rand(9, 12);
        const bx = s.ax === 'x' ? (s.sg > 0 ? x1 - INSET - w / 2 : x0 + INSET + w / 2) : s.along;
        const bz = s.ax === 'z' ? (s.sg > 0 ? z1 - INSET - d / 2 : z0 + INSET + d / 2) : s.along;
        const door = building(bx, bz, w, d, 2 + ((Math.random() * 4) | 0), pick(WALLS), s.ax, s.sg);
        if (s.ax === 'x') {
          if (s.sg > 0) inner.x1 = Math.min(inner.x1, bx - w / 2 - 3);
          else inner.x0 = Math.max(inner.x0, bx + w / 2 + 3);
        } else {
          if (s.sg > 0) inner.z1 = Math.min(inner.z1, bz - d / 2 - 3);
          else inner.z0 = Math.max(inner.z0, bz + d / 2 + 3);
        }
        HOUSES.push({
          x: door.x, z: door.z,
          mx: door.x + (s.ax === 'x' ? s.sg * 4 : 0),
          mz: door.z + (s.ax === 'z' ? s.sg * 4 : 0),
          addr: pick(STREETS),
        });
      }
      // На стороне без дома — либо карман-парковка с улицы, либо
      // витиеватый подъезд во двор. Дворовая парковка уже внутри.
      const busy = new Set(sides.map(sd => sd.ax + sd.sg));
      for (const [ax2, sg2] of [['z', 1], ['z', -1], ['x', 1], ['x', -1]]) {
        if (busy.has(ax2 + sg2)) continue;
        const along = ax2 === 'z' ? cx + rand(-8, 8) : cz + rand(-8, 8);
        const nearKerb = sg2 > 0
          ? (ax2 === 'z' ? z1 - 5.5 : x1 - 5.5)
          : (ax2 === 'z' ? z0 + 5.5 : x0 + 5.5);
        const r2 = Math.random();
        if (r2 < 0.45) {
          if (ax2 === 'z') streetParking(along, nearKerb, ax2, sg2, rand(17, 24));
          else streetParking(nearKerb, along, ax2, sg2, rand(17, 24));
        } else if (r2 < 0.72) {
          if (ax2 === 'z') windingDrive(along, nearKerb, ax2, sg2, 26);
          else windingDrive(nearKerb, along, ax2, sg2, 26);
        }
      }

      buildYard(inner);
      // дворовая дорожка только там, где двор реально остался
      if (inner.x1 - inner.x0 > 17 && inner.z1 - inner.z0 > 17)
        YARD_RINGS.push({
          x0: inner.x0 + 1.5, x1: inner.x1 - 1.5,
          z0: inner.z0 + 1.5, z1: inner.z1 - 1.5, inner: true,
        });

      // киоск, остановка, урны и припаркованные — улица перестаёт быть пустой
      if (chance(0.45)) {
        const kx = lerp(x0 + 6, x1 - 6, Math.random()), kz = chance(0.5) ? z0 + 5.4 : z1 - 5.4;
        box(LIT, 3.2, 2.8, 2.4, pick(['#4f7fd6', '#59b06a', '#d95d5d']), kx, 1.6, kz);
        box(LIT, 3.8, 0.35, 3, '#e8e2d6', kx, 3.1, kz);
        put(FLAT, new THREE.PlaneGeometry(2.4, 1.2), '#cfe3f2', kx, 1.9, kz + 1.22);
      }
      if (chance(0.5)) bench(chance(0.5) ? x0 + 1.7 : x1 - 1.7, lerp(z0 + 8, z1 - 8, Math.random()));
      if (chance(0.4)) bench(lerp(x0 + 8, x1 - 8, Math.random()), chance(0.5) ? z0 + 1.7 : z1 - 1.7);
      if (chance(0.5)) {
        const ux = lerp(x0 + 5, x1 - 5, Math.random());
        put(LIT, new THREE.CylinderGeometry(0.4, 0.34, 1, 8), '#4e5a4a', ux, 0.72, chance(0.5) ? z0 + 4.8 : z1 - 4.8);
      }
      // зелень и фонари по периметру
      for (const [tx, tz] of [[x0 + 5, z0 + 5], [x1 - 5, z0 + 5], [x0 + 5, z1 - 5], [x1 - 5, z1 - 5]])
        if (chance(0.75)) tree(tx, tz);
      lamp(x0 + 2, cz); lamp(x1 - 2, cz);
      // Припаркованные стоят на тротуаре у бордюра и подальше от углов:
      // на полосе они перекрывали движение, а у угла спавнились на зебре.
      // не на пешеходном кольце (оно в 3.2 от бордюра) и не у зебры
      if (chance(0.6)) PARKED.push([lerp(x0 + 15, x1 - 15, Math.random()), z1 - 4.9, Math.PI / 2]);
      if (chance(0.6)) PARKED.push([x1 - 4.9, lerp(z0 + 15, z1 - 15, Math.random()), 0]);
    }
}

/* ─────────────── граф улиц для маршрута ───────────────
   Узлы — перекрёстки, рёбра — куски улиц. Поиск в ширину даёт
   кратчайший путь; ехать по нему или срезать — дело водителя. */

const NODES = [];
const NIDX = (i, j) => i * GRID.length + j;
for (let i = 0; i < GRID.length; i++)
  for (let j = 0; j < GRID.length; j++)
    NODES.push({ i, j, x: GRID[i], z: GRID[j], nb: [] });
for (let i = 0; i < GRID.length; i++)
  for (let j = 0; j < GRID.length; j++) {
    const n = NODES[NIDX(i, j)];
    if (i > 0) n.nb.push(NIDX(i - 1, j));
    if (i < GRID.length - 1) n.nb.push(NIDX(i + 1, j));
    if (j > 0) n.nb.push(NIDX(i, j - 1));
    if (j < GRID.length - 1) n.nb.push(NIDX(i, j + 1));
  }

function nearestNode (x, z) {
  let best = 0, bd = Infinity;
  for (let k = 0; k < NODES.length; k++) {
    const d = (NODES[k].x - x) ** 2 + (NODES[k].z - z) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function routeNodes (fromX, fromZ, toX, toZ) {
  const a = nearestNode(fromX, fromZ), b = nearestNode(toX, toZ);
  if (a === b) return [NODES[a]];
  const prev = new Int32Array(NODES.length).fill(-1);
  const seen = new Uint8Array(NODES.length);
  const q = [a]; seen[a] = 1;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    if (cur === b) break;
    for (const nb of NODES[cur].nb) {
      if (seen[nb]) continue;
      seen[nb] = 1; prev[nb] = cur; q.push(nb);
    }
  }
  const path = [];
  for (let k = b; k !== -1; k = prev[k]) { path.unshift(NODES[k]); if (k === a) break; }
  return path;
}

/* ─────────────── эффекты: искры, дым, огонь, кровь, следы ───────────────
   Один список на всё: у частицы своя скорость, время жизни и то,
   как она гаснет. Материалы клонируются — иначе гаснут все разом. */

const FX = [], DECALS = [];
const sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
const bitGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);

function fxAdd (mesh, o) {
  scene.add(mesh);
  FX.push(Object.assign({ mesh, vx: 0, vy: 0, vz: 0, life: 1, max: 1, grow: 0, spin: 0, gravity: 0, fade: 1 }, o));
}

/* искры — от чиркания о стену и от удара в чужую машину */
function sparks (x, y, z, n, dirx, dirz) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: chance(0.5) ? 0xfff3c4 : 0xffa022 }));
    m.position.set(x, y, z);
    fxAdd(m, {
      vx: (dirx || 0) * rand(1, 4) + rand(-5, 5), vy: rand(1.5, 6), vz: (dirz || 0) * rand(1, 4) + rand(-5, 5),
      life: rand(0.25, 0.6), max: 0.6, gravity: 16, spin: rand(-20, 20),
    });
  }
}

/* дым из-под капота: чем хуже машине, тем чернее */
function puff (x, y, z, dark, size) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
    color: dark ? 0x3a3238 : 0xd8d5d0, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  m.position.set(x, y, z);
  m.scale.setScalar(size || 0.7);
  fxAdd(m, { vy: rand(1.4, 2.6), vx: rand(-0.6, 0.6), vz: rand(-0.6, 0.6), life: rand(1, 1.8), max: 1.8, grow: 1.5, spin: rand(-1, 1) });
}

function fire (x, y, z) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
    color: chance(0.5) ? 0xff8a2b : 0xffd34d, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  m.position.set(x, y, z);
  m.scale.setScalar(rand(0.5, 1.1));
  fxAdd(m, { vy: rand(2, 4), vx: rand(-1.2, 1.2), vz: rand(-1.2, 1.2), life: rand(0.4, 0.8), max: 0.8, grow: 2.2 });
}

/* след на асфальте: кровь, копоть. Лежит и медленно выцветает */
function decal (x, z, hex, r, life) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.13 + DECALS.length * 0.002, z);
  m.scale.set(rand(0.8, 1.3), rand(0.8, 1.3), 1);
  scene.add(m);
  DECALS.push({ m, life: life || 30, max: life || 30 });
  if (DECALS.length > 70) { const d = DECALS.shift(); scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); }
}

function blood (x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color: chance(0.4) ? 0x8f1f2b : 0xc42b32 }));
    m.position.set(x, y, z);
    fxAdd(m, { vx: rand(-6, 6), vy: rand(2, 7), vz: rand(-6, 6), life: rand(0.5, 1.2), max: 1.2, gravity: 17, spin: rand(-14, 14) });
  }
  for (let i = 0; i < 3; i++) decal(x + rand(-1.6, 1.6), z + rand(-1.6, 1.6), 0x8f1f2b, rand(0.7, 1.4), 40);
}

function boom (x, z) {
  for (let i = 0; i < 16; i++) fire(x + rand(-1.5, 1.5), rand(0.5, 3), z + rand(-1.5, 1.5));
  for (let i = 0; i < 10; i++) puff(x + rand(-2, 2), rand(1, 3.5), z + rand(-2, 2), true, rand(0.9, 1.7));
  sparks(x, 1, z, 26);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(bitGeo, new THREE.MeshLambertMaterial({ color: 0x2a2530, flatShading: true }));
    m.position.set(x, 1, z);
    m.scale.setScalar(rand(0.8, 2.4));
    fxAdd(m, { vx: rand(-9, 9), vy: rand(5, 12), vz: rand(-9, 9), life: rand(1.4, 2.4), max: 2.4, gravity: 18, spin: rand(-12, 12) });
  }
  decal(x, z, 0x231d24, 3.4, 60);
  Snd.boom();
  blastAt(x, z, 11);
}

/* ударная волна: людей рвёт, бургеры рассыпает, соседние машины расшвыривает */
function blastAt (x, z, r) {
  for (const p of PEOPLE) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > r) continue;
    const k = (1 - d / r) * 26;
    runOver(p, (p.x - x) / (d || 1) * k, (p.z - z) / (d || 1) * k);
  }
  for (const p of PEDS) {
    if (p.dead) continue;
    if (Math.hypot(p.x - x, p.z - z) > r) continue;
    p.dead = 1; p.deadT = rand(6, 14);
    p.grp.visible = false;
    gibBurger(p.x, p.z);
    S.burgers++;
  }
  for (const t of TRAFFIC) {
    if (t.wreck) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d > r || d < 0.5) continue;
    const k = (1 - d / r) * 34;
    dentCar(t.mesh, x, z, k);
    knockCar(t, (t.x - x) / d, (t.z - z) / d, k);
  }
  // и самого курьера подбрасывает, если стоял рядом
  const dp = Math.hypot(V.x - x, V.z - z);
  if (dp < r && dp > 0.3) {
    const k = (1 - dp / r) * 22;
    V.vx += (V.x - x) / dp * k;
    V.vz += (V.z - z) / dp * k;
    S.shake = Math.max(S.shake, 1.2);
  }
}

function updateFX (dt) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i], m = f.mesh;
    f.vy -= f.gravity * dt;
    m.position.x += f.vx * dt; m.position.y += f.vy * dt; m.position.z += f.vz * dt;
    if (f.spin) { m.rotation.x += f.spin * dt; m.rotation.z += f.spin * 0.7 * dt; }
    if (f.grow) m.scale.multiplyScalar(1 + f.grow * dt);
    if (m.position.y < 0.12 && f.gravity) { m.position.y = 0.12; f.vy *= -0.3; f.vx *= 0.5; f.vz *= 0.5; }
    f.life -= dt;
    if (m.material && m.material.transparent) m.material.opacity = clamp(f.life / f.max, 0, 1) * 0.85;
    if (f.life <= 0) { scene.remove(m); if (m.material && m.material.dispose) m.material.dispose(); FX.splice(i, 1); }
  }
  for (let i = DECALS.length - 1; i >= 0; i--) {
    const d = DECALS[i];
    d.life -= dt;
    if (d.life < 6) d.m.material.opacity = Math.max(0, d.life / 6) * 0.85;
    if (d.life <= 0) { scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); DECALS.splice(i, 1); }
  }
}

/* ─────────────── эмоции гостя ───────────────
   Сердечки, если привёз вовремя, и злая реплика, если опоздал.
   Рисуем на канвасе — спрайт всегда развёрнут к камере. */

const emoteTexCache = new Map();
function emoteTex (kind) {
  if (emoteTexCache.has(kind)) return emoteTexCache.get(kind);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  if (kind === 'heart') {
    x.fillStyle = '#ff5d7a';
    x.beginPath();
    x.moveTo(32, 56);
    x.bezierCurveTo(-6, 30, 10, 4, 32, 20);
    x.bezierCurveTo(54, 4, 70, 30, 32, 56);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.beginPath(); x.ellipse(22, 22, 6, 4, -0.5, 0, Math.PI * 2); x.fill();
  } else {
    x.fillStyle = '#e8323c';
    x.fillRect(26, 8, 12, 30);
    x.fillRect(26, 44, 12, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  emoteTexCache.set(kind, t);
  return t;
}

function emote (x, y, z, kind, n) {
  for (let i = 0; i < (n || 4); i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: emoteTex(kind), transparent: true, depthWrite: false, opacity: 0.9,
    }));
    m.position.set(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4));
    m.scale.setScalar(rand(0.5, 0.85));
    fxAdd(m, { vy: rand(1, 1.8), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), life: rand(1.2, 2), max: 2 });
  }
}

/* пар от горячей пиццы */
function steam (x, y, z) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false,
  }));
  m.position.set(x + rand(-0.1, 0.1), y, z + rand(-0.1, 0.1));
  m.scale.setScalar(0.16);
  fxAdd(m, { vy: rand(0.6, 1.1), life: rand(0.9, 1.5), max: 1.5, grow: 1.2 });
}

/* коробка с пиццей — и летящая, и та, что уже в руках */
function pizzaBox () {
  const g = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.85), mat('#ff6900'));
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.1), mat('#fff3d6'));
  l.position.set(0, 0.13, 0);
  g.add(b, l);
  return g;
}

/* ─────────────── машины ───────────────
   Силуэт советского седана: длинный капот, коробка салона, короткий
   багажник, хромированные бамперы и круглые фары. Кузов собран из
   отдельных панелей — только так их можно по-настоящему мять. */

function makeCar (bodyHex, roofSign) {
  const g = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const panels = [];
  const add = (geo, hex, x, y, z, panel) => {
    const me = new THREE.Mesh(geo, mat(hex));
    me.position.set(x, y, z);
    g.add(me);
    if (panel) panels.push({ m: me, p: me.position.clone(), r: me.rotation.clone(), hex });
    return me;
  };

  const dark = new THREE.Color(bodyHex).multiplyScalar(0.78).getHexString();
  const CHR = '#cfd3d8', GLASS = '#5b7ea3';

  // днище и крылья
  add(new THREE.BoxGeometry(1.74, 0.42, 4.3), bodyHex, 0, 0.62, 0);
  add(new THREE.BoxGeometry(1.86, 0.2, 4.0), '#' + dark, 0, 0.44, 0);
  // капот и багажник — отдельные панели
  add(new THREE.BoxGeometry(1.68, 0.16, 1.5), bodyHex, 0, 0.86, 1.28, 'hood');
  add(new THREE.BoxGeometry(1.68, 0.16, 1.05), bodyHex, 0, 0.88, -1.52, 'trunk');
  // салон: стойки и крыша
  add(new THREE.BoxGeometry(1.62, 0.62, 2.0), bodyHex, 0, 1.12, -0.22);
  add(new THREE.BoxGeometry(1.5, 0.12, 1.95), bodyHex, 0, 1.46, -0.25, 'roof');
  // двери
  add(new THREE.BoxGeometry(0.1, 0.5, 1.85), '#' + dark, -0.88, 0.82, -0.2, 'doorL');
  add(new THREE.BoxGeometry(0.1, 0.5, 1.85), '#' + dark, 0.88, 0.82, -0.2, 'doorR');
  // стёкла
  const wsF = add(new THREE.BoxGeometry(1.46, 0.46, 0.1), GLASS, 0, 1.24, 0.76);
  const wsB = add(new THREE.BoxGeometry(1.46, 0.42, 0.1), GLASS, 0, 1.24, -1.2);
  add(new THREE.BoxGeometry(0.1, 0.38, 1.7), GLASS, -0.82, 1.26, -0.22);
  add(new THREE.BoxGeometry(0.1, 0.38, 1.7), GLASS, 0.82, 1.26, -0.22);
  // хром: бамперы и молдинг
  add(new THREE.BoxGeometry(1.9, 0.16, 0.22), CHR, 0, 0.6, 2.18, 'bumperF');
  add(new THREE.BoxGeometry(1.9, 0.16, 0.22), CHR, 0, 0.6, -2.18, 'bumperR');
  add(new THREE.BoxGeometry(1.78, 0.05, 0.05), CHR, 0, 0.78, 2.1);
  // решётка и круглые фары
  add(new THREE.BoxGeometry(1.1, 0.24, 0.1), '#2b2530', 0, 0.82, 2.14);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff1c8 }));
    h.rotation.x = Math.PI / 2; h.position.set(0.66 * s, 0.84, 2.14);
    g.add(h);
    add(new THREE.BoxGeometry(0.42, 0.16, 0.08), '#e8323c', 0.62 * s, 0.84, -2.18);
  }

  if (roofSign) {   // шашка доставки — свою машину видно в потоке
    add(new THREE.BoxGeometry(1.3, 0.42, 0.62), '#ffffff', 0, 1.73, -0.25);
    add(new THREE.BoxGeometry(0.95, 0.2, 0.68), '#ff6900', 0, 1.73, -0.25);
  }

  const wheels = [], steer = [];
  const wgeo = new THREE.CylinderGeometry(0.44, 0.44, 0.3, 10);
  wgeo.rotateZ(Math.PI / 2);
  for (const [wx, wz, front] of [[-0.9, 1.4, 1], [0.9, 1.4, 1], [-0.9, -1.45, 0], [0.9, -1.45, 0]]) {
    const pv = new THREE.Group();
    pv.position.set(wx, 0.44, wz);
    const wm = new THREE.Mesh(wgeo, mat('#221c19'));
    pv.add(wm);
    pv.add(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.32, 8).rotateZ(Math.PI / 2), mat('#d7d2c8')));
    g.add(pv);
    wheels.push(wm); if (front) steer.push(pv);
  }
  const sh = new THREE.Mesh(new THREE.CircleGeometry(2.4, 14),
    new THREE.MeshBasicMaterial({ color: 0x24303f, transparent: true, opacity: 0.26, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.scale.set(0.72, 1, 1.05);
  g.add(sh);

  g.userData = { wheels, steer, panels, glass: [wsF, wsB], dmg: 0, smokeT: 0, bodyHex };
  return g;
}

/* мятина: панель у точки удара вдавливается, темнеет и кособочится */
function dentCar (g, wx, wz, force) {
  const u = g.userData;
  if (!u || !u.panels) return;
  const inv = new THREE.Vector3(wx - g.position.x, 0, wz - g.position.z);
  inv.applyAxisAngle(new THREE.Vector3(0, 1, 0), -g.rotation.y);
  const f = clamp(force / 26, 0.12, 1);
  u.dmg = clamp(u.dmg + f * 0.3, 0, 1);
  let best = null, bd = 1e9;
  for (const p of u.panels) {
    const d = (p.m.position.x - inv.x) ** 2 + (p.m.position.z - inv.z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  for (const p of u.panels) {
    const w = p === best ? 1 : (Math.hypot(p.p.x - inv.x, p.p.z - inv.z) < 2 ? 0.35 : 0);
    if (!w) continue;
    p.m.position.y = Math.max(p.p.y - 0.34, p.m.position.y - 0.13 * f * w);
    p.m.position.x += (p.p.x - inv.x > 0 ? 1 : -1) * 0.05 * f * w;
    p.m.rotation.z = clamp(p.m.rotation.z + rand(-0.22, 0.22) * f * w, -0.45, 0.45);
    p.m.rotation.x = clamp(p.m.rotation.x + rand(-0.18, 0.18) * f * w, -0.4, 0.4);
    p.m.material.color.lerp(new THREE.Color(0x6b6068), 0.22 * f * w);
  }
  // стёкла трескаются и мутнеют
  if (u.dmg > 0.45) for (const w of u.glass) w.material.color.lerp(new THREE.Color(0x2b2f36), 0.35);
  // бампер отваливается
  if (u.dmg > 0.7) {
    const b = u.panels.find(p => p.m.parent && p.m.geometry.parameters && p.m.geometry.parameters.depth === 0.22);
    if (b && !b.dropped) {
      b.dropped = true;
      b.m.position.y = 0.2; b.m.rotation.z = rand(-0.8, 0.8);
    }
  }
}

/* ─────────────── бургеры-пешеходы ───────────────
   Те же слои и цвета, что в lab/vice: булка, котлета, сыр, салат,
   помидор, шапка с кунжутом. От наезда рассыпаются на ингредиенты. */

function makeBurger () {
  const g = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me; };
  const legL = add(new THREE.BoxGeometry(0.11, 0.3, 0.11), mat('#3a2c22'), -0.16, 0.15, 0);
  const legR = add(new THREE.BoxGeometry(0.11, 0.3, 0.11), mat('#3a2c22'), 0.16, 0.15, 0);
  add(new THREE.CylinderGeometry(0.42, 0.46, 0.18, 12), mat('#e8b563'), 0, 0.39, 0);
  add(new THREE.CylinderGeometry(0.45, 0.45, 0.13, 12), mat('#7a4526'), 0, 0.545, 0);
  const ch = add(new THREE.BoxGeometry(0.84, 0.05, 0.84), mat('#ffd34d'), 0, 0.635, 0);
  ch.rotation.y = Math.PI / 4;
  add(new THREE.CylinderGeometry(0.46, 0.44, 0.07, 12), mat('#5fbf4a'), 0, 0.695, 0);
  add(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 10), mat('#e04836'), 0, 0.755, 0);
  add(new THREE.SphereGeometry(0.46, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e8a84f'), 0, 0.78, 0);
  for (let i = 0; i < 5; i++)
    add(new THREE.SphereGeometry(0.028, 5, 4), mat('#fff3d6'), Math.cos(i * 2.1) * 0.3, 1.12, Math.sin(i * 2.1) * 0.3);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.075, 7, 5), mat('#ffffff'), 0.14 * s, 0.95, 0.36);
    add(new THREE.SphereGeometry(0.032, 6, 5), mat('#1b1410'), 0.14 * s, 0.95, 0.425);
  }
  g.userData = { legL, legR };
  return g;
}

const GIB_SPECS = [
  ['cyl', 0.44, 0.16, '#e8b563'], ['cyl', 0.44, 0.12, '#7a4526'],
  ['box', 0.8, 0.05, '#ffd34d'], ['cyl', 0.44, 0.07, '#5fbf4a'],
  ['cyl', 0.38, 0.07, '#e04836'], ['cap', 0.44, 0.44, '#e8a84f'],
  ['box', 0.12, 0.3, '#3a2c22'], ['box', 0.12, 0.3, '#3a2c22'],
];
const GIBS = [];
function gibBurger (x, z) {
  for (const [kind, a, b, hex] of GIB_SPECS) {
    const geo = kind === 'box' ? new THREE.BoxGeometry(a, b, a)
      : kind === 'cap' ? new THREE.SphereGeometry(a, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
      : new THREE.CylinderGeometry(a, a, b, 8);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
    m.position.set(x + rand(-0.2, 0.2), rand(0.5, 1.1), z + rand(-0.2, 0.2));
    scene.add(m);
    GIBS.push({ m, vx: rand(-5, 5), vy: rand(4.5, 9), vz: rand(-5, 5), ax: rand(-9, 9), az: rand(-9, 9), life: 4.5 });
  }
}
function updateGibs (dt) {
  for (let i = GIBS.length - 1; i >= 0; i--) {
    const g = GIBS[i];
    g.vy -= 19 * dt;
    g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt;
    g.m.rotation.x += g.ax * dt; g.m.rotation.z += g.az * dt;
    if (g.m.position.y < 0.3 && g.vy < 0) { g.m.position.y = 0.3; g.vy *= -0.35; g.vx *= 0.6; g.vz *= 0.6; }
    if ((g.life -= dt) < 0.6) g.m.scale.setScalar(Math.max(0.001, g.life / 0.6));
    if (g.life <= 0) { scene.remove(g.m); g.m.geometry.dispose(); g.m.material.dispose(); GIBS.splice(i, 1); }
  }
}

const PEDS = [];
function initPeds () {
  for (let k = 0; k < 62; k++) {
    const ring = pick(RINGS);
    const p = {
      grp: makeBurger(), ring, side: (Math.random() * 4) | 0, t: Math.random(),
      dir: chance(0.5) ? 1 : -1, speed: rand(1.1, 1.8), ph: rand(0, 9),
      crossing: 0, crossT: rand(18, 80), x: 0, z: 0, dead: 0, deadT: 0,
    };
    scene.add(p.grp);
    PEDS.push(p);
  }
}

/* точка на периметре квартала: side 0..3, t 0..1 */
function ringPoint (r, side, t) {
  if (side === 0) return [lerp(r.x0, r.x1, t), r.z0];
  if (side === 1) return [r.x1, lerp(r.z0, r.z1, t)];
  if (side === 2) return [lerp(r.x1, r.x0, t), r.z1];
  return [r.x0, lerp(r.z1, r.z0, t)];
}

function updatePeds (dt) {
  for (const p of PEDS) {
    if (p.dead) {
      if ((p.deadT -= dt) <= 0) {                // возрождается в другом квартале
        p.dead = 0; p.grp.visible = true;
        p.ring = pick(RINGS); p.side = (Math.random() * 4) | 0; p.t = Math.random();
        p.crossing = 0; p.crossT = rand(18, 80);
      }
      continue;
    }
    const ang = walkerStep(p, dt, 7);
    pushOut(p, 0.5);
    const g = p.grp;
    g.position.set(p.x, 0, p.z);
    if (!Number.isNaN(ang)) g.rotation.y = damp(g.rotation.y, ang, 8, dt);
    const sw = Math.sin(p.ph) * 0.7;
    g.userData.legL.rotation.x = sw;
    g.userData.legR.rotation.x = -sw;
    g.position.y = Math.abs(Math.sin(p.ph)) * 0.05;
  }
}


/* ─────────────── прохожие ───────────────
   Обычные люди рядом с бургерами: ходят теми же кольцами,
   от наезда улетают, и после них на асфальте остаётся пятно. */

/* Люди на улицах — настоящие коллеги: ростер и аватарки берём
   из соседней заготовки lab/faces, чтобы не держать семь мегабайт дважды.
   Текстуры грузятся по требованию и кешируются. */
const ROSTER = (window.FACES_ROSTER && window.FACES_ROSTER.people) || [];
const texCache = new Map();
const texLoader = new THREE.TextureLoader();

function avatarTex (img) {
  if (texCache.has(img)) return texCache.get(img);
  const t = texLoader.load('../faces/' + img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  texCache.set(img, t);
  return t;
}

const PEOPLE = [];
const GRACE = 18;        // столько ещё терпят после срока, потом смена кончена
const CROSS_SPAN = 17;   // от тротуара до тротуара на той стороне
const SHIRTS = ['#d95d5d', '#4f7fd6', '#59b06a', '#e0b13f', '#8e6fd0', '#e08a4f', '#3fa8a0'];
const SKIN = ['#f0c8a0', '#d9a878', '#a8764e', '#7a5436'];

function makeHuman (person) {
  const g = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const skin = pick(SKIN), shirt = pick(SHIRTS), pants = pick(['#39405c', '#2f3540', '#5a4a3a', '#46506b']);
  const add = (w, h, d, hex, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex));
    m.position.set(x, y, z); g.add(m); return m;
  };
  const legL = add(0.16, 0.7, 0.16, pants, -0.12, 0.35, 0);
  const legR = add(0.16, 0.7, 0.16, pants, 0.12, 0.35, 0);
  legL.geometry.translate(0, -0.35, 0); legL.position.y = 0.7;
  legR.geometry.translate(0, -0.35, 0); legR.position.y = 0.7;
  add(0.44, 0.6, 0.26, shirt, 0, 1.0, 0);
  const armL = add(0.13, 0.55, 0.13, shirt, -0.29, 1.03, 0);
  const armR = add(0.13, 0.55, 0.13, shirt, 0.29, 1.03, 0);
  armL.geometry.translate(0, -0.27, 0); armL.position.y = 1.3;
  armR.geometry.translate(0, -0.27, 0); armR.position.y = 1.3;
  // голова: на передней грани лицо коллеги, остальные грани — кожа
  const skinM = mat(skin);
  const face = person ? new THREE.MeshLambertMaterial({ map: avatarTex(person.img) }) : skinM;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.56, 0.3),
    [skinM, skinM, skinM, skinM, face, skinM]);
  head.position.set(0, 1.58, 0);
  g.add(head);

  g.userData = { legL, legR, armL, armR, head, colors: { skin, shirt, pants }, person };
  return g;
}

let rosterBag = [];
function nextPerson () {
  if (!ROSTER.length) return null;
  if (!rosterBag.length) {
    rosterBag = ROSTER.slice();
    for (let i = rosterBag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [rosterBag[i], rosterBag[j]] = [rosterBag[j], rosterBag[i]];
    }
  }
  return rosterBag.pop();
}

const walkRing = () => chance(0.32) ? pick(YARD_RINGS) : pick(RINGS);

function initPeople () {
  for (let k = 0; k < 40; k++) {
    const person = nextPerson();
    const p = {
      person,
      grp: makeHuman(person), ring: walkRing(), side: (Math.random() * 4) | 0, t: Math.random(),
      dir: chance(0.5) ? 1 : -1, speed: rand(1.1, 1.7), ph: rand(0, 9),
      crossing: 0, crossT: rand(20, 90), restT: rand(10, 70), idle: null,
      x: 0, z: 0, dead: 0, deadT: 0,
    };
    if (p.ring.inner) p.crossT = 1e9;            // во дворе через дорогу не бегают
    scene.add(p.grp);
    PEOPLE.push(p);
  }
}

/* Общий шаг для бургеров и людей: обход квартала, а дорогу переходят
   только по зебре. Зебра лежит в трёх метрах от угла квартала — туда же
   попадают эти две точки на каждой стороне. */
const CROSS_IN = 3;

function walkerStep (p, dt, legSwing) {
  const r = p.ring;
  const len = p.side % 2 ? Math.abs(r.z1 - r.z0) : Math.abs(r.x1 - r.x0);

  if (p.crossing > 0) {
    // идём поперёк дороги и обратно, не сворачивая
    p.crossing -= dt * p.speed / CROSS_SPAN;
    p.ph += dt * legSwing * 0.85;
    const out = Math.sin((1 - p.crossing) * Math.PI) * CROSS_SPAN;
    const [rx, rz] = ringPoint(r, p.side, p.t);
    let ox = 0, oz = 0;
    if (p.side === 0) oz = -out; else if (p.side === 2) oz = out;
    else if (p.side === 1) ox = out; else ox = -out;
    const px = rx + ox, pz = rz + oz;
    const ang = Math.atan2(px - p.x, pz - p.z);
    p.x = px; p.z = pz;
    if (p.crossing <= 0) { p.crossing = 0; p.crossT = rand(35, 110); }
    return ang;
  }

  p.ph += dt * legSwing;
  const before = p.t;
  p.t += p.dir * p.speed / len * dt;
  while (p.t > 1) { p.t -= 1; p.side = (p.side + 1) % 4; }
  while (p.t < 0) { p.t += 1; p.side = (p.side + 3) % 4; }

  // собрался перейти — ждём ближайшей зебры, а не бросаемся где попало
  p.crossT -= dt;
  if (p.crossT <= 0) {
    for (const tc of [CROSS_IN / len, 1 - CROSS_IN / len]) {
      if ((before - tc) * (p.t - tc) <= 0 && Math.abs(p.t - tc) < 0.2) {
        p.t = tc; p.crossing = 1;
        break;
      }
    }
  }
  const [rx, rz] = ringPoint(r, p.side, p.t);
  const ang = Math.atan2(rx - p.x, rz - p.z);
  p.x = rx; p.z = rz;
  return ang;
}

/* Гость перестаёт гулять: если рядом лавочка — доходит и садится,
   иначе стоит на месте. И всё время разворачивается к курьеру. */
function freeBench (x, z, maxD) {
  let best = null, bd = maxD;
  for (const b of BENCHES) {
    if (b.taken || (b.prop && b.prop.down)) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/* сидит просто так: дошёл до лавочки, посидел, пошёл дальше */
function idleSitStep (p, dt) {
  const u = p.grp.userData;
  const b = p.idle.b;
  if (b.prop && b.prop.down) { releaseIdle(p); return; }

  if (p.idle.phase === 'walk') {
    const dx = b.x - p.x, dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      p.ph += dt * 7;
      const k = Math.min(1, p.speed * dt / d);
      p.x += dx * k; p.z += dz * k;
      p.grp.position.set(p.x, Math.abs(Math.sin(p.ph)) * 0.04, p.z);
      p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(dx, dz), 8, dt);
      const sw = Math.sin(p.ph) * 0.8;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      if (p.idle.give -= dt, p.idle.give < 0) releaseIdle(p);   // не дошёл — бросаем затею
      return;
    }
    p.idle.phase = 'sit';
    p.x = b.x; p.z = b.z;
    p.grp.rotation.y = b.ry;
  }

  p.grp.position.set(p.x, 0.42, p.z);
  u.legL.rotation.x = damp(u.legL.rotation.x, -1.45, 8, dt);
  u.legR.rotation.x = damp(u.legR.rotation.x, -1.45, 8, dt);
  u.armL.rotation.x = damp(u.armL.rotation.x, -0.3, 6, dt);
  u.armR.rotation.x = damp(u.armR.rotation.x, -0.3, 6, dt);
  if ((p.idle.t -= dt) <= 0) releaseIdle(p);
}

function releaseIdle (p) {
  if (p.idle) p.idle.b.taken = 0;
  p.idle = null;
  p.restT = rand(45, 110);
  p.grp.position.y = 0;
  p.grp.userData.legL.rotation.x = 0;
  p.grp.userData.legR.rotation.x = 0;
}

function makeGuest (p, at) {
  p.guest = true;
  p.sitting = 0;
  p.sitAt = null;
  p.waitAt = at || null;
  // уже сидел на лавочке — там и ждёт
  if (p.idle) {
    const b = p.idle.b, seated = p.idle.phase === 'sit';
    p.idle = null;
    if (!at) {
      p.sitAt = b; b.taken = 1;
      if (seated) { p.sitting = 1; p.sitRy = b.ry; p.grp.rotation.y = b.ry; }
      return;
    }
    b.taken = 0;
  }
  if (at) return;                               // подойти к своим и стоять рядом
  const best = freeBench(p.x, p.z, 14);
  if (best && chance(0.7)) { p.sitAt = best; best.taken = 1; }
}

function clearGuest (p) {
  if (!p.guest) return;
  if (p.sitAt) p.sitAt.taken = 0;
  p.guest = false; p.sitting = 0; p.sitAt = null; p.waitAt = null;
  p.grp.position.y = 0;
  p.grp.userData.legL.rotation.x = 0;
  p.grp.userData.legR.rotation.x = 0;
  p.grp.userData.head.rotation.y = 0;
}

function guestStep (p, dt) {
  const u = p.grp.userData;
  const b = p.sitAt || p.waitAt;

  if (b && !p.sitting) {
    // доходит до лавочки
    const dx = b.x - p.x, dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      p.ph += dt * 7;
      const k = Math.min(1, 2.2 * dt / d);
      p.x += dx * k; p.z += dz * k;
      pushOut(p, 0.45);
      p.grp.position.set(p.x, Math.abs(Math.sin(p.ph)) * 0.04, p.z);
      p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(dx, dz), 8, dt);
      const sw = Math.sin(p.ph) * 0.8;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      return;
    }
    if (p.waitAt) { p.waitAt = null; }          // дошёл до своих — дальше просто стоит
    else {
      p.sitting = 1;
      p.x = b.x; p.z = b.z;
      p.sitRy = b.ry;
      p.grp.rotation.y = b.ry;
    }
  }

  if (p.sitting) {
    p.grp.position.set(p.x, 0.42, p.z);
    // курьер подъехал не с той стороны — гость встаёт и разворачивается
    const toCar = Math.atan2(V.x - p.x, V.z - p.z);
    const off = Math.atan2(Math.sin(toCar - p.sitRy), Math.cos(toCar - p.sitRy));
    if (Math.abs(off) > 1.9 && Math.hypot(V.x - p.x, V.z - p.z) < 26) { p.sitting = 0; p.sitAt = null; }
    u.legL.rotation.x = damp(u.legL.rotation.x, -1.45, 8, dt);
    u.legR.rotation.x = damp(u.legR.rotation.x, -1.45, 8, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, -0.3, 6, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, -0.3, 6, dt);
    // сидя разворачивается головой
    u.head.rotation.y = damp(u.head.rotation.y, clamp(off, -1.1, 1.1), 5, dt);
  } else {
    p.grp.position.set(p.x, 0, p.z);
    u.legL.rotation.x = damp(u.legL.rotation.x, 0, 6, dt);
    u.legR.rotation.x = damp(u.legR.rotation.x, 0, 6, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, 0, 6, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, 0, 6, dt);
    // стоя разворачивается всем корпусом и ждёт
    p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(V.x - p.x, V.z - p.z), 4, dt);
  }

  // получил пиццу — постоял с ней и пошёл дальше
  if (p.served) {
    p.freeT -= dt;
    if (p.freeT <= 0) {
      if (p.hold) { p.grp.remove(p.hold); p.hold = null; }
      p.served = 0; p.holdT = 0;
      clearGuest(p);
      return;
    }
  }

  // горячая пицца в руках парит
  if (p.holdT > 0) {
    p.holdT -= dt;
    p.steamT = (p.steamT || 0) - dt;
    if (p.steamT <= 0) {
      p.steamT = 0.2;
      steam(p.x, (p.sitting ? 1.25 : 1.35), p.z + 0.1);
    }
  }
}

function updatePeople (dt) {
  for (const p of PEOPLE) {
    if (p.dead) {
      if ((p.deadT -= dt) <= 0) {
        p.dead = 0; p.fly = null;
        scene.remove(p.grp);                      // возвращается уже другим коллегой
        p.person = nextPerson();
        p.grp = makeHuman(p.person);
        scene.add(p.grp);
        if (p.idle) { p.idle.b.taken = 0; p.idle = null; }
        p.ring = walkRing(); p.side = (Math.random() * 4) | 0; p.t = Math.random();
        p.crossing = 0; p.crossT = p.ring.inner ? 1e9 : rand(20, 90); p.restT = rand(20, 70);
      }
      continue;
    }
    if (p.guest) { guestStep(p, dt); continue; }
    if (p.idle) { idleSitStep(p, dt); continue; }

    // изредка кто-нибудь садится передохнуть на свободную лавочку
    p.restT -= dt;
    if (p.restT <= 0 && !p.crossing) {
      const b = freeBench(p.x, p.z, 15);
      if (b) { b.taken = 1; p.idle = { b, phase: 'walk', t: rand(20, 60), give: 14 }; continue; }
      p.restT = rand(20, 50);
    }

    const ang = walkerStep(p, dt, 7);
    pushOut(p, 0.45);                            // не залезать в стены и изгороди
    const g = p.grp;
    g.position.set(p.x, Math.abs(Math.sin(p.ph)) * 0.04, p.z);
    if (!Number.isNaN(ang)) g.rotation.y = damp(g.rotation.y, ang, 8, dt);
    const sw = Math.sin(p.ph) * 0.8;
    g.userData.legL.rotation.x = sw; g.userData.legR.rotation.x = -sw;
    g.userData.armL.rotation.x = -sw * 0.7; g.userData.armR.rotation.x = sw * 0.7;
  }
}

/* Куски тела: летят, падают и остаются лежать. Пока лежат — под ними
   растёт лужа, поэтому место наезда видно ещё долго. */
const GORE = [];

function gibHuman (p, vx, vz) {
  const c = p.grp.userData.colors;
  const parts = [
    [0.3, 0.32, 0.28, c.skin], [0.44, 0.6, 0.26, c.shirt],
    [0.13, 0.55, 0.13, c.shirt], [0.13, 0.55, 0.13, c.shirt],
    [0.16, 0.7, 0.16, c.pants], [0.16, 0.7, 0.16, c.pants],
  ];
  for (const [w, h, d, hex] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
    m.position.set(p.x + rand(-0.2, 0.2), rand(0.7, 1.4), p.z + rand(-0.2, 0.2));
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    scene.add(m);
    GORE.push({
      m, vx: vx * 0.3 + rand(-5, 5), vy: rand(3, 8), vz: vz * 0.3 + rand(-5, 5),
      spin: rand(-12, 12), life: rand(16, 24), bleed: rand(0.4, 1.2), rest: 0,
    });
  }
  blood(p.x, 1, p.z, 16);
  decal(p.x, p.z, 0x8f1f2b, 1.9, 60);
}

function updateGore (dt) {
  for (let i = GORE.length - 1; i >= 0; i--) {
    const g = GORE[i];
    if (!g.rest) {
      g.vy -= 19 * dt;
      g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt;
      g.m.rotation.x += g.spin * dt; g.m.rotation.z += g.spin * 0.6 * dt;
      if (g.m.position.y < 0.18) {
        g.m.position.y = 0.18;
        g.vy *= -0.28; g.vx *= 0.55; g.vz *= 0.55; g.spin *= 0.5;
        if (Math.hypot(g.vx, g.vz) < 0.6 && Math.abs(g.vy) < 0.8) {
          g.rest = 1;
          g.m.rotation.set(Math.PI / 2, g.m.rotation.y, 0);   // лёг плашмя
          decal(g.m.position.x, g.m.position.z, 0x8f1f2b, rand(0.6, 1.1), 50);
        }
      }
    } else {
      // лежит и подтекает
      g.bleed -= dt;
      if (g.bleed <= 0) {
        g.bleed = rand(1.6, 3.4);
        decal(g.m.position.x + rand(-0.6, 0.6), g.m.position.z + rand(-0.6, 0.6), 0x8f1f2b, rand(0.4, 0.9), 40);
      }
    }
    g.life -= dt;
    if (g.life < 1) g.m.scale.setScalar(Math.max(0.001, g.life));
    if (g.life <= 0) { scene.remove(g.m); g.m.geometry.dispose(); g.m.material.dispose(); GORE.splice(i, 1); }
  }
}

function runOver (p, vx, vz) {
  const victim = p.person;
  const wasTarget = checkVictim(p);
  p.dead = 1; p.deadT = rand(18, 26);
  p.fly = null;
  p.grp.visible = false;
  gibHuman(p, vx, vz);
  S.people++;
  Snd.squish();
  if (wasTarget) gameOver('не доставил', victim ? [victim] : [], { x: p.x, z: p.z });
  else toast(victim ? 'сбил · ' + victim.name : pick(['ой', 'человек!', 'извините']));
}

/* Снос: лавочка разлетается досками, столб заваливается набок и гаснет. */
function knockProp (p, nx, nz, force) {
  if (p.down) return;
  p.down = 1;
  sparks(p.x, 0.8, p.z, 8, nx, nz);

  if (p.kind === 'bench') {
    scene.remove(p.pivot);
    const c = Math.cos(p.ry), sn = Math.sin(p.ry);
    for (let i = 0; i < 7; i++) {
      const plank = i < 5;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(plank ? rand(0.5, 1.1) : 0.18, plank ? 0.16 : 0.5, plank ? 0.5 : 0.6),
        propMat(plank ? '#8a6b4e' : '#5c5560'));
      m.position.set(p.x + c * rand(-1.2, 1.2), rand(0.5, 1.1), p.z - sn * rand(-1.2, 1.2));
      m.rotation.set(rand(0, 6), p.ry, rand(0, 6));
      scene.add(m);
      GORE.push({
        m, vx: nx * rand(2, 7) + rand(-3, 3), vy: rand(2.5, 6), vz: nz * rand(2, 7) + rand(-3, 3),
        spin: rand(-10, 10), life: rand(14, 20), bleed: 1e9, rest: 0,
      });
    }
    Snd.noise(0.25, 0.3);
    toast('лавочка всё');
    return;
  }

  // столб валится в ту сторону, куда его ударили
  TILT_AXIS.set(-nz, 0, nx).normalize();
  p.ax = TILT_AXIS.x; p.az = TILT_AXIS.z;
  p.tiltV = 2.6 + clamp(force, 0, 30) * 0.09;
  const bulb = p.inner.userData.bulb;
  if (bulb) bulb.material = new THREE.MeshBasicMaterial({ color: 0x2e2b33 });
  Snd.noise(0.35, 0.34);
  Snd.blip(120, 0.2, 'sawtooth', 0.16);
  toast(p.kind === 'lamp' ? 'фонарь всё' : 'светофор всё');
}

function updateProps (dt) {
  for (const p of PROPS) {
    if (!p.down || p.tilt >= 1.45) continue;
    p.tilt = Math.min(1.45, p.tilt + p.tiltV * dt);
    p.tiltV += 5 * dt;                       // разгоняется, пока падает
    TILT_AXIS.set(p.ax, 0, p.az);
    p.pivot.quaternion.setFromAxisAngle(TILT_AXIS, p.tilt);
    if (p.tilt >= 1.45) sparks(p.x + p.ax * 2, 0.4, p.z + p.az * 2, 4);
  }
}

/* ─────────────── светофоры ───────────────
   Один цикл на весь город: сначала едут вдоль X, потом вдоль Z.
   Лампы делят два материала, поэтому смена фазы — это две строчки. */

const LIGHT_MAT = {
  x: new THREE.MeshBasicMaterial({ color: 0x3fd15e }),
  z: new THREE.MeshBasicMaterial({ color: 0xe8323c }),
};
const LIGHT_OFF = new THREE.MeshBasicMaterial({ color: 0x2e2b33 });
const TL = { t: 0, green: 'x', yellow: false };

function buildLights () {
  const headGeo = new THREE.BoxGeometry(0.8, 2.0, 0.5);
  const bulbGeo = new THREE.SphereGeometry(0.26, 8, 6);
  for (const x of GRID) for (const z of GRID) {
    // столб стоит на тротуаре сбоку от полотна, а не на срезанном углу
    for (const [ax, px, pz] of [
      ['x', x - (RW / 2 + 10), z + (RW / 2 + 2.4)],
      ['z', x + (RW / 2 + 2.4), z - (RW / 2 + 10)],
    ]) {
      addProp(px, pz, ax === 'x' ? Math.PI / 2 : 0, 'light', g => {
        propBox(g, 0.26, 5.2, 0.26, '#4e4a55', 0, 2.7, 0);
        const head = new THREE.Mesh(headGeo, propMat('#3b3742'));
        head.position.set(0, 5.4, 0);
        g.add(head);
        const bulb = new THREE.Mesh(bulbGeo, LIGHT_MAT[ax]);
        bulb.position.set(0, 4.95, 0.3);
        g.add(bulb);
        const off = new THREE.Mesh(bulbGeo, LIGHT_OFF);
        off.position.set(0, 5.85, 0.3);
        g.add(off);
        g.userData.bulb = bulb;
      }, 0.9);
    }
  }
}

function updateLights (dt) {
  TL.t += dt;
  const span = TL.yellow ? 1.3 : 12;
  if (TL.t > span) {
    TL.t = 0;
    if (TL.yellow) { TL.yellow = false; TL.green = TL.green === 'x' ? 'z' : 'x'; }
    else TL.yellow = true;
  }
  const g = 0x3fd15e, r = 0xe8323c, y = 0xffc63d;
  LIGHT_MAT.x.color.setHex(TL.yellow ? y : (TL.green === 'x' ? g : r));
  LIGHT_MAT.z.color.setHex(TL.yellow ? y : (TL.green === 'z' ? g : r));
}

const greenFor = ax => !TL.yellow && TL.green === ax;

/* Пешеходы не должны проходить друг сквозь друга. Перебирать всех со
   всеми дорого, поэтому раскладываем их по клеткам пять на пять метров
   и смотрим только соседние. Сидящих не трогаем. */
const WGRID = new Map();

function separateWalkers (dt) {
  WGRID.clear();
  const all = [];
  for (const p of PEOPLE) if (!p.dead) all.push(p);
  for (const p of PEDS) if (!p.dead) all.push(p);
  for (const p of all) {
    const k = Math.floor(p.x / 5) + ',' + Math.floor(p.z / 5);
    let b = WGRID.get(k);
    if (!b) WGRID.set(k, b = []);
    b.push(p);
  }
  for (const p of all) {
    if (p.sitting || (p.idle && p.idle.phase === 'sit')) continue;
    const ci = Math.floor(p.x / 5), cj = Math.floor(p.z / 5);
    let moved = false;
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++) {
        const b = WGRID.get(i + ',' + j);
        if (!b) continue;
        for (const q of b) {
          if (q === p) continue;
          const dx = p.x - q.x, dz = p.z - q.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 0.81 || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), k2 = (0.9 - d) / d * 0.45;
          p.x += dx * k2; p.z += dz * k2;
          moved = true;
        }
      }
    if (moved) {
      pushOut(p, 0.45);
      p.grp.position.x = p.x;
      p.grp.position.z = p.z;
    }
  }
}

/* ─────────────── трафик ───────────────
   Машины едут от перекрёстка к перекрёстку по своей полосе
   и на каждом сами решают, куда свернуть. */

const TRAFFIC = [];
function spawnTraffic (n) {
  for (let k = 0; k < n; k++) {
    const from = (Math.random() * NODES.length) | 0;
    const to = pick(NODES[from].nb);
    const t = {
      mesh: makeCar(pick(['#7fa8e0', '#8fd0a4', '#e6dfd2', '#d99ab8', '#e8cf8a', '#b9a7dd']), false),
      from, to, p: Math.random(), cruise: rand(9, 15), speed: 0,
      x: 0, z: 0, h: 0, wheel: 0, hp: 100, wreck: 0, wreckT: 0, hitT: 0,
      knock: 0, kvx: 0, kvy: 0, kvz: 0, spin: 0, y: 0, roll: 0, smokeT: 0,
      rejoin: 0, jx: 0, jz: 0, jh: 0,
    };
    scene.add(t.mesh);
    TRAFFIC.push(t);
    poseTraffic(t, 0);
  }
}

function poseTraffic (t, dt) {
  const a = NODES[t.from], b = NODES[t.to];
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  // правая полоса относительно направления движения
  const rx = -uz, rz = ux;
  let lx = a.x + ux * (t.p * len) + rx * LANE;
  let lz = a.z + uz * (t.p * len) + rz * LANE;
  let lh = Math.atan2(ux, uz);

  // После кувырка машина не прыгает обратно в полосу, а доезжает до неё
  // за пару секунд с того места, где легла.
  if (t.rejoin > 0) {
    t.rejoin = Math.max(0, t.rejoin - (dt || 0) * 0.7);
    const k = t.rejoin;
    lx = lerp(lx, t.jx, k);
    lz = lerp(lz, t.jz, k);
    const dh = Math.atan2(Math.sin(t.jh - lh), Math.cos(t.jh - lh));
    lh += dh * k;
  }
  t.x = lx; t.z = lz; t.h = lh;
  t.mesh.position.set(t.x, 0, t.z);
  t.mesh.rotation.y = t.h;
  if (dt) {
    t.wheel += t.speed * dt / 0.46;
    for (const w of t.mesh.userData.wheels) w.rotation.x = t.wheel;
  }
  return len;
}

const edgeAxis = t => NODES[t.from].z === NODES[t.to].z ? 'x' : 'z';

function wreckCar (t) {
  t.wreck = 1; t.wreckT = rand(11, 16);
  t.speed = 0;
  boom(t.x, t.z);
  t.mesh.traverse(o => { if (o.isMesh && o.material.color) o.material.color.setHex(0x241f26); });
}

function knockCar (t, nx, nz, force) {
  const f = clamp(force, 6, 60);
  t.knock = 1;
  t.kvx = nx * f * 1.25 + t.kvx * 0.3;
  t.kvz = nz * f * 1.25 + t.kvz * 0.3;
  t.kvy = clamp(f * 0.42, 3.5, 15);
  t.spin = rand(-1, 1) * (2.4 + f * 0.16);
  t.speed = 0;
}

/* Прицепляем упавшую машину к ближайшему куску улицы и запоминаем позу,
   с которой она будет возвращаться в полосу. */
function rejoinRoad (t) {
  let best = 0, bd = 1e9;
  for (let k = 0; k < NODES.length; k++) {
    const d = (NODES[k].x - t.x) ** 2 + (NODES[k].z - t.z) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  const a = NODES[best];
  let to = a.nb[0], bestDot = -2;
  for (const nb of a.nb) {
    const dx = NODES[nb].x - a.x, dz = NODES[nb].z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const dot = (dx / l) * Math.sin(t.h) + (dz / l) * Math.cos(t.h);
    if (dot > bestDot) { bestDot = dot; to = nb; }
  }
  const b = NODES[to];
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  t.from = best; t.to = to;
  t.p = clamp(((t.x - a.x) * dx + (t.z - a.z) * dz) / (len * len), 0.02, 0.95);
  t.jx = t.x; t.jz = t.z; t.jh = t.h;
  t.rejoin = 1;
  t.speed = 0;
}

function respawnTraffic (t) {
  t.wreck = 0; t.knock = 0; t.hp = 100; t.y = 0; t.roll = 0; t.smokeT = 0;
  // подальше от курьера, иначе машина возникает прямо перед капотом
  let from = 0, bd = -1;
  for (let k = 0; k < 24; k++) {
    const cand = (Math.random() * NODES.length) | 0;
    const d = Math.hypot(NODES[cand].x - V.x, NODES[cand].z - V.z);
    if (d > bd) { bd = d; from = cand; }
    if (bd > 130) break;
  }
  t.from = from;
  t.to = pick(NODES[t.from].nb);
  t.p = Math.random();
  t.rejoin = 0;
  scene.remove(t.mesh);
  t.mesh = makeCar(pick(['#7fa8e0', '#8fd0a4', '#e6dfd2', '#d99ab8', '#e8cf8a', '#b9a7dd']), false);
  scene.add(t.mesh);
}

function updateTraffic (dt) {
  for (const t of TRAFFIC) {
    if (t.hitT > 0) t.hitT -= dt;
    // сгоревшая, но ещё летящая сперва доигрывает падение
    if (t.wreck && !t.knock) {
      t.smokeT -= dt;
      if (t.smokeT <= 0) { t.smokeT = 0.25; puff(t.x, 1.4, t.z, true, rand(0.6, 1.1)); if (chance(0.4)) fire(t.x, 1.2, t.z); }
      if ((t.wreckT -= dt) <= 0 && !t.parked) respawnTraffic(t);
      continue;
    }
    if (t.knock) {
      // пока летит и кувыркается, ей никто не управляет
      if (t.wreck) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = 0.25; puff(t.x, 1.4, t.z, true, rand(0.6, 1.1)); } }
      t.kvy -= 20 * dt;
      t.x += t.kvx * dt; t.z += t.kvz * dt; t.y += t.kvy * dt;
      t.roll += t.spin * dt; t.h += t.spin * 0.7 * dt;
      if (t.y <= 0) {
        t.y = 0; t.kvy *= -0.32; t.kvx *= 0.7; t.kvz *= 0.7; t.spin *= 0.6;
        sparks(t.x, 0.4, t.z, 5);
        if (Math.hypot(t.kvx, t.kvz) < 2 && Math.abs(t.kvy) < 2) {
          t.knock = 0; t.roll = 0; t.y = 0;
          t.mesh.position.set(t.x, 0, t.z);
          t.mesh.rotation.set(0, t.h, 0);
          if (!t.parked) rejoinRoad(t);
        }
      }
      // на боку кузов приподнимаем, иначе углы уходят под текстуру дороги
      t.mesh.position.set(t.x, t.y + Math.abs(Math.sin(t.roll)) * 1.05, t.z);
      t.mesh.rotation.set(t.roll * 0.6, t.h, t.roll);
      if (t.hp < 45) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = 0.3; puff(t.x, 1.3, t.z, t.hp < 25, 0.6); } }
      continue;
    }
    if (t.hp < 45) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = 0.45; puff(t.x, 1.3, t.z, t.hp < 25, 0.55); } }
    if (t.parked) { t.mesh.position.set(t.x, 0, t.z); t.mesh.rotation.set(0, t.h, 0); continue; }

    // Тормозит перед всем, что стоит прямо по курсу — не только перед
    // своей дугой. Раньше упавшую поперёк полосы машину просто таранили.
    let slow = 1;
    const hx = Math.sin(t.h), hz = Math.cos(t.h);
    const ahead = (ox, oz, gap) => {
      const dx = ox - t.x, dz = oz - t.z;
      const fw = dx * hx + dz * hz;
      if (fw <= 0 || fw > 15) return;
      if (Math.abs(-hz * dx + hx * dz) > 2.7) return;
      slow = Math.min(slow, clamp((fw - gap) / 7, 0, 1));
    };
    for (const o of TRAFFIC) if (o !== t) ahead(o.x, o.z, 5.5);
    ahead(V.x, V.z, 6);
    // красный: тормозим у стоп-линии и стоим, пока не загорится зелёный.
    // Кто уже въехал на перекрёсток — доезжает, назад не сдаёт.
    const len0 = Math.hypot(NODES[t.to].x - NODES[t.from].x, NODES[t.to].z - NODES[t.from].z);
    const toNode = (1 - t.p) * len0;
    const STOPLINE = ZEBRA + 3.2;
    if (!greenFor(edgeAxis(t)) && toNode < STOPLINE + 7 && toNode > STOPLINE - 3)
      slow = Math.min(slow, clamp((toNode - STOPLINE) / 5, 0, 1));

    t.speed = damp(t.speed, t.cruise * slow, 3.2, dt);
    if (slow < 0.02) t.speed = 0;                 // иначе доползает за стоп-линию
    const len = poseTraffic(t, dt);
    t.p += t.speed * dt / len;
    if (t.p >= 1) {
      t.p -= 1;
      const back = t.from;
      t.from = t.to;
      const nb = NODES[t.from].nb.filter(n => n !== back);
      t.to = nb.length ? pick(nb) : back;
    }
  }
}

/* ─────────────── маркер адреса ─────────────── */
const marker = new THREE.Group();
{
  const pin = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 4),
    new THREE.MeshBasicMaterial({ color: 0xff6900 }));
  pin.rotation.x = Math.PI; pin.position.y = 4.4;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8a2b }));
  ball.position.y = 6.6;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 16, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 8;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 20),
    new THREE.MeshBasicMaterial({ color: 0xff6900, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
  marker.add(pin, ball, beam, ring);
  marker.userData = { pin, ball, ring };
  scene.add(marker);
}

/* ─────────────── маршрут по асфальту ───────────────
   Пунктирная оранжевая дорожка от машины до адреса, как навигатор
   в ГТА. Пересчитывается пару раз в секунду, поэтому объезды
   и срезы отрабатываются сразу. */

let routePts = [];

/* ближайшая точка на осевой улицы: маршрут должен идти по дорогам,
   а не резать наискосок через газоны */
function snapToRoad (x, z) {
  let bx = GRID[0], bz = GRID[0];
  for (const g of GRID) {
    if (Math.abs(g - x) < Math.abs(bx - x)) bx = g;
    if (Math.abs(g - z) < Math.abs(bz - z)) bz = g;
  }
  return Math.abs(bx - x) < Math.abs(bz - z) ? [bx, z] : [x, bz];
}

function rebuildRoutePath () {
  const tgt = S.target;
  if (!tgt) { routePts = []; return; }
  const nodes = routeNodes(V.x, V.z, tgt.x, tgt.z);
  const head = snapToRoad(V.x, V.z);
  // если ближайший перекрёсток остался за спиной, начинаем со следующего
  if (nodes.length > 1) {
    const a = nodes[0], b = nodes[1];
    if (Math.hypot(head[0] - b.x, head[1] - b.z) < Math.hypot(a.x - b.x, a.z - b.z)) nodes.shift();
  }
  const pts = [[V.x, V.z], head];
  for (const n of nodes) pts.push([n.x, n.z]);
  pts.push(snapToRoad(tgt.x, tgt.z), [tgt.x, tgt.z]);
  routePts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 2);
}

/* ─────────────── игрок ─────────────── */

let car = makeCar('#ff6900', true);
scene.add(car);

const V = {
  x: 0, z: 0, h: 0, vx: 0, vz: 0, steerVis: 0, wheel: 0,
  camX: 0, camY: 0, camZ: 0, camH: 0,
};

const S = {
  state: 'title',          // title | drive | back | handover | over
  hp: 5, money: 0, orders: 0, burgers: 0, people: 0, wrecks: 0, delivered: 0, best: +(localStorage.getItem('dlv-best') || 0),
  target: null, addr: '', fee: 0, time: 0, timeMax: 1, handT: 0,
  order: null, delivered: 0, name: localStorage.getItem('dlv-name') || '',
  routeT: 0, tickT: 0, shake: 0, hurt: 0, paused: false,
};

const IN = { gas: 0, brake: 0, left: 0, right: 0, hand: 0 };

/* после сгоревшей смены кузов возвращается целым и некопчёным */
function resetCar () {
  scene.remove(car);
  car = makeCar('#ff6900', true);
  scene.add(car);
}

/* ─────────────── физика ─────────────── */
const ACC = 36, BRK = 38, VMAX = 48, TURN = 2.3;
/* габариты кузова: по ним считаются все попадания, а не по одному кругу */
const CAR_L = 2.2, CAR_W = 1.0;

function driveStep (dt) {
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  const sx = fz, sz = -fx;
  let vf = V.vx * fx + V.vz * fz;
  let vl = V.vx * sx + V.vz * sz;

  if (IN.gas) vf += ACC * Math.max(0.25, 1 - vf / VMAX) * dt;
  if (IN.brake) vf -= (vf > 0.4 ? BRK : ACC * 0.5) * dt;
  vf = clamp(vf, -15, VMAX);
  vf -= vf * 0.3 * dt;
  if (IN.hand) vf -= vf * 1.1 * dt;
  vl *= Math.exp(-(IN.hand ? 2.2 : 8.5) * dt);          // ручник пускает в занос

  const sv = (IN.left ? 1 : 0) - (IN.right ? 1 : 0);
  const spd = Math.abs(vf);
  const grip = clamp(spd / 8, 0, 1) / (1 + spd * 0.014);
  V.h += sv * TURN * grip * (IN.hand ? 1.5 : 1) * Math.sign(vf || 1) * dt;
  V.steerVis = damp(V.steerVis, sv * 0.42, 10, dt);

  V.vx = fx * vf + sx * vl;
  V.vz = fz * vf + sz * vl;
  V.x += V.vx * dt;
  V.z += V.vz * dt;
  V.wheel += vf * dt / 0.46;

  if (V.x < BOUNDS.x0) { V.x = BOUNDS.x0; V.vx = Math.max(0, V.vx); }
  if (V.x > BOUNDS.x1) { V.x = BOUNDS.x1; V.vx = Math.min(0, V.vx); }
  if (V.z < BOUNDS.z0) { V.z = BOUNDS.z0; V.vz = Math.max(0, V.vz); }
  if (V.z > BOUNDS.z1) { V.z = BOUNDS.z1; V.vz = Math.min(0, V.vz); }

  // Кузов считаем двумя кругами — носом и кормой. Один круг радиусом
  // с полдлины машины цеплял всё вокруг; так габарит совпадает с тем,
  // что видно на экране, и в просвет между машинами реально пролезаешь.
  const noseX = V.x + fx * CAR_L * 0.55, noseZ = V.z + fz * CAR_L * 0.55;
  const tailX = V.x - fx * CAR_L * 0.55, tailZ = V.z - fz * CAR_L * 0.55;
  const bump = vn => {
    if (vn > 2.5) { sparks(V.x + fx * 2, 0.7, V.z + fz * 2, vn > 12 ? 9 : 4, 0, 0); Snd.spark(); }
    if (vn > 13) hurtCar((vn - 13) * 0.16, vn, V.x + fx * 2, V.z + fz * 2);
  };
  const r = CAR_W;
  for (const s of SOLIDS) {
    for (const [cx, cz] of [[noseX, noseZ], [tailX, tailZ]]) {
      if (cx < s.x0 - r || cx > s.x1 + r || cz < s.z0 - r || cz > s.z1 + r) continue;
      const dxl = cx - (s.x0 - r), dxr = (s.x1 + r) - cx;
      const dzl = cz - (s.z0 - r), dzr = (s.z1 + r) - cz;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) { bump(Math.max(0, V.vx)); V.x -= dxl; V.vx = Math.min(0, V.vx) * -0.2; }
      else if (m === dxr) { bump(Math.max(0, -V.vx)); V.x += dxr; V.vx = Math.max(0, V.vx) * -0.2; }
      else if (m === dzl) { bump(Math.max(0, V.vz)); V.z -= dzl; V.vz = Math.min(0, V.vz) * -0.2; }
      else { bump(Math.max(0, -V.vz)); V.z += dzr; V.vz = Math.max(0, V.vz) * -0.2; }
      break;
    }
  }

  // чужие машины: тоже два круга на кузов. Сильный удар не тормозит нас,
  // а раскидывает их — иначе таран ощущается как стена
  for (const t of TRAFFIC) {
    if (t.knock || t.hitT > 0) continue;          // пока летит — сквозь неё, а не по ней ещё раз
    if (Math.hypot(V.x - t.x, V.z - t.z) > 7) continue;
    const tfx = Math.sin(t.h), tfz = Math.cos(t.h);
    let nx = 0, nz = 0, d = 1e9, hx = 0, hz = 0;
    for (const [ax, az] of [[noseX, noseZ], [tailX, tailZ]])
      for (const k of [0.55, -0.55]) {
        const bx = t.x + tfx * CAR_L * k, bz = t.z + tfz * CAR_L * k;
        const dd = Math.hypot(ax - bx, az - bz);
        if (dd < d) { d = dd; nx = ax - bx; nz = az - bz; hx = (ax + bx) / 2; hz = (az + bz) / 2; }
      }
    const need = CAR_W * 2;
    if (d > need || d === 0) continue;
    nx /= d; nz /= d;
    const tvx = tfx * t.speed, tvz = tfz * t.speed;
    const vn = (V.vx - tvx) * nx + (V.vz - tvz) * nz;
    if (vn >= 0) continue;
    const hit = -vn;
    sparks(hx, 0.8, hz, hit > 10 ? 14 : 5, -nx, -nz);
    Snd.spark();
    if (hit > 5 && !t.wreck) {
      // таран: их отбрасывает, мы теряем десятую часть хода
      dentCar(t.mesh, hx, hz, hit);
      t.hp -= hit * 2.4;
      knockCar(t, -nx, -nz, hit);
      hurtCar((hit - 5) * 0.14, hit, hx, hz);
      t.hitT = 0.5;
      t.x -= nx * (need - d); t.z -= nz * (need - d);
      V.vx *= 0.9; V.vz *= 0.9;
      if (t.hp <= 0) { wreckCar(t); S.wrecks++; toast('машина всмятку'); }
    } else {
      V.x += nx * (need - d); V.z += nz * (need - d);
      V.vx -= vn * nx * 0.7; V.vz -= vn * nz * 0.7;
      t.speed *= 0.5;
      S.shake = Math.max(S.shake, Math.min(0.3, hit * 0.02));
    }
  }

  // уличный реквизит: не стена, а то, что сносится
  if (Math.abs(vf) > 4) {
    for (const pr of PROPS) {
      if (pr.down) continue;
      if (Math.abs(pr.x - V.x) > 6 || Math.abs(pr.z - V.z) > 6) continue;
      const hit = Math.hypot(pr.x - noseX, pr.z - noseZ) < pr.r + CAR_W
        || Math.hypot(pr.x - tailX, pr.z - tailZ) < pr.r + CAR_W;
      if (!hit) continue;
      const l = Math.hypot(V.vx, V.vz) || 1;
      knockProp(pr, V.vx / l, V.vz / l, Math.abs(vf));
      S.shake = Math.max(S.shake, 0.35);
      V.vx *= 0.94; V.vz *= 0.94;
    }
  }

  // пешеходов ловим прямоугольником кузова, а не кругом вокруг центра
  const underCar = (px, pz) => {
    const dx = px - V.x, dz = pz - V.z;
    const along = dx * fx + dz * fz, across = dx * sx + dz * sz;
    return Math.abs(along) < CAR_L + 0.5 && Math.abs(across) < CAR_W + 0.35;
  };

  for (const p of PEOPLE) {
    if (p.dead) continue;
    if (!underCar(p.x, p.z)) continue;
    if (Math.abs(vf) < 3) continue;
    runOver(p, V.vx, V.vz);
    S.shake = Math.max(S.shake, 0.35);
    V.vx *= 0.99; V.vz *= 0.99;
  }

  // бургеры: на скорости разлетаются, пешком — просто расталкиваются
  for (const p of PEDS) {
    if (p.dead) continue;
    if (!underCar(p.x, p.z)) continue;
    if (Math.abs(vf) < 3) continue;
    p.dead = 1; p.deadT = rand(6, 14);
    p.grp.visible = false;
    gibBurger(p.x, p.z);
    S.burgers++;
    S.shake = Math.max(S.shake, 0.22);
    Snd.squish();
    toast(pick(['респект', 'плюс респект', 'так ему', 'заслужил']));
  }

  // визуал
  car.position.set(V.x, 0, V.z);
  car.rotation.y = V.h;
  for (const w of car.userData.wheels) w.rotation.x = V.wheel;
  for (const s of car.userData.steer) s.rotation.y = V.steerVis;
  car.rotation.z = damp(car.rotation.z, -V.steerVis * clamp(Math.abs(vf) / VMAX, 0, 1) * 0.12, 6, dt);

  return vf;
}

function hurtCar (dmg, vn, hx, hz) {
  if (S.state === 'over' || S.state === 'dying' || S.state === 'title') return;
  dentCar(car, hx === undefined ? V.x : hx, hz === undefined ? V.z : hz, vn);   // мятина видна на кузове
  if (S.hurt > 0) return;
  S.hp -= clamp(Math.round(dmg), 1, 2);
  S.hurt = 0.9;
  S.shake = Math.max(S.shake, 0.5);
  Snd.crash(vn);
  hudHearts();
  if (S.hp <= 0) {
    S.hp = 0; hudHearts();
    boom(V.x, V.z);
    gameOver('машина всё', [], { x: V.x, z: V.z });
  }
}

/* ─────────────── камера ─────────────── */
const camInWall = (x, z) => SOLIDS.some(s => x > s.x0 - 1.2 && x < s.x1 + 1.2 && z > s.z0 - 1.2 && z < s.z1 + 1.2);

function camStep (dt, vf) {
  V.camH = damp(V.camH, V.h, 4.5, dt);
  let back = 12.5 + clamp(Math.abs(vf) / VMAX, 0, 1) * 4.5;
  // камера подтягивается к машине, если сзади стена — иначе кадр уходит внутрь дома
  while (back > 4.5 && camInWall(V.x - Math.sin(V.camH) * back, V.z - Math.cos(V.camH) * back)) back -= 1.5;
  const tx = V.x - Math.sin(V.camH) * back;
  const tz = V.z - Math.cos(V.camH) * back;
  V.camX = damp(V.camX, tx, 9, dt);
  V.camZ = damp(V.camZ, tz, 9, dt);
  V.camY = damp(V.camY, 6.2, 6, dt);
  const sh = S.shake;
  cam.position.set(V.camX + (sh ? rand(-sh, sh) : 0), V.camY + (sh ? rand(-sh, sh) : 0), V.camZ);
  cam.lookAt(V.x + Math.sin(V.h) * 7, 2.2, V.z + Math.cos(V.h) * 7);
  S.shake = Math.max(0, S.shake - dt * 2.2);
}

/* ─────────────── радар ─────────────── */
const radarC = $('radarc');
const rctx = radarC.getContext('2d');
let radarSize = 132;

function sizeRadar () {
  if (!radarC) return;
  const dpr = Math.min(devicePixelRatio, 2);
  radarSize = radarC.parentElement.clientWidth;
  radarC.width = radarSize * dpr;
  radarC.height = radarSize * dpr;
  rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawRadar () {
  const R = radarSize / 2, s = R / 135;
  rctx.clearRect(0, 0, radarSize, radarSize);
  rctx.save();
  rctx.beginPath(); rctx.arc(R, R, R, 0, Math.PI * 2); rctx.clip();
  rctx.fillStyle = '#a6d189'; rctx.fillRect(0, 0, radarSize, radarSize);
  rctx.translate(R, R);
  const cs = Math.cos(V.h), sn = Math.sin(V.h);
  const tr = (wx, wz) => {
    const dx = wx - V.x, dz = wz - V.z;
    return [(dz * sn - dx * cs) * s, -(dx * sn + dz * cs) * s];
  };
  rctx.strokeStyle = '#9aa0ab'; rctx.lineWidth = RW * s; rctx.lineCap = 'butt';
  for (const x of GRID) {
    const [x1, y1] = tr(x, -EDGE), [x2, y2] = tr(x, EDGE);
    rctx.beginPath(); rctx.moveTo(x1, y1); rctx.lineTo(x2, y2); rctx.stroke();
  }
  for (const z of GRID) {
    const [x1, y1] = tr(-EDGE, z), [x2, y2] = tr(EDGE, z);
    rctx.beginPath(); rctx.moveTo(x1, y1); rctx.lineTo(x2, y2); rctx.stroke();
  }
  // проложенный маршрут
  if (routePts.length > 1) {
    rctx.strokeStyle = '#ff8a2b'; rctx.lineWidth = 3; rctx.lineJoin = 'round';
    rctx.beginPath();
    routePts.forEach((p, i) => { const [a, b] = tr(p[0], p[1]); i ? rctx.lineTo(a, b) : rctx.moveTo(a, b); });
    rctx.stroke();
  }
  // пиццерия всегда видна, цель — кружком
  const blip = (wx, wz, hex, size) => {
    let [a, b] = tr(wx, wz);
    const len = Math.hypot(a, b);
    if (len > R - 7) { a *= (R - 7) / len; b *= (R - 7) / len; }
    rctx.fillStyle = hex; rctx.fillRect(a - size, b - size, size * 2, size * 2);
  };
  if (PIZZA) blip(PIZZA.x, PIZZA.z, '#ffffff', 3.4);
  if (S.target) blip(S.target.x, S.target.z, '#ff6900', 4);
  for (const t of TRAFFIC) blip(t.x, t.z, '#5b6b80', 2);
  rctx.fillStyle = '#fff'; rctx.strokeStyle = '#33210c'; rctx.lineWidth = 1.4;
  rctx.beginPath();
  rctx.moveTo(0, -6.4); rctx.lineTo(4.6, 5.4); rctx.lineTo(0, 2.8); rctx.lineTo(-4.6, 5.4);
  rctx.closePath(); rctx.fill(); rctx.stroke();
  rctx.restore();
}

/* ─────────────── хад ─────────────── */
const elHearts = $('hearts'), elMoney = $('money'), elTask = $('task'), elAddr = $('addr'),
      elDist = $('dist'), elTimeBar = $('timebar'), elTimeWrap = $('timewrap'),
      elBurgers = $('burgers'), elSpeed = $('speed'), elToast = $('toast'),
      elBig = $('big'), elBigT = $('big-t'), elBigS = $('big-s'), elBigK = $('big-k');

function hudHearts () {
  let s = '';
  for (let i = 0; i < 5; i++) s += '<i' + (i < S.hp ? '' : ' class="off"') + '></i>';
  elHearts.innerHTML = s;
}

let toastT = 0;
function toast (t) { elToast.textContent = t; elToast.style.opacity = 1; toastT = 1.6; }

function hudStep (dt) {
  elMoney.textContent = S.money + ' ₽';
  elBurgers.innerHTML = [S.burgers ? 'респект ' + S.burgers : '', S.people ? 'сбито ' + S.people : '', S.wrecks ? 'всмятку ' + S.wrecks : ''].filter(Boolean).join('<br>');
  elSpeed.textContent = Math.round(Math.hypot(V.vx, V.vz) * 3.6) + ' км/ч';
  if (toastT > 0 && (toastT -= dt) <= 0) elToast.style.opacity = 0;
  if (phoneT > 0 && (phoneT -= dt) <= 0) hidePhone();

  const on = S.state === 'drive' || S.state === 'back' || S.state === 'handover';
  elTimeWrap.style.visibility = on ? 'visible' : 'hidden';
  if (on && S.target) {
    const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
    const o = S.order;
    elTask.textContent = S.state === 'back' ? 'в пиццерию'
      : 'заказ ' + S.orders + (o && o.stops.length > 1 ? ' · ' + (o.idx + 1) + ' из ' + o.stops.length : '');
    elAddr.innerHTML = S.state === 'back' ? (PIZZA ? PIZZA.name.toLowerCase() : '')
      : S.addr + (S.addrLine ? '<br><span class="sub">' + S.addrLine + '</span>' : '');
    elDist.textContent = Math.round(d) + ' м';
    const t = clamp(S.time / S.timeMax, 0, 1);
    elTimeBar.style.width = (t * 100) + '%';
    elTimeBar.style.background = t > 0.4 ? '#ffd85e' : (t > 0.18 ? '#ff9a3c' : '#ff4d5e');
  } else { elTask.textContent = ''; elAddr.textContent = ''; elDist.textContent = ''; }
}

function showBig (title, sub, keys) {
  elBig.hidden = false;
  elBigT.textContent = title;
  elBigS.innerHTML = sub;
  elBigK.innerHTML = keys;
  $('lb-wrap').hidden = true;
}
const hideBig = () => { elBig.hidden = true; };
const hideOver = hideBig;

/* ── конец смены: за что закончилась, сколько заработал и где ты в общем зачёте ── */
function showOver (why, victims) {
  if (S.money > S.best) { S.best = S.money; localStorage.setItem('dlv-best', String(S.money)); }
  const vic = victims.length
    ? '<span class="ov-vic">вместо пиццы ты задавил ' +
      victims.map(v => v.acc || v.name).join(', ') + '</span><br>'
    : '';
  showBig(why,
    vic +
    'доставлено ' + S.delivered + ' · заработано ' + S.money + ' ₽<br>' +
    'респектов ' + S.burgers + ' · коллег сбито ' + S.people + '<br>' +
    'чужих машин всмятку ' + S.wrecks + '<br>' +
    (S.money >= S.best ? 'лучшая смена!' : 'твой рекорд ' + S.best + ' ₽'),
    'пробел — ещё раз');
  lbMode('over');
  LB.render(S.money);
  // Смена пишется сама, под именем с заставки: раньше имя спрашивали
  // только тут, его пропускали пробелом — и таблица стояла пустой.
  S.lastRun = S.money > 0
    ? { name: S.name, money: S.money, delivered: S.delivered, people: S.people, ts: Date.now() }
    : null;
  if (S.lastRun) saveRun();
  else $('lb-save').textContent = 'пустую смену не пишу';
}

/* Форма зачёта живёт в двух местах. На заставке это поле имени и «поехали»:
   без имени смена не начнётся. В конце смены поля нет, кнопка — статус
   записи, а если Контентфул не ответил, по ней можно повторить. */
function lbMode (mode) {
  S.lbMode = mode;
  $('lb-wrap').hidden = false;
  $('lb-name').hidden = mode !== 'title';
  $('lb-save').disabled = mode !== 'title';
  $('lb-vpn').classList.remove('bad');
  $('lb-vpn').innerHTML = '⚠️ чтобы смена попала в общую таблицу — <b>включи впн</b>: таблица живёт в Контентфуле, из России он не открывается';
  if (mode === 'title') {
    $('lb-name').value = S.name;
    $('lb-save').textContent = 'поехали';
    $('lb-place').textContent = 'сначала имя — под ним смены попадут в общий зачёт';
  }
}

async function saveRun () {
  const r = S.lastRun;
  if (!r) return;
  $('lb-save').disabled = true;
  $('lb-save').textContent = 'записываю…';
  const ok = await LB.save(r);
  if (S.lastRun !== r || S.lbMode !== 'over') return;  // уже поехали дальше
  $('lb-save').disabled = ok;
  $('lb-save').textContent = ok ? 'записано: ' + r.name : 'не записалось — ещё раз';
  $('lb-vpn').classList.toggle('bad', !ok);
  if (!ok) $('lb-vpn').innerHTML = '⚠️ не записалось: Контентфул не ответил. Включи впн и жми ещё раз';
  LB.render(r.money);
}

/* Коробка летает по дуге: из окна пиццерии в машину и из машины
   в руки гостю. Цель может быть функцией — тогда она едет с машиной. */
const FLY = [];

function flyBox (from, to, dur, onDone) {
  const g = pizzaBox();
  g.position.set(from.x, from.y, from.z);
  scene.add(g);
  FLY.push({ g, from: { x: from.x, y: from.y, z: from.z }, to, t: 0, dur: dur || 0.8, onDone });
  Snd.blip(880, 0.08, 'triangle', 0.1);
}

function updateFly (dt) {
  for (let i = FLY.length - 1; i >= 0; i--) {
    const f = FLY[i];
    f.t += dt / f.dur;
    const t = Math.min(1, f.t);
    const to = typeof f.to === 'function' ? f.to() : f.to;
    f.g.position.set(
      lerp(f.from.x, to.x, t),
      lerp(f.from.y, to.y, t) + Math.sin(t * Math.PI) * 1.9,
      lerp(f.from.z, to.z, t),
    );
    f.g.rotation.x += dt * 7; f.g.rotation.y += dt * 4;
    if (t >= 1) {
      scene.remove(f.g);
      FLY.splice(i, 1);
      if (f.onDone) f.onDone();
    }
  }
}

/* ─────────────── таблица лидеров ───────────────
   Общая, как в lab/faces: та же запись в Контентфуле через
   ../../contentful.js, только со своим префиксом. Без сети
   остаётся локальный список — смена всё равно засчитается. */

const LB = {
  PREFIX: 'LB:delivery:v1|',
  KEY_LOCAL: 'dlv-lb-local',
  cache: null,

  pack (r) {
    return this.PREFIX + [r.name.replace(/\|/g, ' ').slice(0, 24), r.money, r.delivered, r.people, r.ts].join('|');
  },
  unpack (v) {
    if (typeof v !== 'string' || !v.startsWith(this.PREFIX)) return null;
    const [name, money, delivered, people, ts] = v.slice(this.PREFIX.length).split('|');
    if (!name) return null;
    return { name, money: +money || 0, delivered: +delivered || 0, people: +people || 0, ts: +ts || 0 };
  },
  local () { try { return JSON.parse(localStorage.getItem(this.KEY_LOCAL) || '[]'); } catch (e) { return []; } },
  remember (r) {
    try {
      const l = this.local(); l.push(r);
      localStorage.setItem(this.KEY_LOCAL, JSON.stringify(l.slice(-50)));
    } catch (e) { /* приватный режим */ }
  },
  merge (list) {
    const best = new Map();
    for (const r of list) {
      const k = r.name.trim().toLowerCase();
      if (!best.has(k) || best.get(k).money < r.money) best.set(k, r);
    }
    return [...best.values()].sort((a, b) => b.money - a.money || a.ts - b.ts);
  },
  async load () {
    let remote = [];
    try {
      if (!window.CFEntry) throw new Error('contentful.js не загрузился');
      const items = await Promise.race([
        window.CFEntry.fetch('hb', { 'fields.birthdayWish[match]': 'LB:delivery', limit: 1000, order: '-sys.createdAt' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
      ]);
      remote = items.map(it => {
        const raw = it.fields && it.fields.birthdayWish;
        return this.unpack(typeof raw === 'string' ? raw : raw && (raw['en-US'] || Object.values(raw)[0]));
      }).filter(Boolean);
    } catch (e) { console.warn('[доставка] таблица не загрузилась:', e); }
    this.cache = this.merge(remote.concat(this.local()));
    return this.cache;
  },
  async save (r) {
    this.remember(r);
    let ok = false;
    try { await window.CFEntry.create('hb', { birthdayWish: this.pack(r) }); ok = true; }
    catch (e) { console.warn('[доставка] не записал:', e); }
    await this.load();
    return ok;
  },
  render (myMoney) {
    const list = this.cache || this.merge(this.local());
    const me = (S.name || '').trim().toLowerCase();
    $('lb-list').innerHTML = list.slice(0, 10).map((r, i) =>
      '<li' + (r.name.trim().toLowerCase() === me ? ' class="me"' : '') + '>' +
      '<b>' + (i + 1) + '</b><span>' + r.name + '</span><i>' + r.money + ' ₽</i></li>').join('')
      || '<li class="empty">пока пусто — впиши имя и запиши смену</li>';
    if (S.lbMode === 'title') return;          // на заставке тут подсказка про имя
    const place = list.findIndex(r => r.money <= myMoney);
    $('lb-place').textContent = myMoney > 0 && place !== -1 ? 'это ' + (place + 1) + '-е место в общем зачёте' : '';
  },
};

/* ─────────────── умный трекер: кто, что и почему ───────────────
   Заказы назначает трекер: сам решает, кого объединить в один
   маршрут, и объясняет своё решение прямо в карточке. Везём не
   в дом, а живому коллеге, который в этот момент идёт по улице. */

const PIZZAS = ['пепперони', 'маргарита', 'четыре сыра', 'мясная', 'гавайская',
                'додо микс', 'ветчина и сыр', 'диабло', 'карбонара'];
const SOLO_WHY = [
  'один адрес, ближе никого не нашлось',
  'срочный: ждёт дольше всех',
  'по пути от пиццерии',
  'повторный заказ, клиент лояльный',
];

let GATE = null;

function clearGate () {
  if (!GATE) return;
  scene.remove(GATE.grp);
  const i = SOLIDS.indexOf(GATE.solid);
  if (i >= 0) SOLIDS.splice(i, 1);
  GATE = null;
  indexSolids();
}

/* шлагбаум поперёк прямого заезда во двор */
function setGate (fromX, fromZ, toX, toZ) {
  clearGate();
  const dx = toX - fromX, dz = toZ - fromZ;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const gx = fromX + ux * len * 0.5, gz = fromZ + uz * len * 0.5;
  const ang = Math.atan2(ux, uz);

  const grp = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.5), mat('#d8d3c8'));
  post.position.set(-5, 0.9, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.3, 0.3), mat('#e8e2d6'));
  arm.position.set(0, 1.5, 0);
  grp.add(post, arm);
  for (let i = 0; i < 5; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(1, 0.34, 0.34), mat('#d9342c'));
    st.position.set(-4.6 + i * 2.1, 1.5, 0);
    grp.add(st);
  }
  grp.position.set(gx, 0, gz);
  grp.rotation.y = ang + Math.PI / 2;
  scene.add(grp);

  const hw = Math.abs(Math.cos(ang)) > 0.5 ? 5.4 : 0.9;
  const hd = Math.abs(Math.cos(ang)) > 0.5 ? 0.9 : 5.4;
  const sol = { x0: gx - hw, z0: gz - hd, x1: gx + hw, z1: gz + hd };
  SOLIDS.push(sol);
  GATE = { grp, solid: sol };
  indexSolids();
}

/* ── адрес и комментарий курьера ──
   И то, и другое — шутка. Адрес созвучен фамилии или просто
   бессмысленный, комментарий — мем на реальные пометки курьеров:
   они ничего не объясняют, но их зачем-то пишут. */

function funnyAddress (person) {
  const full = (person && person.name || 'Иван Иванов').split(/\s+/);
  const last = full[1] || full[0];
  const r = Math.random();
  // шутка с фамилией хороша, но не каждый раз — иначе приедается
  if (r < 0.17) return 'улица ' + last + ', дом ' + last;
  if (r < 0.27) return 'улица Пушкина, дом Колотушкина';
  if (r < 0.32) return 'улица ' + last + 'ская, ' + pick(HOUSES_FUN);
  return pick(STREETS) + ', ' + pick(HOUSES_FUN);
}

const COURIER_NOTES = [
  'встречает в одних трусах',
  'у него три пальца',
  'не смотри в глаза собаке',
  'звонить два раза, третий не работает',
  'домофон кусается',
  'лифт едет только вниз',
  'стучать ногой, руками нельзя',
  'говорит шёпотом, не пугайся',
  'на ковёр не смотреть',
  'сосед снизу — это не он',
  'открывает не сразу, а потом сразу',
  'в подъезде живёт кот, он главный',
  'просил приехать молча',
  'дверь синяя, но покрашена',
  'если не открыл — значит открыл',
  'у двери стоит стул, это его стул',
  'не здоровайся, он стесняется',
  'пахнет борщом, это нормально',
];

const elPhone = $('phone'), elPhWhy = $('ph-why'), elPhList = $('ph-list'), elPhWhat = $('ph-what');
let phoneT = 0;

/* карточка-анкета: аватарка, имя, фамилия, адрес и пометка курьера */
const KIND_LABEL = { group: 'групповой заказ', chain: 'последовательный заказ', solo: 'заказ' };

function personRow (p) {
  const full = (p && p.name || 'Иван Иванов').split(/\s+/);
  return '<div class="ph-who">' +
    (p ? '<img src="../faces/' + p.img + '" alt="">' : '<i></i>') +
    '<span class="ph-n">' + (full[0] || '') + '</span>' +
    '<span class="ph-s">' + (full.slice(1).join(' ') || '') + '</span>' +
    '<span class="ph-p">' + (p && p.pos ? p.pos : 'коллега') + '</span>' +
    '</div>';
}

function showOrderCard (order) {
  $('ph-kind').textContent = KIND_LABEL[order.kind] || 'заказ';
  elPhWhat.textContent = order.items;
  elPhWhy.textContent = order.why;
  const many = order.stops.length > 1;
  elPhList.innerHTML = order.stops.map((st, i) =>
    '<div class="ph-stop' + (i === 0 ? ' now' : '') + '">' +
      (many ? '<div class="ph-num">адрес ' + (i + 1) + ' из ' + order.stops.length + '</div>' : '') +
      st.persons.map(personRow).join('') +
      '<div class="ph-fields">' +
        '<div><b>адрес</b><span>' + st.addr + '</span></div>' +
        '<div><b>коммент курьера</b><span>«' + st.note + '»</span></div>' +
      '</div>' +
    '</div>').join('');
  elPhone.classList.add('on');
  phoneT = 0;                 // висит, пока не нажмут «принять»
}
const hidePhone = () => { elPhone.classList.remove('on'); phoneT = 0; };

/* ─────────────── заказы ─────────────── */

const alive = () => PEOPLE.filter(p => !p.dead && !p.guest && p.person);

/* Трекер собирает два вида заказов.

   Групповой — несколько коллег рядом заказали на всех: один адрес,
   одна остановка, коробки разлетаются по рукам разом.
   Последовательный — два-три отдельных заказа, которые курьер
   везёт один за другим, каждый со своим адресом. */
function planOrder () {
  const pool = alive();
  if (!pool.length) return null;
  const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  if (pool.length > 1 && chance(0.45)) {
    const a = pick(pool);
    const buddies = pool.filter(p => p !== a && near(p, a) < 45).sort((p, q) => near(p, a) - near(q, a));
    if (buddies.length) {
      const take = [a, ...buddies.slice(0, buddies.length > 1 && chance(0.35) ? 2 : 1)];
      const pos = a.person.pos;
      const same = take.every(p => p.person.pos === pos);
      return {
        kind: 'group',
        stops: [{ peds: take }],
        why: same && pos ? 'групповой: ' + pos + ', заказали на всех' : 'групповой: заказали на всех сразу',
      };
    }
  }

  if (pool.length > 2 && chance(0.5)) {
    const rest = pool.slice();
    let cur = rest.splice((Math.random() * rest.length) | 0, 1)[0];
    const list = [cur];
    const n = chance(0.4) ? 3 : 2;
    for (let i = 1; i < n && rest.length; i++) {
      rest.sort((p, q) => near(p, cur) - near(q, cur));
      cur = rest.shift();
      list.push(cur);
    }
    return {
      kind: 'chain',
      stops: list.map(p => ({ peds: [p] })),
      why: 'последовательный: ' + list.length + ' заказа подряд, везём по очереди',
    };
  }

  return { kind: 'solo', stops: [{ peds: [pick(pool)] }], why: pick(SOLO_WHY) };
}

function newOrder () {
  S.orders++;
  clearGate();
  const plan = planOrder();
  if (!plan) { backToBase(); return; }

  for (const st of plan.stops) {
    st.persons = st.peds.map(p => p.person);
    st.addr = funnyAddress(st.persons[0]);
    st.note = pick(COURIER_NOTES);
    // групповой: остальные подходят к первому и ждут вместе
    if (st.peds.length > 1) {
      // групповой: встают кружком вокруг общей точки, лицом друг к другу
      const gx = st.peds.reduce((a, p) => a + p.x, 0) / st.peds.length;
      const gz = st.peds.reduce((a, p) => a + p.z, 0) / st.peds.length;
      const rad = 1.5 + st.peds.length * 0.35;
      const turn = Math.random() * 6.28;
      st.peds.forEach((p, i) => {
        const ang = turn + i * (Math.PI * 2 / st.peds.length);
        makeGuest(p, { x: gx + Math.sin(ang) * rad, z: gz + Math.cos(ang) * rad });
      });
    } else makeGuest(st.peds[0]);
  }

  const total = plan.stops.reduce((n, st) => n + st.peds.length, 0);
  S.order = {
    kind: plan.kind,
    stops: plan.stops,
    idx: 0,
    why: plan.why,
    items: total + ' × ' + pick(PIZZAS),
  };
  S.state = 'brief';                            // езда заблокирована до «принять»
  syncTarget();

  // Шлагбаум вешаем на въезд ближайшей дворовой парковки, а не в
  // случайную точку: раньше стрела торчала посреди газона.
  const first = S.order.stops[0].peds[0];
  if (S.orders > 1 && chance(0.4)) {
    let best = null, bd = 34;
    for (const pk of PARKINGS) {
      const d = Math.hypot(pk.cx - first.x, pk.cz - first.z);
      if (d < bd) { bd = d; best = pk; }
    }
    if (best) {
      setGate(best.ex + (best.ex - best.cx) * 0.8, best.ez + (best.ez - best.cz) * 0.8, best.cx, best.cz);
      S.order.why += ' · на парковку шлагбаум, объезжай';
    }
  }

  const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
  S.fee = 120 * total + Math.round(d * 1.7);
  // срок фиксированный и ужимается с каждым заказом
  S.timeMax = Math.max(22, d / 16 + 26 + plan.stops.length * 11 - S.orders * 1.6);
  S.time = S.timeMax;
  rebuildRoutePath();
  showOrderCard(S.order);
  Snd.order();
}

/* «принять» — из окна пиццерии в машину влетает коробка, и только
   после этого отпускается руль и начинает тикать срок */
function acceptOrder () {
  if (S.state !== 'brief') return;
  hidePhone();
  S.state = 'loading';
  V.vx = V.vz = 0;
  flyBox(
    { x: PIZZA.x, y: 2.6, z: PIZZA.z - 13 },
    () => ({ x: V.x, y: 1.2, z: V.z }),
    1.0,
    () => {
      S.state = 'drive';
      S.time = S.timeMax;                       // срок пошёл с момента загрузки
      toast('пицца в машине — поехали');
      Snd.blip(760, 0.1, 'square', 0.13);
    },
  );
}

/* цель едет вместе с гостем: он ждёт там, где его застал заказ */
function syncTarget () {
  const o = S.order;
  if (!o || o.idx >= o.stops.length) { S.target = null; return; }
  const st = o.stops[o.idx];
  const ped = st.peds[0];
  S.target = { x: ped.x, z: ped.z, name: st.persons[0] ? st.persons[0].name : 'коллега', ped };
  S.addr = st.persons.map(p => p ? p.name : 'коллега').join(', ');
  S.addrLine = st.addr;
}

function backToBase () {
  S.state = 'back';
  if (S.order) for (const st of S.order.stops) for (const p of st.peds) if (!p.served) clearGuest(p);
  S.order = null;
  S.target = { x: PIZZA.x, z: PIZZA.z, name: PIZZA.name };
  S.addrLine = '';
  const d = Math.hypot(PIZZA.x - V.x, PIZZA.z - V.z);
  S.timeMax = d / 16 + 26;
  S.time = S.timeMax;
  rebuildRoutePath();
  toast('возвращайся в пиццерию');
}

/* вручение: коробка вылетает из машины каждому в руки */
function handOver (st, onTime) {
  st.peds.forEach((ped, i) => {
    setTimeout(() => {
      if (ped.dead || S.state === 'over' || S.state === 'dying') return;
      flyBox({ x: V.x, y: 1.3, z: V.z }, { x: ped.x, y: 1.15, z: ped.z }, 0.6, () => {
        if (ped.dead) return;
        const box = pizzaBox();
        box.scale.setScalar(0.75);
        box.position.set(0, ped.sitting ? 1.0 : 1.12, 0.32);
        ped.grp.add(box);
        ped.hold = box;
        ped.served = 1;
        ped.freeT = 16;
        if (onTime) { ped.holdT = 7; emote(ped.x, 2.1, ped.z, 'heart', 5); }
        else emote(ped.x, 2.1, ped.z, 'angry', 3);
      });
    }, i * 220);
  });
}

function checkArrival (dt) {
  if (!S.target) return;
  const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
  const speed = Math.hypot(V.vx, V.vz);

  if (S.state === 'drive') {
    // к гостю надо подъехать и притормозить, а не влететь
    if (d > 5 || speed > 6) return;
    const o = S.order;
    const st = o.stops[o.idx];
    const onTime = S.time > 0;
    const share = Math.round(S.fee / o.stops.length);
    const bonus = onTime ? Math.round(share * 0.45 * clamp(S.time / S.timeMax, 0, 1)) : 0;
    const part = onTime ? share + bonus : Math.round(share * 0.45);
    S.money += part;
    S.delivered += st.peds.length;

    handOver(st, onTime);
    toast((onTime ? '+' : 'опоздал · +') + part + ' ₽ · ' + S.addr);
    Snd.coin();

    o.idx++;
    if (o.idx < o.stops.length) {
      syncTarget();
      S.time += 16;                              // на следующий адрес добавляем воздуха
      S.timeMax = Math.max(S.timeMax, S.time);
      toast('следующий: ' + S.addr);
      Snd.order();
    } else {
      S.state = 'handover'; S.handT = 0.9;
    }
  } else if (S.state === 'back') {
    if (d > 7) return;
    S.state = 'handover'; S.handT = 0.8;
    clearGate();
    toast('забрал заказ');
    Snd.blip(600, 0.12, 'square', 0.13);
  }
}

/* задавил того, кому вёз — смена закончена */
function checkVictim (ped) {
  const o = S.order;
  if (!o) return false;
  return o.stops.slice(o.idx).some(st => st.peds.includes(ped));
}

const ease = t => t * t * (3 - 2 * t);
const DEATH = { t: 0, x: 0, z: 0, h: 0, why: '', victims: [], burn: 0, fireT: 0 };
const DEATH_WORD = {
  'не доставил': 'задавил',
  'машина всё': 'приехали',
  'не успел': 'не успел',
};

function gameOver (why, victims, focus) {
  if (S.state === 'over' || S.state === 'dying') return;
  S.state = 'dying';
  S.target = null;
  if (S.order) for (const st of S.order.stops) for (const p of st.peds) clearGuest(p);
  S.order = null;
  routePts = [];
  marker.visible = false;
  hidePhone();
  clearGate();

  DEATH.t = 0;
  DEATH.x = focus ? focus.x : V.x;
  DEATH.z = focus ? focus.z : V.z;
  DEATH.h = V.camH;
  DEATH.why = why;
  DEATH.victims = victims || [];
  DEATH.burn = why === 'машина всё' ? 1 : 0;
  DEATH.fireT = 0;

  if (DEATH.burn) {
    // машина выгорает: краска чернеет, из-под капота остаётся огонь
    car.traverse(o => { if (o.isMesh && o.material && o.material.color) o.material.color.setHex(0x241f26); });
  }

  // Имя жертвы — крупно и в лоб: не «под колёсами такая-то», а прямая
  // формулировка, за что смена закончилась.
  const el = $('w-word');
  if (DEATH.victims.length) {
    const who = DEATH.victims.map(v => v.acc || v.name).join(' и ');
    el.textContent = ('задавил ' + who).toUpperCase();
    $('w-sub').textContent = 'КЛИЕНТ ПОТЕРЯН';
  } else {
    el.textContent = (DEATH_WORD[why] || 'смена окончена').toUpperCase();
    $('w-sub').textContent = why === 'машина всё' ? 'ДАЛЬШЕ ОНА НЕ ПОЕХАЛА' : 'ЗАКАЗ ПРОТУХ';
  }
  el.classList.toggle('long', el.textContent.length > 20);
  $('wasted').hidden = false;
  document.body.classList.remove('w-show');
  Snd.fail();
}

function deathTick (dt) {
  DEATH.t += dt;
  const t = DEATH.t;

  // горящая машина дымит всё кино
  if (DEATH.burn) {
    DEATH.fireT -= dt;
    if (DEATH.fireT <= 0) {
      DEATH.fireT = 0.09;
      fire(V.x + rand(-1, 1), rand(0.9, 2), V.z + rand(-1.6, 1.6));
      puff(V.x + rand(-1, 1), rand(1.6, 3), V.z + rand(-1.6, 1.6), true, rand(0.7, 1.3));
    }
    DEATH.x = V.x; DEATH.z = V.z;                // камера держит машину в кадре
  }

  // камера отъезжает и уходит в небо
  const k = ease(clamp((t - 0.35) / 3.4, 0, 1));
  let back = lerp(11, 5.5, k);
  const y = lerp(4.5, 34, k);
  if (y < 22) while (back > 3 && camInWall(DEATH.x - Math.sin(DEATH.h) * back, DEATH.z - Math.cos(DEATH.h) * back)) back -= 1.5;
  cam.position.set(DEATH.x - Math.sin(DEATH.h) * back, y, DEATH.z - Math.cos(DEATH.h) * back);
  cam.lookAt(DEATH.x, lerp(1.4, 0, k), DEATH.z);

  if (t > 1.2) document.body.classList.add('w-show');
  if (t > 5) {
    S.state = 'over';
    $('wasted').hidden = true;
    document.body.classList.remove('w-show');
    showOver(DEATH.why, DEATH.victims);
  }
}

function startRun () {
  $('wasted').hidden = true;
  document.body.classList.remove('w-show');
  resetCar();
  S.state = 'drive'; S.hp = 5; S.money = 0; S.orders = 0; S.burgers = 0;
  S.people = 0; S.wrecks = 0; S.delivered = 0;
  S.hurt = 0; S.shake = 0;
  V.x = PIZZA.x - 6; V.z = 30 - LANE; V.h = -Math.PI / 2;
  V.vx = V.vz = 0; V.camX = V.x + 12; V.camZ = V.z; V.camH = V.h;
  hudHearts();
  hideOver();
  newOrder();
}

/* старт смены: с заставки — только с именем */
function tryStart () {
  if (S.state === 'title') {
    const name = ($('lb-name').value || '').trim();
    if (!name) {
      $('lb-name').focus();
      $('lb-name').classList.remove('need'); void $('lb-name').offsetWidth;
      $('lb-name').classList.add('need');
      return;
    }
    S.name = name;
    try { localStorage.setItem('dlv-name', name); } catch (e) { /* приватный режим */ }
    $('lb-name').blur();
  } else if (S.state !== 'over') return;
  startRun();
}

$('lb-save').addEventListener('click', () => {
  if (S.lbMode === 'title') tryStart();
  else saveRun();                               // повтор, если не записалось
});
$('lb-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryStart(); } });
$('lb-name').addEventListener('input', () => $('lb-name').classList.remove('need'));
for (const ev of ['keydown', 'keyup', 'keypress'])
  $('lb-name').addEventListener(ev, e => e.stopPropagation());

/* звук и пауза кнопками: не все догадаются про M и P */
$('sfx').addEventListener('click', () => {
  Snd.boot(); Snd.resume();
  Snd.on = !Snd.on;
  $('sfx').textContent = Snd.on ? 'звук вкл' : 'звук выкл';
});
$('pause').addEventListener('click', () => {
  S.paused = !S.paused;
  $('pause').textContent = S.paused ? 'продолжить' : 'пауза';
});

/* «принять»: до него руль заблокирован */
$('ph-accept').addEventListener('click', acceptOrder);

/* ─────────────── ввод ─────────────── */
const KEY = {
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hand',
};

addEventListener('keydown', e => {
  if (KEY[e.code]) { IN[KEY[e.code]] = 1; e.preventDefault(); }
  Snd.boot(); Snd.resume();
  if (e.code === 'Space' && (S.state === 'title' || S.state === 'over')) tryStart();
  if (phoneT > 0 && e.code !== 'KeyM') hidePhone();
  if (e.code === 'KeyM') { Snd.on = !Snd.on; $('sfx').textContent = Snd.on ? 'звук вкл' : 'звук выкл'; toast(Snd.on ? 'звук вкл' : 'звук выкл'); }
  if (e.code === 'KeyP') { S.paused = !S.paused; $('pause').textContent = S.paused ? 'продолжить' : 'пауза'; toast(S.paused ? 'пауза' : ''); }
});
addEventListener('keyup', e => { if (KEY[e.code]) { IN[KEY[e.code]] = 0; e.preventDefault(); } });
addEventListener('blur', () => { for (const k in IN) IN[k] = 0; });

/* на телефоне: газ — правая половина, руль — наклон пальца по горизонтали */
const touches = new Map();
function touchUpdate () {
  IN.gas = IN.left = IN.right = 0;
  for (const t of touches.values()) {
    if (t.y > innerHeight * 0.55) IN.gas = 1;
    if (t.x < innerWidth * 0.33) IN.left = 1;
    else if (t.x > innerWidth * 0.67) IN.right = 1;
    else IN.gas = 1;
  }
}
/* Палец считаем только если он лёг на саму картинку. Нажатие на кнопку
   «принять» раньше тоже уходило в газ, а отпускание ловилось лишь на
   канвасе — палец оставался в списке, и машина ехала вперёд сама. */
addEventListener('pointerdown', e => {
  Snd.boot(); Snd.resume();
  if (e.target !== canvas) return;              // поля и кнопки хада не трогаем
  if (S.state === 'title' || S.state === 'over') { tryStart(); return; }
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); touchUpdate();
});
addEventListener('pointermove', e => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); touchUpdate();
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
  addEventListener(ev, e => { touches.delete(e.pointerId); touchUpdate(); });
// и страховка: ушёл фокус или курсор с окна — руль отпущен
for (const ev of ['blur', 'contextmenu'])
  addEventListener(ev, () => { touches.clear(); for (const k in IN) IN[k] = 0; });

/* ─────────────── вступление к выпуску (?intro) ───────────────
   Катсцена вместо игры: команда стоит кружком у пиццерии, курьер
   подлетает к бордюру, коробка летит им в руки, камера наезжает,
   крышка открывается — внутри дайджест. Дальше две кнопки: поехать
   доставлять самому или читать. Выпуск грузит эту страницу в рамку
   и слушает postMessage { dlvIntro: 'ready' | 'read' | 'play' }.

   Место — тротуар перед пиццерией: этот квартал строится без случая,
   ни домов, ни реквизита, ни припаркованных. */

const IC = { x: -16, z: 26.2 };                  // центр кружка
const I_LANE = 39 - LANE;                         // наша полоса: едем к −X
const I_CURB = 33.9;                              // тут курьер прижимается к бордюру
const I_FROM = 28, I_STOP = IC.x + 1.2;
/* углы от центра, 0° — к дороге. Болтают ровным кружком, а ловя коробку,
   расступаются подковой к улице: в этот просвет в конце заходит камера,
   и руки не лезут в кадр */
const CAST_IDS = [
  ['o-arbuzova', 50, 92], ['j-serova', 140, 152], ['i-komantcev', -140, -152], ['a-boev', -50, -92],
];
/* план по секундам */
const T = { cut: 2, drive: 4, notice: 5.8, arrive: 6.9, shotC: 7.1, toss: 7.4, land: 8.5, shotD: 9.1, lid: 10.1, end: 11.2 };
const R_TALK = 1.15, R_HOLD = 0.9;               // кружок сжимается, когда ловят коробку

const IS = { t: -1, cast: [], box: null, lid: null, lidA: 0, carV: 0, done: false, names: [] };

function introPost (ev) {
  if (window.parent !== window) window.parent.postMessage({ dlvIntro: ev }, location.origin);
}

/* коробка, которая открывается: дно из пяти стенок и крышка на петле сзади */
function introBox () {
  const g = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const W = 0.86, H = 0.2, th = 0.025;
  const add = (w, h, d, hex, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex));
    m.position.set(x, y, z); g.add(m); return m;
  };
  add(W, th, W, '#ff6900', 0, -H / 2, 0);
  add(W, H, th, '#ff6900', 0, 0, W / 2);
  add(W, H, th, '#ff6900', 0, 0, -W / 2);
  add(th, H, W, '#ff6900', W / 2, 0, 0);
  add(th, H, W, '#ff6900', -W / 2, 0, 0);
  // картон изнутри и пицца
  add(W - 0.06, 0.01, W - 0.06, '#f3e2c0', 0, -H / 2 + 0.02, 0);
  const pz = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.05, 20), mat('#e8a94f'));
  pz.position.set(0, -H / 2 + 0.05, 0); g.add(pz);
  const cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 20), mat('#ffd35a'));
  cheese.position.set(0, -H / 2 + 0.085, 0); g.add(cheese);
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2 + 0.3, r = k % 3 ? 0.2 : 0.08;
    const pep = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), mat('#d2412f'));
    pep.position.set(Math.cos(a) * r, -H / 2 + 0.1, Math.sin(a) * r); g.add(pep);
  }
  // крышка: пивот на задней кромке, изнанка с надписью смотрит вниз
  const lid = new THREE.Group();
  lid.position.set(0, H / 2, -W / 2);
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, th, W + 0.02), mat('#ff6900'));
  top.position.set(0, 0, W / 2);
  lid.add(top);
  const logo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.12), mat('#fff3d6'));
  logo.position.set(0, th / 2 + 0.004, W / 2);
  lid.add(logo);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, W - 0.02),
    new THREE.MeshBasicMaterial({ map: introText() }));
  inner.rotation.x = Math.PI / 2;
  inner.position.set(0, -th / 2 - 0.003, W / 2);
  lid.add(inner);
  g.add(lid);
  g.userData.lid = lid;
  return g;
}

/* надпись на изнанке крышки — пиксельным шрифтом, как весь хад */
function introText () {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#fff3d6'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#ff6900'; x.lineWidth = 16; x.strokeRect(20, 20, 472, 472);
  x.fillStyle = '#33210c';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const font = s => `${s}px "Press Start 2P", ui-monospace, monospace`;
  x.font = font(40);
  x.fillText('привезли', 256, 150);
  x.fillText('вам', 256, 214);
  x.fillStyle = '#ff6900';
  x.font = font(42);
  x.fillText('дайджест!', 256, 284);
  x.fillStyle = '#8a6b4e';
  x.font = font(17);
  x.fillText('xxx · 14–25 сентября', 256, 390);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function introSetup () {
  S.state = 'intro';
  cam.near = 0.05; cam.updateProjectionMatrix();
  $('intro').hidden = false;

  // кружок: четверо лицом друг к другу
  const byId = id => ROSTER.find(p => p.id === id);
  for (const [id, deg, holdDeg] of CAST_IDS) {
    const person = byId(id) || nextPerson();
    const a = deg * Math.PI / 180, r = R_TALK;
    const g = makeHuman(person);
    const x = IC.x + Math.sin(a) * r, z = IC.z + Math.cos(a) * r;
    const face = Math.atan2(IC.x - x, IC.z - z);
    g.position.set(x, 0.22, z);
    g.rotation.y = face;
    scene.add(g);
    const tag = document.createElement('div');
    tag.className = 'in-name';
    tag.textContent = person ? person.name : '';
    $('in-names').appendChild(tag);
    IS.cast.push({ g, a, ha: holdDeg * Math.PI / 180, x, z, face, h: face, ph: Math.random() * 9, tag, talk: rand(0, 3) });
  }

  // машина ждёт за кадром, пока идёт первый план
  V.x = I_FROM; V.z = I_LANE; V.h = -Math.PI / 2;
  car.visible = false;
  // полосу перед нами чистим: скриптовая машина никого не объезжает
  for (const t of TRAFFIC)
    if (!t.parked && t.x > -70 && t.x < 70 && t.z > 30 && t.z < 48) respawnTraffic(t);

  IS.box = introBox();
  IS.box.visible = false;
  scene.add(IS.box);

  $('in-read').addEventListener('click', () => {
    if (window.parent !== window) introPost('read');
    else location.href = '../../';
  });
  $('in-play').addEventListener('click', () => {
    if (window.parent !== window) introPost('play');
    else location.href = './';
  });

  // стартуем, когда подъехали лица и шрифт — или через три секунды в любом случае
  // TextureLoader отдаёт картинку только после загрузки — поэтому просто ждём её
  const faces = IS.cast.map(c => new Promise(res => {
    const tex = c.g.userData.head.material[4].map;
    const ok = () => !tex || (tex.image && tex.image.complete);
    const poll = () => ok() ? res() : setTimeout(poll, 80);
    poll();
  }));
  const font = document.fonts ? document.fonts.load('40px "Press Start 2P"') : Promise.resolve();
  Promise.race([Promise.all([...faces, font]), new Promise(r => setTimeout(r, 3000))]).then(() => {
    // надпись рисуем уже нужным шрифтом
    const inner = IS.box.userData.lid.children[2];
    inner.material.map = introText(); inner.material.needsUpdate = true;
    IS.t = 0;
    $('intro').classList.add('bars');
    introPost('ready');
  });
}

const introFov = f => { if (cam.fov !== f) { cam.fov = f; cam.updateProjectionMatrix(); } };
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const tmpV = new THREE.Vector3();

function introStep (dt) {
  if (IS.t < 0) {                                  // ждём лица: общий план сверху
    cam.position.set(IC.x + 14, 12, IC.z + 16);
    cam.lookAt(IC.x, 1, IC.z);
    return;
  }
  if (!IS.freeze) IS.t += dt;                     // freeze — отладочная пауза на кадре
  const t = IS.t;

  /* ── машина: влетает с проспекта, тормозит в пол и прижимается к бордюру ── */
  if (t >= T.drive) {
    car.visible = true;
    const u = seg(t, T.drive, T.arrive);
    const e = 1 - (1 - u) * (1 - u);               // равнозамедленно
    const px = V.x, pz = V.z;
    V.x = lerp(I_FROM, I_STOP, e);
    V.z = lerp(I_LANE, I_CURB, smooth(seg(u, 0.45, 1)));
    const vx = (V.x - px) / Math.max(dt, 1e-3), vz = (V.z - pz) / Math.max(dt, 1e-3);
    IS.carV = Math.hypot(vx, vz);
    if (IS.carV > 0.3) V.h = Math.atan2(vx, vz);
    else V.h = damp(V.h, -Math.PI / 2, 4, dt);
    V.vx = vx; V.vz = vz;
    car.position.set(V.x, 0, V.z);
    car.rotation.set(u < 1 ? -0.05 * smooth(seg(u, 0.5, 0.9)) * (1 - seg(u, 0.9, 1)) : 0, V.h, 0);
    V.wheel += IS.carV * dt / 0.44;
    for (const w of car.userData.wheels) w.rotation.x = V.wheel;
    for (const s of car.userData.steer) s.rotation.y = u > 0.45 && u < 0.95 ? -0.35 : 0;
    // тормозной дым из-под колёс
    if (u > 0.6 && u < 0.95 && Math.random() < dt * 7)
      puff(V.x - Math.sin(V.h) * 1.6 + rand(-0.6, 0.6), 0.15, V.z - Math.cos(V.h) * 1.6, false, rand(0.25, 0.4));
  } else {
    car.position.set(V.x, 0, V.z);
  }

  /* ── коробка: из окна по дуге в середину кружка ── */
  const B = IS.box;
  if (t >= T.toss) {
    B.visible = true;
    const u = seg(t, T.toss, T.land);
    const fx = V.x - 0.2, fz = V.z - 0.9, fy = 1.35;
    const tx = IC.x, tz = IC.z, ty = 1.12;
    B.position.set(lerp(fx, tx, u), lerp(fy, ty, u) + Math.sin(u * Math.PI) * 2.6, lerp(fz, tz, u));
    B.rotation.set(Math.sin(u * Math.PI) * 0.7, (1 - smooth(u)) * Math.PI * 2, Math.sin(u * Math.PI * 2) * 0.25);
    if (u >= 1 && !IS.landed) {
      IS.landed = true;
      for (let k = 0; k < 6; k++) emote(IC.x + rand(-0.8, 0.8), 2.2, IC.z + rand(-0.8, 0.8), 'heart', 1);
    }
    // крышка
    const lu = seg(t, T.lid, T.lid + 0.9);
    const ov = lu < 1 ? smooth(lu) * 1.08 - Math.sin(lu * Math.PI) * 0.05 : 1;
    B.userData.lid.rotation.x = -1.82 * Math.min(1.04, ov);
    if (lu > 0.2 && lu < 1 && Math.random() < dt * 14) steam(IC.x + rand(-0.2, 0.2), 1.3, IC.z + rand(-0.2, 0.2));
  }

  /* ── люди: болтают, замечают машину, ловят коробку ── */
  const carTarget = t >= T.notice && t < T.land - 0.3;
  const hold = t >= T.land - 0.35;
  for (const c of IS.cast) {
    c.ph += dt;
    const u = c.g.userData;
    // расступаются подковой и шагают внутрь, чтобы руки дотянулись до коробки
    const k = smooth(seg(t, T.land - 0.9, T.land));
    const r = lerp(R_TALK, R_HOLD, k), a = lerp(c.a, c.ha, k);
    c.x = IC.x + Math.sin(a) * r; c.z = IC.z + Math.cos(a) * r;
    c.g.position.x = c.x; c.g.position.z = c.z;
    c.face = Math.atan2(IC.x - c.x, IC.z - c.z);
    let want = c.face;
    if (carTarget) want = Math.atan2(V.x - c.x, V.z - c.z);
    const dh = Math.atan2(Math.sin(want - c.h), Math.cos(want - c.h));
    c.h += dh * (1 - Math.exp(-6 * dt));
    c.g.rotation.y = c.h + (hold || carTarget ? 0 : Math.sin(c.ph * 1.3) * 0.12);
    c.g.position.y = 0.22 + (carTarget ? Math.abs(Math.sin(c.ph * 9)) * 0.12 : 0);
    u.head.rotation.y = hold ? 0 : Math.sin(c.ph * 0.9 + c.talk) * 0.25;
    u.head.rotation.x = hold ? 0.28 : Math.sin(c.ph * 2.3) * 0.05;
    let aL = 0, aR = 0, zL = 0, zR = 0;
    if (hold) { aL = aR = -1.25; zL = -0.25; zR = 0.25; }
    else if (carTarget) { aR = -2.6 + Math.sin(c.ph * 14) * 0.35; zR = 0.3; }          // машут
    else if (Math.sin(c.ph * 0.8 + c.talk) > 0.55) aR = -0.7 + Math.sin(c.ph * 6) * 0.25; // жестикулируют
    u.armL.rotation.x = damp(u.armL.rotation.x, aL, 9, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, aR, 9, dt);
    u.armL.rotation.z = damp(u.armL.rotation.z, zL, 9, dt);
    u.armR.rotation.z = damp(u.armR.rotation.z, zR, 9, dt);
  }

  /* ── камера ── */
  const aspect = cam.aspect;
  if (t < T.drive) {
    // A: медленный облёт кружка, над головами имена
    // A: камера внутри кружка из-за плеч — лица видно только у тех, кто
    // стоит к ней. Два плана: сначала Оля с Жанной (они с +X), потом
    // Андрей с Ваней (с −X). На узком экране двое в кадр не лезут —
    // тогда камера ведёт от одного к другому.
    const second = t >= T.cut;
    const u = second ? seg(t, T.cut, T.drive) : seg(t, 0, T.cut);
    const sg = second ? -1 : 1;
    const [p1, p2] = IS.cast.filter(c => Math.sign(c.x - IC.x) === sg).sort((a, b) => b.z - a.z);
    const k = clamp((1.5 - cam.aspect) / 0.9, 0, 1) * 0.9;
    const mx = (p1.x + p2.x) / 2, mz = (p1.z + p2.z) / 2;
    const w = lerp(k, -k, smooth(u));
    const tall = clamp(1 - cam.aspect, 0, 0.6);    // на телефоне шире угол и дальше камера
    introFov(64 + tall * 30);
    cam.position.set(IC.x - sg * (lerp(1.0, 1.35, u) + tall * 0.9), lerp(2.05, 2.15, u) + tall * 0.3, IC.z + Math.sin(t * 0.7) * 0.05);
    cam.lookAt(mx + (p1.x - mx) * w, 1.3, mz + (p1.z - mz) * w);
  } else if (t < T.shotC) {
    introFov(64);
    // B: за машиной, чуть левее и выше — кружок справа по курсу
    const hx = Math.sin(V.h), hz = Math.cos(V.h);
    const back = lerp(10, 8, seg(t, T.drive, T.shotC));
    cam.position.set(V.x - hx * back - hz * 1.5, 3.4, V.z - hz * back + hx * 1.5);
    cam.lookAt(V.x + hx * 8, 1.4, V.z + hz * 8 - 2.2);
  } else {
    // C → D: из-за машины со стороны улицы — ребята развернулись к ней
    // лицом, коробка летит от нас к ним. Потом наезд на коробку, и в конце
    // изнанка крышки во весь кадр.
    const u = smooth(seg(t, T.shotD, T.lid + 0.6));
    const need = Math.max(1.4, 1.05 / (1.25 * Math.min(1, aspect)));
    const drift = seg(t, T.shotC, T.shotD) * 0.6;
    const breathe = Math.sin(t * 0.8) * 0.03;
    cam.position.set(
      lerp(IC.x - 3.2 + drift, IC.x + breathe, u),
      lerp(1.5, 1.1 + 0.62 * need, u),
      lerp(IC.z + 8.4 - drift, IC.z + need * 0.95, u));
    // снизу — чтобы оранжевая коробка летела по небу, а не по вывеске пиццерии
    tmpV.set(lerp(IC.x + 0.4, IC.x, u), lerp(2.3, 1.08 + 0.1 * need, u), lerp(IC.z + 0.6, IC.z - 0.3, u));
    cam.lookAt(tmpV);
  }

  /* ── имена над головами на первом плане ── */
  const W = canvas.clientWidth, H = canvas.clientHeight;
  for (let k = 0; k < IS.cast.length; k++) {
    const c = IS.cast[k];
    // имя горит, пока лицо смотрит в камеру
    const facing = Math.sin(c.h) * (cam.position.x - c.x) + Math.cos(c.h) * (cam.position.z - c.z);
    const on = t > 0.3 && t < T.drive - 0.15 && facing > 1.2;
    c.tag.classList.toggle('on', on);
    if (!on) continue;
    tmpV.set(c.x, 2.08, c.z).project(cam);
    c.tag.style.left = ((tmpV.x + 1) / 2 * W) + 'px';
    c.tag.style.top = ((1 - tmpV.y) / 2 * H) + 'px';
  }

  if (t >= T.end && !IS.done) {
    IS.done = true;
    $('intro').classList.add('end');
    $('in-end').hidden = false;
    introPost('end');
  }
}

/* ─────────────── сборка мира ─────────────── */
buildGround();
buildBlocks();
buildLights();
scene.add(new THREE.Mesh(mergeGeos(LIT),
  new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
scene.add(new THREE.Mesh(mergeGeos(FLAT),
  new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
// припаркованные живут в общем списке машин: их так же мнёт, кидает и взрывает
for (const [px, pz, ry] of PARKED) {
  const t = {
    mesh: makeCar(pick(['#9aa6b8', '#c8b49a', '#8fa88f', '#b89aa8', '#d0c8b0']), false),
    parked: true, from: 0, to: NODES[0].nb[0], p: 0, cruise: 0, speed: 0,
    x: px, z: pz, h: ry, wheel: 0, hp: 100, wreck: 0, wreckT: 0, hitT: 0,
    knock: 0, kvx: 0, kvy: 0, kvz: 0, spin: 0, y: 0, roll: 0, smokeT: 0,
    rejoin: 0, jx: 0, jz: 0, jh: 0,
  };
  t.mesh.position.set(px, 0, pz);
  t.mesh.rotation.y = ry;
  scene.add(t.mesh);
  TRAFFIC.push(t);
}
// кружок вступления — сплошной: прохожие его обходят, а не пролезают насквозь
if (INTRO) solid(IC.x - 1.6, IC.z - 1.6, IC.x + 1.6, IC.z + 1.6);
indexSolids();
spawnTraffic(42);
initPeds();
initPeople();

V.x = PIZZA.x - 6; V.z = 30 - LANE; V.h = -Math.PI / 2;
V.camX = V.x + 14; V.camZ = V.z + 14; V.camY = 6;
hudHearts();
resize();
if (INTRO) introSetup();
else {
  showBig('доставка',
    'заказы назначает умный трекер<br>вези пиццу живым коллегам и не задави их',
    'впиши имя — и пробел, энтер или тап<br>← → руль &nbsp; ↑ газ &nbsp; ↓ тормоз &nbsp; пробел — ручник');
  lbMode('title');
  LB.load().then(() => { if (S.state === 'title') LB.render(0); }).catch(() => {});
  LB.render(0);
  if (!S.name && matchMedia('(pointer: fine)').matches) $('lb-name').focus();
}

/* ─────────────── цикл ─────────────── */
let last = performance.now(), tG = 0;

function frame (now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  const dt = Math.min(raw, 1 / 20);
  last = now;
  if (S.paused) return;
  tG += dt;

  let vf = 0;
  if (S.state === 'intro') {
    introStep(Math.min(raw, 0.1));               // кино идёт по часам, даже если кадров мало
  } else if (S.state === 'dying') {
    for (const k in IN) IN[k] = 0;              // руль из рук выпал, машина катится сама
    vf = driveStep(dt);
    deathTick(dt);
  } else if (S.state === 'brief' || S.state === 'loading') {
    touches.clear();
    for (const k in IN) IN[k] = 0;              // руль заблокирован до загрузки
    vf = driveStep(dt);
    camStep(dt, vf);
  } else if (S.state === 'title' || S.state === 'over') {
    // на заставке камера сама облетает пиццерию — город сразу видно живым
    const a = tG * 0.16;
    cam.position.set(PIZZA.x + Math.sin(a) * 52, 25 + Math.sin(a * 0.7) * 3, PIZZA.z - 13 + Math.cos(a) * 52);
    cam.lookAt(PIZZA.x, 5, PIZZA.z - 13);
    car.position.set(V.x, 0, V.z);
    car.rotation.y = V.h;
  } else {
    vf = driveStep(dt);
    camStep(dt, vf);
  }

  updateLights(dt);
  updateProps(dt);
  updateTraffic(dt);
  updatePeds(dt);
  updatePeople(dt);
  separateWalkers(dt);
  updateGibs(dt);
  updateGore(dt);
  updateFly(dt);
  updateFX(dt);
  S.hurt = Math.max(0, S.hurt - dt);

  if (S.state === 'drive') syncTarget();          // цель идёт по улице сама
  if (S.state === 'drive' || S.state === 'back') {
    S.time -= dt;
    if (S.time < 6) { S.tickT += dt; if (S.tickT > 0.4) { S.tickT = 0; Snd.tick(); } }
    if (S.time < -GRACE) gameOver('не успел', [], { x: V.x, z: V.z });
    checkArrival(dt);
    S.routeT += dt;
    if (S.routeT > 0.35) { S.routeT = 0; rebuildRoutePath(); }
  } else if (S.state === 'handover') {
    S.handT -= dt;
    if (S.handT <= 0) {
      if (!S.order) newOrder();
      else backToBase();
    }
  }

  // маркер адреса: пульсирует и крутится, его видно издалека
  if (S.target && S.state !== 'title' && S.state !== 'over') {
    marker.visible = true;
    marker.position.set(S.target.x, 0, S.target.z);
    marker.rotation.y = tG * 1.2;
    marker.userData.ball.position.y = 6.6 + Math.sin(tG * 3) * 0.45;
    const p = 1 + Math.sin(tG * 3.4) * 0.12;
    marker.userData.ring.scale.set(p, p, p);
  } else marker.visible = false;

  drawRadar();
  hudStep(dt);

  // машину потряхивает после удара
  car.position.y = S.hurt > 0 ? Math.sin(tG * 60) * 0.06 : 0;
  if (S.hp <= 2 && S.state !== 'title' && S.state !== 'over') {
    S.smokeT = (S.smokeT || 0) - dt;
    if (S.smokeT <= 0) {
      S.smokeT = S.hp <= 1 ? 0.12 : 0.3;
      puff(V.x + Math.sin(V.h) * 1.9, 1.2, V.z + Math.cos(V.h) * 1.9, S.hp <= 1, rand(0.5, 0.9));
      if (S.hp <= 1 && chance(0.35)) fire(V.x + Math.sin(V.h) * 1.9, 1.1, V.z + Math.cos(V.h) * 1.9);
    }
  }

  renderer.render(scene, cam);
}
requestAnimationFrame(frame);

/* отладочная ручка */
window.__dlv = { S, V, IS, TRAFFIC, PEDS, PEOPLE, PIZZA, NODES, BENCHES, PROPS, SOLIDS, RINGS, YARD_RINGS, PARKINGS, LB, car, newOrder, acceptOrder, gameOver, dentCar, boom, sparks, blood, runOver, wreckCar, knockCar, setGate, clearGate };
