/* ──────────────────────────────────────────────────────────────────────────
   Доставка — Москва (lab/delivery/?map=moscow).

   Вторая карта той же игры: вместо выдуманной сетки — настоящий район
   вокруг Омега-Плазы на Ленинской Слободе, 19, где и стоит пиццерия.
   Улицы, дома с адресами, подъезды, деревья, лавочки, остановки,
   светофоры, переходы и Москва-река взяты из OpenStreetMap, рельеф — из
   SRTM (moscow-city.js, собирает scripts/osm_moscow.py).

   Движок — из заготовки lab/tomsk (город из карты, рельеф, мост, нитро),
   а он, в свою очередь, из основной «Доставки». Своё у Москвы: трафик
   едет по полосам с учётом одностороннего движения и поворачивает
   дугой, на перекрёстках светофоры с фазами, на улицах разметка и зебры,
   пешеходы ходят по тротуарам и переходят только по зебре, по городу
   гоняют таксисты и самокатчики, машины разных моделей, а радар по
   клику раскрывается в полную карту района.
   ────────────────────────────────────────────────────────────────────────── */

import * as THREE from '../vendor/three.module.min.js';
import { MAP } from './map.js';
import { MAP_IDS, MAP_META } from '../maps/index.js';
import Platform from '../platform/index.js';
import { t as $t, tn as $tn, N_, translit, lang as curLang, LANGS, LANG_NAMES } from '../i18n/index.js';
import { sanitizePois, OWN } from './brands.js';
import { makePerson, createHumanFactory, faceDataURL } from './people.js';
import { pollPad, applyToIN, rumble, pad as PAD } from '../input/gamepad.js';
import { makePadMenu } from '../input/padmenu.js';
import { fixMap, profileFn } from './mapcheck.js';
import * as MAPW from './mapworks.js';
import * as CBITS from './citybits.js';
import * as SEAS from './seasons.js';
import * as LIFE from './life.js';               // парочки, богачи, графитисты, змеи и дроны в парках
import * as RL from './roadlife.js';
import * as PZ from './pizzeria.js';
import * as LM from './landmarks.js';            // заправки и каток
import * as ECON from './econ.js';               // карьера: все числа и формулы (docs/CAREER.md)
import * as DLG from './dialog.js';              // диалог с головой и печатающимся текстом
import * as ZN from './zones.js';                // районы города для заказов и событий
import * as CULL from './cull.js';               // статика дальше камеры — со сцены, матрицы заморожены (Steam Deck)

/* Сохранения — через площадку (облако Яндекса / localStorage). Значения
   хранятся как есть: числа, строки, массивы. */
const Store = {
  get: (k, d) => { const v = Platform.store.get(k); return v === undefined || v === null ? d : v; },
  set: (k, v) => Platform.store.set(k, v),
};
/* Две версии игры. Детская (12+) — Яндекс, всегда: без крови, алкоголя,
   табака и бит. Взрослая (18+) — Стим по умолчанию: кровь и куски тел,
   пиво и водка в поручениях, курилка у пиццерии, пьющие компании ночью,
   биты в кофейной войне, «взрослые» находки. В Стиме версия переключается
   в настройках (dlv-edition), ?kids — детская для проверки. */
const ADULT = !!Platform.features.adult && Store.get('dlv-edition', 'adult') !== 'kids' && !new URLSearchParams(location.search).has('kids');
const GORE_ON = ADULT;
/* Карьера (Стим и dev): смена 9—24, экономика, машины, донаты. Только на карте,
   у которой есть MAP.career (Северск); на Яндексе — прежняя игра. ?nocareer — выключить */
const CAREER = Platform.id !== 'yandex' && !!MAP.career && !new URLSearchParams(location.search).has('nocareer');
/* прогресс доната на цель города: 0…1 (econ.js DONATE) */
const donated = k => clamp((+Store.get('dlv-don-' + k, 0) || 0) / ((ECON.DONATE[k] && ECON.DONATE[k].goal) || 1), 0, 1);
const NUMF = new Intl.NumberFormat(curLang() === 'zh' ? 'zh-CN' : curLang());
const money = n => NUMF.format(Math.round(n || 0)) + ' ₽';
/* винительный падеж имени — только в русском, в других языках имя как есть */
const accName = p => (p ? (curLang() === 'ru' && p.acc) || p.name : '');

/* ─────────────── мелочь ─────────────── */
const $ = id => document.getElementById(id);
/* ?intro — вместо игры катсцена-вступление к выпуску (см. раздел «вступление») */
const INTRO = false;               // катсцена дайджеста вырезана; флаг держим, чтобы не трогать проверки
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const lerp = (a, b, t) => a + (b - a) * t;

/* ─────────────── звук: синтез, файлов нет ─────────────── */
const Snd = {
  // ?mute — без звука: для автопроверок в браузере, чтобы не шуметь рядом
  on: !new URLSearchParams(location.search).has('mute') && String(Store.get('dlv-sound', '1')) !== '0', ctx: null, eng: null, engG: null, filt: null,
  muted: false,                  // площадка заглушила: реклама, свёрнутая вкладка
  boot () {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.on = false; return; }
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.on ? 0.45 : 0;
    this.master.connect(c.destination);
    // Мотор из трёх голосов: пила — основной тон, квадрат октавой ниже —
    // бас, и пульсация цилиндров: громкость дрожит с частотой вспышек.
    // Всё через фильтр, который под газом открывается — звук плотнее.
    this.eng = c.createOscillator(); this.eng.type = 'sawtooth';
    this.sub = c.createOscillator(); this.sub.type = 'square';
    this.filt = c.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 500; this.filt.Q.value = 3;
    this.subG = c.createGain(); this.subG.gain.value = 0.45;
    this.puls = c.createGain(); this.puls.gain.value = 0.7;
    this.lfo = c.createOscillator(); this.lfo.type = 'sine';
    this.lfoG = c.createGain(); this.lfoG.gain.value = 0.3;
    this.lfo.connect(this.lfoG); this.lfoG.connect(this.puls.gain);
    this.engG = c.createGain(); this.engG.gain.value = 0;
    this.eng.connect(this.filt); this.sub.connect(this.subG); this.subG.connect(this.filt);
    this.filt.connect(this.puls); this.puls.connect(this.engG); this.engG.connect(this.master);
    for (const o of [this.eng, this.sub, this.lfo]) o.start();
    this.gear = 1;
  },
  resume () { if (this.ctx && this.ctx.state === 'suspended' && !this.muted) this.ctx.resume(); },
  /* пауза от площадки: весь звук стоп, выбор игрока (on) не трогаем */
  mute (m) {
    this.muted = m;
    if (!this.ctx) return;
    if (m) this.ctx.suspend(); else this.ctx.resume();
  },
  /* Вкл/выкл — общим регулятором, через который идут все звуки: так звук
     гарантированно возвращается, что бы ни было запланировано в моторе */
  set (on) {
    this.on = on;
    this.boot(); this.resume();
    if (this.master) {
      const g = this.master.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(on ? 0.45 : 0, now + 0.05);
    }
    const b = document.getElementById('sfx');
    if (b) b.textContent = on ? $t('звук вкл') : $t('звук выкл');
    Store.set('dlv-sound', on ? '1' : '0');
  },
  /* Шесть передач: внутри передачи обороты растут со скоростью, на
     переключении падают, и слышен короткий провал — как у настоящей
     коробки. Громкость в разы тише прежней: мотор фоном, а не в ухо. */
  GEARS: [0, 6, 12, 19, 27, 36, 46, 62],
  engine (v, load) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime, sp = Math.abs(v);
    let g = 1;
    while (g < this.GEARS.length - 2 && sp > this.GEARS[g]) g++;
    const lo = this.GEARS[g - 1], hi = this.GEARS[g];
    const rpm = clamp((sp - lo) / (hi - lo), 0, 1);
    if (g !== this.gear) {
      // переключение: обороты проваливаются, короткий глухой щелчок
      if (g > this.gear && this.on && sp > 3) {
        this.engG.gain.cancelScheduledValues(now);
        this.engG.gain.setTargetAtTime(0.004, now, 0.02);
        this.blip(70 + g * 6, 0.07, 'triangle', 0.03);
      }
      this.gear = g;
    }
    const f = 38 + rpm * 78 + g * 5;
    this.eng.frequency.setTargetAtTime(f, now, 0.05);
    this.sub.frequency.setTargetAtTime(f / 2 + 0.7, now, 0.05);
    this.lfo.frequency.setTargetAtTime(f / 4, now, 0.05);           // вспышки в цилиндрах
    const push = load ? 1 : 0.55;
    this.filt.frequency.setTargetAtTime(260 + rpm * 900 * push + g * 60, now, 0.08);
    // на стоящей машине глушим совсем: ровный гул раздражал
    const idle = clamp((sp - 0.6) / 2.5, 0, 1);
    this.engG.gain.setTargetAtTime(this.on ? idle * (0.012 + rpm * 0.018 * push + g * 0.0015) : 0, now + 0.06, 0.1);
  },
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
  nosPick () { [660, 990, 1320, 1760].forEach((f, i) => setTimeout(() => this.blip(f, 0.09, 'square', 0.1), i * 45)); },
  nosFire () { this.noise(0.6, 0.32); this.blip(160, 0.4, 'sawtooth', 0.12); },
};

/* ─────────────── рендер: маленький кадр, растянутый на экран ───────────────
   Ровно этим Hamster Rescue и берёт — крупный пиксель вместо сглаживания. */

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
/* Размер «пикселя» игры в пикселях экрана. Раньше делили CSS-пиксели на
   два: на телефоне это 195 точек в ширину — каша. Теперь по короткой
   стороне в физических пикселях: примерно 540 точек, как на ноутбуке с
   1080 по высоте, — пиксель одного размера и на телефоне, и на десктопе. */
const PIXEL_SHORT = 540;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8daf4);
scene.fog = new THREE.Fog(0xd8edfa, 150, 470);   // дальше тумана не рисуем: кадр дороже, чем вид

const cam = new THREE.PerspectiveCamera(64, 1, 0.4, 490);

scene.add(new THREE.HemisphereLight(0xeaf7ff, 0xb6c8a6, 1.7));
const sun = new THREE.DirectionalLight(0xfff6e4, 1.45);
sun.position.set(120, 180, 90);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xdfeaff, 0.5));

function resize () {
  const w = canvas.clientWidth || 640, h = canvas.clientHeight || 360;
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(1, Math.min(w, h) * dpr / PIXEL_SHORT);
  renderer.setPixelRatio(1);
  renderer.setSize(Math.max(200, Math.round(w * dpr / px)), Math.max(112, Math.round(h * dpr / px)), false);
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

/* ─────────────── план города: настоящая Москва ───────────────
   Город не выдуман. Геометрия приезжает из moscow-city.js — выгрузка
   OpenStreetMap и SRTM вокруг Омега-Плазы: Ленинская Слобода,
   Автозаводская улица, Кожуховские проезды, метро «Автозаводская» и
   Москва-река с набережными, километр сто шестьдесят на девятьсот
   шестьдесят метров. Метры настоящие, город не сжат. Выдуман только
   Омега-мост через реку: настоящего в рамке нет. x на восток, z на юг. */

const CITY = MAP.data;
sanitizePois(CITY.pois);                       // чужие вывески → пародии и выдуманные (brands.js)
/* ТЦ: подсказки стиля из генератора карты (malls[].style) — на сам дом */
for (const m of CITY.malls || []) {
  const b = CITY.buildings.find(q => q.id === m.id);
  if (b && m.style) b.style = { stripe: m.style.stripe, sign: m.style.stripe, glass: m.style.glass };
}
/* Во вступлении камера не отходит от Омеги дальше пары сотен метров —
   город строим только вокруг неё: сборка в разы короче, кино стартует быстрее. */
const CW = CITY.meta.size[0], CD = CITY.meta.size[1];
const BOUNDS = { x0: -CW / 2 + 12, x1: CW / 2 - 12, z0: -CD / 2 + 12, z1: CD / 2 - 12 };
/* Край карты — многоугольник, если он у карты есть (Северск: по забору
   закрытого города), иначе прямоугольник. Многоугольник растрим на сетку
   в 8 м один раз — проверка «внутри ли» дальше стоит одного обращения. */
const BORDER = MAP.border || CITY.border || null;
const BMASK = (() => {
  if (!BORDER) return null;
  const C = 8, x0 = BOUNDS.x0 - 12, z0 = BOUNDS.z0 - 12;
  const nx = Math.ceil((BOUNDS.x1 - BOUNDS.x0 + 24) / C) + 1, nz = Math.ceil((BOUNDS.z1 - BOUNDS.z0 + 24) / C) + 1;
  const a = new Uint8Array(nx * nz), n = BORDER.length;
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * C, xs = [];
    for (let i = 0, k = n - 1; i < n; k = i++) {
      const [xi, zi] = BORDER[i], [xk, zk] = BORDER[k];
      if ((zi > z) !== (zk > z)) xs.push(xi + (z - zi) / (zk - zi) * (xk - xi));
    }
    xs.sort((p, q) => p - q);
    for (let s = 0; s + 1 < xs.length; s += 2)
      for (let i = Math.max(0, Math.ceil((xs[s] - x0) / C)); i <= Math.min(nx - 1, Math.floor((xs[s + 1] - x0) / C)); i++) a[j * nx + i] = 1;
  }
  return { C, x0, z0, nx, nz, a };
})();
const inBorder = (x, z) => {
  if (!BMASK) return true;
  const i = Math.round((x - BMASK.x0) / BMASK.C), j = Math.round((z - BMASK.z0) / BMASK.C);
  return i >= 0 && j >= 0 && i < BMASK.nx && j < BMASK.nz && BMASK.a[j * BMASK.nx + i] === 1;
};
/* точка далеко за границей: ни одна из восьми точек в 240 м вокруг не внутри */
const farOut = (x, z) => {
  if (!BMASK || inBorder(x, z)) return false;
  for (let a = 0; a < 8; a++) if (inBorder(x + Math.cos(a * 0.785) * 240, z + Math.sin(a * 0.785) * 240)) return false;
  return true;
};
const inBorderM = (x, z, m) => inBorder(x, z) && (m <= 0 || (inBorder(x + m, z) && inBorder(x - m, z) && inBorder(x, z + m) && inBorder(x, z - m)));
const LANE = 3.2;                              // смещение от осевой до центра полосы (запасное)

/* ширина полотна по классу: трасса, главная, вторая, третья,
   улица, тихая, пешеходка, проезд во двор */
const ROAD_W = [20, 16, 13.5, 11, 9, 7, 5, 5.5];
const ROAD_HEX = ['#9aa0ab', '#9aa0ab', '#9ea4af', '#a2a8b2', '#a4aab4', '#a7adb6', '#cdc6bb', '#aab0b8'];
const DRIVE_MAX = 5;                           // выше по классу — пешеходка, туда не едем
/* ширину полотна считает выгрузка: по числу полос из карты, а во дворах
   ещё и сужает, чтобы асфальт не залезал в стены */
const roadWidth = r => r.w || ROAD_W[r.c];
/* r.x — улица не связана с остальной сетью (обрывок за рамкой): рисуем, но не ездим */
const drivable = r => !r.x && r.c !== 6;

/* ── рельеф ──
   Москва тут плоская, но не везде: от Ленинской Слободы к реке берег
   спускается метров на пятнадцать-двадцать, а набережная лежит у самой
   воды. Высоты сняты с SRTM на сетку в двенадцать метров и лежат в
   moscow-city.js; ноль — урез Москвы-реки, всё, что ниже, — вода.

   Каждая клетка сетки режется диагональю на два плоских треугольника,
   и высота в точке считается ровно так же, как нарисована земля. Всё
   плоское — дороги, газоны, разметка — режется по этим же треугольникам
   (см. Mesher.dtri), поэтому ложится на склон без щелей и не тонет. */
const TER = CITY.terrain;
const TG = TER.g, TNX = TER.nx, TNZ = TER.nz, TX0 = TER.x0, TZ0 = TER.z0;
const TH = (() => {
  const bin = atob(TER.h), a = new Float32Array(TNX * TNZ);
  for (let i = 0; i < a.length; i++)
    a[i] = ((bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) - 1000) / 10;
  return a;
})();
/* Проверка и починка карты (mapcheck.js): до всего, что строится из улиц и
   рельефа, — сшить обрывы, выровнять рельеф под дорогами, поднять мосты
   над улицами и решить, чем закрыть тупики. ?nomapfix — как в выгрузке,
   ?mapcheck — сводка проблем в консоли и столбики над ними. */
const MAPCHECK = new URLSearchParams(location.search).has('mapcheck');
const MAPFIX = new URLSearchParams(location.search).has('nomapfix') ? null : fixMap(CITY, TH, { before: MAPCHECK });

function groundH (x, z) {
  const u = (x - TX0) / TG, v = (z - TZ0) / TG;
  let i = Math.floor(u), j = Math.floor(v);
  if (i < 0) i = 0; else if (i > TNX - 2) i = TNX - 2;
  if (j < 0) j = 0; else if (j > TNZ - 2) j = TNZ - 2;
  const fu = u - i, fv = v - j, k = j * TNX + i;
  if (fu + fv <= 1) return TH[k] + (TH[k + 1] - TH[k]) * fu + (TH[k + TNX] - TH[k]) * fv;
  const h11 = TH[k + TNX + 1];
  return h11 + (TH[k + TNX] - h11) * (1 - fu) + (TH[k + 1] - h11) * (1 - fv);
}

/* нормаль склона — чтобы пятно крови легло на склон, а не воткнулось в него */
const TNORM = new THREE.Vector3();
function groundNormal (x, z) {
  const e = 1.5;
  TNORM.set(groundH(x - e, z) - groundH(x + e, z), 2 * e, groundH(x, z - e) - groundH(x, z + e));
  return TNORM.normalize();
}

/* ── мосты ──
   Под Омега-мостом река, поэтому по рельефу его не положишь.
   Настил идёт от берега до берега по прямой с лёгким горбом посередине,
   а машина на мосту стоит на настиле, а не на дне реки. */
const BRIDGES = [];
for (const r of CITY.roads) {
  if (!r.b) continue;
  const p = r.p, w = roadWidth(r);
  const acc = [0];
  for (let i = 1; i < p.length; i++) acc.push(acc[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = acc[acc.length - 1] || 1;
  const h0 = groundH(p[0][0], p[0][1]), h1 = groundH(p[p.length - 1][0], p[p.length - 1][1]);
  const arch = L > 120 ? Math.min(6, L * 0.01) : 0;
  // r.dk — профиль от починки карты: настил поднят над улицами под мостом
  const deck = r.dk ? profileFn(r.dk) : s => lerp(h0, h1, s / L) + arch * Math.sin(Math.PI * clamp(s / L, 0, 1));
  for (let i = 1; i < p.length; i++) {
    const x1 = p[i - 1][0], z1 = p[i - 1][1], x2 = p[i][0], z2 = p[i][1];
    // настил шире полотна: тротуары до самых перил
    const ws = w + (r.c <= 5 ? 5.5 : 2), m = ws / 2 + 2;
    BRIDGES.push({
      x1, z1, x2, z2, s1: acc[i - 1], s2: acc[i], L, w, ws, deck, road: r,
      bx0: Math.min(x1, x2) - m, bx1: Math.max(x1, x2) + m, bz0: Math.min(z1, z2) - m, bz1: Math.max(z1, z2) + m,
    });
  }
}
// у самых концов запас над землёй сходит на нет: иначе на въезде на мост ступенька
const deckAt = (b, t, x, z) => { const s = lerp(b.s1, b.s2, t); return Math.max(b.deck(s), groundH(x, z) + (MAPFIX ? Math.min(0.2, 0.04 * Math.min(s, b.L - s)) : 0.2)); };

/* По чему едет колесо: настил моста или земля. Под мостом у берега
   земля и настил близко, поэтому на настил переходим, только если уже
   ехали примерно на его высоте (prevY) — иначе у опоры машину бы
   выдёргивало наверх. Без prevY — для искр, крови и новых машин —
   мост в приоритете. */
function surfaceAt (x, z, prevY) {
  const h = groundH(x, z);
  for (const b of BRIDGES) {
    if (x < b.bx0 || x > b.bx1 || z < b.bz0 || z > b.bz1) continue;
    const dx = b.x2 - b.x1, dz = b.z2 - b.z1;
    // только между концами: за концом настила — уже земля. С зажатым t
    // вокруг каждого конца торчал круг «настила», и у левого берега
    // машина висела в воздухе над Сенной Курьей
    const t = ((x - b.x1) * dx + (z - b.z1) * dz) / (dx * dx + dz * dz || 1);
    if (t < 0 || t > 1) continue;
    // по ширине настила, а не полотна: иначе между полосой и перилами
    // оказывалась река, и машину отбрасывало посреди моста
    if (Math.hypot(x - b.x1 - dx * t, z - b.z1 - dz * t) > b.ws / 2 + 1) continue;
    const y = deckAt(b, t, x, z);
    if (y - h < 1.8 || prevY === undefined || Math.abs(y - prevY) < 2.5) return y;
  }
  return h;
}
const floorAt = (x, z) => surfaceAt(x, z);

/* ── препятствия ──
   В настоящем городе дом стоит под тем углом, под каким его построили,
   поэтому препятствие — не прямоугольник по осям мира, а повёрнутая
   коробка. Считаем в её собственных осях: это те же четыре сравнения. */
const SOLIDS = [];

function obb (cx, cz, hw, hd, ry) {
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const s = {
    cx, cz, hw, hd, cs, sn,
    ex: Math.abs(cs) * hw + Math.abs(sn) * hd,   // полуразмеры мирового бокса
    ez: Math.abs(sn) * hw + Math.abs(cs) * hd,
  };
  SOLIDS.push(s);
  return s;
}
const solid = (x0, z0, x1, z1) =>
  obb((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0);

/* Стен в городе десятки тысяч, перебирать все на каждый шаг нельзя —
   раскладываем по клеткам тридцать на тридцать метров. */
const SCELL = 30, SOLID_GRID = new Map(), NO_SOLIDS = [];
const scellKey = (x, z) => Math.floor(x / SCELL) + ',' + Math.floor(z / SCELL);

function indexSolids () {
  SOLID_GRID.clear();
  for (const s of SOLIDS)
    for (let i = Math.floor((s.cx - s.ex) / SCELL); i <= Math.floor((s.cx + s.ex) / SCELL); i++)
      for (let j = Math.floor((s.cz - s.ez) / SCELL); j <= Math.floor((s.cz + s.ez) / SCELL); j++) {
        const k = i + ',' + j;
        let a = SOLID_GRID.get(k);
        if (!a) SOLID_GRID.set(k, a = []);
        a.push(s);
      }
}

const solidsNear = (x, z) => SOLID_GRID.get(scellKey(x, z)) || NO_SOLIDS;

/* выталкиваем по меньшему проникновению — человек скользит вдоль стены */
function pushOut (p, r) {
  for (const s of solidsNear(p.x, p.z)) {
    if (s.deckY !== undefined) continue;          // перила моста — не для пешеходов внизу
    const dx = p.x - s.cx, dz = p.z - s.cz;
    const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
    const px = s.hw + r - Math.abs(lx), pz = s.hd + r - Math.abs(lz);
    if (px <= 0 || pz <= 0) continue;
    if (px < pz) { const d = (lx < 0 ? -1 : 1) * px; p.x += d * s.cs; p.z += d * s.sn; }
    else { const d = (lz < 0 ? -1 : 1) * pz; p.x -= d * s.sn; p.z += d * s.cs; }
  }
}

/* ── улицы кусками: по ним ищем ближайшую дорогу ──
   Нужно постоянно: куда развернуть лавочку, с какой стороны у дома
   подъезд, где припарковать чужую машину, что нарисовать на радаре. */
const RSEG = [];
for (const r of CITY.roads) {
  const w = roadWidth(r), p = r.p;
  for (let i = 1; i < p.length; i++)
    RSEG.push({ x1: p[i - 1][0], z1: p[i - 1][1], x2: p[i][0], z2: p[i][1], c: r.c, w, name: r.n, b: r.b || 0, x: r.x || 0 });
}

const RCELL = 64, ROAD_GRID = new Map();
for (let k = 0; k < RSEG.length; k++) {
  const s = RSEG[k];
  const i0 = Math.floor(Math.min(s.x1, s.x2) / RCELL), i1 = Math.floor(Math.max(s.x1, s.x2) / RCELL);
  const j0 = Math.floor(Math.min(s.z1, s.z2) / RCELL), j1 = Math.floor(Math.max(s.z1, s.z2) / RCELL);
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const key = i + ',' + j;
      let a = ROAD_GRID.get(key);
      if (!a) ROAD_GRID.set(key, a = []);
      a.push(k);
    }
}

/* ближайшая точка на дороге: расстояние, сама точка и направление улицы */
function nearestRoad (x, z, maxCls = DRIVE_MAX, rings = 2) {
  const ci = Math.floor(x / RCELL), cj = Math.floor(z / RCELL);
  let best = null, bd = Infinity;
  for (let i = ci - rings; i <= ci + rings; i++)
    for (let j = cj - rings; j <= cj + rings; j++) {
      const a = ROAD_GRID.get(i + ',' + j);
      if (!a) continue;
      for (const k of a) {
        const s = RSEG[k];
        if (s.c > maxCls || (s.x && maxCls <= DRIVE_MAX)) continue;
        const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
        const l2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - s.x1) * dx + (z - s.z1) * dz) / l2, 0, 1);
        const px = s.x1 + dx * t, pz = s.z1 + dz * t;
        const d = Math.hypot(x - px, z - pz);
        if (d < bd) { bd = d; best = { d, x: px, z: pz, seg: s, t }; }
      }
    }
  return best;
}

/* ─────────────── быстрая сборка статики ───────────────
   Домов больше полутора тысяч, кусков дорог — тысячи. Заводить на каждую
   плоскость объект three.js слишком дорого, поэтому пишем вершины прямо
   в типизированные массивы и отдаём один меш на весь город. */

/* Вершина — только позиция и цвет байтами: нормали не храним, склейки
   рисуются плоским затенением (flatShading), и нормаль грани шейдер считает
   сам. Так статика Северска (4 млн треугольников) весит втрое меньше. */
function Mesher () {
  let cap = 1 << 14, n = 0;
  let pos = new Float32Array(cap * 3), col = new Uint8Array(cap * 3);
  const C = new THREE.Color();
  let cr = 0, cg = 0, cb = 0;

  function room (add) {
    if (n + add <= cap) return;
    while (n + add > cap) cap *= 2;
    const p2 = new Float32Array(cap * 3), c2 = new Uint8Array(cap * 3);
    p2.set(pos); c2.set(col);
    pos = p2; col = c2;
  }

  function vert (x, y, z) {
    const i = n * 3;
    pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
    col[i] = cr; col[i + 1] = cg; col[i + 2] = cb;
    n++;
  }

  /* кусок многоугольника по одну сторону прямой a·x + b·z = c (Сазерленд — Ходжмен) */
  function clipHalf (P, a, b, c) {
    const out = [];
    for (let i = 0, n = P.length; i < n; i++) {
      const p = P[i], q = P[(i + 1) % n];
      const dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c;
      if (dp <= 0) out.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  }
  function fan (P, lift) {
    for (let k = 1; k < P.length - 1; k++) {
      const a = P[0], b = P[k], c = P[k + 1];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-4) continue;
      api.tri(a[0], groundH(a[0], a[1]) + lift, a[1], b[0], groundH(b[0], b[1]) + lift, b[1],
              c[0], groundH(c[0], c[1]) + lift, c[1], 0, 1, 0);
    }
  }

  const V2 = [];
  const api = {
    color (hex) { C.set(hex); cr = Math.round(C.r * 255); cg = Math.round(C.g * 255); cb = Math.round(C.b * 255); return api; },
    tri (ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) {
      room(3);
      vert(ax, ay, az, nx, ny, nz); vert(bx, by, bz, nx, ny, nz); vert(cx, cy, cz, nx, ny, nz);
    },
    quad (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz) {
      api.tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz);
      api.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, nx, ny, nz);
    },
    /* Горизонтальный треугольник лицом вверх. Обход — по часовой в осях
       x/z: при плоской заливке свет считается по обходу, и при обратном
       порядке земля оказывается освещена снизу. Порядок чиним сами. */
    up (ax, ay, az, bx, by, bz, cx, cy, cz) {
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) api.tri(ax, ay, az, cx, cy, cz, bx, by, bz, 0, 1, 0);
      else api.tri(ax, ay, az, bx, by, bz, cx, cy, cz, 0, 1, 0);
    },
    /* Треугольник, положенный на рельеф на высоте lift над землёй.
       Режем его по клеткам сетки и по их диагоналям: каждый кусок лежит
       в одной плоскости с землёй под ним, поэтому ни щелей, ни провалов. */
    dtri (ax, az, bx, bz, cx, cz, lift) {
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) {
        let t = bx; bx = cx; cx = t; t = bz; bz = cz; cz = t;
      }
      const cl = (v, n) => (v < 0 ? 0 : v > n ? n : v);
      const i0 = cl(Math.floor((Math.min(ax, bx, cx) - TX0) / TG), TNX - 2);
      const i1 = cl(Math.floor((Math.max(ax, bx, cx) - TX0) / TG), TNX - 2);
      const j0 = cl(Math.floor((Math.min(az, bz, cz) - TZ0) / TG), TNZ - 2);
      const j1 = cl(Math.floor((Math.max(az, bz, cz) - TZ0) / TG), TNZ - 2);
      if (i0 === i1 && j0 === j1) {
        // целиком в одной половинке клетки — резать нечего
        const s = TX0 + i0 * TG + TZ0 + j0 * TG + TG;
        const sa = ax + az - s, sb = bx + bz - s, sc = cx + cz - s;
        if ((sa <= 0 && sb <= 0 && sc <= 0) || (sa >= 0 && sb >= 0 && sc >= 0)) {
          api.tri(ax, groundH(ax, az) + lift, az, bx, groundH(bx, bz) + lift, bz,
                  cx, groundH(cx, cz) + lift, cz, 0, 1, 0);
          return;
        }
      }
      const T = [[ax, az], [bx, bz], [cx, cz]];
      for (let i = i0; i <= i1; i++) {
        const sx = TX0 + i * TG;
        const Px = clipHalf(clipHalf(T, -1, 0, -sx), 1, 0, sx + TG);
        if (Px.length < 3) continue;
        for (let j = j0; j <= j1; j++) {
          const sz = TZ0 + j * TG;
          const P = clipHalf(clipHalf(Px, 0, -1, -sz), 0, 1, sz + TG);
          if (P.length < 3) continue;
          fan(clipHalf(P, 1, 1, sx + sz + TG), lift);
          fan(clipHalf(P, -1, -1, -(sx + sz + TG)), lift);
        }
      }
    },
    /* прямоугольник по осям мира на рельефе */
    rect (x0, z0, x1, z1, lift) {
      api.dtri(x0, z1, x1, z1, x1, z0, lift);
      api.dtri(x0, z1, x1, z0, x0, z0, lift);
    },
    /* лента между двумя точками на рельефе: полотно, тротуар, дорожка */
    ribbon (x1, z1, x2, z2, w, lift) {
      const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz);
      if (l < 0.01) return;
      const nx = -dz / l * w / 2, nz = dx / l * w / 2;
      api.dtri(x1 + nx, z1 + nz, x2 + nx, z2 + nz, x2 - nx, z2 - nz, lift);
      api.dtri(x1 + nx, z1 + nz, x2 - nx, z2 - nz, x1 - nx, z1 - nz, lift);
    },
    /* лента с заданной высотой на концах — настил моста */
    ribbon3 (x1, y1, z1, x2, y2, z2, w) {
      const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz);
      if (l < 0.01) return;
      const nx = -dz / l * w / 2, nz = dx / l * w / 2;
      api.up(x1 + nx, y1, z1 + nz, x2 + nx, y2, z2 + nz, x2 - nx, y2, z2 - nz);
      api.up(x1 + nx, y1, z1 + nz, x2 - nx, y2, z2 - nz, x1 - nx, y1, z1 - nz);
    },
    /* пятно на изломе: без него поворот улицы рвётся */
    disc (x, z, r, lift, seg = 7) {
      for (let i = 0; i < seg; i++) {
        const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
        api.dtri(x, z, x + Math.cos(b) * r, z + Math.sin(b) * r, x + Math.cos(a) * r, z + Math.sin(a) * r, lift);
      }
    },
    /* стена дома от y0 до y1 */
    wall (x1, z1, x2, z2, y0, y1) {
      const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz);
      if (l < 0.01) return;
      api.quad(x1, y0, z1, x2, y0, z2, x2, y1, z2, x1, y1, z1, dz / l, 0, -dx / l);
    },
    /* Многоугольник: flat — ровная крыша на высоте y, иначе газон или
       пруд на рельефе на высоте y над землёй. Обход чинят up и dtri. */
    poly (pts, y, flat) {
      const m = pts.length;
      if (m < 3) return;
      V2.length = 0;
      for (let i = 0; i < m; i++) V2.push(new THREE.Vector2(pts[i][0], pts[i][1]));
      let faces;
      try { faces = THREE.ShapeUtils.triangulateShape(V2, []); } catch (e) { return; }
      for (const f of faces) {
        const a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
        if (flat) api.up(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
        else api.dtri(a[0], a[1], b[0], b[1], c[0], c[1], y);
      }
    },
    /* Город режем на клетки по сто метров: один меш на весь город
       рисовался целиком, даже то, что за спиной, — миллион треугольников
       каждый кадр. Клетку, которая не в кадре, three.js пропускает сам.
       Треугольник идёт в клетку своего центра; огромные (юбка до
       горизонта, гладь реки) — в отдельную общую. */
    mesh (mat) {
      const buckets = new Map();
      for (let t = 0; t < n; t += 3) {
        const i = t * 3;
        const x0 = pos[i], z0 = pos[i + 2], x1 = pos[i + 3], z1 = pos[i + 5], x2 = pos[i + 6], z2 = pos[i + 8];
        const span = Math.max(Math.abs(x1 - x0), Math.abs(x2 - x0), Math.abs(z1 - z0), Math.abs(z2 - z0));
        const k = span > CHUNK ? 'big' : Math.floor((x0 + x1 + x2) / 3 / CHUNK) + ',' + Math.floor((z0 + z1 + z2) / 3 / CHUNK);
        let b = buckets.get(k);
        if (!b) buckets.set(k, b = []);
        b.push(t);
      }
      const grp = new THREE.Group();
      for (const tris of buckets.values()) {
        const m = tris.length * 3;
        const P = new Float32Array(m * 3), Cc = new Uint8Array(m * 3);
        let o = 0;
        for (const t of tris) {
          P.set(pos.subarray(t * 3, t * 3 + 9), o); Cc.set(col.subarray(t * 3, t * 3 + 9), o);
          o += 9;
        }
        const g = new THREE.BufferGeometry();
        const pa = new THREE.BufferAttribute(P, 3), ca = new THREE.BufferAttribute(Cc, 3, true);
        g.setAttribute('position', pa);
        g.setAttribute('color', ca);
        g.computeBoundingSphere();
        // после загрузки в видеокарту копия в памяти JS не нужна
        pa.onUpload(dropArr); ca.onUpload(dropArr);
        // статика не двигается: матрицы не пересчитываем каждый кадр —
        // в Северске таких кусков десятки тысяч, обход съедал десятую часть кадра
        const me = new THREE.Mesh(g, mat);
        me.matrixAutoUpdate = false;
        grp.add(me);
      }
      grp.matrixAutoUpdate = false;
      grp.matrixWorldAutoUpdate = false;
      // исходные массивы больше не нужны: меши собраны по клеткам. В Северске
      // они весили за гигабайт и держались в памяти всю игру
      BUILT_TRIS += n / 3;
      cap = 1 << 10; n = 0;
      pos = new Float32Array(cap * 3); col = new Uint8Array(cap * 3);
      return grp;
    },
    verts () { return n; },
  };
  return api;
}

let BUILT_TRIS = 0;         // сколько треугольников статики собрано (для отладки)
function dropArr () { this.array = null; }
// клетка статики, метров: по ним отсекается то, что не в кадре. Большому
// городу — крупнее: сорок тысяч мелких кусков дороже обходить, чем дорисовать лишнее
const CHUNK = MAP.border ? 200 : 100;
const LITM = Mesher();      // всё материальное: земля, дороги, дома
const FLATM = Mesher();     // разметка, окна, вывески — света не ловят

/* ── земля, зелёнка, вода ── */
const GREEN_HEX = {
  park: '#9ed07f', green: '#a2cf86', pitch: '#8dcd93',
  play: '#d3bd88', cem: '#aacd93', water: '#6fb0c9',
};

/* цвет земли: пойма сочнее, на горе суше, дно под водой песчаное */
const GROUND_LOW = new THREE.Color('#a2d086'), GROUND_HIGH = new THREE.Color('#bcd293');
const GROUND_BED = '#c9c08f', GC = new THREE.Color();
function groundHex (h) {
  if (h < 0) return GROUND_BED;
  return '#' + GC.copy(GROUND_LOW).lerp(GROUND_HIGH, clamp(h / 55, 0, 1)).getHexString();
}

function osmGround () {
  // сама сетка рельефа: по два треугольника на клетку, диагональ та же,
  // что в groundH
  const hAt = (i, j) => TH[j * TNX + i];
  const cell = (i, j) => {
    const x0 = TX0 + i * TG, x1 = x0 + TG, z0 = TZ0 + j * TG, z1 = z0 + TG;
    const h00 = hAt(i, j), h10 = hAt(i + 1, j), h01 = hAt(i, j + 1), h11 = hAt(i + 1, j + 1);
    LITM.color(groundHex((h00 + h10 + h01) / 3));
    LITM.up(x0, h00, z0, x1, h10, z0, x0, h01, z1);
    LITM.color(groundHex((h11 + h10 + h01) / 3));
    LITM.up(x1, h11, z1, x0, h01, z1, x1, h10, z0);
  };
  /* Далеко за забором (карта с границей) земля — крупными кусками по
     четыре клетки: туда не проехать, а мелкая сетка на полгорода за
     оградой весила миллион треугольников. */
  const K = 4;
  for (let bj = 0; bj < TNZ - 1; bj += K)
    for (let bi = 0; bi < TNX - 1; bi += K) {
      const ei = Math.min(bi + K, TNX - 1), ej = Math.min(bj + K, TNZ - 1);
      const x0 = TX0 + bi * TG, z0 = TZ0 + bj * TG, x1 = TX0 + ei * TG, z1 = TZ0 + ej * TG;
      if (BMASK && farOut(x0, z0) && farOut(x1, z0) && farOut(x0, z1) && farOut(x1, z1) && farOut((x0 + x1) / 2, (z0 + z1) / 2)) {
        const h00 = hAt(bi, bj) - 0.3, h10 = hAt(ei, bj) - 0.3, h01 = hAt(bi, ej) - 0.3, h11 = hAt(ei, ej) - 0.3;
        LITM.color(groundHex((h00 + h10 + h01) / 3)); LITM.up(x0, h00, z0, x1, h10, z0, x0, h01, z1);
        LITM.color(groundHex((h11 + h10 + h01) / 3)); LITM.up(x1, h11, z1, x0, h01, z1, x1, h10, z0);
        continue;
      }
      for (let j = bj; j < ej; j++) for (let i = bi; i < ei; i++) cell(i, j);
    }
  // Юбка до горизонта: край сетки тянем наружу на той же высоте,
  // иначе за городом земля обрывается ступенькой в пустоту.
  const far = 1400;
  const gx1 = TX0 + (TNX - 1) * TG, gz1 = TZ0 + (TNZ - 1) * TG;
  const skirt = (ax, az, ha, bx, bz, hb, ox, oz) => {
    LITM.color(groundHex((ha + hb) / 2));
    LITM.up(ax, ha, az, bx, hb, bz, bx + ox, hb, bz + oz);
    LITM.up(ax, ha, az, bx + ox, hb, bz + oz, ax + ox, ha, az + oz);
  };
  for (let i = 0; i < TNX - 1; i++) {
    const xa = TX0 + i * TG, xb = xa + TG;
    skirt(xa, TZ0, hAt(i, 0), xb, TZ0, hAt(i + 1, 0), 0, -far);
    skirt(xa, gz1, hAt(i, TNZ - 1), xb, gz1, hAt(i + 1, TNZ - 1), 0, far);
  }
  for (let j = 0; j < TNZ - 1; j++) {
    const za = TZ0 + j * TG, zb = za + TG;
    skirt(TX0, za, hAt(0, j), TX0, zb, hAt(0, j + 1), -far, 0);
    skirt(gx1, za, hAt(TNX - 1, j), gx1, zb, hAt(TNX - 1, j + 1), far, 0);
  }
  for (const [cx, cz, i, j, sx, sz] of [[TX0, TZ0, 0, 0, -1, -1], [gx1, TZ0, TNX - 1, 0, 1, -1],
                                        [TX0, gz1, 0, TNZ - 1, -1, 1], [gx1, gz1, TNX - 1, TNZ - 1, 1, 1]]) {
    const h = hAt(i, j);
    LITM.color(groundHex(h));
    LITM.up(cx, h, cz, cx + sx * far, h, cz, cx + sx * far, h, cz + sz * far);
    LITM.up(cx, h, cz, cx + sx * far, h, cz + sz * far, cx, h, cz + sz * far);
  }

  // Томь — одна ровная гладь на нуле: дно под ней на три метра ниже,
  // берег выше, и кромка воды получается сама там, где земля уходит вниз
  LITM.color('#6fb0c9');
  const wx0 = TX0 - far, wx1 = gx1 + far, wz0 = TZ0 - far, wz1 = gz1 + far;
  LITM.up(wx0, 0, wz1, wx1, 0, wz1, wx1, 0, wz0);
  LITM.up(wx0, 0, wz1, wx1, 0, wz0, wx0, 0, wz0);

  for (const g of CITY.green) {
    if (BMASK && g.p.every(q => farOut(q[0], q[1]))) continue;      // за забором далеко — не рисуем
    LITM.color(GREEN_HEX[g.k] || '#95c579');
    LITM.poly(g.p, g.k === 'water' ? 0.03 : 0.04);
  }
  // Кисловка и ручьи линией: русла в карте нет, только осевая
  LITM.color('#6fb0c9');
  for (const r of []) {
    const p = r.p;
    for (let i = 1; i < p.length; i++) {
      LITM.ribbon(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], 9, 0.05);
      LITM.disc(p[i][0], p[i][1], 4.5, 0.05);
    }
  }
}

/* ── улицы: тротуар пошире, поверх него полотно, сверху осевая ── */
/* У бульвара (r.g — ширина газона, её считает генератор карты) между
   полотном и тротуаром — полоса травы с деревьями, плитка шире на два газона */
const SIDEWALK = r => roadWidth(r) + (r.c <= 5 ? 5.5 : 2) + (r.g || 0) * 2;

function osmRoads () {
  // промзоны и площадки — чуть другим цветом земли, под всем остальным
  for (const lot of CITY.lots) {
    if (lot.k === 'park' || (BMASK && lot.p.every(q => farOut(q[0], q[1])))) continue;
    LITM.color(lot.k === 'ind' ? '#c9c8bb' : '#cfcabd');
    LITM.poly(lot.p, 0.025);
  }
  // дорожки во дворах и парках: светлая плитка, по ним гуляют коллеги
  LITM.color('#ddd5c6');
  for (const q of CITY.paths)
    for (let i = 1; i < q.length; i++) {
      LITM.ribbon(q[i - 1][0], q[i - 1][1], q[i][0], q[i][1], 2.0, 0.07);
      if (i < q.length - 1) LITM.disc(q[i][0], q[i][1], 1, 0.07, 6);
    }
  for (const pass of [0, 1]) {
    for (const r of CITY.roads) {
      if (r.b) continue;                          // мосты кладутся отдельно, над водой
      const w = pass ? roadWidth(r) : SIDEWALK(r);
      // На перекрёстке два полотна лежат в одной плоскости и мерцают.
      // Главная чуть выше второстепенной — поверх и рисуется.
      const y = (pass ? 0.14 : 0.09) + (7 - r.c) * 0.004;
      LITM.color(pass ? ROAD_HEX[r.c] : '#e3ded4');
      const p = r.p;
      for (let i = 1; i < p.length; i++) {
        LITM.ribbon(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], w, y);
        // пятно на изломе и на перекрёстке: без него угол улицы рвётся
        const n = NODE_IDX.get(p[i][0] + ',' + p[i][1]);
        if (i < p.length - 1 || (n !== undefined && nodeDeg(n) >= 2)) LITM.disc(p[i][0], p[i][1], w / 2, y, 9);
      }
    }
  }
}

/* ── бордюры ──
   Тротуар — не просто светлая полоса: вдоль улицы он поднят над
   асфальтом на двадцать восемь сантиметров, по краю — бордюрный камень.
   У перекрёстков и зебр бордюр опущен (там, где машина уходит в дугу,
   поднятого тротуара нет), как и там, где тротуар одной улицы
   ложится на асфальт другой — у разделённых проспектов и дворовых
   проездов. Где тротуар поднят — помним по клеткам в метр: по ним
   машину подкидывает на бордюре, а люди стоят на тротуаре, а не в нём. */
const CURB_H = 0.28;
const RAISED = new Set();
const rkey = (x, z) => (Math.round(x) + 4000) * 8000 + (Math.round(z) + 4000);
const curbAt = (x, z) => (RAISED.has(rkey(x, z)) ? CURB_H : 0);

function osmCurbs () {
  const SW0 = 2.75, STEP = 6;
  // плоская лента по высотам концов: на шести метрах склон почти прямой,
  // а треугольников вчетверо меньше, чем у ленты, нарезанной по рельефу
  const flat = (x1, z1, x2, z2, w, lift) =>
    LITM.ribbon3(x1, groundH(x1, z1) + lift, z1, x2, groundH(x2, z2) + lift, z2, w);
  for (const r of CITY.roads) {
    if (!drivable(r) || r.b || r.c > 5) continue;
    const w = roadWidth(r), SW = r.g || SW0;             // у бульвара за бордюром — газон
    for (let i = 1; i < r.p.length; i++) {
      const a = NODE_IDX.get(r.p[i - 1][0] + ',' + r.p[i - 1][1]), b = NODE_IDX.get(r.p[i][0] + ',' + r.p[i][1]);
      const e = a !== undefined && b !== undefined ? edgeOf(a, b) : null;
      if (!e) continue;
      const zebs = (ZEB_BY_EDGE.get(ukey(a, b)) || []).map(zb => (zb.a === a ? zb.d : e.len - zb.d));
      const d0 = nodeDeg(a) >= 3 ? e.tA + 0.5 : 0, d1 = e.len - (nodeDeg(b) >= 3 ? e.tB + 0.5 : 0);
      const A = NODES[a];
      for (const sd of [-1, 1]) {
        for (let d = d0; d < d1 - 0.2; d += STEP) {
          const dd = Math.min(d1, d + STEP);
          if (zebs.some(z => z > d - ZW / 2 - 1 && z < dd + ZW / 2 + 1)) continue;       // у зебры бордюр опущен
          const m = (d + dd) / 2;
          const cx = A.x + e.ux * m + e.rx * sd * (w / 2 + SW / 2), cz = A.z + e.uz * m + e.rz * sd * (w / 2 + SW / 2);
          // тротуар не должен ложиться на чужое полотно и в дом
          const other = nearestRoad(cx, cz, 7, 1);
          if (other && other.d < other.seg.w / 2 + 0.3 && other.seg.w !== w) continue;
          if (other && other.d < w / 2 - 0.1) continue;
          if (inHouse(cx, cz)) continue;
          if (MAPFIX && MAPW.curbOnAsphalt(CITY, A.x, A.z, e, d, dd, sd, w, SW)) continue;   // и краем — тоже (mapworks.js)
          const o1 = sd * (w / 2), o2 = sd * (w / 2 + SW);
          const p = (dist, o) => [A.x + e.ux * dist + e.rx * o, A.z + e.uz * dist + e.rz * o];
          const [ax, az] = p(d, o1), [bx, bz] = p(dd, o1);
          const mid = (o1 + o2) / 2;
          const [sx1, sz1] = p(d, mid), [sx2, sz2] = p(dd, mid);
          LITM.color(r.g ? groundHex(groundH(sx1, sz1)) : '#e3ded4');
          flat(sx1, sz1, sx2, sz2, SW, CURB_H + 0.02);
          // бордюрный камень: светлая кромка сверху и грань к дороге
          const [kx1, kz1] = p(d, sd * (w / 2 + 0.12)), [kx2, kz2] = p(dd, sd * (w / 2 + 0.12));
          LITM.color('#f1ede6');
          flat(kx1, kz1, kx2, kz2, 0.24, CURB_H + 0.03);
          LITM.color('#b9b4ab');
          const ga = groundH(ax, az), gb = groundH(bx, bz);
          LITM.quad(ax, ga + 0.12, az, bx, gb + 0.12, bz, bx, gb + CURB_H + 0.03, bz, ax, ga + CURB_H + 0.03, az, e.rx * -sd, 0, e.rz * -sd);
          for (let t = d; t <= dd; t += 1)
            for (let o = w / 2 + 0.5; o < w / 2 + SW; o += 0.9) {
              const [qx, qz] = p(t, sd * o);
              RAISED.add(rkey(qx, qz));
            }
        }
      }
    }
  }
}

/* ── разметка ──
   По правилам, как в Москве: на больших двусторонних — двойная
   сплошная, на улицах поменьше — прерывистая осевая, между полосами
   одного направления — прерывистая, по краю больших — сплошная. У
   перекрёстка разметка обрывается там же, где машина уходит в дугу, а
   вокруг зебры — за метр до неё. Стоп-линия — перед зеброй
   регулируемого въезда, на своей половине полотна. */
function osmMarkings () {
  FLATM.color('#f2efe6');
  const Y = 0.2;
  const seg = (e, o, d0, d1, wd) => {
    if (d1 - d0 < 0.3) return;
    const A = NODES[e.a];
    FLATM.ribbon(A.x + e.ux * d0 + e.rx * o, A.z + e.uz * d0 + e.rz * o,
                 A.x + e.ux * d1 + e.rx * o, A.z + e.uz * d1 + e.rz * o, wd, Y);
  };
  const DASH = 3, GAP = 6;
  for (const r of CITY.roads) {
    if (!drivable(r) || r.b || r.c > 4) continue;
    let acc = 0;
    for (let i = 1; i < r.p.length; i++) {
      const a = NODE_IDX.get(r.p[i - 1][0] + ',' + r.p[i - 1][1]), b = NODE_IDX.get(r.p[i][0] + ',' + r.p[i][1]);
      const e = a !== undefined && b !== undefined ? edgeOf(a, b) : null;
      if (!e || e.road !== r) { if (e) acc += e.len; continue; }
      const cut0 = nodeDeg(a) >= 3 ? e.tA + 1.2 : 0, cut1 = nodeDeg(b) >= 3 ? e.tB + 1.2 : 0;
      // куски без зебр: разметка через зебру не идёт
      let spans = [[cut0, e.len - cut1]];
      for (const zb of ZEB_BY_EDGE.get(ukey(a, b)) || []) {
        const d = zb.a === a ? zb.d : e.len - zb.d, z0 = d - ZW / 2 - 1, z1 = d + ZW / 2 + 1;
        spans = spans.flatMap(([s0, s1]) => (z1 <= s0 || z0 >= s1) ? [[s0, s1]] : [[s0, z0], [z1, s1]]);
      }
      // и стоп-линии: за ними на своей стороне — только зебра
      const n = laneCount(e), lw = (e.oneway ? e.w : e.w / 2) / n;
      for (const [s0, s1] of spans) {
        if (s1 - s0 < 0.5) continue;
        const dashed = (o, wd) => {
          for (let d = s0 - ((acc + s0) % (DASH + GAP)); d < s1; d += DASH + GAP)
            seg(e, o, Math.max(s0, d), Math.min(s1, d + DASH), wd);
        };
        if (!e.oneway) {
          if (e.c <= 2 || n >= 2) { seg(e, 0.18, s0, s1, 0.13); seg(e, -0.18, s0, s1, 0.13); }
          else if (e.w >= 7.5) dashed(0, 0.14);
          for (let k = 1; k < n; k++) { dashed(e.w / 2 - lw * k, 0.12); dashed(-(e.w / 2 - lw * k), 0.12); }
        } else for (let k = 1; k < n; k++) dashed(e.w / 2 - lw * k, 0.12);
        if (e.c <= 3 && e.w >= 9) { seg(e, e.w / 2 - 0.35, s0, s1, 0.13); seg(e, -(e.w / 2 - 0.35), s0, s1, 0.13); }
      }
      acc += e.len;
    }
  }
  // стоп-линии регулируемых въездов
  for (const g of SIG_GROUPS)
    for (const e of g.app) {
      const B = NODES[e.b], d = e.stopAt - 0.3;
      const x = B.x - e.ux * d, z = B.z - e.uz * d;
      const o0 = e.oneway ? -e.w / 2 + 0.3 : 0.3, o1 = e.w / 2 - 0.3;
      FLATM.ribbon(x + e.rx * o0, z + e.rz * o0, x + e.rx * o1, z + e.rz * o1, 0.5, Y);
    }
  // зебры: белые полосы вдоль движения, поперёк — во всю ширину полотна
  for (const zb of ZEBRAS) {
    const e = zb.e, A = NODES[zb.a], d = zb.d;
    const m = Math.floor((e.w - 0.6) / 1.15);
    for (let i = 0; i < m; i++) {
      const o = -((m - 1) * 1.15) / 2 + i * 1.15;
      FLATM.ribbon(A.x + e.ux * (d - ZW / 2) + e.rx * o, A.z + e.uz * (d - ZW / 2) + e.rz * o,
                   A.x + e.ux * (d + ZW / 2) + e.rx * o, A.z + e.uz * (d + ZW / 2) + e.rz * o, 0.6, Y + 0.005);
    }
  }
}

/* ── край карты ──
   Улицы нарисованы и за краем, до горизонта, а машину там держит рамка.
   Без знака это невидимая стена: едешь по Ленина на север — и встал.
   Поэтому там, где улица пересекает рамку, ставим перекрытие: бетонные
   блоки и полосатый щит поперёк полотна. */
let CLOSED_MAT = null;
function closedSign () {
  if (CLOSED_MAT) return CLOSED_MAT;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 40);
  x.strokeStyle = '#d9342c'; x.lineWidth = 5; x.strokeRect(3, 3, 122, 34);
  x.fillStyle = '#d9342c'; x.font = 'bold 13px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText($t('ДОРОГА'), 64, 14); x.fillText($t('ЗАКРЫТА'), 64, 28);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return (CLOSED_MAT = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
}

/* перекрытие поперёк полотна: щит в полоску, знак, бетонные блоки.
   u — наружу, за рамку */
function edgeBlock (x, z, ux, uz, w) {
  const nx = -uz, nz = ux, ry = Math.atan2(-ux, -uz);
  const y = groundH(x, z);
  const n = Math.max(3, Math.round(w / 1.6));
  for (let k = 0; k < n; k++) {
    const o = (k + 0.5) / n * w - w / 2;
    box(LIT, w / n, 0.5, 0.2, k % 2 ? '#f2eee6' : '#d9342c', x + nx * o, y + 1.25, z + nz * o, ry);
  }
  for (const s of [-1, 1]) {
    box(LIT, 0.25, 1.6, 0.25, '#585460', x + nx * (w / 2) * s, y + 0.7, z + nz * (w / 2) * s, ry);
  }
  // знак над щитом, на двух стойках: видно издалека, с любой стороны
  for (const s of [-1, 1])
    box(LIT, 0.16, 3.4, 0.16, '#585460', x + nx * 1.9 * s, y + 1.7, z + nz * 1.9 * s, ry);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), closedSign());
  sign.position.set(x - ux * 0.05, y + 3.0, z - uz * 0.05);
  sign.rotation.y = ry;
  scene.add(sign);
  for (let k = 0; k < Math.ceil(w / 2.6); k++) {
    const o = (k + 0.5) * 2.6 - w / 2;
    box(LIT, 2.3, 0.8, 0.9, '#bdb6ab', x + nx * o + ux * 0.8, y + 0.35, z + nz * o + uz * 0.8, ry);
  }
  obb(x + ux * 0.4, z + uz * 0.4, w / 2 + 0.5, 0.8, Math.atan2(nz, nx));
}

function osmEdgeBlocks () {
  // у карты с границей по забору — свои края: КПП на выездах, остальное перекрыто
  if (BORDER) { borderEdges(); return; }
  const B = BOUNDS, into = 3;
  const inside = (x, z) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
  const done = [];
  for (const r of CITY.roads) {
    if (r.c > DRIVE_MAX || r.b) continue;
    const w = roadWidth(r) + 2;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const a = inside(x1, z1), b = inside(x2, z2);
      if (a === b) continue;
      // точка пересечения с рамкой — делением пополам, отрезок короткий
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) {
        const t = (lo + hi) / 2;
        (inside(lerp(x1, x2, t), lerp(z1, z2, t)) === a ? (lo = t) : (hi = t));
      }
      const len = Math.hypot(x2 - x1, z2 - z1) || 1;
      let ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      if (!a) { ux = -ux; uz = -uz; }                  // u — наружу, за рамку
      const x = lerp(x1, x2, lo) - ux * into, z = lerp(z1, z2, lo) - uz * into;
      if (done.some(q => Math.hypot(q[0] - x, q[1] - z) < 8)) continue;
      done.push([x, z]);
      edgeBlock(x, z, ux, uz, w);
    }
  }
}

/* Северск: вдоль всей границы забор, на дорогах через неё — КПП (из карты)
   или перекрытие, если КПП там нет */
const KPPS = [];
function borderEdges () {
  CBITS.buildFence(cityApi(), CITY.fence || [BORDER.concat([BORDER[0]])]);
  for (const k of CITY.kpp || []) KPPS.push(CBITS.buildKpp(cityApi(), k));
  for (const [x, z, ux, uz, w] of CITY.closed || []) edgeBlock(x, z, ux, uz, (w || 8) + 2);
}

/* ── мосты: настил, балки, перила и быки ──
   Настил режем на шаги по шесть метров — по ним же идёт горб. Перила —
   препятствие: с Коммунального в Томь не слетишь. */
function osmBridges () {
  for (const b of BRIDGES) {
    const r = b.road, w = roadWidth(r), ws = SIDEWALK(r);
    const dx = b.x2 - b.x1, dz = b.z2 - b.z1, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    const n = Math.max(1, Math.ceil(len / 6));
    const P = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = b.x1 + dx * t, z = b.z1 + dz * t;
      P.push([x, deckAt(b, t, x, z), z]);
    }
    const edge = ws / 2;
    for (let k = 1; k <= n; k++) {
      const [x1, y1, z1] = P[k - 1], [x2, y2, z2] = P[k];
      LITM.color('#e3ded4'); LITM.ribbon3(x1, y1 + 0.09, z1, x2, y2 + 0.09, z2, ws);
      LITM.color(ROAD_HEX[r.c]); LITM.ribbon3(x1, y1 + 0.14, z1, x2, y2 + 0.14, z2, w);
      // балки по краям и низ настила
      for (const s of [-1, 1]) {
        const ex1 = x1 + nx * edge * s, ez1 = z1 + nz * edge * s, ex2 = x2 + nx * edge * s, ez2 = z2 + nz * edge * s;
        LITM.color('#b9b2a8');
        LITM.quad(ex1, y1 - 1.8, ez1, ex2, y2 - 1.8, ez2, ex2, y2 + 0.09, ez2, ex1, y1 + 0.09, ez1, 0, 0, 0);
        LITM.color('#6d6874');
        LITM.quad(ex1, y1 + 0.09, ez1, ex2, y2 + 0.09, ez2, ex2, y2 + 1.0, ez2, ex1, y1 + 1.0, ez1, 0, 0, 0);
      }
      LITM.color('#a39c93'); LITM.ribbon3(x1, y1 - 1.8, z1, x2, y2 - 1.8, z2, ws);
      if (r.c <= 3 && !r.o && (k % 2)) {
        FLATM.color('#f2efe6');
        FLATM.ribbon3(lerp(x1, x2, 0.2), lerp(y1, y2, 0.2) + 0.19, lerp(z1, z2, 0.2),
                      lerp(x1, x2, 0.8), lerp(y1, y2, 0.8) + 0.19, lerp(z1, z2, 0.8), 0.4);
      }
    }
    // быки — там, где под настилом есть глубина
    const piers = Math.floor(len / 55);
    for (let k = 1; k <= piers; k++) {
      const t = k / (piers + 1), x = b.x1 + dx * t, z = b.z1 + dz * t;
      const top = deckAt(b, t, x, z) - 1.8, bot = Math.min(groundH(x, z), 0) - 1;
      if (top - bot < 4) continue;
      box(LIT, 3, top - bot, ws - 2, '#aaa398', x, (top + bot) / 2, z, Math.atan2(nx, nz));
    }
    // Перила — препятствие, но только там, где настил и правда высоко:
    // у концов он лежит почти на земле, и под ним проходят улицы (Сенная
    // Курья у левого берега). Препятствия в игре плоские, без высоты,
    // поэтому кусок перил помнит высоту настила (deckY) — и держит только
    // того, кто едет по мосту, а не под ним.
    // Высокие куски подряд сливаем в одну коробку: на стыке коротких
    // коробок машину, скребущую перила, выталкивало вдоль них назад, и она
    // вставала посреди моста.
    let run = null;
    const flush = () => {
      if (!run) return;
      const [ax, , az] = P[run.a], [bx, , bz] = P[run.b];
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, hl = Math.hypot(bx - ax, bz - az) / 2;
      for (const s of [-1, 1]) {
        const rail = obb(cx + nx * (edge + 0.4) * s, cz + nz * (edge + 0.4) * s, hl, 0.4, Math.atan2(uz, ux));
        rail.deckY = run.y;
        rail.rail = true;
      }
      run = null;
    };
    for (let k = 1; k <= n; k++) {
      const [x1, y1, z1] = P[k - 1], [x2, y2, z2] = P[k];
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, my = Math.min(y1, y2);
      if (my - Math.max(groundH(mx, mz), 0) < 2.5) { flush(); continue; }
      if (!run) run = { a: k - 1, b: k, y: my };
      else { run.b = k; run.y = Math.min(run.y, my); }
    }
    flush();
  }
}

/* ── списки, которые дальше читает вся игра ── */
const LAMPH = [];    // плафоны фонарей: ночью горят, поэтому отдельно от FLAT
const LAMP_SPOTS = [];   // где под фонарём ночью пятно света
const LIT = [];      // ламберт: реквизит, который всё-таки удобнее склеить
const FLAT = [];     // бейсик: вывески и стёкла
const HOUSES = [];   // дома с адресом — куда возят пиццу
const PARKED = [];   // припаркованные машины у бордюра
const PARKINGS = []; // парковки: центр и въезд, на въезде может стоять шлагбаум
const RINGS = [];    // тротуарные кольца вокруг домов — маршруты прохожих
const YARD_RINGS = []; // дорожки по паркам и дворам
let PIZZA = null;    // пиццерия, она же начало смены

/* ─── дома, деревья, фонари ─── */
const WALLS = ['#e9bcc8', '#c7d9ef', '#f0dcae', '#c2e0cd', '#d9c8ea', '#eecfb4', '#e6d3c0'];

/* пятно под кружок вступления: ни деревьев, ни фонарей, ни лавочек —
   иначе ствол встаёт между камерой и коробкой */
const introClear = () => false;

function tree (x, z, strip = 0) {
  if (introClear(x, z)) return;
  const y = groundH(x, z);
  if (y < 0.3) return;                         // в реке деревья не растут
  // парк в карте часто накрывает и улицу через него — дерево на полотне
  // было бы стеной посреди дороги; на газоне бульвара — ближе к бордюру
  const road = nearestRoad(x, z, DRIVE_MAX + 2, 1);
  if (road && road.d < road.seg.w / 2 + (strip ? 1 : 2.5)) return;
  if (SEAS.seasonTree(x, z, y) === false) return;   // вид дерева и сезон — seasons.js (у столиков пиццерии не сажает)
  solid(x - 0.55, z - 0.55, x + 0.55, z + 0.55);
}

function lamp (x, z) {
  addProp(x, z, 0, 'lamp', g => {
    propBox(g, 0.28, 6.8, 0.28, '#585460', 0, 2.8, 0);
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
  const road = nearestRoad(x, z, DRIVE_MAX + 2, 2);
  if (!road) return 0;
  const dx = road.x - x, dz = road.z - z;
  if (Math.hypot(dx, dz) < 0.3) return 0;
  return Math.atan2(dx, dz);
}

/* Уличный реквизит живёт отдельными мешами, а не в склейке: только так
   его можно снести машиной. Каждый объект висит на пивоте в точке
   основания — от удара пивот заваливается набок. */
const PROPS = [];
const TILT_AXIS = new THREE.Vector3();

function addProp (x, z, ry, kind, build, r) {
  const pivot = new THREE.Group();
  pivot.position.set(x, groundH(x, z) + curbAt(x, z), z);
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

/* Лавочка у стены — вдоль неё, спинкой к дому; иначе — лицом к улице */
function wallFace (x, z, maxD) {
  let best = null, bd = maxD;
  for (const b of HOUSE_GRID.get(Math.floor(x / 40) + ',' + Math.floor(z / 40)) || []) {
    const p = b.p;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
      const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz);
      if (d < bd && d > 0.01) { bd = d; best = Math.atan2(x - qx, z - qz); }
    }
  }
  return best;
}

/* Лавочка не встаёт на асфальт — ни на улицу, ни во двор на проезд —
   и не встаёт в дом: иначе гость садится посреди дороги. */
function benchSpotOk (x, z) {
  const road = nearestRoad(x, z, 7, 1);
  if (road && road.d < road.seg.w / 2 + 1.0) return false;
  return !inHouse(x, z, 1.4);
}

function bench (x, z, ry) {
  if (introClear(x, z)) return null;
  const y = groundH(x, z);
  if (y < 0.3 || !benchSpotOk(x, z)) return null;
  if (ry === undefined) { const wf = wallFace(x, z, 5); ry = wf !== null ? wf : faceRoad(x, z); }
  const p = addProp(x, z, ry, 'bench', g => {
    // одним мешем: лавочек под три сотни, по четыре меша было бы тысяча вызовов
    const parts = [];
    box(parts, 2.6, 0.18, 0.7, '#8a6b4e', 0, 0.62, 0);
    box(parts, 2.6, 0.7, 0.16, '#8a6b4e', 0, 1.05, -0.28);
    // ножки уходят в землю: на склоне лавочка не висит одним краем
    box(parts, 0.18, 0.9, 0.6, '#5c5560', -1.15, 0.1, 0);
    box(parts, 0.18, 0.9, 0.6, '#5c5560', 1.15, 0.1, 0);
    g.add(new THREE.Mesh(mergeGeos(parts), SMASH_MAT));
  }, 1.7);
  BENCHES.push({ x, z, y, ry, prop: p });
  return p;
}

/* ─── мелочь во дворах: заборчики, песочницы, горки, кусты, мусорки ───
   Всего этого сотни штук, и отдельным мешем каждая стоила бы вызова
   отрисовки. Поэтому склеиваем по клеткам сто метров, как статику, но
   помним, какие вершины чьи: сбил — вершины вещи схлопываются в точку
   (её больше не видно), а вместо неё разлетаются обломки. Кадр от этого
   не тяжелеет, а сбивается всё. */
const SMASH = [];
const SM_CELL = 20, SMASH_GRID = new Map(), SM_CHUNKS = new Map();
const SMASH_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const SM_WORD = { fence: $t('заборчик'), sand: $t('песочница'), slide: $t('горка'), bush: $t('куст'), bin: $t('мусорка'), dump: $t('мусорный бак'), table: $t('столик'), goal: $t('ворота') };

function smashAdd (kind, x, z, r, geos, hex) {
  const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
  if (!SM_CHUNKS.has(k)) SM_CHUNKS.set(k, { geos: [], items: [] });
  const ch = SM_CHUNKS.get(k);
  let nv = 0;
  for (const g of geos) { ch.geos.push(g); nv += g.attributes.position.count; }
  const it = { kind, x, z, r, hex, nv, down: 0, mesh: null, v0: 0 };
  ch.items.push(it);
  SMASH.push(it);
  const gk = Math.floor(x / SM_CELL) + ',' + Math.floor(z / SM_CELL);
  if (!SMASH_GRID.has(gk)) SMASH_GRID.set(gk, []);
  SMASH_GRID.get(gk).push(it);
}

function smashBuild () {
  for (const ch of SM_CHUNKS.values()) {
    let v = 0;
    for (const it of ch.items) { it.v0 = v; v += it.nv; }
    const m = new THREE.Mesh(mergeGeos(ch.geos), SMASH_MAT);
    m.geometry.computeBoundingSphere();
    scene.add(m);
    for (const it of ch.items) it.mesh = m;
    ch.geos = null;
  }
}

/* снести: вершины — в точку у земли, вместо вещи — обломки */
function smashHit (it, nx, nz, force, quiet) {
  if (it.down) return;
  it.down = 1;
  const pos = it.mesh.geometry.attributes.position, a = pos.array, gy = groundH(it.x, it.z);
  for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 3] = it.x; a[i * 3 + 1] = gy - 1; a[i * 3 + 2] = it.z; }
  pos.needsUpdate = true;
  const n = it.kind === 'fence' ? 4 : it.kind === 'bush' ? 5 : 6;
  for (let i = 0; i < n; i++) {
    const hex = it.kind === 'bin' || it.kind === 'dump' ? (i < 2 ? it.hex : pick(['#e8e2d4', '#8a6b4e', '#d95d5d', '#59b06a', '#4f7fd6'])) : it.hex;
    const s = it.kind === 'bush' ? rand(0.3, 0.55) : rand(0.15, 0.5);
    const m = new THREE.Mesh(it.kind === 'bush' ? new THREE.IcosahedronGeometry(s, 0) : new THREE.BoxGeometry(s * (it.kind === 'fence' ? 3 : 1), s * 0.5, s), propMat(hex));
    m.position.set(it.x + rand(-0.5, 0.5), gy + rand(0.4, 1.0), it.z + rand(-0.5, 0.5));
    scene.add(m);
    GORE.push({ m, vx: nx * rand(2, 5) * (0.4 + force / 30) + rand(-2.5, 2.5), vy: rand(2.5, 6), vz: nz * rand(2, 5) * (0.4 + force / 30) + rand(-2.5, 2.5),
      spin: rand(-10, 10), life: rand(8, 14), bleed: 1e9, rest: 0 });
  }
  if (quiet) return;
  sparks(it.x, 0.5, it.z, 4, nx, nz);
  Snd.noise(0.18, 0.22);
  S.shake = Math.max(S.shake, 0.15);
  SM_T.n++;
  if (SM_T.t <= 0) { toast($t('минус {what}', { what: SM_WORD[it.kind] })); SM_T.t = 1.2; }
}
const SM_T = { t: 0, n: 0 };

/* что рядом с точкой — по клеткам двадцать метров */
function smashNear (x, z, fn) {
  const ci = Math.floor(x / SM_CELL), cj = Math.floor(z / SM_CELL);
  for (let i = ci - 1; i <= ci + 1; i++)
    for (let j = cj - 1; j <= cj + 1; j++)
      for (const it of SMASH_GRID.get(i + ',' + j) || []) if (!it.down) fn(it);
}

/* ── расстановка ── */
function osmYardBits () {
  if (INTRO) return;
  // заборчики вдоль дворовых проездов: кусками, с проходами у перекрёстков,
  // подъездов и дорожек — двор должен остаться проезжим
  let segs = 0;
  const FENCE = ['#3f7a4a', '#4f6fa8', '#8a3b3b', '#d8d2c8'];
  for (const r of CITY.roads) {
    if (r.c !== 4 || r.b || r.x || segs > 900) continue;
    const w = roadWidth(r) / 2 + 0.8, hex = pick(FENCE);
    for (const sd of [-1, 1]) {
      if (!chance(0.45)) continue;
      for (let i = 1; i < r.p.length; i++) {
        const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
        const len = Math.hypot(x2 - x1, z2 - z1);
        if (len < 12) continue;
        const ux = (x2 - x1) / len, uz = (z2 - z1) / len, nx = -uz * sd, nz = ux * sd, ry = Math.atan2(-uz, ux);
        for (let d = 7; d + 2.5 < len - 7; d += 2.6) {
          const cx = x1 + ux * (d + 1.25) + nx * w, cz = z1 + uz * (d + 1.25) + nz * w;
          if (!inBounds(cx, cz, -30) || inHouse(cx, cz, 1.2)) continue;
          const near = nearestRoad(cx, cz, 7, 1);
          if (near && near.seg.c !== 7 && near.d < near.seg.w / 2 + 0.4) continue;        // чужое полотно
          if (near && near.seg.c === 7 && near.d < 1.8) continue;                          // дорожка — проход
          if (CITY.entrances.some(e => Math.abs(e[0] - cx) < 5 && Math.abs(e[1] - cz) < 5)) continue;
          const gy = groundH(cx, cz), g = [];
          put(g, new THREE.BoxGeometry(2.5, 0.07, 0.06), hex, cx, gy + 0.75, cz, 0, ry, 0);
          put(g, new THREE.BoxGeometry(2.5, 0.07, 0.06), hex, cx, gy + 0.35, cz, 0, ry, 0);
          for (const o of [-1.2, 1.2]) put(g, new THREE.BoxGeometry(0.08, 0.85, 0.08), hex, cx + ux * o, gy + 0.42, cz + uz * o);
          smashAdd('fence', cx, cz, 1.3, g, hex);
          if (++segs > 900) break;
        }
      }
    }
  }
  // детские площадки: песочница, горка, пара кустов
  for (const pl of CITY.green) {
    if (pl.k !== 'play') continue;
    let cx = 0, cz = 0;
    for (const q of pl.p) { cx += q[0] / pl.p.length; cz += q[1] / pl.p.length; }
    if (!inBounds(cx, cz, -20) || !inPoly(cx, cz, pl.p) || inHouse(cx, cz, 3)) continue;
    const gy = groundH(cx, cz), ry = rand(0, 3.14);
    const g = [];
    for (const [ox, oz, w, d] of [[0, 1.4, 3.0, 0.2], [0, -1.4, 3.0, 0.2], [1.4, 0, 0.2, 2.6], [-1.4, 0, 0.2, 2.6]])
      put(g, new THREE.BoxGeometry(w, 0.3, d), '#c9803a', cx + ox, gy + 0.15, cz + oz);
    put(g, new THREE.BoxGeometry(2.6, 0.1, 2.6), '#e8d49a', cx, gy + 0.1, cz);
    smashAdd('sand', cx, cz, 1.8, g, '#c9803a');
    const sx = cx + Math.cos(ry) * 6, sz = cz + Math.sin(ry) * 6;
    if (!inHouse(sx, sz, 2) && inPoly(sx, sz, pl.p)) {
      const sy = groundH(sx, sz), g2 = [], fx = Math.cos(ry + 1.57), fz = Math.sin(ry + 1.57), rr = Math.atan2(fx, fz);
      put(g2, new THREE.BoxGeometry(1.2, 0.12, 1.2), '#e04836', sx, sy + 1.8, sz);                         // площадка
      for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) put(g2, new THREE.BoxGeometry(0.1, 1.8, 0.1), '#4f7fd6', sx + a, sy + 0.9, sz + b);
      const slx = sx + fx * 1.9, slz = sz + fz * 1.9;
      put(g2, new THREE.BoxGeometry(0.8, 0.08, 3.0), '#ffd23f', slx, sy + 0.95, slz, -0.62, rr, 0);          // скат
      put(g2, new THREE.BoxGeometry(0.8, 1.6, 0.08), '#4f7fd6', sx - fx * 0.75, sy + 0.9, sz - fz * 0.75, 0.25, rr, 0);   // лесенка
      smashAdd('slide', sx + fx * 0.8, sz + fz * 0.8, 2.0, g2, '#ffd23f');
    }
  }
  // кусты: у подъездов по бокам и вдоль стен во дворах
  let bushes = 0;
  const bush = (x, z) => {
    if (bushes > 520 || inHouse(x, z, 0.6) || !inBounds(x, z, -30)) return;
    const near = nearestRoad(x, z, 7, 1);
    if (near && near.d < near.seg.w / 2 + 0.8) return;
    const gy = groundH(x, z), g = [], hex = pick(['#4f8f3f', '#5aa04a', '#467f38']);
    put(g, new THREE.IcosahedronGeometry(rand(0.6, 0.85), 0), hex, x, gy + 0.55, z);
    put(g, new THREE.IcosahedronGeometry(rand(0.45, 0.6), 0), '#6fb05a', x + rand(-0.4, 0.4), gy + 0.85, z + rand(-0.4, 0.4));
    smashAdd('bush', x, z, 0.9, g, hex);
    bushes++;
  };
  for (const [x, z, nx, nz] of CITY.entrances) {
    if (!inBounds(x, z, -40)) continue;
    const tx = nz, tz = -nx;
    if (chance(0.7)) for (const sd of [-1, 1]) bush(x + nx * 1.4 + tx * 2.2 * sd, z + nz * 1.4 + tz * 2.2 * sd);
    // урна у подъезда
    if (chance(0.55)) {
      const bx = x + nx * 1.6 - tx * 1.6, bz = z + nz * 1.6 - tz * 1.6;
      if (!inHouse(bx, bz, 0.4)) {
        const gy = groundH(bx, bz), g = [];
        put(g, new THREE.CylinderGeometry(0.28, 0.24, 0.8, 8), '#4e5a4a', bx, gy + 0.4, bz);
        put(g, new THREE.CylinderGeometry(0.3, 0.3, 0.06, 8), '#3a4238', bx, gy + 0.82, bz);
        smashAdd('bin', bx, bz, 0.5, g, '#4e5a4a');
      }
    }
  }
  for (const pl of CITY.green) {
    if (pl.k !== 'green' || bushes > 520) continue;
    for (let i = 0; i < Math.min(pl.p.length, 8); i++) if (chance(0.35)) {
      const a = pl.p[i], b = pl.p[(i + 1) % pl.p.length];
      bush(lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5));
    }
  }
  // мусорные баки у дворовых парковок
  for (const pk of PARKINGS) {
    if (!chance(0.6)) continue;
    const dx = pk.cx - pk.ex, dz = pk.cz - pk.ez, l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
    for (let i = 0; i < 2; i++) {
      const bx = pk.ex + ux * 6 + nx * (5 + i * 1.8), bz = pk.ez + uz * 6 + nz * (5 + i * 1.8);
      if (inHouse(bx, bz, 1) || !inBounds(bx, bz, -30)) continue;
      const near = nearestRoad(bx, bz, 7, 1);
      if (near && near.d < near.seg.w / 2 + 1) continue;
      const gy = groundH(bx, bz), g = [], ry = Math.atan2(nx, nz);
      put(g, new THREE.BoxGeometry(1.5, 1.1, 1.0), '#3f7a4a', bx, gy + 0.62, bz, 0, ry, 0);
      put(g, new THREE.BoxGeometry(1.56, 0.1, 1.06), '#2f5a38', bx, gy + 1.22, bz, 0, ry, 0);
      for (const o of [-0.55, 0.55]) put(g, new THREE.CylinderGeometry(0.1, 0.1, 0.1, 6), '#1b1a1f', bx + Math.cos(ry) * o, gy + 0.06, bz - Math.sin(ry) * o, 1.57, 0, 0);
      smashAdd('dump', bx, bz, 0.95, g, '#3f7a4a');
    }
  }
}

/* ─── футбольные площадки ───
   Коробки из карты (leisure=pitch) плюс несколько своих в больших дворах:
   искусственный газон, белая разметка, ворота с сеткой и низкий
   заборчик по периметру — ворота и забор сбиваются, как вся дворовая
   мелочь. Днём на ближней площадке играют трое на трое: бегут за мячом,
   бьют по воротам, после гола — «ГОООЛ!» и мяч в центр. Мяч можно пнуть
   машиной, игроков — задавить. */
const PITCHES = [];
function pitchAt (cx, cz, ang, L, W, own) {
  const ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux;
  const P = (a, b) => [cx + ux * a + nx * b, cz + uz * a + nz * b];
  // все углы с запасом — не в доме, не на дороге, внутри области
  for (const [a, b] of [[-L / 2 - 1, -W / 2 - 1], [L / 2 + 1, -W / 2 - 1], [L / 2 + 1, W / 2 + 1], [-L / 2 - 1, W / 2 + 1], [0, 0]]) {
    const [x, z] = P(a, b);
    if (!inBounds(x, z, 25) || inHouse(x, z, 0.5)) return false;
    const r = nearestRoad(x, z, DRIVE_MAX, 1);
    if (r && r.d < r.seg.w / 2 + 0.8) return false;
  }
  if (PITCHES.some(p => Math.hypot(p.cx - cx, p.cz - cz) < 30)) return false;
  const gy = groundH(cx, cz);
  const ry = Math.atan2(-uz, ux);                     // поворот коробки: её x — вдоль поля
  if (own) box(LIT, L + 1, 0.06, W + 1, '#4f9a4a', cx, gy + 0.03, cz, ry);
  // разметка: периметр, центральная линия, центральный круг и штрафные
  const line = (a0, b0, a1, b1) => {
    const [x0, z0] = P(a0, b0), [x1, z1] = P(a1, b1), l = Math.hypot(x1 - x0, z1 - z0);
    box(LIT, l + 0.1, 0.03, 0.12, '#f4f4ee', (x0 + x1) / 2, groundH((x0 + x1) / 2, (z0 + z1) / 2) + 0.08, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
  };
  line(-L / 2, -W / 2, L / 2, -W / 2); line(-L / 2, W / 2, L / 2, W / 2);
  line(-L / 2, -W / 2, -L / 2, W / 2); line(L / 2, -W / 2, L / 2, W / 2);
  line(0, -W / 2, 0, W / 2);
  const cr = Math.min(3, W / 5);
  for (let i = 0; i < 12; i++) line(Math.cos(i / 12 * 6.283) * cr, Math.sin(i / 12 * 6.283) * cr, Math.cos((i + 1) / 12 * 6.283) * cr, Math.sin((i + 1) / 12 * 6.283) * cr);
  const pb = Math.min(6, L / 6), pw = Math.min(9, W * 0.55);
  for (const sd of [-1, 1]) { line(sd * L / 2, -pw / 2, sd * (L / 2 - pb), -pw / 2); line(sd * (L / 2 - pb), -pw / 2, sd * (L / 2 - pb), pw / 2); line(sd * (L / 2 - pb), pw / 2, sd * L / 2, pw / 2); }
  // ворота: штанги, перекладина и сетка — сбиваемые
  const GW = Math.min(3.6, W * 0.3);
  for (const sd of [-1, 1]) {
    const [gx, gz] = P(sd * L / 2, 0), g = [], gyy = groundH(gx, gz);
    for (const o of [-1, 1]) { const [x, z] = P(sd * L / 2, o * GW / 2); put(g, new THREE.BoxGeometry(0.12, 2.0, 0.12), '#f4f4ee', x, gyy + 1.0, z); }
    const [bx, bz] = P(sd * (L / 2 + 0.05), 0);
    put(g, new THREE.BoxGeometry(0.12, 0.12, GW), '#f4f4ee', bx, gyy + 2.0, bz, 0, ry + Math.PI / 2, 0);
    const [nx2, nz2] = P(sd * (L / 2 + 0.8), 0);
    put(g, new THREE.BoxGeometry(0.04, 1.9, GW), '#c9cfd6', nx2, gyy + 0.95, nz2, 0, ry + Math.PI / 2, 0);
    smashAdd('goal', gx, gz, 1.8, g, '#f4f4ee');
  }
  // низкий заборчик по периметру, с проходами посередине длинных сторон
  const fence = (a0, b0, a1, b1) => {
    const [x0, z0] = P(a0, b0), [x1, z1] = P(a1, b1), l = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(l / 2.6));
    const ex = (x1 - x0) / l, ez = (z1 - z0) / l, fr = Math.atan2(-ez, ex);
    for (let i = 0; i < n; i++) {
      const cx2 = x0 + ex * (i + 0.5) * l / n, cz2 = z0 + ez * (i + 0.5) * l / n, fy = groundH(cx2, cz2), g = [];
      put(g, new THREE.BoxGeometry(l / n, 0.06, 0.05), '#3f6fa8', cx2, fy + 0.95, cz2, 0, fr, 0);
      put(g, new THREE.BoxGeometry(l / n, 0.06, 0.05), '#3f6fa8', cx2, fy + 0.45, cz2, 0, fr, 0);
      put(g, new THREE.BoxGeometry(0.07, 1.0, 0.07), '#3f6fa8', cx2 - ex * l / n / 2, fy + 0.5, cz2 - ez * l / n / 2);
      smashAdd('fence', cx2, cz2, 1.3, g, '#3f6fa8');
    }
  };
  const fa = L / 2 + 1.5, fb = W / 2 + 1.5;
  fence(-fa, -fb, -3, -fb); fence(3, -fb, fa, -fb);
  fence(-fa, fb, -3, fb); fence(3, fb, fa, fb);
  fence(-fa, -fb, -fa, fb); fence(fa, -fb, fa, fb);
  PITCHES.push({ cx, cz, ux, uz, nx, nz, L, W, GW, gy, game: null });
  return true;
}

function osmPitches () {
  if (INTRO) return;
  const obb = p => {
    let best = 0, ang = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
    }
    const ux = Math.cos(ang), uz = Math.sin(ang);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const q of p) { const a = q[0] * ux + q[1] * uz, b = -q[0] * uz + q[1] * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
    return { cx: am * ux - bm * uz, cz: am * uz + bm * ux, ang, len: a1 - a0, wid: b1 - b0 };
  };
  for (const g of CITY.green) {
    if (g.k !== 'pitch') continue;
    const o = obb(g.p);
    if (o.len < 16 || o.wid < 9) continue;
    pitchAt(o.cx, o.cz, o.ang, Math.min(o.len - 2, 40), Math.min(o.wid - 2, 22), false);
  }
  // свои коробки в больших дворах — где есть место
  let own = 0;
  for (const g of CITY.green) {
    if (own >= 10 || g.k !== 'green') continue;
    const o = obb(g.p);
    if (o.len < 32 || o.wid < 22 || !inPoly(o.cx, o.cz, g.p)) continue;
    if (pitchAt(o.cx, o.cz, o.ang, 26, 15, true)) own++;
  }
}

/* игра: трое на трое на ближней площадке, только днём */
function startGame (pt) {
  const players = [];
  for (let i = 0; i < 6; i++) {
    const team = i < 3 ? 0 : 1;
    const grp = makeHuman(chance(0.3) ? nextPerson() : null, { shirt: team ? '#3f7fd6' : '#d95d5d', pants: '#f4f4ee', fat: chance(0.12) });
    const home = { a: (team ? 1 : -1) * pt.L * [0.35, 0.15, 0.2][i % 3], b: [0, -pt.W * 0.25, pt.W * 0.25][i % 3] };
    const x = pt.cx + pt.ux * home.a + pt.nx * home.b, z = pt.cz + pt.uz * home.a + pt.nz * home.b;
    grp.position.set(x, groundH(x, z), z);
    scene.add(grp);
    players.push({ grp, team, home, x, z, ph: rand(0, 6), dead: 0, shock: 0, kickCd: 0 });
  }
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), new THREE.MeshLambertMaterial({ color: 0xf4f4ee, flatShading: true }));
  scene.add(ball);
  pt.game = { players, ball, bx: pt.cx, bz: pt.cz, by: 0.24, vx: 0, vz: 0, vy: 0, say: null, sayT: 0, outT: 0, score: [0, 0] };
}
function endGame (pt) {
  const G = pt.game;
  if (!G) return;
  for (const p of G.players) if (!p.dead) dropMesh(p.grp);
  dropMesh(G.ball);
  if (G.say && G.say.parent) { G.say.parent.remove(G.say); G.say.material.dispose(); }
  pt.game = null;
}

let pitchScanT = 0;
function updateFootball (dt) {
  if (INTRO || !PITCHES.length) return;
  const day = ENV.night < 0.45 && ENV.rain < 0.5;
  if ((pitchScanT -= dt) <= 0) {
    pitchScanT = 1;
    for (const pt of PITCHES) {
      const d = Math.hypot(pt.cx - V.x, pt.cz - V.z);
      if (pt.game && (d > 220 || !day)) endGame(pt);
    }
    if (day) {
      const near = PITCHES.filter(p => !p.game && Math.hypot(p.cx - V.x, p.cz - V.z) < 160)
        .sort((a, b) => Math.hypot(a.cx - V.x, a.cz - V.z) - Math.hypot(b.cx - V.x, b.cz - V.z));
      if (near.length && PITCHES.filter(p => p.game).length < 2) startGame(near[0]);
    }
  }
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const pt of PITCHES) {
    const G = pt.game;
    if (!G) continue;
    const dV = Math.hypot(pt.cx - V.x, pt.cz - V.z);
    const loc = (x, z) => { const dx = x - pt.cx, dz = z - pt.cz; return [dx * pt.ux + dz * pt.uz, dx * pt.nx + dz * pt.nz]; };
    // мяч: катится, трётся о газон, отскакивает от бортов коробки
    G.vy -= 18 * dt; G.by += G.vy * dt;
    if (G.by < 0.24) { G.by = 0.24; G.vy = Math.abs(G.vy) > 2 ? -G.vy * 0.45 : 0; }
    G.bx += G.vx * dt; G.bz += G.vz * dt;
    const fr = Math.exp(-(G.by > 0.3 ? 0.3 : 1.2) * dt);
    G.vx *= fr; G.vz *= fr;
    let [ba, bb] = loc(G.bx, G.bz);
    const inside = Math.abs(ba) < pt.L / 2 + 1.5 && Math.abs(bb) < pt.W / 2 + 1.5;
    if (inside) {
      // гол: мяч пересёк лицевую в створе ворот
      if (Math.abs(ba) > pt.L / 2 && Math.abs(bb) < pt.GW / 2 && G.by < 2) {
        const who = ba > 0 ? 0 : 1;
        G.score[who]++;
        if (G.say && G.say.parent) { G.say.parent.remove(G.say); G.say.material.dispose(); }
        const sc = G.players.find(p => p.team === who && !p.dead);
        if (sc) { G.say = sayBubble(sc.grp, $t('ГОООЛ!') + ' ' + G.score[0] + ':' + G.score[1], '#3f8f4d', 2.7); G.sayT = 2.5; }
        if (dV < 80) Snd.coin();
        G.bx = pt.cx; G.bz = pt.cz; G.vx = G.vz = G.vy = 0; G.by = 0.24;
      } else {
        // борта: заборчик держит мяч внутри
        const va = G.vx * pt.ux + G.vz * pt.uz, vb = G.vx * pt.nx + G.vz * pt.nz;
        let na = va, nb = vb;
        if (Math.abs(ba) > pt.L / 2 + 1.2 && ba * va > 0) na = -va * 0.6;
        if (Math.abs(bb) > pt.W / 2 + 1.2 && bb * vb > 0) nb = -vb * 0.6;
        G.vx = pt.ux * na + pt.nx * nb; G.vz = pt.uz * na + pt.nz * nb;
      }
      G.outT = 0;
    } else if ((G.outT += dt) > 4) {
      // улетел за забор — достают новый
      G.bx = pt.cx; G.bz = pt.cz; G.vx = G.vz = G.vy = 0; G.by = 0.24; G.outT = 0;
      if (dV < 60) toast($t('мяч улетел — достали новый'));
    }
    // машина пинает мяч
    if (vsp > 2 && Math.hypot(G.bx - V.x, G.bz - V.z) < 2.2) {
      G.vx = V.vx * 1.3 + rand(-2, 2); G.vz = V.vz * 1.3 + rand(-2, 2); G.vy = Math.min(9, vsp * 0.35);
      Snd.blip(260, 0.06, 'square', 0.08);
    }
    G.ball.position.set(G.bx, groundH(G.bx, G.bz) + G.by, G.bz);
    G.ball.rotation.x += Math.hypot(G.vx, G.vz) * dt * 3;
    // игроки: ближний к мячу от каждой команды бежит к нему, остальные держат позицию
    const chaser = [0, 1].map(team => {
      let best = null, bd = Infinity;
      for (const p of G.players) if (!p.dead && p.team === team && p.shock <= 0) { const d = Math.hypot(p.x - G.bx, p.z - G.bz); if (d < bd) { bd = d; best = p; } }
      return best;
    });
    for (const p of G.players) {
      if (p.dead) continue;
      const u = p.grp.userData;
      p.grp.visible = dV < 130;
      if (p.shock > 0) { p.shock -= dt; handsUp(u, dt); continue; }
      let tx, tz, spd;
      if (p === chaser[p.team] && inside) { tx = G.bx; tz = G.bz; spd = 4.6 * u.pace; }
      else {
        const ha = p.home.a + clamp(ba * 0.35, -pt.L * 0.2, pt.L * 0.2), hb = p.home.b + clamp(bb * 0.3, -pt.W * 0.2, pt.W * 0.2);
        tx = pt.cx + pt.ux * ha + pt.nx * hb; tz = pt.cz + pt.uz * ha + pt.nz * hb; spd = 2.6 * u.pace;
      }
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { const k = Math.min(1, spd * dt / d); p.x += dx * k; p.z += dz * k; p.ph += dt * spd * 3; p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(dx, dz), 10, dt); }
      const sw = d > 0.3 ? Math.sin(p.ph) * 0.9 : 0;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      p.grp.position.set(p.x, groundH(p.x, p.z), p.z);
      // удар: в сторону чужих ворот, с разбросом
      p.kickCd -= dt;
      if (p.kickCd <= 0 && Math.hypot(p.x - G.bx, p.z - G.bz) < 0.8 && G.by < 0.6) {
        p.kickCd = 0.8;
        const ga = (p.team ? -1 : 1) * pt.L / 2, gb = rand(-pt.GW, pt.GW);
        const gx = pt.cx + pt.ux * ga + pt.nx * gb, gz = pt.cz + pt.uz * ga + pt.nz * gb;
        const kx = gx - G.bx, kz = gz - G.bz, kl = Math.hypot(kx, kz) || 1, pw = rand(7, 12);
        G.vx = kx / kl * pw; G.vz = kz / kl * pw; G.vy = chance(0.3) ? rand(2, 4) : 0;
        u.legR.rotation.x = -1.1;
        if (dV < 50) Snd.blip(200, 0.04, 'square', 0.05);
      }
      // под колёса — как все
      if (vsp > 3) {
        const ex = p.x - V.x, ez = p.z - V.z;
        if (Math.abs(ex * fx + ez * fz) < CAR_L + 0.5 && Math.abs(ex * fz - ez * fx) < CAR_W + 0.35) {
          p.dead = 1; dropMesh(p.grp);
          gibHuman(p, V.vx, V.vz);
          S.people++;
          Snd.squish();
          toast(pick([$t('минус нападающий'), $t('минус вратарь'), $t('красная карточка'), $t('минус игрок — замена!')]));
        }
      }
    }
    if (G.sayT > 0 && (G.sayT -= dt) <= 0 && G.say) { G.say.parent && G.say.parent.remove(G.say); G.say.material.dispose(); G.say = null; }
  }
}

/* ─── кофейни Drinkit ───
   В рамке карты настоящего Drinkit нет, поэтому ставим свои: ярко-синие
   павильоны на широких тротуарах — один недалеко от пиццерии, два в
   других концах района. Вывеска на крыше, стеклянная витрина, столики
   у входа. За латешкой из Drinkit гоняют сюда. У ближней к курьеру
   кофейни всегда тусуется команда Drinkit — все в синем, с кофе. */
const DRINKITS = [];
const DK_BLUE = '#2f6fff';
function drinkitSignMat () {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#1a3fb8'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#ffffff'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(OWN.coffee(), 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t });
}
function placeDrinkits () {
  if (INTRO || !PIZZA) return;
  const cand = [];
  for (const sg of RSEG) {
    if (sg.c > 3 || sg.b || sg.x) continue;
    const len = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1);
    if (len < 30) continue;
    const ux = (sg.x2 - sg.x1) / len, uz = (sg.z2 - sg.z1) / len;
    for (const sd of [-1, 1]) {
      const nx = -uz * sd, nz = ux * sd, o = sg.w / 2 + 5.5;
      const x = (sg.x1 + sg.x2) / 2 + nx * o, z = (sg.z1 + sg.z2) / 2 + nz * o;
      if (!inBounds(x, z, 40) || inHouse(x, z, 3.8) || groundH(x, z) < 0.5) continue;
      const r = nearestRoad(x, z, 7, 1);
      if (r && r.d < r.seg.w / 2 + 2.6) continue;
      if (ZEBRAS.some(q => Math.abs(q.x - x) < 9 && Math.abs(q.z - z) < 9)) continue;
      if (SIGNS.some(q => Math.hypot(q.x - x, q.z - z) < 7)) continue;
      cand.push({ x, z, nx, nz, dP: Math.hypot(x - PIZZA.x, z - PIZZA.z) });
    }
  }
  // первая — рядом с пиццерией, дальше — самые далёкие от уже выбранных
  const first = cand.filter(c => c.dP > 50 && c.dP < 200).sort((a, b) => a.dP - b.dP)[0];
  if (!first) return;
  const pickd = [first];
  for (let k = 0; k < 2; k++) {
    let best = null, bd = 0;
    for (const c of cand) {
      if (c.dP > 700) continue;
      const m = Math.min(...pickd.map(p => Math.hypot(p.x - c.x, p.z - c.z)));
      if (m > bd) { bd = m; best = c; }
    }
    if (best && bd > 250) pickd.push(best);
  }
  const sign = drinkitSignMat();
  for (const c of pickd) {
    const gy = groundH(c.x, c.z), ry = Math.atan2(-c.nx, -c.nz);   // фасадом к дороге
    const tx = -c.nz, tz = c.nx;
    box(LIT, 5.2, 3.2, 3.6, DK_BLUE, c.x, gy + 1.6, c.z, ry);
    box(LIT, 5.8, 0.25, 4.2, '#1a3fb8', c.x, gy + 3.3, c.z, ry);
    box(LIT, 5.6, 0.2, 1.2, '#1a3fb8', c.x - c.nx * 2.3, gy + 2.7, c.z - c.nz * 2.3, ry);   // козырёк
    put(FLAT, new THREE.PlaneGeometry(3.8, 1.9), '#bfe3ff', c.x - c.nx * 1.82, gy + 1.35, c.z - c.nz * 1.82, 0, ry, 0);
    const s = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 0.12), sign);
    s.position.set(c.x - c.nx * 1.4, gy + 3.95, c.z - c.nz * 1.4); s.rotation.y = ry;
    scene.add(s);
    // столики у входа
    for (const sdd of [-1, 1]) {
      const qx = c.x - c.nx * 3.4 + tx * 1.9 * sdd, qz = c.z - c.nz * 3.4 + tz * 1.9 * sdd;
      put(LIT, new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10), '#ffffff', qx, gy + 1.05, qz);
      put(LIT, new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), '#1a3fb8', qx, gy + 0.52, qz);
    }
    obb(c.x, c.z, 2.6, 1.8, Math.atan2(tz, tx));
    // дверь — на тротуаре перед витриной; nx/nz — наружу, к дороге
    DRINKITS.push({ x: c.x - c.nx * 2.2, z: c.z - c.nz * 2.2, nx: -c.nx, nz: -c.nz, cx: c.x, cz: c.z, n: OWN.coffee(), n0: 'drinkit', k: 'cafe', drinkit: 1 });
  }
}

/* ── команда Drinkit у кофейни ── */
/* шестеро выдуманных бариста — одни и те же на всю смену (заводим при
   первой встрече, когда язык игры уже выбран); на табличке — имя */
const CREW_N = 6;
let CREW_PEOPLE = null;
const CREW = [];                                      // { grp, person, name, x, z, hx, hz, dead, deadT, mode, ... }
let crewAt = null;
function spawnCrewMember (c, i) {
  if (!CREW_PEOPLE) CREW_PEOPLE = Array.from({ length: CREW_N }, () => makePerson());
  const person = CREW_PEOPLE[i], name = person.first;
  const grp = makeHuman(person, { shirt: DK_BLUE, pants: '#1b2a6b', fat: false });
  // стаканчик Drinkit в руке — белый с синей полосой
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  cup.position.set(0, -0.56, 0.08);
  grp.userData.armR.add(cup);
  const bat = warStick(0x8a6b4e);
  bat.position.set(0, -0.56, 0.45); bat.visible = false;
  grp.userData.armR.add(bat);
  if (name) {
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: crewTag(name), transparent: true, depthWrite: false }));
    tag.scale.set(2.2, 0.55, 1); tag.position.set(0, 2.35, 0);
    grp.add(tag);
  }
  const a = i / CREW_N * Math.PI * 1.4 - 0.7;
  const hx = c.x + c.nx * (2.2 + Math.cos(a) * 1.6) + c.nz * Math.sin(a) * 2.4, hz = c.z + c.nz * (2.2 + Math.cos(a) * 1.6) - c.nx * Math.sin(a) * 2.4;
  grp.position.set(hx, groundH(hx, hz), hz);
  scene.add(grp);
  return { grp, person, name, i, x: hx, z: hz, hx, hz, dead: 0, deadT: 0, ph: rand(0, 6), cup, bat, mode: 'hang', shock: 0, side: 0, hp: 3, down: 0, swing: 0, swingCd: 0 };
}
const CREW_TAGS = new Map();
function crewTag (name) { if (!CREW_TAGS.has(name)) CREW_TAGS.set(name, nameTex(name, DK_BLUE)); return CREW_TAGS.get(name); }
function dropCrew () { for (const m of CREW) if (!m.dead) dropMesh(m.grp); CREW.length = 0; crewAt = null; }

/* ── кофейные войны ──
   Иногда команда Drinkit сходится на улице с соседней кофейней: обе
   стороны с битами, бегут друг на друга, машут, сбитые валятся на
   асфальт и через пару секунд встают, трижды получивший — лежит до
   конца. Через полминуты-минуту или когда одна сторона легла — победители
   ликуют, чужие уходят, свои возвращаются к кофейне. */
const WAR = { on: false, cd: 70, side2: [], pt: null, t: 0, rival: '', hex: '', sayT: 0, bubbles: [], helped: 0 };
/* цвет формы соперников — цвет их вывески (пародийной, brands.js) */
const WAR_BLUE = [$t('за {brand}!', { brand: OWN.coffee() }), $t('наш раф лучше!'), $t('синие, вперёд!'), $t('кофе — только у нас!')];
function warStart () {
  const c = crewAt;
  let rival = null, bd = 380;
  for (const q of SIGNS) {
    if (!COFFEE_RE.test(q.n0 || '') || /drinkit/i.test(q.n0 || '')) continue;
    const d = Math.hypot(q.x - c.x, q.z - c.z);
    if (d < bd && d > 40) { bd = d; rival = q; }
  }
  if (!rival) return;
  // поле боя — по дороге от Drinkit к соседям, на тротуаре
  const dx = rival.x - c.x, dz = rival.z - c.z, l = Math.hypot(dx, dz) || 1, k = Math.min(55, l / 2);
  let px = c.x + dx / l * k, pz = c.z + dz / l * k;
  for (let s = 0; s < 10 && inHouse(px, pz, 1.5); s++) { px -= dx / l * 4; pz -= dz / l * 4; }
  WAR.on = true; WAR.t = rand(35, 55); WAR.helped = 0; WAR.pt = { x: px, z: pz }; WAR.rival = rival.n; WAR.hex = (rival.c && rival.c[0]) || '#6b4a3a';
  WAR.side2 = [];
  for (let i = 0; i < 6; i++) {
    const grp = makeHuman(null, { shirt: WAR.hex, pants: '#2f3540', fat: chance(0.2) });
    const bat = warStick(0x5c4a3a);
    bat.position.set(0, -0.56, 0.45);
    grp.userData.armR.add(bat);
    // выходят с той стороны, где их кофейня, — сразу к полю боя
    const x = px + dx / l * 14 + rand(-3, 3), z = pz + dz / l * 14 + rand(-3, 3);
    grp.position.set(x, groundH(x, z), z);
    scene.add(grp);
    WAR.side2.push({ grp, x, z, dead: 0, side: 1, hp: 3, down: 0, swing: 0, swingCd: rand(0, 1), ph: rand(0, 6), shock: 0 });
  }
  for (const m of CREW) if (!m.dead) { m.mode = 'war'; m.hp = 3; m.down = 0; m.cup.visible = false; m.bat.visible = true; }
  if (Math.hypot(px - V.x, pz - V.z) < 220) popBonus($t('кофейная война!'), $t('{brand} против «{rival}» — помоги синим, будет респект', { brand: OWN.coffee(), rival: rival.n }));
}
function warEnd (winner) {
  WAR.on = false; WAR.cd = rand(100, 170);
  const near = WAR.pt && Math.hypot(WAR.pt.x - V.x, WAR.pt.z - V.z) < 220;
  if (winner === 0 && WAR.helped) {
    // помог выиграть — команда благодарит
    S.burgers++; S.money += 500;
    if (!S.freeRun) addWallet(500);
    popBonus($t('{brand} благодарит!', { brand: OWN.coffee() }), $t('помог выиграть кофейную войну · +{money} и респект', { money: money(500) }));
  } else if (near) toast(winner === 0 ? $t('кофейная война: победил {brand}', { brand: OWN.coffee() }) : winner === 1 ? $t('кофейная война: победил «{rival}»', { rival: WAR.rival }) : $t('кофейная война: разошлись вничью'));
  for (const f of WAR.side2) if (!f.dead) dropMesh(f.grp);
  WAR.side2 = [];
  for (const b of WAR.bubbles) if (b.parent) { b.parent.remove(b); b.material.dispose(); }
  WAR.bubbles = [];
  for (const m of CREW) if (!m.dead) { m.mode = 'home'; m.down = 0; m.grp.rotation.x = 0; m.bat.visible = false; m.cup.visible = true; m.hp = 3; }
}

/* общий шаг бойца: к ближнему стоящему врагу, замах, удар, падение */
function fighterStep (f, foes, dt, dV) {
  const u = f.grp.userData;
  if (f.down > 0) {
    f.down -= dt;
    f.grp.rotation.x = damp(f.grp.rotation.x, -1.45, 10, dt);
    f.grp.position.y = groundH(f.x, f.z) + 0.25;
    if (f.down <= 0 && f.hp > 0) f.grp.rotation.x = 0;
    else if (f.down <= 0) f.down = 999;                // вырубили — лежит до конца
    return;
  }
  let foe = null, bd = Infinity;
  for (const e of foes) if (!e.dead && e.down <= 0) { const d = Math.hypot(e.x - f.x, e.z - f.z); if (d < bd) { bd = d; foe = e; } }
  if (!foe) { handsUp(u, dt); return; }                  // врагов не осталось — ликует
  const dx = foe.x - f.x, dz = foe.z - f.z;
  if (bd > 1.3) {
    const sp = 3.6 * (u.pace || 1);
    f.x += dx / bd * sp * dt; f.z += dz / bd * sp * dt;
    pushOut(f, 0.45);
    f.ph += dt * 12;
    const sw = Math.sin(f.ph) * 1;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armR.rotation.x = -2.6; u.armL.rotation.x = -sw * 0.6;
  } else {
    u.legL.rotation.x = u.legR.rotation.x = 0;
    f.swingCd -= dt;
    if (f.swingCd <= 0) {
      f.swingCd = rand(0.6, 1.1); f.swing = 0.25;
      if (chance(0.5)) {
        foe.hp--; foe.down = 2.2;
        if (dV < 70) { Snd.blip(rand(150, 220), 0.06, 'square', 0.07); emote(foe.x, 2, foe.z, 'angry', 1); }
      }
    }
    if (f.swing > 0) { f.swing -= dt; u.armR.rotation.x = -2.8 + (0.25 - f.swing) * 9; }
    else u.armR.rotation.x = damp(u.armR.rotation.x, -2.7, 8, dt);
  }
  f.grp.rotation.y = damp(f.grp.rotation.y, Math.atan2(dx, dz), 10, dt);
  f.grp.position.set(f.x, groundH(f.x, f.z) + curbAt(f.x, f.z), f.z);
}

/* good — помог Drinkit: сбил бойца чужой кофейни. Это респект, а не «минус» */
function runOverCheck (f, what, good) {
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = f.x - V.x, dz = f.z - V.z;
  if (Math.hypot(V.vx, V.vz) > 3 && Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
    f.dead = 1; dropMesh(f.grp);
    gibHuman(f, V.vx, V.vz);
    Snd.squish();
    if (good) {
      S.burgers++; S.money += 150;
      if (!S.freeRun) addWallet(150);
      WAR.helped++;
      toast(pick([$t('респект от «{brand}» · +{money}', { brand: OWN.coffee(), money: money(150) }), $t('за синих! респект · +{money}', { money: money(150) }), $t('минус {what} · респект', { what })]));
    } else { S.people++; toast($t('минус {what}', { what })); }
    return true;
  }
  return false;
}

function updateDrinkit (dt) {
  if (INTRO || !DRINKITS.length) return;
  // команда — у ближней к курьеру кофейни
  let near = null, nd = Infinity;
  for (const c of DRINKITS) { const d = Math.hypot(c.x - V.x, c.z - V.z); if (d < nd) { nd = d; near = c; } }
  if (!WAR.on && nd < 170 && crewAt !== near) {
    dropCrew();
    crewAt = near;
    for (let i = 0; i < CREW_N; i++) CREW.push(spawnCrewMember(near, i));
  } else if (!WAR.on && nd > 240 && crewAt) dropCrew();
  if (!crewAt) return;
  const dV = Math.hypot(crewAt.x - V.x, crewAt.z - V.z);
  // война: изредка, пока курьер поблизости
  if (!WAR.on && !calmStart() && ['drive', 'back', 'handover', 'side'].includes(S.state) && (WAR.cd -= dt) <= 0) {
    WAR.cd = rand(80, 140);
    if (dV < 200) warStart();
  }
  const crewAlive = CREW.filter(m => !m.dead);
  if (WAR.on) {
    WAR.t -= dt;
    const blueUp = crewAlive.filter(m => m.hp > 0).length, redUp = WAR.side2.filter(f => !f.dead && f.hp > 0).length;
    if (WAR.t <= 0 || !blueUp || !redUp) warEnd(!redUp && blueUp ? 0 : !blueUp && redUp ? 1 : -1);
    else if ((WAR.sayT -= dt) <= 0) {
      WAR.sayT = 1.8;
      for (const b of WAR.bubbles) if (b.parent) { b.parent.remove(b); b.material.dispose(); }
      WAR.bubbles = [];
      const a = pick(crewAlive.filter(m => m.down <= 0) || []), b2 = pick(WAR.side2.filter(f => !f.dead && f.down <= 0) || []);
      if (a) WAR.bubbles.push(sayBubble(a.grp, pick(WAR_BLUE), '#1a3fb8', 2.8));
      if (b2) WAR.bubbles.push(sayBubble(b2.grp, pick([$t('{rival} — сила!', { rival: WAR.rival }), $t('ваш кофе — вода!'), $t('на районе один кофе!'), $t('синие, домой!')]), '#d9342c', 2.8));
    }
  }
  for (const m of CREW) {
    if (m.dead) {
      if ((m.deadT -= dt) <= 0 && !WAR.on) Object.assign(m, spawnCrewMember(crewAt, m.i));   // свои не кончаются
      continue;
    }
    const u = m.grp.userData;
    m.grp.visible = dV < 130 || WAR.on;
    if (m.shock > 0 && m.mode !== 'war') { m.shock -= dt; handsUp(u, dt); }
    else if (m.mode === 'war') fighterStep(m, WAR.side2, dt, WAR.pt ? Math.hypot(WAR.pt.x - V.x, WAR.pt.z - V.z) : 999);
    else {
      // домой к кофейне или стоит у входа с кофе: болтает и отхлёбывает
      const tx = m.hx, tz = m.hz, dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
      if (d > 0.4) {
        m.x += dx / d * 2.2 * dt; m.z += dz / d * 2.2 * dt; m.ph += dt * 7;
        const sw = Math.sin(m.ph) * 0.8; u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
        m.grp.rotation.y = damp(m.grp.rotation.y, Math.atan2(dx, dz), 8, dt);
      } else {
        if (m.mode === 'home') m.mode = 'hang';
        m.ph += dt;
        u.legL.rotation.x = u.legR.rotation.x = 0;
        const sip = Math.max(0, Math.sin(m.ph * 0.7 + m.i)) ** 8;
        u.armR.rotation.x = -0.5 - sip * 1.8;
        u.head.rotation.y = Math.sin(m.ph * 0.5 + m.i) * 0.4;
        m.grp.rotation.y = damp(m.grp.rotation.y, Math.atan2(crewAt.x + crewAt.nx * 2.2 - m.x, crewAt.z + crewAt.nz * 2.2 - m.z), 3, dt);
      }
      m.grp.position.set(m.x, groundH(m.x, m.z) + curbAt(m.x, m.z), m.z);
    }
    if (runOverCheck(m, m.name || $t('бариста «{brand}»', { brand: OWN.coffee() }))) m.deadT = 30;
  }
  if (WAR.on) {
    const dW = Math.hypot(WAR.pt.x - V.x, WAR.pt.z - V.z);
    for (const f of WAR.side2) {
      if (f.dead) continue;
      f.grp.visible = dW < 150;
      fighterStep(f, CREW, dt, dW);
      runOverCheck(f, $t('боец «{rival}»', { rival: WAR.rival }), true);
    }
  }
}

/* ─── бонус: сёрфер на Москве-реке ───
   Изредка приходит заказ от сёрфера: он катается на доске по реке.
   Подъезжаешь к набережной, притормаживаешь — и коробка летит прямо ему
   на доску. Плата вдвое. Сёрфер один и тот же на всю смену — завсегдатай. */
const SURF = { f: null, person: null };
function surfPlan () {
  if (SURF.f || INTRO || SEAS.iced()) return null;   // зимой река во льду — сёрфера нет
  // берег на нашей стороне: от середины реки к курьеру, до первой суши
  const side = V.x > riverX(V.z) ? 1 : -1;
  for (let k = 0; k < 25; k++) {
    const z = rand(BOUNDS.z0 + 80, BOUNDS.z1 - 80), rx = riverX(z);
    if (!rx && rx !== 0) continue;
    let x = rx, ok = false;
    for (let s = 0; s < 80; s++) { x += side * 2; if (groundH(x, z) > 0.4) { ok = true; break; } }
    if (!ok || !inBounds(x, z, 30)) continue;
    const road = nearestRoad(x + side * 6, z, DRIVE_MAX, 2);
    if (!road || road.d > 45) continue;
    const d = Math.hypot(x - V.x, z - V.z);
    if (d < 150 || d > 750) continue;
    const sx = x - side * 11;                          // на воде в одиннадцати метрах от берега
    if (groundH(sx, z) > -0.3) continue;
    const person = SURF.person || (SURF.person = makePerson({ fat: false }));
    const grp = makeHuman(person, { fat: false, shirt: '#ffd23f', pants: '#1f7a8a' });
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 2.3), new THREE.MeshLambertMaterial({ color: 0xf0522a }));
    board.position.y = -0.04;
    grp.add(board);
    grp.userData.armL.rotation.z = -1.2; grp.userData.armR.rotation.z = 1.2;      // руки в стороны — баланс
    scene.add(grp);
    const f = { grp, person, x: sx, z, z0: z, bx: x, side, ph: 0, dead: 0, surf: 1, served: 0, freeT: 0, t: 0 };
    SURF.f = f;
    return { kind: 'solo', surf: true, stops: [{ peds: [f], reach: 26, surf: true }], why: $t(MAP.river.surfWhy, { name: person.name }) };
  }
  return null;
}
function updateSurf (dt) {
  const f = SURF.f;
  if (!f) return;
  f.grp.visible = !SEAS.iced();
  f.t += dt; f.ph += dt;
  // катается вдоль берега туда-обратно, качается на волне
  const sway = Math.sin(f.ph * 0.35) * 18;
  f.z = f.z0 + sway;
  f.x = f.bx - f.side * (11 + Math.sin(f.ph * 0.6) * 2);
  f.grp.position.set(f.x, 0.12 + Math.sin(f.ph * 2.2) * 0.08, f.z);
  f.grp.rotation.y = Math.cos(f.ph * 0.35) > 0 ? 0 : Math.PI;
  f.grp.rotation.z = Math.sin(f.ph * 1.7) * 0.12;
  if (chance(dt * 2)) splash(f.x + rand(-1, 1), f.z + rand(-1.2, 1.2));
  if (f.served) {
    if ((f.freeT -= dt) <= 0) { dropMesh(f.grp); SURF.f = null; }
  } else if (!S.order || !S.order.stops.some(st => st.peds.includes(f))) {
    // заказ отменился (смена кончилась) — сёрфер уплывает
    if (f.t > 3) { dropMesh(f.grp); SURF.f = null; }
  }
}

/* ─── веранды у кафе ───
   У части кафе и ресторанов из карты к фасаду пристроена стеклянная
   веранда: пол, крыша на столбиках, стекло с трёх сторон, внутри столики
   и стулья, за ними сидят коллеги. Стекло держит, пока въезжаешь тихо;
   на скорости — осколки во все стороны, люди вскакивают с поднятыми
   руками и разбегаются, а столики и стулья сбиваются, как дворовая
   мелочь. Людей заводим, только когда курьер рядом: лиц не грузим зря. */
const VERANDAS = [];
const GLASS_MAT = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
function osmVerandas () {
  if (INTRO) return;
  for (const poi of CITY.pois) {
    if (VERANDAS.length >= 26) break;
    if (!poi.w || (poi.k !== 'cafe' && poi.k !== 'food')) continue;
    const [wx, wz, nx, nz, wl] = poi.w;
    if (!inBounds(wx, wz, 30) || introClear(wx, wz, 12)) continue;
    const tx = nz, tz = -nx, W = clamp(wl - 1, 3.4, 5.6), D = 2.6;
    const cx = wx + nx * (D / 2 + 0.1), cz = wz + nz * (D / 2 + 0.1);
    if (VERANDAS.some(v => Math.hypot(v.x - cx, v.z - cz) < W + 2)) continue;
    // все углы — не в доме и не на проезжей части
    let bad = false;
    for (const [a, b] of [[-0.5, 1], [0.5, 1], [-0.5, 0.35], [0.5, 0.35], [0, 1.15]]) {
      const x = wx + tx * W * a + nx * D * b, z = wz + tz * W * a + nz * D * b;
      const r = nearestRoad(x, z, DRIVE_MAX, 1);
      if (inHouse(x, z, 0.2) || (r && r.d < r.seg.w / 2 + 0.6)) { bad = true; break; }
    }
    if (bad) continue;
    const gy = groundH(cx, cz), ry = Math.atan2(nx, nz);
    // пол, крыша, столбики — в общую склейку
    box(LIT, W, 0.14, D, '#7a5a44', cx, gy + 0.07, cz, ry);
    box(LIT, W + 0.3, 0.14, D + 0.3, '#3b3742', cx, gy + 2.95, cz, ry);
    for (const [a, b] of [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]])
      box(LIT, 0.1, 2.9, 0.1, '#3b3742', cx + tx * W * a + nx * D * b, gy + 1.45, cz + tz * W * a + nz * D * b);
    // стекло с трёх сторон — свой меш: разбивается целиком
    const gl = [];
    const plane = (w, x, z, r) => { const g = new THREE.PlaneGeometry(w, 2.55); g.rotateY(r); g.translate(x, gy + 1.45, z); gl.push(g); };
    plane(W, cx + nx * D / 2, cz + nz * D / 2, ry);
    for (const sd of [-1, 1]) plane(D, cx + tx * W / 2 * sd, cz + tz * W / 2 * sd, ry + Math.PI / 2);
    const glass = new THREE.Mesh(mergeUV(gl), GLASS_MAT);
    glass.renderOrder = 4;
    scene.add(glass);
    // столики и стулья — сбиваемые, как мелочь во дворах
    const seats = [];
    for (const sd of [-1, 1]) {
      const qx = cx + tx * W / 4 * sd, qz = cz + tz * W / 4 * sd, g = [];
      put(g, new THREE.CylinderGeometry(0.45, 0.45, 0.06, 10), '#e8e2d4', qx, gy + 0.78, qz);
      put(g, new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), '#3b3742', qx, gy + 0.42, qz);
      for (const cs of [-1, 1]) {
        const sx = qx + tx * 0.8 * cs, sz = qz + tz * 0.8 * cs;
        put(g, new THREE.BoxGeometry(0.42, 0.06, 0.42), '#8a3b3b', sx, gy + 0.5, sz);
        put(g, new THREE.BoxGeometry(0.06, 0.48, 0.06), '#3b3742', sx, gy + 0.25, sz);
        seats.push({ x: sx, z: sz, ry: Math.atan2(qx - sx, qz - sz) });
      }
      smashAdd('table', qx, qz, 0.9, g, '#e8e2d4');
    }
    // стекло держит машину, пока не разобьёшь
    const s = obb(cx, cz, W / 2, D / 2, Math.atan2(tz, tx));
    const v = { x: cx, z: cz, nx, nz, tx, tz, W, D, gy, glass, s, seats, people: [], broken: 0, name: poi.n };
    s.veranda = v;
    VERANDAS.push(v);
  }
}

function verandaBreak (v, dx, dz, speed) {
  if (v.broken) return;
  v.broken = 1;
  v.glass.visible = false;
  v.s.hw = v.s.hd = -50;                            // препятствия больше нет
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(rand(0.15, 0.45), rand(0.15, 0.4), 0.03),
      new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.7 }));
    const a = rand(-0.5, 0.5);
    m.position.set(v.x + v.nx * v.D / 2 + v.tx * v.W * a, v.gy + rand(0.3, 2.4), v.z + v.nz * v.D / 2 + v.tz * v.W * a);
    scene.add(m);
    GORE.push({ m, vx: dx * speed * rand(0.2, 0.5) + rand(-2, 2), vy: rand(1, 4), vz: dz * speed * rand(0.2, 0.5) + rand(-2, 2),
      spin: rand(-14, 14), life: rand(6, 10), bleed: 1e9, rest: 0 });
  }
  Snd.noise(0.35, 0.4);
  for (let i = 0; i < 4; i++) setTimeout(() => Snd.blip(rand(1800, 3200), 0.05, 'triangle', 0.06), i * 60);
  S.shake = Math.max(S.shake, 0.4);
  toast(pick([$t('минус витрина'), $t('минус веранда «{name}»', { name: v.name }), $t('стекло всмятку')]));
  // сидевшие вскакивают, поднимают руки и разбегаются
  for (const q of v.people) if (!q.dead) { q.panic = rand(0.6, 1.2); q.run = rand(3.5, 5); }
}

function updateVerandas (dt) {
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const v of VERANDAS) {
    const d = Math.hypot(v.x - V.x, v.z - V.z);
    // посетители: заводим рядом, убираем вдали, пока стекло цело
    if (!v.broken && !v.people.length && d < 150) {
      for (const st of v.seats) {
        if (!chance(0.6)) continue;
        const person = nextPerson();
        const grp = makeHuman(person, { fat: chance(0.25) });
        grp.rotation.y = st.ry;
        grp.userData.legL.rotation.x = grp.userData.legR.rotation.x = -1.45;
        grp.userData.armL.rotation.x = grp.userData.armR.rotation.x = -0.6;
        grp.position.set(st.x, v.gy + 0.36, st.z);
        scene.add(grp);
        v.people.push({ grp, x: st.x, z: st.z, person, dead: 0, panic: 0, run: 0, ph: rand(0, 6) });
      }
    } else if (!v.broken && v.people.length && d > 220) {
      for (const q of v.people) if (!q.dead) dropMesh(q.grp);
      v.people = [];
    }
    for (const q of v.people) {
      if (q.dead || q.gone) continue;
      const u = q.grp.userData;
      if (q.panic > 0) {
        q.panic -= dt;
        u.legL.rotation.x = u.legR.rotation.x = 0;
        q.grp.position.y = groundH(q.x, q.z) + 0.1;
        handsUp(u, dt);
      } else if (q.run > 0) {
        // бегом наружу и прочь от машины
        q.run -= dt; q.ph += dt * 15;
        let ax = q.x - V.x, az = q.z - V.z;
        const l = Math.hypot(ax, az) || 1;
        ax = ax / l + v.nx; az = az / l + v.nz;
        const l2 = Math.hypot(ax, az) || 1;
        q.x += ax / l2 * 3.8 * dt; q.z += az / l2 * 3.8 * dt;
        q.grp.rotation.y = damp(q.grp.rotation.y, Math.atan2(ax, az), 10, dt);
        q.grp.position.set(q.x, groundH(q.x, q.z) + curbAt(q.x, q.z) + Math.abs(Math.sin(q.ph)) * 0.1, q.z);
        const sw = Math.sin(q.ph) * 1.1;
        u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
        u.armL.rotation.x = -2.6; u.armR.rotation.x = -2.6;
        if (q.run <= 0) { q.gone = 1; dropMesh(q.grp); }
      } else {
        // сидят: едят, болтают, крутят головой
        q.ph += dt;
        u.head.rotation.y = Math.sin(q.ph * 0.6) * 0.4;
        u.armR.rotation.x = -0.6 - Math.max(0, Math.sin(q.ph * 1.3)) * 0.6;
      }
      q.grp.visible = d < 130;
      // стекло разбито — под колёса можно и их
      if (v.broken && vsp > 3) {
        const dx = q.x - V.x, dz = q.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
          q.dead = 1; dropMesh(q.grp);
          gibHuman(q, V.vx, V.vz);
          S.people++;
          Snd.squish();
          toast($t('минус {what}', { what: q.person ? q.person.name : $t('посетитель') }));
        }
      }
    }
  }
}

/* ─── дома ───
   Контур настоящий, из карты: стены ставим по рёбрам, крышу получаем
   триангуляцией контура, окна кладём лентами по этажам. Этажность —
   из тега карты, а где его не проставили, прикидываем по площади.
   Препятствие на дом — не один ящик, а коробка на каждую стену:
   у томских домов углы какие угодно, и по осям мира они не ложатся. */

const ROOFS = ['#c3b6bc', '#bcafb8', '#b4b0bd', '#c7bdb0'];
const KIND_WALL = { ind: '#cfc7bb', pub: '#e6dfd2', church: '#f0e7d6', shop: '#e9e1d3' };
const OFFICE_WALLS = ['#b7c4cf', '#c9d0d6', '#aebccb', '#d2d6da'];
const GLASS = ['#7fa7c6', '#86aecb', '#789fbf', '#8fb6d2'];
const PITCH = ['#9a6b5e', '#7d6a80', '#6f8a72', '#8a7a5e', '#8b5f55'];
const GAR_DOORS = ['#6d7f8c', '#8a5a44', '#4f7a5a', '#5a6f9a', '#9a9a92', '#7a4a3a', '#3f5f7a', '#b0a58f'];
const SHC = new THREE.Color();
const shade = (hex, k) => '#' + SHC.set(hex).multiplyScalar(k).getHexString();
/* цвет стен — тот же, что в osmBuildings: из карты, по типу или из палитры */
const hexOf = b => b._hex || '#e6d3c0';

/* Фасад по типу дома. Офис (Омега и соседи) — сплошное стекло лентами
   по этажам и импосты сверху донизу. Жилой — сетка окон, часть светится,
   на длинных стенах балконы. Магазин — витрина во весь первый этаж.
   Промка — лента окон под крышей и рёбра профлиста. Маленьким домам со
   скатной крышей в карте — скатная крыша и в игре. */
const WINQ = [];                                   // окна, которые горят ночью (см. buildNight)
function winQuad (ax, y0, az, bx, y1, bz) {
  WINQ.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
}
function facade (b, p, ccw, lv, area, hLo, hHi, h, cx, cz, arch) {
  const n = p.length, seed = Math.abs(Math.round(cx * 7 + cz * 13));
  const walls = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n];
    const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.4) continue;
    const ox = (ccw ? dz : -dz) / len, oz = (ccw ? -dx : dx) / len;
    walls.push({ a, c, dx, dz, len, ox, oz, ux: dx / len, uz: dz / len });
  }
  // полоса на стене: from..to вдоль стены (метры), y0..y1, чуть снаружи
  const band = (w, from, to, y0, y1, out = 0.08, lit = 0) => {
    const ax = w.a[0] + w.ux * from + w.ox * out, az = w.a[1] + w.uz * from + w.oz * out;
    const bx = w.a[0] + w.ux * to + w.ox * out, bz = w.a[1] + w.uz * to + w.oz * out;
    FLATM.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, w.ox, 0, w.oz);
    if (lit && Math.random() < lit) {
      const o2 = 0.05;
      winQuad(ax + w.ox * o2, y0, az + w.oz * o2, bx + w.ox * o2, y1, bz + w.oz * o2);
    }
  };
  const FH = 3.15, base = hHi;
  const floors = Math.min(lv, 16);
  const k = b.k, st = b.st;

  if (k === 'gar') {
    // гаражи: ряд металлических ворот по длинным стенам, у каждого свой цвет
    for (const w of walls) {
      if (w.len < 5) continue;
      const m = Math.floor(w.len / 3.2), pad = (w.len - m * 3.2) / 2;
      for (let i = 0; i < m; i++) {
        FLATM.color(GAR_DOORS[(seed + i * 7) % GAR_DOORS.length]);
        band(w, pad + i * 3.2 + 0.35, pad + (i + 1) * 3.2 - 0.35, base + 0.05, base + 2.25, 0.06);
      }
    }
  } else if (k === 'mall') {
    // ТЦ: стеклянный первый этаж, над ним облицовка полосами, вывеска на главной стене
    const sty = b.style || {};
    let main = null;
    for (const w of walls) {
      if (w.len < 4) continue;
      FLATM.color(sty.glass === false ? '#8fb0cc' : '#9ec3dc');
      band(w, 0.4, w.len - 0.4, base + 0.3, base + 3.6, 0.08, 0.7);
      FLATM.color(sty.stripe || '#f0522a');
      band(w, 0, w.len, base + 3.8, base + 4.3, 0.1);
      if (floors > 1) { FLATM.color(sty.glass2 || '#7fa7c6'); band(w, 1, w.len - 1, base + 5, h - 1.2, 0.08, 0.3); }
      if (!main || w.len > main.len) main = w;
    }
    if (main && b.n) CBITS.mallSign(cityApi(), { len: main.len, mx: (main.a[0] + main.c[0]) / 2, mz: (main.a[1] + main.c[1]) / 2, ox: main.ox, oz: main.oz }, h, b.n, sty);
  } else if (k === 'church') {
    // храм: высокие узкие окна, главы — ниже, над крышей
    for (const w of walls) {
      if (w.len < 3) continue;
      const m = Math.max(1, Math.floor(w.len / 3.4)), pad = (w.len - m * 3.4) / 2;
      for (let i = 0; i < m; i++) { FLATM.color('#5f7f9f'); band(w, pad + i * 3.4 + 1.1, pad + i * 3.4 + 2.3, base + 1.4, base + Math.min(h - base - 1.2, 5.2), 0.08, 0.3); }
    }
  } else if (k === 'off') {
    for (const w of walls) {
      if (w.len < 3) continue;
      for (let f = 0; f < floors; f++) {
        FLATM.color(GLASS[(seed + f) % GLASS.length]);
        band(w, 0.25, w.len - 0.25, base + 0.35 + f * FH, base + f * FH + FH - 0.45, 0.08, 0.3);
      }
      // импосты: тёмные вертикали через каждые полтора метра
      FLATM.color('#50606e');
      const m = Math.floor(w.len / 1.6);
      for (let i = 1; i < m; i++) band(w, i * w.len / m - 0.06, i * w.len / m + 0.06, base + 0.3, base + floors * FH - 0.4, 0.11);
    }
  } else if (k === 'ind') {
    for (const w of walls) {
      if (w.len < 6) continue;
      FLATM.color('#8fa9bd');
      band(w, 1, w.len - 1, h - 2.6, h - 1.5);
      FLATM.color('#b8b0a4');
      const m = Math.floor(w.len / 2.2);
      for (let i = 1; i < m; i++) band(w, i * w.len / m - 0.07, i * w.len / m + 0.07, base + 0.2, h - 2.9, 0.1);
    }
  } else {
    const shop = k === 'shop' || k === 'pub' && lv <= 2;
    const winW = k === 'pub' ? 2.0 : 1.3, step = k === 'pub' ? 3.6 : 3.0;
    for (const w of walls) {
      if (w.len < 4.5) continue;
      const cols = Math.max(1, Math.floor((w.len - 1) / step));
      const pad = (w.len - cols * step) / 2;
      let f0 = 0;
      const cu = arch ? arch.cut.get(w.a) : undefined;
      const inArch = (m, half, y) => cu !== undefined && y < arch.top + 0.3 && Math.abs(m - cu) < ARCH_W / 2 + half + 0.3;
      if (cu === undefined && (shop || (k === 'res' && lv >= 5 && w.len > 14 && seed % 3 === 0))) {
        // витрина во весь первый этаж
        FLATM.color('#cfe3f2');
        band(w, 0.6, w.len - 0.6, base + 0.4, base + 2.9, 0.08, 0.85);
        f0 = 1;
      }
      for (let f = f0; f < floors; f++)
        for (let i = 0; i < cols; i++) {
          const m = pad + (i + 0.5) * step;
          if (inArch(m, winW / 2, base + 0.9 + f * FH)) continue;
          FLATM.color(chance(0.14) ? '#ffe9a8' : '#8fb0cc');
          // у сталинок окна выше, у частных домов — поменьше
          const wy0 = st === 'stalin' ? 0.7 : 0.9, wy1 = st === 'stalin' ? 2.7 : st === 'priv' ? 2.2 : 2.5;
          band(w, m - winW / 2, m + winW / 2, base + wy0 + f * FH, base + wy1 + f * FH, 0.08, 0.38);
        }
      if (st === 'panel' && w.len > 8) {
        // панельный дом: швы между плитами — по этажам и через три метра
        FLATM.color(shade(hexOf(b), 0.86));
        for (let f = 1; f < floors; f++) band(w, 0, w.len, base + f * FH - 0.05, base + f * FH + 0.05, 0.06);
        for (let i = 0; i <= cols; i++) band(w, pad + i * step - 0.05, pad + i * step + 0.05, base, base + floors * FH, 0.06);
      } else if (st === 'stalin' && w.len > 6) {
        // сталинка: карниз под крышей, междуэтажный пояс, светлые пилястры
        FLATM.color('#f4ede0');
        band(w, 0, w.len, h - 0.7, h - 0.2, 0.22);
        band(w, 0, w.len, base + FH - 0.15, base + FH + 0.1, 0.12);
        for (let i = 0; i <= cols; i += 2) band(w, pad + i * step - 0.25, pad + i * step + 0.25, base + FH, h - 0.7, 0.14);
      }
      // балконы — на длинных стенах жилых домов, через колонку
      if (k === 'res' && w.len > 16 && lv >= 3)
        for (let f = 1; f < floors; f++)
          for (let i = (seed + f) % 2; i < cols; i += 2) {
            if (chance(0.3)) continue;
            const m = pad + (i + 0.5) * step;
            if (inArch(m, 1.1, base + f * FH)) continue;
            const bx = w.a[0] + w.ux * m + w.ox * 0.55, bz = w.a[1] + w.uz * m + w.oz * 0.55;
            box(LIT, 2.2, 0.9, 1.0, chance(0.5) ? '#d8d2c8' : '#c9bfb4', bx, base + f * FH + 0.45, bz, Math.atan2(w.ox, w.oz));
          }
    }
  }

  // крыша: двускатная / вальмовая, если так в карте (частный сектор, сталинки)
  if (k === 'church') CBITS.churchTop(cityApi(), p, h + (b.roof === 'g' || b.roof === 'h' ? 2.5 : 0), cx, cz, area, seed);
  if (b.roof === 'g' || b.roof === 'h') {
    const roofHex = b.rc || PITCH[seed % PITCH.length];
    if (CBITS.gableRoof(cityApi(), p, h, hexOf(b), roofHex, b.roof === 'h')) return;
  }
  const pitched = b.roof && b.roof !== 'f' && area < 420 && n <= 10 && lv <= 4;
  if (k === 'gar') {
    LITM.color('#57524d');                                          // рубероид
    LITM.poly(p, h, true);
    return;
  }
  if (pitched) {
    // шатёр к центру: у маленьких домов в карте почти всегда выпуклый контур
    LITM.color(PITCH[seed % PITCH.length]);
    const top = h + Math.min(3.2, Math.sqrt(area) * 0.25);
    for (const w of walls) {
      const a = w.a, c = w.c;
      LITM.tri(a[0], h, a[1], c[0], h, c[1], cx, top, cz, w.ox, 0.8, w.oz);
    }
  } else {
    LITM.color(k === 'off' ? '#a9b0b8' : ROOFS[(n + lv) % ROOFS.length]);
    LITM.poly(p, h, true);
    // парапет и надстройки: выход на крышу, вентиляция, у офиса — кондиционеры
    if (area > 150) {
      for (let i = 0; i < (k === 'off' || k === 'ind' ? 3 : 1); i++) {
        const tx = cx + rand(-1, 1) * Math.sqrt(area) * 0.18, tz = cz + rand(-1, 1) * Math.sqrt(area) * 0.18;
        if (!inPoly(tx, tz, p)) continue;
        box(LIT, k === 'off' ? 2.6 : 2.2, k === 'off' ? 1.4 : 2.2, k === 'off' ? 1.6 : 2.2, k === 'off' ? '#c4c9cf' : '#9c8f96', tx, h + 0.7, tz);
      }
    }
  }
}

function inPoly (x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/* ── арки ──
   В длинных жилых домах бывает сквозной проезд во двор. В карте таких
   проездов в рамке нет, поэтому прорубаем сами: у части домов берём
   самую длинную стену, от случайной точки на ней бросаем луч внутрь до
   противоположной стены и режем в обеих проём пять метров шириной.
   Внутри — стены тоннеля и потолок, а препятствия стен разбиты на куски
   слева и справа от проёма: через арку правда можно проехать. */
const ARCH_W = 5.2;
const ARCHES = [];
function archFor (b, p, ccw, lv, area) {
  if ((b.k && b.k !== 'res') || lv < 3 || area < 350 || INTRO || Math.random() > 0.4) return null;
  const n = p.length;
  let bi = -1, bl = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (l > bl) { bl = l; bi = i; }
  }
  if (bl < 26) return null;
  const a = p[bi], c = p[(bi + 1) % n], len = bl;
  const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len;
  const ox = ccw ? uz : -uz, oz = ccw ? -ux : ux;          // наружу из контура
  const ix = -ox, iz = -oz;
  const u = len * rand(0.35, 0.65), mx = a[0] + ux * u, mz = a[1] + uz * u;
  // луч внутрь: первая встречная стена, примерно параллельная
  let best = null;
  for (let j = 0; j < n; j++) {
    if (j === bi) continue;
    const q0 = p[j], q1 = p[(j + 1) % n];
    const ex = q1[0] - q0[0], ez = q1[1] - q0[1], el = Math.hypot(ex, ez);
    if (el < ARCH_W + 2) continue;
    const den = ix * ez - iz * ex;
    if (Math.abs(den) < 1e-6) continue;
    const t = ((q0[0] - mx) * ez - (q0[1] - mz) * ex) / den;
    const sq = ((q0[0] - mx) * iz - (q0[1] - mz) * ix) / den;
    if (t < 6 || t > 24 || sq < 0 || sq > 1) continue;
    if (Math.abs((ex * ux + ez * uz) / el) < 0.85) continue;
    const sm = sq * el;
    if (sm < ARCH_W / 2 + 1 || sm > el - ARCH_W / 2 - 1) continue;
    if (!best || t < best.t) best = { t, j, s: sm };
  }
  if (!best || u < ARCH_W / 2 + 1 || u > len - ARCH_W / 2 - 1) return null;
  if (!inBounds(mx, mz, 40) || !inBounds(mx + ix * best.t, mz + iz * best.t, 40)) return null;   // у края карты не проехать
  // с обеих сторон должно быть куда выехать: не в соседний дом
  if (inHouse(mx + ox * 3, mz + oz * 3, 1) || inHouse(mx + ix * (best.t + 3), mz + iz * (best.t + 3), 1)) return null;
  const top = Math.max(groundH(mx, mz), groundH(mx + ix * best.t, mz + iz * best.t)) + 4.4;
  const cut = new Map([[p[bi], u], [p[best.j], best.s]]);
  return { cut, top, mx, mz, ix, iz, ux, uz, t: best.t };
}

/* ── подъезды и парадные ──
   Дверь, козырёк, лампа над дверью и ступенька. Парадная — шире, с
   колоннами, фронтоном и лестницей в две ступени. */
function entranceAt (x, z, nx, nz, grand) {
  const ry = Math.atan2(nx, nz), tx = nz, tz = -nx;
  const gy = groundH(x + nx, z + nz);
  if (grand) {
    put(FLAT, new THREE.PlaneGeometry(2.3, 3.0), '#4a3a2e', x + nx * 0.09, gy + 1.5, z + nz * 0.09, 0, ry, 0);
    put(FLAT, new THREE.PlaneGeometry(0.7, 0.2), '#fff3c4', x + nx * 0.1, gy + 3.25, z + nz * 0.1, 0, ry, 0);
    for (const s of [-1, 1]) put(LIT, new THREE.CylinderGeometry(0.24, 0.28, 3.6, 8), '#ece4d4', x + nx * 1.1 + tx * 1.7 * s, gy + 1.8, z + nz * 1.1 + tz * 1.7 * s);
    box(LIT, 4.3, 0.3, 1.6, '#e3dacb', x + nx * 0.9, gy + 3.75, z + nz * 0.9, ry);
    const px = x + nx * 1.65, pz = z + nz * 1.65;
    LITM.color('#e3dacb');
    LITM.tri(px - tx * 2.15, gy + 3.9, pz - tz * 2.15, px + tx * 2.15, gy + 3.9, pz + tz * 2.15, px, gy + 4.9, pz, nx, 0, nz);
    box(LIT, 3.6, 0.2, 1.8, '#c9c2b6', x + nx * 1.0, gy + 0.1, z + nz * 1.0, ry);
    box(LIT, 3.0, 0.2, 1.1, '#c9c2b6', x + nx * 0.65, gy + 0.3, z + nz * 0.65, ry);
    return;
  }
  put(FLAT, new THREE.PlaneGeometry(1.5, 2.25), '#5a4636', x + nx * 0.09, gy + 1.12, z + nz * 0.09, 0, ry, 0);
  put(FLAT, new THREE.PlaneGeometry(0.5, 0.18), '#fff3c4', x + nx * 0.1, gy + 2.45, z + nz * 0.1, 0, ry, 0);
  box(LIT, 2.5, 0.18, 1.35, '#8f8a93', x + nx * 0.7, gy + 2.7, z + nz * 0.7, ry);
  box(LIT, 2.1, 0.22, 0.9, '#c9c2b6', x + nx * 0.45, gy + 0.08, z + nz * 0.45, ry);
}

/* Дому без подъездов в карте — свои: по одному на каждые шестнадцать
   метров самой длинной стены, что смотрит во двор, а не на проспект.
   Старым домам с адресом иногда — парадная на фасад к улице. Новые
   подъезды тоже становятся точками доставки. */
const GEN_ENTR = [];
function genEntrances (b, p, ccw, lv, area, arch, bestEdge) {
  if (INTRO || area < 250 || (b.k && b.k !== 'res' && b.k !== 'pub')) return;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  if (CITY.entrances.some(e => e[0] > x0 - 3 && e[0] < x1 + 3 && e[1] > z0 - 3 && e[1] < z1 + 3)) return;
  const ok = (x, z) => {
    if (inHouse(x, z, 0.8) || !inBounds(x, z, -40)) return false;
    const r = nearestRoad(x, z, 7, 1);
    if (r && r.d < r.seg.w / 2 + 1.5) return false;
    if (arch && Math.hypot(x - arch.mx, z - arch.mz) < 6) return false;
    return true;
  };
  // парадная — у старого дома с адресом, на стене к улице
  if (bestEdge && (b.k === 'pub' || (lv <= 6 && b.a && chance(0.3)))) {
    const x = bestEdge.mx, z = bestEdge.mz;
    if (ok(x + bestEdge.ox * 1.5, z + bestEdge.oz * 1.5)) { entranceAt(x, z, bestEdge.ox, bestEdge.oz, true); GEN_ENTR.push([x, z, bestEdge.ox, bestEdge.oz]); }
    if (b.k === 'pub') return;
  }
  // подъезды — на самой длинной стене, которая дальше всех от дороги
  let best = null, score = -1;
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 10) continue;
    const ox = (ccw ? dz : -dz) / len, oz = (ccw ? -dx : dx) / len;
    const mx = (a[0] + c[0]) / 2 + ox * 4, mz = (a[1] + c[1]) / 2 + oz * 4;
    const r = nearestRoad(mx, mz, DRIVE_MAX, 1);
    const sc = len * (r && r.seg.c <= 3 && r.d < 18 ? 0.3 : 1);
    if (sc > score) { score = sc; best = { a, dx, dz, len, ox, oz }; }
  }
  if (!best) return;
  const k = clamp(Math.floor(best.len / 16), 1, 4);
  for (let i = 0; i < k; i++) {
    const t = (i + 0.5) / k, x = best.a[0] + best.dx * t, z = best.a[1] + best.dz * t;
    if (!ok(x + best.ox * 1.5, z + best.oz * 1.5)) continue;
    entranceAt(x, z, best.ox, best.oz, false);
    GEN_ENTR.push([x, z, best.ox, best.oz]);
  }
}

function osmBuildings (skip) {
  for (const b of CITY.buildings) {
    const p = b.p, n = p.length;
    // на пятне пиццерии настоящий дом не строим — иначе они срастутся
    // (если пиццерия стоит в настоящем доме, skip пустой)
    if (skip && Math.hypot(p[0][0] - skip.x, p[0][1] - skip.z) < 22) continue;

    // Дом на склоне: стены начинаются от самого низкого угла и уходят
    // чуть в землю, крыша ровная над самым высоким — снизу по склону
    // видно цоколь, как у настоящих домов на томских горках.
    let hLo = Infinity, hHi = -Infinity;
    for (const q of p) {
      const g = groundH(q[0], q[1]);
      if (g < hLo) hLo = g;
      if (g > hHi) hHi = g;
    }

    // площадь, центр и направление обхода контура
    let s2 = 0, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n];
      const cr = a[0] * c[1] - c[0] * a[1];
      s2 += cr;
      cx += (a[0] + c[0]) * cr;
      cz += (a[1] + c[1]) * cr;
    }
    const area = Math.abs(s2) / 2;
    if (s2) { cx /= 3 * s2; cz /= 3 * s2; } else { cx = p[0][0]; cz = p[0][1]; }
    const ccw = s2 > 0;                       // от этого зависит, куда смотрит фасад

    const lv = b.lv || (area > 1200 ? 5 : area > 600 ? 4 : area > 220 ? 2 : 1);
    const h = b.k === 'gar' ? hHi + 2.7 : hHi + 3.15 * lv + 1.1;
    const seed = Math.abs(Math.round(cx * 7 + cz * 13));
    const hex = b.col || (b.k === 'off' ? OFFICE_WALLS[seed % OFFICE_WALLS.length]
      : KIND_WALL[b.k] || WALLS[seed % WALLS.length]);
    b._hex = hex;

    // стены и препятствия
    const arch = archFor(b, p, ccw, lv, area);
    LITM.color(hex);
    let bestEdge = null, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n];
      const dx = c[0] - a[0], dz = c[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      const cu = arch ? arch.cut.get(a) : undefined;
      if (cu !== undefined) {
        // стена с проёмом: слева, справа и перемычка над аркой
        const ux = dx / len, uz = dz / len, g0 = cu - ARCH_W / 2, g1 = cu + ARCH_W / 2, ry = Math.atan2(dz, dx);
        LITM.wall(a[0], a[1], a[0] + ux * g0, a[1] + uz * g0, hLo - 0.6, h);
        LITM.wall(a[0] + ux * g1, a[1] + uz * g1, c[0], c[1], hLo - 0.6, h);
        LITM.wall(a[0] + ux * g0, a[1] + uz * g0, a[0] + ux * g1, a[1] + uz * g1, arch.top, h);
        obb(a[0] + ux * g0 / 2, a[1] + uz * g0 / 2, g0 / 2, 0.5, ry);
        obb(a[0] + ux * (g1 + len) / 2, a[1] + uz * (g1 + len) / 2, (len - g1) / 2, 0.5, ry);
      } else {
        LITM.wall(a[0], a[1], c[0], c[1], hLo - 0.6, h);
        obb((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, len / 2, 0.5, Math.atan2(dz, dx));
      }

      // какая стена ближе к проезжей части — та и станет фасадом
      if (b.a) {
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        const road = nearestRoad(mx, mz, DRIVE_MAX + 2, 1);
        if (road && road.d < bestD) {
          const ox = ccw ? dz / len : -dz / len;     // наружу из контура
          const oz = ccw ? -dx / len : dx / len;
          bestD = road.d;
          bestEdge = { mx, mz, ox, oz, road };
        }
      }
    }

    if (arch) {
      // тоннель: стены по бокам проезда и потолок
      LITM.color('#6e6770');
      const pts = [];
      for (const sd of [-1, 1]) {
        const x1 = arch.mx + arch.ux * sd * ARCH_W / 2, z1 = arch.mz + arch.uz * sd * ARCH_W / 2;
        const x2 = x1 + arch.ix * arch.t, z2 = z1 + arch.iz * arch.t;
        LITM.wall(x1, z1, x2, z2, hLo - 0.6, arch.top);
        obb((x1 + x2) / 2, (z1 + z2) / 2, arch.t / 2, 0.3, Math.atan2(z2 - z1, x2 - x1));
        pts.push([x1, z1], [x2, z2]);
      }
      LITM.color('#57525c');
      LITM.poly([pts[0], pts[1], pts[3], pts[2]], arch.top, true);
      ARCHES.push({ x: arch.mx + arch.ix * arch.t / 2, z: arch.mz + arch.iz * arch.t / 2, mx: arch.mx, mz: arch.mz, ix: arch.ix, iz: arch.iz, t: arch.t, ux: arch.ux, uz: arch.uz, top: arch.top });   // ux/top — стены тоннеля для граффити (life.js)
    }
    facade(b, p, ccw, lv, area, hLo, hHi, h, cx, cz, arch);
    genEntrances(b, p, ccw, lv, area, arch, bestEdge);

    // дом с адресом — точка доставки
    if (b.a && bestEdge) {
      HOUSES.push({
        x: bestEdge.mx + bestEdge.ox * 1.2,
        z: bestEdge.mz + bestEdge.oz * 1.2,
        mx: bestEdge.mx + bestEdge.ox * 5,
        mz: bestEdge.mz + bestEdge.oz * 5,
        addr: b.a[0] + ', ' + b.a[1],
        name: b.n || '',
        lv,
      });
    }

    // вокруг дома ходят прохожие: кольцо по габариту контура — только
    // внутри области, иначе к гостю за краем карты не подъехать
    if (area > 200 && RINGS.length < 900) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const q of p) {
        if (q[0] < x0) x0 = q[0];
        if (q[0] > x1) x1 = q[0];
        if (q[1] < z0) z0 = q[1];
        if (q[1] > z1) z1 = q[1];
      }
      if (x0 > BOUNDS.x0 + 20 && x1 < BOUNDS.x1 - 20 && z0 > BOUNDS.z0 + 20 && z1 < BOUNDS.z1 - 20)
        RINGS.push({ x0: x0 - 3.2, x1: x1 + 3.2, z0: z0 - 3.2, z1: z1 + 3.2 });
    }
  }
}

/* адрес по точке: ближайший дом, у которого он есть в карте */
function realAddress (x, z) {
  let best = null, bd = Infinity;
  for (const h of HOUSES) {
    const d = (h.x - x) ** 2 + (h.z - z) ** 2;
    if (d < bd) { bd = d; best = h; }
  }
  return translit(best ? best.addr : MAP.fallbackAddr || '');
}

/* ─── улица: зелень, лавочки, фонари, остановки, чужие машины ───
   Реквизита в настоящем городе понадобилось бы тысячи, поэтому живыми
   (ломаемыми) остаются лавочки и фонари в центре, остальное уезжает
   в общую склейку — там оно ничего не стоит. */

function osmStreetLife () {
  // деревья и лавочки по паркам и скверам
  let trees = 0, benches = 0;
  for (const g of CITY.green) {
    if (g.k === 'water' || trees > 900) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of g.p) {
      if (q[0] < x0) x0 = q[0];
      if (q[0] > x1) x1 = q[0];
      if (q[1] < z0) z0 = q[1];
      if (q[1] > z1) z1 = q[1];
    }
    const w = x1 - x0, d = z1 - z0;
    if (w < 12 || d < 12) continue;
    const want = clamp(Math.round(w * d / 900), 1, 14);
    for (let k = 0; k < want && trees < 900; k++) {
      const tx = rand(x0 + 3, x1 - 3), tz = rand(z0 + 3, z1 - 3);
      if (!inPoly(tx, tz, g.p)) continue;
      tree(tx, tz);
      trees++;
    }
    // в парках сидят на лавочках — гостю есть куда присесть
    if (g.k === 'park' && benches < 150 && w > 30 && d > 30) {
      for (let k = 0; k < 3 && benches < 150; k++) {
        const bx = rand(x0 + 5, x1 - 5), bz = rand(z0 + 5, z1 - 5);
        if (!inPoly(bx, bz, g.p)) continue;
        bench(bx, bz);
        benches++;
      }
      if (x0 > BOUNDS.x0 && x1 < BOUNDS.x1 && z0 > BOUNDS.z0 && z1 < BOUNDS.z1)
        YARD_RINGS.push({ x0: x0 + 4, x1: x1 - 4, z0: z0 + 4, z1: z1 - 4, inner: true });
    }
  }

  // лавочки у подъездов: без них гостю негде ждать за пределами парков
  const step = Math.max(1, Math.floor(HOUSES.length / 260));
  for (let i = 0; i < HOUSES.length && benches < 120; i += step) {
    const h = HOUSES[i];
    if (!chance(0.4)) continue;
    bench(h.x + (h.mx - h.x) * 0.45 + rand(-2.5, 2.5), h.z + (h.mz - h.z) * 0.45 + rand(-2.5, 2.5));
    benches++;
  }

  // Фонари вдоль улиц — в склейку, ломать их не дадим. Столб стоит на
  // внешнем краю тротуара, консоль — над дорогой. У разделённого
  // проспекта тротуар одной половины — это асфальт другой, поэтому
  // столб, попавший на чужое полотно или в дом, не ставим.
  for (const r of CITY.roads) {
    if (r.c > 3 || r.b || r.x) continue;         // на мосту свои перила, фонарям там не место
    const w = roadWidth(r) / 2 + 2.4;
    const p = r.p;
    let acc = 20, side = 1;
    for (let i = 1; i < p.length; i++) {
      const x1 = p[i - 1][0], z1 = p[i - 1][1], x2 = p[i][0], z2 = p[i][1];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1;
      const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      for (let d = 0; d < len; d += 1) {
        acc += 1;
        if (acc < 36) continue;
        acc = 0; side = -side;
        const nx = -uz * side, nz = ux * side;              // от осевой к тротуару
        const px = x1 + ux * d + nx * w, pz = z1 + uz * d + nz * w;
        const near = nearestRoad(px, pz, 7, 1);
        if (near && near.d < near.seg.w / 2 + 1.2) continue;
        if (inHouse(px, pz, 1) || introClear(px, pz, 9) || ZEBRAS.some(q => Math.abs(q.x - px) < 6 && Math.abs(q.z - pz) < 6)) continue;
        const py = groundH(px, pz), ry = Math.atan2(-nx, -nz);
        box(LIT, 0.26, 7.0, 0.26, '#585460', px, py + 3.2, pz);
        box(LIT, 0.22, 0.22, 2.2, '#585460', px - nx * 1.0, py + 6.6, pz - nz * 1.0, ry);
        put(LAMPH, new THREE.BoxGeometry(0.5, 0.16, 0.9), '#fff3c4', px - nx * 1.9, py + 6.45, pz - nz * 1.9, 0, ry, 0);
        LAMP_SPOTS.push([px - nx * 1.9, pz - nz * 1.9]);
      }
    }
  }

  // остановки: будка на тротуаре, развёрнутая к дороге
  for (const s of CITY.stops) {
    const road = nearestRoad(s.p[0], s.p[1], DRIVE_MAX, 1);
    if (!road || road.d > 26) continue;
    const dx = s.p[0] - road.x, dz = s.p[1] - road.z;
    const l = Math.hypot(dx, dz) || 1;
    const px = road.x + dx / l * (road.seg.w / 2 + 2), pz = road.z + dz / l * (road.seg.w / 2 + 2);
    const ry = Math.atan2(dx / l, dz / l);
    const py = groundH(px, pz);
    if (road.seg.b) continue;
    box(LIT, 4.4, 0.25, 2.2, '#e8e2d6', px, py + 2.7, pz, ry);
    // задняя стенка — со стороны домов: ждут лицом к дороге
    box(LIT, 4.4, 3.0, 0.2, '#4f7fd6', px + Math.sin(ry) * 0.9, py + 1.1, pz + Math.cos(ry) * 0.9, ry);
    if (road.seg.g) box(LIT, 5.2, 0.12, 3.0, '#e3ded4', px, py + CURB_H, pz, ry);      // площадка на газоне бульвара
    box(LIT, 0.2, 3.2, 0.2, '#585460', px + Math.cos(ry) * 2.1, py + 1.1, pz - Math.sin(ry) * 2.1, ry);
    box(LIT, 0.2, 3.2, 0.2, '#585460', px - Math.cos(ry) * 2.1, py + 1.1, pz + Math.sin(ry) * 2.1, ry);
    obb(px, pz, 2.3, 1.2, ry);
  }

  // парковки из карты: шлагбаум вешается на въезд ближайшей
  for (const lot of CITY.lots) {
    if (lot.k !== 'park' || PARKINGS.length > 200) continue;
    let cx = 0, cz = 0;
    for (const q of lot.p) { cx += q[0] / lot.p.length; cz += q[1] / lot.p.length; }
    const road = nearestRoad(cx, cz, DRIVE_MAX, 1);
    if (!road || road.d > 40) continue;
    PARKINGS.push({ cx, cz, ex: road.x, ez: road.z });
  }
}

/* ─── Москва: подъезды, деревья вдоль улиц, лавочки и метро из карты ─── */

/* дом по точке: сетка контуров, чтобы не сажать дерево в стену */
const HOUSE_GRID = new Map();
for (const b of CITY.buildings) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++)
    for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
      const k = i + ',' + j;
      if (!HOUSE_GRID.has(k)) HOUSE_GRID.set(k, []);
      HOUSE_GRID.get(k).push(b);
    }
}
function inHouse (x, z, m = 0) {
  for (const b of HOUSE_GRID.get(Math.floor(x / 40) + ',' + Math.floor(z / 40)) || []) {
    if (inPoly(x, z, b.p)) return true;
    if (m) for (const [dx, dz] of [[m, 0], [-m, 0], [0, m], [0, -m]]) if (inPoly(x + dx, z + dz, b.p)) return true;
  }
  return false;
}

/* Подъезды — настоящие, из карты (entrance=*): дверь, козырёк, лампа
   над дверью и ступенька, у части — лавочка и урна. Дом в карте знает,
   где у него подъезды, поэтому они стоят не где попало, а где в жизни. */
function osmEntrances () {
  const osm = CITY.entrances.length;
  for (const e of GEN_ENTR) CITY.entrances.push(e);      // свои подъезды — тоже точки доставки
  for (const [x, z, nx, nz] of CITY.entrances.slice(0, osm)) {
    if (!inBounds(x, z, -60)) continue;
    const ry = Math.atan2(nx, nz), tx = nz, tz = -nx;
    const gy = groundH(x + nx, z + nz);
    entranceAt(x, z, nx, nz, false);
    if (chance(0.4)) {
      const s = chance(0.5) ? 1 : -1;
      bench(x + nx * 3.0 + tx * 2.8 * s, z + nz * 3.0 + tz * 2.8 * s, ry);      // у дорожки, спинкой к дому
    }
  }
  houseWalks();
}

/* Дорожка у подъездов: вдоль всей стены, где двери, — плитка в два метра
   шириной (как отмостка с тротуаром у настоящих домов), с заходом за углы.
   От её конца, что ближе к улице, — тропинка до тротуара. Кусок, что лёг бы
   на асфальт или в соседний дом, пропускаем. Дорожки — и в список дворовых
   (по ним гуляют прохожие, их видно на карте). */
function houseWalks () {
  const walls = new Map();                           // дом → стены с подъездами
  for (const [x, z, nx, nz] of CITY.entrances) {
    if (!inBounds(x, z, -40)) continue;
    const ix = x - nx * 0.6, iz = z - nz * 0.6;
    let hb = null;
    for (const b of HOUSE_GRID.get(Math.floor(ix / 40) + ',' + Math.floor(iz / 40)) || []) if (inPoly(ix, iz, b.p)) { hb = b; break; }
    if (!hb) continue;
    const p = hb.p;
    let bi = -1, bd = 3;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) continue;
    let set = walls.get(hb);
    if (!set) walls.set(hb, set = new Map());
    if (!set.has(bi)) set.set(bi, [nx, nz]);
  }
  const W = 2.0, OFF = 1.35, STEP = 3;
  const onAsphalt = (x, z) => { const r = nearestRoad(x, z, 7, 1); return !!r && r.d < r.seg.w / 2 + 0.6; };
  let n = 0;
  LITM.color('#d9d0c0');
  for (const [b, set] of walls) {
    const p = b.p;
    for (const [i, [nx, nz]] of set) {
      const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 4) continue;
      const ux = dx / len, uz = dz / len;
      // стена наружу — в сторону двери (у кривого контура нормаль ребра и двери совпадают)
      const ox = nx, oz = nz;
      const pts = [];
      for (let d = -0.8; d < len + 0.8 - 0.01; d += STEP) {
        const d2 = Math.min(len + 0.8, d + STEP);
        const x1 = a[0] + ux * d + ox * OFF, z1 = a[1] + uz * d + oz * OFF;
        const x2 = a[0] + ux * d2 + ox * OFF, z2 = a[1] + uz * d2 + oz * OFF;
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        if (onAsphalt(mx, mz) || inHouse(mx, mz, 0.3)) { if (pts.length > 1) { YARD_PATHS.push(pts.slice()); CITY.paths.push(pts.slice()); } pts.length = 0; continue; }
        LITM.ribbon(x1, z1, x2, z2, W, 0.08);
        if (!pts.length) pts.push([x1, z1]);
        pts.push([x2, z2]);
      }
      if (pts.length > 1) { YARD_PATHS.push(pts.slice()); CITY.paths.push(pts.slice()); }
      n++;
      // тропинка до тротуара — от того конца дорожки, что ближе к улице
      let best = null;
      for (const d of [-0.4, len / 2, len + 0.4]) {
        const sx = a[0] + ux * d + ox * (OFF + W / 2), sz = a[1] + uz * d + oz * (OFF + W / 2);
        const r = nearestRoad(sx, sz, DRIVE_MAX, 2);
        if (!r || r.d > 40) continue;
        if (!best || r.d < best.r.d) best = { sx, sz, r };
      }
      if (!best) continue;
      const { sx, sz, r } = best;
      const ddx = sx - r.x, ddz = sz - r.z, dl = Math.hypot(ddx, ddz) || 1;
      const edge = r.seg.w / 2 + (r.seg.c <= 5 ? 2.4 + (r.seg.g || 0) : 0.6);
      const ex = r.x + ddx / dl * edge, ez = r.z + ddz / dl * edge, L = Math.hypot(ex - sx, ez - sz);
      if (L < 1.5 || L > 38) continue;
      let clear = true;
      for (let t = 0.1; clear && t < 0.96; t += 0.08) { const qx = lerp(sx, ex, t), qz = lerp(sz, ez, t); if (inHouse(qx, qz, 0.4) || (t < 0.9 && onAsphalt(qx, qz))) clear = false; }
      if (!clear) continue;
      LITM.ribbon(sx, sz, ex, ez, 1.5, 0.085);
      LITM.disc(ex, ez, 0.75, 0.085, 6);
      YARD_PATHS.push([[sx, sz], [ex, ez]]); CITY.paths.push([[sx, sz], [ex, ez]]);
    }
  }
  BUILD_T.walks = n;
}

/* Деревья: настоящие точки и ряды из карты, а вдоль улиц — липы по
   краю тротуара через каждые тринадцать метров, как на московских
   улицах. У перекрёстков, остановок и зебр не сажаем: заслоняют. */
function osmStreetTrees () {
  for (const [x, z] of CITY.trees) if (!inHouse(x, z, 1.2)) tree(x, z);
  boulevardTrees();
  let n = 0;
  for (const r of CITY.roads) {
    if (!drivable(r) || r.b || r.g || r.c < 2 || r.c > 4 || n > 700) continue;
    const off = roadWidth(r) / 2 + 3.5;
    let acc = rand(0, 13);
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      for (; acc < len; acc += 13) {
        const bx = x1 + ux * acc, bz = z1 + uz * acc;
        const near = NODE_IDX.get(r.p[acc < len / 2 ? i - 1 : i][0] + ',' + r.p[acc < len / 2 ? i - 1 : i][1]);
        if (near !== undefined && nodeDeg(near) >= 3 && Math.min(acc, len - acc) < 14) continue;
        for (const s of [-1, 1]) {
          const x = bx - uz * off * s, z = bz + ux * off * s;
          if (!inBounds(x, z, -50) || inHouse(x, z, 1.5) || chance(0.25)) continue;
          if (ZEBRAS.some(q => Math.abs(q.x - x) < 9 && Math.abs(q.z - z) < 9)) continue;
          if (CITY.stops.some(q => Math.abs(q.p[0] - x) < 8 && Math.abs(q.p[1] - z) < 8)) continue;
          tree(x, z);
          n++;
        }
      }
      acc -= len;
    }
  }
  for (const [x, z] of CITY.benches) if (inBounds(x, z, -40) && !inHouse(x, z, 0.8)) bench(x, z);
}

/* Бульвар: ряд деревьев по середине газона через восемь метров, у
   перекрёстков, зебр и остановок — просвет, чтобы было видно, кто идёт */
function boulevardTrees () {
  let n = 0;
  for (const r of CITY.roads) {
    if (!r.g || !drivable(r) || r.b || n > 1600) continue;
    const off = roadWidth(r) / 2 + r.g / 2;
    let acc = rand(0, 8);
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      const na = NODE_IDX.get(x1 + ',' + z1), nb = NODE_IDX.get(x2 + ',' + z2);
      for (; acc < len; acc += rand(7, 9)) {
        if ((na !== undefined && nodeDeg(na) >= 3 && acc < 16) || (nb !== undefined && nodeDeg(nb) >= 3 && len - acc < 16)) continue;
        const bx = x1 + ux * acc, bz = z1 + uz * acc;
        for (const s of [-1, 1]) {
          const x = bx - uz * off * s, z = bz + ux * off * s;
          if (!inBounds(x, z, -50) || inHouse(x, z, 1.5) || chance(0.08)) continue;
          if (ZEBRAS.some(q => Math.abs(q.x - x) < 7 && Math.abs(q.z - z) < 7)) continue;
          if (CITY.stops.some(q => Math.abs(q.p[0] - x) < 9 && Math.abs(q.p[1] - z) < 9)) continue;
          tree(x, z, 1);
          n++;
        }
      }
      acc -= len;
    }
  }
  BUILD_T.boulTrees = n;
}

/* вход в метро: столб с красной «М», его видно через два квартала */
function osmMetro () {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#e42313'; x.font = 'bold 28px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText($t('М'), 16, 18);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: t });
  for (const m of CITY.metro || []) {
    if (m.k !== 'in') continue;
    const [mx, mz] = m.p, gy = groundH(mx, mz);
    box(LIT, 0.22, 4.2, 0.22, '#585460', mx, gy + 2.1, mz);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat);
    cube.position.set(mx, gy + 4.6, mz);
    scene.add(cube);
    solid(mx - 0.3, mz - 0.3, mx + 0.3, mz + 0.3);
  }
}

/* ─── заведения: вывески, двери, тропинки, въезды ───
   Кафе, аптеки, магазины и банки вокруг Омеги — из карты, с настоящими
   названиями. Вывеска висит на стене, что ближе к улице, в фирменных
   цветах, если бренд известен, а под ней — стеклянная дверь и тропинка
   до тротуара. Все вывески нарисованы в одну текстуру-атлас и лежат
   в одном меше: три сотни табличек — один вызов отрисовки. */
const KIND_SIGN = {
  cafe: ['#6b4a3a', '#fff3d6'], food: ['#c84b3c', '#ffffff'], grocery: ['#3f8f4d', '#ffffff'], pharm: ['#2e9e6a', '#ffffff'],
  bank: ['#1f3f7a', '#ffffff'], pickup: ['#2f5fd0', '#ffffff'], shop: ['#3a6ea8', '#ffffff'], fuel: ['#d0342c', '#ffffff'],
};
const SIGNS = [];                                  // где висят: для тропинок и радара

function osmSigns () {
  const CW = 256, CH = 52, COLS = 8, ROWS = 39;
  const atlas = document.createElement('canvas');
  atlas.width = CW * COLS; atlas.height = CH * ROWS;
  const ax = atlas.getContext('2d');
  const pos = [], uv = [], idx = [];
  let cell = 0;
  for (const poi of CITY.pois) {
    if (!poi.w || cell >= COLS * ROWS) continue;
    const [wx, wz, nx, nz, wl] = poi.w;
    if (!inBounds(wx, wz, -40)) continue;
    // соседние вывески на одной стене — в ряд вверх, больше двух рядов не лепим
    const same = SIGNS.filter(q => Math.hypot(q.x - wx, q.z - wz) < 4.8 && q.nx * nx + q.nz * nz > 0.9);
    if (same.length >= 2) continue;
    const row = same.length;
    const tx = nz, tz = -nx;                        // вдоль стены
    const w = Math.min(4.6, Math.max(2.4, wl - 1)), hgt = w * CH / CW;
    const gy = groundH(wx + nx, wz + nz);
    const y0 = gy + 3.25 + row * (hgt + 0.25);
    // рисуем табличку в свою клетку атласа
    const [bg, fg] = poi.c || KIND_SIGN[poi.k] || KIND_SIGN.shop;
    const cx0 = (cell % COLS) * CW, cy0 = Math.floor(cell / COLS) * CH;
    ax.fillStyle = bg; ax.fillRect(cx0, cy0, CW, CH);
    ax.fillStyle = fg; ax.fillRect(cx0 + 3, cy0 + 3, CW - 6, 2); ax.fillRect(cx0 + 3, cy0 + CH - 5, CW - 6, 2);
    let label = poi.n.length > 26 ? poi.n.slice(0, 25) + '…' : poi.n;
    if (poi.k === 'pharm') label = '✚ ' + label;
    let fs = 30;
    ax.font = 'bold ' + fs + 'px sans-serif';
    while (fs > 11 && ax.measureText(label).width > CW - 16) { fs -= 1; ax.font = 'bold ' + fs + 'px sans-serif'; }
    ax.textAlign = 'center'; ax.textBaseline = 'middle';
    ax.fillText(label, cx0 + CW / 2, cy0 + CH / 2 + 1);
    // квадрат вывески на стене, чуть наружу
    const ox = wx + nx * 0.14, oz = wz + nz * 0.14, vi = pos.length / 3;
    const L = [ox - tx * w / 2, oz - tz * w / 2], R = [ox + tx * w / 2, oz + tz * w / 2];
    pos.push(L[0], y0, L[1], R[0], y0, R[1], R[0], y0 + hgt, R[1], L[0], y0 + hgt, L[1]);
    const u0 = cx0 / atlas.width, u1 = (cx0 + CW) / atlas.width;
    const v0 = 1 - (cy0 + CH) / atlas.height, v1 = 1 - cy0 / atlas.height;
    // L — слева, R — справа, если стоять лицом к стене: текст читается снаружи
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    cell++;
    SIGNS.push({ x: wx, z: wz, nx, nz, n: poi.n, n0: poi.n0, k: poi.k, c: poi.c });
    if (row) continue;
    // дверь со стеклом и козырёк в цвет вывески
    const ry = Math.atan2(nx, nz);
    put(FLAT, new THREE.PlaneGeometry(1.5, 2.3), '#9ec3dc', wx + nx * 0.1, gy + 1.15, wz + nz * 0.1, 0, ry, 0);
    put(FLAT, new THREE.PlaneGeometry(1.6, 0.12), '#3b3742', wx + nx * 0.11, gy + 2.33, wz + nz * 0.11, 0, ry, 0);
    box(LIT, Math.min(w, 3.2), 0.16, 0.9, bg, wx + nx * 0.5, gy + 2.85, wz + nz * 0.5, ry);
    // тропинка до тротуара — если дверь не на нём и путь не идёт сквозь дом
    const road = nearestRoad(wx + nx * 2, wz + nz * 2, 7, 1);
    if (road) {
      const dx = wx - road.x, dz = wz - road.z, dl = Math.hypot(dx, dz) || 1;
      const edge = road.seg.w / 2 + (road.seg.c <= 5 ? 2.6 : 0.8);
      const ex = road.x + dx / dl * edge, ez = road.z + dz / dl * edge;
      const sx = wx + nx * 0.6, sz = wz + nz * 0.6, len = Math.hypot(ex - sx, ez - sz);
      let clear = len > 1.5 && len < 45;
      for (let t = 0.15; clear && t < 0.95; t += 0.1) if (inHouse(lerp(sx, ex, t), lerp(sz, ez, t))) clear = false;
      if (clear) {
        LITM.color('#d6ccbb');
        LITM.ribbon(sx, sz, ex, ez, 1.6, 0.085);
        LITM.disc(ex, ez, 0.8, 0.085, 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(atlas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
}

/* въезд в дом: проём шириной с проезд, рама и рольставни */
function osmGates () {
  for (const [x, z, nx, nz, w] of CITY.gates) {
    if (!inBounds(x, z, -40)) continue;
    const ry = Math.atan2(nx, nz), tx = nz, tz = -nx;
    const gy = groundH(x + nx, z + nz), W = w + 0.6, H = Math.min(4.4, 2.6 + w * 0.3);
    put(FLAT, new THREE.PlaneGeometry(W, H), '#3d3944', x + nx * 0.1, gy + H / 2, z + nz * 0.1, 0, ry, 0);
    for (let y = 0.3; y < H - 0.1; y += 0.42)
      put(FLAT, new THREE.PlaneGeometry(W - 0.2, 0.07), '#56515e', x + nx * 0.12, gy + y, z + nz * 0.12, 0, ry, 0);
    for (const s of [-1, 1]) box(LIT, 0.4, H + 0.3, 0.5, '#8e8a92', x + tx * (W / 2 + 0.2) * s + nx * 0.2, gy + H / 2, z + tz * (W / 2 + 0.2) * s + nz * 0.2, ry);
    box(LIT, W + 1.2, 0.4, 0.5, '#8e8a92', x + nx * 0.2, gy + H + 0.2, z + nz * 0.2, ry);
    // жёлто-чёрная полоса над въездом: видно, что это ворота, а не стена
    for (let i = 0; i < 6; i++) {
      const o = -W / 2 + (i + 0.5) * W / 6;
      box(LIT, W / 6, 0.22, 0.1, i % 2 ? '#1b1a1f' : '#f2c230', x + tx * o + nx * 0.47, gy + H + 0.2, z + tz * o + nz * 0.47, ry);
    }
  }
}

/* Лёгкая машина — для парковок. Каждую модель один раз собираем целиком
   в белом цвете и склеиваем в одну геометрию, запомнив, какие вершины —
   кузов. Машина на парковке — копия шаблона с перекрашенным кузовом: один
   меш и почти даром по времени (собирать сорок деталей на каждую из сотни
   машин — это треть секунды загрузки). Задели — получает полную модель
   с панелями, которые мнутся (см. fullCar). */
const LITE = {};
const LITE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const LITE_BASIC = new THREE.MeshBasicMaterial({ vertexColors: true });
function liteTemplate (model) {
  if (LITE[model]) return LITE[model];
  const g = makeCar('#ffffff', false, model);
  g.updateMatrixWorld(true);
  const lit = [], flat = [];
  g.traverse(o => {
    if (!o.isMesh || !o.visible || Array.isArray(o.material) || o.material.transparent) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (o.material.vertexColors) {
      if (!geo.index) return;
      lit.push(geo);
    } else put(o.material.isMeshBasicMaterial ? flat : lit, geo, '#' + o.material.color.getHexString(), 0, 0, 0);
  });
  const T = { lit: mergeGeos(lit), flat: flat.length ? mergeGeos(flat) : null, hl: g.userData.hl };
  // кузов — вершины, покрашенные в белый или в его тёмный оттенок
  const c = T.lit.attributes.color.array;
  T.mask = new Uint8Array(c.length / 3);
  for (let i = 0; i < T.mask.length; i++) {
    const r = c[i * 3], gg = c[i * 3 + 1], b = c[i * 3 + 2];
    if (Math.abs(r - gg) < 0.01 && Math.abs(gg - b) < 0.01 && (r > 0.99 || Math.abs(r - 0.78) < 0.02)) T.mask[i] = r > 0.99 ? 1 : 2;
  }
  g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (!Array.isArray(o.material)) o.material.dispose(); } });
  return (LITE[model] = T);
}
const LC = new THREE.Color(), LD = new THREE.Color();
function makeCarLite (hex, model) {
  const T = liteTemplate(model);
  const geo = T.lit.clone();
  const col = geo.attributes.color.array;
  LC.set(hex); LD.copy(LC).multiplyScalar(0.78);
  for (let i = 0; i < T.mask.length; i++) {
    const m = T.mask[i];
    if (!m) continue;
    const q = m === 1 ? LC : LD;
    col[i * 3] = q.r; col[i * 3 + 1] = q.g; col[i * 3 + 2] = q.b;
  }
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(geo, LITE_MAT));
  if (T.flat) g.add(new THREE.Mesh(T.flat, model === 'cn' ? RL.LED_MAT : LITE_BASIC));   // LED китайца ночью не темнеет
  g.userData = { lite: true, hl: T.hl, wheels: [], steer: [], panels: [], glass: [], hazard: [], dmg: 0, bodyHex: hex, model };
  return g;
}
/* задели лёгкую машину — ставим полную: у неё панели мнутся по-настоящему */
function fullCar (t) {
  if (!t.mesh.userData.lite) return;
  const old = t.mesh;
  t.mesh = makeCar(old.userData.bodyHex, false, old.userData.model);
  t.mesh.position.copy(old.position);
  t.mesh.rotation.copy(old.rotation);
  scene.remove(old);
  old.children[0].geometry.dispose();
  scene.add(t.mesh);
}

/* ─── рампы ───
   Во дворах, на проездах и парковках стоят трамплины: жёлто-чёрный клин
   в шесть метров длиной и метр с небольшим высотой. Въехал на скорости —
   с верхней кромки машина уходит в полёт по дуге. Сзади клин — стенка,
   а над ней в полёте пролетаешь. */
const RAMPS = [];
const RAMP_L = 6, RAMP_W = 3.6, RAMP_H = 1.3;

function addRamp (x, z, ux, uz) {
  const rx = -uz, rz = ux, y = groundH(x, z);
  const P = (u, v, h) => [x + ux * u + rx * v, y + h, z + uz * u + rz * v];
  const quad = (a, b, c, d, hex) => {
    LITM.color(hex);
    LITM.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], 0, 1, 0);
  };
  // скат — полосами, чтобы читался как трамплин
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u0 = -RAMP_L / 2 + i * RAMP_L / n, u1 = u0 + RAMP_L / n;
    const h0 = RAMP_H * i / n, h1 = RAMP_H * (i + 1) / n;
    quad(P(u0, -RAMP_W / 2, h0 + 0.02), P(u1, -RAMP_W / 2, h1 + 0.02), P(u1, RAMP_W / 2, h1 + 0.02), P(u0, RAMP_W / 2, h0 + 0.02), i % 2 ? '#1f1d24' : '#f2c230');
  }
  // бока и задняя стенка
  LITM.color('#8e8a92');
  for (const v of [-RAMP_W / 2, RAMP_W / 2]) {
    const a = P(-RAMP_L / 2, v, 0), b = P(RAMP_L / 2, v, 0), c = P(RAMP_L / 2, v, RAMP_H);
    LITM.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], rx, 0, rz);
  }
  quad(P(RAMP_L / 2, -RAMP_W / 2, 0), P(RAMP_L / 2, RAMP_W / 2, 0), P(RAMP_L / 2, RAMP_W / 2, RAMP_H), P(RAMP_L / 2, -RAMP_W / 2, RAMP_H), '#6d6874');
  const back = obb(x + ux * (RAMP_L / 2 - 0.4), z + uz * (RAMP_L / 2 - 0.4), 0.4, RAMP_W / 2, Math.atan2(uz, ux));
  back.ramp = y + RAMP_H;
  back.rux = ux; back.ruz = uz;                     // куда смотрит скат: съезжающих вперёд стенка не держит
  RAMPS.push({ x, z, ux, uz, y });
}

function osmRamps () {
  const segs = RSEG.filter(q => q.c === 7 && !q.x && Math.hypot(q.x2 - q.x1, q.z2 - q.z1) > 24);
  for (let k = 0; k < 400 && RAMPS.length < 14 && segs.length; k++) {
    const q = pick(segs), t = rand(0.35, 0.65);
    const x = lerp(q.x1, q.x2, t), z = lerp(q.z1, q.z2, t);
    if (!inBounds(x, z, 40) || RAMPS.some(r => Math.hypot(r.x - x, r.z - z) < 90)) continue;
    if (PIZZA && Math.hypot(PIZZA.x - x, PIZZA.z - z) < 40) continue;
    const l = Math.hypot(q.x2 - q.x1, q.z2 - q.z1), s = chance(0.5) ? 1 : -1;
    addRamp(x, z, (q.x2 - q.x1) / l * s, (q.z2 - q.z1) / l * s);
  }
}

/* высота рампы в точке: 0 — не на ней */
function rampLift (x, z) {
  for (const r of RAMPS) {
    const dx = x - r.x, dz = z - r.z;
    if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
    const u = dx * r.ux + dz * r.uz, v = -dx * r.uz + dz * r.ux;
    if (Math.abs(v) > RAMP_W / 2 || u < -RAMP_L / 2 || u > RAMP_L / 2) continue;
    return RAMP_H * (u + RAMP_L / 2) / RAMP_L;
  }
  return 0;
}

/* ─── парковки ───
   Площадки amenity=parking из карты: асфальт, разметка мест и машины
   рядами, как во всех московских дворах. Живыми — такими, что мнутся и
   взрываются, — оставляем три десятка ближайших к пиццерии: каждая такая
   машина — два десятка мешей. Остальные — коробки в общей склейке, у
   каждой своё препятствие. */
function osmParkingLots (near) {
  const spots = [];
  for (const lot of CITY.lots) {
    if (lot.k !== 'park') continue;
    const p = lot.p, n = p.length;
    LITM.color('#a6abb3');
    LITM.poly(p, 0.11);
    // ряды — вдоль самой длинной стороны площадки
    let best = 0, ux = 1, uz = 0;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > best) { best = l; ux = (c[0] - a[0]) / l; uz = (c[1] - a[1]) / l; }
    }
    const rx = -uz, rz = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of p) {
      const u = q[0] * ux + q[1] * uz, v = q[0] * rx + q[1] * rz;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const edgeD = (x, z) => {
      let d = Infinity;
      for (let i = 0; i < n; i++) {
        const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1];
        const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
      }
      return d;
    };
    for (let v = v0 + 3; v < v1 - 2.5; v += 5.6)
      for (let u = u0 + 1.6; u < u1 - 1.4; u += 2.7) {
        const x = u * ux + v * rx, z = u * uz + v * rz;
        if (!inPoly(x, z, p) || edgeD(x, z) < 1.5) continue;
        const road = nearestRoad(x, z, 7, 1);
        if (road && road.d < road.seg.w / 2 + 2.2) continue;         // проезд между рядами не занимаем
        // место: две полоски по бокам
        FLATM.color('#eeeae0');
        for (const s of [-1.35, 1.35])
          FLATM.ribbon(x + ux * s - rx * 2.2, z + uz * s - rz * 2.2, x + ux * s + rx * 2.2, z + uz * s + rz * 2.2, 0.14, 0.17);
        if (chance(0.4)) spots.push([x, z, Math.atan2(rx, rz) + (chance(0.5) ? Math.PI : 0)]);
      }
  }
  spots.sort((a, b) => Math.hypot(a[0] - near.x, a[1] - near.z) - Math.hypot(b[0] - near.x, b[1] - near.z));
  // все стоящие — живые: их толкают, мнут и взрывают, как любые другие.
  // Больше полутора сотен не ставим: остальные места пустые
  spots.forEach((q, i) => { if (i < 150 && Math.hypot(q[0] - near.x, q[1] - near.z) > 14) PARKED.push(q); });
}

/* ─── пиццерия ───
   «Птица Пицца» — на первом этаже бизнес-центра на Ленинской Слободе, 19. Дом строится как все остальные, а на
   фасад, что смотрит на Ленинскую Слободу, вешаем вывеску, козырёк,
   витрину и дверь. */
/* Дом пиццерии — из настроек карты: по адресу (Москва) или по точке
   (Северск: meta.home — где пиццерия стоит в карте) */
function homeBuilding () {
  const H = MAP.home || {};
  if (H.street) return CITY.buildings.find(q => q.a && H.street.test(q.a[0]) && q.a[1] === H.house);
  const pt = H.point || CITY.meta.home;
  if (!pt) return null;
  let best = null, bd = 60;
  for (const q of CITY.buildings) {
    if (inPoly(pt[0], pt[1], q.p)) return q;
    for (const v of q.p) { const d = Math.hypot(v[0] - pt[0], v[1] - pt[1]); if (d < bd) { bd = d; best = q; } }
  }
  return best;
}
const homeAddr = () => { if (MAP.home && MAP.home.addr) return MAP.home.addr; const b = homeBuilding(); return b && b.a ? b.a.join(', ') : ''; };
function dodoHouse () {
  const b = homeBuilding();
  if (!b) return null;
  const p = b.p, n = p.length;
  let cx = 0, cz = 0;
  for (const q of p) { cx += q[0]; cz += q[1]; }
  cx /= n; cz /= n;
  let best = null;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n];
    const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 8) continue;
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    let ox = -dz / len, oz = dx / len;
    if (ox * (mx - cx) + oz * (mz - cz) < 0) { ox = -ox; oz = -oz; }     // наружу из дома
    const road = nearestRoad(mx + ox * 4, mz + oz * 4, 4, 1);           // улица, не дворовый проезд
    if (!road) continue;
    const score = road.d - len * 0.15 - (MAP.home && MAP.home.street && MAP.home.street.test(road.seg.name) ? 30 : 0);
    if (!best || score < best.score) best = { score, mx, mz, ox, oz, ux: dx / len, uz: dz / len, len, road, cx, cz };
  }
  return best;
}

/* вывеска «Птицы Пиццы»: красная плашка, жёлтая птичка-логотип и надпись */
function birdLogo (x, cx, cy, s) {
  x.fillStyle = '#ffd23f';
  x.beginPath(); x.ellipse(cx, cy, 9 * s, 7 * s, 0, 0, 7); x.fill();              // тело
  x.beginPath(); x.arc(cx + 7 * s, cy - 6 * s, 5 * s, 0, 7); x.fill();             // голова
  x.fillStyle = '#ff8a2b';
  x.beginPath(); x.moveTo(cx + 11 * s, cy - 7 * s); x.lineTo(cx + 16 * s, cy - 5 * s); x.lineTo(cx + 11 * s, cy - 3 * s); x.fill();   // клюв
  x.fillStyle = '#f2b43a';
  x.beginPath(); x.moveTo(cx - 3 * s, cy - 2 * s); x.lineTo(cx - 12 * s, cy - 9 * s); x.lineTo(cx - 6 * s, cy + 3 * s); x.fill();     // крыло
  x.fillStyle = '#1b1a1f'; x.beginPath(); x.arc(cx + 8 * s, cy - 7 * s, 1.2 * s, 0, 7); x.fill();
}
function signTex () {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#f0522a'; x.fillRect(0, 0, 256, 32);
  birdLogo(x, 22, 18, 1.2);
  x.fillStyle = '#ffffff'; x.font = 'bold 20px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(OWN.pizza().toUpperCase(), 140, 17);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function dodoFacade (f) {
  const ry = Math.atan2(f.ox, f.oz);                  // модель смотрит в +Z — значит, на улицу
  const gy = groundH(f.mx + f.ox * 1.5, f.mz + f.oz * 1.5);
  const at = (along, out) => [f.mx + f.ux * along + f.ox * out, f.mz + f.uz * along + f.oz * out];
  const w = Math.min(f.len - 3, 18);

  const [sx, sz] = at(0, 0.35);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshBasicMaterial({ map: signTex() }));
  sign.position.set(sx, gy + 5.2, sz);
  sign.rotation.y = ry;
  scene.add(sign);
  PZ.cozyFront(pizzaApi(), f, gy, w);                // маркиза с гирляндой, тёплая витрина, столики
  COURIER_SLOTS = PZ.courierLot(pizzaApi(), f, RIVAL_SPEC.length + 1);
  const [dx2, dz2] = at(w / 2 - 2.2, 0.14);
  put(FLAT, new THREE.PlaneGeometry(2.2, 2.9), '#6b4c3a', dx2, gy + 1.45, dz2, 0, ry, 0);  // дверь

  // подъезжать — в ближнюю к дому полосу проспекта
  const r = f.road;
  const ddx = f.mx - r.x, ddz = f.mz - r.z, dl = Math.hypot(ddx, ddz) || 1;
  const off = Math.min(LANE, Math.max(0, dl - 4));
  const [wx, wz] = at(0, 0.8);                          // окно выдачи: отсюда вылетает коробка
  const [sx2, sz2] = at(w / 2 + 6, 3.2);
  SMOKE_SPOT = { x: sx2, z: sz2 };
  PIZZA = {
    x: r.x + ddx / dl * off, z: r.z + ddz / dl * off,
    bx: f.cx, bz: f.cz, by: gy, wx, wz, wy: gy + 2.4, name: OWN.pizza() + ' · ' + translit(homeAddr()),
  };
}

/* Запасной вариант, если дома с пиццерией в выгрузке нет: отдельная
   коробка на ближайшем к центру общепите, фасадом к улице. */
function buildPizzeria (cx, cz, ry) {
  const w = 22, d = 14, h = 8;
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const at = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
  const gy = groundH(cx, cz);

  box(LIT, w, h + 2, d, '#f4eee5', cx, gy + h / 2 - 0.8, cz, ry);
  box(LIT, w + 1.4, 1, d + 1.4, '#b0a2a9', cx, gy + h + 0.6, cz, ry);
  const [sx, sz] = at(0, d / 2 + 0.3);
  box(FLAT, w - 4, 2.4, 0.5, '#f0522a', sx, gy + h - 1.4, sz, ry);              // вывеска
  const [kx, kz] = at(0, d / 2 + 1.4);
  box(LIT, w - 2, 0.5, 3.2, '#f0522a', kx, gy + 4.6, kz, ry);                   // козырёк
  const [vx, vz] = at(0, d / 2 + 0.1);
  put(FLAT, new THREE.PlaneGeometry(w - 6, 3.4), '#cfe3f2', vx, gy + 2.4, vz, 0, ry, 0);
  const [dx2, dz2] = at(w / 2 - 4, d / 2 + 0.12);
  put(FLAT, new THREE.PlaneGeometry(3, 3.4), '#6b4c3a', dx2, gy + 1.92, dz2, 0, ry, 0);
  obb(cx, cz, w / 2, d / 2, ry);

  const [px, pz] = at(0, d / 2 + 11);        // куда подъезжать
  const [wx, wz] = at(0, d / 2 + 0.6);      // окно выдачи: отсюда вылетает коробка
  PIZZA = { x: px, z: pz, bx: cx, bz: cz, by: gy, wx, wz, wy: gy + 2.6, name: $t('пиццерия') };
}

/* где стоит запасная пиццерия: точка Додо из карты, а если её нет —
   ближайший к центру общепит */
function pizzaSpot () {
  const dodo = CITY.pois.filter(p => /додо|dodo/i.test(p.n0 || ''));
  const food = CITY.pois.filter(p => p.k === 'food');
  const list = (dodo.length ? dodo : food.length ? food : CITY.pois).slice()
    .sort((a, b) => Math.hypot(a.p[0], a.p[1]) - Math.hypot(b.p[0], b.p[1]));
  for (const p of list) {
    const road = nearestRoad(p.p[0], p.p[1], DRIVE_MAX, 2);
    if (!road || road.d < 14 || road.d > 60) continue;    // не на полотне и не в глуши
    return { x: p.p[0], z: p.p[1], ry: Math.atan2(p.p[0] - road.x, p.p[1] - road.z), road };
  }
  const p = list[0] || { p: [0, 0] };
  const road = nearestRoad(p.p[0], p.p[1], DRIVE_MAX, 4);
  return { x: p.p[0], z: p.p[1], ry: road ? Math.atan2(p.p[0] - road.x, p.p[1] - road.z) : 0, road };
}

/* что нужно mapworks.js (тупики, ремонт, ?mapcheck) из игры: сам он переменных
   этого модуля не видит. Списки — геттерами: часть объявлена ниже по файлу */
SM_WORD.cone = $t('конус');
const mapApi = () => ({
  THREE, scene, cam, V, S, CITY, TH, LIT, LITM, FLAT, box, put, mergeGeos, obb, smashAdd, makeHuman, gibHuman, toast,
  groundH, surfaceAt, curbAt, inHouse, inBounds, nearestRoad, ROAD_HEX, RAISED, SOLIDS, BRIDGES,
  onRunOver: () => { S.people++; toast($t('минус дорожник')); },
  get TRAFFIC () { return TRAFFIC; }, get PEOPLE () { return PEOPLE; }, get PEDS () { return PEDS; }, get SCOOTS () { return SCOOTS; },
  get CROWDS () { return CROWDS; }, get DRIVERS () { return DRIVERS; }, get SMOKERS () { return SMOKERS; },
});
let MAPW_API = null;
/* что нужно roadlife.js (знаки, заборы, пробки за авариями, ремонт) */
const roadApi = () => ({
  THREE, scene, cam, V, S, CITY, box, put, mergeGeos, obb, smashAdd, SMASH, SM_WORD, SOLIDS, SOLID_GRID, SCELL, PARKED, DRIVE_MAX,
  groundH, curbAt, inHouse, inPoly, inBounds, nearestRoad, NODES, NODE_IDX, edgeOf, edgeRun, laneCount, laneOff, routeNodes, nodeNear, nearestNode,
  walkLeg, walkSpawn, walkersAll,
  ZEBRAS, SIG_GROUPS, TRAFFIC, ACCIDENTS, newCar, placeTraffic, poseTraffic, poseOnSlope, svcGone, makeHuman, dropMesh, gibHuman, sayBubble, Snd, toast, calmStart,
  onRunOver: w => { S.people++; toast(w === 'driver' ? $t('минус зевака') : $t('минус дорожник')); },
  get PIZZA () { return PIZZA; }, get ENV () { return ENV; }, get tG () { return tG; },
});
let RL_API = null;
/* что нужно citybits.js (забор, КПП, рельсы, крыши, купола, вывески ТЦ) */
/* что нужно pizzeria.js: ламповый фасад и парковка курьеров */
const pizzaApi = () => ({
  THREE, scene, LIT, FLAT, LITM, FLATM, LAMPH, LAMP_SPOTS, box, put, smashAdd, groundH, inHouse,
  onRoad: (x, z, m) => { const r = nearestRoad(x, z, 7, 1); return !!r && r.d < r.seg.w / 2 + m; },
  onOtherRoad: (x, z, seg) => { const r = nearestRoad(x, z, 7, 1); return !!r && r.seg !== seg && r.d < r.seg.w / 2 + 0.3; },
});
/* места на парковке курьеров: [0] — твоё, дальше — соперников */
let COURIER_SLOTS = null;
const cityApi = () => ({ THREE, scene, LIT, FLAT, LITM, FLATM, LAMPH, LAMP_SPOTS, box, put, obb, groundH, nearestRoad, makeHuman });
const landApi = () => ({ ...cityApi(), inHouse, makePerson });
let RINK = null;                                  // каток с катающимися (landmarks.js), если он есть в карте

/* ─── сборка города ─── */
const BUILD_T = {};                               // сколько собирался каждый кусок — для отладки
function buildCity () {
  const house = dodoHouse();
  const spot = house ? null : pizzaSpot();
  const tm0 = (k, f) => { const t0 = performance.now(); f(); BUILD_T[k] = Math.round(performance.now() - t0); };
  tm0('ground', osmGround);
  tm0('roads', osmRoads);
  tm0('curbs', osmCurbs);
  tm0('marks', osmMarkings);
  tm0('bridges', osmBridges);
  tm0('edge', osmEdgeBlocks);
  if (CITY.rails) tm0('rails', () => { BUILD_T.railKm = Math.round(CBITS.buildRails(cityApi(), CITY.rails, CITY.levelx)); });
  if (MAPFIX) { BUILD_T.mapfix = Math.round(MAPFIX.ms); BUILD_T.mapfixT = MAPFIX.T; tm0('mapworks', () => MAPW.buildWorks(MAPFIX, mapApi())); }   // тупики: блоки и ремонт
  { const t0 = performance.now(); osmBuildings(spot); BUILD_T.houses = Math.round(performance.now() - t0); }
  if (house) dodoFacade(house);
  else buildPizzeria(spot.x, spot.z, spot.ry);
  // во вступлении место под кружок знаем заранее — его держим пустым

  const tm = (k, f) => { const t0 = performance.now(); f(); BUILD_T[k] = Math.round(performance.now() - t0); };
  tm('life', osmStreetLife);
  tm('entr', osmEntrances);
  tm('signs', osmSigns);
  tm('gates', osmGates);
  tm('trees', osmStreetTrees);
  tm('metro', osmMetro);
  tm('lots', () => osmParkingLots(PIZZA));
  tm('lights', buildLights);
  tm('ramps', osmRamps);
  tm('drinkit', placeDrinkits);
  tm('landmarks', () => {                          // заправки из карты, каток — если карта его назвала
    BUILD_T.fuel = LM.buildFuel(landApi(), CITY.pois);
    if (MAP.landmarks && MAP.landmarks.rink) RINK = LM.buildRink(landApi(), CITY.green, MAP.landmarks.rink);
  });
  tm('roadlife', () => RL.build(roadApi()));      // знаки и заборы (roadlife.js) — до smashBuild
  tm('yard', () => { osmPitches(); osmYardBits(); osmVerandas(); SEAS.seasonYard(); smashBuild(); });
  tm('seasons', SEAS.seasonBuild);                // сугробы, ёлки, гирлянды

  const tq = performance.now();
  const litG = LITM.mesh(SEAS.seasonMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
  const flatG = FLATM.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  BUILD_T.mesh = Math.round(performance.now() - tq);
  /* Всю статику — сразу в видеокарту, одним кадром в крохотную цель:
     иначе куски, которых ещё не было в кадре, держат свои вершины и в
     памяти JS (onUpload их отпускает только после загрузки) */
  const tu = performance.now();
  const tmp = new THREE.Scene(), rt = new THREE.WebGLRenderTarget(4, 4);
  for (const g of [litG, flatG]) { for (const m of g.children) m.frustumCulled = false; tmp.add(g); }
  renderer.setRenderTarget(rt); renderer.render(tmp, cam); renderer.setRenderTarget(null); rt.dispose();
  for (const g of [litG, flatG]) { for (const m of g.children) m.frustumCulled = true; scene.add(g); }
  BUILD_T.upload = Math.round(performance.now() - tu);
  BUILD_T.tris = Math.round(BUILT_TRIS);
  MAPW.freeAsphalt();
}

/* ─────────────── граф улиц: маршрут, полосы, светофоры, зебры ───────────────
   Узлы — точки карты, рёбра — куски улиц между ними. Перекрёстки в
   выгрузке сохранены специально (scripts/osm_moscow.py режет линию на
   куски по общим узлам), иначе улица и переулок в графе просто не
   встретились бы. Поиск в ширину даёт кратчайший путь для навигатора;
   ехать по нему или дворами — дело водителя.

   Каждое ребро хранится в обе стороны: у направления своя правая
   сторона, свои полосы и своё «можно ли сюда ехать» — на односторонней
   улице трафик против шерсти не поедет. */

const NODES = [];
const NODE_IDX = new Map();
const EDGES = new Map();                          // направленные рёбра
const ekey = (a, b) => a * 100000 + b;
const edgeOf = (a, b) => EDGES.get(ekey(a, b));
const ukey = (a, b) => (a < b ? ekey(a, b) : ekey(b, a));    // ребро без направления
{
  const node = (x, z) => {
    const k = x + ',' + z;
    let i = NODE_IDX.get(k);
    if (i === undefined) { i = NODES.length; NODE_IDX.set(k, i); NODES.push({ x, z, nb: [] }); }
    return i;
  };
  const link = (a, b, r, okAB, okBA) => {
    if (EDGES.has(ekey(a, b))) return;            // две улицы по одним узлам — берём первую
    const A = NODES[a], B = NODES[b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    if (len < 0.3) return;
    const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len, w = roadWidth(r);
    const mk = (from, to, ok, sg) => ({
      a: from, b: to, len, ux: ux * sg, uz: uz * sg, rx: -uz * sg, rz: ux * sg,
      w, c: r.c, ok, oneway: !!r.o, lanes: r.l || 0, road: r, tA: 0, tB: 0, sig: null, stopAt: 0,
    });
    A.nb.push(b); B.nb.push(a);
    EDGES.set(ekey(a, b), mk(a, b, okAB, 1));
    EDGES.set(ekey(b, a), mk(b, a, okBA, -1));
  };
  for (const r of CITY.roads) {
    if (!drivable(r)) continue;                    // пешеходка и обрывки за рамкой не в счёт
    let prev = node(r.p[0][0], r.p[0][1]);
    for (let i = 1; i < r.p.length; i++) {
      const cur = node(r.p[i][0], r.p[i][1]);
      if (cur === prev) continue;
      link(prev, cur, r, true, !r.o);
      prev = cur;
    }
  }
}
// номера узлов на концах куска (b у куска уже занято — это мост)
for (const s of RSEG) { s.na = NODE_IDX.get(s.x1 + ',' + s.z1); s.nb = NODE_IDX.get(s.x2 + ',' + s.z2); }

/* узлов тысячи, перебирать их на каждый пересчёт маршрута
   незачем — раскладываем по клеткам сто двадцать метров */
const NCELL = 120, NODE_GRID = new Map();
for (let k = 0; k < NODES.length; k++) {
  const key = Math.floor(NODES[k].x / NCELL) + ',' + Math.floor(NODES[k].z / NCELL);
  let a = NODE_GRID.get(key);
  if (!a) NODE_GRID.set(key, a = []);
  a.push(k);
}

function nearestNode (x, z) {
  const ci = Math.floor(x / NCELL), cj = Math.floor(z / NCELL);
  let best = -1, bd = Infinity;
  for (let ring = 1; ring <= 8; ring++) {
    for (let i = ci - ring; i <= ci + ring; i++)
      for (let j = cj - ring; j <= cj + ring; j++) {
        const a = NODE_GRID.get(i + ',' + j);
        if (!a) continue;
        for (const k of a) {
          const d = (NODES[k].x - x) ** 2 + (NODES[k].z - z) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
      }
    if (best >= 0) break;
  }
  return best < 0 ? 0 : best;
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

/* Полосы. На двусторонней улице половина полотна — своё направление,
   на односторонней всё полотно. Полоса 0 — крайняя правая, у бордюра;
   смещение считается от осевой вдоль правой нормали ребра. */
function laneCount (e) {
  if (e.oneway) return e.lanes || Math.max(1, Math.round(e.w / 3.3));
  return e.lanes ? Math.max(1, Math.floor(e.lanes / 2)) : (e.w >= 12.5 ? 2 : 1);
}
function laneOff (e, k) {
  const n = laneCount(e), lw = (e.oneway ? e.w : e.w / 2) / n;
  return e.w / 2 - lw * (Math.min(k, n - 1) + 0.5);
}

/* Обрезка у перекрёстка. Машина едет по ребру не от узла до узла, а от
   края перекрёстка до края, а сам перекрёсток проходит дугой. На изломе
   улицы (узел с двумя рёбрами) дуга маленькая, на прямой её нет вовсе. */
const nodeDeg = n => NODES[n].nb.length;
for (let n = 0; n < NODES.length; n++) {
  const N = NODES[n], deg = N.nb.length;
  let maxW = 0;
  for (const m of N.nb) maxW = Math.max(maxW, edgeOf(n, m).w);
  let t = 0;
  if (deg >= 3) t = maxW / 2 + 1.2;
  else if (deg === 2) {
    const e1 = edgeOf(n, N.nb[0]), e2 = edgeOf(n, N.nb[1]);
    const straight = -(e1.ux * e2.ux + e1.uz * e2.uz);          // 1 — улица идёт прямо
    if (straight < 0.96) t = Math.min(6, maxW / 2);
  }
  for (const m of N.nb) {
    const e = edgeOf(n, m), tt = Math.min(t, e.len * 0.42);
    e.tA = tt; edgeOf(m, n).tB = tt;
  }
}
const edgeRun = e => Math.max(0.2, e.len - e.tA - e.tB);   // сколько ехать по ребру до дуги

/* ── светофоры ──
   Настоящие — из карты (highway=traffic_signals), а на пересечениях двух
   больших улиц, где в карте светофора нет, ставим свой. Узлы одного
   перекрёстка (у разделённых проспектов их по четыре) собираются в
   группу; у группы две фазы: вдоль главной улицы и поперёк. Внутри
   группы машина не останавливается — только на въезде в неё. */
const ZW = 3.4;                                    // ширина зебры вдоль дороги
const inBounds = (x, z, m = 0) => x > BOUNDS.x0 + m && x < BOUNDS.x1 - m && z > BOUNDS.z0 + m && z < BOUNDS.z1 - m && (m < 0 || inBorderM(x, z, m));
const SIG_GROUPS = [];
{
  const centers = [];
  for (const [x, z] of CITY.signals) if (inBounds(x, z, -10)) centers.push({ x, z, real: 1 });
  // свои: перекрёсток, где сходятся две разные улицы не меньше третьего класса
  for (let n = 0; n < NODES.length; n++) {
    const N = NODES[n];
    if (N.nb.length < 3 || !inBounds(N.x, N.z, 20)) continue;
    const names = new Set();
    for (const m of N.nb) { const e = edgeOf(n, m); if (e.c <= 3) names.add(e.road.n || e.road); }
    if (names.size < 2) continue;
    if (centers.some(c => Math.hypot(c.x - N.x, c.z - N.z) < 70)) continue;
    centers.push({ x: N.x, z: N.z, real: 0 });
  }
  // центры ближе сорока метров — один перекрёсток
  const used = new Array(centers.length).fill(false);
  for (let i = 0; i < centers.length; i++) {
    if (used[i]) continue;
    const cl = [centers[i]]; used[i] = true;
    for (let k = 0; k < cl.length; k++)
      for (let j = 0; j < centers.length; j++)
        if (!used[j] && Math.hypot(centers[j].x - cl[k].x, centers[j].z - cl[k].z) < 40) { used[j] = true; cl.push(centers[j]); }
    const nodes = new Set();
    for (let n = 0; n < NODES.length; n++) {
      const N = NODES[n];
      if (N.nb.length < 3) continue;
      if (cl.some(c => Math.hypot(c.x - N.x, c.z - N.z) < 24)) nodes.add(n);
    }
    // светофор посреди улицы — у перехода: ближайший узел, даже если это излом
    if (!nodes.size) {
      const c = cl[0], k = nearestNode(c.x, c.z);
      if (Math.hypot(NODES[k].x - c.x, NODES[k].z - c.z) < 14) nodes.add(k);
    }
    if (!nodes.size) continue;
    const g = { nodes, app: [], real: cl.some(c => c.real), x: 0, z: 0 };
    for (const n of nodes) { g.x += NODES[n].x / nodes.size; g.z += NODES[n].z / nodes.size; }
    for (const n of nodes)
      for (const m of NODES[n].nb) {
        if (nodes.has(m)) continue;
        const e = edgeOf(m, n);
        if (e.c <= 5) g.app.push(e);
      }
    if (g.app.length < 2) continue;
    // главная ось — по самой крупной улице, дальше всё поперёк неё
    const main = g.app.slice().sort((p, q) => p.c - q.c || q.len - p.len)[0];
    for (const e of g.app) {
      const ph = Math.abs(e.ux * main.ux + e.uz * main.uz) >= 0.7 ? 0 : 1;
      // стоп-линия — перед зеброй; если ребро короткое, зебры нет, стоим у края
      const room = e.len - e.tA - e.tB;
      const zeb = room > ZW + 6;
      e.sig = { g, ph, zeb };
      e.stopAt = e.tB + (zeb ? ZW + 1.4 : 0.6);
    }
    SIG_GROUPS.push(g);
  }
}

/* ── зебры ──
   На каждом въезде в регулируемый перекрёсток, там, где переход стоит в
   карте, и на части нерегулируемых перекрёстков. Зебра знает ребро, на
   котором лежит, — по ней пешеходы и переходят улицу, а машины перед
   ней пропускают тех, кто уже вышел на полотно. */
const ZEBRAS = [];
const ZEB_BY_EDGE = new Map();
function addZebra (a, b, dA, sig) {
  // dA — расстояние от узла a вдоль ребра a→b до середины зебры
  const e = edgeOf(a, b), A = NODES[a];
  const x = A.x + e.ux * dA, z = A.z + e.uz * dA;
  if (ZEBRAS.some(q => Math.hypot(q.x - x, q.z - z) < 9)) return null;
  const zb = { a, b, d: dA, x, z, ux: e.ux, uz: e.uz, w: e.w, sig, e };
  ZEBRAS.push(zb);
  const k = ukey(a, b);
  let l = ZEB_BY_EDGE.get(k);
  if (!l) ZEB_BY_EDGE.set(k, l = []);
  l.push(zb);
  return zb;
}
for (const g of SIG_GROUPS)
  for (const e of g.app)
    if (e.sig.zeb) addZebra(e.a, e.b, e.len - e.tB - ZW / 2 - 0.3, e.sig);
for (const [x, z] of CITY.crossings) {
  const road = nearestRoad(x, z, 4, 1);
  if (!road || road.d > 5 || road.seg.na === undefined || road.seg.nb === undefined) continue;
  const e = edgeOf(road.seg.na, road.seg.nb);
  if (!e || e.len - e.tA - e.tB < ZW + 2) continue;
  const dA = clamp(road.t * e.len, e.tA + ZW / 2 + 0.3, e.len - e.tB - ZW / 2 - 0.3);
  // рядом с регулируемым перекрёстком переход живёт по его светофору
  const into = edgeOf(e.a, e.b).sig || edgeOf(e.b, e.a).sig;
  addZebra(e.a, e.b, dA, into && Math.hypot(x - into.g.x, z - into.g.z) < 45 ? into : null);
}
for (let n = 0; n < NODES.length; n++) {
  const N = NODES[n];
  if (N.nb.length < 3 || !inBounds(N.x, N.z, 30) || Math.random() > 0.45) continue;
  if (ZEBRAS.some(q => Math.hypot(q.x - N.x, q.z - N.z) < 30)) continue;
  for (const m of N.nb) {
    const e = edgeOf(m, n);
    if (e.c > 4 || e.len - e.tA - e.tB < ZW + 6) continue;
    addZebra(m, n, e.len - e.tB - ZW / 2 - 0.3, null);
  }
}

/* светофорный цикл: одна фаза едет, другая стоит, между ними жёлтый
   и пара секунд «все стоят» — чтобы перекрёсток успел опустеть */
const TL_PLAN = [[0, 'g', 14], [0, 'y', 2.5], [-1, 'r', 2], [1, 'g', 11], [1, 'y', 2.5], [-1, 'r', 2]];
const TL = { t: 0, i: 0 };
const lightOf = ph => (TL_PLAN[TL.i][0] === ph ? TL_PLAN[TL.i][1] : 'r');

/* ─────────────── эффекты: искры, дым, огонь, кровь, следы ───────────────
   Один список на всё: у частицы своя скорость, время жизни и то,
   как она гаснет. Материалы клонируются — иначе гаснут все разом. */

const FX = [], DECALS = [];
const sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
const bitGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);

/* Высоты у эффектов передаются от земли: пол под частицей берём один
   раз, при рождении, — далеко она всё равно не улетает. */
function fxAdd (mesh, o, floor) {
  scene.add(mesh);
  FX.push(Object.assign({ mesh, vx: 0, vy: 0, vz: 0, life: 1, max: 1, grow: 0, spin: 0, gravity: 0, fade: 1, floor }, o));
}

/* искры — от чиркания о стену и от удара в чужую машину */
function sparks (x, y, z, n, dirx, dirz) {
  const f = floorAt(x, z);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: chance(0.5) ? 0xfff3c4 : 0xffa022 }));
    m.position.set(x, f + y, z);
    fxAdd(m, {
      vx: (dirx || 0) * rand(1, 4) + rand(-5, 5), vy: rand(1.5, 6), vz: (dirz || 0) * rand(1, 4) + rand(-5, 5),
      life: rand(0.25, 0.6), max: 0.6, gravity: 16, spin: rand(-20, 20),
    }, f);
  }
}

/* дым из-под капота: чем хуже машине, тем чернее */
function puff (x, y, z, dark, size) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
    color: dark ? 0x3a3238 : 0xd8d5d0, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  m.position.set(x, floorAt(x, z) + y, z);
  m.scale.setScalar(size || 0.7);
  fxAdd(m, { vy: rand(1.4, 2.6), vx: rand(-0.6, 0.6), vz: rand(-0.6, 0.6), life: rand(1, 1.8), max: 1.8, grow: 1.5, spin: rand(-1, 1) });
}

/* пламя нитро: голубое, бьёт назад и быстро гаснет. Высота — готовая,
   от настила или земли под машиной */
function nosFlame (x, y, z, bx, bz) {
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
      color: chance(0.5) ? 0x6fd3ff : 0xe6f7ff, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    m.position.set(x + rand(-0.15, 0.15), y + rand(-0.1, 0.1), z + rand(-0.15, 0.15));
    m.scale.setScalar(rand(0.25, 0.45));
    fxAdd(m, { vx: bx * rand(8, 14) + V.vx * 0.6, vy: rand(0, 0.6), vz: bz * rand(8, 14) + V.vz * 0.6,
               life: rand(0.15, 0.3), max: 0.3, grow: 2.5 });
  }
}

/* брызги над Томью: высота — от воды, а не от дна */
function splash (x, z) {
  const w = Math.max(0, groundH(x, z));
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
      color: 0xeaf6ff, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    m.position.set(x + rand(-1.5, 1.5), w + rand(0.1, 0.6), z + rand(-1.5, 1.5));
    m.scale.setScalar(rand(0.4, 0.8));
    fxAdd(m, { vy: rand(2, 4.5), vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5), life: rand(0.5, 0.9), max: 0.9, grow: 1.2, gravity: 9 }, w);
  }
}

function fire (x, y, z) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
    color: chance(0.5) ? 0xff8a2b : 0xffd34d, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  m.position.set(x, floorAt(x, z) + y, z);
  m.scale.setScalar(rand(0.5, 1.1));
  fxAdd(m, { vy: rand(2, 4), vx: rand(-1.2, 1.2), vz: rand(-1.2, 1.2), life: rand(0.4, 0.8), max: 0.8, grow: 2.2 });
}

/* след на асфальте: кровь, копоть. Лежит и медленно выцветает */
function decal (x, z, hex, r, life) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.85, depthWrite: false }));
  // ложится по склону: круг смотрит вдоль нормали земли
  const y = floorAt(x, z), onDeck = y - groundH(x, z) > 0.4;
  const nrm = onDeck ? TNORM.set(0, 1, 0) : groundNormal(x, z);
  const lift = 0.2 + DECALS.length * 0.002;
  m.position.set(x + nrm.x * lift, y + nrm.y * lift, z + nrm.z * lift);
  m.lookAt(m.position.x + nrm.x, m.position.y + nrm.y, m.position.z + nrm.z);
  m.scale.set(rand(0.8, 1.3), rand(0.8, 1.3), 1);
  scene.add(m);
  DECALS.push({ m, life: life || 30, max: life || 30 });
  if (DECALS.length > 70) { const d = DECALS.shift(); scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); }
}

function blood (x, y, z, n) {
  if (!GORE_ON) return;
  const f = floorAt(x, z);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color: chance(0.4) ? 0x8f1f2b : 0xc42b32 }));
    m.position.set(x, f + y, z);
    fxAdd(m, { vx: rand(-6, 6), vy: rand(2, 7), vz: rand(-6, 6), life: rand(0.5, 1.2), max: 1.2, gravity: 17, spin: rand(-14, 14) }, f);
  }
  for (let i = 0; i < 3; i++) decal(x + rand(-1.6, 1.6), z + rand(-1.6, 1.6), 0x8f1f2b, rand(0.7, 1.4), 40);
}

function boom (x, z, r = 11) {
  for (let i = 0; i < 16; i++) fire(x + rand(-1.5, 1.5), rand(0.5, 3), z + rand(-1.5, 1.5));
  for (let i = 0; i < 10; i++) puff(x + rand(-2, 2), rand(1, 3.5), z + rand(-2, 2), true, rand(0.9, 1.7));
  sparks(x, 1, z, 26);
  const f = floorAt(x, z);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(bitGeo, new THREE.MeshLambertMaterial({ color: 0x2a2530, flatShading: true }));
    m.position.set(x, f + 1, z);
    m.scale.setScalar(rand(0.8, 2.4));
    fxAdd(m, { vx: rand(-9, 9), vy: rand(5, 12), vz: rand(-9, 9), life: rand(1.4, 2.4), max: 2.4, gravity: 18, spin: rand(-12, 12) }, f);
  }
  decal(x, z, 0x231d24, 3.4, 60);
  Snd.boom();
  blastAt(x, z, r);
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
  for (const p of SCOOTS) {
    if (!p.dead && Math.hypot(p.x - x, p.z - z) < r) runOverScoot(p, p.x - x, p.z - z);
  }
  smashNear(x, z, it => { const d = Math.hypot(it.x - x, it.z - z); if (d < r) smashHit(it, (it.x - x) / (d || 1), (it.z - z) / (d || 1), 20, true); });
  for (const p of SMOKERS) {
    if (p.dead || Math.hypot(p.x - x, p.z - z) > r) continue;
    p.dead = 1; p.deadT = rand(25, 40); p.grp.visible = false;
    gibHuman(p, p.x - x, p.z - z);
    S.people++;
  }
  for (const d of DRIVERS) {
    if (d.dead || Math.hypot(d.x - x, d.z - z) > r) continue;
    gibHuman(d, d.x - x, d.z - z);
    dropMesh(d.grp); d.gone = 1; d.dead = 1;
  }
  for (const t of TRAFFIC) {
    if (t.wreck) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d > r || d < 0.5) continue;
    const k = (1 - d / r) * 34;
    fullCar(t);
    dentCar(t.mesh, x, z, k);
    knockCar(t, (t.x - x) / d, (t.z - z) / d, k);
    // взрыв бьёт соседей: у кого кончилось здоровье — рвёт следом, с
    // задержкой, и так по цепочке через всю парковку
    t.hp -= k * 4.6;                              // соседнее место на парковке — в 2,7 м: рвёт наверняка
    if (t.hp <= 0 && !t.chainT) t.chainT = rand(0.25, 0.8);
  }
  // и самого курьера подбрасывает и мнёт, если стоял рядом
  const dp = Math.hypot(V.x - x, V.z - z);
  if (dp < r && dp > 0.3) {
    const k = (1 - dp / r) * 22;
    if (dp < r * 0.8) hurtCar(1 + (dp < r * 0.4 ? 1 : 0), 20, x, z);
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
    if (f.gravity && m.position.y < (f.floor || 0) + 0.12) { m.position.y = (f.floor || 0) + 0.12; f.vy *= -0.3; f.vx *= 0.5; f.vz *= 0.5; }
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
  if (kind === 'note') kind = 'note' + ((Math.random() * 4) | 0);
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
  } else if (kind.startsWith('note')) {
    x.fillStyle = pick(['#ffd85e', '#ff8ad0', '#6fd3ff', '#9dff7a']);
    x.beginPath(); x.ellipse(22, 48, 11, 8, -0.4, 0, Math.PI * 2); x.fill();
    x.fillRect(29, 10, 6, 38);
    x.fillRect(29, 10, 20, 7);
  } else if (kind === 'star') {
    // звёздочка «в отключке» — пятиконечная, жёлтая с тёмным контуром
    x.fillStyle = '#ffd23f'; x.strokeStyle = '#7a4a10'; x.lineWidth = 3;
    x.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 26, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r); }
    x.closePath(); x.fill(); x.stroke();
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
    m.position.set(x + rand(-0.4, 0.4), floorAt(x, z) + y, z + rand(-0.4, 0.4));
    m.scale.setScalar(rand(0.5, 0.85));
    fxAdd(m, { vy: rand(1, 1.8), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), life: rand(1.2, 2), max: 2 });
  }
}

/* пар от горячей пиццы */
function steam (x, y, z) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false,
  }));
  m.position.set(x + rand(-0.1, 0.1), groundH(x, z) + y, z + rand(-0.1, 0.1));
  m.scale.setScalar(0.16);
  fxAdd(m, { vy: rand(0.6, 1.1), life: rand(0.9, 1.5), max: 1.5, grow: 1.2 });
}

/* коробка с пиццей — и летящая, и та, что уже в руках */
function pizzaBox () {
  const g = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.85), mat('#f0522a'));
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.1), mat('#fff3d6'));
  l.position.set(0, 0.13, 0);
  g.add(b, l);
  return g;
}

/* ─────────────── машины ───────────────
   Четыре кузова. Седан — советский: длинный капот, коробка салона,
   короткий багажник, хромированные бамперы и круглые фары, так ездит и
   курьер. Хетчбек — короче, без багажника, салон до самой кормы.
   Смарт — двухместная табуретка: два с половиной метра, высокий салон,
   каркас другого цвета. Кроссовер — выше и длиннее, с рейлингами.
   Кузов собран из отдельных панелей — только так их можно мять. */

const CAR_SPEC = {
  //       длина  ширина  низ   капот  багаж  салон: длина, сдвиг, высота  колесо  база: перед, зад
  sedan: { L: 4.3, W: 1.74, h: 0.42, hood: 1.5, trunk: 1.05, cab: 2.0, cz: -0.22, ch: 0.62, r: 0.44, fz: 1.4, bz: -1.45 },
  coupe: { L: 4.45, W: 1.84, h: 0.36, hood: 1.75, trunk: 0.85, cab: 1.55, cz: -0.4, ch: 0.48, r: 0.45, fz: 1.48, bz: -1.45 },
  hatch: { L: 3.9, W: 1.72, h: 0.44, hood: 1.2, trunk: 0, cab: 2.25, cz: -0.55, ch: 0.66, r: 0.42, fz: 1.25, bz: -1.3 },
  smart: { L: 2.7, W: 1.6, h: 0.46, hood: 0.55, trunk: 0, cab: 1.75, cz: -0.35, ch: 0.82, r: 0.38, fz: 0.9, bz: -0.9 },
  suv:   { L: 4.5, W: 1.86, h: 0.58, hood: 1.35, trunk: 0, cab: 2.7, cz: -0.8, ch: 0.72, r: 0.5, fz: 1.5, bz: -1.5 },
  cn:    { L: 4.6, W: 1.9, h: 0.56, hood: 1.3, trunk: 0, cab: 2.75, cz: -0.75, ch: 0.7, r: 0.5, fz: 1.52, bz: -1.52 },   // китайский кроссовер (roadlife.js)
};

let TAXI_SIGN = null;
function taxiSignMat () {
  if (TAXI_SIGN) return TAXI_SIGN;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = '#ffd21f'; x.fillRect(0, 0, 64, 16);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++)
    if ((i + j) % 2) { x.fillStyle = '#1b1a1f'; x.fillRect(i * 4, j * 8, 4, 8); x.fillRect(32 + i * 4, j * 8, 4, 8); }
  x.fillStyle = '#1b1a1f'; x.font = 'bold 9px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ffd21f'; x.fillRect(14, 2, 36, 12);
  x.fillStyle = '#1b1a1f'; x.fillText($t('ТАКСИ'), 32, 8.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return (TAXI_SIGN = new THREE.MeshBasicMaterial({ map: t }));
}

/* opts: tint — тонировка в ноль, low — занижение (кузов на двенадцать
   сантиметров ниже, колёса уходят в арки), lux — хромированные бамперы
   при любой тонировке (чёрная машина богача, life.js) */
function makeCar (bodyHex, roofSign, model = 'sedan', taxi = false, opts = {}) {
  const S = CAR_SPEC[model] || CAR_SPEC.sedan;
  const dy = opts.low ? -0.13 : 0;
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';          // курс, потом тангаж по склону, потом крен
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const panels = [];
  /* Всё, что не мнётся отдельно, склеиваем в один меш с цветом по
     вершинам: машина из сорока мешей — сорок вызовов отрисовки, а их на
     улице полсотни. Отдельными остаются панели (их мнёт), лобовое и
     заднее стекло (мутнеют), фары, колёса и тень. */
  const bulk = [];
  const add = (geo, hex, x, y, z, panel) => {
    if (!panel) { put(bulk, geo, hex, x, y + dy, z); return null; }
    const me = new THREE.Mesh(geo, mat(hex));
    me.position.set(x, y, z);
    g.add(me);
    if (panel !== 'keep') panels.push({ m: me, p: me.position.clone(), r: me.rotation.clone(), hex });
    return me;
  };

  const dark = '#' + new THREE.Color(bodyHex).multiplyScalar(0.78).getHexString();
  const CHR = (model === 'sedan' && !opts.tint) || opts.lux ? '#cfd3d8' : '#3a3940', GLASS = opts.tint ? '#16181e' : '#5b7ea3';
  const L = S.L, W = S.W, hl = L / 2;
  const y0 = 0.2 + S.h / 2 + 0.22;                 // середина нижней коробки
  const top = y0 + S.h / 2;                         // верх крыльев, от него растёт салон
  const frame = model === 'smart' ? (bodyHex === '#3c4048' ? '#c9ccd2' : '#2b2a30') : bodyHex;

  // днище и крылья
  add(new THREE.BoxGeometry(W, S.h, L), bodyHex, 0, y0, 0);
  add(new THREE.BoxGeometry(W + 0.12, 0.2, L - 0.3), dark, 0, y0 - S.h / 2 + 0.02, 0);
  // капот и багажник — отдельные панели
  const hoodM = add(new THREE.BoxGeometry(W - 0.06, 0.16, S.hood), bodyHex, 0, top + 0.06, hl - S.hood / 2 - 0.05, 'hood');
  let trunk = null;
  if (S.trunk) {
    const tm = add(new THREE.BoxGeometry(W - 0.06, 0.16, S.trunk), bodyHex, 0, top + 0.08, -hl + S.trunk / 2 + 0.05, 'trunk');
    // петля — у переднего края крышки: открывается, задирая корму
    trunk = { m: tm, hy: top + 0.08, hz: -hl + S.trunk + 0.05, len: S.trunk, a: 0, want: 0, py: top + 0.35, pz: -hl + S.trunk / 2 };
  }
  // салон: стойки и крыша (у смарта — каркасом другого цвета)
  const cy = top + S.ch / 2;
  add(new THREE.BoxGeometry(W - 0.12, S.ch, S.cab), frame, 0, cy, S.cz);
  add(new THREE.BoxGeometry(W - 0.24, 0.12, S.cab - 0.05), frame, 0, top + S.ch + 0.04, S.cz, 'roof');
  // двери
  const door = Math.min(1.85, S.cab * 0.85);
  add(new THREE.BoxGeometry(0.1, S.h + 0.08, door), dark, -W / 2 - 0.02, top - 0.1, S.cz + 0.02, 'doorL');
  add(new THREE.BoxGeometry(0.1, S.h + 0.08, door), dark, W / 2 + 0.02, top - 0.1, S.cz + 0.02, 'doorR');
  // стёкла
  const gh = S.ch * 0.72;
  const wsF = add(new THREE.BoxGeometry(W - 0.28, gh, 0.1), GLASS, 0, cy + 0.02, S.cz + S.cab / 2 + 0.01, 'keep');
  const wsB = add(new THREE.BoxGeometry(W - 0.28, gh * 0.9, 0.1), GLASS, 0, cy + 0.02, S.cz - S.cab / 2 - 0.01, 'keep');
  add(new THREE.BoxGeometry(0.1, gh * 0.84, S.cab - 0.3), GLASS, -W / 2 + 0.05, cy + 0.03, S.cz);
  add(new THREE.BoxGeometry(0.1, gh * 0.84, S.cab - 0.3), GLASS, W / 2 - 0.05, cy + 0.03, S.cz);
  // бамперы: у седана хромированные, у остальных пластик
  add(new THREE.BoxGeometry(W + 0.14, 0.16, 0.22), CHR, 0, y0 - 0.04, hl - 0.03, 'bumperF');
  add(new THREE.BoxGeometry(W + 0.14, 0.16, 0.22), CHR, 0, y0 - 0.04, -hl + 0.03, 'bumperR');
  // решётка, фары, фонари
  add(new THREE.BoxGeometry(W * 0.6, 0.2, 0.1), '#2b2530', 0, top - 0.08, hl - 0.02);
  if (model === 'cn') RL.cnCar(g, add, { S, W, L, hl, top, y0, bodyHex });   // узкие LED во всю ширину — вместо фар
  else for (const s of [-1, 1]) {
    const h = new THREE.Mesh(model === 'sedan' ? new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10) : new THREE.BoxGeometry(0.4, 0.1, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xfff1c8 }));
    if (model === 'sedan') h.rotation.x = Math.PI / 2;
    h.position.set((W / 2 - 0.22) * s, top - 0.06, hl - 0.02);
    g.add(h);
    add(new THREE.BoxGeometry(0.38, 0.16, 0.08), '#e8323c', (W / 2 - 0.22) * s, top - 0.04, -hl + 0.02);
  }
  if (model === 'coupe') {
    // спойлер на багажнике и воздухозаборник на капоте
    for (const sx of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.08, 0.26, 0.12), '#2b2a30', sx, top + 0.3, -hl + 0.35);
    add(new THREE.BoxGeometry(W - 0.2, 0.06, 0.34), '#2b2a30', 0, top + 0.44, -hl + 0.35);
    add(new THREE.BoxGeometry(0.5, 0.06, 0.5), '#2b2a30', 0, top + 0.16, hl - 0.9);
  }
  if (model === 'suv') {
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.08, S.cab - 0.2), '#2b2a30', (W / 2 - 0.25) * s, top + S.ch + 0.14, S.cz);
    add(new THREE.BoxGeometry(0.5, 0.5, 0.3), '#2b2a30', 0, y0 + 0.2, -hl - 0.12);          // запаска на двери
  }

  if (roofSign) {   // шашка доставки — свою машину видно в потоке
    add(new THREE.BoxGeometry(1.3, 0.42, 0.62), '#ffffff', 0, top + S.ch + 0.3, S.cz);
    add(new THREE.BoxGeometry(0.95, 0.2, 0.68), '#f0522a', 0, top + S.ch + 0.3, S.cz);
  }
  const hazard = [];
  for (const [x, z] of [[-W / 2 + 0.1, hl - 0.05], [W / 2 - 0.1, hl - 0.05], [-W / 2 + 0.1, -hl + 0.05], [W / 2 - 0.1, -hl + 0.05]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.1), new THREE.MeshBasicMaterial({ color: 0xffa024 }));
    m.position.set(x, top + 0.08, z);
    m.visible = false;
    g.add(m);
    hazard.push(m);
  }
  if (taxi) {
    // шашечки по бортам и фонарь «такси» на крыше
    const n = Math.max(4, Math.round(door / 0.22));
    for (const s of [-1, 1])
      for (let i = 0; i < n; i++) {
        if (i % 2) continue;
        const z = S.cz - door / 2 + (i + 0.5) * door / n;
        add(new THREE.BoxGeometry(0.03, 0.12, door / n), '#1b1a1f', (W / 2 + 0.085) * s, top - 0.02, z);
        add(new THREE.BoxGeometry(0.03, 0.12, door / n), '#1b1a1f', (W / 2 + 0.085) * s, top - 0.14, z + door / n);
      }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.3), [
      mat('#ffd21f'), mat('#ffd21f'), mat('#ffd21f'), mat('#ffd21f'), taxiSignMat(), taxiSignMat()]);
    sign.position.set(0, top + S.ch + 0.22, S.cz);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  }

  // занижение: всё, что уже на машине отдельными мешами, — ниже вместе с кузовом
  if (dy) { for (const c of g.children) c.position.y += dy; for (const p of panels) p.p.y += dy; if (trunk) { trunk.hy += dy; trunk.py += dy; } }
  // склейка кузова — одним мешем
  if (bulk.length) g.add(new THREE.Mesh(mergeGeos(bulk), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  const wheels = [], steer = [];
  const wx = W / 2 + 0.02;
  const wmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (const [x, z, front] of [[-wx, S.fz, 1], [wx, S.fz, 1], [-wx, S.bz, 0], [wx, S.bz, 0]]) {
    const pv = new THREE.Group();
    pv.position.set(x, S.r, z);
    // шина и колпак — один меш
    const parts = [];
    put(parts, new THREE.CylinderGeometry(S.r, S.r, 0.3, 10), '#221c19', 0, 0, 0, 0, 0, Math.PI / 2);
    put(parts, new THREE.CylinderGeometry(S.r * 0.44, S.r * 0.44, 0.32, 8), '#d7d2c8', 0, 0, 0, 0, 0, Math.PI / 2);
    const wm = new THREE.Mesh(mergeGeos(parts), wmat);
    pv.add(wm);
    g.add(pv);
    wheels.push(wm); if (front) steer.push(pv);
  }
  const sh = new THREE.Mesh(new THREE.CircleGeometry(hl + 0.25, 14),
    new THREE.MeshBasicMaterial({ color: 0x24303f, transparent: true, opacity: 0.26, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.scale.set(W / (L + 0.5) * 1.15, 1, 1);
  g.add(sh);

  g.userData = { wheels, steer, panels, glass: [wsF, wsB], dmg: 0, smokeT: 0, bodyHex, hazard, hl, model, trunk,
    hood: hoodM ? { m: hoodM, y: hoodM.position.y, z: hoodM.position.z, len: S.hood } : null };
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
    const b = u.panels.find(p => p.m.parent && p.m.geometry.parameters && p.m.geometry.parameters.depth === 0.22 && !p.dropped);
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
  // булка, котлета, сыр, салат, помидор, кунжут и глаза — одним мешем:
  // бургеров на улице сорок, по двадцать мешей было бы восемьсот вызовов
  const b = [];
  put(b, new THREE.CylinderGeometry(0.42, 0.46, 0.18, 12), '#e8b563', 0, 0.39, 0);
  put(b, new THREE.CylinderGeometry(0.45, 0.45, 0.13, 12), '#7a4526', 0, 0.545, 0);
  put(b, new THREE.BoxGeometry(0.84, 0.05, 0.84), '#ffd34d', 0, 0.635, 0, 0, Math.PI / 4);
  put(b, new THREE.CylinderGeometry(0.46, 0.44, 0.07, 12), '#5fbf4a', 0, 0.695, 0);
  put(b, new THREE.CylinderGeometry(0.4, 0.4, 0.07, 10), '#e04836', 0, 0.755, 0);
  put(b, new THREE.SphereGeometry(0.46, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), '#e8a84f', 0, 0.78, 0);
  for (let i = 0; i < 5; i++)
    put(b, new THREE.SphereGeometry(0.028, 5, 4), '#fff3d6', Math.cos(i * 2.1) * 0.3, 1.12, Math.sin(i * 2.1) * 0.3);
  for (const s of [-1, 1]) {
    put(b, new THREE.SphereGeometry(0.075, 7, 5), '#ffffff', 0.14 * s, 0.95, 0.36);
    put(b, new THREE.SphereGeometry(0.032, 6, 5), '#1b1410', 0.14 * s, 0.95, 0.425);
  }
  g.add(new THREE.Mesh(mergeGeos(b), BURGER_MAT));
  g.userData = { legL, legR };
  return g;
}
const BURGER_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const GIB_SPECS = [
  ['cyl', 0.44, 0.16, '#e8b563'], ['cyl', 0.44, 0.12, '#7a4526'],
  ['box', 0.8, 0.05, '#ffd34d'], ['cyl', 0.44, 0.07, '#5fbf4a'],
  ['cyl', 0.38, 0.07, '#e04836'], ['cap', 0.44, 0.44, '#e8a84f'],
  ['box', 0.12, 0.3, '#3a2c22'], ['box', 0.12, 0.3, '#3a2c22'],
];
const GIBS = [];
function gibBurger (x, z) {
  const floor = groundH(x, z);
  for (const [kind, a, b, hex] of GIB_SPECS) {
    const geo = kind === 'box' ? new THREE.BoxGeometry(a, b, a)
      : kind === 'cap' ? new THREE.SphereGeometry(a, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
      : new THREE.CylinderGeometry(a, a, b, 8);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
    m.position.set(x + rand(-0.2, 0.2), floor + rand(0.5, 1.1), z + rand(-0.2, 0.2));
    scene.add(m);
    GIBS.push({ m, floor, vx: rand(-5, 5), vy: rand(4.5, 9), vz: rand(-5, 5), ax: rand(-9, 9), az: rand(-9, 9), life: 4.5 });
  }
}
function updateGibs (dt) {
  for (let i = GIBS.length - 1; i >= 0; i--) {
    const g = GIBS[i];
    g.vy -= 19 * dt;
    g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt;
    g.m.rotation.x += g.ax * dt; g.m.rotation.z += g.az * dt;
    if (g.m.position.y < g.floor + 0.3 && g.vy < 0) { g.m.position.y = g.floor + 0.3; g.vy *= -0.35; g.vx *= 0.6; g.vz *= 0.6; }
    if ((g.life -= dt) < 0.6) g.m.scale.setScalar(Math.max(0.001, g.life / 0.6));
    if (g.life <= 0) { scene.remove(g.m); g.m.geometry.dispose(); g.m.material.dispose(); GIBS.splice(i, 1); }
  }
}

/* ─────────────── тротуары ───────────────
   Пешеходы ходят не кольцами вокруг домов, а по тротуарам настоящих
   улиц: вдоль ребра графа, в полутора метрах от бордюра. На перекрёстке
   сворачивают так, чтобы не сходить с тротуара, — по правой стороне
   направо, по левой налево, то есть обходят квартал. Дорогу переходят
   только по зебре; если у зебры светофор — ждут, пока машинам не
   загорится красный. Во дворах часть коллег гуляет по дорожкам из карты.

   Состояние на тротуаре: ребро a→b, сторона (1 — справа по ходу, −1 —
   слева), следующий узел c и отрезок от угла до угла: углы — точки,
   где сходятся линии тротуаров двух улиц. */

// по мостам не гуляют: высоту людям берём с земли, и на мосту они шли бы по дну реки
const walkable = e => !!e && e.c <= 5 && !(MAPFIX && e.road.b);
const walkOff = (e, bike) => e.w / 2 + (bike ? 0.9 : 1.5) + (e.road.g || 0);   // бульвар: тротуар за газоном

function walkNext (a, b, side) {
  const e = edgeOf(a, b);
  let best = -1, bs = side > 0 ? -Infinity : Infinity;
  for (const c of NODES[b].nb) {
    if (c === a || !inBounds(NODES[c].x, NODES[c].z, -30)) continue;
    const n = edgeOf(b, c);
    if (!walkable(n)) continue;
    const ang = Math.atan2(e.ux * n.uz - e.uz * n.ux, e.ux * n.ux + e.uz * n.uz);   // плюс — направо
    if (side > 0 ? ang > bs : ang < bs) { bs = ang; best = c; }
  }
  return best;
}

/* угол тротуара у узла b: пересечение линий вдоль a→b и b→c */
function walkCorner (a, b, c, side, bike) {
  const e1 = edgeOf(a, b), B = NODES[b];
  const L1 = walkOff(e1, bike) * side;
  const p1x = B.x + e1.rx * L1, p1z = B.z + e1.rz * L1;
  if (c < 0) return [p1x, p1z];                    // тупик: разворот тут же
  const e2 = edgeOf(b, c), L2 = walkOff(e2, bike) * side;
  const p2x = B.x + e2.rx * L2, p2z = B.z + e2.rz * L2;
  const den = e1.ux * e2.uz - e1.uz * e2.ux;
  if (Math.abs(den) < 0.15) return [(p1x + p2x) / 2, (p1z + p2z) / 2];
  const s = ((p2x - p1x) * e2.uz - (p2z - p1z) * e2.ux) / den;
  const mx = p1x + e1.ux * s, mz = p1z + e1.uz * s;
  if (Math.hypot(mx - B.x, mz - B.z) > 3 * Math.max(Math.abs(L1), Math.abs(L2))) return [(p1x + p2x) / 2, (p1z + p2z) / 2];
  return [mx, mz];
}

function walkLeg (p, sx, sz) {
  const W = p.w;
  W.c = walkNext(W.a, W.b, W.side);
  [W.ex, W.ez] = walkCorner(W.a, W.b, W.c, W.side, p.bike);
  W.sx = sx; W.sz = sz; W.d = 0;
  W.L = Math.max(0.01, Math.hypot(W.ex - sx, W.ez - sz));
}

/* поставить на тротуар ребра a→b, на долю t его длины */
function walkInit (p, a, b, side, t) {
  const e = edgeOf(a, b), A = NODES[a], o = walkOff(e, p.bike) * side;
  p.w = { a, b, side, c: -1, sx: 0, sz: 0, ex: 0, ez: 0, d: 0, L: 1 };
  p.path = null; p.cross = null;
  const x = A.x + e.ux * e.len * t + e.rx * o, z = A.z + e.uz * e.len * t + e.rz * o;
  walkLeg(p, x, z);
  p.x = x; p.z = z;
}

/* снова на тротуар оттуда, где стоит: после лавочки, заказа, толкотни */
function walkSnap (p) {
  const road = nearestRoad(p.x, p.z, 5, 1);
  if (!road || road.seg.na === undefined || road.d > 25) return walkSpawn(p, 40, 300);
  const e = edgeOf(road.seg.na, road.seg.nb);
  if (!walkable(e)) return walkSpawn(p, 40, 300);
  const side = (p.x - road.x) * e.rx + (p.z - road.z) * e.rz >= 0 ? 1 : -1;
  const [a, b] = chance(0.5) ? [e.a, e.b] : [e.b, e.a];
  const tt = a === e.a ? road.t : 1 - road.t;
  walkInit(p, a, b, a === e.a ? side : -side, tt);
}

/* куда поставить нового прохожего: тротуар рядом с курьером, а часть
   коллег — на дворовую дорожку */
const YARD_PATHS = CITY.paths.filter(q => q.length >= 2 && inBounds(q[0][0], q[0][1], 10));
function walkSpawn (p, rmin, rmax, c = V) {
  if (p.yard && YARD_PATHS.length) {
    let best = null, bd = 1e9;
    for (let k = 0; k < 30; k++) {
      const q = pick(YARD_PATHS), m = q[(q.length / 2) | 0];
      const d = Math.hypot(m[0] - c.x, m[1] - c.z);
      if (d >= rmin && d <= rmax) { best = q; break; }
      const miss = d < rmin ? rmin - d : d - rmax;
      if (miss < bd) { bd = miss; best = q; }
    }
    p.w = null; p.cross = null;
    p.path = { q: best, i: (Math.random() * (best.length - 1)) | 0, d: 0, dir: chance(0.5) ? 1 : -1 };
    p.x = best[p.path.i][0]; p.z = best[p.path.i][1];
    return;
  }
  for (let k = 0; k < 20; k++) {
    const a = nodeNear(c.x, c.z, rmin, rmax);
    const opts = NODES[a].nb.filter(b => walkable(edgeOf(a, b)));
    if (!opts.length) continue;
    walkInit(p, a, pick(opts), chance(0.5) ? 1 : -1, rand(0.15, 0.85));
    return;
  }
}

/* шаг по дворовой дорожке: туда и обратно */
function pathStep (p, dt) {
  const P = p.path, q = P.q;
  let i = P.i, j = i + P.dir;
  if (j < 0 || j >= q.length) { P.dir = -P.dir; j = i + P.dir; }
  const ax = q[i][0], az = q[i][1], bx = q[j][0], bz = q[j][1];
  const L = Math.hypot(bx - ax, bz - az) || 0.01;
  P.d += p.speed * dt;
  if (P.d >= L) { P.d -= L; P.i = j; return pathStep(p, 0); }
  const nx = lerp(ax, bx, P.d / L), nz = lerp(az, bz, P.d / L);
  const ang = Math.atan2(nx - p.x, nz - p.z);
  p.x = nx; p.z = nz;
  return ang;
}

/* Общий шаг для людей, бургеров и самокатчиков. Возвращает, куда смотреть. */
/* Вернуться к прогулке оттуда, где стоит. Гости ждут в глубине дворов,
   до улицы бывает и сто метров, — поэтому не переносим, а ведём пешком к
   ближайшему тротуару и оттуда — дальше по кварталу. Раньше гость с пиццей
   тут же переносился за сотню метров и для игрока просто исчезал. */
function walkBack (p) {
  const road = nearestRoad(p.x, p.z, 5, 3);
  if (road && road.d > 3) {
    const dx = p.x - road.x, dz = p.z - road.z, l = Math.hypot(dx, dz) || 1;
    const o = road.seg.w / 2 + 1.5;
    p.goTo = { x: road.x + dx / l * o, z: road.z + dz / l * o, t: 60 };
    p.w = null; p.path = null;
  } else walkSnap(p);
}

function walkerStep (p, dt, legSwing) {
  if (p.resnap) { p.resnap = false; walkBack(p); }
  if (p.goTo) {
    // идёт к тротуару своим ходом, стены обходит выталкиванием
    const G = p.goTo, dx = G.x - p.x, dz = G.z - p.z, d = Math.hypot(dx, dz);
    p.ph += dt * legSwing;
    if (d < 0.6 || (G.t -= dt) <= 0) { p.goTo = null; walkSnap(p); return NaN; }
    const k = Math.min(1, p.speed * dt / d);
    p.x += dx * k; p.z += dz * k;
    return Math.atan2(dx, dz);
  }
  if (!p.w && !p.path) walkSpawn(p, 60, 300);
  p.ph += dt * legSwing;
  if (p.path) return pathStep(p, dt);
  const W = p.w;

  // переходит по зебре: поперёк полотна, с тротуара на тротуар
  if (p.cross) {
    const C = p.cross, e = edgeOf(W.a, W.b);
    if (C.wait) {
      p.ph -= dt * legSwing;                          // стоит — ноги не идут
      if (!C.zb.sig || lightOf(C.zb.sig.ph) === 'r') C.wait = false;
      return Math.atan2(-e.rx * W.side, -e.rz * W.side);
    }
    C.t = Math.min(1, C.t + p.speed * dt / C.span);
    const o = lerp(C.o0, -C.o0, C.t);
    const nx = C.x + e.rx * o, nz = C.z + e.rz * o;
    const ang = Math.atan2(nx - p.x, nz - p.z);
    p.x = nx; p.z = nz;
    if (C.t >= 1) {
      p.cross = null;
      W.side = -W.side;
      walkLeg(p, p.x, p.z);
      p.crossT = rand(25, 80);
    }
    return ang;
  }

  RL.walkGuard(p);                                  // у забора стройки — назад (roadlife.js)
  const d0 = W.d;
  W.d += p.speed * dt;
  if (W.d >= W.L) {
    // угол квартала: дальше по следующей улице, из тупика — назад по той же
    let a = W.b, b = W.c;
    if (b < 0) { b = W.a; W.side = -W.side; }
    W.a = a; W.b = b;
    walkLeg(p, W.ex, W.ez);
  } else {
    // собрался на ту сторону — ждём ближайшей зебры на своей улице
    p.crossT -= dt;
    if (p.crossT <= 0) {
      const list = ZEB_BY_EDGE.get(ukey(W.a, W.b));
      if (list) {
        const e = edgeOf(W.a, W.b), ux = (W.ex - W.sx) / W.L, uz = (W.ez - W.sz) / W.L;
        for (const zb of list) {
          const along = (zb.x - W.sx) * ux + (zb.z - W.sz) * uz;
          if (along < d0 || along > W.d) continue;
          const o0 = walkOff(e, p.bike) * W.side;
          p.cross = { zb, x: zb.x, z: zb.z, o0, span: Math.abs(o0) * 2, t: 0,
                      wait: !!(zb.sig && lightOf(zb.sig.ph) !== 'r') };
          p.x = zb.x + e.rx * o0; p.z = zb.z + e.rz * o0;
          W.d = along;
          return Math.atan2(-e.rx * W.side, -e.rz * W.side);
        }
      }
    }
  }
  const k = W.d / W.L;
  const nx = lerp(W.sx, W.ex, k), nz = lerp(W.sz, W.ez, k);
  const ang = Math.atan2(nx - p.x, nz - p.z);
  p.x = nx; p.z = nz;
  return ang;
}

const PEDS = [];
function initPeds () {
  for (let k = 0; k < 40; k++) {
    const p = { grp: makeBurger(), speed: rand(1.1, 1.8), ph: rand(0, 9), crossT: rand(10, 60), x: 0, z: 0, dead: 0, deadT: 0 };
    walkSpawn(p, 30, 380);
    scene.add(p.grp);
    PEDS.push(p);
  }
  const H = burgerHangout();
  if (H) for (let k = 0; k < 16; k++) {
    const p = { grp: makeBurger(), speed: rand(0.5, 0.9), ph: rand(0, 9), x: 0, z: 0, dead: 0, deadT: 0, hang: H, ha: rand(0, 6.3), hr: rand(1.5, H.r) };
    hangPlace(p);
    scene.add(p.grp);
    PEDS.push(p);
  }
}

/* Сходка бургеров: у названного картой ТЦ (MAP.landmarks.burgers) — на
   площадке перед стеной, что смотрит на ближайшую улицу. Толпятся
   кружком, подпрыгивают, поворачиваются друг к другу; сбитый — через
   время возвращается сюда же, а не в другой квартал. */
function burgerHangout () {
  const nm = MAP.landmarks && MAP.landmarks.burgers;
  if (!nm) return null;
  let best = null;
  for (const b of CITY.buildings) {
    if (b.n !== nm) continue;
    for (let i = 0; i < b.p.length; i++) {
      const a = b.p[i], c = b.p[(i + 1) % b.p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 12) continue;
      let ox = (c[1] - a[1]) / L, oz = -(c[0] - a[0]) / L;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (inPoly(mx + ox * 0.5, mz + oz * 0.5, b.p)) { ox = -ox; oz = -oz; }
      const x = mx + ox * 9, z = mz + oz * 9;
      const r = nearestRoad(x, z, DRIVE_MAX, 2);
      if (inHouse(x, z, 3) || !r || r.d < r.seg.w / 2 + 3) continue;
      if (!best || r.d < best.d) best = { x, z, d: r.d, r: 5.5 };
    }
  }
  return best;
}
function hangPlace (p) {
  p.x = p.hang.x + Math.cos(p.ha) * p.hr; p.z = p.hang.z + Math.sin(p.ha) * p.hr;
}
function hangStep (p, dt) {
  p.ph += dt * 4;
  p.ha += dt * p.speed * 0.12 * (p.hr > 3 ? 1 : -1);
  p.hr = clamp(p.hr + Math.sin(p.ph * 0.13) * dt * 0.4, 1.2, p.hang.r);
  // к своему месту в кружке — шагом: после испуга не телепортируется
  const tx = p.hang.x + Math.cos(p.ha) * p.hr, tz = p.hang.z + Math.sin(p.ha) * p.hr;
  const d = Math.hypot(tx - p.x, tz - p.z), st = Math.min(d, 2.6 * dt);
  if (d > 0.001) { p.x += (tx - p.x) / d * st; p.z += (tz - p.z) / d * st; }
  pushOut(p, 0.5);
  const g = p.grp;
  g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph * 1.6)) * 0.28, p.z);
  g.rotation.y = damp(g.rotation.y, Math.atan2(p.hang.x - p.x, p.hang.z - p.z) + Math.sin(p.ph * 0.3) * 0.6, 5, dt);
  const sw = Math.sin(p.ph * 1.6) * 0.5;
  g.userData.legL.rotation.x = sw;
  g.userData.legR.rotation.x = -sw;
}

function updatePeds (dt) {
  for (const p of PEDS) {
    if (p.dead) {
      if ((p.deadT -= dt) <= 0) {                // возрождается в другом квартале (со сходки — на сходке)
        p.dead = 0; p.grp.visible = true;
        if (p.hang) hangPlace(p); else walkSpawn(p, 90, 400);
      }
      continue;
    }
    if (p.panic) { panicStep(p, dt); continue; }
    if (p.hang) { if ((p.x - V.x) ** 2 + (p.z - V.z) ** 2 < 300 * 300) hangStep(p, dt); continue; }
    if (Math.hypot(p.x - V.x, p.z - V.z) > 480) walkSpawn(p, 120, 380);
    const ang = walkerStep(p, dt, 7);
    pushOut(p, 0.5);
    const g = p.grp;
    g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.05, p.z);
    if (!Number.isNaN(ang)) g.rotation.y = damp(g.rotation.y, ang, 8, dt);
    const sw = Math.sin(p.ph) * 0.7;
    g.userData.legL.rotation.x = sw;
    g.userData.legR.rotation.x = -sw;
  }
}

/* ─────────────── прохожие ───────────────
   Обычные люди рядом с бургерами: ходят теми же кольцами,
   от наезда улетают, и после них на асфальте остаётся пятно. */

/* Люди на улицах — выдуманные: имя, должность и внешность собирает
   people.js из зерна (раньше тут ходили настоящие коллеги с фотографиями).
   Внешность та же и в карточке заказа (faceDataURL), и на улице. */
const PEOPLE = [];
const GRACE = 18;        // столько ещё терпят после срока, потом смена кончена

/* Люди разные: мужчины и женщины, высокие и низкие, худые и толстые,
   причёски, бороды, кепки, очки, лица. Толстые и низкие ходят медленнее —
   pace, множитель к скорости шага. Руки, ноги, туловище и всё на голове —
   по мешу с общим материалом: людей на улице полсотни, лишние вызовы ни к чему. */
const HUMAN_VC = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
/* Убрать человека (или любую группу) насовсем — и освободить память
   видеокарты. Раньше каждый сбитый, ушедший или сменившийся человек
   оставался в памяти: за длинную смену набегали тысячи геометрий и
   материалов, и игра начинала подтормаживать. Общие материалы и
   спрайтовую геометрию three.js не трогаем. */
function dropMesh (g) {
  scene.remove(g);
  HUMANS.delete(g);
  g.traverse(o => { if (o !== g && o.userData && o.userData.lod) HUMANS.delete(o); });
  g.traverse(o => {
    if (o.isSprite) { o.material.dispose(); return; }
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) if (m !== HUMAN_VC && m !== SMASH_MAT && m !== BURGER_MAT && m !== GLASS_MAT && !m.userData.keep) m.dispose();   // keep — общие текстуры лиц
  });
}
/* makeHuman(person, o): o — { fem, fat, h, skin, shirt, pants, cap, face: false }.
   Фабрику заводим при первом вызове: HUMANS объявлен ниже. */
let humanFactory = null;
function makeHuman (person, o = {}) {
  if (!humanFactory) humanFactory = createHumanFactory({ THREE, HUMAN_VC, HUMANS });
  return humanFactory(person, o);
}
/* все люди — для переключения ближний/дальний вариант (humanLod) */
const HUMANS = new Set();
const LOD_P = new THREE.Vector3();
function humanLod () {
  const cx = cam.position.x, cz = cam.position.z;
  for (const g of HUMANS) {
    const p = g.parent === scene ? g.position : g.parent ? g.parent.position : null;
    if (!p) continue;
    const far = (p.x - cx) ** 2 + (p.z - cz) ** 2 > 45 * 45;
    const u = g.userData;
    if (u.far === far) continue;
    u.far = far;
    u.lod.visible = far;
    for (const m of u.parts) m.visible = !far;
  }
}

/* очередной клиент или прохожий — всегда новый выдуманный человек */
function nextPerson () { return makePerson(); }

function initPeople () {
  for (let k = 0; k < (INTRO ? 18 : 44); k++) {
    // во вступлении лица у прохожих не грузим: в кадре их не разглядеть, а
    // сорок аватарок стояли в очереди перед четырьмя лицами героев
    const person = INTRO ? null : nextPerson();
    const p = {
      person, yard: k % 4 === 3,                 // каждый четвёртый гуляет во дворе
      grp: makeHuman(person), speed: 0, base: rand(1.1, 1.7), ph: rand(0, 9),
      crossT: rand(15, 80), restT: rand(10, 70), idle: null,
      x: 0, z: 0, dead: 0, deadT: 0,
    };
    p.speed = p.base * p.grp.userData.pace;
    walkSpawn(p, 30, 380);
    scene.add(p.grp);
    PEOPLE.push(p);
  }
}

/* ─────────────── самокатчики ───────────────
   Электросамокаты из шеринга: гоняют по тротуару у самого бордюра
   вчетверо быстрее пешеходов и переходят — точнее, переезжают — по
   зебре. Сбил — самокат улетает отдельно, человек как все. */
const SCOOTS = [];
const SCOOT_HEX = ['#7bd64a', '#8e5bd8', '#ffd23f', '#2fb8a8'];

function makeScooter (two) {
  const g = makeHuman(null, { fat: false });
  const u = g.userData;
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const deck = pick(SCOOT_HEX);
  const sc = new THREE.Group();
  const add = (w, h, d, hex, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex)); m.position.set(x, y, z); sc.add(m); return m; };
  add(0.22, 0.07, 1.05, deck, 0, 0.12, 0);
  add(0.06, 1.05, 0.06, '#2b2a30', 0, 0.62, 0.5).rotation.x = -0.18;
  add(0.56, 0.05, 0.05, '#2b2a30', 0, 1.13, 0.58);
  add(0.12, 0.16, 0.08, deck, 0, 1.0, 0.57);
  for (const z of [0.5, -0.48]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8).rotateZ(Math.PI / 2), mat('#1b1a1f'));
    w.position.set(0, 0.1, z);
    sc.add(w);
  }
  g.add(sc);
  // стоит на деке: ноги врозь вдоль, руки на руле
  for (const o of g.children) if (o !== sc) o.position.y += 0.16;
  u.legL.rotation.x = 0.25; u.legR.rotation.x = -0.25;
  u.armL.rotation.x = -1.05; u.armR.rotation.x = -1.05;
  u.scoot = sc; u.deck = deck;
  // вдвоём на одном самокате: второй стоит сзади и держится за первого
  if (two) {
    const q = makeHuman(null, { fat: false });
    const s2 = 1 / g.scale.x;                     // масштаб первого не должен сжимать второго дважды
    q.scale.multiplyScalar(s2);
    q.position.set(0, 0.16 * s2, -0.42);
    q.userData.armL.rotation.x = -1.3; q.userData.armR.rotation.x = -1.3;
    q.userData.legL.rotation.x = 0.15; q.userData.legR.rotation.x = -0.1;
    g.add(q);
    u.pass = q;
  }
  return g;
}

function initScoots () {
  for (let k = 0; k < 16; k++) {
    const two = chance(0.25);
    const p = { grp: makeScooter(two), two, bike: true, speed: rand(4.5, 6.8) * (two ? 0.8 : 1), ph: 0, crossT: rand(8, 40), x: 0, z: 0, dead: 0, deadT: 0, lean: 0 };
    walkSpawn(p, 30, 380);
    scene.add(p.grp);
    SCOOTS.push(p);
  }
}

function updateScoots (dt) {
  for (const p of SCOOTS) {
    if (p.dead) {
      if ((p.deadT -= dt) <= 0) {
        p.dead = 0;
        dropMesh(p.grp);
        p.two = chance(0.25);
        p.grp = makeScooter(p.two);
        scene.add(p.grp);
        walkSpawn(p, 120, 400);
      }
      continue;
    }
    if (Math.hypot(p.x - V.x, p.z - V.z) > 480) walkSpawn(p, 120, 380);
    const ang = walkerStep(p, dt, 0);
    pushOut(p, 0.45);
    const g = p.grp;
    g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z), p.z);
    if (!Number.isNaN(ang)) {
      const dh = Math.atan2(Math.sin(ang - g.rotation.y), Math.cos(ang - g.rotation.y));
      g.rotation.y += dh * Math.min(1, dt * 9);
      p.lean = damp(p.lean, clamp(-dh * 2.5, -0.35, 0.35), 6, dt);
    }
    g.rotation.z = p.lean;
  }
}

/* сбил самокатчика: самокат летит отдельно, человек — как все */
function runOverScoot (p, vx, vz, by) {
  p.dead = 1; p.deadT = rand(14, 22);
  p.grp.visible = false;
  gibHuman(p, vx, vz);
  const pass = p.grp.userData.pass;
  if (pass) gibHuman({ x: p.x - Math.sin(p.grp.rotation.y) * 0.5, z: p.z - Math.cos(p.grp.rotation.y) * 0.5, grp: pass }, vx, vz);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 1.05), propMat(p.grp.userData.deck));
  m.position.set(p.x, groundH(p.x, p.z) + 0.6, p.z);
  scene.add(m);
  GORE.push({ m, vx: vx * 0.6 + rand(-3, 3), vy: rand(4, 8), vz: vz * 0.6 + rand(-3, 3), spin: rand(-14, 14), life: 18, bleed: 1e9, rest: 0 });
  Snd.squish();
  if (by) { if (Math.hypot(p.x - V.x, p.z - V.z) < 160) toast($t('{who} сбил самокатчика', { who: by })); return; }
  S.scoots += pass ? 2 : 1;
  toast(pass ? $t('минус два самокатчика') : $t('минус самокатчик'));
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
      p.grp.position.set(p.x, groundH(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.04, p.z);
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

  p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + 0.42, p.z);
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
  p.resnap = true;                                // с лавочки — обратно на тротуар
  p.grp.position.y = groundH(p.x, p.z);
  p.grp.userData.legL.rotation.x = 0;
  p.grp.userData.legR.rotation.x = 0;
}

function makeGuest (p, at) {
  if (p.surf) { p.guest = true; return; }          // сёрфер на реке — своим ходом (updateSurf)
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
  p.guest = false; p.sitting = 0; p.sitAt = null; p.waitAt = null; p.party = false;
  p.resnap = !p.path;                             // дождался пиццы — дальше по тротуару
  p.grp.position.y = groundH(p.x, p.z);
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
      p.grp.position.set(p.x, groundH(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.04, p.z);
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
    p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + 0.42, p.z);
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
  } else if (p.party && !p.served) {
    // тусовка: прыгают в такт, руки вверх по очереди, пританцовывают
    p.partyPh += dt;
    const t = p.partyPh, beat = Math.abs(Math.sin(t * 7));
    p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + beat * 0.32, p.z);
    p.grp.rotation.y += Math.sin(t * 1.3) * dt * 2.5;
    u.armL.rotation.x = -2.6 + Math.sin(t * 7) * 0.5;
    u.armR.rotation.x = -2.6 + Math.sin(t * 7 + Math.PI) * 0.5;
    u.armL.rotation.z = -0.3; u.armR.rotation.z = 0.3;
    u.legL.rotation.x = Math.sin(t * 7) * 0.4; u.legR.rotation.x = -Math.sin(t * 7) * 0.4;
    u.head.rotation.y = Math.sin(t * 3.5) * 0.4;
  } else {
    p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z), p.z);
    u.legL.rotation.x = damp(u.legL.rotation.x, 0, 6, dt);
    u.legR.rotation.x = damp(u.legR.rotation.x, 0, 6, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, 0, 6, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, 0, 6, dt);
    u.armL.rotation.z = damp(u.armL.rotation.z, 0, 6, dt);
    u.armR.rotation.z = damp(u.armR.rotation.z, 0, 6, dt);
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
        dropMesh(p.grp);                      // возвращается уже другим человеком
        p.person = nextPerson();
        p.grp = makeHuman(p.person);
        p.speed = p.base * p.grp.userData.pace;
        p.panic = null; p.shock = 0;
        scene.add(p.grp);
        if (p.idle) { p.idle.b.taken = 0; p.idle = null; }
        walkSpawn(p, 90, 400); p.crossT = rand(20, 90); p.restT = rand(20, 70);
      }
      continue;
    }
    if (p.guest) { guestStep(p, dt); if (p.shock > 0) shockStep(p, dt); continue; }
    if (p.panic) { panicStep(p, dt); continue; }
    if (p.idle) { idleSitStep(p, dt); continue; }

    // изредка кто-нибудь садится передохнуть на свободную лавочку
    p.restT -= dt;
    if (!p.guest && !p.idle && Math.hypot(p.x - V.x, p.z - V.z) > 480) walkSpawn(p, 120, 380);
    if (p.restT <= 0 && !p.cross) {
      const b = freeBench(p.x, p.z, 15);
      if (b) { b.taken = 1; p.idle = { b, phase: 'walk', t: rand(20, 60), give: 14 }; continue; }
      p.restT = rand(20, 50);
    }

    const ang = walkerStep(p, dt, 7 * (p.grp.userData.fat ? 0.75 : 1));
    pushOut(p, 0.45);                            // не залезать в стены и изгороди
    const g = p.grp;
    g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.04, p.z);
    if (!Number.isNaN(ang)) g.rotation.y = damp(g.rotation.y, ang, 8, dt);
    const sw = Math.sin(p.ph) * 0.8;
    g.userData.legL.rotation.x = sw; g.userData.legR.rotation.x = -sw;
    g.userData.armL.rotation.x = -sw * 0.7; g.userData.armR.rotation.x = sw * 0.7;
  }
}

/* ── паника ──
   Рядом кого-то задавили: сначала стоят с поднятыми руками, потом
   бегут прочь от места, размахивая руками, и только через несколько
   секунд успокаиваются и возвращаются на тротуар. Гость, который ждёт
   пиццу, и курильщики не убегают — только поднимают руки. */
function scare (x, z, r = 26) {
  if (INTRO) return;
  for (const p of PEOPLE) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > r || d < 0.3) continue;
    if (p.guest) { p.shock = rand(1.6, 2.6); continue; }
    if (p.idle) { p.idle.b.taken = 0; p.idle = null; p.grp.userData.legL.rotation.x = 0; p.grp.userData.legR.rotation.x = 0; }
    p.panic = { x, z, t: rand(0.5, 1.2), run: rand(3.5, 6), spd: rand(3.4, 4.6) * p.grp.userData.pace };
    if (chance(0.5)) emote(p.x, 2.3, p.z, 'angry', 2);
  }
  for (const p of SMOKERS) if (!p.dead && Math.hypot(p.x - x, p.z - z) < r) p.shock = rand(2, 3.5);
  for (const c of CROWDS) for (const q of c.people) if (!q.dead && Math.hypot(q.x - x, q.z - z) < r) q.shock = rand(1.5, 3);
  for (const a of ACCIDENTS) for (const f of a.fighters) if (!f.dead && Math.hypot(f.x - x, f.z - z) < r) f.shock = rand(1.5, 3);
  LIFE.scare(x, z, r);
  for (const pt of PITCHES) if (pt.game) for (const q of pt.game.players) if (!q.dead && Math.hypot(q.x - x, q.z - z) < r) q.shock = rand(1.5, 3);
  for (const m of CREW) if (!m.dead && m.mode !== 'war' && Math.hypot(m.x - x, m.z - z) < r) m.shock = rand(1.5, 3);
  for (const p of PEDS) {
    if (p.dead || Math.hypot(p.x - x, p.z - z) > r) continue;
    p.panic = { x, z, t: 0.3, run: rand(3, 5), spd: rand(3.5, 4.5) };
  }
}

function handsUp (u, dt, k = 1) {
  u.armL.rotation.x = damp(u.armL.rotation.x, -2.9 * k, 14, dt);
  u.armR.rotation.x = damp(u.armR.rotation.x, -2.9 * k, 14, dt);
  u.armL.rotation.z = damp(u.armL.rotation.z, -0.3, 10, dt);
  u.armR.rotation.z = damp(u.armR.rotation.z, 0.3, 10, dt);
}
function shockStep (p, dt) {
  p.shock -= dt;
  const u = p.grp.userData;
  if (p.shock > 0) handsUp(u, dt);
  else { u.armL.rotation.z = 0; u.armR.rotation.z = 0; }
}

function panicStep (p, dt) {
  const P = p.panic, u = p.grp.userData, g = p.grp;
  const dx = p.x - P.x, dz = p.z - P.z, l = Math.hypot(dx, dz) || 1;
  if (P.t > 0) {
    // замер: руки вверх, лицом к тому, что случилось
    P.t -= dt;
    if (u.armL) handsUp(u, dt);
    u.legL.rotation.x = damp(u.legL.rotation.x, 0, 10, dt);
    u.legR.rotation.x = damp(u.legR.rotation.x, 0, 10, dt);
    g.rotation.y = damp(g.rotation.y, Math.atan2(-dx, -dz), 10, dt);
    g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z), p.z);
    return;
  }
  // бегом прочь, руки над головой
  P.run -= dt;
  p.ph += dt * 16;
  p.x += dx / l * P.spd * dt; p.z += dz / l * P.spd * dt;
  pushOut(p, 0.45);
  g.rotation.y = damp(g.rotation.y, Math.atan2(dx, dz), 10, dt);
  g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.1, p.z);
  const sw = Math.sin(p.ph) * 1.1;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  if (u.armL) {
    u.armL.rotation.x = -2.6 + Math.sin(p.ph) * 0.5; u.armR.rotation.x = -2.6 - Math.sin(p.ph) * 0.5;
    u.armL.rotation.z = -0.3; u.armR.rotation.z = 0.3;
  }
  if (P.run <= 0) {
    p.panic = null;
    if (u.armL) { u.armL.rotation.z = 0; u.armR.rotation.z = 0; }
    walkBack(p);
  }
}

/* Куски тела: летят, падают и остаются лежать. Пока лежат — под ними
   растёт лужа, поэтому место наезда видно ещё долго. */
const GORE = [];

function gibHuman (p, vx, vz) {
  if (!GORE_ON) { knockHuman(p, vx, vz); return; }
  const c = p.grp.userData.colors;
  const parts = [
    [0.3, 0.32, 0.28, c.skin], [0.44, 0.6, 0.26, c.shirt],
    [0.13, 0.55, 0.13, c.shirt], [0.13, 0.55, 0.13, c.shirt],
    [0.16, 0.7, 0.16, c.pants], [0.16, 0.7, 0.16, c.pants],
  ];
  const floor = groundH(p.x, p.z);
  for (const [w, h, d, hex] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
    m.position.set(p.x + rand(-0.2, 0.2), floor + rand(0.7, 1.4), p.z + rand(-0.2, 0.2));
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    scene.add(m);
    GORE.push({
      m, vx: vx * 0.3 + rand(-5, 5), vy: rand(3, 8), vz: vz * 0.3 + rand(-5, 5),
      spin: rand(-12, 12), life: rand(16, 24), bleed: rand(0.4, 1.2), rest: 0,
    });
  }
  blood(p.x, 1, p.z, 16);
  decal(p.x, p.z, 0x8f1f2b, 1.9, 60);
  scare(p.x, p.z);
  callAmbulance(p.x, p.z);
}

/* Мягкий режим (без крови): человек целиком отлетает, как тряпичная
   кукла, падает плашмя, над ним кружат звёздочки, потом исчезает с
   облачком пыли. Одним склеенным мешем — телом из тех же цветов */
function knockHuman (p, vx, vz) {
  const c = p.grp.userData.colors, parts = [];
  box(parts, 0.16, 0.7, 0.16, c.pants, -0.12, 0.35, 0); box(parts, 0.16, 0.7, 0.16, c.pants, 0.12, 0.35, 0);
  box(parts, 0.44, 0.6, 0.26, c.shirt, 0, 1.0, 0);
  box(parts, 0.13, 0.55, 0.13, c.shirt, -0.3, 1.25, 0); box(parts, 0.13, 0.55, 0.13, c.shirt, 0.3, 1.25, 0);
  box(parts, 0.5, 0.5, 0.3, c.skin, 0, 1.58, 0);
  if (c.hair) box(parts, 0.54, 0.14, 0.34, c.hair, 0, 1.86, 0);
  const g = mergeGeos(parts);
  g.translate(0, -0.95, 0);                          // вращается вокруг пояса
  const m = new THREE.Mesh(g, HUMAN_VC);
  const floor = groundH(p.x, p.z);
  m.position.set(p.x, floor + 1.1, p.z);
  m.rotation.y = p.grp.rotation.y;
  scene.add(m);
  GORE.push({ m, vx: vx * 0.45 + rand(-2, 2), vy: rand(4, 7), vz: vz * 0.45 + rand(-2, 2),
    spin: rand(-9, 9), life: rand(7, 10), bleed: 1e9, rest: 0, soft: true, starT: 0 });
  for (let i = 0; i < 4; i++) puff(p.x + rand(-0.5, 0.5), 0.4, p.z + rand(-0.5, 0.5), false, rand(0.4, 0.7));
  emote(p.x, 2.2, p.z, 'star', 4);
  scare(p.x, p.z);
  callAmbulance(p.x, p.z);
}

function updateGore (dt) {
  for (let i = GORE.length - 1; i >= 0; i--) {
    const g = GORE[i];
    if (!g.rest) {
      g.vy -= 19 * dt;
      g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt;
      g.m.rotation.x += g.spin * dt; g.m.rotation.z += g.spin * 0.6 * dt;
      // пол под куском — там, куда он долетел: на склоне это важно
      const fl = groundH(g.m.position.x, g.m.position.z);
      if (g.m.position.y < fl + 0.18) {
        g.m.position.y = fl + 0.18;
        g.vy *= -0.28; g.vx *= 0.55; g.vz *= 0.55; g.spin *= 0.5;
        if (Math.hypot(g.vx, g.vz) < 0.6 && Math.abs(g.vy) < 0.8) {
          g.rest = 1;
          g.m.rotation.set(Math.PI / 2, g.m.rotation.y, 0);   // лёг плашмя
          if (g.soft) g.m.position.y = fl + 0.15;
          else decal(g.m.position.x, g.m.position.z, 0x8f1f2b, rand(0.6, 1.1), 50);
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
    // лежит «в отключке»: звёздочки над головой, в конце — облачко пыли
    if (g.soft && g.rest && (g.starT -= dt) <= 0) { g.starT = 0.7; emote(g.m.position.x, 0.9, g.m.position.z, 'star', 1); }
    g.life -= dt;
    if (g.life < 1) g.m.scale.setScalar(Math.max(0.001, g.life));
    if (g.soft && g.life <= 0) puff(g.m.position.x, 0.3, g.m.position.z, false, 0.8);
    if (g.life <= 0) { scene.remove(g.m); g.m.geometry.dispose(); if (g.m.material !== HUMAN_VC) g.m.material.dispose(); GORE.splice(i, 1); }
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
  else toast(victim ? $t('минус {what}', { what: victim.name }) : $t('минус прохожий'));
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
      m.position.set(p.x + c * rand(-1.2, 1.2), groundH(p.x, p.z) + rand(0.5, 1.1), p.z - sn * rand(-1.2, 1.2));
      m.rotation.set(rand(0, 6), p.ry, rand(0, 6));
      scene.add(m);
      GORE.push({
        m, vx: nx * rand(2, 7) + rand(-3, 3), vy: rand(2.5, 6), vz: nz * rand(2, 7) + rand(-3, 3),
        spin: rand(-10, 10), life: rand(14, 20), bleed: 1e9, rest: 0,
      });
    }
    Snd.noise(0.25, 0.3);
    toast($t('минус лавочка'));
    return;
  }

  // столб валится в ту сторону, куда его ударили
  TILT_AXIS.set(-nz, 0, nx).normalize();
  p.ax = TILT_AXIS.x; p.az = TILT_AXIS.z;
  p.tiltV = 2.6 + clamp(force, 0, 30) * 0.09;
  const bulb = p.inner.userData.bulb;
  if (bulb) bulb.material = new THREE.MeshBasicMaterial({ color: 0x2e2b33 });
  for (const b of p.inner.userData.bulbs || []) b.material = LIGHT_OFF;
  Snd.noise(0.35, 0.34);
  Snd.blip(120, 0.2, 'sawtooth', 0.16);
  toast(p.kind === 'lamp' ? $t('минус фонарь') : $t('минус светофор'));
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
   Где стоят и как переключаются — посчитано в графе (SIG_GROUPS, TL).
   Здесь сами столбы: на правом тротуаре у стоп-линии, а над широкой
   улицей — на Г-образной консоли, чтобы голову было видно из любой
   полосы. Лампы делят материалы по фазам: переключить весь город —
   шесть строчек. */

const LAMP_ON = { r: 0xe8323c, y: 0xffc63d, g: 0x3fd15e };
const LAMP_DIM = { r: 0x4a2226, y: 0x4a3d20, g: 0x1f3a26 };
const LAMP = [0, 1].map(() => ({
  r: new THREE.MeshBasicMaterial({ color: LAMP_DIM.r }),
  y: new THREE.MeshBasicMaterial({ color: LAMP_DIM.y }),
  g: new THREE.MeshBasicMaterial({ color: LAMP_DIM.g }),
}));
const LIGHT_OFF = new THREE.MeshBasicMaterial({ color: 0x2e2b33 });

const LIGHT_AT = [];                              // где уже стоят столбы светофоров
function buildLights () {
  const headGeo = new THREE.BoxGeometry(0.55, 1.55, 0.42);
  const visor = new THREE.BoxGeometry(0.62, 0.06, 0.3);
  const bulbGeo = new THREE.SphereGeometry(0.17, 8, 6);
  for (const g of SIG_GROUPS)
    for (const e of g.app) {
      const B = NODES[e.b];
      const off = e.w / 2 + 0.9;
      const x = B.x - e.ux * e.stopAt + e.rx * off, z = B.z - e.uz * e.stopAt + e.rz * off;
      if (!inBounds(x, z, -60)) continue;
      const ry = Math.atan2(-e.ux, -e.uz);               // голова смотрит на тех, кто подъезжает
      // Большой перекрёсток в карте — несколько узлов, и у каждого свой
      // въезд: столбы вставали частоколом и прямо на полотне. Второй столб
      // в ту же сторону ближе восьми метров и столб на асфальте не ставим.
      const on = nearestRoad(x, z, 7, 1);
      if (on && on.d < on.seg.w / 2 - 0.3) continue;
      if (LIGHT_AT.some(q => (q[0] - x) ** 2 + (q[1] - z) ** 2 < 64 && Math.abs(Math.atan2(Math.sin(q[2] - ry), Math.cos(q[2] - ry))) < 0.7)) continue;
      LIGHT_AT.push([x, z, ry]);
      const arm = e.w >= 10 ? Math.min(e.w / 2 + 0.9 - laneOff(e, 0) + 1.4, e.w * 0.7) : 0;
      const lamp = LAMP[e.sig.ph];
      addProp(x, z, ry, 'light', gr => {
        propBox(gr, 0.24, arm ? 6.4 : 4.4, 0.24, '#4e4a55', 0, arm ? 3.2 : 2.2, 0);
        const head = (hx, hy) => {
          const h = new THREE.Mesh(headGeo, propMat('#2f2b36'));
          h.position.set(hx, hy, 0.05);
          gr.add(h);
          const bulbs = [];
          for (const [k, dy] of [['r', 0.46], ['y', 0], ['g', -0.46]]) {
            const b = new THREE.Mesh(bulbGeo, lamp[k]);
            b.position.set(hx, hy + dy, 0.26);
            gr.add(b);
            const v = new THREE.Mesh(visor, propMat('#2f2b36'));
            v.position.set(hx, hy + dy + 0.2, 0.36);
            gr.add(v);
            bulbs.push(b);
          }
          return bulbs;
        };
        let bulbs = head(0.3, 3.1);
        if (arm) {
          // консоль над полосами: вторая голова висит над дорогой
          propBox(gr, arm, 0.18, 0.18, '#4e4a55', -arm / 2, 6.3, 0);
          bulbs = bulbs.concat(head(-arm + 0.2, 5.4));
        }
        gr.userData.bulbs = bulbs;
      }, 0.8);
    }
}

function updateLights (dt) {
  TL.t += dt;
  if (TL.t > TL_PLAN[TL.i][2]) { TL.t = 0; TL.i = (TL.i + 1) % TL_PLAN.length; }
  for (const ph of [0, 1]) {
    const st = lightOf(ph);
    // жёлтый мигает перед красным, зелёный последние секунды — тоже
    const blink = st === 'g' && TL_PLAN[TL.i][2] - TL.t < 2.5 && Math.floor(TL.t * 3) % 2;
    for (const k of ['r', 'y', 'g'])
      LAMP[ph][k].color.setHex(st === k && !blink ? LAMP_ON[k] : LAMP_DIM[k]);
  }
}

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
   Машина едет по своей полосе от края перекрёстка до края, а через
   перекрёсток — дугой Безье из своей полосы в полосу следующей улицы.
   На односторонней улице против движения не поедет, на красный стоит
   у стоп-линии, перед зеброй пропускает тех, кто уже вышел на дорогу.
   Каждая третья — жёлтое такси: гонит быстрее и встаёт у бордюра где
   попало, с аварийкой. */

const TRAFFIC = [];
const CAR_HEX = ['#7fa8e0', '#8fd0a4', '#e6dfd2', '#d99ab8', '#e8cf8a', '#b9a7dd', '#f2f2ee', '#3c4048', '#9aa6b8', '#c85a4f'];
const MODELS = ['sedan', 'sedan', 'hatch', 'hatch', 'hatch', 'smart', 'suv', 'suv', 'cn', 'cn', 'cn'];   // cn — китайцы, каждая четвёртая
const TAXI_HEX = '#ffc400';

function newCar (parked) {
  const taxi = !parked && chance(0.3);
  const model = taxi ? pick(['sedan', 'hatch', 'suv', 'cn']) : pick(MODELS);
  // Поток — лёгкие машины (один-два меша вместо двадцати), как на парковке:
  // полную модель с мнущимися панелями ставим, когда задели (fullCar).
  // Такси — сразу полные: им нужны шашечки и аварийка на остановках.
  const mesh = parked || !taxi ? makeCarLite(pick(CAR_HEX), model) : makeCar(TAXI_HEX, false, model, taxi);
  return {
    mesh, model, taxi, hl: mesh.userData.hl, parked: !!parked,
    e: null, s: 0, lane: 0, turn: null, cruise: taxi ? rand(12, 17) : rand(9, 14), speed: 0,
    x: 0, z: 0, h: 0, wheel: 0, hp: 100, wreck: 0, wreckT: 0, hitT: 0,
    knock: 0, kvx: 0, kvy: 0, kvz: 0, spin: 0, y: 0, roll: 0, smokeT: 0,
    rejoin: 0, jx: 0, jz: 0, jh: 0, waitT: 0, ghost: 0, pull: 0, stopT: 0, stopCd: rand(8, 30),
  };
}

/* ставим машину на случайную полосу рядом с курьером: не под капотом,
   но и не на другом конце карты */
function placeTraffic (t, rmin, rmax) {
  for (let k = 0; k < 24; k++) {
    const a = nodeNear(V.x, V.z, rmin, rmax);
    const opts = NODES[a].nb.map(b => edgeOf(a, b)).filter(e => e.ok && e.c <= 5 && edgeRun(e) > 8 && inBounds(NODES[e.b].x, NODES[e.b].z));
    if (!opts.length) continue;
    const e = pick(opts);
    t.e = e; t.s = rand(0, edgeRun(e) * 0.8); t.lane = (Math.random() * laneCount(e)) | 0; t.turn = null;
    t.rejoin = 0; t.pull = 0; t.stopT = 0;
    t.gy = undefined;              // высота — с нового места: со старой машину на мосту сажало на землю под настилом
    poseTraffic(t, 0);
    // не рождаться внутри другой машины — но и без места не оставаться
    if (k < 23 && TRAFFIC.some(o => o !== t && Math.hypot(o.x - t.x, o.z - t.z) < 7)) continue;
    return true;
  }
  return false;
}

function spawnTraffic (n) {
  for (let k = 0; k < n; k++) {
    const t = newCar(false);
    scene.add(t.mesh);
    TRAFFIC.push(t);
    placeTraffic(t, 40, 330);
  }
}

/* Машину ставим на то, по чему она едет, и наклоняем по склону:
   высоту берём под передними и задними колёсами. */
function poseOnSlope (t) {
  const k = (t.hl || 2) * 0.72;
  const hx = Math.sin(t.h) * k, hz = Math.cos(t.h) * k;
  t.gy = surfaceAt(t.x, t.z, t.gy);
  const f = surfaceAt(t.x + hx, t.z + hz, t.gy), b = surfaceAt(t.x - hx, t.z - hz, t.gy);
  t.mesh.position.set(t.x, t.gy, t.z);
  t.mesh.rotation.set(-Math.atan((f - b) / (2 * k)), t.h, 0);
}

/* точка полосы на ребре: s — сколько проехали от края перекрёстка */
function lanePoint (e, lane, s, extra) {
  const A = NODES[e.a], o = laneOff(e, lane) + (extra || 0), d = e.tA + s;
  return [A.x + e.ux * d + e.rx * o, A.z + e.uz * d + e.rz * o];
}

function bez (T, q) {
  const u = 1 - q;
  return [u * u * T.p0[0] + 2 * u * q * T.p1[0] + q * q * T.p2[0],
          u * u * T.p0[1] + 2 * u * q * T.p1[1] + q * q * T.p2[1]];
}

function poseTraffic (t, dt) {
  let lx, lz, lh;
  if (t.turn) {
    const T = t.turn, q = clamp(T.q, 0, 1);
    [lx, lz] = bez(T, q);
    const dx = 2 * (1 - q) * (T.p1[0] - T.p0[0]) + 2 * q * (T.p2[0] - T.p1[0]);
    const dz = 2 * (1 - q) * (T.p1[1] - T.p0[1]) + 2 * q * (T.p2[1] - T.p1[1]);
    lh = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : t.h;
  } else {
    const e = t.e;
    [lx, lz] = lanePoint(e, t.lane, t.s, t.pull);
    lh = Math.atan2(e.ux, e.uz);
  }
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
  poseOnSlope(t);
  if (dt) {
    t.wheel += t.speed * dt / 0.46;
    for (const w of t.mesh.userData.wheels) w.rotation.x = t.wheel;
    for (const s of t.mesh.userData.steer) s.rotation.y = damp(s.rotation.y, t.turn ? clamp(t.turn.bend * 0.5, -0.5, 0.5) : 0, 8, dt);
  }
}

/* Куда свернуть на перекрёстке. Прямо — охотнее, в сторону — реже,
   назад — только из тупика. Во дворы трафик не заезжает. */
function nextEdge (e) {
  const opts = [];
  let sum = 0;
  for (const c of NODES[e.b].nb) {
    if (c === e.a) continue;
    const n = edgeOf(e.b, c);
    if (!n.ok || n.c > 5 || n.closed) continue;              // closed — ремонт (roadlife.js)
    if (!inBounds(NODES[c].x, NODES[c].z, -40)) continue;   // за рамку не уезжаем
    const dot = e.ux * n.ux + e.uz * n.uz;
    const w = 0.35 + Math.max(0, dot) * 2.2 + (n.c <= 3 ? 0.6 : 0);
    opts.push([n, w]); sum += w;
  }
  if (!opts.length) {
    const back = edgeOf(e.b, e.a);
    return back.ok ? back : null;
  }
  let r = Math.random() * sum;
  for (const [n, w] of opts) if ((r -= w) <= 0) return n;
  return opts[opts.length - 1][0];
}

/* дуга через перекрёсток: из конца своей полосы в начало следующей */
function startTurn (t, over) {
  const e = t.e, n = nextEdge(e);
  if (!n) { placeTraffic(t, 120, 340); return; }
  const lane = clamp(t.lane, 0, laneCount(n) - 1);
  const p0 = lanePoint(e, t.lane, edgeRun(e)), p2 = lanePoint(n, lane, 0);
  // вершина дуги — пересечение двух полос; если они почти параллельны
  // или пересекаются где-то далеко — середина между концами с выносом
  const den = e.ux * n.uz - e.uz * n.ux;
  const d = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
  let p1 = null;
  if (Math.abs(den) > 0.2) {
    const a = ((p2[0] - p0[0]) * n.uz - (p2[1] - p0[1]) * n.ux) / den;
    const px = p0[0] + e.ux * a, pz = p0[1] + e.uz * a;
    const b = (px - p2[0]) * -n.ux + (pz - p2[1]) * -n.uz;
    if (a > 0 && b > 0 && a < d * 2 + 4 && b < d * 2 + 4) p1 = [px, pz];
  }
  if (!p1) p1 = [(p0[0] + p2[0]) / 2 + (e.ux - n.ux) * d * 0.25, (p0[1] + p2[1]) / 2 + (e.uz - n.uz) * d * 0.25];
  const T = { p0, p1, p2, q: 0, len: 0, next: n, lane, bend: e.ux * n.uz - e.uz * n.ux };
  let prev = p0;
  for (let k = 1; k <= 8; k++) { const q = bez(T, k / 8); T.len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  if (T.len < 0.4) { t.e = n; t.lane = lane; t.s = over; return; }
  T.q = over / T.len;
  t.turn = T;
}

function wreckCar (t) {
  if (t.wreck) return;
  if (t.onBoom) t.onBoom();
  fullCar(t);
  t.wreck = 1; t.wreckT = rand(11, 16); t.chainT = 0;
  t.speed = 0;
  boom(t.x, t.z);
  t.mesh.traverse(o => { if (o.isMesh && o.material.color) o.material.color.setHex(0x241f26); });
}

/* Удар отбрасывает машину по земле: юзом, с разворотом и небольшим
   подскоком, а не кувырком в небо. Крен — пружина: качнуло и вернуло. */
function knockCar (t, nx, nz, force) {
  const f = clamp(force, 6, 60);
  t.knock = 1;
  t.kvx = nx * f * 0.95 + t.kvx * 0.3;
  t.kvz = nz * f * 0.95 + t.kvz * 0.3;
  t.kvy = clamp(f * 0.1, 1, 4.2);
  t.spin = rand(-1, 1) * (1.4 + f * 0.07);
  t.rollV = (t.rollV || 0) + rand(-1, 1) * Math.min(2.2, f * 0.06);
  t.speed = 0;
}

/* Прицепляем упавшую машину к ближайшей полосе, куда смотрит её нос,
   и запоминаем позу, с которой она будет возвращаться. */
function rejoinRoad (t) {
  if (t.svc) { t.repath = 1; t.turn = null; t.rejoin = 0; t.speed = 0; return; }   // у скорой и курьеров свой маршрут
  const road = nearestRoad(t.x, t.z, 5, 2);
  let e = road && road.seg.na !== undefined ? edgeOf(road.seg.na, road.seg.nb) : null;
  if (e) {
    if (!e.ok || e.ux * Math.sin(t.h) + e.uz * Math.cos(t.h) < 0) {
      const r = edgeOf(e.b, e.a);
      if (r.ok) e = r;
    }
  }
  if (!e || !e.ok) { placeTraffic(t, 120, 340); return; }
  t.e = e; t.turn = null; t.lane = 0; t.pull = 0;
  t.s = clamp(((t.x - NODES[e.a].x) * e.ux + (t.z - NODES[e.a].z) * e.uz) - e.tA, 0, edgeRun(e) * 0.95);
  t.jx = t.x; t.jz = t.z; t.jh = t.h;
  t.rejoin = 1;
  t.speed = 0;
}

/* Узел в кольце вокруг курьера: не под капотом, но и не на другом конце
   города — иначе улицы вокруг стоят пустые. Ищем по клеткам вокруг. */
function nodeNear (x, z, rmin, rmax) {
  const ci = Math.floor(x / NCELL), cj = Math.floor(z / NCELL), R = Math.ceil(rmax / NCELL);
  const ok = [];
  let best = -1, bd = 1e9;
  for (let i = ci - R; i <= ci + R; i++)
    for (let j = cj - R; j <= cj + R; j++) {
      const a = NODE_GRID.get(i + ',' + j);
      if (!a) continue;
      for (const k of a) {
        if (!NODES[k].nb.length || !inBounds(NODES[k].x, NODES[k].z, 8)) continue;
        const d = Math.hypot(NODES[k].x - x, NODES[k].z - z);
        if (d >= rmin && d <= rmax) { ok.push(k); continue; }
        const miss = d < rmin ? rmin - d : d - rmax;
        if (miss < bd) { bd = miss; best = k; }
      }
    }
  if (ok.length) return pick(ok);
  return best >= 0 ? best : nearestNode(x, z);
}

function respawnTraffic (t) {
  t.wreck = 0; t.knock = 0; t.hp = 100; t.y = 0; t.roll = 0; t.smokeT = 0; t.gy = undefined;
  t.stalled = 0; t.angry = 0; t.chainT = 0;
  if (t.driver) { scene.remove(t.driver.grp); t.driver.gone = 1; t.driver.dead = 1; t.driver = null; }
  scene.remove(t.mesh);
  t.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.dispose) o.material.dispose(); } });
  const fresh = newCar(false);
  Object.assign(t, { mesh: fresh.mesh, model: fresh.model, taxi: fresh.taxi, hl: fresh.hl, cruise: fresh.cruise });
  scene.add(t.mesh);
  // сразу ставим на новое место: иначе в следующем кадре машина всё ещё
  // числится за полкилометра и рождается заново — и так каждый кадр
  placeTraffic(t, 120, 340);
}

/* все, кто ходит и ездит по тротуарам: машины перед ними тормозят */
const walkersAll = () => [PEOPLE, PEDS, SCOOTS, AMB.medics, CREW, WAR.side2, LIFE.WALKERS];

function updateTraffic (dt) {
  for (const t of TRAFFIC) {
    if (t.hitT > 0) t.hitT -= dt;
    if (t.chainT > 0 && !t.wreck && (t.chainT -= dt) <= 0) { t.chainT = 0; wreckCar(t); S.wrecks++; }
    // укатилась за полкилометра — возвращаем в соседние кварталы
    if (!t.parked && !t.wreck && !t.knock && !t.driver && !t.svc &&
        Math.hypot(t.x - V.x, t.z - V.z) > 520) { respawnTraffic(t); continue; }
    // сгоревшая, но ещё летящая сперва доигрывает падение
    if (t.wreck && !t.knock) {
      t.smokeT -= dt;
      if (t.smokeT <= 0) { t.smokeT = 0.25; puff(t.x, 1.4, t.z, true, rand(0.6, 1.1)); if (chance(0.4)) fire(t.x, 1.2, t.z); }
      if ((t.wreckT -= dt) <= 0 && !t.parked) { if (t.svc) t.onWreck(t); else respawnTraffic(t); }
      else if (t.wreckT <= 0 && t.accident && !t.gone) svcGone(t);
      continue;
    }
    if (t.knock) {
      // пока летит и кувыркается, ей никто не управляет
      if (t.wreck) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = 0.25; puff(t.x, 1.4, t.z, true, rand(0.6, 1.1)); } }
      t.kvy -= 22 * dt;
      t.x += t.kvx * dt; t.z += t.kvz * dt; t.y += t.kvy * dt;
      // в дом не въезжает — тормозит об стену
      const bx = t.x, bz = t.z;
      pushOut(t, 1.1);
      if (bx !== t.x || bz !== t.z) { t.kvx *= 0.4; t.kvz *= 0.4; }
      t.gy = surfaceAt(t.x, t.z, t.gy);            // t.y — высота над тем, что под ней
      t.h += t.spin * dt;
      t.rollV = (t.rollV || 0) - t.roll * 14 * dt;
      t.rollV *= Math.exp(-3 * dt);
      t.roll = clamp(t.roll + t.rollV * dt, -0.55, 0.55);
      const onGround = t.y <= 0;
      if (onGround) {
        if (t.kvy < -3) sparks(t.x, 0.3, t.z, 4);
        t.y = 0; t.kvy = t.kvy < -3 ? -t.kvy * 0.2 : 0;
        // юз по асфальту: скорость и вращение гаснут
        const sp = Math.hypot(t.kvx, t.kvz), k = Math.max(0, sp - 11 * dt) / (sp || 1);
        t.kvx *= k; t.kvz *= k; t.spin *= Math.exp(-2.2 * dt);
        if (sp > 4 && Math.random() < dt * 12) puff(t.x, 0.2, t.z, false, 0.35);
        if (sp < 0.8 && Math.abs(t.roll) < 0.04) {
          t.knock = 0; t.roll = 0; t.rollV = 0; t.y = 0;
          poseOnSlope(t);
          if (t.angry && !t.wreck) { t.angry = 0; stallCar(t); }
          else if (!t.parked && !t.stalled) rejoinRoad(t);
        }
      }
      // наклонённый кузов приподнимаем, иначе угол уходит под асфальт
      t.mesh.position.set(t.x, t.gy + t.y + Math.abs(Math.sin(t.roll)) * 0.9, t.z);
      t.mesh.rotation.set(0, t.h, t.roll);
      if (t.hp < 45) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = 0.3; puff(t.x, 1.3, t.z, t.hp < 25, 0.6); } }
      continue;
    }
    if (t.hp < 45) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = 0.45; puff(t.x, 1.3, t.z, t.hp < 25, 0.55); } }
    if (t.parked) { if (t.moved) { poseOnSlope(t); t.moved = 0; } continue; }
    if (t.stalled) {
      // стоит с аварийкой, пока водитель разбирается
      poseOnSlope(t);
      const hz3 = t.mesh.userData.hazard, on = Math.floor(tG * 2.5) % 2 === 0;
      if (hz3) for (const m of hz3) m.visible = on;
      if (!t.driver && (t.stallT -= dt) <= 0) { t.stalled = 0; for (const m of hz3 || []) m.visible = false; rejoinRoad(t); }
      continue;
    }
    if (t.svc) { svcDrive(t, dt); continue; }
    if (!t.e) { placeTraffic(t, 120, 340); if (!t.e) continue; }

    // Тормозит перед всем, что стоит прямо по курсу — не только перед
    // своей полосой: упавшую поперёк машину объезжать не умеет, но и не таранит.
    let slow = 1;
    const hx = Math.sin(t.h), hz = Math.cos(t.h);
    const ahead = (ox, oz, gap, half, reach) => {
      const dx = ox - t.x, dz = oz - t.z;
      const fw = dx * hx + dz * hz;
      if (fw <= 0 || fw > reach) return false;
      if (Math.abs(-hz * dx + hx * dz) > half) return false;
      slow = Math.min(slow, clamp((fw - gap) / 7, 0, 1));
      return true;
    };
    let blocked = false;
    if (t.ghost > 0) t.ghost -= dt;
    else for (const o of TRAFFIC) {
      if (o === t || Math.abs(o.x - t.x) > 16 || Math.abs(o.z - t.z) > 16) continue;
      // встречную не ждём: она в своей полосе
      if (!o.knock && !o.parked && Math.sin(o.h) * hx + Math.cos(o.h) * hz < -0.3) continue;
      // клинч — только с тем, кто стоит поперёк; в попутной очереди просто ждём
      if (ahead(o.x, o.z, (t.hl || 2) + (o.hl || 2) + 1.4, 1.9, 15) &&
          Math.abs(Math.sin(o.h) * hx + Math.cos(o.h) * hz) < 0.85) blocked = true;
    }
    ahead(V.x, V.z, 6, 2.1, 15);
    // пешеходы и самокатчики на полотне: пропускаем
    for (const list of walkersAll())
      for (const p of list) {
        if (p.dead || Math.abs(p.x - t.x) > 13 || Math.abs(p.z - t.z) > 13) continue;
        ahead(p.x, p.z, 3.4, 1.8, 12);
      }
    // красный: встаём у стоп-линии. Кто уже въехал — доезжает; на жёлтом
    // тот, кому до линии пара метров, тоже проезжает, а не тормозит в пол
    if (!t.turn && t.e.sig) {
      const e = t.e, st = lightOf(e.sig.ph);
      const toLine = e.len - e.stopAt - e.tA - t.s;
      if (st !== 'g' && toLine > -0.5 && toLine < 34 && !(st === 'y' && toLine < 5 && t.speed > 6))
        slow = Math.min(slow, clamp((toLine - 0.6) / 9, 0, 1));
    }
    // такси встаёт у бордюра: высадить, подобрать, посмотреть в телефон
    if (t.taxi && !t.turn) {
      const e = t.e, curb = e.w / 2 - 1.1 - laneOff(e, 0);
      if (t.stopT > 0) {
        t.pull = damp(t.pull, Math.max(0, curb), 2.5, dt);
        if (t.pull > curb - 0.3) { slow = 0; t.stopT -= dt; }
        else slow = Math.min(slow, 0.35);
      } else {
        t.pull = damp(t.pull, 0, 2, dt);
        t.stopCd -= dt;
        if (t.stopCd <= 0 && t.lane === 0 && e.c >= 3 && edgeRun(e) - t.s > 22 && !e.sig && curb > 0.4) {
          t.stopT = rand(3.5, 7); t.stopCd = rand(18, 45);
        }
      }
      const hz2 = t.mesh.userData.hazard;
      if (hz2 && hz2.length) { const on = t.stopT > 0 && Math.floor(tG * 2.5) % 2 === 0; for (const m of hz2) m.visible = on; }
    }
    slow = Math.min(slow, RL.hold(t, dt));        // пробка за аварией, ремонт (roadlife.js)
    t.speed = damp(t.speed, t.cruise * slow, 3.2, dt);
    if (slow < 0.02) t.speed = 0;                 // иначе доползает за стоп-линию
    // встали из-за поперечной машины и стоим долго — значит, сцепились на
    // перекрёстке: пару секунд едем, не глядя на других (людей видим всегда)
    if (t.speed < 0.3 && blocked) { if ((t.waitT += dt) > 5) { t.ghost = 1.6; t.waitT = 0; } }
    else t.waitT = 0;

    const step = t.speed * dt;
    if (t.turn) {
      t.turn.q += step / t.turn.len;
      if (t.turn.q >= 1) {
        const over = (t.turn.q - 1) * t.turn.len;
        t.e = t.turn.next; t.lane = t.turn.lane; t.s = over; t.turn = null;
      }
    } else {
      t.s += step;
      if (t.s >= edgeRun(t.e)) startTurn(t, t.s - edgeRun(t.e));
    }
    poseTraffic(t, dt);
  }
  for (let i = TRAFFIC.length - 1; i >= 0; i--) if (TRAFFIC[i].gone) TRAFFIC.splice(i, 1);
}

/* ─────────────── кофе у пиццерии ───────────────
   У входа всегда стоит кружок сотрудников с горячим кофе: отпивают, от
   стаканчиков идёт пар, болтают. Заказов не делают, никуда не уходят.
   Сбил — на месте встаёт другой: кружок не пустеет. (Раньше тут была
   курилка — табак площадки не пропускают.) */
const SMOKERS = [];
let SMOKE_SPOT = null;
/* завсегдатаи курилки: всегда тут и всегда рядом друг с другом —
   двое выдуманных, одни и те же на всю смену */
let SMOKE_REGULARS = null;

function initSmokers () {
  if (!SMOKE_SPOT) return;
  if (!SMOKE_REGULARS) SMOKE_REGULARS = [makePerson(), makePerson()];
  const { x, z } = SMOKE_SPOT;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.4;
    const regular = SMOKE_REGULARS[i] || null;
    const p = { person: regular || nextPerson(), regular, x: x + Math.sin(a) * 1.5, z: z + Math.cos(a) * 1.5, a, dead: 0, deadT: 0,
                ph: rand(0, 6), puffT: rand(0.5, 3), grp: null };
    smokerBody(p);
    SMOKERS.push(p);
  }
}

function smokerBody (p) {
  if (p.grp) dropMesh(p.grp);
  p.grp = makeHuman(p.person);
  // взрослая версия — сигарета, детская — стаканчик кофе с красной крышкой
  if (ADULT) {
    const cig = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), new THREE.MeshBasicMaterial({ color: 0xf4f1ea }));
    cig.position.set(0, -0.5, 0.12);
    p.grp.userData.armR.add(cig);
  } else {
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0xf4f1ea }));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 8), new THREE.MeshLambertMaterial({ color: 0xf0522a }));
  lid.position.y = 0.11; cup.add(lid);
  cup.position.set(0, -0.55, 0.1);
  p.grp.userData.armR.add(cup);
  }
  p.grp.position.set(p.x, groundH(p.x, p.z), p.z);
  p.grp.rotation.y = Math.atan2(SMOKE_SPOT.x - p.x, SMOKE_SPOT.z - p.z);   // лицом в кружок
  scene.add(p.grp);
}

function updateSmokers (dt) {
  for (const p of SMOKERS) {
    if (p.dead) {
      if ((p.deadT -= dt) <= 0) { p.dead = 0; p.person = p.regular || nextPerson(); smokerBody(p); }
      continue;
    }
    p.ph += dt;
    const u = p.grp.userData;
    // глоток: рука к лицу раз в несколько секунд
    const drag = Math.max(0, Math.sin(p.ph * 0.9)) ** 6;
    u.armR.rotation.x = -0.5 - drag * 1.7;
    u.armL.rotation.x = -0.2;
    u.head.rotation.y = Math.sin(p.ph * 0.4 + p.a) * 0.35;         // крутят головой — болтают
    if (p.shock > 0) shockStep(p, dt);
    if ((p.puffT -= dt) <= 0) {
      p.puffT = rand(1.4, 3.2);
      const fx = Math.sin(p.grp.rotation.y), fz = Math.cos(p.grp.rotation.y);
      if (ADULT) {
        // затяжка — облачко дыма у лица
        const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xe9e7e2, transparent: true, opacity: 0.5, depthWrite: false }));
        m.position.set(p.x + fx * 0.4, groundH(p.x, p.z) + 1.6, p.z + fz * 0.4);
        m.scale.setScalar(0.22);
        fxAdd(m, { vy: rand(0.5, 0.9), vx: fx * 0.4 + rand(-0.2, 0.2), vz: fz * 0.4 + rand(-0.2, 0.2), life: rand(1.4, 2.2), max: 2.2, grow: 1.3 });
      } else
      // пар от горячего кофе — маленький и у руки, а не облако у лица
      steam(p.x + fx * 0.35 + Math.cos(p.grp.rotation.y) * 0.3, 1.25, p.z + fz * 0.35 - Math.sin(p.grp.rotation.y) * 0.3);
    }
    // под колёсами — как все
    const dx = p.x - V.x, dz = p.z - V.z, fx = Math.sin(V.h), fz = Math.cos(V.h);
    if (Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35 && Math.hypot(V.vx, V.vz) > 3) {
      p.dead = 1; p.deadT = rand(25, 40);
      p.grp.visible = false;
      gibHuman(p, V.vx, V.vz);
      S.people++;
      Snd.squish();
      toast($t('минус {what}', { what: p.person ? p.person.name : ADULT ? $t('курильщик') : $t('сотрудник') }));
    }
  }
}

/* ─────────────── злой водитель ───────────────
   Протаранил чужую машину — она не уезжает как ни в чём не бывало, а
   встаёт с аварийкой, и из неё выходит водитель. Бежит к тебе и бьёт
   по машине: мятины, искры, раз в пару секунд — минус сердце. Уехал
   дальше семидесяти метров или прошло полминуты — плюнул, вернулся за
   руль и поехал. Можно и задавить — но это уже совсем другая статья. */
const DRIVERS = [];
const RAGE = [$t('ты чё?!'), $t('куда прёшь!'), $t('стоять!'), $t('ну всё!'), $t('выходи!'), $t('я тебя запомнил'), $t('страховка есть?'), '!!!', $t('в глаза смотри!')];
/* облачко с руганью: белое, с красной обводкой, текст — пиксельным шрифтом */
function rageTex (text, col = '#d9342c') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.strokeStyle = col; x.lineWidth = 8;
  x.beginPath(); x.roundRect(8, 8, 240, 86, 22); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(110, 92); x.lineTo(128, 122); x.lineTo(146, 92); x.closePath(); x.fill();
  x.fillStyle = col; x.font = 'bold 30px "Press Start 2P", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  let fs = 30;
  while (fs > 12 && x.measureText(text).width > 220) { fs -= 2; x.font = 'bold ' + fs + 'px "Press Start 2P", sans-serif'; }
  x.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stallCar (t) {
  t.stalled = 1; t.speed = 0; t.stallT = 30;
  const hx = Math.sin(t.h), hz = Math.cos(t.h);
  // выходит со стороны водителя: слева по ходу
  const x = t.x + hz * 1.4 - hx * 0.3, z = t.z - hx * 1.4 - hz * 0.3;
  const grp = makeHuman(null);
  grp.position.set(x, groundH(x, z), z);
  // злится: лицо багровое, над головой облачко с руганью
  const u = grp.userData;
  for (const m of [].concat(u.head.material)) m.color.set('#d8534a');
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: rageTex(pick(RAGE)), transparent: true, depthWrite: false }));
  bubble.scale.set(2.4, 1.2, 1);
  bubble.position.set(0, 2.55, 0);
  grp.add(bubble);
  scene.add(grp);
  const d = { t, grp, x, z, state: 'chase', hitT: 0.6, ph: 0, give: 28, dead: 0, punch: 0, strikes: 0, bubble, sayT: 1.6, bangT: 0.3 };
  t.driver = d;
  DRIVERS.push(d);
  toast(t.taxi ? pick([$t('таксист вышел разбираться'), $t('таксист: «ты чё, слепой?»')])
               : pick([$t('водитель вышел разбираться'), $t('ну всё, ты попал'), $t('водитель бежит к тебе')]));
}

function updateDrivers (dt) {
  for (let i = DRIVERS.length - 1; i >= 0; i--) {
    const d = DRIVERS[i], t = d.t, u = d.grp.userData;
    if (d.dead || t.wreck) {
      if (!d.gone) { dropMesh(d.grp); d.gone = 1; }
      // водителя задавили — машина без хозяина так и стоит с аварийкой:
      // вести её некому. Раньше она тут же «оживала» и прыгала на полосу —
      // выглядело так, будто водитель превратился в машину
      t.driver = null;
      if (t.wreck) t.stalled = 0;
      else t.stallT = Infinity;
      DRIVERS.splice(i, 1);
      continue;
    }
    const dxV = V.x - d.x, dzV = V.z - d.z, dV = Math.hypot(dxV, dzV);
    d.give -= dt;
    if (d.state !== 'back' && (dV > 70 || d.give <= 0 || S.state === 'over' || S.state === 'title')) d.state = 'back';
    let tx, tz, spd = 0;
    if (d.state === 'chase') {
      if (dV < 2.6) d.state = 'hit';
      else { tx = V.x; tz = V.z; spd = 4.3; }
    } else if (d.state === 'hit') {
      if (dV > 3.4) d.state = 'chase';
      d.hitT -= dt;
      d.punch = Math.max(0, d.punch - dt * 4);
      if (d.hitT <= 0) {
        d.hitT = 0.75; d.punch = 1; d.strikes++;
        const hx = d.x + dxV * 0.6, hz = d.z + dzV * 0.6;
        dentCar(car, hx, hz, 8);
        sparks(hx, 1, hz, 5, -dxV / (dV || 1), -dzV / (dV || 1));
        Snd.blip(110, 0.08, 'square', 0.12);
        S.shake = Math.max(S.shake, 0.18);
        if (d.strikes % 3 === 0) hurtCar(1, 14, hx, hz);
        if (d.strikes === 1) toast(pick([$t('он бьёт машину!'), $t('уезжай или дави'), $t('по капоту, по капоту!')]));
      }
      d.grp.rotation.y = damp(d.grp.rotation.y, Math.atan2(dxV, dzV), 10, dt);
    } else {
      // обратно за руль
      const dxC = t.x - d.x, dzC = t.z - d.z, dC = Math.hypot(dxC, dzC);
      if (dC < 1.6) {
        dropMesh(d.grp); d.gone = 1;
        DRIVERS.splice(i, 1);
        t.driver = null; t.stalled = 0;
        rejoinRoad(t);
        continue;
      }
      tx = t.x; tz = t.z; spd = 2.2;
    }
    if (spd) {
      const dx = tx - d.x, dz = tz - d.z, l = Math.hypot(dx, dz) || 1;
      d.x += dx / l * spd * dt; d.z += dz / l * spd * dt;
      pushOut(d, 0.45);
      d.ph += dt * spd * 3;
      d.grp.rotation.y = damp(d.grp.rotation.y, Math.atan2(dx, dz), 10, dt);
    }
    d.grp.position.set(d.x, groundH(d.x, d.z) + curbAt(d.x, d.z) + (spd ? Math.abs(Math.sin(d.ph)) * 0.08 : 0), d.z);
    // ругается: облачко меняет текст, вылетают красные «!», облачко дрожит
    if (d.state !== 'back') {
      if ((d.sayT -= dt) <= 0) {
        d.sayT = rand(1.3, 2.2);
        d.bubble.material.map.dispose();
        d.bubble.material.map = rageTex(pick(RAGE));
        d.bubble.material.needsUpdate = true;
      }
      if ((d.bangT -= dt) <= 0) { d.bangT = rand(0.35, 0.7); emote(d.x, 2.2, d.z, 'angry', 1); }
      d.bubble.visible = true;
      d.bubble.position.x = Math.sin(tG * 40) * 0.05;
    } else d.bubble.visible = false;
    const sw = spd ? Math.sin(d.ph) * 0.9 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = d.state === 'chase' ? -2.5 + Math.sin(tG * 18) * 0.3 : -sw * 0.8;   // кулаком трясёт
    u.armR.rotation.x = d.state === 'hit' ? -1.4 - d.punch * 0.9 : sw * 0.8;
    // задавить водителя — на скорости, как всех
    if (d.state !== 'back' || dV < 5) {
      const fx = Math.sin(V.h), fz = Math.cos(V.h), along = -dxV * fx - dzV * fz, across = -dxV * fz + dzV * fx;
      if (Math.abs(along) < CAR_L + 0.5 && Math.abs(across) < CAR_W + 0.35 && Math.hypot(V.vx, V.vz) > 3) {
        gibHuman(d, V.vx, V.vz);
        dropMesh(d.grp); d.gone = 1; d.dead = 1;
        S.people++;
        Snd.squish();
        toast(t.taxi ? $t('минус таксист') : $t('минус водитель'));
      }
    }
  }
}

/* ─────────────── машины с маршрутом: скорая и курьеры ───────────────
   Обычный трафик катается куда глаза глядят. Скорой и курьерам-
   соперникам нужно в конкретное место, поэтому у них свой маршрут:
   узлы кратчайшего пути, сдвинутые на правую полосу. Живут они в том же
   списке TRAFFIC — значит, таранить, взрывать и подбрасывать их можно
   так же, как всех, а трафик перед ними тормозит. */

const rightOf = (a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l];
};

function lanePath (x0, z0, x1, z1) {
  const nodes = RL.svcNodes(x0, z0, x1, z1) || routeNodes(x0, z0, x1, z1);   // в объезд ремонта (roadlife.js)
  const r0 = nearestRoad(x0, z0, DRIVE_MAX, 2), r1 = nearestRoad(x1, z1, DRIVE_MAX, 3);
  const st = r0 ? [r0.x, r0.z] : [x0, z0], en = r1 ? [r1.x, r1.z] : [x1, z1];
  // узел за точкой назначения (или за спиной на старте) не нужен: иначе
  // машина проскакивает мимо до перекрёстка и возвращается
  const onSeg = (q, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    const k = ((q[0] - a.x) * dx + (q[1] - a.z) * dz) / l2;
    return k > 0 && k < 1 && Math.abs((q[0] - a.x) * dz - (q[1] - a.z) * dx) / Math.sqrt(l2) < 8;
  };
  while (nodes.length >= 2 && onSeg(en, nodes[nodes.length - 2], nodes[nodes.length - 1])) nodes.pop();
  while (nodes.length >= 2 && onSeg(st, nodes[1], nodes[0])) nodes.shift();
  const raw = [st];
  for (const n of nodes) raw.push([n.x, n.z]);
  raw.push(en);
  const pts = raw.filter((q, i) => i === 0 || Math.hypot(q[0] - raw[i - 1][0], q[1] - raw[i - 1][1]) > 2);
  if (pts.length < 2) return pts;
  // сдвиг на правую полосу; на изломе — по биссектрисе, чтобы полоса не сужалась
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const b = pts[i];
    const n1 = i > 0 ? rightOf(pts[i - 1], b) : null, n2 = i < pts.length - 1 ? rightOf(b, pts[i + 1]) : null;
    let nx = (n1 ? n1[0] : 0) + (n2 ? n2[0] : 0), nz = (n1 ? n1[1] : 0) + (n2 ? n2[1] : 0);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const ref = n1 || n2, dot = Math.max(0.55, nx * ref[0] + nz * ref[1]);
    const r = nearestRoad(b[0], b[1], DRIVE_MAX, 1);
    const o = (r ? Math.min(1.9, r.seg.w / 4) : 1.3) / dot;
    out.push([b[0] + nx * o, b[1] + nz * o]);
  }
  return out;
}

function svcRoute (t, x, z) {
  t.goal = { x, z };
  t.path = lanePath(t.x, t.z, x, z);
  t.pi = 0; t.arrived = 0;
  const P = t.path;
  // первая точка за спиной — начинаем со следующей
  if (P.length > 1 && Math.hypot(P[1][0] - t.x, P[1][1] - t.z) < Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1])) t.pi = 1;
}

/* новая машина с маршрутом: поля те же, что у трафика, плюс свои */
function newSvc (mesh, kind, o = {}) {
  const t = {
    mesh, model: mesh.userData.model, taxi: false, hl: mesh.userData.hl, parked: false, svc: kind,
    e: null, s: 0, lane: 0, turn: null, cruise: 13, speed: 0,
    x: 0, z: 0, h: 0, wheel: 0, hp: 160, wreck: 0, wreckT: 0, hitT: 0,
    knock: 0, kvx: 0, kvy: 0, kvz: 0, spin: 0, y: 0, roll: 0, smokeT: 0,
    rejoin: 0, jx: 0, jz: 0, jh: 0, waitT: 0, ghost: 0, pull: 0, stopT: 0, stopCd: 1e9,
    path: null, pi: 0, goal: null, arrived: 0, repath: 0,
    acc: 3, corner: 0.35, gap: 1.4, peds: true,
  };
  return Object.assign(t, o);
}

function svcPlace (t, x, z, tx, tz) {
  t.x = x; t.z = z; t.gy = undefined;
  svcRoute(t, tx, tz);
  const P = t.path, q = P[Math.min(t.pi + 1, P.length - 1)] || [tx, tz];
  t.h = Math.atan2(q[0] - x, q[1] - z);
  poseOnSlope(t);
}

function svcDrive (t, dt) {
  if (t.ramT > 0) {
    // таран: прямо на курьера, на полном ходу, ни на кого не глядя
    t.ramT -= dt;
    const a1 = Math.atan2(V.x - t.x, V.z - t.z), dh = Math.atan2(Math.sin(a1 - t.h), Math.cos(a1 - t.h));
    t.speed = damp(t.speed, t.cruise * 1.2 * RL.svcHold(t, dt), t.acc, dt);   // и на таран — не сквозь щиты ремонта
    t.h += clamp(dh, -3 * dt, 3 * dt);
    t.x += Math.sin(t.h) * t.speed * dt; t.z += Math.cos(t.h) * t.speed * dt;
    t.wheel += t.speed * dt / 0.46;
    for (const w of t.mesh.userData.wheels) w.rotation.x = t.wheel;
    poseOnSlope(t);
    if (t.ramT <= 0) { t.ramT = 0; t.repath = 1; }
    return;
  }
  if (t.repath && t.goal) { t.repath = 0; svcRoute(t, t.goal.x, t.goal.z); }
  const P = t.path;
  let want = 0, dh = 0;
  if (P && t.pi < P.length) {
    let tx = P[t.pi][0], tz = P[t.pi][1], d = Math.hypot(tx - t.x, tz - t.z);
    while (d < 3.5 && t.pi < P.length - 1) { t.pi++; tx = P[t.pi][0]; tz = P[t.pi][1]; d = Math.hypot(tx - t.x, tz - t.z); }
    const last = t.pi === P.length - 1;
    if (last && d < 2.2) t.pi++;
    want = t.cruise;
    if (t.passT > 0 && !last) {
      // обгон по встречке: держим цель на полосу левее
      t.passT -= dt;
      tx += Math.cos(t.h) * 3.3; tz -= Math.sin(t.h) * 3.3;
    }
    const a1 = Math.atan2(tx - t.x, tz - t.z);
    if (!last) {
      // перед поворотом сбрасывает: аккуратный — сильно, лихач — чуть-чуть
      const a2 = Math.atan2(P[t.pi + 1][0] - tx, P[t.pi + 1][1] - tz);
      const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
      if (d < 22) want *= lerp(1, t.corner, clamp(turn / 1.5, 0, 1));
    } else want = Math.min(want, 1.5 + d * 0.7);
    dh = Math.atan2(Math.sin(a1 - t.h), Math.cos(a1 - t.h));
    want *= clamp(1.3 - Math.abs(dh), 0.25, 1);    // отвернулся от цели — сперва довернуть
  } else t.arrived = 1;

  // впереди: чужие машины, курьер, люди на полотне
  let slow = 1;
  const hx = Math.sin(t.h), hz = Math.cos(t.h);
  const ahead = (ox, oz, gap, half, reach) => {
    const dx = ox - t.x, dz = oz - t.z, fw = dx * hx + dz * hz;
    if (fw <= 0 || fw > reach || Math.abs(-hz * dx + hx * dz) > half) return;
    slow = Math.min(slow, clamp((fw - gap) / 7, 0, 1));
  };
  if (t.ghost > 0) t.ghost -= dt;
  else {
    for (const o of TRAFFIC) {
      if (o === t || Math.abs(o.x - t.x) > 18 || Math.abs(o.z - t.z) > 18) continue;
      if (!o.knock && !o.parked && Math.sin(o.h) * hx + Math.cos(o.h) * hz < -0.3) continue;   // встречная
      if (t.aggr) {
        // злой курьер за медленными не плетётся: уходит на обгон, а кто не
        // успел убраться — того расталкивает (см. updateRivals)
        if (t.passT > 0) continue;
        const dx = o.x - t.x, dz = o.z - t.z, fw = dx * hx + dz * hz;
        if (fw > 0 && fw < 20 && Math.abs(-hz * dx + hx * dz) < 2.2 && o.speed < t.speed + 2) { t.passT = rand(1.8, 2.6); honk(t); continue; }
        continue;
      }
      ahead(o.x, o.z, (t.hl || 2) + (o.hl || 2) + t.gap, 1.9, 16);
    }
    // курьер стоит или плетётся впереди — злой объезжает и его, по встречке
    const vdx = V.x - t.x, vdz = V.z - t.z, vfw = vdx * hx + vdz * hz;
    if (t.aggr && t.passT <= 0 && vfw > 0 && vfw < 16 && Math.abs(-hz * vdx + hx * vdz) < 2.4 && Math.hypot(V.vx, V.vz) < t.speed + 3) { t.passT = 2.4; honk(t); }
    if (!(t.aggr && t.passT > 0)) ahead(V.x, V.z, (t.aggr ? 3 : 4.5) + t.gap, 2.1, 16);
    if (t.peds) for (const list of walkersAll())
      for (const p of list) {
        if (p.dead || Math.abs(p.x - t.x) > 13 || Math.abs(p.z - t.z) > 13) continue;
        ahead(p.x, p.z, t.aggr ? 1.8 : 3.2, 1.8, 12);
      }
  }
  slow = Math.min(slow, RL.svcHold(t, dt));        // щиты ремонта: встать, найти объезд (roadlife.js)
  const goal = want * slow;
  t.dbg = [+want.toFixed(1), +slow.toFixed(2), +dh.toFixed(2)];   // для отладки: чего хочет и что держит
  t.speed = damp(t.speed, goal, goal > t.speed ? t.acc : 5, dt);
  if (goal < 0.3) t.speed = Math.max(0, t.speed - 8 * dt);
  // стоит и не может проехать — через четыре секунды протискивается
  if (slow < 0.05 && want > 1) { if ((t.waitT += dt) > (t.aggr ? 1 : 4)) { t.ghost = 2; t.waitT = 0; honk(t); } } else t.waitT = 0;
  if (t.honkT > 0) t.honkT -= dt;
  // Страховка: хочет ехать, а стоит — упёрся носом в машину курьера (физика
  // каждый кадр режет скорость, и «протиснуться» не срабатывало) или в
  // кого-то ещё. Через две секунды — в объезд по соседней полосе.
  if (want > 1 && t.speed < 0.8) { if ((t.stuckT = (t.stuckT || 0) + dt) > 2) { t.passT = 2.4; t.ghost = 2; t.stuckT = 0; honk(t); } }
  else t.stuckT = 0;
  const rate = (t.aggr ? 3.2 : 2.4) * clamp(t.speed / 4, 0.35, 1.3);
  t.h += clamp(dh, -rate * dt, rate * dt);
  t.x += Math.sin(t.h) * t.speed * dt;
  t.z += Math.cos(t.h) * t.speed * dt;
  t.wheel += t.speed * dt / 0.46;
  for (const w of t.mesh.userData.wheels) w.rotation.x = t.wheel;
  for (const s of t.mesh.userData.steer) s.rotation.y = damp(s.rotation.y, clamp(dh, -0.5, 0.5), 8, dt);
  poseOnSlope(t);
}

/* гудок: злой курьер сигналит, когда обгоняет или протискивается — если ты рядом */
function honk (t) {
  if (t.honkT > 0 || !t.aggr) return;
  t.honkT = 3;
  const d = Math.hypot(t.x - V.x, t.z - V.z);
  if (d < 60) { Snd.blip(420, 0.14, 'square', 0.07 * (1 - d / 60)); setTimeout(() => Snd.blip(420, 0.2, 'square', 0.07 * (1 - d / 60)), 170); }
}

/* убрать машину с маршрутом совсем: из списка — после цикла по трафику */
function svcGone (t) {
  t.gone = 1;
  scene.remove(t.mesh);
  t.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.dispose && o.material !== HUMAN_VC) o.material.dispose(); } });
}

/* ─────────────── скорая ───────────────
   Сбили человека — на место едет скорая: с мигалкой и сиреной, по
   улицам, как все, трафик перед ней тормозит. Встаёт у ближайшей
   дороги, двое фельдшеров идут к месту, собирают всё, что осталось,
   отмывают асфальт от крови и уносят носилки. Если рядом ещё вызов —
   едет туда, иначе уезжает. Скорую тоже можно протаранить, а
   фельдшеров — задавить, и тогда вызов будет уже про них. */
const AMB = { t: null, state: 'idle', cd: 0, inc: null, medics: [], workT: 0, sirenT: 0, siren: 0, flashT: 0, goT: 0 };
const INCIDENTS = [];

function callAmbulance (x, z) {
  if (INTRO) return;
  const near = i => i && Math.hypot(i.x - x, i.z - z) < 14;
  if (INCIDENTS.some(near) || near(AMB.inc) || INCIDENTS.length >= 4) return;
  INCIDENTS.push({ x, z });
}

function makeAmbulance () {
  const g = makeCar('#f4f4f0', false, 'suv');
  const S = CAR_SPEC.suv, W = S.W, top = 0.42 + S.h;
  const parts = [];
  for (const sx of [-1, 1]) {
    box(parts, 0.03, 0.18, S.L - 0.5, '#d9262c', sx * (W / 2 + 0.09), top - 0.3, 0);
    box(parts, 0.03, 0.34, 0.1, '#d9262c', sx * (W / 2 + 0.1), top - 0.05, S.cz + 0.1);
    box(parts, 0.03, 0.1, 0.34, '#d9262c', sx * (W / 2 + 0.1), top - 0.05, S.cz + 0.1);
  }
  box(parts, 1.1, 0.1, 0.34, '#2b2a30', 0, top + S.ch + 0.16, S.cz + 0.7);
  g.add(new THREE.Mesh(mergeGeos(parts), HUMAN_VC));
  const flash = [];
  for (const [sx, hex] of [[-0.27, 0x2f7bff], [0.27, 0xff2a2a]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: hex }));
    m.position.set(sx, top + S.ch + 0.3, S.cz + 0.7);
    g.add(m); flash.push(m);
  }
  g.userData.flash = flash;
  return g;
}

function makeMedic () {
  return { grp: makeHuman(null, { shirt: '#eef2f4', pants: '#2f5fa8', fat: false }), x: 0, z: 0, ph: 0, dead: 0, ox: 0, oz: 0 };
}

/* узел подальше от курьера — туда скорая уезжает и там пропадает */
function farNode (x, z) {
  let best = nodeNear(x, z, 220, 380), bd = 0;
  for (let k = 0; k < 8; k++) {
    const n = nodeNear(x, z, 220, 380), d = Math.hypot(NODES[n].x - V.x, NODES[n].z - V.z);
    if (d > bd) { bd = d; best = n; }
  }
  return NODES[best];
}

function ambDispatch (inc) {
  const m = makeAmbulance();
  const t = newSvc(m, 'amb', { cruise: 16, acc: 3.5, corner: 0.4, gap: 1.2, dot: '#ff4d4d' });
  const n = NODES[nodeNear(inc.x, inc.z, 90, 170)];
  svcPlace(t, n.x, n.z, inc.x, inc.z);
  scene.add(m);
  TRAFFIC.push(t);
  Object.assign(AMB, { t, inc, state: 'go', goT: 0, medics: [] });
  t.onWreck = () => { svcGone(t); ambReset(); };
}

function ambReset () {
  for (const d of AMB.medics) if (!d.dead) dropMesh(d.grp);
  if (AMB.t && !AMB.t.gone) svcGone(AMB.t);
  Object.assign(AMB, { t: null, inc: null, state: 'idle', cd: 3, medics: [] });
}

/* фельдшер идёт к точке; true — дошёл */
function medicWalk (d, x, z, dt, spd = 2.4) {
  const dx = x - d.x, dz = z - d.z, l = Math.hypot(dx, dz);
  const u = d.grp.userData;
  if (l < 0.5) { u.legL.rotation.x = damp(u.legL.rotation.x, 0, 8, dt); u.legR.rotation.x = damp(u.legR.rotation.x, 0, 8, dt); return true; }
  d.x += dx / l * spd * dt; d.z += dz / l * spd * dt;
  pushOut(d, 0.45);
  d.ph += dt * 8;
  const sw = Math.sin(d.ph) * 0.8;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  d.grp.rotation.y = damp(d.grp.rotation.y, Math.atan2(dx, dz), 10, dt);
  return false;
}

function updateAmb (dt) {
  AMB.cd -= dt;
  const t = AMB.t;
  if (!t) {
    if (!INCIDENTS.length || AMB.cd > 0 || S.state === 'title' || S.state === 'intro') return;
    INCIDENTS.sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z));
    const inc = INCIDENTS.shift();
    if (Math.hypot(inc.x - V.x, inc.z - V.z) < 420) ambDispatch(inc);   // далеко — всё равно не видно
    return;
  }
  // мигалка и сирена — пока едет на вызов и пока стоит
  const on = AMB.state !== 'leave' && !t.wreck;
  if ((AMB.flashT -= dt) <= 0) {
    AMB.flashT = 0.13; AMB.siren ^= 1;
    const [b, r] = t.mesh.userData.flash;
    b.visible = !on || AMB.siren === 1; r.visible = !on || AMB.siren === 0;
  }
  if (AMB.state === 'go' && (AMB.sirenT -= dt) <= 0) {
    AMB.sirenT = 0.42;
    const d = Math.hypot(t.x - V.x, t.z - V.z);
    if (d < 170) Snd.blip(AMB.siren ? 760 : 580, 0.36, 'triangle', 0.09 * (1 - d / 170));
  }
  if (t.wreck) { for (const d of AMB.medics) if (!d.dead) handsUp(d.grp.userData, dt); return; }

  const side = () => {
    const hx = Math.sin(t.h), hz = Math.cos(t.h);
    return [[t.x + hz * 1.4 - hx * 0.4, t.z - hx * 1.4 - hz * 0.4], [t.x - hz * 1.4 - hx * 0.4, t.z + hx * 1.4 - hz * 0.4]];
  };
  const inc = AMB.inc, alive = AMB.medics.filter(d => !d.dead);
  if (AMB.state === 'go') {
    AMB.goT += dt;
    if (t.arrived && t.speed < 0.5 && !t.knock && !t.stalled) {
      AMB.state = 'walk';
      const sp = side();
      for (let i = 0; i < 2; i++) {
        const d = makeMedic();
        [d.x, d.z] = sp[i];
        d.ox = i ? 0.7 : -0.7; d.oz = i ? 0.4 : -0.4;
        scene.add(d.grp);
        AMB.medics.push(d);
      }
    } else if (AMB.goT > 75) { AMB.state = 'leave'; const n = farNode(t.x, t.z); svcRoute(t, n.x, n.z); }
  } else if (AMB.state === 'walk') {
    let done = true;
    for (const d of alive) if (!medicWalk(d, inc.x + d.ox, inc.z + d.oz, dt)) done = false;
    if (!alive.length) AMB.state = 'back';
    else if (done) { AMB.state = 'work'; AMB.workT = 4.5; }
  } else if (AMB.state === 'work') {
    AMB.workT -= dt;
    for (const d of alive) {
      // склонились: руки вниз-вперёд, голова опущена, чуть покачиваются
      const u = d.grp.userData;
      d.grp.rotation.y = damp(d.grp.rotation.y, Math.atan2(inc.x - d.x, inc.z - d.z), 6, dt);
      u.armL.rotation.x = -1.2 + Math.sin(tG * 6 + d.ox) * 0.3; u.armR.rotation.x = -1.2 - Math.sin(tG * 6 + d.ox) * 0.3;
      u.head.rotation.x = 0.5;
    }
    // отмывают: кровь и то, что осталось, пропадает вокруг места
    for (const dc of DECALS) if (Math.hypot(dc.m.position.x - inc.x, dc.m.position.z - inc.z) < 7) dc.life = Math.min(dc.life, 1 + Math.random() * AMB.workT);
    for (const g of GORE) if (Math.hypot(g.m.position.x - inc.x, g.m.position.z - inc.z) < 8) g.life = Math.min(g.life, 1 + Math.random() * AMB.workT);
    if (AMB.workT <= 0) {
      AMB.state = 'back';
      if (alive[0]) {
        // носилки: у первого в руках, мешок сверху
        const st = [];
        box(st, 0.62, 0.08, 1.9, '#ff7a1a', 0, 0.85, 1.05);
        box(st, 0.5, 0.24, 1.5, '#2b2a30', 0, 1.0, 1.05);
        const m = new THREE.Mesh(mergeGeos(st), HUMAN_VC);
        alive[0].grp.add(m); alive[0].stretch = m;
      }
      for (const d of alive) { d.grp.userData.head.rotation.x = 0; d.grp.userData.armL.rotation.x = -1.3; d.grp.userData.armR.rotation.x = -1.3; }
    }
  } else if (AMB.state === 'back') {
    const sp = side();
    let done = true;
    alive.forEach((d, i) => { if (!medicWalk(d, sp[i % 2][0], sp[i % 2][1], dt, 2)) done = false; });
    if (done) {
      for (const d of alive) dropMesh(d.grp);
      AMB.medics = [];
      // ещё вызов рядом — туда же, иначе домой
      const k = INCIDENTS.findIndex(i => Math.hypot(i.x - t.x, i.z - t.z) < 140);
      if (k >= 0) { AMB.inc = INCIDENTS.splice(k, 1)[0]; AMB.state = 'go'; AMB.goT = 0; svcRoute(t, AMB.inc.x, AMB.inc.z); }
      else { AMB.state = 'leave'; AMB.inc = null; const n = farNode(t.x, t.z); svcRoute(t, n.x, n.z); }
    }
  } else if (AMB.state === 'leave') {
    if (t.arrived || Math.hypot(t.x - V.x, t.z - V.z) > 300) ambReset();
  }

  // фельдшеры: стоят на земле, под колёсами — как все
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const d of AMB.medics) {
    if (d.dead) continue;
    d.grp.position.set(d.x, groundH(d.x, d.z) + curbAt(d.x, d.z), d.z);
    const dx = d.x - V.x, dz = d.z - V.z;
    if (vsp > 3 && Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
      d.dead = 1; dropMesh(d.grp);
      gibHuman(d, V.vx, V.vz);
      S.people++;
      Snd.squish();
      toast(pick([$t('минус фельдшер'), $t('минус фельдшер. вызов уже на него')]));
    }
  }
}

/* ─────────────── другие курьеры на смене ───────────────
   Ты на смене не один: из той же пиццерии возят ещё четверо, имена им
   раздаёт генератор людей при старте смены. Каждый по кругу берёт заказ,
   едет по улицам к гостю, пару секунд отдаёт коробку и возвращается.
   Стиль вождения у всех свой: первый гонит и людей не видит, второй
   лихачит в поворотах, третий едет аккуратно и пропускает всех, а
   четвёртая агрессивная: увидела тебя впереди — идёт на таран и бодает.
   Заработок копится, как у тебя, — сбоку висит рейтинг смены. Их можно
   таранить, взрывать и злить, как любые машины. */
const RIVAL_SPEC = [
  // обычный трафик едет 9–14 м/с, такси до 17: курьеры — заметно злее
  // и людей не пропускает никто: кто не отскочил — тот под колёсами
  { hex: '#2f8f5b', model: 'sedan', cruise: 29, corner: 0.85, acc: 9, gap: 0.2, peds: false, tip: 1.0, aggr: 1 },
  { hex: '#8e5bd8', model: 'hatch', cruise: 27, corner: 0.8, acc: 8.5, gap: 0.3, peds: false, tip: 1.0, aggr: 1 },
  { hex: '#3f7fd6', model: 'suv', cruise: 23, corner: 0.65, acc: 6.5, gap: 0.6, peds: false, tip: 1.25, aggr: 0.8 },
  { hex: '#d9537a', model: 'smart', cruise: 28, corner: 0.85, acc: 9, gap: 0.2, peds: false, tip: 1.1, ram: true, aggr: 1 },
];
const RIVALS = [];
/* имя той, что бодается (ram) — для реплик */
const ramName = () => { const R = RIVALS.find(q => q.spec.ram); return R ? R.name : ''; };

function nameTex (text, hex) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 26px "Press Start 2P", sans-serif';
  const w = Math.min(248, x.measureText(text).width + 28);
  x.fillStyle = hex; x.strokeStyle = '#33210c'; x.lineWidth = 6;
  x.beginPath(); x.roundRect(128 - w / 2, 8, w, 44, 12); x.fill(); x.stroke();
  x.fillStyle = '#fff3d6'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rivalCar (R) {
  const m = makeCar(R.spec.hex, true, R.spec.model);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.tagTex, transparent: true, depthWrite: false }));
  tag.scale.set(3.2, 0.8, 1); tag.position.set(0, 3.1, 0);
  // вплотную к камере табличка закрывала полэкрана — у камеры она тает
  const wp = new THREE.Vector3();
  tag.onBeforeRender = () => { tag.getWorldPosition(wp); tag.material.opacity = clamp((wp.distanceTo(cam.position) - 9) / 8, 0, 1); };
  m.add(tag);
  return m;
}

/* Где курьеры ждут заказ: колонной у тебя за спиной, по той же полосе,
   с шагом шесть с половиной метров. Раньше они вставали кругом у
   пиццерии — и ты на старте оказывался зажат со всех сторон. */
const RIVAL_REST = [];
function restSlots () {
  RIVAL_REST.length = 0;
  // есть парковка курьеров у пиццерии — все стоят там, каждый на своём месте
  if (COURIER_SLOTS) { for (let i = 0; i < RIVAL_SPEC.length; i++) RIVAL_REST.push(COURIER_SLOTS[i + 1] || COURIER_SLOTS[COURIER_SLOTS.length - 1]); return; }
  const hx = Math.sin(V.h), hz = Math.cos(V.h);
  let d = 8;
  for (let i = 0; i < RIVAL_SPEC.length; i++) {
    let x = V.x - hx * d, z = V.z - hz * d;
    for (let k = 0; k < 10; k++) {
      const r = nearestRoad(x, z, DRIVE_MAX, 1);
      if (!inHouse(x, z, 1.5) && r && r.d < r.seg.w / 2) break;
      d += 2; x = V.x - hx * d; z = V.z - hz * d;
    }
    RIVAL_REST.push({ x, z, h: V.h });
    d += 6.5;
  }
}

function rivalSpawn (R, delay) {
  const t = newSvc(rivalCar(R), 'rival', {
    cruise: R.spec.cruise, corner: R.spec.corner, acc: R.spec.acc, gap: R.spec.gap, peds: R.spec.peds, dot: R.spec.hex, hp: 120,
    aggr: R.spec.aggr || 0, passT: 0, honkT: 0,
  });
  t.rival = R;
  R.t = t; R.state = 'wait'; R.wait = delay; R.goal = null;
  const slot = RIVAL_REST[R.slot] || { x: PIZZA.x, z: PIZZA.z, h: 0 };
  t.x = slot.x; t.z = slot.z; t.h = slot.h; t.gy = undefined;
  poseOnSlope(t);
  t.path = null; t.arrived = 1; t.ramCd = rand(12, 20);
  scene.add(t.mesh);
  TRAFFIC.push(t);
  t.onWreck = () => {
    svcGone(t);
    R.t = null; R.back = Math.max(2, (R.outEnd || 0) - tG);   // сгорел — вычеркнут до конца минуты
  };
  t.onBoom = () => {
    if (R.out) return;
    R.out = 1; R.outEnd = tG + 60;
    if (Math.hypot(t.x - V.x, t.z - V.z) < 200) popBonus($t('{who} вычеркнут', { who: R.name }), $t('из смены на минуту — сгорел вместе с заказом'));
  };
}

function initRivals () {
  clearRivals();
  restSlots();
  RIVAL_SPEC.forEach((spec, i) => {
    const person = makePerson({ fem: !!spec.ram });        // бодается она — реплики в женском роде
    const R = { spec, person, name: person.first, money: 0, done: 0, t: null, tagTex: nameTex(person.first, spec.hex), back: 0, slot: i };
    RIVALS.push(R);
    rivalSpawn(R, 6 + i * 3.5);                       // первыми трогаются передние, пока ты грузишься
  });
}
function clearRivals () {
  for (const R of RIVALS) { if (R.t && !R.t.gone) svcGone(R.t); dropGuest(R); R.tagTex.dispose(); }
  RIVALS.length = 0;
}

/* Куда везёт: гость ждёт у бордюра на улице где-нибудь по району — в
   полутора-шестистах метрах от пиццерии и не ближе девяноста к тебе.
   Раньше соперники брали те же точки во дворах вокруг курьера и кружили
   рядом; теперь их видно на улицах по всему району. */
function rivalGoal () {
  for (let k = 0; k < 60; k++) {
    const sg = pick(RSEG);
    if (sg.c > 4 || sg.b || sg.x || sg.na === undefined || sg.nb === undefined) continue;
    const q = rand(0.2, 0.8), x = lerp(sg.x1, sg.x2, q), z = lerp(sg.z1, sg.z2, q);
    const dP = Math.hypot(x - PIZZA.x, z - PIZZA.z);
    if (dP < 140 || dP > 650 || Math.hypot(x - V.x, z - V.z) < 90 || !inBounds(x, z, 30) || x < riverX(z)) continue;
    return { x, z, w: sg.w };
  }
  return null;
}

/* гость соперника: стоит на тротуаре у точки, где тот встанет, лицом к дороге */
function rivalGuest (R, t) {
  const P = t.path;
  if (!P || P.length < 2) return null;
  const a = P[P.length - 2], b = P[P.length - 1], n = rightOf(a, b), w = R.goal.w;
  const o = w / 2 + 1.4 - Math.min(1.9, w / 4);
  const x = b[0] + n[0] * o, z = b[1] + n[1] * o;
  if (inHouse(x, z, 0.5)) return null;
  const grp = makeHuman(null);
  grp.rotation.y = Math.atan2(-n[0], -n[1]);
  grp.position.set(x, groundH(x, z) + curbAt(x, z), z);
  scene.add(grp);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { grp, x, z, got: 0, t: 0, dead: 0, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l, ph: 0 };
}
function dropGuest (R) { if (R.guest && !R.guest.dead) dropMesh(R.guest.grp); R.guest = null; }

function guestTick (R, dt) {
  const q = R.guest;
  if (!q) return;
  const u = q.grp.userData;
  if (q.got) {
    // получил и пошёл по тротуару вдоль улицы
    q.t += dt; q.ph += dt * 7;
    q.x += q.dx * 1.2 * dt; q.z += q.dz * 1.2 * dt;
    pushOut(q, 0.45);
    q.grp.rotation.y = damp(q.grp.rotation.y, Math.atan2(q.dx, q.dz), 6, dt);
    const sw = Math.sin(q.ph) * 0.8;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    if (q.t > 14) { dropGuest(R); return; }
  } else if (R.t && Math.hypot(R.t.x - q.x, R.t.z - q.z) < 60) {
    // машу рукой своему курьеру
    u.armR.rotation.x = -2.6 + Math.sin(tG * 8) * 0.4;
  }
  q.grp.position.set(q.x, groundH(q.x, q.z) + curbAt(q.x, q.z), q.z);
  q.grp.visible = Math.hypot(q.x - V.x, q.z - V.z) < 170;
  // под твои колёса — как все
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = q.x - V.x, dz = q.z - V.z;
  if (Math.hypot(V.vx, V.vz) > 3 && Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
    q.dead = 1; dropMesh(q.grp);
    gibHuman(q, V.vx, V.vz);
    S.people++;
    Snd.squish();
    toast($t('минус клиент {who}', { who: R.person ? R.person.firstGen : R.name }));
    R.guest = null;
    R.lost = 1;
  }
}

function updateRivals (dt) {
  for (const R of RIVALS) {
    guestTick(R, dt);
    if (!R.t) {
      if ((R.back -= dt) <= 0) { R.out = 0; rivalSpawn(R, 2); toast($t('{who} снова на смене', { who: R.name })); }
      continue;
    }
    const t = R.t;
    if (t.wreck || t.knock || t.stalled) continue;
    if (R.state === 'wait') {
      t.speed = 0; t.path = null;
      // вернулся с заказа — заезжает на своё место на парковке
      const sl = COURIER_SLOTS && RIVAL_REST[R.slot];
      if (sl) {
        const dx = sl.x - t.x, dz = sl.z - t.z, d = Math.hypot(dx, dz);
        if (d > 0.3) { const k = Math.min(1, 4 * dt / d); t.x += dx * k; t.z += dz * k; t.h += Math.atan2(Math.sin(sl.h - t.h), Math.cos(sl.h - t.h)) * Math.min(1, 3 * dt); poseOnSlope(t); }
      }
      if (calmStart()) { R.wait = Math.max(R.wait, 1); continue; }    // первый заказ — стоят на парковке и ждут
      if ((R.wait -= dt) <= 0) {
        R.goal = rivalGoal();
        if (!R.goal) { R.wait = 3; continue; }
        R.state = 'go'; R.fee = Math.round((120 + Math.hypot(R.goal.x - PIZZA.x, R.goal.z - PIZZA.z) * 1.7) * 0.9);
        svcRoute(t, R.goal.x, R.goal.z);
        dropGuest(R); R.lost = 0;
        R.guest = rivalGuest(R, t);
      }
    } else if (R.state === 'go') {
      if (t.arrived && t.speed < 0.6) {
        R.state = 'give'; R.wait = 2.5;
        const q = R.guest;
        if (q) flyBox({ x: t.x, y: groundH(t.x, t.z) + 1.3, z: t.z }, { x: q.x, y: groundH(q.x, q.z) + 1.15, z: q.z }, 0.6, () => {
          if (q.dead) return;
          const bx = pizzaBox(); bx.scale.setScalar(0.75); bx.position.set(0, 1.12, 0.32);
          q.grp.add(bx); q.got = 1;
          q.grp.userData.armL.rotation.x = q.grp.userData.armR.rotation.x = -1.2;
          if (Math.hypot(q.x - V.x, q.z - V.z) < 120) emote(q.x, 2.1, q.z, 'heart', 3);
        });
      }
    } else if (R.state === 'give') {
      // отдаёт коробку: стоит с аварийкой
      const hz = t.mesh.userData.hazard, on = Math.floor(tG * 2.5) % 2 === 0;
      if (hz) for (const m of hz) m.visible = on;
      if ((R.wait -= dt) <= 0) {
        if (hz) for (const m of hz) m.visible = false;
        if (!R.lost) { R.money += Math.round(R.fee * R.spec.tip); R.done++; }
        R.state = 'home';
        const slot = RIVAL_REST[R.slot];
        svcRoute(t, slot ? slot.x : PIZZA.x, slot ? slot.z : PIZZA.z);
      }
    } else if (R.state === 'home') {
      if (t.arrived && t.speed < 0.6) { R.state = 'wait'; R.wait = rand(1.5, 3.5); }
    }
    // четвёртая бодается: ты впереди, близко и почти по курсу — таран
    if (R.spec.ram && (R.state === 'go' || R.state === 'home') && !S.ride) {
      t.ramCd -= dt;
      const dx = V.x - t.x, dz = V.z - t.z, dV = Math.hypot(dx, dz);
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - t.h), Math.cos(Math.atan2(dx, dz) - t.h)));
      if (t.ramCd <= 0 && !t.ramT && dV > 6 && dV < 28 && off < 0.8 && ['drive', 'back', 'side'].includes(S.state) && chance(dt * 1.5)) {
        t.ramT = 2.6; t.ramCd = rand(14, 24);
        toast(pick([$t('{name} идёт на таран!', { name: R.name }), $t('{name}: «с дороги!»', { name: R.name }), $t('{name} бодается', { name: R.name })]));
        Snd.blip(330, 0.25, 'sawtooth', 0.1);
      }
    }
    // злой курьер расталкивает машины, которые не успели уйти с дороги
    if (t.aggr && t.speed > 7 && !t.knock) {
      const hx = Math.sin(t.h), hz = Math.cos(t.h);
      for (const o of TRAFFIC) {
        if (o === t || o.svc || o.knock || o.wreck || o.hitT > 0) continue;
        const dx = o.x - t.x, dz = o.z - t.z;
        if (Math.abs(dx) > 7 || Math.abs(dz) > 7) continue;
        const fw = dx * hx + dz * hz, side = -hz * dx + hx * dz;
        if (fw < 0 || fw > (t.hl || 2) + (o.hl || 2) + 0.3 || Math.abs(side) > 1.8) continue;
        const push = t.speed * 0.55, sg = side >= 0 ? 1 : -1;
        fullCar(o);
        dentCar(o.mesh, t.x + hx * 2, t.z + hz * 2, push);
        knockCar(o, hx * 0.6 - hz * sg * 0.8, hz * 0.6 + hx * sg * 0.8, push);
        o.hitT = 1.2; o.hp -= push * 1.5;
        sparks(t.x + hx * 2, 0.8, t.z + hz * 2, 6, hx, hz);
        t.speed *= 0.75;
        if (Math.hypot(t.x - V.x, t.z - V.z) < 90) {
          Snd.crash(push);
          toast(pick([o.taxi ? $t('{who} снёс такси', { who: R.name }) : $t('{who} снёс машину', { who: R.name }), $t('{who} расталкивает поток', { who: R.name }), $t('{who}: «дорогу курьеру!»', { who: R.name })]));
        }
        if (o.hp <= 0) wreckCar(o);
        break;
      }
    }
    // лихач людей не видит — и сбивает: считается на нём, не на тебе
    if (!t.peds && t.speed > 6) {
      const hx = Math.sin(t.h), hz = Math.cos(t.h);
      const under = q => { const dx = q.x - t.x, dz = q.z - t.z; return Math.abs(dx * hx + dz * hz) < (t.hl || 2) + 0.4 && Math.abs(dx * hz - dz * hx) < 1.2; };
      for (const p of PEOPLE) {
        if (p.dead || p.guest || !under(p)) continue;
        p.dead = 1; p.deadT = rand(18, 26); p.fly = null; p.grp.visible = false;
        gibHuman(p, hx * t.speed, hz * t.speed);
        if (Math.hypot(t.x - V.x, t.z - V.z) < 160) toast($t('{who} сбил {whom}', { who: R.name, whom: p.person ? accName(p.person) : $t('прохожего') }));
      }
      for (const p of SCOOTS) {
        if (p.dead || !under(p)) continue;
        runOverScoot(p, hx * t.speed, hz * t.speed, R.name);
      }
      for (const p of PEDS) {
        if (p.dead || !under(p)) continue;
        p.dead = 1; p.deadT = rand(6, 14); p.grp.visible = false;
        gibBurger(p.x, p.z);
      }
    }
  }
}

/* рейтинг смены сбоку: ты и четверо, по заработку */
const elRivals = $('rivals');
let rivalsT = 0, lastPlace = 0;
function rivalBoard () {
  const rows = RIVALS.map(R => ({ n: R.name, m: R.money, hex: R.spec.hex, out: R.out ? Math.max(1, Math.ceil(R.outEnd - tG)) : 0 }));
  rows.push({ n: $t('ты'), m: S.money, me: true });
  rows.sort((a, b) => b.m - a.m || (a.me ? -1 : 1));
  return rows;
}
function rivalsStep (dt) {
  if (!elRivals) return;
  const on = RIVALS.length && ['drive', 'back', 'handover', 'side', 'brief', 'loading'].includes(S.state);
  elRivals.hidden = !on;
  if (!on || (rivalsT -= dt) > 0) return;
  rivalsT = 0.5;
  const rows = rivalBoard(), place = rows.findIndex(r => r.me) + 1;
  elRivals.innerHTML = rows.map((r, i) => '<li' + (r.me ? ' class="me"' : r.out ? ' class="out"' : '') + '><em>' + (i + 1) + '</em>' +
    (r.hex ? '<i style="background:' + r.hex + '"></i>' : '<i class="you"></i>') + '<b>' + (r.out ? '<s>' + r.n + '</s> <small>' + $t('{n} с', { n: r.out }) + '</small>' : r.n) + '</b><span>' + money(r.m) + '</span></li>').join('');
  if (lastPlace && place < lastPlace) { const R = RIVALS.find(q => q.name === rows[place].n); toast($t('ты обогнал {who}!', { who: R && R.person ? R.person.firstAcc : rows[place].n })); }
  lastPlace = place;
}

/* ─────────────── аварии на дорогах ───────────────
   Время от времени где-то впереди на улице случается авария: две машины
   встали друг другу в бампер, косо, на аварийках, капоты подняты, из-под
   одного дымит. Водители вышли и дерутся: машут кулаками, орут. Поток
   встаёт за ними и через несколько секунд протискивается, курьеры-
   соперники объезжают. Машины можно протаранить и взорвать, драчунов —
   задавить. Через полторы минуты (или если уехал далеко) всё
   рассасывается. */
const ACCIDENTS = [];
const FIGHT_LINES = [$t('ты чё?!'), $t('сам ты!'), $t('куда смотрел?!'), $t('страховка есть?'), $t('я тебя запомнил'), $t('ну всё!'), $t('выходи!'), $t('в глаза смотри!'), $t('гаишников жду')];
let accCd = 40;

function raiseHood (mesh, a) {
  const h = mesh.userData.hood;
  if (!h) return;
  h.m.rotation.x = -a;
  h.m.position.y = h.y + Math.sin(a) * h.len / 2;
  h.m.position.z = h.z - h.len / 2 + Math.cos(a) * h.len / 2;
}

function spawnAccident () {
  for (let k = 0; k < 40; k++) {
    // кусок улицы — из клеток вокруг курьера: в большом городе случайный кусок почти всегда за километр
    const cell = ROAD_GRID.get(Math.floor((V.x + rand(-260, 260)) / RCELL) + ',' + Math.floor((V.z + rand(-260, 260)) / RCELL));
    const sg = cell ? RSEG[pick(cell)] : pick(RSEG);
    if (sg.c > 3 || sg.b || sg.x) continue;
    const q = rand(0.25, 0.75), rx = lerp(sg.x1, sg.x2, q), rz = lerp(sg.z1, sg.z2, q);
    const dV = Math.hypot(rx - V.x, rz - V.z);
    if (dV < 110 || dV > 260 || !inBounds(rx, rz, 40)) continue;
    if (ACCIDENTS.some(a => Math.hypot(a.x - rx, a.z - rz) < 120)) continue;
    if (PIZZA && Math.hypot(rx - PIZZA.x, rz - PIZZA.z) < 60) continue;
    const len = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) || 1, ux = (sg.x2 - sg.x1) / len, uz = (sg.z2 - sg.z1) / len;
    const side = chance(0.5) ? 1 : -1, nx = -uz * side, nz = ux * side;
    const off = Math.max(1.6, sg.w / 4);                       // своя полоса у правого края
    const dir = side > 0 ? Math.atan2(ux, uz) : Math.atan2(-ux, -uz);
    const cars = [];
    for (let i = 0; i < 2; i++) {
      const t = newCar(false);
      t.taxi = false; t.parked = true; t.accident = 1;
      if (t.mesh.userData.lite) { const lm = t.mesh; t.mesh = makeCar(lm.userData.bodyHex, false, lm.userData.model); lm.children.forEach(c => { if (c.geometry) c.geometry.dispose(); }); t.hl = t.mesh.userData.hl; }
      const back = i ? -5.2 : 0;
      t.x = rx + nx * off + Math.sin(dir) * back + rand(-0.3, 0.3);
      t.z = rz + nz * off + Math.cos(dir) * back + rand(-0.3, 0.3);
      t.h = dir + (i ? rand(-0.35, -0.15) : rand(0.2, 0.45));
      t.gy = undefined;
      scene.add(t.mesh);
      poseOnSlope(t);
      // мятины: у переднего — зад, у заднего — перед
      const hx = Math.sin(t.h), hz = Math.cos(t.h), sgn = i ? 1 : -1;
      dentCar(t.mesh, t.x + hx * 2 * sgn, t.z + hz * 2 * sgn, 22);
      dentCar(t.mesh, t.x + hx * 2 * sgn, t.z + hz * 2 * sgn, 18);
      raiseHood(t.mesh, i ? 1.05 : 0.8);
      t.hp = 70;
      TRAFFIC.push(t);
      cars.push(t);
    }
    // водители: друг напротив друга у тротуара, между машинами
    const fx = rx + nx * (off + 2.4) - Math.sin(dir) * 2.6, fz = rz + nz * (off + 2.4) - Math.cos(dir) * 2.6;
    const fighters = [];
    for (let i = 0; i < 2; i++) {
      const s2 = i ? 1 : -1, x = fx + Math.sin(dir) * 0.75 * s2, z = fz + Math.cos(dir) * 0.75 * s2;
      const grp = makeHuman(chance(0.3) ? nextPerson() : null);
      grp.rotation.y = Math.atan2(fx - x, fz - z);
      grp.position.set(x, groundH(x, z) + curbAt(x, z), z);
      scene.add(grp);
      fighters.push({ grp, x, z, ph: rand(0, 6), dead: 0, shock: 0, bubble: sayBubble(grp, pick(FIGHT_LINES), '#d9342c', 2.6), sayT: rand(0.5, 1.5) });
    }
    ACCIDENTS.push({ x: rx, z: rz, cars, fighters, t: 90, warned: 0, smokeT: 0 });
    return true;
  }
  return false;
}

function clearAccident (a) {
  for (const t of a.cars) if (!t.gone && TRAFFIC.includes(t)) svcGone(t);
  for (const f of a.fighters) if (!f.dead) dropMesh(f.grp);
}

function updateAccidents (dt) {
  const live = ['drive', 'back', 'handover', 'side'].includes(S.state) || S.ride && S.state === 'drive';
  if (live && !calmStart() && ACCIDENTS.length < 2 && (accCd -= dt) <= 0) { accCd = rand(50, 100); if (chance(0.7)) spawnAccident(); }
  const blink = Math.floor(tG * 2.5) % 2 === 0;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (let i = ACCIDENTS.length - 1; i >= 0; i--) {
    const a = ACCIDENTS[i], dV = Math.hypot(a.x - V.x, a.z - V.z);
    a.t -= dt;
    if ((a.t <= 0 && dV > 90) || dV > 380 || S.state === 'title' || S.state === 'over') { clearAccident(a); ACCIDENTS.splice(i, 1); continue; }
    if (!a.warned && dV < 70) { a.warned = 1; toast(pick([$t('авария впереди — водители дерутся'), $t('ДТП: выясняют, кто прав'), $t('авария: объезжай')])); }
    // аварийки мигают, из-под капота дымок
    for (const t of a.cars) {
      if (t.wreck || t.gone) continue;
      const hz = t.mesh.userData.hazard;
      if (hz) for (const m of hz) m.visible = blink;
    }
    if ((a.smokeT -= dt) <= 0 && dV < 150) {
      a.smokeT = 0.5;
      const t = a.cars[1];
      if (t && !t.wreck && !t.gone) puff(t.x + Math.sin(t.h) * 1.9, 1.2, t.z + Math.cos(t.h) * 1.9, false, 0.5);
    }
    // драка: кулаки по очереди, подскоки, ругань облачками
    for (const f of a.fighters) {
      if (f.dead) continue;
      const u = f.grp.userData;
      f.grp.visible = dV < 130;
      if (f.shock > 0) { f.shock -= dt; handsUp(u, dt); continue; }
      f.ph += dt * 9;
      u.armR.rotation.x = -1.4 - Math.max(0, Math.sin(f.ph)) * 0.9;
      u.armL.rotation.x = -1.4 - Math.max(0, Math.sin(f.ph + Math.PI)) * 0.9;
      u.legL.rotation.x = Math.sin(f.ph * 0.5) * 0.3; u.legR.rotation.x = -Math.sin(f.ph * 0.5) * 0.3;
      f.grp.position.y = groundH(f.x, f.z) + curbAt(f.x, f.z) + Math.abs(Math.sin(f.ph * 0.5)) * 0.08;
      f.grp.rotation.z = Math.sin(f.ph * 0.5) * 0.08;
      if ((f.sayT -= dt) <= 0) { f.sayT = rand(1.2, 2.2); setSay(f.bubble, pick(FIGHT_LINES), '#d9342c'); if (dV < 60 && chance(0.5)) Snd.blip(110, 0.08, 'square', 0.06); }
      f.bubble.position.x = Math.sin(tG * 30) * 0.04;
      if (vsp > 3) {
        const dx = f.x - V.x, dz = f.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
          f.dead = 1; dropMesh(f.grp);
          gibHuman(f, V.vx, V.vz);
          S.people++;
          Snd.squish();
          toast(pick([$t('минус драчун'), $t('драка окончена'), $t('минус водитель — спор решён')]));
        }
      }
    }
  }
}

/* ─────────────── похититель пиццы ───────────────
   Время от времени на районе появляется тип в чёрном с чужой коробкой
   пиццы: бежит по тротуару и орёт кусками — «ААА!», «УКРАЛ ПИЦЦУ!»,
   «ХАХАХАХ», «МОЯ! МОЯ!», «НЯМ-НЯМ», «БУДУ КУШАТЬ», «ПИЦЦА!», а следом
   бежит хозяин пиццы: «отдай…», «мою пиццу…». Увидев курьера ближе
   двадцати метров, вор удирает, на радаре — красная точка. Сбил —
   респект и триста рублей, хозяин рад; не поймал за полторы минуты —
   скрылся, хозяин грустит. */
const THIEF = { p: null, c: null, cd: 45 };
const THIEF_LINES = [$t('ААА!'), $t('УКРАЛ ПИЦЦУ!'), $t('ХАХАХАХ'), $t('МОЯ!'), $t('МОЯ!'), $t('НЯМ-НЯМ'), $t('БУДУ КУШАТЬ'), $t('ПИЦЦА!')];
const OWNER_LINES = [$t('отдай…'), $t('мою пиццу…'), $t('отдай мою пиццу…')];
const LINE_TEX = new Map();                          // реплик мало — текстуры один раз
const lineTex = (text, col) => {
  const k = col + text;
  if (!LINE_TEX.has(k)) LINE_TEX.set(k, rageTex(text, col));
  return LINE_TEX.get(k);
};
function sayBubble (grp, text, col, y = 2.7) {
  const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: lineTex(text, col), transparent: true, depthWrite: false }));
  b.scale.set(2.8, 1.4, 1); b.position.set(0, y, 0);
  grp.add(b);
  return b;
}
function setSay (b, text, col) { b.material.map = lineTex(text, col); b.material.needsUpdate = true; }
function spawnThief () {
  const grp = makeHuman(null, { shirt: '#1b1a1f', pants: '#1b1a1f', cap: '#1b1a1f', fat: false, fem: false, face: false });   // в маске — без лица
  const u = grp.userData;
  for (const m of [].concat(u.head.material)) if (!m.map) m.color.set('#2b2a30');
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0xfff3d6 }));
  eyes.position.set(0, 0.06, 0.16);
  u.head.add(eyes);
  const b = pizzaBox();
  b.scale.setScalar(0.75); b.position.set(0, 1.12, 0.36);
  grp.add(b);
  u.armL.rotation.x = u.armR.rotation.x = -1.25;
  const bubble = sayBubble(grp, THIEF_LINES[0], '#d9342c');
  const p = { grp, speed: 3.2, ph: 0, crossT: 1e9, x: 0, z: 0, dead: 0, t: 90, bubble, line: 0, sayT: 1.1 };
  walkSpawn(p, 60, 150);
  scene.add(grp);
  THIEF.p = p;
  // хозяин пиццы — в паре метров позади, тянет руки
  if (THIEF.c) dropOwner();
  const person = nextPerson();
  const og = makeHuman(person, { fat: false });
  og.userData.armL.rotation.x = og.userData.armR.rotation.x = -1.5;
  const c = { grp: og, person, x: p.x - 3, z: p.z, ph: 0, dead: 0, bubble: sayBubble(og, OWNER_LINES[0], '#4f7fd6'), line: 0, sayT: 1.5, leaveT: 0 };
  scene.add(og);
  THIEF.c = c;
  toast($t('на районе похититель пиццы — сбей, будет респект'));
}
function dropOwner () { const c = THIEF.c; if (!c) return; if (!c.dead) dropMesh(c.grp); THIEF.c = null; }
function dropThief (msg, caught) {
  const p = THIEF.p;
  if (!p) return;
  if (!p.dead) dropMesh(p.grp);
  THIEF.p = null; THIEF.cd = rand(60, 110);
  if (msg) toast(msg);
  // хозяин: поймали — радуется, нет — грустит; потом уходит
  const c = THIEF.c;
  if (c && !c.dead) {
    setSay(c.bubble, caught ? $t('спасибо!!!') : $t('эх…'), caught ? '#3f8f4d' : '#4f7fd6');
    c.leaveT = caught ? 4 : 3;
    c.grp.userData.armL.rotation.x = c.grp.userData.armR.rotation.x = caught ? -2.8 : 0;
    if (caught) emote(c.x, 2.3, c.z, 'heart', 5);
  } else THIEF.c = null;
}
/* хозяин пиццы бежит за вором, пока тот не пойман или не скрылся */
function ownerStep (dt) {
  const c = THIEF.c;
  if (!c || c.dead) return;
  const u = c.grp.userData, p = THIEF.p;
  if (c.leaveT > 0) {
    if ((c.leaveT -= dt) <= 0) { dropOwner(); return; }
    u.legL.rotation.x = u.legR.rotation.x = 0;
  } else if (p) {
    // держится в трёх метрах позади вора
    const hx = Math.sin(p.grp.rotation.y), hz = Math.cos(p.grp.rotation.y);
    const tx = p.x - hx * 3, tz = p.z - hz * 3, dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    const sp = Math.min(d * 2.2, 5.6);
    if (d > 0.2) { c.x += dx / d * sp * dt; c.z += dz / d * sp * dt; c.grp.rotation.y = damp(c.grp.rotation.y, Math.atan2(p.x - c.x, p.z - c.z), 8, dt); }
    if (d > 12) { c.x = tx; c.z = tz; }                   // отстал за углом — догоняет
    c.ph += dt * sp * 3;
    const sw = Math.sin(c.ph) * 0.9;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = -1.5 + Math.sin(c.ph) * 0.2; u.armR.rotation.x = -1.5 - Math.sin(c.ph) * 0.2;
    if ((c.sayT -= dt) <= 0) { c.sayT = 1.5; c.line = (c.line + 1) % OWNER_LINES.length; setSay(c.bubble, OWNER_LINES[c.line], '#4f7fd6'); }
  }
  pushOut(c, 0.45);
  c.grp.position.set(c.x, groundH(c.x, c.z) + curbAt(c.x, c.z) + Math.abs(Math.sin(c.ph)) * 0.06, c.z);
  c.bubble.position.y = 2.7 + Math.sin(tG * 4 + 1) * 0.08;
  // хозяина тоже можно задавить — но это уже совсем свинство
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = c.x - V.x, dz = c.z - V.z;
  if (Math.hypot(V.vx, V.vz) > 3 && Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
    c.dead = 1; dropMesh(c.grp);
    gibHuman(c, V.vx, V.vz);
    S.people++;
    Snd.squish();
    toast($t('минус {what}. и пиццы тоже', { what: c.person ? c.person.name : $t('хозяин пиццы') }));
    THIEF.c = null;
  }
}
function updateThief (dt) {
  const live = ['drive', 'back', 'handover', 'side'].includes(S.state);
  ownerStep(dt);
  if (!THIEF.p) { if (live && !calmStart() && (THIEF.cd -= dt) <= 0) spawnThief(); return; }
  const p = THIEF.p, u = p.grp.userData;
  if (!live && S.state !== 'brief' && S.state !== 'loading') { dropThief(); dropOwner(); return; }
  if ((p.sayT -= dt) <= 0) { p.sayT = 1.1; p.line = (p.line + 1) % THIEF_LINES.length; setSay(p.bubble, THIEF_LINES[p.line], '#d9342c'); }
  const dV = Math.hypot(p.x - V.x, p.z - V.z);
  if ((p.t -= dt) <= 0 || dV > 330) { dropThief(dV < 200 ? $t('похититель скрылся во дворах') : ''); return; }
  let ang;
  if (dV < 20) {
    // удирает от машины, пока не отстанет
    const dx = p.x - V.x, dz = p.z - V.z;
    p.x += dx / dV * 5.2 * dt; p.z += dz / dV * 5.2 * dt;
    p.ph += dt * 15; ang = Math.atan2(dx, dz); p.fled = 1;
  } else {
    if (p.fled) { p.fled = 0; walkBack(p); }
    ang = walkerStep(p, dt, 11);
  }
  pushOut(p, 0.45);
  p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.08, p.z);
  if (!Number.isNaN(ang)) p.grp.rotation.y = damp(p.grp.rotation.y, ang, 10, dt);
  const sw = Math.sin(p.ph) * 1;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  p.bubble.position.y = 2.7 + Math.sin(tG * 5) * 0.08;
  // сбить — как всех, только это хорошо
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = p.x - V.x, dz = p.z - V.z;
  if (Math.hypot(V.vx, V.vz) > 3 && Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
    p.dead = 1;
    dropMesh(p.grp);
    gibHuman(p, V.vx, V.vz);
    S.burgers++;
    S.money += 300;
    if (!S.freeRun) addWallet(300);
    Snd.squish();
    popBonus($t('респект!'), $t('похититель пиццы наказан · +300 ₽'));
    dropThief('', true);
  }
}

/* ─────────────── маркер адреса ─────────────── */
const marker = new THREE.Group();
{
  const pin = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 4),
    new THREE.MeshBasicMaterial({ color: 0xf0522a }));
  pin.rotation.x = Math.PI; pin.position.y = 4.4;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8a2b }));
  ball.position.y = 6.6;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 16, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 8;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 20),
    new THREE.MeshBasicMaterial({ color: 0xf0522a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
  marker.add(pin, ball, beam, ring);
  marker.userData = { pin, ball, ring };
  scene.add(marker);
}

/* ─────────────── кофе Drinkit и бонусы во дворах ───────────────
   Нитро здесь — кофе: синий стаканчик Drinkit крутится над кольцом на
   асфальте. Проехал сквозь — полбака. Стаканчики лежат на улицах с
   самого начала, возвращаются на то же место через двадцать пять
   секунд, а каждые несколько секунд у дороги рядом с курьером
   появляется ещё один — нитро всегда где-то впереди.

   Во дворах, на проездах и дорожках, лежат три бонуса:
   щит — десять секунд неуязвимости, аптечка — плюс сердце,
   бык — бист-мод: пятнадцать секунд Shift не жжёт нитро, а просто
   разгоняет вдвое быстрее. Далёкие не рисуем — их всё равно съест туман. */
const NITRO_CANS = [];                             // все подбираемые: кофе и бонусы
const NOS_RESPAWN = 25, BONUS_RESPAWN = 45;
const PICK_HEX = { nos: '#6fd3ff', shield: '#8f9bff', heal: '#ff4d6d', beast: '#ff8a1c' };

const PICK_MAT = (() => {
  const m = hex => new THREE.MeshBasicMaterial({ color: hex });
  const ring = hex => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  return {
    cup: m(0x1f5bff), sleeve: m(0x0c2f9e), lid: m(0xf4f6fb), logo: m(0xffffff),
    shield: new THREE.MeshBasicMaterial({ color: 0x8f9bff, transparent: true, opacity: 0.55, depthWrite: false }),
    star: m(0xe8ecff), heal: m(0xff4d6d), white: m(0xffffff), beast: m(0xff8a1c), horn: m(0xf3e3c2), dark: m(0x2a1d1a),
    ring: Object.fromEntries(Object.entries(PICK_HEX).map(([k, v]) => [k, ring(v)])),
  };
})();
const ringGeo = new THREE.RingGeometry(1.6, 2.1, 18);

function pickupModel (kind) {
  const body = new THREE.Group(), M = PICK_MAT;
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); body.add(me); return me; };
  if (kind === 'nos') {
    // стаканчик: синий, с рукавом потемнее, белой крышкой и буквой D на рукаве
    add(new THREE.CylinderGeometry(0.44, 0.32, 1.15, 12), M.cup);
    add(new THREE.CylinderGeometry(0.43, 0.39, 0.42, 12), M.sleeve, 0, -0.02, 0);
    add(new THREE.CylinderGeometry(0.49, 0.47, 0.14, 12), M.lid, 0, 0.64, 0);
    add(new THREE.CylinderGeometry(0.34, 0.46, 0.14, 12), M.lid, 0, 0.76, 0);
    add(new THREE.BoxGeometry(0.2, 0.24, 0.06), M.logo, 0, -0.02, 0.41);
    body.rotation.z = 0.25;
  } else if (kind === 'shield') {
    add(new THREE.IcosahedronGeometry(0.85, 1), M.shield);
    add(new THREE.OctahedronGeometry(0.42, 0), M.star);
  } else if (kind === 'heal') {
    add(new THREE.BoxGeometry(1.2, 1.2, 0.3), M.white);
    add(new THREE.BoxGeometry(0.9, 0.3, 0.34), M.heal);
    add(new THREE.BoxGeometry(0.3, 0.9, 0.34), M.heal);
  } else {
    // бык: морда и рога — бист-мод
    add(new THREE.BoxGeometry(0.9, 0.8, 0.8), M.beast);
    add(new THREE.BoxGeometry(0.5, 0.3, 0.2), M.dark, 0, -0.2, 0.42);
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.14, 0.7, 6), M.horn, s * 0.6, 0.45, 0).rotation.z = -s * 0.9;
  }
  return body;
}

function addPickup (kind, x, z, fixed) {
  const g = new THREE.Group(), body = pickupModel(kind);
  const ring = new THREE.Mesh(ringGeo, PICK_MAT.ring[kind]);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25;
  g.add(body, ring);
  const y = surfaceAt(x, z);
  g.position.set(x, y, z);
  scene.add(g);
  const n = { kind, x, z, y, g, body, ring, t: 0, ph: rand(0, 6), fixed };
  NITRO_CANS.push(n);
  return n;
}

/* где положить кофе: середина улицы, подальше от других и от пиццерии */
function coffeeSpot (near, rmin, rmax) {
  const B = BOUNDS;
  for (let k = 0; k < 60; k++) {
    const q = pick(COFFEE_SEGS), t = rand(0.25, 0.75);
    const x = lerp(q.x1, q.x2, t), z = lerp(q.z1, q.z2, t);
    if (x < B.x0 + 30 || x > B.x1 - 30 || z < B.z0 + 30 || z > B.z1 - 30) continue;
    if (near) { const d = Math.hypot(x - near.x, z - near.z); if (d < rmin || d > rmax) continue; }
    if (NITRO_CANS.some(n => n.kind === 'nos' && n.t <= 0 && Math.hypot(n.x - x, n.z - z) < 45)) continue;
    if (PIZZA && Math.hypot(PIZZA.x - x, PIZZA.z - z) < 25) continue;
    return [x, z];
  }
  return null;
}
let COFFEE_SEGS = [];

function buildNitro () {
  COFFEE_SEGS = RSEG.filter(q => q.c <= 4 && !q.b && !q.x && Math.hypot(q.x2 - q.x1, q.z2 - q.z1) > 25);
  for (let k = 0; k < 50; k++) { const p = coffeeSpot(null); if (p) addPickup('nos', p[0], p[1], true); }
  // бонусы — во дворах: на проездах и дворовых дорожках, по кругу три вида
  const yard = [];
  for (const q of RSEG) if (q.c === 7 && !q.x && Math.hypot(q.x2 - q.x1, q.z2 - q.z1) > 12) yard.push([(q.x1 + q.x2) / 2, (q.z1 + q.z2) / 2]);
  for (const q of YARD_PATHS) { const m = q[(q.length / 2) | 0]; yard.push([m[0], m[1]]); }
  const kinds = ['shield', 'heal', 'beast'];
  let n = 0;
  for (let k = 0; k < 600 && n < 21; k++) {
    const [x, z] = pick(yard);
    if (!inBounds(x, z, 25) || inHouse(x, z, 1.5)) continue;
    if (NITRO_CANS.some(o => o.kind !== 'nos' && Math.hypot(o.x - x, o.z - z) < 70)) continue;
    addPickup(kinds[n % 3], x, z, true);
    n++;
  }
}

const FXS = { shieldT: 0, beastT: 0, spawnT: 4, aura: null };

function takePickup (n) {
  n.g.visible = false;
  if (!n.fixed) { scene.remove(n.g); NITRO_CANS.splice(NITRO_CANS.indexOf(n), 1); }
  else n.t = n.kind === 'nos' ? NOS_RESPAWN : BONUS_RESPAWN;
  if (n.kind === 'nos') {
    NOS.tank = Math.min(1, NOS.tank + NOS_CAN);
    Snd.nosPick();
    toast(NOS.tank >= 1 ? $t('кофе «Синего кита»: полный бак · {key}', { key: nitroKey() }) : $t('кофе «Синего кита» + · {key}', { key: nitroKey() }));
  } else if (n.kind === 'shield') {
    FXS.shieldT = 10;
    Snd.nosPick();
    toast($t('щит: десять секунд машину не бьёт'));
  } else if (n.kind === 'heal') {
    S.hp = Math.min(S.hpMax, S.hp + 1);
    hudHearts();
    Snd.coin();
    toast(S.hp >= S.hpMax ? $t('аптечка: машина как новая') : $t('аптечка: +1 сердце'));
  } else {
    FXS.beastT = 15;
    Snd.nosFire();
    toast($t('бист-мод: {key} — вдвое быстрее, пятнадцать секунд', { key: nitroKey() }));
  }
}

function updateNitro (dt) {
  const live = S.state === 'drive' || S.state === 'back' || S.state === 'handover' || S.state === 'side';
  // время от времени — свежий стаканчик у дороги впереди
  if (live && (FXS.spawnT -= dt) <= 0) {
    FXS.spawnT = rand(5, 9);
    if (NITRO_CANS.filter(n => !n.fixed).length < 18) {
      const p = coffeeSpot(V, 50, 200);
      if (p) addPickup('nos', p[0], p[1], false);
    }
  }
  for (let i = NITRO_CANS.length - 1; i >= 0; i--) {
    const n = NITRO_CANS[i];
    if (n.t > 0) n.t -= dt;
    // временный стаканчик, от которого уехали, исчезает
    if (!n.fixed && Math.hypot(n.x - V.x, n.z - V.z) > 420) { scene.remove(n.g); NITRO_CANS.splice(i, 1); continue; }
    const near = Math.abs(n.x - V.x) < 460 && Math.abs(n.z - V.z) < 460;
    n.g.visible = n.t <= 0 && near;
    if (!n.g.visible) continue;
    n.ph += dt;
    n.body.rotation.y += dt * 2.2;
    n.body.position.y = 1.6 + Math.sin(n.ph * 2.4) * 0.25;
    const p = 1 + Math.sin(n.ph * 3.2) * 0.12;
    n.ring.scale.set(p, p, p);
    if (!live || Math.hypot(n.x - V.x, n.z - V.z) > 3.4 || Math.abs(n.y - V.y) > 3) continue;
    takePickup(n);
  }
  // щит светится вокруг машины
  FXS.shieldT = Math.max(0, FXS.shieldT - dt);
  FXS.beastT = Math.max(0, FXS.beastT - dt);
  if (!FXS.aura) {
    FXS.aura = new THREE.Mesh(new THREE.SphereGeometry(3.1, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x8f9bff, transparent: true, opacity: 0.22, depthWrite: false }));
    scene.add(FXS.aura);
  }
  FXS.aura.visible = FXS.shieldT > 0 && (FXS.shieldT > 2 || Math.floor(FXS.shieldT * 6) % 2 === 0);
  FXS.aura.position.set(V.x, V.y + 1.1, V.z);
}

/* ─────────────── коллекция ───────────────
   Десять предметов разбросаны по району, четыре — во дворах у пиццерии.
   Висят над землёй, крутятся и светятся. Подобрал — +1000 ₽ и предмет
   навсегда в коллекции, с карты он пропадает. В меню — сетка: найденные с
   картинкой, остальные под вопросом. Все иконки нарисованы кодом (colIcon):
   чужих картинок в игре нет. */
const COLLECT = ADULT ? [
  // взрослая версия: половина находок — то, что в детской нельзя
  { id: 'latte', name: $t('латте с медовой пенкой') },
  { id: 'snus', name: $t('шайба снюса'), near: true },
  { id: 'cig', name: $t('пачка «Шапмэн» с вишней'), near: true },
  { id: 'cassette', name: $t('аудиокассета'), near: true },
  { id: 'herb', name: $t('подозрительный свёрток'), near: true },
  { id: 'beer', name: $t('пиво «Жигулёвочка»') },
  { id: 'salmon', name: $t('пицца с лососем') },
  { id: 'pager', name: $t('пейджер') },
  { id: 'penguin', name: $t('плюшевый пингвин'), far: true },
  { id: 'peel', name: $t('золотая лопата для пиццы'), far: true },
] : [
  { id: 'latte', name: $t('латте с медовой пенкой') },
  { id: 'duck', name: $t('резиновая уточка'), near: true },
  { id: 'cactus', name: $t('кактус в горшке'), near: true },
  { id: 'cassette', name: $t('аудиокассета'), near: true },
  { id: 'cube', name: $t('кубик-головоломка'), near: true },
  { id: 'gnome', name: $t('садовый гном') },
  { id: 'salmon', name: $t('пицца с лососем') },
  { id: 'pager', name: $t('пейджер') },
  { id: 'penguin', name: $t('плюшевый пингвин'), far: true },
  { id: 'peel', name: $t('золотая лопата для пиццы'), far: true },
];
const COL_PRIZE = 1000;
const colGot = () => { const v = Store.get('dlv-msk-col', []); return Array.isArray(v) ? v : []; };

/* иконка предмета — на канвасе 128×128: и для меню, и для спрайта на карте */
function colIcon (c, done) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const R = (hex, a, b, w, h) => { x.fillStyle = hex; x.fillRect(a, b, w, h); };
  const T = (t, a, b, hex, fs) => { x.fillStyle = hex; x.font = 'bold ' + fs + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, a, b); };

  const C = (hex, a, b, r) => { x.fillStyle = hex; x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); };
  switch (c.id) {
    case 'latte':
      R('#e9f2f8', 38, 22, 52, 90); R('#6b4a3a', 42, 70, 44, 38); R('#e6cfa8', 42, 44, 44, 26);
      R('#ffe08a', 40, 26, 48, 20); R('#f2b441', 46, 30, 6, 30); R('#f2b441', 70, 28, 6, 36);           // медовые подтёки
      R('#8a6b4e', 44, 104, 40, 8); R('#f0522a', 70, 4, 6, 40);                                      // соломинка
      break;
    case 'duck':
      C('#ffd23f', 58, 82, 34); C('#ffd23f', 76, 44, 22); R('#ff8a2b', 92, 44, 22, 10);               // тело, голова, клюв
      C('#1b1a1f', 80, 38, 4); R('#f2b43a', 30, 70, 30, 12);                                        // глаз, крыло
      R('#6fb0c9', 18, 110, 92, 8);
      break;
    case 'cactus':
      R('#c9803a', 36, 84, 56, 34); R('#a8652a', 32, 80, 64, 10);                                   // горшок
      R('#4fae3a', 54, 22, 20, 62); R('#4fae3a', 34, 42, 14, 12); R('#4fae3a', 34, 42, 8, 30);
      R('#4fae3a', 80, 34, 14, 12); R('#4fae3a', 86, 26, 8, 24);                                    // отростки
      R('#ff5d7a', 58, 14, 12, 10);                                                                // цветок
      for (const [a, b] of [[60, 34], [66, 50], [58, 64], [68, 72]]) R('#d8f0c8', a, b, 3, 3);
      break;
    case 'cassette':
      R('#2b2a30', 14, 34, 100, 64); R('#e8e2d4', 22, 42, 84, 28); R('#e04836', 22, 48, 84, 6);
      C('#2b2a30', 46, 60, 9); C('#2b2a30', 82, 60, 9); C('#e8e2d4', 46, 60, 3); C('#e8e2d4', 82, 60, 3);
      R('#57525c', 36, 80, 56, 12);
      break;
    case 'cube': {
      const cols = ['#e04836', '#ffd23f', '#4f7fd6', '#59b06a', '#ff8a2b', '#f4f4ee'];
      R('#1b1a1f', 22, 22, 84, 84);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R(cols[(i * 3 + j * 2 + 1) % 6], 26 + i * 27, 26 + j * 27, 23, 23);
      break;
    }
    case 'gnome':
      x.fillStyle = '#e04836'; x.beginPath(); x.moveTo(64, 8); x.lineTo(90, 50); x.lineTo(38, 50); x.closePath(); x.fill();   // колпак
      C('#f0c8a0', 64, 58, 14); C('#f4f4ee', 64, 76, 18);                                             // лицо и борода
      R('#4f7fd6', 42, 84, 44, 30); R('#3a2c22', 42, 112, 18, 8); R('#3a2c22', 68, 112, 18, 8);
      C('#1b1a1f', 58, 56, 2.5); C('#1b1a1f', 70, 56, 2.5); C('#ff9a7a', 64, 62, 4);
      break;
    case 'salmon':
      x.fillStyle = '#e8b563'; x.beginPath(); x.moveTo(64, 116); x.lineTo(18, 26); x.lineTo(110, 26); x.closePath(); x.fill();
      x.fillStyle = '#fff3d6'; x.beginPath(); x.moveTo(64, 104); x.lineTo(28, 34); x.lineTo(100, 34); x.closePath(); x.fill();
      for (const [a, b] of [[50, 44], [74, 46], [62, 64], [56, 84], [70, 76]]) { R('#ff8a70', a - 7, b - 5, 14, 10); R('#ffd0c0', a - 7, b - 5, 14, 3); }
      for (const [a, b] of [[40, 40], [86, 42], [64, 52], [66, 92]]) R('#4fae3a', a, b, 4, 4);
      break;
    case 'pager':
      R('#3a3940', 28, 30, 72, 70); R('#9fd08a', 36, 38, 56, 24); R('#57525c', 28, 24, 20, 8);
      T('1234', 64, 50, '#2f5a38', 16);
      for (let i = 0; i < 3; i++) R('#8e8a92', 38 + i * 18, 72, 14, 10);
      R('#e04836', 84, 72, 10, 10);
      break;
    case 'penguin':
      C('#1b1a1f', 64, 76, 36); C('#f4f4ee', 64, 82, 24); C('#1b1a1f', 64, 38, 24); C('#f4f4ee', 64, 42, 14);
      C('#1b1a1f', 58, 38, 3); C('#1b1a1f', 70, 38, 3); R('#ff8a2b', 60, 44, 8, 6);
      R('#ff8a2b', 44, 108, 14, 8); R('#ff8a2b', 70, 108, 14, 8); R('#e04836', 44, 58, 40, 6);   // лапы и шарф
      break;
    case 'herb':
      x.fillStyle = '#c9a877'; x.beginPath(); x.moveTo(30, 110); x.lineTo(98, 110); x.lineTo(80, 40); x.lineTo(48, 40); x.closePath(); x.fill();
      R('#a88859', 52, 30, 24, 12);
      x.fillStyle = '#4fae3a';
      for (const [a, b, r] of [[50, 22, 12], [66, 14, 13], [80, 24, 11], [60, 30, 10]]) { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); }
      T('?', 64, 80, '#6b4a3a', 30);
      break;
    case 'snus':
      x.fillStyle = '#1f3f7a'; x.beginPath(); x.ellipse(64, 70, 46, 30, 0, 0, 7); x.fill();
      x.fillStyle = '#2f5fd0'; x.beginPath(); x.ellipse(64, 60, 46, 30, 0, 0, 7); x.fill();
      x.strokeStyle = '#fff3d6'; x.lineWidth = 4; x.beginPath(); x.ellipse(64, 60, 34, 20, 0, 0, 7); x.stroke();
      T('SNUS', 64, 61, '#fff3d6', 14);
      break;
    case 'cig':
      // пачка пародийной марки: сигареты торчат, вишня на пачке
      R('#2b2a30', 36, 18, 56, 94); R('#8a1c3a', 38, 20, 52, 90); R('#ffd3dc', 38, 34, 52, 12);
      T('ШАПМЭН', 64, 40, '#8a1c3a', 8);
      C('#e8323c', 58, 74, 7); C('#e8323c', 70, 76, 7); R('#4fae3a', 62, 60, 4, 10);
      R('#f3e9d8', 44, 10, 10, 14); R('#f3e9d8', 58, 8, 10, 16); R('#f3e9d8', 72, 11, 10, 13);
      R('#d9832c', 44, 10, 10, 3); R('#d9832c', 58, 8, 10, 3); R('#d9832c', 72, 11, 10, 3);
      break;
    case 'beer':
      R('#6b3f1c', 50, 40, 28, 74); R('#6b3f1c', 56, 12, 16, 30); R('#e8d7a8', 54, 8, 20, 8);
      R('#f2e3b0', 50, 64, 28, 30); T('ЖИГ', 64, 79, '#6b3f1c', 12);
      break;
    case 'peel':
      R('#c8a15a', 58, 60, 12, 60); R('#ffd85e', 30, 10, 68, 56); R('#f2b441', 30, 58, 68, 8);
      R('#fff3b0', 38, 16, 12, 30);                                                                // блик
      break;
  }
  if (!done) {
    // рамка: чтобы иконка на карте читалась издалека
    x.strokeStyle = '#ffd85e'; x.lineWidth = 6; x.strokeRect(4, 4, 120, 120);
  }
  return cv;
}

const COL_ON_MAP = [];
function buildCollect () {
  const got = colGot();
  // места — детерминированно по id, чтобы от захода к заходу не прыгали
  const hash = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const near = SPOTS.filter(s => { const d = Math.hypot(s.x - PIZZA.x, s.z - PIZZA.z); return d > 40 && d < 190; });
  const farBank = SPOTS.filter(s => s.x < riverX(s.z));
  const rest = SPOTS.filter(s => Math.hypot(s.x - PIZZA.x, s.z - PIZZA.z) > 260 && s.x > riverX(s.z));
  const used = [];
  for (const c of COLLECT) {
    if (got.includes(c.id)) continue;
    const pool = (c.near ? near : c.far ? farBank : rest).filter(s => used.every(u => Math.hypot(u.x - s.x, u.z - s.z) > 70));
    if (!pool.length) continue;
    const sp = pool[hash(c.id) % pool.length];
    used.push(sp);
    const tex = new THREE.CanvasTexture(colIcon(c, false));
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(1.9, 1.9, 1);
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 9, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd88cff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 4.5;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.8, 20),
      new THREE.MeshBasicMaterial({ color: 0xd88cff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25;
    g.add(beam, ring, spr);
    g.position.set(sp.x, groundH(sp.x, sp.z) + curbAt(sp.x, sp.z), sp.z);
    scene.add(g);
    COL_ON_MAP.push({ c, x: sp.x, z: sp.z, y: g.position.y, g, spr, ring, ph: rand(0, 6) });
  }
}

function updateCollect (dt) {
  const live = S.state === 'drive' || S.state === 'back' || S.state === 'handover' || S.state === 'side';
  for (let i = COL_ON_MAP.length - 1; i >= 0; i--) {
    const o = COL_ON_MAP[i];
    o.ph += dt;
    o.g.visible = Math.abs(o.x - V.x) < 400 && Math.abs(o.z - V.z) < 400;
    if (!o.g.visible) continue;
    o.spr.position.y = 1.9 + Math.sin(o.ph * 2.2) * 0.3;
    o.spr.material.rotation = Math.sin(o.ph * 1.5) * 0.25;
    const k = 1 + Math.sin(o.ph * 3) * 0.12;
    o.ring.scale.set(k, k, k);
    if (!live || Math.hypot(o.x - V.x, o.z - V.z) > 3.6 || Math.abs(o.y - V.y) > 3) continue;
    // подобрал: в коллекцию навсегда и тысяча на счёт
    const got = colGot();
    if (!got.includes(o.c.id)) got.push(o.c.id);
    Store.set('dlv-msk-col', got);
    // находка — сразу в кошелёк; в смене ещё и в её счёт
    addWallet(COL_PRIZE);
    if (!S.ride) S.money += COL_PRIZE;
    popBonus($t('находка!'), o.c.name + ' · +' + money(COL_PRIZE) + ' · ' + $t('{i} из {n}', { i: got.length, n: COLLECT.length }));
    scene.remove(o.g);
    COL_ON_MAP.splice(i, 1);
  }
}

/* коллекция в меню: найденные — картинкой, остальные — под вопросом */
function renderCollect () {
  if (!$('col-grid')) return;
  const got = colGot();
  $('col-count').textContent = $t('{i} из {n}', { i: got.length, n: COLLECT.length });
  const grid = $('col-grid');
  grid.innerHTML = '';
  for (const c of COLLECT) {
    const cell = document.createElement('div');
    const have = got.includes(c.id);
    cell.className = 'col-c' + (have ? ' have' : '');
    cell.title = have ? c.name : $t('ещё не нашёл');
    if (have) {
      cell.appendChild(colIcon(c, true));
      const n = document.createElement('span'); n.textContent = c.name; cell.appendChild(n);
    } else cell.innerHTML = '<b>?</b>';
    grid.appendChild(cell);
  }
}

/* ─────────────── маршрут по асфальту ───────────────
   Пунктирная оранжевая дорожка от машины до адреса, как навигатор
   в ГТА. Пересчитывается пару раз в секунду, поэтому объезды
   и срезы отрабатываются сразу. */

let routePts = [];

/* ближайшая точка на осевой улицы: маршрут должен идти по дорогам,
   а не резать наискосок через газоны */
function snapToRoad (x, z) {
  const road = nearestRoad(x, z, DRIVE_MAX + 2, 3);
  return road ? [road.x, road.z] : [x, z];
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

/* ─────────────── гараж и кошелёк ───────────────
   Деньги смены в конце падают в кошелёк — он копится между сменами в
   браузере. В магазине на них покупаются машины: каждая следующая на
   одно сердце крепче. Купленные остаются навсегда, выбранная выезжает на
   смену. Своя оранжевая курьерская — бесплатно, пять сердец. */
const CARS = [
  // каждая следующая — на сердце крепче и быстрее: vmax — максималка, м/с, acc — разгон
  { id: 'dodo', name: $t('Птица-седан'), note: $t('курьерская, своя'), model: 'sedan', hex: '#f0522a', hp: 5, price: 0, vmax: 48, acc: 36 },
  { id: 'drista', name: ADULT ? $t('Мада Дриста') : $t('Мада Тень'), note: $t('тонированный заниженный седан'), model: 'sedan', hex: '#2b2d33', hp: 6, price: 2500, tint: true, low: true, vmax: 51, acc: 38 },
  { id: 'malina', name: $t('Мада Малина'), note: $t('хэтчбек малинового цвета'), model: 'hatch', hex: '#c2185b', hp: 7, price: 5000, vmax: 54, acc: 40 },
  { id: 'shmolf', name: $t('Пельпаген Шмольф'), note: $t('хэтчбек, чёрный'), model: 'hatch', hex: '#17171b', hp: 8, price: 9000, vmax: 57, acc: 42 },
  { id: 'bladen', name: $t('Стрела Спорт'), note: $t('спортивное купе — самый быстрый'), model: 'coupe', hex: '#e0d2b0', hp: 9, price: 15000, vmax: 66, acc: 48 },
];
const wallet = () => +Store.get('dlv-msk-wallet', 0) || 0;
const addWallet = n => Store.set('dlv-msk-wallet', wallet() + n);
const owned = () => { const v = Store.get('dlv-msk-cars', ['dodo']); return Array.isArray(v) ? v : ['dodo']; };
const curCar = () => CARS.find(c => c.id === Store.get('dlv-msk-car', 'dodo') && owned().includes(c.id)) || CARS[0];
const makeCourier = () => { const c = curCar(); return makeCar(c.hex, true, c.model, false, c); };

/* машина сбоку — для витрины магазина: силуэт по модели, цвет, стёкла */
function carPic (c) {
  const cv = document.createElement('canvas');
  cv.width = 220; cv.height = 96;
  const x = cv.getContext('2d');
  const low = c.low ? 5 : 0, glass = c.tint ? '#16181e' : '#8fb0cc';
  const shape = {
    sedan: [[18, 62], [30, 46], [70, 44], [92, 24], [150, 24], [170, 44], [206, 48], [206, 66], [18, 66]],
    hatch: [[26, 62], [34, 46], [70, 42], [96, 20], [176, 20], [192, 42], [196, 66], [26, 66]],
    coupe: [[12, 64], [20, 50], [80, 46], [110, 28], [150, 28], [182, 46], [210, 52], [210, 68], [12, 68]],
  }[c.model];
  x.fillStyle = c.hex; x.strokeStyle = '#33210c'; x.lineWidth = 3;
  x.beginPath(); shape.forEach(([a, b], i) => (i ? x.lineTo(a, b + low) : x.moveTo(a, b + low))); x.closePath(); x.fill(); x.stroke();
  // окна
  const win = { sedan: [[96, 28], [146, 28], [162, 44], [80, 44]], hatch: [[100, 24], [172, 24], [184, 42], [76, 42]], coupe: [[114, 32], [148, 32], [172, 46], [90, 46]] }[c.model];
  x.fillStyle = glass;
  x.beginPath(); win.forEach(([a, b], i) => (i ? x.lineTo(a, b + low) : x.moveTo(a, b + low))); x.closePath(); x.fill();
  if (c.model === 'coupe') { x.fillStyle = '#2b2a30'; x.fillRect(14, 44 + low, 22, 5); x.fillRect(22, 44 + low, 4, 10); }
  if (c.id === 'dodo') { x.fillStyle = '#fff'; x.fillRect(104, 14, 34, 10); x.fillStyle = '#f0522a'; x.fillRect(110, 16, 22, 6); }
  // колёса
  for (const wx of c.model === 'coupe' ? [52, 172] : c.model === 'hatch' ? [60, 166] : [56, 170]) {
    x.fillStyle = '#221c19'; x.beginPath(); x.arc(wx, 68, 15, 0, 7); x.fill();
    x.fillStyle = '#d7d2c8'; x.beginPath(); x.arc(wx, 68, 6, 0, 7); x.fill();
  }
  return cv;
}

/* ─── окна меню: «мои коллекции» и «магазин» ─── */
const elPanel = $('panel'), elPanelBody = $('pn-body');
function openPanel (kind) {
  elPanel.hidden = false;
  elPanel.dataset.kind = kind;
  if (kind === 'collect') {
    elPanelBody.innerHTML = '<div class="pn-t">' + $t('мои находки') + ' <span id="col-count"></span></div>' +
      '<div id="col-grid"></div><div class="pn-n">' + $t('предметы разбросаны по району, часть — во дворах у пиццерии. За каждый — {money}', { money: money(COL_PRIZE) }) + '</div>';
    renderCollect();
  } else renderShop();
}
function closePanel () { elPanel.hidden = true; }

/* ─── площадка: реклама, пауза, язык, настройки ───
   Всё, что зависит от Яндекса или Стима, идёт через Platform. Полноэкранная
   реклама — раз в AD_EVERY доставок сразу после «принять» и перед «ещё
   раз»; частоту сверху режет сама площадка. Видео за награду — только по
   кнопке в конце смены: удваивает заработанное в кошелёк (не в рекорд). */
const AD_EVERY = 3;
const EXT = { paused: false };                     // пауза от площадки: реклама, свернули вкладку
const isPlaying = () => ['drive', 'back', 'handover', 'side', 'loading', 'brief'].includes(S.state);
/* плюс не чаще раза в три минуты своей игры: заказ — короткий «уровень»,
   рекламу между заказами площадка терпит, но не каждые полторы минуты */
const AD_GAP = 180000;
let adLast = performance.now();
const adDue = () => Platform.features.ads && !S.ride && (S.done || 0) > 0 && (S.done || 0) - (S.adDone || 0) >= AD_EVERY && performance.now() - adLast > AD_GAP;
async function showAd () {
  adLast = performance.now();
  Platform.gameplayStop();
  try { await Platform.showInterstitial(); } catch (e) { console.warn('[ad]', e); }
}
const nitroKey = () => (matchMedia('(pointer: coarse)').matches ? $t('кнопку нитро') : PAD.active ? 'X' : 'Shift');
Platform.onPause(() => {
  EXT.paused = true;
  Snd.mute(true);
  for (const k in IN) IN[k] = 0;
  joyReset();
});
Platform.onResume(() => {
  EXT.paused = false;
  Snd.mute(false);
  last = performance.now();                         // кадр после паузы — не прыжком
});

/* конец смены: кнопки «удвоить за рекламу» и «войти в Яндекс» */
function overExtras () {
  const x2 = $('ov-x2'), au = $('ov-auth');
  x2.hidden = !(Platform.features.ads && S.money > 0 && !S.freeRun);
  x2.disabled = false;
  au.hidden = !(Platform.id === 'yandex' && !Platform.player.authorized && !S.freeRun);
  $('ov-extra').hidden = x2.hidden && au.hidden;
}
$('ov-x2').addEventListener('click', async () => {
  const b = $('ov-x2');
  b.disabled = true;
  let ok = false;
  try { ok = await Platform.showRewarded(); } catch (e) { console.warn('[rewarded]', e); }
  if (ok) { addWallet(S.money); popBonus($t('заработок удвоен!'), '+' + money(S.money) + ' ' + $t('в кошелёк')); b.hidden = true; }
  else b.disabled = false;
});
$('ov-auth').addEventListener('click', async () => {
  try { await Platform.player.auth(); } catch (e) { /* отказался */ }
  if (Platform.player.authorized) {
    $('ov-auth').hidden = true;
    S.name = Platform.player.name || S.name;
    if (S.money > 0 && !S.freeRun) LB.save({ name: S.name, money: S.money, delivered: S.delivered, lv: levelOf(getXP()) }).then(() => LB.render(S.money));
  }
});

/* язык: окно со списком — названия на своих языках. Смена — перезагрузка:
   строки игры переводятся при загрузке */
function renderLangs () {
  elPanelBody.innerHTML = '<div class="pn-t">🌐 ' + $t('язык') + '</div><div class="lang-grid">' +
    LANGS.map(l => '<button type="button" lang="' + l + '" data-l="' + l + '"' + (l === curLang() ? ' class="cur"' : '') + '>' + LANG_NAMES[l] + '</button>').join('') + '</div>';
  elPanelBody.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.l === curLang()) { closePanel(); return; }
    Platform.setLang(b.dataset.l);
    Platform.store.flush && Platform.store.flush();
    setTimeout(() => location.reload(), 150);
  }));
}
function renderSettings () {
  const row = (label, val, id) => '<div class="set-row"><span>' + label + '</span><button type="button" id="' + id + '">' + val + '</button></div>';
  elPanelBody.innerHTML = '<div class="pn-t">' + $t('настройки') + '</div>' +
    row($t('звук'), Snd.on ? $t('вкл') : $t('выкл'), 'set-snd') +
    row('🌐 ' + $t('язык'), LANG_NAMES[curLang()], 'set-lang') +
    (Platform.features.adult ? row($t('версия'), ADULT ? $t('взрослая 18+') : $t('детская'), 'set-ed') : '') +
    '<div class="pn-n">' + $t('карта — © участники OpenStreetMap, лицензия ODbL. Рельеф — SRTM (NASA).') + '</div>';
  $('set-snd').onclick = () => { Snd.set(!Snd.on); renderSettings(); };
  $('set-lang').onclick = () => renderLangs();
  if ($('set-ed')) $('set-ed').onclick = () => { Store.set('dlv-edition', ADULT ? 'kids' : 'adult'); Platform.store.flush && Platform.store.flush(); setTimeout(() => location.reload(), 150); };
}
$('st-lang').addEventListener('click', () => { elPanel.hidden = false; elPanel.dataset.kind = 'lang'; renderLangs(); });
/* Выбор карты убран: Стим — это Северск, Яндекс — Москва. Для отладки кнопка
   возвращается адресом ?maps. Смена — перезагрузка */
if (MAP_IDS.length > 1 && new URLSearchParams(location.search).has('maps')) {
  $('st-map').hidden = false;
  $('st-map-n').textContent = $t(MAP.title);
  $('st-map').addEventListener('click', () => {
    elPanel.hidden = false; elPanel.dataset.kind = 'maps';
    elPanelBody.innerHTML = '<div class="pn-t">🗺 ' + $t('карта') + '</div><div class="lang-grid">' +
      MAP_IDS.map(id => '<button type="button" data-m="' + id + '"' + (id === MAP.id ? ' class="cur"' : '') + '><b>' + $t(MAP_META[id].title) + '</b><br><small>' + $t(MAP_META[id].note) + '</small></button>').join('') + '</div>';
    elPanelBody.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.m === MAP.id) { closePanel(); return; }
      Store.set('dlv-map', b.dataset.m); Platform.store.flush && Platform.store.flush();
      setTimeout(() => location.replace(location.pathname + location.search.replace(/[?&]map=[^&]*/, '')), 150);
    }));
  });
}
$('st-lang-n').textContent = LANG_NAMES[curLang()];
$('st-set').addEventListener('click', () => { elPanel.hidden = false; elPanel.dataset.kind = 'settings'; renderSettings(); });
if (Platform.features.quit) { $('st-quit').hidden = false; $('st-quit').addEventListener('click', () => Platform.quit()); }
/* имя спрашиваем только там, где его нет в профиле площадки */
if (!Platform.features.nameInput) for (const el of [$('st-name'), document.querySelector('#start label')]) if (el) el.hidden = true;
$('pn-close').addEventListener('click', closePanel);
elPanel.addEventListener('click', e => { if (e.target === elPanel) closePanel(); });
$('st-col').addEventListener('click', () => openPanel('collect'));
$('st-shop').addEventListener('click', () => openPanel('shop'));

function renderShop () {
  const have = owned(), cur = curCar(), cash = wallet();
  elPanelBody.innerHTML = '<div class="pn-t">' + $t('гараж') + ' <span>' + $t('в кошельке {money}', { money: money(cash) }) + '</span></div><div id="shop"></div>' +
    '<div class="pn-n">' + $t('доставляй заказы — деньги сразу падают в кошелёк и не пропадут, даже если смена сорвётся. Каждая следующая машина — на одно сердце крепче и быстрее') + '</div>';
  const list = $('shop');
  for (const c of CARS) {
    const card = document.createElement('div');
    card.className = 'sh-c' + (c.id === cur.id ? ' cur' : '');
    card.appendChild(carPic(c));
    const info = document.createElement('div');
    info.className = 'sh-i';
    info.innerHTML = '<b>' + c.name + '</b><span>' + c.note + '</span><em>' + '♥'.repeat(c.hp) + '</em>' +
      '<i class="sh-sp">' + $t('{n} км/ч', { n: Math.round(c.vmax * 3.6) }) + '</i>';
    card.appendChild(info);
    const btn = document.createElement('button');
    btn.type = 'button';
    if (c.id === cur.id) { btn.textContent = $t('на смене'); btn.disabled = true; }
    else if (have.includes(c.id)) { btn.textContent = $t('выбрать'); btn.onclick = () => { Store.set('dlv-msk-car', c.id); resetCar(); renderShop(); }; }
    else {
      btn.textContent = money(c.price);
      btn.disabled = cash < c.price;
      btn.onclick = () => {
        if (wallet() < c.price) return;
        addWallet(-c.price);
        Store.set('dlv-msk-cars', owned().concat(c.id));
        Store.set('dlv-msk-car', c.id);
        Platform.store.flush && Platform.store.flush();   // покупка — сохранить сразу
        resetCar();
        Snd.coin();
        renderShop();
      };
    }
    card.appendChild(btn);
    list.appendChild(card);
  }
}

/* ─────────────── игрок ─────────────── */

let car = makeCourier();
scene.add(car);

const V = {
  x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, steerVis: 0, wheel: 0, pitch: 0, roll: 0,
  camX: 0, camY: 0, camZ: 0, camH: 0, splashT: 0,
};

const S = {
  state: 'title',          // title | drive | back | handover | over
  hp: 5, hpMax: 5, money: 0, orders: 0, lvl0: 1, burgers: 0, people: 0, wrecks: 0, scoots: 0, delivered: 0, best: +Store.get('dlv-msk-best', 0) || 0,
  target: null, addr: '', fee: 0, time: 0, timeMax: 1, handT: 0,
  order: null, delivered: 0, name: Platform.features.nameInput ? Store.get('dlv-name', '') : (Platform.player.name || ''),
  routeT: 0, tickT: 0, shake: 0, hurt: 0, paused: false,
  // без времени: срок не тикает и за опоздание смену не снимают;
  // freeRun — смена, в которой режим хоть раз включали: в зачёт она не идёт
  free: false,             // без срока — только «просто покататься»
  ride: false,             // просто катаемся: без заказов и зачёта
  freeRun: false,
};

const IN = { gas: 0, brake: 0, left: 0, right: 0, hand: 0, nitro: 0, joy: 0, jx: 0 };

/* после сгоревшей смены кузов возвращается целым и некопчёным */
function resetCar () {
  V.sink = undefined;
  dropMesh(car);
  car = makeCourier();
  car.position.set(V.x, V.y, V.z);
  car.rotation.y = V.h;
  scene.add(car);
}

/* ─────────────── физика ─────────────── */
let ACC = 36, VMAX = 48;                       // у каждой машины свои — ставятся в startRun (carStats)
const BRK = 38, TURN = 2.3;
/* Горка: под гору разгоняет, в гору тянет назад. Настоящие девять и
   восемь десятых здесь почти не чувствуются — у машины аркадный разгон
   в тридцать шесть, поэтому склон усилен. Стоящая машина не катится:
   считаем, что курьер держит ручник. */
const SLOPE_G = 24;

/* Нитро. Бак — от нуля до единицы, полного хватает на пять секунд.
   Пока жжёшь, машину толкает сверх газа и потолок скорости растёт с
   48 до 62 м/с — с двухсот двадцати назад сбрасывает плавно, без стены. */
const NOS = { tank: 0.5, burn: false, was: false, flameT: 0 };
const NOS_BURN = 0.2, NOS_CAN = 0.5, NOS_ACC = 55;
let VBOOST = 62;                                  // потолок на нитро: максималка машины плюс четырнадцать
function carStats () { const c = curCar(); VMAX = c.vmax || 48; ACC = c.acc || 36; VBOOST = VMAX + 14; }
/* габариты кузова: по ним считаются все попадания, а не по одному кругу */
const CAR_L = 2.2, CAR_W = 1.0;

function driveStep (dt) {
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  const sx = fz, sz = -fx;
  let vf = V.vx * fx + V.vz * fz;
  let vl = V.vx * sx + V.vz * sz;
  const px0 = V.x, pz0 = V.z;

  // уклон под колёсами: разница высот под передней и задней осью
  const hN = surfaceAt(V.x + fx * 1.4, V.z + fz * 1.4, V.y), hT = surfaceAt(V.x - fx * 1.45, V.z - fz * 1.45, V.y);
  const slope = (hN - hT) / 2.85;
  if (IN.gas || IN.brake || Math.abs(vf) > 1.2) vf -= slope * SLOPE_G * dt;

  const beast = FXS.beastT > 0 && !!IN.nitro;
  NOS.burn = !!IN.nitro && NOS.tank > 0 && !beast;
  if (beast) vf += ACC * Math.max(0.2, 1 - vf / (VMAX * 2)) * dt;
  if (NOS.burn) {
    NOS.tank = Math.max(0, NOS.tank - NOS_BURN * (S.nosEff || 1) * dt);
    vf += NOS_ACC * dt;
    if (!NOS.was) { Snd.nosFire(); S.shake = Math.max(S.shake, 0.25); }
  }
  NOS.was = NOS.burn;

  if (IN.gas && !V.air) vf += ACC * Math.max(0.25, 1 - vf / VMAX) * dt;
  const wet = Math.min(1, ENV.rain + SEAS.slip());   // дождь, а зимой и снег
  if (IN.brake) vf -= (vf > 0.4 ? BRK * (1 - wet * 0.45) : ACC * 0.5) * dt;
  vf = clamp(vf, -15, beast ? VMAX * 2 : VBOOST);
  if (!NOS.burn && !beast && vf > VMAX) vf -= (vf - VMAX) * 1.4 * dt;   // после нитро сбрасывает, а не упирается
  vf -= vf * 0.3 * dt;
  if (IN.hand) vf -= vf * 1.1 * dt;
  vl *= Math.exp(-(IN.hand ? 2.2 : lerp(8.5, 2.6, wet)) * dt);   // ручник пускает в занос, в дождь носит и так

  const sv = IN.joy ? -clamp(IN.jx * 1.35, -1, 1) : (IN.left ? 1 : 0) - (IN.right ? 1 : 0);
  const spd = Math.abs(vf);
  const grip = clamp(spd / 8, 0, 1) / (1 + spd * 0.014) * (V.air ? 0.15 : 1);
  V.h += sv * TURN * grip * (IN.hand ? 1.5 : 1) * Math.sign(vf || 1) * dt;
  V.steerVis = damp(V.steerVis, sv * 0.42, 10, dt);

  V.vx = fx * vf + sx * vl;
  V.vz = fz * vf + sz * vl;
  V.x += V.vx * dt;
  V.z += V.vz * dt;
  V.wheel += vf * dt / 0.46;

  let out = V.x < BOUNDS.x0 || V.x > BOUNDS.x1 || V.z < BOUNDS.z0 || V.z > BOUNDS.z1;
  // граница-многоугольник: за забор не выехать — откатываем на шаг и гасим скорость
  if (BMASK && !out && !inBorder(V.x, V.z)) { V.x = px0; V.z = pz0; V.vx *= -0.2; V.vz *= -0.2; out = true; }
  if (V.x < BOUNDS.x0) { V.x = BOUNDS.x0; V.vx = Math.max(0, V.vx); }
  if (V.x > BOUNDS.x1) { V.x = BOUNDS.x1; V.vx = Math.min(0, V.vx); }
  if (V.z < BOUNDS.z0) { V.z = BOUNDS.z0; V.vz = Math.max(0, V.vz); }
  if (V.z > BOUNDS.z1) { V.z = BOUNDS.z1; V.vz = Math.min(0, V.vz); }
  // упёрся в край — говорим, что дальше карты нет
  V.edgeT = (V.edgeT || 0) - dt;
  if (out && V.edgeT <= 0 && S.state !== 'title') {
    V.edgeT = 4;
    toast($t(MAP.edgeToast));
  }

  // Река: с моста в неё не съехать — перила, а с берега — можно, и это
  // конец смены: машина уходит под воду. Над водой в полёте с трамплина
  // ещё не тонем — только когда плюхнулись. Пока смена не началась
  // (заставка, загрузка), по-старому отбрасывает назад.
  const live = S.state === 'drive' || S.state === 'back' || S.state === 'handover' || S.state === 'side';
  if (V.sink !== undefined) {
    V.vx *= Math.exp(-2.2 * dt); V.vz *= Math.exp(-2.2 * dt);
  } else if (surfaceAt(V.x, V.z, V.y) < -0.15 && live && !(V.air && V.y > 0.2)) {
    drown();
  } else if (surfaceAt(V.x, V.z, V.y) < -0.15) {
    V.x = px0; V.z = pz0;
    const sp = Math.hypot(V.vx, V.vz);
    V.vx *= -0.25; V.vz *= -0.25;
    if (sp > 3 && V.splashT <= 0) {
      V.splashT = 0.6;
      splash(V.x + fx * 2.6, V.z + fz * 2.6);
      Snd.noise(0.35, 0.3);
      toast($t(pick(MAP.waterToasts)));
    }
  }
  V.splashT -= dt;

  // Кузов считаем двумя кругами — носом и кормой. Один круг радиусом
  // с полдлины машины цеплял всё вокруг; так габарит совпадает с тем,
  // что видно на экране, и в просвет между машинами реально пролезаешь.
  const noseX = V.x + fx * CAR_L * 0.55, noseZ = V.z + fz * CAR_L * 0.55;
  const tailX = V.x - fx * CAR_L * 0.55, tailZ = V.z - fz * CAR_L * 0.55;
  const bump = vn => {
    if (vn > 2.5) { sparks(V.x + fx * 2, 0.7, V.z + fz * 2, vn > 12 ? 9 : 4, 0, 0); Snd.spark(); }
    if (vn > 13) hurtCar((vn - 13) * 0.16, vn, V.x + fx * 2, V.z + fz * 2);
  };
  // Стены домов стоят под любым углом, поэтому выталкиваем в осях самой
  // стены: сначала находим, с какой стороны коробки мы влезли, а потом
  // гасим скорость по её нормали — вдоль стены машина продолжает ехать.
  const r = CAR_W;
  for (const [cx, cz] of [[noseX, noseZ], [tailX, tailZ]]) {
    for (const s of solidsNear(cx, cz)) {
      if (s.deckY !== undefined && V.y < s.deckY - 1.2) continue; // едем под мостом, не по нему
      // задняя стенка рампы держит только тех, кто заезжает сзади: кто уже
      // на скате или летит над ней — проезжает
      if (s.ramp !== undefined && (V.y > s.ramp - 0.5 || (V.rlift || 0) > 0 || V.air || V.rampSafe > 0 ||
          V.vx * s.rux + V.vz * s.ruz > 0)) continue;
      const dx = cx - s.cx, dz = cz - s.cz;
      const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
      const px = s.hw + r - Math.abs(lx), pz = s.hd + r - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      let nx, nz, pen;
      // от перил выталкиваем только вбок, не вдоль
      if (px < pz && !s.rail) { const sg = lx < 0 ? -1 : 1; nx = sg * s.cs; nz = sg * s.sn; pen = px; }
      else { const sg = lz < 0 ? -1 : 1; nx = -sg * s.sn; nz = sg * s.cs; pen = pz; }
      // стекло веранды: на скорости бьётся и не держит
      if (s.veranda && -(V.vx * nx + V.vz * nz) > 6) {
        const l = Math.hypot(V.vx, V.vz) || 1;
        verandaBreak(s.veranda, V.vx / l, V.vz / l, l);
        V.vx *= 0.85; V.vz *= 0.85;
        break;
      }
      V.x += nx * pen; V.z += nz * pen;
      const vn = V.vx * nx + V.vz * nz;
      if (vn < 0) {
        bump(-vn);
        V.vx -= vn * nx * 1.2; V.vz -= vn * nz * 1.2;
      }
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
        const bx = t.x + tfx * (t.hl || CAR_L) * k, bz = t.z + tfz * (t.hl || CAR_L) * k;
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
    // Курьер-соперник, который сам налетел на тебя (на обгоне, из-за
    // спины), — не авария: мягко расталкиваемся, без урона и без злого
    // водителя. Бьёт только таран бодливой курьерши, а злится — только если въехал ты.
    const mine = -(V.vx * nx + V.vz * nz), theirs = tvx * nx + tvz * nz;
    const graze = t.svc === 'rival' && !(t.ramT > 0) && (hit < 20 || theirs > mine);
    if (graze) { t.passT = Math.max(t.passT || 0, 1.5); t.x -= nx * 0.4; t.z -= nz * 0.4; }
    if (hit > 5 && !t.wreck && !graze) {
      // таран: их отбрасывает, мы теряем десятую часть хода
      fullCar(t);
      dentCar(t.mesh, hx, hz, hit);
      t.hp -= hit * 2.4;
      knockCar(t, -nx, -nz, hit);
      if (t.ramT > 0) {
        // бодает: толкает курьера туда, куда ехала
        V.vx += nx * hit * 0.7; V.vz += nz * hit * 0.7;
        S.shake = Math.max(S.shake, 0.6);
        t.ramT = 0; t.repath = 1;
        toast(pick([$t('{name} боднула!', { name: ramName() }), $t('бодание засчитано'), $t('{name}: «не благодари»', { name: ramName() })]));
      } else if (!t.parked && hit > 6 && !t.driver) t.angry = 1;     // приземлится — выйдет разбираться
      hurtCar((hit - 5) * 0.14, hit, hx, hz);
      t.hitT = 0.5;
      t.x -= nx * (need - d); t.z -= nz * (need - d);
      V.vx *= 0.9; V.vz *= 0.9;
      if (t.hp <= 0) { wreckCar(t); S.wrecks++; toast(t.taxi ? $t('минус такси') : $t('минус машина')); }
      else if (t.taxi && hit > 8) toast(pick([$t('таксист: «я по навигатору»'), $t('таксист: «куда прёшь»'), $t('оценка поездки: 1 звезда')]));
    } else if (t.parked || t.stalled) {
      // стоящую машину можно подвинуть: делим толчок пополам, и она
      // проворачивается вокруг точки, в которую упёрлись
      const push = need - d;
      t.x -= nx * push * 0.65; t.z -= nz * push * 0.65;
      V.x += nx * push * 0.35; V.z += nz * push * 0.35;
      const lx = hx - t.x, lz = hz - t.z;
      t.h += clamp((lx * -nz + lz * nx) * 0.02 * hit, -0.08, 0.08);
      V.vx -= vn * nx * 0.45; V.vz -= vn * nz * 0.45;
      t.moved = 1;
      poseOnSlope(t);
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

  // дворовая мелочь: сносится на любом ходу быстрее пешехода
  SM_T.t -= dt;
  if (Math.abs(vf) > 2.5) {
    const l = Math.hypot(V.vx, V.vz) || 1;
    smashNear(V.x, V.z, it => {
      if (Math.hypot(it.x - noseX, it.z - noseZ) < it.r + CAR_W || Math.hypot(it.x - tailX, it.z - tailZ) < it.r + CAR_W) {
        smashHit(it, V.vx / l, V.vz / l, Math.abs(vf));
        V.vx *= it.kind === 'dump' ? 0.85 : 0.96; V.vz *= it.kind === 'dump' ? 0.85 : 0.96;
      }
    });
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

  for (const p of SCOOTS) {
    if (p.dead || !underCar(p.x, p.z) || Math.abs(vf) < 3) continue;
    runOverScoot(p, V.vx, V.vz);
    S.shake = Math.max(S.shake, 0.3);
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
    toast(pick([$t('респект'), $t('плюс респект'), $t('так ему'), $t('заслужил')]));
  }

  // визуал: машина стоит на склоне — тангаж по осям, крен по бортам
  // Земля под колёсами — рельеф, мост или рампа. С верхней кромки рампы
  // машина уходит в полёт: вертикальная скорость — по уклону клина.
  const lift = rampLift(V.x, V.z);
  const gnd = surfaceAt(V.x, V.z, V.y - (V.rlift || 0)) + lift;
  if (V.air) {
    V.vy -= 22 * dt;
    V.y += V.vy * dt;
    if (V.y <= gnd) {
      if (V.vy < -7) { S.shake = Math.max(S.shake, clamp(-V.vy * 0.04, 0.2, 0.7)); sparks(V.x, 0.3, V.z, 8); Snd.crash(-V.vy); }
      V.y = gnd; V.vy = 0; V.air = false;
      V.rampSafe = 1.5;
    }
  } else if ((V.rlift || 0) > RAMP_H * 0.7 && lift < 0.2 && vf > 6) {
    // трамплин не бьёт, а подкидывает: плюс четверть скорости и полёт
    // без урона — в воздухе и ещё полторы секунды после приземления
    const boost = Math.min(1.25, (VMAX * 1.3) / Math.max(vf, 1));
    V.vx *= boost; V.vz *= boost;
    V.air = true;
    V.rampSafe = 1.5;
    V.vy = vf * boost * RAMP_H / RAMP_L * 1.15;
    V.y = V.y + V.vy * dt;
    S.shake = Math.max(S.shake, 0.15);
    Snd.nosFire();
  } else V.y = gnd;
  if (V.sink !== undefined) {
    // тонет: сначала качается на воде, потом нос вниз и ко дну
    V.sink += dt;
    V.air = false;
    V.y = Math.max(gnd, 0.1 - Math.max(0, V.sink - 0.5) * 1.1);
    V.bubT = (V.bubT || 0) - dt;
    if (V.bubT <= 0 && V.sink < 3.5) { V.bubT = 0.25; splash(V.x + rand(-1.2, 1.2), V.z + rand(-1.8, 1.8)); }
  }
  V.rlift = lift;
  if (!V.air && V.rampSafe > 0) V.rampSafe -= dt;
  let f2 = surfaceAt(V.x + fx * 1.4, V.z + fz * 1.4, V.y) + rampLift(V.x + fx * 1.4, V.z + fz * 1.4);
  let t2 = surfaceAt(V.x - fx * 1.45, V.z - fz * 1.45, V.y) + rampLift(V.x - fx * 1.45, V.z - fz * 1.45);
  let l2 = surfaceAt(V.x + sx * 0.9, V.z + sz * 0.9, V.y), r2 = surfaceAt(V.x - sx * 0.9, V.z - sz * 0.9, V.y);
  // в полёте нос идёт за траекторией, на земле — за уклоном
  if (V.sink !== undefined) { f2 = t2 + clamp(V.sink - 0.5, 0, 1) * -1.3; l2 = r2 = 0; }
  V.pitch = damp(V.pitch, V.air ? -Math.atan2(V.vy, Math.max(4, Math.abs(vf))) * 0.8 : -Math.atan((f2 - t2) / 2.85), V.air ? 4 : 12, dt);
  V.roll = damp(V.roll, V.air ? 0 : Math.atan((l2 - r2) / 1.8), 12, dt);
  // бордюр: тротуар выше дороги — заехал, и кузов стоит на нём
  V.kerb = damp(V.kerb || 0, V.air || lift > 0 ? 0 : curbAt(V.x, V.z), 22, dt);
  car.position.set(V.x, V.y + V.kerb, V.z);
  car.rotation.y = V.h;
  car.rotation.x = V.pitch;
  for (const w of car.userData.wheels) w.rotation.x = V.wheel;
  for (const s of car.userData.steer) s.rotation.y = V.steerVis;
  V.lean = damp(V.lean || 0, -V.steerVis * clamp(Math.abs(vf) / VMAX, 0, 1) * 0.12, 6, dt);
  car.rotation.z = V.roll + V.lean;

  // огонь из выхлопа, пока горит нитро
  if ((NOS.burn || beast) && (NOS.flameT -= dt) <= 0) {
    NOS.flameT = 0.03;
    nosFlame(V.x - fx * 2.35 + sx * 0.45, V.y + 0.5, V.z - fz * 2.35 + sz * 0.45, -fx, -fz);
  }

  Snd.engine(vf * (NOS.burn ? 1.12 : 1), IN.gas || NOS.burn);
  return vf;
}

/* съехал в Москву-реку: большой плюх, и смена кончается — вплавь не довезёшь */
function drown () {
  V.sink = 0;
  V.air = false; V.vy = 0;
  splash(V.x, V.z); splash(V.x + Math.sin(V.h) * 2, V.z + Math.cos(V.h) * 2);
  Snd.noise(0.6, 0.45);
  S.shake = Math.max(S.shake, 0.4);
  gameOver('утонул', [], { x: V.x, z: V.z });
}

function hurtCar (dmg, vn, hx, hz) {
  if (S.state === 'over' || S.state === 'dying' || S.state === 'title') return;
  if (V.air || V.rampSafe > 0) return;            // с трамплина — без урона
  if (FXS.shieldT > 0) { sparks(hx === undefined ? V.x : hx, 1, hz === undefined ? V.z : hz, 6); return; }
  dentCar(car, hx === undefined ? V.x : hx, hz === undefined ? V.z : hz, vn);   // мятина видна на кузове
  if (S.hurt > 0) return;
  rumble(dmg > 1 ? 0.9 : 0.6, 240);
  S.hp -= clamp(Math.round(dmg), 1, 2);
  S.hurt = 0.9;
  S.shake = Math.max(S.shake, 0.5);
  Snd.crash(vn);
  hudHearts();
  if (S.hp <= 0) {
    S.hp = 0; hudHearts();
    // своя машина рвётся сильнее чужой: людей рядом разносит, соседние
    // машины подбрасывает и поджигает — дальше они рвутся по цепочке сами
    boom(V.x, V.z, 18);
    gameOver('машина всё', [], { x: V.x, z: V.z });
  }
}

/* ─────────────── камера ─────────────── */
const camInWall = (x, z) => {
  for (const s of solidsNear(x, z)) {
    if (s.deckY !== undefined) continue;          // перила низкие, камера над ними
    const dx = x - s.cx, dz = z - s.cz;
    const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
    if (Math.abs(lx) < s.hw + 1.2 && Math.abs(lz) < s.hd + 1.2) return true;
  }
  return false;
};

/* мелочь (деревья, столбы, остановки) камеру не толкает — только дома и стены */
const camClear = (x, z) => {
  for (const s of solidsNear(x, z)) {
    if (s.deckY !== undefined || Math.max(s.hw, s.hd) < 3) continue;   // машины, деревья, столбы — не стены
    const dx = x - s.cx, dz = z - s.cz;
    const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
    if (Math.abs(lx) < s.hw + 0.9 && Math.abs(lz) < s.hd + 0.9) return false;
  }
  return !inHouse(x, z, 0.9);
};

function camStep (dt, vf) {
  // на нитро кадр расходится шире — скорость видно
  const fov = damp(cam.fov, NOS.burn ? 80 : FXS.beastT > 0 && IN.nitro ? 84 : 64, 3.5, dt);
  if (Math.abs(fov - cam.fov) > 0.02) { cam.fov = fov; cam.updateProjectionMatrix(); }
  /* Смена начинается на парковке: за спиной дом, и камера сзади упёрлась бы
     в стену. Пока машина стоит — кадр спереди-сбоку: машина и светящаяся
     пиццерия за ней. Тронулся — камера плавно уходит за спину. */
  if (V.hero) {
    if (Math.abs(vf) > 0.8 || IN.gas || IN.brake || IN.left || IN.right) V.hero = 0;
    else {
      const fx = Math.sin(V.h), fz = Math.cos(V.h), rx = Math.cos(V.h), rz = -Math.sin(V.h);
      let hx = 0, hz = 0;
      for (const side of [1, -1]) {
        hx = V.x + fx * 10 + rx * 6 * side; hz = V.z + fz * 10 + rz * 6 * side;
        if (camClear(hx, hz)) break;
      }
      V.camX = V.camX === undefined ? hx : damp(V.camX, hx, 4, dt);
      V.camZ = V.camZ === undefined ? hz : damp(V.camZ, hz, 4, dt);
      V.camY = damp(V.camY || V.y + 4, Math.max(V.y + 4.2, groundH(V.camX, V.camZ) + 2.5), 4, dt);
      V.camH = V.h; V.camPull = 0;
      cam.position.set(V.camX, V.camY, V.camZ);
      cam.lookAt(V.x - fx * 3, V.y + 1.6, V.z - fz * 3);
      return;
    }
  }
  V.camH = damp(V.camH, V.h, 4.5, dt);
  const full = 12.5 + clamp(Math.abs(vf) / VMAX, 0, 1) * 4.5;
  /* Камера упирается в дом, а не входит в него: идём от машины назад по
     линии взгляда и останавливаемся у первой стены. Чем ближе пришлось
     подойти, тем выше камера поднимается и смотрит на машину сверху —
     так её и улицу видно даже в узком проезде. Подходит к стене быстро,
     отходит обратно плавно. */
  const sx = Math.sin(V.camH), sz = Math.cos(V.camH);
  let back = full;
  for (let d = 2; d <= full; d += 0.75) if (!camClear(V.x - sx * d, V.z - sz * d)) { back = Math.max(2.5, d - 1.4); break; }
  const pull = full - back;
  V.camPull = damp(V.camPull || 0, pull, pull > (V.camPull || 0) ? 18 : 2.5, dt);
  const eff = full - V.camPull;
  const tx = V.x - sx * eff, tz = V.z - sz * eff;
  V.camX = damp(V.camX, tx, 9, dt);
  V.camZ = damp(V.camZ, tz, 9, dt);
  // отстающая камера всё равно могла оказаться в стене — тогда сразу на место
  if (!camClear(V.camX, V.camZ)) { V.camX = tx; V.camZ = tz; }
  // камера висит над машиной, но не ниже горки у себя за спиной; у стены — выше
  const want = Math.max(V.y + 6.2 + V.camPull * 0.6, groundH(V.camX, V.camZ) + 3);
  V.camY = damp(V.camY, want, 6, dt);
  const sh = S.shake;
  cam.position.set(V.camX + (sh ? rand(-sh, sh) : 0), V.camY + (sh ? rand(-sh, sh) : 0), V.camZ);
  // смотрим туда, куда едем: под гору взгляд опускается вместе с дорогой
  const ax = V.x + Math.sin(V.h) * 7, az = V.z + Math.cos(V.h) * 7;
  cam.lookAt(ax, lerp(V.y, surfaceAt(ax, az, V.y), 0.6) + 2.2, az);
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
  // Томь на радаре: без неё непонятно, где мост
  rctx.fillStyle = '#6fb0c9';
  const st = 9, half = st * s * 0.8;
  for (let dx = -144; dx <= 144; dx += st)
    for (let dz = -144; dz <= 144; dz += st) {
      const wx = Math.round((V.x + dx) / st) * st, wz = Math.round((V.z + dz) / st) * st;
      if (groundH(wx, wz) >= 0) continue;
      const [a, b] = tr(wx, wz);
      rctx.fillRect(a - half, b - half, half * 2, half * 2);
    }
  rctx.strokeStyle = '#9aa0ab'; rctx.lineCap = 'butt';
  const ci = Math.floor(V.x / RCELL), cj = Math.floor(V.z / RCELL);
  const shown = new Set();
  for (let i = ci - 3; i <= ci + 3; i++)
    for (let j = cj - 3; j <= cj + 3; j++) {
      const cell = ROAD_GRID.get(i + ',' + j);
      if (!cell) continue;
      for (const k of cell) {
        if (shown.has(k)) continue;
        shown.add(k);
        const sg = RSEG[k];
        if (sg.c > DRIVE_MAX + 2) continue;
        rctx.lineWidth = Math.max(1.4, sg.w * s);
        const [x1, y1] = tr(sg.x1, sg.z1), [x2, y2] = tr(sg.x2, sg.z2);
        rctx.beginPath(); rctx.moveTo(x1, y1); rctx.lineTo(x2, y2); rctx.stroke();
      }
    }
  RL.drawRadar(rctx, tr, s);                        // пробки — красным
  // проложенный маршрут
  if (routePts.length > 1) {
    rctx.strokeStyle = '#ff8a2b'; rctx.lineWidth = 3; rctx.lineJoin = 'round';
    rctx.beginPath();
    routePts.forEach((p, i) => { const [a, b] = tr(p[0], p[1]); i ? rctx.lineTo(a, b) : rctx.moveTo(a, b); });
    rctx.stroke();
  }
  // за краем карты — затемнение: туда не проехать
  {
    const [ax, ay] = tr(BOUNDS.x0, BOUNDS.z0), [bx, by] = tr(BOUNDS.x1, BOUNDS.z0);
    const [cx, cy] = tr(BOUNDS.x1, BOUNDS.z1), [dx, dy] = tr(BOUNDS.x0, BOUNDS.z1);
    rctx.fillStyle = 'rgba(45, 38, 58, 0.45)';
    rctx.beginPath();
    rctx.rect(-R, -R, R * 2, R * 2);
    rctx.moveTo(ax, ay); rctx.lineTo(bx, by); rctx.lineTo(cx, cy); rctx.lineTo(dx, dy); rctx.closePath();
    rctx.fill('evenodd');
  }
  // пиццерия всегда видна, цель — кружком
  const blip = (wx, wz, hex, size) => {
    let [a, b] = tr(wx, wz);
    const len = Math.hypot(a, b);
    if (len > R - 7) { a *= (R - 7) / len; b *= (R - 7) / len; }
    rctx.fillStyle = hex; rctx.fillRect(a - size, b - size, size * 2, size * 2);
  };
  if (PIZZA) blip(PIZZA.x, PIZZA.z, '#ffffff', 3.4);
  for (const c of DRINKITS) blip(c.cx, c.cz, '#2f6fff', 3.2);
  if (THIEF.p && Math.floor(tG * 4) % 2 === 0) blip(THIEF.p.x, THIEF.p.z, '#ff2d6e', 3.6);
  if (S.target) blip(S.target.x, S.target.z, '#f0522a', 4);
  // находки — фиолетовые, мерцают и пульсируют кольцом (colPing)
  for (const o of COL_ON_MAP) {
    const [a, b] = tr(o.x, o.z);
    if (Math.hypot(a, b) < R - 5) colPing(rctx, a, b, 1.3, o.ph);
  }
  // кофе и бонусы — только те, что в пределах радара
  for (const n of NITRO_CANS) {
    if (n.t > 0) continue;
    rctx.fillStyle = PICK_HEX[n.kind];
    const [a, b] = tr(n.x, n.z);
    if (Math.hypot(a, b) < R - 4) rctx.fillRect(a - 2, b - 2, 4, 4);
  }
  for (const t of TRAFFIC) blip(t.x, t.z, t.dot || '#5b6b80', t.dot ? 3 : 2);
  rctx.fillStyle = '#fff'; rctx.strokeStyle = '#33210c'; rctx.lineWidth = 1.4;
  rctx.beginPath();
  rctx.moveTo(0, -6.4); rctx.lineTo(4.6, 5.4); rctx.lineTo(0, 2.8); rctx.lineTo(-4.6, 5.4);
  rctx.closePath(); rctx.fill(); rctx.stroke();
  rctx.restore();
}

/* ─────────────── полная карта района ───────────────
   Радар показывает сотню метров вокруг. По клику на него (или Tab,
   или кнопке «карта») раскрывается весь район: подложка рисуется один
   раз после сборки города, а поверх — где ты, пиццерия, заказ,
   маршрут, светофоры в текущей фазе, машины и баллоны нитро. Пока
   карта открыта, игра стоит. */
const elFull = $('fullmap'), fullC = $('fullmapc'), fctx = fullC.getContext('2d');
const FM = { base: null, s: 1, pad: 40, open: false };
const fmX = x => (x - BOUNDS.x0 + FM.pad) * FM.s, fmZ = z => (z - BOUNDS.z0 + FM.pad) * FM.s;

function buildFullMap () {
  const W = BOUNDS.x1 - BOUNDS.x0 + FM.pad * 2, D = BOUNDS.z1 - BOUNDS.z0 + FM.pad * 2;
  FM.s = Math.min(2, (matchMedia('(pointer: coarse)').matches ? 2200 : 1400) / Math.max(W, D));   // на телефоне карту смотрят крупно
  const c = document.createElement('canvas');
  c.width = Math.round(W * FM.s); c.height = Math.round(D * FM.s);
  const x = c.getContext('2d');
  const poly = (p, fill) => {
    x.beginPath();
    p.forEach((q, i) => (i ? x.lineTo(fmX(q[0]), fmZ(q[1])) : x.moveTo(fmX(q[0]), fmZ(q[1]))));
    x.closePath(); x.fillStyle = fill; x.fill();
  };
  const line = (p, w, col) => {
    x.beginPath();
    p.forEach((q, i) => (i ? x.lineTo(fmX(q[0]), fmZ(q[1])) : x.moveTo(fmX(q[0]), fmZ(q[1]))));
    x.lineWidth = w * FM.s; x.strokeStyle = col; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke();
  };
  x.fillStyle = '#a6d189'; x.fillRect(0, 0, c.width, c.height);
  // река — по урезу рельефа, клетками сетки высот
  x.fillStyle = '#6fb0c9';
  for (let j = 0; j < TNZ; j++)
    for (let i = 0; i < TNX; i++) {
      if (TH[j * TNX + i] >= 0) continue;
      x.fillRect(fmX(TX0 + i * TG - TG / 2), fmZ(TZ0 + j * TG - TG / 2), TG * FM.s + 1, TG * FM.s + 1);
    }
  for (const l of CITY.lots) poly(l.p, l.k === 'park' ? '#a6abb3' : '#c6c5b8');
  for (const g of CITY.green) poly(g.p, GREEN_HEX[g.k] || '#95c579');
  for (const q of CITY.paths) line(q, 1.6, '#ddd5c6');
  for (const r of CITY.roads) line(r.p, SIDEWALK(r), '#e3ded4');
  for (const r of CITY.roads) line(r.p, roadWidth(r), r.b ? '#8c8680' : ROAD_HEX[r.c]);
  x.fillStyle = '#f2efe6';
  for (const zb of ZEBRAS) {
    x.save(); x.translate(fmX(zb.x), fmZ(zb.z)); x.rotate(Math.atan2(zb.uz, zb.ux));
    x.fillRect(-ZW / 2 * FM.s, -zb.w / 2 * FM.s, ZW * FM.s, zb.w * FM.s);
    x.restore();
  }
  for (const b of CITY.buildings) {
    poly(b.p, KIND_WALL[b.k] || '#e7b9a6');
    x.lineWidth = 1; x.strokeStyle = 'rgba(80, 50, 60, 0.55)'; x.stroke();
  }
  // подписи главных улиц — по разу на название, у середины самого длинного куска
  const named = new Map();
  for (const r of CITY.roads) {
    if (!r.n || r.c > 4 || r.x) continue;
    let len = 0;
    for (let i = 1; i < r.p.length; i++) len += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
    if (!named.has(r.n) || named.get(r.n).len < len) named.set(r.n, { r, len });
  }
  x.font = 'bold ' + Math.round(9 * FM.s) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const [n, { r }] of named) {
    const i = Math.max(1, (r.p.length / 2) | 0), a = r.p[i - 1], b = r.p[i];
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
    x.save(); x.translate(fmX((a[0] + b[0]) / 2), fmZ((a[1] + b[1]) / 2)); x.rotate(ang);
    const nn = translit(n);
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,0.8)'; x.strokeText(nn, 0, 0);
    x.fillStyle = '#3a3345'; x.fillText(nn, 0, 0);
    x.restore();
  }
  // железная дорога: тёмная линия со шпалами-штрихами
  for (const r of CITY.rails || []) {
    x.beginPath(); r.p.forEach(([a, b], i) => (i ? x.lineTo(fmX(a), fmZ(b)) : x.moveTo(fmX(a), fmZ(b))));
    x.lineWidth = Math.max(2, 2.4 * FM.s); x.strokeStyle = '#5e5660'; x.setLineDash([]); x.stroke();
    x.lineWidth = Math.max(1, 1.2 * FM.s); x.strokeStyle = '#e9e4da'; x.setLineDash([4 * FM.s, 4 * FM.s]); x.stroke();
    x.setLineDash([]);
  }
  // граница-многоугольник: всё за забором затемняем, забор — линией
  if (BORDER) {
    x.save();
    x.beginPath(); x.rect(0, 0, c.width, c.height);
    BORDER.forEach(([bx, bz], i) => (i ? x.lineTo(fmX(bx), fmZ(bz)) : x.moveTo(fmX(bx), fmZ(bz))));
    x.closePath();
    x.fillStyle = 'rgba(45, 38, 58, 0.5)'; x.fill('evenodd');
    x.lineWidth = Math.max(2, 2 * FM.s); x.strokeStyle = '#8a8478'; x.stroke();
    x.restore();
    for (const k of CITY.kpp || []) { x.fillStyle = '#1f4f9a'; x.fillRect(fmX(k.p[0]) - 5, fmZ(k.p[1]) - 5, 10, 10); }
  }
  // за рамкой не проехать — затемняем
  x.fillStyle = 'rgba(45, 38, 58, 0.45)';
  x.fillRect(0, 0, c.width, FM.pad * FM.s); x.fillRect(0, c.height - FM.pad * FM.s, c.width, FM.pad * FM.s);
  x.fillRect(0, 0, FM.pad * FM.s, c.height); x.fillRect(c.width - FM.pad * FM.s, 0, FM.pad * FM.s, c.height);
  FM.base = c;
  fullC.width = c.width; fullC.height = c.height;
}

/* Метка находки на карте: фиолетовая точка мерцает, от неё расходится
   кольцо. Часы свои — полная карта рисуется, пока игра стоит. */
function colPing (x, a, b, s, ph) {
  const t = performance.now() / 1000 + ph;
  const k = (t * 1.1) % 1;                              // кольцо: растёт и тает
  x.save();
  x.globalAlpha = (1 - k) * 0.9;
  x.strokeStyle = '#c56cff'; x.lineWidth = 2 * s;
  x.beginPath(); x.arc(a, b, (4 + k * 10) * s, 0, Math.PI * 2); x.stroke();
  x.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 5));   // мерцание
  x.fillStyle = '#b44dff';
  x.beginPath(); x.arc(a, b, (3.2 + Math.sin(t * 5) * 0.9) * s, 0, Math.PI * 2); x.fill();
  x.globalAlpha = 1;
  x.lineWidth = 1; x.strokeStyle = '#f0d8ff'; x.stroke();
  x.restore();
}

function drawFullMap () {
  if (!FM.base) return;
  const x = fctx, s = FM.s;
  // метки «ты / пиццерия / заказ» — в экранных пикселях: на большом городе
  // масштаб мелкий, и стрелка в размер улицы терялась в точку
  const u = Math.max(s, fullC.width / Math.max(1, fullC.clientWidth));
  x.drawImage(FM.base, 0, 0);
  RL.drawMap(x, fmX, fmZ, s);                       // пробки — красным
  if (routePts.length > 1) {
    x.beginPath();
    routePts.forEach((p, i) => (i ? x.lineTo(fmX(p[0]), fmZ(p[1])) : x.moveTo(fmX(p[0]), fmZ(p[1]))));
    x.lineWidth = 4 * s; x.strokeStyle = '#ff8a2b'; x.lineJoin = 'round'; x.stroke();
  }
  for (const g of SIG_GROUPS) {
    const st = lightOf(0);
    x.fillStyle = st === 'g' ? '#3fd15e' : st === 'y' ? '#ffc63d' : '#e8323c';
    x.beginPath(); x.arc(fmX(g.x), fmZ(g.z), 4 * s, 0, Math.PI * 2); x.fill();
    x.lineWidth = 1.5; x.strokeStyle = '#33210c'; x.stroke();
  }
  for (const n of NITRO_CANS) {
    if (n.t > 0) continue;
    x.fillStyle = PICK_HEX[n.kind];
    x.fillRect(fmX(n.x) - 3.5 * s, fmZ(n.z) - 3.5 * s, 7 * s, 7 * s);
  }
  for (const t of TRAFFIC) {
    x.fillStyle = t.dot || (t.taxi ? '#ffc400' : '#5b6b80');
    x.fillRect(fmX(t.x) - 3.5 * s, fmZ(t.z) - 3.5 * s, 7 * s, 7 * s);
  }
  for (const o of COL_ON_MAP) colPing(x, fmX(o.x), fmZ(o.z), s * 2.8, o.ph);
  for (const c of DRINKITS) {
    x.fillStyle = '#2f6fff'; x.fillRect(fmX(c.cx) - 6 * s, fmZ(c.cz) - 6 * s, 12 * s, 12 * s);
    x.lineWidth = 2; x.strokeStyle = '#fff'; x.strokeRect(fmX(c.cx) - 6 * s, fmZ(c.cz) - 6 * s, 12 * s, 12 * s);
  }
  if (PIZZA) {
    x.fillStyle = '#f0522a'; x.fillRect(fmX(PIZZA.x) - 5 * u, fmZ(PIZZA.z) - 5 * u, 10 * u, 10 * u);
    x.lineWidth = 1.5 * u; x.strokeStyle = '#fff'; x.strokeRect(fmX(PIZZA.x) - 5 * u, fmZ(PIZZA.z) - 5 * u, 10 * u, 10 * u);
  }
  if (S.target) {
    x.fillStyle = '#ff2d6e';
    x.beginPath(); x.arc(fmX(S.target.x), fmZ(S.target.z), 6 * u, 0, Math.PI * 2); x.fill();
    x.lineWidth = 1.5 * u; x.strokeStyle = '#fff'; x.stroke();
  }
  if (MAPW.MAP_DOTS.length) MAPW.drawMapDots(x, fmX, fmZ, s);      // ?mapcheck: проблемы карты
  // ты — крупная стрелка по курсу с пульсирующим кольцом: видно сразу на всей карте
  const px = fmX(V.x), pz = fmZ(V.z), pulse = (performance.now() / 900) % 1;
  x.beginPath(); x.arc(px, pz, (12 + pulse * 16) * u, 0, Math.PI * 2);
  x.lineWidth = 3 * u; x.strokeStyle = 'rgba(255, 216, 94, ' + (1 - pulse).toFixed(2) + ')'; x.stroke();
  x.beginPath(); x.arc(px, pz, 11 * u, 0, Math.PI * 2);
  x.fillStyle = 'rgba(51, 33, 12, .55)'; x.fill();
  x.save(); x.translate(px, pz); x.rotate(-V.h + Math.PI);
  x.beginPath(); x.moveTo(0, -13 * u); x.lineTo(9 * u, 10 * u); x.lineTo(0, 4 * u); x.lineTo(-9 * u, 10 * u); x.closePath();
  x.fillStyle = '#ffd85e'; x.fill(); x.lineWidth = 2 * u; x.lineJoin = 'round'; x.strokeStyle = '#33210c'; x.stroke();
  x.restore();
}

/* чем дерутся в кофейной войне: в мягком режиме (Яндекс) — подушками,
   иначе битами. Подушка — белый пухлый брусок, не оружие */
function warStick (hex) {
  if (ADULT) return new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.95), new THREE.MeshLambertMaterial({ color: hex }));
  return new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.62), new THREE.MeshLambertMaterial({ color: 0xf4f1ea }));
}

function setFullMap (on) {
  FM.open = on;
  elFull.hidden = !on;
  if (isPlaying() && !S.paused) { if (on) Platform.gameplayStop(); else Platform.gameplayStart(); }
  if (on) {
    for (const k in IN) IN[k] = 0; touches.clear(); Snd.engine(0); drawFullMap();
    // телефон: карта крупнее экрана — ставим так, чтобы ты был посередине
    const view = elFull.querySelector('.fm-view');
    if (view && view.scrollWidth > view.clientWidth + 2) {
      const k = fullC.clientWidth / fullC.width;
      view.scrollLeft = fmX(V.x) * k - view.clientWidth / 2;
      view.scrollTop = fmZ(V.z) * k - view.clientHeight / 2;
    }
  }
}
$('radar').addEventListener('click', () => setFullMap(true));
{ const t = document.querySelector('.fm-top b'); if (t) { t.removeAttribute('data-i18n'); t.textContent = $t(MAP.title); } }
$('mapbtn').addEventListener('click', () => setFullMap(!FM.open));
elFull.addEventListener('click', () => setFullMap(false));

/* ─────────────── подсказки новичку ───────────────
   Стрелка над машиной — пока не доставлен самый первый заказ: большая,
   оранжевая, показывает, куда поворачивать по маршруту. Гайд по
   управлению — один раз за сессию, когда впервые поехал, по пунктам. */
const ARROW = (() => {
  const g = new THREE.Group();
  // объёмная стрелка: толстая, со скруглённой фаской, со светом и тенью.
  // Контур — та же геометрия чуть крупнее, вывернутая наизнанку
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.7); shape.lineTo(1.35, 0.15); shape.lineTo(0.5, 0.15); shape.lineTo(0.5, -1.35);
  shape.lineTo(-0.5, -1.35); shape.lineTo(-0.5, 0.15); shape.lineTo(-1.35, 0.15); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.5, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.12, bevelSegments: 3, curveSegments: 4,
  });
  geo.translate(0, 0, -0.25);                        // толщина — симметрично вокруг середины
  geo.rotateX(Math.PI / 2);                          // лёжа: остриё вперёд, по +z
  geo.computeVertexNormals();
  const fill = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xff8a2b, emissive: 0x7a2c00 }));
  const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x33210c, side: THREE.BackSide }));
  edge.scale.setScalar(1.08);
  // остриё приподнято к камере: плашмя со спины стрелку не прочитать
  const tilt = new THREE.Group();
  tilt.rotation.x = -0.95;
  tilt.scale.setScalar(1.15);
  tilt.add(edge, fill);
  g.add(tilt);
  g.visible = false;
  scene.add(g);
  return g;
})();

function updateArrow (dt) {
  const on = !tutDone() && !S.ride && (S.state === 'drive' || S.state === 'back') && routePts.length > 1;
  ARROW.visible = on;
  if (!on) return;
  // точка маршрута метрах в двенадцати впереди — на неё и смотрим
  let tx = routePts[routePts.length - 1][0], tz = routePts[routePts.length - 1][1], acc = 0;
  for (let i = 1; i < routePts.length; i++) {
    const [ax, az] = routePts[i - 1], [bx, bz] = routePts[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (acc + l >= 12) { const k = (12 - acc) / (l || 1); tx = lerp(ax, bx, k); tz = lerp(az, bz, k); break; }
    acc += l;
  }
  const want = Math.atan2(tx - V.x, tz - V.z);
  const cur = ARROW.rotation.y;
  ARROW.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * (1 - Math.exp(-8 * dt));
  ARROW.position.set(V.x, V.y + 4.6 + Math.sin(tG * 4) * 0.2, V.z);
}

/* бонус за скорость — крупно по центру, на секунду-другую */
const elBonus = $('bonus');
let bonusT = 0;
function popBonus (title, sub) {
  elBonus.innerHTML = '<b>' + title + '</b><span>' + sub + '</span>';
  elBonus.classList.remove('on'); void elBonus.offsetWidth; elBonus.classList.add('on');
  clearTimeout(bonusT);
  bonusT = setTimeout(() => elBonus.classList.remove('on'), 4000);
  Snd.coin();
}

/* Гайд по управлению — один раз за всё время: сразу после «поехали» или
   «просто покататься». Висит, пока не тронешься, и ещё десять секунд
   после — или пока не кликнешь. */
const GUIDE = { on: false, t: 0 };
function showGuide () {
  if (Store.get('dlv-msk-guide')) return;
  Store.set('dlv-msk-guide', 1);
  $('guide').hidden = false;
  GUIDE.on = true; GUIDE.t = 10;
}
function updateGuide (dt) {
  if (!GUIDE.on) return;
  // отсчёт — только когда уже едешь
  if (S.state === 'drive' && Math.hypot(V.vx, V.vz) > 2) GUIDE.t -= dt;
  if (GUIDE.t <= 0 || S.state === 'over' || S.state === 'title') { GUIDE.on = false; $('guide').hidden = true; }
}
$('guide').addEventListener('click', () => { GUIDE.on = false; $('guide').hidden = true; });

/* ─────────────── хад ─────────────── */
const elHearts = $('hearts'), elMoney = $('money'), elTask = $('task'), elAddr = $('addr'),
      elDist = $('dist'), elTimeBar = $('timebar'), elTimeWrap = $('timewrap'),
      elBurgers = $('burgers'), elSpeed = $('speed'), elToast = $('toast'),
      elBig = $('big'), elBigT = $('big-t'), elBigS = $('big-s'), elBigK = $('big-k');

function hudHearts () {
  let s = '';
  for (let i = 0; i < S.hpMax; i++) s += '<i' + (i < S.hp ? '' : ' class="off"') + '></i>';
  elHearts.innerHTML = s;
}

const elNitro = $('nitro'), elNitroBar = $('nitrobar'), elFx = $('fxs'), elRadarBox = $('radar');
const TOUCH_NOS = document.querySelector('#touchpad .tp-nos');
let toastT = 0;
function toast (t) { t = String(t || ""); if (!t) return; elToast.textContent = t; elToast.style.opacity = 1; toastT = Math.max(1.6, t.length / 18); }

function hudStep (dt) {
  elMoney.textContent = money(S.money);
  touchpadStep();
  const es = $('endshift'), showEs = isPlaying() && !S.ride;
  if (es.hidden === showEs) es.hidden = !showEs;
  if (showEs) { const tt = fmtTime(S.shiftT); if ($('shift-t').textContent !== tt) $('shift-t').textContent = tt; }
  elBurgers.innerHTML = [S.burgers ? $t('респект {n}', { n: S.burgers }) : '', S.people ? $t('сбито {n}', { n: S.people }) : '',
    S.scoots ? $t('самокатов {n}', { n: S.scoots }) : '', S.wrecks ? $t('всмятку {n}', { n: S.wrecks }) : ''].filter(Boolean).join('<br>');
  elSpeed.textContent = $t('{n} км/ч', { n: Math.round(Math.hypot(V.vx, V.vz) * 3.6) });
  elNitroBar.style.width = (NOS.tank * 100) + '%';
  elNitro.classList.toggle('burn', NOS.burn);
  // нитро — кольцом вокруг радара
  const nv = NOS.tank.toFixed(3);
  if (elRadarBox.style.getPropertyValue('--nos') !== nv) elRadarBox.style.setProperty('--nos', nv);
  elRadarBox.classList.toggle('burn', NOS.burn);
  if (TOUCH_NOS) {                                   // на телефоне бак — кольцом по краю кнопки нитро
    if (TOUCH_NOS.style.getPropertyValue('--nos') !== nv) TOUCH_NOS.style.setProperty('--nos', nv);
    TOUCH_NOS.classList.toggle('burn', NOS.burn);
  }
  const fx = [FXS.shieldT > 0 ? $t('щит {n}', { n: Math.ceil(FXS.shieldT) }) : '', FXS.beastT > 0 ? $t('бист-мод {n}', { n: Math.ceil(FXS.beastT) }) : ''].filter(Boolean).join(' · ');
  if (elFx.textContent !== fx) elFx.textContent = fx;
  if (toastT > 0 && (toastT -= dt) <= 0) elToast.style.opacity = 0;
  if (phoneT > 0 && (phoneT -= dt) <= 0) hidePhone();

  const on = S.state === 'drive' || S.state === 'back' || S.state === 'handover' || S.state === 'side';
  elTimeWrap.style.visibility = on ? 'visible' : 'hidden';
  if (on && S.ride) {
    elTimeWrap.style.visibility = 'hidden';
    elTask.textContent = $t('просто катаюсь');
    elAddr.innerHTML = '<span class="sub">' + $t('без заказов и рекордов · esc — в меню') + '</span>';
    elDist.textContent = '';
  } else if (on && S.target) {
    const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
    const o = S.order;
    elTask.textContent = S.state === 'back' ? $t('в пиццерию')
      : $t('заказ {n}', { n: S.orders }) + (o && o.stops.length > 1 ? ' · ' + $t('{i} из {n}', { i: o.idx + 1, n: o.stops.length }) : '');
    elAddr.innerHTML = S.state === 'back' ? (PIZZA ? PIZZA.name.toLowerCase() : '')
      : S.addr + (S.addrLine ? '<br><span class="sub">' + S.addrLine + '</span>' : '');
    elDist.textContent = $t('{n} м', { n: Math.round(d) });
    const t = S.free ? 1 : clamp(S.time / S.timeMax, 0, 1);
    elTimeBar.style.width = (t * 100) + '%';
    elTimeBar.style.background = t > 0.4 ? '#ffd85e' : (t > 0.18 ? '#ff9a3c' : '#ff4d5e');
    elTimeBar.classList.toggle('free', S.free);
  } else { elTask.textContent = ''; elAddr.textContent = ''; elDist.textContent = ''; }
}


function showBig (title, sub, keys, go) {
  $('over').hidden = true;
  elBig.hidden = false;
  elBigT.textContent = title;
  elBigS.innerHTML = sub;
  elBigK.innerHTML = keys;
  $('lb-wrap').hidden = true;
  elGo.textContent = go || $t('поехали');
  elName.value = S.name;
  syncGo();
  closePanel();
  renderProfile();
  Platform.gameplayStop();
}

/* Профиль на заставке: уровень цифрой в кружке, имя, место в таблице и
   кошелёк, полоска — сколько осталось до следующего уровня */
function renderProfile () {
  const xp = getXP(), l = levelOf(xp);
  $('pf-lvl').textContent = l;
  $('pf-lvl').title = $t('уровень курьера {n}', { n: l });
  $('pf-name').textContent = S.name || Platform.player.name || $t('курьер');
  const mine = (LB.cache || []).find(r => r.me);
  $('pf-rank').textContent = (mine ? $t('#{n} в таблице', { n: mine.rank }) + ' · ' : '') + money(wallet()) + ' · ' + SEAS.seasonName();
  const lo = LVL_AT[l], hi = LVL_AT[l + 1];
  $('pf-xp').style.width = (l >= 5 ? 100 : Math.round(clamp((xp - lo) / (hi - lo), 0, 1) * 100)) + '%';
  $('pf-xp').parentElement.title = l < 5 ? $tn(hi - xp, 'до следующего {n} заказ|до следующего {n} заказа|до следующего {n} заказов') : $t('максимальный');
}

/* Имя — сразу на заставке: большое поле и «поехали», которая оживает,
   как только имя вписано. Под ним смена сама пишется в таблицу. */
const elName = $('st-name'), elGo = $('st-go'), elNote = $('st-note2');
function syncGo () { elGo.disabled = Platform.features.nameInput && !elName.value.trim(); }
elName.addEventListener('input', () => {
  syncGo();
  S.name = elName.value.trim();
  Store.set('dlv-name', S.name);
  renderProfile();
});
for (const ev of ['keydown', 'keyup', 'keypress']) elName.addEventListener(ev, e => e.stopPropagation());
$('start').addEventListener('submit', e => {
  e.preventDefault();
  if (Platform.features.nameInput && !elName.value.trim()) { elName.focus(); return; }
  S.name = Platform.features.nameInput ? elName.value.trim() : (Platform.player.name || '');
  elName.blur();
  Snd.boot(); Snd.resume();
  goRun();
});
/* «ещё раз» после смены — естественная пауза: здесь реклама (если пора) */
function goRun () {
  if (S.state === 'over' && Platform.features.ads && (S.delivered || 0) > 0) { S.state = 'title'; $('over').hidden = true; showAd().then(() => startRun()); }
  else startRun();
}
const hideBig = () => { elBig.hidden = true; $('over').hidden = true; };
const hideOver = hideBig;
$('ov-again').addEventListener('click', () => { Snd.boot(); Snd.resume(); goRun(); });
$('ov-menu').addEventListener('click', () => { S.state = 'title'; $('over').hidden = true; showTitle(); });

/* время смены: 12:34 */
const fmtTime = sec => { sec = Math.max(0, Math.floor(sec || 0)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); };
$('endshift').addEventListener('click', e => { e.currentTarget.blur(); if (isPlaying() && !S.ride) endShift(); });

/* ── конец смены ──
   Отдельный экран, а не простыня текста: крупно — чем кончилось
   («ты проиграл» или «смена закончена»), строкой — почему, дальше цифры
   смены набегают по очереди. Внизу — «ещё раз» и «в меню». */
const OVER_WHY = {
  'не доставил': victims => $t(GORE_ON ? N_('вместо пиццы ты задавил {who}') : N_('вместо пиццы ты сбил {who}'), { who: victims.map(accName).join(', ') }),
  'машина всё': () => $t('машина разбита — кончились сердца'),
  'утонул': () => $t('машина ушла под воду — вплавь не довезёшь'),
  'не успел': () => $t('заказ протух — клиент не дождался'),
  'смена окончена': () => $t('ты сам закончил смену — результат сохранён'),
};
function countUp (el, to, fmt, ms) {
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}
function showOver (why, victims) {
  Platform.store.flush && Platform.store.flush();       // итоги смены — в облако сразу
  Platform.gameplayStop();
  const best = S.money > S.best;
  if (best) { S.best = S.money; Store.set('dlv-msk-best', String(S.money)); }
  elBig.hidden = true;
  closePanel();
  const lost = why !== 'смена окончена';
  $('ov-t').textContent = lost ? $t('ты проиграл') : $t('смена закончена');
  $('ov-t').classList.toggle('win', !lost);
  $('ov-why').textContent = (OVER_WHY[why] || (() => $t(OVER_TITLE[why] || why)))(victims || []);
  const place = RIVALS.length ? rivalBoard().findIndex(r => r.me) + 1 : 0, nCour = RIVALS.length + 1;
  const rows = [
    [$t('заработано'), S.money, money, true],
    [$t('доставлено заказов'), S.delivered, n => String(Math.round(n))],
    [$t('время смены'), S.shiftT || 0, fmtTime],
    place ? [$t('место среди курьеров'), place, n => $t('{i} из {n}', { i: Math.max(1, Math.round(n)), n: nCour })] : null,
    [$t('респектов'), S.burgers, n => String(Math.round(n))],
    [$t('прохожих сбито'), S.people, n => String(Math.round(n))],
    [$t('машин всмятку'), S.wrecks, n => String(Math.round(n))],
  ].filter(Boolean);
  const box = $('ov-stats');
  box.innerHTML = rows.map((r, i) => '<div class="ov-row' + (r[3] ? ' big' : '') + '" data-i="' + i + '"><span>' + r[0] + '</span><b>' + r[2](0) + '</b></div>').join('');
  rows.forEach((r, i) => setTimeout(() => {
    const row = box.children[i];
    if (!row) return;
    row.classList.add('on');
    countUp(row.querySelector('b'), r[1], r[2], 700);
    if (r[1]) Snd.blip(700 + i * 90, 0.06, 'square', 0.06);
  }, 250 + i * 320));
  $('ov-best').textContent = best && S.money > 0 ? $t('лучшая смена!') : S.best ? $t('твой рекорд {money}', { money: money(S.best) }) : '';
  $('over').hidden = false;
  overExtras();
  LB.render(S.money);
  // смена сама пишется в таблицу; без времени любой бы собрал миллион —
  // такие не идут. ?nolb — прогоны при проверке: ничего не пишем
  elNote.classList.remove('bad');
  if (new URLSearchParams(location.search).has('nolb')) elNote.textContent = $t('проверочный прогон — в таблицу не пишется');
  else if (S.freeRun) elNote.textContent = $t('просто катались — в таблицу не пишется');
  else if (S.money <= 0) elNote.textContent = '';
  else {
    elNote.textContent = $t('записываю смену в таблицу рекордов…');
    const run = { name: S.name, money: S.money, delivered: S.delivered, people: S.people, ts: Date.now(), lv: levelOf(getXP()) };
    LB.save(run).then(ok => {
      elNote.classList.toggle('bad', !ok);
      elNote.textContent = ok ? $t('смена в таблице рекордов') : $t('не записалось — нет связи с таблицей');
      if (ok && Platform.id === 'yandex' && !Platform.player.authorized) elNote.textContent = $t('войди в Яндекс, чтобы попасть в общую таблицу');
      LB.render(S.money);
    });
  }
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
   Таблица — площадки: в Яндексе это их лидерборд (имя и место из профиля
   игрока), в Стиме и локально — лучшие смены на этом устройстве. Сама игра
   знает только Platform.leaderboard: submit, top и mine. */

const LB = {
  cache: null,
  async load () {
    try { this.cache = await Platform.leaderboard.top(10); }
    catch (e) { console.warn('[leaderboard] top:', e); if (!this.cache) this.cache = []; }
    return this.cache;
  },
  async save (r) {
    let ok = false;
    try { ok = await Platform.leaderboard.submit(r.money, { name: r.name, delivered: r.delivered, level: r.lv }); }
    catch (e) { console.warn('[leaderboard] submit:', e); }
    await this.load();
    return ok !== false;
  },
  render (myMoney) {
    const list = this.cache || [];
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = list.slice(0, 10).map((r, i) =>
      '<li' + (r.me ? ' class="me"' : '') + '>' +
      '<b>' + (r.rank || i + 1) + '</b>' + (r.level ? '<em class="lv" title="' + esc($t('уровень курьера')) + '">' + r.level + '</em>' : '<em class="lv none"></em>') +
      '<span>' + esc(r.name || $t('курьер')) + '</span><i>' + money(r.score) + '</i></li>').join('')
      || '<li class="empty">' + $t('пока пусто — съезди смену, и ты первый') + '</li>';
    $('lb-list').innerHTML = html;
    $('board-list').innerHTML = html;
    const place = list.findIndex(r => r.score <= myMoney);
    const line = myMoney > 0 && place !== -1 ? $t('это {n}-е место в таблице', { n: place + 1 }) : '';
    $('lb-place').textContent = line;
    const mine = list.find(r => r.me);
    $('board-me').textContent = line || (mine ? $t('ты — {n}-й, {money}', { n: mine.rank, money: money(mine.score) }) : '');
  },
};
LB.load().then(() => { LB.render(0); if (!elBig.hidden) renderProfile(); }).catch(() => {});

/* ─────────────── умный трекер: кто, что и почему ───────────────
   Заказы назначает трекер: сам решает, кого объединить в один
   маршрут, и объясняет своё решение прямо в карточке. Везём не
   в дом, а живому коллеге, который в этот момент идёт по улице. */

const PIZZAS = [$t('пепперони'), $t('маргарита'), $t('четыре сыра'), $t('мясная'), $t('гавайская'),
                $t('птичий микс'), $t('ветчина и сыр'), $t('диабло'), $t('карбонара')];
const SOLO_WHY = [
  $t('один адрес, ближе никого не нашлось'),
  $t('срочный: ждёт дольше всех'),
  $t('по пути от пиццерии'),
  $t('повторный заказ, клиент лояльный'),
];

let GATE = null;

function clearGate () {
  if (!GATE) return;
  dropMesh(GATE.grp);
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
  grp.position.set(gx, groundH(gx, gz), gz);
  grp.rotation.y = ang + Math.PI / 2;
  scene.add(grp);

  // стрела лежит поперёк въезда — препятствие поворачиваем так же
  const sol = obb(gx, gz, 5.4, 0.9, -(ang + Math.PI / 2));
  GATE = { grp, solid: sol };
  indexSolids();
}

/* ── адрес и комментарий курьера ──
   И то, и другое — шутка. Адрес созвучен фамилии или просто
   бессмысленный, комментарий — мем на реальные пометки курьеров:
   они ничего не объясняют, но их зачем-то пишут. */

const COURIER_NOTES = [
  $t('встречает в пижаме с динозаврами'),
  $t('у него три пальца'),
  $t('не смотри в глаза собаке'),
  $t('звонить два раза, третий не работает'),
  $t('домофон кусается'),
  $t('лифт едет только вниз'),
  $t('стучать ногой, руками нельзя'),
  $t('говорит шёпотом, не пугайся'),
  $t('на ковёр не смотреть'),
  $t('сосед снизу — это не он'),
  $t('открывает не сразу, а потом сразу'),
  $t('в подъезде живёт кот, он главный'),
  $t('просил приехать молча'),
  $t('дверь синяя, но покрашена'),
  $t('если не открыл — значит открыл'),
  $t('у двери стоит стул, это его стул'),
  $t('не здоровайся, он стесняется'),
  $t('пахнет борщом, это нормально'),
  $t('на звонок не отвечает, он в созвоне'),
  $t('выйдет, когда закончит стендап'),
  $t('кричать «пицца» три раза, потом ещё раз'),
  $t('не спрашивай, как дела на проекте'),
  $t('если спросит про сроки — ты курьер'),
  $t('не наступай на его самокат'),
  $t('оставить у двери, но не у этой'),
  $t('он в наушниках, махать руками'),
  $t('пароль от домофона — «пицца123»'),
  $t('встретит в худи с котиком'),
  $t('может быть на балконе, машет рукой'),
  $t('заказал на всех, но съест сам'),
  $t('сдачу не надо, ему нужен фидбек'),
  $t('разбудить, он после ночной смены'),
  $t('просил без ананасов, но с ананасами'),
  $t('поднимется, только если пицца горячая'),
  $t('передать лично в руки, руки две'),
  $t('стоит на парковке и делает вид, что не ждёт'),
  $t('подтвердит получение смайликом'),
  $t('не произносить слово «дедлайн»'),
  $t('если грустный — это не из-за пиццы'),
  $t('уточнит заказ голосовым на пять минут'),
  $t('подойдёт после серии, серия идёт третий час'),
  $t('у него кот на клавиатуре, пицца не для кота'),
];

const elPhone = $('phone'), elPhWhy = $('ph-why'), elPhList = $('ph-list'), elPhWhat = $('ph-what');
let phoneT = 0;

/* карточка-анкета: аватарка, имя, фамилия, адрес и пометка курьера */
const KIND_LABEL = { group: $t('групповой заказ'), chain: $t('последовательный заказ'), solo: $t('заказ') };

function personRow (p) {
  const full = (p && p.name || $t('Иван Иванов')).split(/\s+/);
  return '<div class="ph-who">' +
    (p ? '<img src="' + faceDataURL(p) + '" alt="">' : '<i></i>') +
    '<span class="ph-n">' + (full[0] || '') + '</span>' +
    '<span class="ph-s">' + (full.slice(1).join(' ') || '') + '</span>' +
    '<span class="ph-p">' + (p && p.pos ? p.pos : $t('коллега')) + '</span>' +
    '</div>';
}

/* Анкета — про людей: крупно аватарка, имя и фамилия, кому везти.
   Адрес, пицца и пометка курьера — мелко и приглушённо, это вторично.
   Внизу — большая «принять». Фон за анкетой размыт, чтобы не отвлекал. */
function showOrderCard (order) {
  $('ph-kind').textContent = KIND_LABEL[order.kind] || $t('заказ');
  const many = order.stops.length > 1;
  const face = (p, n) => {
    const full = (p && p.name || $t('Иван Иванов')).split(/\s+/);
    return '<div class="oc-p">' +
      (n ? '<em>' + n + '</em>' : '') +
      (p ? '<img src="' + faceDataURL(p) + '" alt="">' : '<i></i>') +
      '<b>' + (full[0] || '') + '</b><span>' + (full.slice(1).join(' ') || '') + '</span></div>';
  };
  const people = order.stops.flatMap((st, i) => st.persons.map(p => face(p, many ? i + 1 : 0))).join('');
  const st0 = order.stops[0];
  elPhList.innerHTML =
    '<div class="oc-people' + (order.stops.reduce((n, st) => n + st.persons.length, 0) > 2 ? ' small' : '') + '">' + people + '</div>' +
    '<div class="oc-meta">' + st0.addr + (many ? ' → ' + $t('ещё {n}', { n: order.stops.length - 1 }) : '') + ' · ' + order.items + '</div>' +
    '<div class="oc-note"><b>' + $t('комментарий курьера:') + '</b> «' + st0.note + '»</div>' +
    (order.rush ? '<div class="oc-rush">⏱ ' + order.rushText + '<span>' + $t('после загрузки — полный бак кофе-нитро · оплата ×1,5') + '</span></div>' : '') +
    (order.surf ? '<div class="oc-rush oc-surf">🏄 ' + $t(MAP.river.surfCard, { name: SURF.person ? SURF.person.first : '' }) + '<span>' + $t('подъедь к набережной и притормози — пицца долетит прямо на доску · оплата ×2') + '</span></div>' : '');
  elPhWhat.textContent = order.items;
  elPhWhy.textContent = order.why;
  elPhone.classList.add('on');
  document.body.classList.add('brief');
  phoneT = 0;                 // висит, пока не нажмут «принять»
}
const hidePhone = () => { elPhone.classList.remove('on'); document.body.classList.remove('brief'); phoneT = 0; };

/* ─────────────── куда везти ───────────────
   Гость ждёт не на тротуаре у проспекта, а в глубине квартала: у подъезда,
   на дворовой дорожке, на парковке во дворе. До такой точки — дворами и
   проездами, маршрут интереснее, и гость не стоит посреди дороги. Точки
   собираются один раз: не на асфальте, не в доме, не в реке и не ближе
   двенадцати метров к улице. */
const SPOTS = [];
function buildSpots () {
  const cand = [];
  for (const [x, z, nx, nz] of CITY.entrances) cand.push([x + nx * 3, z + nz * 3]);
  for (const q of CITY.paths) {
    let acc = 0;
    for (let i = 1; i < q.length; i++) {
      const l = Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
      for (let d = 12 - acc; d < l; d += 25) cand.push([lerp(q[i - 1][0], q[i][0], d / l), lerp(q[i - 1][1], q[i][1], d / l)]);
      acc = (acc + l) % 25;
    }
  }
  for (const lot of CITY.lots) {
    if (lot.k !== 'park') continue;
    let x = 0, z = 0;
    for (const q of lot.p) { x += q[0] / lot.p.length; z += q[1] / lot.p.length; }
    if (inPoly(x, z, lot.p)) cand.push([x, z]);
  }
  for (const [x, z] of cand) {
    if (!inBounds(x, z, 20) || groundH(x, z) < 0.3 || inHouse(x, z, 1.4)) continue;
    const any = nearestRoad(x, z, 7, 1);
    if (any && any.d < any.seg.w / 2 + 1.2) continue;           // на асфальте не стоим
    const street = nearestRoad(x, z, 5, 1);
    if (street && street.d < street.seg.w / 2 + 12) continue;   // у самой улицы — не вглубь
    if (SPOTS.some(s => Math.abs(s.x - x) < 6 && Math.abs(s.z - z) < 6)) continue;
    SPOTS.push({ x, z });
  }
}

/* точка в кольце от центра — случайная из подходящих */
/* Разнообразие: район поделён на восемь секторов вокруг пиццерии, и
   недавние адреса запоминаются. Новую точку берём из сектора, где давно
   не были, и подальше от последних адресов — чтобы заказы водили в
   разные концы района, а не десять раз подряд в один двор. */
const sectorOf = (x, z) => ((Math.floor((Math.atan2(x - PIZZA.x, z - PIZZA.z) + Math.PI) / (Math.PI / 4)) % 8) + 8) % 8;
const RECENT = [];                                   // последние адреса: { x, z, sec }
function spotNear (c, dmin, dmax) {
  const ok = SPOTS.filter(s => { const d = Math.hypot(s.x - c.x, s.z - c.z); return d >= dmin && d <= dmax; });
  if (!ok.length) return null;
  let best = [], bs = Infinity;
  for (let k = 0; k < Math.min(60, ok.length); k++) {
    const s = ok.length > 60 ? pick(ok) : ok[k], sec = sectorOf(s.x, s.z);
    let sc = 0;
    RECENT.forEach((r, i) => {
      const w = 1 - i / (RECENT.length + 1);          // чем свежее адрес, тем сильнее отталкивает
      if (r.sec === sec) sc += 3 * w;
      else if ((r.sec + 1) % 8 === sec || (sec + 1) % 8 === r.sec) sc += 1 * w;
      if (Math.hypot(r.x - s.x, r.z - s.z) < 130) sc += 2 * w;
    });
    sc += Math.random() * 0.6;
    if (sc < bs - 0.01) { bs = sc; best = [s]; } else if (Math.abs(sc - bs) <= 0.01) best.push(s);
  }
  return pick(best);
}
function rememberSpot (x, z) {
  RECENT.unshift({ x, z, sec: sectorOf(x, z) });
  if (RECENT.length > 5) RECENT.pop();
}

/* ─────────────── тусовка ───────────────
   Групповой заказ — это вечеринка: в середине кружка бумбокс, из него
   летят ноты, гости прыгают и танцуют, пока не приехала пицца. */
const PARTIES = [];
function startParty (x, z, peds) {
  const g = new THREE.Group();
  const m = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.34), m('#2b2a30'));
  body.position.y = 0.25;
  g.add(body);
  for (const s of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14), m('#8e8a92'));
    sp.rotation.x = Math.PI / 2; sp.position.set(0.24 * s, 0.25, 0.18);
    g.add(sp);
  }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), m('#c9c4bb'));
  handle.position.y = 0.58;
  g.add(handle);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0x6fd3ff }));
  led.position.set(0, 0.4, 0.18);
  g.add(led);
  g.position.set(x, groundH(x, z) + curbAt(x, z), z);
  g.rotation.y = Math.atan2(V.x - x, V.z - z);
  scene.add(g);
  for (const p of peds) { p.party = true; p.partyPh = rand(0, 6); }
  PARTIES.push({ g, x, z, peds, noteT: 0, led });
}

function updateParties (dt) {
  for (let i = PARTIES.length - 1; i >= 0; i--) {
    const P = PARTIES[i];
    const on = P.peds.some(p => p.guest && !p.dead && !p.served);
    if (!P.peds.some(p => p.guest && !p.dead)) {        // разошлись — бумбокс уносят
      scene.remove(P.g);
      P.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      PARTIES.splice(i, 1);
      continue;
    }
    if (!on) continue;
    // бит: бумбокс подпрыгивает, огонёк мигает, ноты летят
    const beat = Math.abs(Math.sin(tG * 7));
    P.g.scale.set(1 + beat * 0.06, 1 + beat * 0.1, 1 + beat * 0.06);
    P.led.material.color.setHSL((tG * 0.4) % 1, 0.8, 0.6);
    if ((P.noteT -= dt) <= 0) { P.noteT = rand(0.25, 0.5); emote(P.x + rand(-0.3, 0.3), 0.9, P.z + rand(-0.3, 0.3), 'note', 1); }
  }
}

/* ─────────────── заказы ─────────────── */

/* где на этой широте река: западнее — тот берег. Ищем по рельефу:
   середина самой длинной полосы воды на строке сетки */
const RIVER_X = (() => {
  const out = new Float32Array(TNZ).fill(-1e9);
  for (let j = 0; j < TNZ; j++) {
    let best = 0, bi = -1, run = 0;
    for (let i = 0; i < TNX; i++) {
      if (TH[j * TNX + i] < 0) { run++; if (run > best) { best = run; bi = i; } } else run = 0;
    }
    if (best > 3) out[j] = TX0 + (bi - best / 2) * TG;
  }
  return out;
})();
const riverX = z => RIVER_X[clamp(Math.round((z - TZ0) / TG), 0, TNZ - 1)];

const alive = () => PEOPLE.filter(p => !p.dead && !p.guest && p.person);

/* Трекер собирает два вида заказов.

   Групповой — несколько коллег рядом заказали на всех: один адрес,
   одна остановка, коробки разлетаются по рукам разом.
   Последовательный — два-три отдельных заказа, которые курьер
   везёт один за другим, каждый со своим адресом. */
/* ── уровень курьера ──
   Опыт — доставленные заказы за всё время, копится между сменами в
   браузере. Кто уже развёз первых лёгких клиентов, начинает следующую
   смену с заказов посложнее. */
const LVL_AT = [0, 0, 3, 8, 15, 25];              // сколько опыта нужно на уровень 1…5
const getXP = () => +Store.get('dlv-msk-xp', 0) || 0;
const levelOf = xp => { let l = 1; while (l < 5 && xp >= LVL_AT[l + 1]) l++; return l; };
/* ступень сложности в смене: уровень, с которого начал, плюс по одной за
   каждые три заказа, но не выше шестой */
const difficulty = () => Math.min(6, S.lvl0 + Math.floor(Math.max(0, S.orders - 1) / 3));
function addXP () {
  if (S.ride) return;
  const was = levelOf(getXP()), xp = getXP() + 1;
  Store.set('dlv-msk-xp', xp);
  const now = levelOf(xp);
  if (now > was) popBonus($t('уровень {n}!', { n: now }), $t('курьер растёт — заказы сложнее'));
}

/* учебный заказ был — больше не показываем, и стрелку тоже */
const tutDone = () => String(Store.get('dlv-msk-tut', '')) === '1';
/* Самое начало игры — спокойное: пока не отвезён учебный заказ, соперники
   стоят колонной у пиццерии, нет ни аварий, ни похитителя, ни кофейной
   войны. Только ты, прямая улица и клиент на углу. */
const calmStart = () => !S.ride && !tutDone();

/* Точка учебного заказа: от курьера прямо по своей улице до первого
   перекрёстка, там направо — и тридцать метров по правому тротуару. */
function tutorialSpot () {
  const road = nearestRoad(V.x, V.z, DRIVE_MAX, 1);
  if (!road || road.seg.na === undefined) return null;
  let e = edgeOf(road.seg.na, road.seg.nb);
  if (!e) return null;
  if (e.ux * Math.sin(V.h) + e.uz * Math.cos(V.h) < 0) e = edgeOf(e.b, e.a);
  let dist = 0;
  for (let k = 0; k < 40 && dist < 360; k++) {
    const n = e.b;
    /* Учебный клиент стоит прямо на углу первого перекрёстка, на правом
       тротуаре, за несколько метров до стоп-линии: едешь прямо — и видишь
       его справа. Поворачивать никуда не надо. */
    if (nodeDeg(n) >= 3 && dist + e.len > 35) {
      const B = NODES[n], back = (e.tB || 6) + 4, o = e.w / 2 + 1.8;
      const x = B.x - e.ux * back + e.rx * o, z = B.z - e.uz * back + e.rz * o;
      if (!inHouse(x, z, 1)) return { x, z };
    }
    if (nodeDeg(n) >= 3 && dist > 15) {
      let best = null, ba = 0.7;
      for (const c of NODES[n].nb) {
        if (c === e.a) continue;
        const f = edgeOf(n, c);
        if (!f.ok || f.c > 5) continue;
        const ang = Math.atan2(e.ux * f.uz - e.uz * f.ux, e.ux * f.ux + e.uz * f.uz);   // плюс — направо
        if (ang > ba && ang < 2.3 && f.len > 18) { ba = ang; best = f; }
      }
      if (best) {
        const A = NODES[best.a], d = Math.min(32, best.len * 0.6), o = best.w / 2 + 1.6;
        const x = A.x + best.ux * d + best.rx * o, z = A.z + best.uz * d + best.rz * o;
        if (!inHouse(x, z, 1)) return { x, z };
      }
    }
    // дальше прямо — по ребру, которое продолжает улицу
    let nx = null, bd = 0.75;
    for (const c of NODES[n].nb) {
      if (c === e.a) continue;
      const f = edgeOf(n, c);
      if (!f || f.c > 5) continue;
      const dot = e.ux * f.ux + e.uz * f.uz;
      if (dot > bd) { bd = dot; nx = f; }
    }
    if (!nx) return null;
    dist += e.len;
    e = nx;
  }
  return null;
}

function planOrder () {
  const all = alive();
  if (!all.length) return null;
  const n = S.orders;
  const d2 = (p, c) => Math.hypot(p.x - c.x, p.z - c.z);
  const taken = [];
  // коллега на нужном расстоянии от точки; если такого нет — зовём кого-нибудь туда
  // коллега в точку в глубине квартала на нужном расстоянии; нет такой
  // точки — зовём его на тротуар в том же кольце
  const pickNear = (c, dmin, dmax) => {
    const free = all.filter(q => !taken.includes(q));
    if (!free.length) return null;
    const sp = spotNear(c, dmin, dmax);
    const p = sp ? free.sort((a, b) => d2(a, sp) - d2(b, sp))[(Math.random() * Math.min(4, free.length)) | 0] : pick(free);
    if (p.idle) releaseIdle(p);
    p.path = null; p.w = null;
    if (sp) { p.x = sp.x; p.z = sp.z; }
    else { p.yard = false; walkSpawn(p, dmin, dmax, c); }
    taken.push(p);
    return p;
  };
  const group = (anchor, size) => {
    // остальные подтягиваются к первому: встают рядом и ждут вместе
    const take = [anchor];
    for (let i = 1; i < size; i++) {
      const rest = all.filter(p => !taken.includes(p)).sort((p, q) => d2(p, anchor) - d2(q, anchor));
      const b = rest[0];
      if (!b) break;
      // остальные — рядом с первым: в глубине двора, а не на дороге
      if (b.idle) releaseIdle(b);
      b.path = null; b.w = null;
      for (let k = 0; k < 8; k++) {
        b.x = anchor.x + rand(-2.5, 2.5); b.z = anchor.z + rand(-2.5, 2.5);
        const r = nearestRoad(b.x, b.z, 7, 1);
        if (!r || r.d > r.seg.w / 2 + 1) break;         // на асфальт не встаём
      }
      pushOut(b, 0.5);
      taken.push(b); take.push(b);
    }
    return take;
  };
  const why = (take) => {
    const pos = take[0].person.pos, same = pos && take.every(p => p.person.pos === pos);
    return same ? $t('групповой: {who}, заказали на всех', { who: $t(pos) }) : $t('групповой: заказали на всех сразу');
  };

  /* Самый первый заказ за всё время — учебный: гость стоит так, что до
     него прямо и один раз направо. Дальше — случайные заказы, и чем
     дальше смена, тем дальше адреса. */
  if (!tutDone()) {
    const sp = tutorialSpot();
    if (sp) {
      const p = pick(all);
      if (p.idle) releaseIdle(p);
      p.path = null; p.w = null;
      p.x = sp.x; p.z = sp.z;
      return { kind: 'solo', tut: true, stops: [{ peds: [p] }], why: $t('первый заказ: прямо до перекрёстка, клиент справа') };
    }
  }
  /* Сложность — от уровня курьера и от того, сколько заказов уже в этой
     смене: каждые три заказа — ступенька выше. На первой ступени — один
     гость рядом, дальше подключаются групповые, последовательные, за
     реку, и адреса всё дальше. */
  // бонус: сёрфер на реке — изредка, после третьего заказа
  if (MAP.river && MAP.river.surf && S.orders > 3 && !S.ride && chance(0.1)) { const f = surfPlan(); if (f) return f; }
  const d = difficulty();
  const far = [0, 200, 280, 360, 430, 480, 520][d];
  const r = Math.random();
  // за реку, через Омега-мост — с четвёртой ступени
  if (MAP.farOrder && d >= 4 && r < 0.18 && V.x > riverX(V.z)) {
    // тот берег — тоже в глубине двора
    const sp = pick(SPOTS.filter(q => q.x < riverX(q.z)) || []);
    const p = pick(all);
    if (sp && p) {
      if (p.idle) releaseIdle(p);
      p.path = null; p.w = null; p.x = sp.x; p.z = sp.z;
      return { kind: 'solo', far: true, stops: [{ peds: [p] }], why: $t(MAP.farOrder) };
    }
  }
  if (d >= 2 && r < (d >= 3 ? 0.4 : 0.5)) {
    const take = group(pickNear(V, far * 0.55, far), d >= 3 && chance(0.5) ? 3 : 2);
    return { kind: 'group', stops: [{ peds: take }], why: why(take) };
  }
  if (d >= 3 && r < 0.8) {
    const k = d >= 5 && chance(0.5) ? 4 : d >= 4 ? 3 : 2;
    const list = [pickNear(V, far * 0.5, far)];
    for (let i = 1; i < k; i++) list.push(pickNear(list[i - 1], 120, far * 0.8));
    const ok = list.filter(Boolean);
    return { kind: 'chain', stops: ok.map(p => ({ peds: [p] })), why: $tn(ok.length, 'последовательный: {n} адрес, везём по очереди|последовательный: {n} адреса подряд, везём по очереди|последовательный: {n} адресов подряд, везём по очереди') };
  }
  return { kind: 'solo', stops: [{ peds: [pickNear(V, d <= 1 ? 70 : far * 0.6, far)] }], why: pick(SOLO_WHY) };
}

/* длина пути по дорогам: до ближайшего узла, по узлам, от узла до цели */
function routeLen (x0, z0, x1, z1) {
  const n = routeNodes(x0, z0, x1, z1);
  if (!n.length) return Math.hypot(x1 - x0, z1 - z0) * 1.4;
  let L = Math.hypot(n[0].x - x0, n[0].z - z0);
  for (let i = 1; i < n.length; i++) L += Math.hypot(n[i].x - n[i - 1].x, n[i].z - n[i - 1].z);
  return L + Math.hypot(x1 - n[n.length - 1].x, z1 - n[n.length - 1].z);
}

/* ── ритм срока ──
   Срок считается от длины пути по дорогам и средней скорости курьера в
   городе (с поворотами, светофорами и дворами), умноженной на запас.
   Запас идёт волнами по три заказа: первый — спокойно, второй —
   плотнее, третий — срочный; следующая волна снова легче, но уже не
   так, как в начале. Даже самый срочный оставляет запас — доехать
   реально, если не плутать. */
const RUN_V = 19;
function slackFor (n) {
  const c = Math.floor((n - 1) / 3), k = (n - 1) % 3;
  const calm = Math.max(1.3, 2.0 - 0.18 * c), tight = Math.max(1.12, 1.32 - 0.05 * c);
  return lerp(calm, tight, k / 2) - (S.lvl0 - 1) * 0.03;
}
const orderTime = (L, stops, n) => Math.max(16, L / RUN_V * slackFor(n) + 5 + stops * 4) + (S.mealTime || 0);

function newOrder () {
  S.orders++;
  clearGate();
  const plan = planOrder();
  if (!plan) { backToBase(); return; }

  for (const st of plan.stops) {
    st.persons = st.peds.map(p => p.person);
    st.addr = st.surf ? $t(MAP.river.at) : realAddress(st.peds[0].x, st.peds[0].z);
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
      startParty(gx, gz, st.peds);
    } else makeGuest(st.peds[0]);
  }

  for (const st of plan.stops) rememberSpot(st.peds[0].x, st.peds[0].z);
  const total = plan.stops.reduce((n, st) => n + st.peds.length, 0);
  S.order = {
    kind: plan.kind,
    tut: !!plan.tut,
    surf: !!plan.surf,
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
      S.order.why += ' · ' + $t('на парковку шлагбаум, объезжай');
    }
  }

  const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
  S.fee = 120 * total + Math.round(d * 1.7);
  if (plan.surf) S.fee *= 2;
  // срок — по длине пути по дорогам и по ритму волны (см. slackFor)
  S.timeMax = orderTime(routeLen(V.x, V.z, S.target.x, S.target.z), 1, S.orders);
  if (plan.tut) S.timeMax += 20;
  S.time = S.timeMax;
  if ((S.orders - 1) % 3 === 2 && !plan.tut && !S.order.why.startsWith($t('срочный'))) S.order.why = $t('срочный') + ' · ' + S.order.why;
  /* Гарантия скорости: иногда срок режут почти до предела — без нитро не
     успеть, с нитро реально. Зато после загрузки дают полный бак кофе,
     а за заказ платят в полтора раза больше. */
  if (!plan.tut && !S.ride && S.orders > 2 && plan.stops.length === 1 && chance(0.18)) {
    const L = routeLen(V.x, V.z, S.target.x, S.target.z);
    S.timeMax = clamp(L / RUN_V * 0.88 + 4, 22, 95);
    S.time = S.timeMax;
    S.fee = Math.round(S.fee * 1.5);
    S.order.rush = true;
    const tm = S.timeMax;
    const when = tm < 50 ? $t('за {n} секунд', { n: Math.round(tm / 5) * 5 }) : tm < 75 ? $t('за 1 минуту') : $t('за полторы минуты');
    S.order.rushText = $t('гарантия скорости посчитала, что доставить надо {when}. Поторопись!', { when });
    S.order.why = S.order.rushText;
  }
  rebuildRoutePath();
  showOrderCard(S.order);
  Platform.gameplayStop();                        // анкета — это меню: геймплей стоит до «принять»
  Snd.order();
}

/* Багажник курьера: открывается, когда в машину грузят или из неё
   отдают пиццу, и закрывается, как только коробка влетела или вылетела. */
const TRUNK_P = new THREE.Vector3();
function trunkPoint () {
  const tr = car.userData.trunk;
  if (!tr) return { x: V.x, y: V.y + 1.2, z: V.z };
  TRUNK_P.set(0, tr.py, tr.pz);
  car.localToWorld(TRUNK_P);
  return { x: TRUNK_P.x, y: TRUNK_P.y, z: TRUNK_P.z };
}
function setTrunk (open) { const tr = car.userData.trunk; if (tr) tr.want = open ? 1.2 : 0; }
function updateTrunk (dt) {
  const tr = car.userData.trunk;
  if (!tr || (tr.a < 0.005 && tr.want === 0)) return;     // закрыт — вмятины на крышке не трогаем
  tr.a = damp(tr.a, tr.want, 9, dt);
  if (tr.want === 0 && tr.a < 0.01) { tr.a = 0; Snd.blip(150, 0.06, 'square', 0.08); }
  tr.m.rotation.x = tr.a;
  tr.m.position.set(tr.m.position.x, tr.hy + Math.sin(tr.a) * tr.len / 2, tr.hz - Math.cos(tr.a) * tr.len / 2);
}

/* «принять» — багажник открывается, из окна пиццерии в него влетает
   коробка, крышка хлопает, и только тогда отпускается руль и тикает срок */
function acceptOrder () {
  if (S.state !== 'brief') return;
  hidePhone();
  S.state = 'loading';
  // Полноэкранная реклама — раз в несколько доставок и только сразу после
  // нажатия «принять»: это пауза между заказами, а не посреди езды
  if (adDue()) { S.adDone = S.done; showAd().then(loadPizza); return; }
  loadPizza();
}
function loadPizza () {
  V.vx = V.vz = 0;
  setTrunk(true);
  flyBox(
    { x: PIZZA.wx, y: PIZZA.wy, z: PIZZA.wz },
    trunkPoint,
    1.0,
    () => {
      setTrunk(false);
      S.state = 'drive';
      S.time = S.timeMax;                       // срок пошёл с момента загрузки
      if (S.order && S.order.rush) {
        NOS.tank = 1;
        popBonus($t('поторопись!'), $t('полный бак кофе-нитро — жми {key}', { key: nitroKey() }));
      } else toast($t('пицца в машине — поехали'));
      Platform.gameplayStart();
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
  S.target = { x: ped.x, z: ped.z, name: st.persons[0] ? st.persons[0].name : $t('клиент'), ped };
  S.addr = st.persons.map(p => p ? p.name : $t('клиент')).join(', ');
  S.addrLine = st.addr;
}

function backToBase () {
  S.state = 'back';
  if (S.order) for (const st of S.order.stops) for (const p of st.peds) if (!p.served) clearGuest(p);
  S.order = null;
  S.target = { x: PIZZA.x, z: PIZZA.z, name: PIZZA.name };
  S.addrLine = '';
  S.timeMax = routeLen(V.x, V.z, PIZZA.x, PIZZA.z) / RUN_V * 1.8 + 8 + (S.mealTime || 0);
  S.time = S.timeMax;
  rebuildRoutePath();
  toast($t('возвращайся в пиццерию'));
}

/* вручение: багажник открывается, коробка вылетает каждому в руки,
   после последней крышка закрывается */
function handOver (st, onTime) {
  setTrunk(true);
  setTimeout(() => setTrunk(false), 380 + st.peds.length * 220 + 450);
  st.peds.forEach((ped, i) => {
    setTimeout(() => {
      if (ped.dead || S.state === 'over' || S.state === 'dying') return;
      flyBox(trunkPoint(), { x: ped.x, y: (ped.surf ? 0.2 : groundH(ped.x, ped.z)) + 1.15, z: ped.z }, ped.surf ? 1.1 : 0.6, () => {
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
    }, 380 + i * 220);
  });
}

function checkArrival (dt) {
  if (!S.target) return;
  const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
  const speed = Math.hypot(V.vx, V.vz);

  if (S.state === 'drive') {
    // к гостю надо подъехать и притормозить, а не влететь
    if (d > (S.order.stops[S.order.idx].reach || 5) || speed > 6) return;
    const o = S.order;
    const st = o.stops[o.idx];
    const onTime = S.free || S.time > 0;
    const share = Math.round(S.fee / o.stops.length);
    // бонус за скорость: осталось больше шестидесяти процентов срока —
    // «молния», больше тридцати пяти — «быстро»
    const left = clamp(S.time / S.timeMax, 0, 1);
    const tier = S.free ? 0 : left >= 0.5 ? 2 : left >= 0.25 ? 1 : 0;
    const bonus = tier ? Math.round(share * (tier === 2 ? 0.6 : 0.3) * (S.tipMul || 1)) : 0;
    if (bonus) popBonus(tier === 2 ? $t('А ты харош!') : $t('Шустро!'), $t('чаевые накинули +{money}', { money: money(bonus) }));
    // клиент-богач (рядом гуляет богач или дом солидный) — изредка крупные чаевые, см. LIFE.richTip
    const rich = onTime ? LIFE.richTip(st.peds, share) : 0;
    if (rich) popBonus($t('чаевые от богача +{money}', { money: money(rich) }), $t('сдачи не надо'));
    const part = onTime ? share + bonus + rich : Math.round(share * 0.45);
    S.money += part;
    // оплата — сразу в кошелёк: умер или закрыл вкладку — деньги уже твои
    if (!S.freeRun) addWallet(part);
    S.delivered += st.peds.length;

    handOver(st, onTime);
    toast((onTime ? '+' : $t('опоздал') + ' · +') + money(part) + ' · ' + S.addr);
    Snd.coin();

    o.idx++;
    if (o.idx < o.stops.length) {
      syncTarget();
      // на следующий адрес — срок по его пути, по той же волне
      S.time = Math.max(S.time, 0) + orderTime(routeLen(V.x, V.z, S.target.x, S.target.z), 1, S.orders) * 0.9;
      S.timeMax = Math.max(S.timeMax, S.time);
      toast($t('следующий: {who}', { who: S.addr }));
      Snd.order();
    } else {
      S.state = 'handover'; S.handT = 0.9;
      addXP();
      S.done = (S.done || 0) + 1;
      if (o.tut) Store.set('dlv-msk-tut', '1');
      else if (!S.ride && onTime && st.persons[0] && chance(0.45)) offerSide(st.peds[0], st.persons[0]);
    }
  } else if (S.state === 'side') {
    sideArrival(d, speed);
  } else if (S.state === 'back') {
    if (d > 7) return;
    S.state = 'handover'; S.handT = 0.8;
    clearGate();
    // в пиццерии хвалят, а иногда наливают кофе — это плюс к нитро
    if (chance(0.45) && NOS.tank < 0.95) {
      NOS.tank = Math.min(1, NOS.tank + 0.4);
      popBonus($t('молодец!'), $t('подкрепись кофейком · +кофе-нитро'));
    } else toast(pick([$t('молодец! забирай следующий'), $t('молодец! вот новый заказ'), $t('молодец!')]));
    Snd.blip(600, 0.12, 'square', 0.13);
  }
}

/* ── карточка выбора: обед и просьбы клиентов ──
   Одна карточка на всё: лицо (если есть), заголовок, реплика и кнопки.
   Кнопки жмутся и цифрами 1–3. Обед ставит игру на паузу, просьба
   клиента — нет: ответишь или уедешь, через десять секунд она гаснет. */
const CH = { opts: [], t: 0, onTimeout: null, pause: false };
function showChoice (o) {
  const el = $('choice');
  $('ch-face').innerHTML = o.face ? '<img src="' + faceDataURL(o.face) + '" alt="">' : '';
  $('ch-t').textContent = o.title;
  $('ch-s').innerHTML = o.sub || '';
  CH.opts = o.opts; CH.t = o.timeout || 0; CH.onTimeout = o.onTimeout || null; CH.pause = !!o.pause;
  $('ch-opts').innerHTML = o.opts.map((q, i) => '<button type="button" data-i="' + i + '"><em>' + (i + 1) + '</em><b>' + q.label + '</b>' +
    (q.sub ? '<span>' + q.sub + '</span>' : '') + '</button>').join('');
  el.classList.toggle('big', CH.pause);
  el.hidden = false;
  if (CH.pause) { S.paused = true; S.meal = true; Snd.engine(0); for (const k in IN) IN[k] = 0; joyReset(); }
}
function hideChoice () {
  const el = $('choice');
  if (el) el.hidden = true;
  CH.opts = []; CH.t = 0; CH.onTimeout = null;
  if (CH.pause) { CH.pause = false; S.meal = false; S.paused = false; }
}
function pickChoice (i) {
  const q = CH.opts[i];
  if (!q) return;
  hideChoice();
  q.fn();
}
$('ch-opts').addEventListener('click', e => { const b = e.target.closest('button'); if (b) pickChoice(+b.dataset.i); });
function choiceStep (dt) {
  if (!CH.opts.length || CH.pause || !CH.t) return;
  if ((CH.t -= dt) <= 0) { const f = CH.onTimeout; hideChoice(); if (f) f(); }
}

/* ── обед ──
   Каждые четыре выполненных заказа — перерыв в пиццерии: выбираешь, что
   съесть, и это буст до конца смены. Бусты складываются. */
const MEAL_EVERY = 4;
const MEALS = [
  { t: $t('шаурма у метро'), s: $t('+1 сердце сверху'), fn () { S.hpMax++; S.hp++; hudHearts(); } },
  { t: $t('бизнес-ланч'), s: $t('чаевые ×2 до конца смены'), fn () { S.tipMul = (S.tipMul || 1) * 2; } },
  { t: $t('двойной раф в «Синем ките»'), s: $t('кофе-нитро жжётся вдвое медленнее, бак полный'), fn () { S.nosEff *= 0.5; NOS.tank = 1; } },
  { t: $t('пицца с работы'), s: $t('все сердца обратно'), ok: () => S.hp < S.hpMax, fn () { S.hp = S.hpMax; hudHearts(); } },
  { t: $t('лапша в подсобке'), s: $t('+8 секунд на каждый заказ'), fn () { S.mealTime = (S.mealTime || 0) + 8; } },
];
const mealDue = () => !S.ride && (S.done || 0) - (S.mealDone || 0) >= MEAL_EVERY;
function showMeal () {
  S.mealDone = S.done;
  const name = [$t('обед'), $t('полдник'), $t('ужин'), $t('ночной дожор')][Math.min(S.meals || 0, 3)];
  S.meals = (S.meals || 0) + 1;
  const pool = MEALS.filter(m => !m.ok || m.ok());
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  showChoice({
    title: name, sub: $t('{n} заказа позади — перерыв. что берёшь? это буст до конца смены', { n: MEAL_EVERY }),
    pause: true,
    opts: pool.slice(0, 3).map(m => ({ label: m.t, sub: m.s, fn: () => { m.fn(); popBonus(name + ': ' + m.t, m.s); newOrder(); } })),
  });
  Snd.order();
}

/* ── «сгоняй за пивом» ──
   Иногда гость, которому только что привёз, просит сгонять за пивом в
   ближайший продуктовый — «даю косарь». Взял — едешь в магазин, потом
   обратно к нему, гость ждёт с пиццей в руках. Успел — тысяча сверху;
   не успел — просто передумал, смена идёт дальше. */
/* за чем гоняют: что просят, где взять и как это назвать по дороге.
   prefer — какие вывески подходят лучше всего; нет такой рядом — любая
   из kinds (для латешки — любая кофейня: Drinkit в рамке карты нет) */
const COFFEE_RE = /coffee|кофе|cofix|даблби|wakecup|drinkit|surf|stars|baggins|кофешефф|coffee point|brun/i;
/* ask — «сгоняй …», what — что везём, gotIt — тост, когда купил.
   Алкоголь и табак убраны: площадки такое не пропускают */
const ERRANDS = [
  { ask: $t('за лимонадом'), what: $t('лимонад'), kinds: ['grocery'], prefer: /пят|дикси|вкусвилл|магнит|перекр|продукт/i, gotIt: $t('лимонад взял') },
  { ask: $t('за шаурмой'), what: $t('шаурма'), kinds: ['food'], prefer: /шаур|кебаб|донер|шашлык/i, gotIt: $t('шаурму взял') },
  { ask: $t('за латешкой из «Синего кита»'), what: $t('латешка'), drinkit: true, kinds: [], prefer: /drinkit/i, gotIt: $t('латешку взял') },
  { ask: $t('за сухариками'), what: $t('сухарики'), kinds: ['grocery'], prefer: /пят|дикси|вкусвилл|магнит|перекр|продукт/i, gotIt: $t('сухарики взял') },
  { ask: $t('за пластырем'), what: $t('пластырь'), kinds: ['pharm'], prefer: /аптек|36,6|столич|ригла/i, gotIt: $t('пластырь взял') },
  { ask: $t('за зарядкой для телефона'), what: $t('зарядка'), kinds: ['shop'], prefer: /мтс|билайн|мегафон|dns|связ|t2|samsung|store|видео/i, anyKind: true, gotIt: $t('зарядку взял') },
  // взрослая версия: то, за чем на самом деле гоняют курьера
  ...(ADULT ? [
    { ask: $t('за пивом'), what: $t('пиво'), kinds: ['grocery'], prefer: /пив|beer|разлив|пят|дикси|магнит|продукт/i, gotIt: $t('пиво взял') },
    { ask: $t('за снюсиком'), what: $t('снюс'), kinds: ['grocery', 'shop'], prefer: /табак|tobac|smoke|vape|вейп|кальян|красное|бристоль|продукт/i, anyKind: true, gotIt: $t('снюсик взял') },
    { ask: $t('за водочкой'), what: $t('водочка'), kinds: ['grocery'], prefer: /вин|алко|wine|красное|бристоль|пят|продукт/i, gotIt: $t('водочку взял') },
  ] : []),
];
function errandShop (it, ped) {
  // латешка — только в Drinkit: ближайшая из наших синих кофеен
  if (it.drinkit) {
    let best = null, bd = 1e9;
    for (const c of DRINKITS) { const d = Math.hypot(c.x - ped.x, c.z - ped.z); if (d > 30 && d < bd) { bd = d; best = c; } }
    return best;
  }
  let shop = null, bd = 1e9, pref = null, pd = 1e9;
  for (const q of SIGNS) {
    // anyKind — табачная лавка годится, даже если в карте она «магазин»
    const fit = it.kinds.includes(q.k) && (!it.anyKind || it.prefer.test(q.n0));
    if (!fit || (it.coffee && !COFFEE_RE.test(q.n0))) continue;
    const d = Math.hypot(q.x - ped.x, q.z - ped.z);
    if (d < 45 || d > 380) continue;
    if (d < bd) { bd = d; shop = q; }
    if (it.prefer.test(q.n0) && d < pd) { pd = d; pref = q; }
  }
  return pref || shop;
}
function offerSide (ped, person) {
  // берём случайное поручение, для которого рядом есть магазин
  const opts = ERRANDS.map(it => ({ it, shop: errandShop(it, ped) })).filter(o => o.shop);
  if (!opts.length) return;
  const { it, shop } = pick(opts);
  S.handT = 1e9;                                // пока думаешь — дальше не едем
  ped.freeT = 1e9;
  const first = person.first || person.name.split(/\s+/)[0];
  showChoice({
    face: person, title: first + ':', sub: $t('«сгоняй {what}, даю косарь»', { what: it.ask }),
    timeout: 10, onTimeout: () => declineSide(ped),
    opts: [{ label: $t('сгоняю'), sub: shop.n, fn: () => startSide(ped, person, shop, it) },
           { label: $t('не, работаю'), fn: () => declineSide(ped) }],
  });
}
function declineSide (ped) {
  if (!ped.dead) { ped.freeT = 8; emote(ped.x, 2.1, ped.z, 'angry', 1); }
  if (S.state === 'handover') S.handT = 0.2;
}
function startSide (ped, person, shop, it) {
  if (S.state !== 'handover' || ped.dead) { declineSide(ped); return; }
  S.side = { ped, person, shop, it, stage: 'shop' };
  S.order = null;
  S.state = 'side';
  S.target = { x: shop.x + shop.nx * 2, z: shop.z + shop.nz * 2, name: shop.n };
  S.addr = $t('{what} для {who}', { what: it.what, who: person.first || person.name.split(/\s+/)[0] });
  S.addrLine = shop.n;
  S.timeMax = orderTime(routeLen(V.x, V.z, S.target.x, S.target.z), 1, 1);
  S.time = S.timeMax;
  rebuildRoutePath();
  toast($t('{what} — в «{shop}», потом обратно', { what: it.ask, shop: shop.n }));
  Snd.order();
}
function sideArrival (d, speed) {
  const Sd = S.side;
  if (!Sd) return;
  if (Sd.ped.dead) { sideEnd(false, $t('клиенту уже не до этого')); return; }
  if (d > (Sd.stage === 'shop' ? 7 : 5) || speed > 6) return;
  if (Sd.stage === 'shop') {
    Sd.stage = 'back';
    setTrunk(true);
    flyBox({ x: Sd.shop.x + Sd.shop.nx, y: groundH(Sd.shop.x, Sd.shop.z) + 1.2, z: Sd.shop.z + Sd.shop.nz }, trunkPoint, 0.8, () => setTrunk(false));
    S.target = { x: Sd.ped.x, z: Sd.ped.z, name: Sd.person.name, ped: Sd.ped };
    S.addr = Sd.it.what + ' → ' + Sd.person.name;
    S.addrLine = realAddress(Sd.ped.x, Sd.ped.z);
    S.time = Math.max(S.time, 0) + routeLen(V.x, V.z, Sd.ped.x, Sd.ped.z) / RUN_V * 1.5 + 6;
    S.timeMax = Math.max(S.timeMax, S.time);
    rebuildRoutePath();
    toast($t('{got} — обратно к {who}', { got: Sd.it.gotIt, who: Sd.person.first || Sd.person.name.split(/\s+/)[0] }));
    Snd.blip(760, 0.1, 'square', 0.13);
  } else {
    const ped = Sd.ped;
    setTrunk(true);
    flyBox(trunkPoint(), { x: ped.x, y: groundH(ped.x, ped.z) + 1.15, z: ped.z }, 0.6, () => {
      setTrunk(false);
      if (!ped.dead) emote(ped.x, 2.1, ped.z, 'heart', 6);
    });
    S.money += 1000;
    if (!S.freeRun) addWallet(1000);
    popBonus($t('косарь!'), Sd.it.ask + ' · +' + money(1000));
    sideEnd(true);
  }
}
function sideEnd (ok, msg) {
  const Sd = S.side;
  S.side = null;
  if (Sd && !Sd.ped.dead) Sd.ped.freeT = ok ? 8 : 4;
  if (msg) toast(msg);
  S.order = null;
  backToBase();
}

/* задавил того, кому вёз — смена закончена */
function checkVictim (ped) {
  const o = S.order;
  if (!o) return false;
  return o.stops.slice(o.idx).some(st => st.peds.includes(ped));
}

const ease = t => t * t * (3 - 2 * t);
const DEATH = { t: 0, x: 0, z: 0, h: 0, why: '', victims: [], burn: 0, fireT: 0 };
/* why — ключ причины (не переводится), дальше — что писать */
const DEATH_WORD = {
  'не доставил': GORE_ON ? $t('задавил') : $t('сбил'),
  'машина всё': GORE_ON ? $t('помер') : N_('машина всё'),
  'утонул': N_('утонул'),
  'не успел': N_('не успел'),
};
const OVER_TITLE = { 'машина всё': GORE_ON ? $t('помер') : N_('машина всё'), 'не доставил': $t('клиент потерян'), 'утонул': N_('утонул'), 'не успел': N_('не успел'), 'смена окончена': N_('смена окончена') };

function gameOver (why, victims, focus) {
  if (S.state === 'over' || S.state === 'dying') return;
  S.state = 'dying';
  if (S.side) { S.side.ped.freeT = 3; S.side = null; }
  hideChoice();
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
  DEATH.sink = why === 'утонул' ? 1 : 0;

  if (DEATH.burn) {
    // машина выгорает: краска чернеет, из-под капота остаётся огонь
    car.traverse(o => { if (o.isMesh && o.material && o.material.color) o.material.color.setHex(0x241f26); });
  }

  // Имя жертвы — крупно и в лоб: не «под колёсами такая-то», а прямая
  // формулировка, за что смена закончилась.
  const el = $('w-word');
  if (DEATH.victims.length) {
    const who = DEATH.victims.map(accName).join(', ');
    el.textContent = $t(GORE_ON ? $t('задавил {who}') : $t('сбил {who}'), { who }).toUpperCase();
    $('w-sub').textContent = $t('КЛИЕНТ ПОТЕРЯН');
  } else {
    el.textContent = $t(DEATH_WORD[why] || 'смена окончена').toUpperCase();
    $('w-sub').textContent = why === 'машина всё' ? '' : why === 'утонул' ? $t('ВПЛАВЬ НЕ ДОВЕЗЁШЬ') : $t('ЗАКАЗ ПРОТУХ');
  }
  Platform.gameplayStop();
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
  if (DEATH.sink) { DEATH.x = V.x; DEATH.z = V.z; }

  // камера отъезжает и уходит в небо
  const k = ease(clamp((t - 0.35) / 3.4, 0, 1));
  let back = lerp(11, 5.5, k);
  const y = lerp(4.5, 34, k);
  if (y < 22) while (back > 3 && camInWall(DEATH.x - Math.sin(DEATH.h) * back, DEATH.z - Math.cos(DEATH.h) * back)) back -= 1.5;
  const cx = DEATH.x - Math.sin(DEATH.h) * back, cz = DEATH.z - Math.cos(DEATH.h) * back;
  // тонущую машину снимаем от воды, а не со дна
  const fy = DEATH.sink ? 0 : DEATH.x === V.x && DEATH.z === V.z ? V.y : floorAt(DEATH.x, DEATH.z);
  cam.position.set(cx, Math.max(fy + y, groundH(cx, cz) + 2), cz);
  cam.lookAt(DEATH.x, fy + lerp(1.4, 0, k), DEATH.z);

  if (t > 1.2) document.body.classList.add('w-show');
  if (t > 5) {
    S.state = 'over';
    setTimeout(clearRivals, 0);
    elNote.textContent = '';
    $('wasted').hidden = true;
    document.body.classList.remove('w-show');
    showOver(DEATH.why, DEATH.victims);
  }
}

function startRun (ride) {
  S.ride = !!ride;
  if (!S.ride) SEAS.advanceSeason();             // каждая смена — шаг к следующему времени года
  S.free = S.ride;                               // катаемся без срока и не в зачёт
  $('wasted').hidden = true;
  document.body.classList.remove('w-show');
  resetCar();
  S.hpMax = curCar().hp;
  carStats();
  RECENT.length = 0;
  S.done = 0; S.mealDone = 0; S.meals = 0; S.tipMul = 1; S.nosEff = 1; S.mealTime = 0; S.side = null;
  hideChoice();
  THIEF.cd = rand(35, 60);
  S.state = 'drive'; S.hp = S.hpMax; S.money = 0; S.orders = 0; S.burgers = 0; S.shiftT = 0;
  S.people = 0; S.wrecks = 0; S.delivered = 0; S.scoots = 0;
  S.hurt = 0; S.shake = 0;
  S.freeRun = S.free;
  S.lvl0 = levelOf(getXP());
  NOS.tank = 0.5; NOS.burn = false;
  for (const n of NITRO_CANS) { n.t = 0; }
  FXS.shieldT = 0; FXS.beastT = 0;
  startPose();
  V.vx = V.vz = 0; V.camX = V.x + 12; V.camZ = V.z; V.camH = V.h; V.camY = V.y + 6;
  hudHearts();
  hideOver();
  $('menu').hidden = !S.ride;
  lastPlace = 0;
  if (S.ride) { clearRivals(); S.order = null; S.target = null; routePts = []; toast($t('просто катаемся: без заказов и рекордов · esc — пауза и выход')); Platform.gameplayStart(); }
  else { initRivals(); newOrder(); }
  showGuide();                                   // первый старт за всё время — как ехать
}

/* из «просто покататься» — обратно в меню */
function toMenu () {
  if (!S.ride || S.state === 'dying') return;
  S.state = 'title'; S.ride = false; S.free = false;
  $('menu').hidden = true;
  showTitle();
}
$('menu').addEventListener('click', toMenu);
$('st-ride').addEventListener('click', () => { Snd.boot(); Snd.resume(); elName.blur(); startRun(true); });


/* звук и пауза кнопками: не все догадаются про M и P */
$('sfx').textContent = Snd.on ? $t('звук вкл') : $t('звук выкл');
$('sfx').addEventListener('click', e => { Snd.set(!Snd.on); e.currentTarget.blur(); });
$('pause').addEventListener('click', e => { setPause(!S.paused); e.currentTarget.blur(); });

/* ── меню паузы ──
   На экране во время езды только сердца, деньги, время и радар с кольцом
   нитро. Всё остальное — куда едем, сколько сбито, звук, карта района и
   выход — здесь. */
const elPause = $('pausem');
function orderInfo () {
  if (S.ride) return '<b>' + $t('просто катаешься') + '</b><br><span class="sub">' + $t('без заказов и рекордов') + '</span>';
  if (!S.target) return '<span class="sub">' + $t('заказа пока нет') + '</span>';
  const o = S.order, d = $t('{n} м', { n: Math.round(Math.hypot(S.target.x - V.x, S.target.z - V.z)) });
  if (S.state === 'side' && S.side) return '<b>' + S.addr + '</b> · ' + d + '<br><span class="sub">' + S.addrLine + '</span>';
  if (S.state === 'back') return '<b>' + $t('в пиццерию') + '</b> · ' + d + '<br><span class="sub">' + (PIZZA ? PIZZA.name.toLowerCase() : '') + '</span>';
  return '<b>' + $t('заказ {n}', { n: S.orders }) + (o && o.stops.length > 1 ? ' · ' + $t('{i} из {n}', { i: o.idx + 1, n: o.stops.length }) : '') + '</b> · ' + d + '<br>' +
    S.addr + (S.addrLine ? '<br><span class="sub">' + S.addrLine + '</span>' : '');
}
function renderPause () {
  $('pm-order').innerHTML = orderInfo() + '<br><span class="sub">' + envClock() + ' · ' + envPhaseName(ENV.t) + ' · ' + SEAS.seasonName() + (ENV.rainWant ? ' · ' + (SEAS.snowy() ? $t('снег, скользко') : $t('дождь, скользко')) : '') + '</span>';
  const rows = [[$t('доставлено'), S.delivered], [$t('заработано'), money(S.money)], [$t('респектов'), S.burgers],
    [$t('прохожих сбито'), S.people], [$t('самокатчиков'), S.scoots], [$t('машин всмятку'), S.wrecks]];
  $('pm-stats').innerHTML = rows.map(([k, v]) => '<span>' + k + '</span><span>' + v + '</span>').join('');
  $('pm-sfx').textContent = Snd.on ? $t('звук: вкл') : $t('звук: выкл');
  $('pm-menu').textContent = S.ride ? $t('в главное меню') : $t('закончить смену');
}
function setPause (on) {
  if (on && (S.meal || !['drive', 'back', 'handover', 'brief', 'loading', 'side'].includes(S.state))) return;
  S.paused = on;
  $('pause').textContent = on ? $t('продолжить') : $t('пауза');
  if (on) Platform.gameplayStop(); else if (isPlaying()) Platform.gameplayStart();
  if (elPause) elPause.hidden = !on;
  if (on) { Snd.engine(0); renderPause(); for (const k in IN) IN[k] = 0; joyReset(); }
}
/* выйти в меню посреди смены: заработанное уже в кошельке, итоги — как в конце */
function endShift () {
  setPause(false);
  if (S.side) { S.side.ped.freeT = 3; S.side = null; }
  hideChoice();
  if (S.order) for (const st of S.order.stops) for (const p of st.peds) clearGuest(p);
  S.order = null; S.target = null; routePts = [];
  marker.visible = false;
  hidePhone(); clearGate();
  if (S.ride) { S.state = 'title'; S.ride = false; S.free = false; $('menu').hidden = true; showTitle(); }
  else { S.state = 'over'; showOver('смена окончена', []); }
  Platform.gameplayStop();
  clearRivals();
}
if (elPause) {
  $('pm-go').addEventListener('click', () => setPause(false));
  $('pm-map').addEventListener('click', () => { setPause(false); setFullMap(true); });
  $('pm-sfx').addEventListener('click', () => { Snd.set(!Snd.on); renderPause(); });
  $('pm-menu').addEventListener('click', endShift);
}

/* нитро кнопкой — пока держишь палец */
for (const ev of ['pointerdown']) $('nos').addEventListener(ev, e => { e.preventDefault(); IN.nitro = 1; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
  $('nos').addEventListener(ev, () => { IN.nitro = 0; });

/* «принять»: до него руль заблокирован */
$('ph-accept').addEventListener('click', acceptOrder);

/* ─────────────── ввод ─────────────── */
const KEY = {
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hand',
};

addEventListener('keydown', e => {
  if (!elPanel.hidden) { if (e.code === 'Escape') closePanel(); return; }
  if (CH.opts.length && /^Digit[1-3]$/.test(e.code)) { pickChoice(+e.code.slice(5) - 1); return; }
  if (CH.pause) return;
  if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) setFullMap(!FM.open); return; }
  if (FM.open) { if (e.code === 'Escape' || e.code === 'Space') setFullMap(false); return; }
  if (KEY[e.code]) { IN[KEY[e.code]] = 1; e.preventDefault(); }
  Snd.boot(); Snd.resume();
  if (e.code === 'Space' && (S.state === 'title' || S.state === 'over')) {
    if (S.name || !Platform.features.nameInput) goRun(); else elName.focus();
  }
  if (phoneT > 0 && e.code !== 'KeyM') hidePhone();
  if (e.code === 'KeyM' && !e.repeat) { Snd.set(!Snd.on); toast(Snd.on ? $t('звук вкл') : $t('звук выкл')); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !FM.open && !e.repeat) setPause(!S.paused);
});
addEventListener('keyup', e => { if (KEY[e.code]) { IN[KEY[e.code]] = 0; e.preventDefault(); } });
addEventListener('blur', () => { for (const k in IN) IN[k] = 0; });

/* ── джойстик: палец (или мышь) на картинке ──
   Где положил палец — там центр. Тянешь вверх — газ, вниз — тормоз, а на
   месте — назад, в стороны — руль, и чем дальше отвёл, тем круче. Второй
   палец — ручник. Это те же WASD, только пальцем; кружок с ручкой
   нарисован прямо под пальцем. */
const JOY = { id: null, ox: 0, oy: 0, x: 0, y: 0, hand: null };
const JOY_R = 58;
const elJoy = $('joy'), elKnob = $('joy-k');
const touches = { clear: () => joyReset() };      // старое имя: сбросить всё, что держит палец
function joyReset () {
  JOY.id = null; JOY.hand = null; JOY.x = JOY.y = 0;
  IN.joy = 0; IN.jx = 0;
  elJoy.hidden = true;
}
function joyApply () {
  const on = JOY.id !== null;
  IN.joy = on ? 1 : 0;
  IN.jx = on ? JOY.x : 0;
  IN.gas = on && JOY.y < -0.22 ? 1 : 0;
  IN.brake = on && JOY.y > 0.28 ? 1 : 0;
  IN.left = on && JOY.x < -0.2 ? 1 : 0;
  IN.right = on && JOY.x > 0.2 ? 1 : 0;
  IN.hand = JOY.hand !== null ? 1 : 0;
  elKnob.style.transform = 'translate(' + (JOY.x * JOY_R) + 'px, ' + (JOY.y * JOY_R) + 'px)';
}
/* ── телефон: кнопки вместо джойстика ──
   Как в казуальных гонках: руль ◀ ▶ под левым большим пальцем, газ,
   тормоз, нитро и ручник — под правым. Каждая кнопка держит свой палец
   (pointer capture), поэтому газ с рулём жмутся одновременно. */
const TOUCH = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);
document.body.classList.toggle('touch', TOUCH);
const elTouch = $('touchpad');
for (const b of elTouch.querySelectorAll('button[data-k]')) {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); Snd.boot(); Snd.resume(); try { b.setPointerCapture(e.pointerId); } catch (_) {} IN[k] = 1; IN.joy = 0; b.classList.add('on'); };
  const off = () => { IN[k] = 0; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, off);
  b.addEventListener('contextmenu', e => e.preventDefault());
}
function touchpadStep () {
  const show = TOUCH && isPlaying() && !S.paused && !FM.open && S.state !== 'brief' && S.state !== 'loading';
  if (elTouch.hidden === show) {
    elTouch.hidden = !show;
    if (!show) for (const b of elTouch.querySelectorAll('.on')) { b.classList.remove('on'); IN[b.dataset.k] = 0; }
  }
}

/* Палец считаем только если он лёг на саму картинку: кнопки хада и
   «принять» в джойстик не уходят. На телефоне джойстика нет — там кнопки. */
addEventListener('pointerdown', e => {
  Snd.boot(); Snd.resume();
  if (e.target !== canvas) return;              // поля и кнопки хада не трогаем
  if (TOUCH && e.pointerType !== 'mouse') return;
  if (S.state === 'title' || S.state === 'over') return;       // стартуем кнопкой «поехали»
  if (JOY.id === null) {
    JOY.id = e.pointerId; JOY.ox = e.clientX; JOY.oy = e.clientY; JOY.x = JOY.y = 0;
    elJoy.style.left = e.clientX + 'px'; elJoy.style.top = e.clientY + 'px';
    elJoy.hidden = false;
  } else if (JOY.hand === null) JOY.hand = e.pointerId;       // второй палец — ручник
  joyApply();
});
addEventListener('pointermove', e => {
  if (e.pointerId !== JOY.id) return;
  let dx = (e.clientX - JOY.ox) / JOY_R, dy = (e.clientY - JOY.oy) / JOY_R;
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  JOY.x = dx; JOY.y = dy;
  joyApply();
});
for (const ev of ['pointerup', 'pointercancel'])
  addEventListener(ev, e => {
    if (e.pointerId === JOY.id) { joyReset(); IN.gas = IN.brake = IN.left = IN.right = 0; IN.hand = JOY.hand !== null ? 1 : 0; }
    else if (e.pointerId === JOY.hand) { JOY.hand = null; IN.hand = 0; }
  });
// и страховка: ушёл фокус или курсор с окна — руль отпущен
for (const ev of ['blur', 'contextmenu'])
  addEventListener(ev, () => { joyReset(); for (const k in IN) IN[k] = 0; });

/* смена начинается у пиццерии, на ближайшей проезжей части */
function startPose () {
  // смена начинается на своём месте на парковке курьеров, носом к улице
  if (COURIER_SLOTS) {
    const s = COURIER_SLOTS[0];
    V.x = s.x; V.z = s.z; V.h = s.h; V.vx = V.vz = 0; V.y = surfaceAt(V.x, V.z);
    V.hero = 1;                                     // пока стоишь — вид спереди на машину и пиццерию
    return;
  }
  const road = nearestRoad(PIZZA.x, PIZZA.z, DRIVE_MAX, 4);
  if (!road) { V.x = PIZZA.x; V.z = PIZZA.z; V.h = 0; V.vx = V.vz = 0; V.y = groundH(V.x, V.z); return; }
  const sg = road.seg;
  const len = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) || 1;
  const ux = (sg.x2 - sg.x1) / len, uz = (sg.z2 - sg.z1) / len;
  // разворачиваемся так, чтобы сзади была улица, а не стена: камера
  // висит в тринадцати метрах позади, и упираться ей в дом незачем
  let h = Math.atan2(ux, uz);
  const free = a => !camInWall(road.x - Math.sin(a) * 15, road.z - Math.cos(a) * 15);
  if (!free(h) && free(h + Math.PI)) h += Math.PI;
  V.x = road.x - Math.cos(h) * LANE; V.z = road.z + Math.sin(h) * LANE;
  V.h = h;
  V.vx = 0; V.vz = 0;
  V.y = surfaceAt(V.x, V.z);
}

/* ─────────────── сборка мира ─────────────── */
/* времена года: что им нужно от игры (ENV, дождь и небо заводятся ниже — геттерами) */
SEAS.initSeasons({ THREE, scene, cam, renderer, Store, MAP, CITY, V, S, groundH, curbAt, nearestRoad, roadWidth, drivable, inHouse, inPoly, inBounds,
  put, smashAdd, SMASH, SM_WORD, SMASH_MAT, LAMP_SPOTS, ZEBRAS, NODE_IDX, nodeDeg, makeHuman, dropMesh, gibHuman, toast, Snd, CAR_L, CAR_W, isPlaying, sayBubble,
  obb, SOLIDS, get COURIER_SLOTS () { return COURIER_SLOTS; },
  get PIZZA () { return PIZZA; }, get ENV () { return ENV; }, get rainLines () { return rainLines; }, get hemi () { return hemi; } });
const T0 = performance.now();
buildCity();
ZN.init({ CITY, MAP, donated });
DLG.init({ pause: on => { for (const k in IN) IN[k] = 0; if (on) Snd.engine(0); }, face: (p, size) => faceDataURL(p, size) });
const BUILD_MS = performance.now() - T0;          // сколько собирался город — для отладки
/* реквизит склейки — тоже по клеткам: иначе снова один меш на весь город */
function mergeChunked (list, mat) {
  const buckets = new Map();
  for (const g of list) {
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    const k = Math.floor(c.x / CHUNK) + ',' + Math.floor(c.z / CHUNK);
    let b = buckets.get(k);
    if (!b) buckets.set(k, b = []);
    b.push(g);
  }
  for (const b of buckets.values()) {
    const g = mergeGeos(b);
    g.computeBoundingSphere();
    scene.add(new THREE.Mesh(g, mat));
  }
}
mergeChunked(LIT, SEAS.seasonMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0.4));
mergeChunked(FLAT, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
{ const m = new THREE.MeshBasicMaterial({ vertexColors: true }); m.userData.glow = 1; if (LAMPH.length) mergeChunked(LAMPH, m); }
indexSolids();
// Курьера ставим раньше всех: припаркованные, трафик и прохожие заводятся
// вокруг него, а не вокруг центра карты — иначе первый заказ уезжает за
// полтора километра, а у бордюра можно проснуться внутри чужой машины.
startPose();

// припаркованные живут в общем списке машин: их так же мнёт, кидает и взрывает
for (const [px, pz, ry] of PARKED) {
  if (Math.hypot(px - V.x, pz - V.z) < 11) continue;
  const t = {
    ...newCar(true), x: px, z: pz, h: ry,
  };
  poseOnSlope(t);
  scene.add(t.mesh);
  TRAFFIC.push(t);
}
spawnTraffic(INTRO ? 22 : 36);
if (!INTRO) { buildSpots(); buildCollect(); }
buildNitro();
/* ─────────────── сутки, погода, облака и птицы ───────────────
   Время идёт: утро → день → вечер → ночь → утро, полный круг за восемь
   минут. Небо, туман и свет плавно перетекают между ключевыми точками.
   Ночью стены и асфальт темнеют (у склеек без света — вручную, через
   цвет материала), в части окон зажигается свет, под фонарями — пятна
   света, перед курьером — фары. Иногда идёт дождь: небо сереет, туман
   ближе, по экрану косые струи, а сцепление падает — машину носит. */
const DAY_LEN = 480;
const SKY_KEYS = [
  // доля суток (0 — шесть утра), небо, туман, солнце: цвет и сила, полусфера: небо, земля, сила, эмбиент, ночь
  [0.00, '#f2c7a6', '#f3d6bf', '#ffcf9a', 0.85, '#ffe6d0', '#b6a896', 1.25, 0.42, 0.3],
  // солнечный день — больше половины круга, ночь — около шестой части
  [0.07, '#a8daf4', '#d8edfa', '#fff6e4', 1.5, '#eaf7ff', '#b6c8a6', 1.75, 0.5, 0],
  [0.62, '#a8daf4', '#d8edfa', '#fff6e4', 1.5, '#eaf7ff', '#b6c8a6', 1.75, 0.5, 0],
  [0.70, '#f0a070', '#eab48e', '#ffac6a', 0.9, '#ffd2b0', '#a89480', 1.1, 0.4, 0.35],
  [0.77, '#1b2344', '#1e2746', '#8fa8ff', 0.3, '#5a6a9a', '#1e2630', 0.55, 0.22, 1],
  [0.93, '#1b2344', '#1e2746', '#8fa8ff', 0.3, '#5a6a9a', '#1e2630', 0.55, 0.22, 1],
  [1.00, '#f2c7a6', '#f3d6bf', '#ffcf9a', 0.85, '#ffe6d0', '#b6a896', 1.25, 0.42, 0.3],
];
const RAIN_SKY = new THREE.Color('#8d97a3');
const ENV = { t: 0.02, night: 0, rain: 0, rainWant: 0, rainT: 150, rainLeft: 0, phase: '' };
const SKY_C = new THREE.Color(), FOG_C = new THREE.Color(), CA = new THREE.Color(), CB = new THREE.Color();
const hemi = scene.children.find(o => o.isHemisphereLight), amb = scene.children.find(o => o.isAmbientLight);
const FLAT_MATS = [];                                // склейки без света: их темним вручную
scene.traverse(o => { if (o.isMesh && o.material && o.material.isMeshBasicMaterial && o.material.vertexColors && !o.material.userData.glow && !FLAT_MATS.includes(o.material)) FLAT_MATS.push(o.material); });

/* пятна света под фонарями и окна, в которых вечером зажигается свет */
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,220,150,1)'); g.addColorStop(0.5, 'rgba(255,200,120,.45)'); g.addColorStop(1, 'rgba(255,190,110,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const POOL_MAT = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  polygonOffset: true, polygonOffsetFactor: -4 });
const WIN_MAT = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
const NIGHT_OBJ = [];
function buildNight () {
  const pools = [];
  const spots = LAMP_SPOTS.concat(PROPS.filter(p => p.kind === 'lamp').map(p => [p.x + 1.3, p.z]));
  for (const [x, z] of spots) {
    const g = new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2);
    g.translate(x, groundH(x, z) + curbAt(x, z) + 0.3, z);
    pools.push(g);
  }
  // склейка по клеткам — что не в кадре, не рисуется
  const byChunk = new Map();
  for (const g of pools) {
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3()), k = Math.floor(c.x / CHUNK) + ',' + Math.floor(c.z / CHUNK);
    if (!byChunk.has(k)) byChunk.set(k, []);
    byChunk.get(k).push(g);
  }
  for (const list of byChunk.values()) {
    const m = new THREE.Mesh(mergeUV(list), POOL_MAT);
    m.visible = false; m.renderOrder = 2;
    scene.add(m); NIGHT_OBJ.push(m);
  }
  // окна — тоже по клеткам: одним мешем на весь город они рисовались
  // целиком, даже за спиной, — сто с лишним тысяч треугольников ночью
  const winBy = new Map();
  for (let i = 0; i < WINQ.length; i += 18) {
    const k = Math.floor(WINQ[i] / CHUNK) + ',' + Math.floor(WINQ[i + 2] / CHUNK);
    if (!winBy.has(k)) winBy.set(k, []);
    const arr = winBy.get(k);
    for (let j = 0; j < 18; j++) arr.push(WINQ[i + j]);
  }
  for (const arr of winBy.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, WIN_MAT);
    m.visible = false;
    scene.add(m); NIGHT_OBJ.push(m);
  }
  WINQ.length = 0;
}
/* склейка с текстурными координатами (mergeGeos берёт цвета, а тут нужны uv) */
function mergeUV (list) {
  let vn = 0, iN = 0;
  for (const g of list) { vn += g.attributes.position.count; iN += g.index.count; }
  const pos = new Float32Array(vn * 3), uv = new Float32Array(vn * 2), idx = new Uint32Array(iN);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/* фары курьера: светлое пятно на асфальте перед машиной */
const HEAD_MAT = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
const headGlow = new THREE.Mesh(new THREE.PlaneGeometry(7, 14).rotateX(-Math.PI / 2), HEAD_MAT);
headGlow.renderOrder = 3;
scene.add(headGlow);

/* дождь: косые струи вокруг камеры */
const RAIN_N = 1400;
const rainPos = new Float32Array(RAIN_N * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xe4ecf7, transparent: true, opacity: 0, depthWrite: false });
const rainLines = new THREE.LineSegments(rainGeo, rainMat);
rainLines.frustumCulled = false; rainLines.visible = false;
scene.add(rainLines);
for (let i = 0; i < RAIN_N; i++) { rainPos[i * 6] = rand(-35, 35); rainPos[i * 6 + 1] = rand(-5, 30); rainPos[i * 6 + 2] = rand(-35, 35); }

/* облака: плоские снизу кучки, плывут по ветру, держатся вокруг курьера */
const CLOUD_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, fog: false });
const CLOUDS = [];
function initClouds () {
  for (let i = 0; i < 12; i++) {
    const parts = [];
    const n = 4 + ((Math.random() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const r = rand(6, 12);
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.scale(1, 0.55, 1);
      put(parts, g, '#ffffff', rand(-14, 14), rand(0, 3), rand(-8, 8));
    }
    const m = new THREE.Mesh(mergeGeos(parts), CLOUD_MAT);
    m.position.set(V.x + rand(-320, 320), rand(95, 130), V.z + rand(-320, 320));
    scene.add(m);
    CLOUDS.push(m);
  }
}

/* птицы: стайки высоко в небе и голуби на тротуарах, которые взлетают из-под колёс */
const BIRD_BODY = new THREE.BoxGeometry(0.16, 0.14, 0.42);
const BIRD_WING = (() => { const g = []; for (const s of [-1, 1]) { const w = new THREE.BoxGeometry(0.46, 0.03, 0.2); w.rotateZ(s * 0.35); w.translate(s * 0.26, 0.06, 0); put(g, w, '#ffffff', 0, 0, 0); } return mergeGeos(g); })();
const BIRD_MAT = new THREE.MeshLambertMaterial({ color: 0x5b5e66, flatShading: true });
const PIGEON_MAT = new THREE.MeshLambertMaterial({ color: 0x8a8f9c, flatShading: true });
function makeBird (mat, s) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(BIRD_BODY, mat));
  const w = new THREE.Mesh(BIRD_WING, mat);
  g.add(w);
  g.scale.setScalar(s);
  g.userData.wing = w;
  scene.add(g);
  return g;
}
const FLOCKS = [], PIGEONS = [];
function initBirds () {
  for (let f = 0; f < 2; f++) {
    const fl = { cx: V.x + rand(-80, 80), cz: V.z + rand(-80, 80), y: rand(35, 55), a: rand(0, 6), r: rand(30, 50), w: rand(0.25, 0.4) * (chance(0.5) ? 1 : -1), birds: [] };
    for (let i = 0; i < 6; i++) fl.birds.push({ g: makeBird(BIRD_MAT, 2.2), o: i, ph: rand(0, 6) });
    FLOCKS.push(fl);
  }
  for (let k = 0; k < 3; k++) {
    const grp = { birds: [], x: 0, z: 0, fly: 0, t: 0 };
    for (let i = 0; i < 5; i++) grp.birds.push({ g: makeBird(PIGEON_MAT, 0.9), dx: 0, dz: 0, vy: 0, vx: 0, vz: 0, ph: rand(0, 6) });
    placePigeons(grp);
    PIGEONS.push(grp);
  }
}
/* голуби садятся на тротуар у скамейки или на дворовую дорожку рядом с курьером */
function placePigeons (grp) {
  let x = V.x, z = V.z;
  const near = BENCHES.filter(b => { const d = Math.hypot(b.x - V.x, b.z - V.z); return d > 50 && d < 170; });
  if (near.length) { const b = pick(near); x = b.x + rand(-3, 3); z = b.z + rand(-3, 3); }
  else { const p = { yard: true }; walkSpawn(p, 50, 170); if (p.x !== undefined) { x = p.x; z = p.z; } }
  grp.x = x; grp.z = z; grp.fly = 0; grp.t = 0;
  for (const b of grp.birds) {
    b.dx = rand(-1.6, 1.6); b.dz = rand(-1.6, 1.6); b.vy = 0;
    b.g.position.set(x + b.dx, groundH(x + b.dx, z + b.dz) + curbAt(x + b.dx, z + b.dz) + 0.07, z + b.dz);
    b.g.rotation.set(0, rand(0, 6.28), 0);
    b.g.userData.wing.scale.y = 0.2;
    b.g.visible = true;
  }
}

/* фаза — ключ (по-русски, не переводится), для показа — envPhaseName */
function envPhase (t) { return t < 0.06 ? 'утро' : t < 0.66 ? 'день' : t < 0.75 ? 'вечер' : t < 0.96 ? 'ночь' : 'утро'; }
function envPhaseName (t) { return $t({ утро: N_('утро'), день: N_('день'), вечер: N_('вечер'), ночь: N_('ночь') }[envPhase(t)]); }
const envClock = () => { const h = (6 + ENV.t * 24) % 24; return String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60 / 10) * 10).padStart(2, '0'); };

function updateEnv (dt) {
  if (INTRO) return;
  ENV.t = (ENV.t + dt / DAY_LEN) % 1;
  // ключевые точки суток
  let i = 0;
  while (i < SKY_KEYS.length - 2 && ENV.t >= SKY_KEYS[i + 1][0]) i++;
  const A = SKY_KEYS[i], B = SKY_KEYS[i + 1], k = ease(clamp((ENV.t - A[0]) / (B[0] - A[0]), 0, 1));
  const mix = (a, b) => CA.set(a).lerp(CB.set(b), k);
  // погода: изредка дождь на минуту-полторы
  if (S.state !== 'title' && S.state !== 'over') {
    ENV.rainT -= dt;
    if (ENV.rainT <= 0) {
      // дождь редко и ненадолго: чаще светит солнце
      if (ENV.rainWant) { ENV.rainWant = 0; ENV.rainT = rand(150, 260); toast(SEAS.snowy() ? $t('снег перестал') : $t('дождь кончился — снова солнце')); }
      else if (chance(0.22)) { ENV.rainWant = 1; ENV.rainT = rand(40, 70); toast(SEAS.snowy() ? $t('пошёл снег — дорога скользкая') : $t('пошёл дождь — дорога скользкая')); }
      else ENV.rainT = rand(90, 160);
    }
  }
  ENV.rain = damp(ENV.rain, ENV.rainWant, 0.6, dt);
  const R = ENV.rain;
  SKY_C.copy(mix(A[1], B[1])).lerp(RAIN_SKY, R * 0.6 * (1 - ENV.night * 0.6));
  FOG_C.copy(mix(A[2], B[2])).lerp(RAIN_SKY, R * 0.6 * (1 - ENV.night * 0.6));
  scene.background.copy(SKY_C);
  scene.fog.color.copy(FOG_C);
  scene.fog.far = (470 - R * 170) * CULL.Q.k;      // CULL.Q — страховка дальности на слабом железе
  sun.color.copy(mix(A[3], B[3]));
  sun.intensity = lerp(A[4], B[4], k) * (1 - R * 0.55);
  if (hemi) { hemi.color.copy(mix(A[5], B[5])); hemi.groundColor.copy(mix(A[6], B[6])); hemi.intensity = lerp(A[7], B[7], k) * (1 - R * 0.25); }
  if (amb) amb.intensity = lerp(A[8], B[8], k);
  ENV.night = lerp(A[9], B[9], k);
  // солнце ходит по небу: днём высоко, вечером низко
  const sa = ENV.t * Math.PI * 2;
  sun.position.set(V.x + Math.cos(sa) * 160, 60 + Math.max(0, Math.sin(sa * 0.5 + 0.3)) * 140, V.z + 90);
  // склейки без света: темнеют вместе с вечером
  const dk = lerp(1, 0.34, ENV.night) * (1 - R * 0.18);
  for (const m of FLAT_MATS) m.color.setRGB(dk, dk, dk * (1 + ENV.night * 0.12));
  const nOn = ENV.night > 0.05;
  POOL_MAT.opacity = ENV.night * 0.75; WIN_MAT.opacity = clamp(ENV.night * 1.1, 0, 0.95);
  for (const m of NIGHT_OBJ) m.visible = nOn;
  // фары
  HEAD_MAT.opacity = clamp((ENV.night - 0.15) * 0.9 + R * 0.25, 0, 0.7);
  headGlow.visible = HEAD_MAT.opacity > 0.02 && S.state !== 'title' && S.state !== 'over';
  if (headGlow.visible) {
    const fx = Math.sin(V.h), fz = Math.cos(V.h), hx = V.x + fx * 8.5, hz = V.z + fz * 8.5;
    headGlow.position.set(hx, surfaceAt(hx, hz, V.y) + 0.3, hz);
    headGlow.rotation.y = V.h;
  }
  // смена фазы — тостом, чтобы было видно, что время идёт
  const ph = envPhase(ENV.t);
  if (ph !== ENV.phase) {
    if (ENV.phase && S.state !== 'title' && S.state !== 'over') toast({ утро: $t('утро — светает'), день: $t('день'), вечер: $t('вечереет'), ночь: $t('ночь — включай фары') }[ph]);
    ENV.phase = ph;
  }
  // дождь
  rainLines.visible = R > 0.03;
  rainMat.opacity = R * 0.85;
  if (rainLines.visible) {
    rainLines.position.set(cam.position.x, cam.position.y - 8, cam.position.z);
    const fall = 34 * dt;
    for (let j = 0; j < RAIN_N; j++) {
      const o = j * 6;
      let y = rainPos[o + 1] - fall;
      if (y < -8) { y = 30; rainPos[o] = rand(-35, 35); rainPos[o + 2] = rand(-35, 35); }
      rainPos[o + 1] = y;
      rainPos[o + 3] = rainPos[o] + 0.5; rainPos[o + 4] = y + 1.8; rainPos[o + 5] = rainPos[o + 2] + 0.3;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  // облака: ветер, дождь сереет, ночью темнеют сами от света
  CLOUD_MAT.color.setRGB(1 - R * 0.4, 1 - R * 0.38, 1 - R * 0.33);
  for (const c of CLOUDS) {
    c.position.x += 2.2 * dt;
    if (c.position.x - V.x > 330) c.position.x -= 660; else if (c.position.x - V.x < -330) c.position.x += 660;
    if (c.position.z - V.z > 330) c.position.z -= 660; else if (c.position.z - V.z < -330) c.position.z += 660;
  }
  updateBirds(dt);
}

function updateBirds (dt) {
  for (const fl of FLOCKS) {
    fl.a += fl.w * dt;
    // стая держится недалеко от курьера
    fl.cx = damp(fl.cx, V.x, 0.08, dt); fl.cz = damp(fl.cz, V.z, 0.08, dt);
    for (const b of fl.birds) {
      const a = fl.a - b.o * 0.09 * Math.sign(fl.w), r = fl.r + (b.o % 2 ? 2 : -2) * Math.ceil(b.o / 2);
      const x = fl.cx + Math.cos(a) * r, z = fl.cz + Math.sin(a) * r;
      b.g.position.set(x, fl.y + Math.sin(tG * 1.3 + b.o) * 1.2, z);
      b.g.rotation.y = Math.atan2(-Math.sin(a) * Math.sign(fl.w), Math.cos(a) * Math.sign(fl.w));
      b.ph += dt * 9;
      b.g.userData.wing.scale.y = Math.sin(b.ph) * 1.2;
      b.g.visible = !ENV.night || ENV.night < 0.8;
    }
  }
  const sp = Math.hypot(V.vx, V.vz);
  for (const grp of PIGEONS) {
    const d = Math.hypot(grp.x - V.x, grp.z - V.z);
    if (!grp.fly) {
      if (d > 260) { placePigeons(grp); continue; }
      // машина близко — вспархивают все разом
      if (d < 13 && sp > 2 || d < 5) {
        grp.fly = 1; grp.t = 0;
        for (const b of grp.birds) {
          const dx = b.g.position.x - V.x, dz = b.g.position.z - V.z, l = Math.hypot(dx, dz) || 1;
          b.vx = dx / l * rand(4, 7) + rand(-2, 2); b.vz = dz / l * rand(4, 7) + rand(-2, 2); b.vy = rand(4, 7);
          b.g.rotation.y = Math.atan2(b.vx, b.vz);
        }
        if (d < 40) Snd.blip(900, 0.05, 'square', 0.03);
        continue;
      }
      for (const b of grp.birds) {
        // клюют: голова вниз-вверх, изредка переступают
        b.ph += dt * rand(2, 5);
        b.g.rotation.x = Math.max(0, Math.sin(b.ph)) * 0.5;
      }
    } else {
      grp.t += dt;
      for (const b of grp.birds) {
        b.g.position.x += b.vx * dt; b.g.position.y += b.vy * dt; b.g.position.z += b.vz * dt;
        b.vy = Math.max(1.5, b.vy - dt * 1.5);
        b.g.rotation.x = -0.3;
        b.ph += dt * 22;
        b.g.userData.wing.scale.y = Math.sin(b.ph) * 1.3;
      }
      if (grp.t > 9) placePigeons(grp);             // улетели — сядут где-то ещё
    }
  }
}

/* ─────────────── ночные компании ───────────────
   Как стемнеет, у кафе и ресторанов, у подъездов и на детских площадках
   собираются компании: стоят кружком с газировкой, пританцовывают и поют
   на весь двор. Алкоголя нет — площадки такое не пропускают. Утром и днём
   их нет — к рассвету расходятся. Заводим только компании рядом с курьером (не
   больше пяти сразу), остальные «ждут» в списке мест. */
const PUB_SPOTS = [];
const CROWDS = [];
/* детская версия — поют с газировкой, взрослая — пьют и рыгают, как было */
const BURPS = ADULT
  ? [$t('*рыг*'), $t('БУЭЭЭ'), $t('ЫЫЫК'), $t('за здоровье!'), $t('ещё по одной'), $t('ну ты это…'), $t('уважаю!'), $t('*ик*')]
  : ['♪ ' + $t('ла-ла-ла') + ' ♪', '♪ ' + $t('о-о-о') + ' ♪', $t('ещё песню!'), $t('давай хором!'), $t('ну ты это…'), $t('уважаю!'), $t('красиво поёшь!'), '♪ ♫ ♪'];
function buildPubSpots () {
  const pubName = /бар|bar|паб|pub|пив|beer|вин|wine|разлив|двор|друзья|егерь|мясо|хинкал|швили|авлабар/i;
  const coffee = /coffee|кофе|cofix|шоколад|crepe|bakery|круассан|cinnabon|чай|морс|healthy|drinkit|даблби|wakecup/i;
  for (const poi of CITY.pois) {
    if (!poi.w) continue;
    const ok = (ADULT && poi.k === 'grocery' && /пив|beer|вин|разлив/i.test(poi.n0)) || ((poi.k === 'food' || poi.k === 'cafe') && pubName.test(poi.n0)) || (poi.k === 'food' && !coffee.test(poi.n0) && chance(0.5));
    if (!ok) continue;
    const [wx, wz, nx, nz] = poi.w;
    const x = wx + nx * 4.2, z = wz + nz * 4.2;
    if (!inBounds(x, z, 20) || inHouse(x, z, 1.5)) continue;
    const r = nearestRoad(x, z, DRIVE_MAX, 1);
    if (r && r.d < r.seg.w / 2 + 1) continue;
    PUB_SPOTS.push({ x, z, kind: 'bar', name: poi.n });
  }
  // и у подъездов — у каждого четвёртого
  for (const [ex, ez, nx, nz] of CITY.entrances) {
    if (!chance(0.25)) continue;
    const x = ex + nx * 4, z = ez + nz * 4;
    if (!inBounds(x, z, 20) || inHouse(x, z, 1.5)) continue;
    const r = nearestRoad(x, z, DRIVE_MAX, 1);
    if (r && r.d < r.seg.w / 2 + 1) continue;
    PUB_SPOTS.push({ x, z, kind: 'yard' });
  }
  for (const g of CITY.green) {
    if (g.k !== 'play') continue;
    let x = 0, z = 0;
    for (const q of g.p) { x += q[0] / g.p.length; z += q[1] / g.p.length; }
    x += 3; z += 3;                                   // рядом с песочницей, а не в ней
    if (!inBounds(x, z, 20) || !inPoly(x, z, g.p) || inHouse(x, z, 2)) continue;
    PUB_SPOTS.push({ x, z, kind: 'play' });
  }
}

function spawnCrowd (sp) {
  const n = (sp.kind === 'bar' ? 6 : 4) + ((Math.random() * 4) | 0), rad = 1.5 + n * 0.14, turn = rand(0, 6.28);
  const people = [];
  for (let i = 0; i < n; i++) {
    const a = turn + i / n * Math.PI * 2 + rand(-0.2, 0.2);
    const x = sp.x + Math.sin(a) * rad, z = sp.z + Math.cos(a) * rad;
    if (inHouse(x, z, 0.4)) continue;
    const person = chance(0.35) ? nextPerson() : null;          // иногда среди них — коллега
    const grp = makeHuman(person, { fat: chance(0.35) });
    // во взрослой — бутылка тёмного стекла, в детской — яркая баночка газировки
    const bottle = ADULT
      ? new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 6), new THREE.MeshLambertMaterial({ color: chance(0.5) ? 0x5a3a16 : 0x2f5a2a }))
      : new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), new THREE.MeshLambertMaterial({ color: pick([0xe04836, 0x4f7fd6, 0x59b06a, 0xffd23f, 0xff8ad0]) }));
    bottle.position.set(0, -0.55, 0.1);
    grp.userData.armR.add(bottle);
    grp.rotation.y = Math.atan2(sp.x - x, sp.z - z);
    grp.position.set(x, groundH(x, z) + curbAt(x, z), z);
    scene.add(grp);
    people.push({ grp, person, x, z, ph: rand(0, 6), drink: rand(1, 6), sway: rand(0.6, 1.4), dead: 0, shock: 0 });
  }
  CROWDS.push({ sp, people, burpT: rand(1, 3), say: null, sayT: 0 });
  sp.on = 1;
}
function dropCrowd (c) {
  for (const q of c.people) if (!q.dead) dropMesh(q.grp);
  if (c.say && c.say.parent) { c.say.parent.remove(c.say); c.say.material.dispose(); }
  c.sp.on = 0;
}

let crowdScanT = 0;
function updateCrowds (dt) {
  if (INTRO || !PUB_SPOTS.length) return;
  const on = ENV.night > 0.55;
  if (!on) {
    // рассвет: расходятся
    if (CROWDS.length) { for (const c of CROWDS) dropCrowd(c); CROWDS.length = 0; }
    return;
  }
  if ((crowdScanT -= dt) <= 0) {
    crowdScanT = 1;
    for (let i = CROWDS.length - 1; i >= 0; i--)
      if (Math.hypot(CROWDS[i].sp.x - V.x, CROWDS[i].sp.z - V.z) > 230) { dropCrowd(CROWDS[i]); CROWDS.splice(i, 1); }
    const near = PUB_SPOTS.filter(p => !p.on && Math.hypot(p.x - V.x, p.z - V.z) < 190)
      .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z));
    for (const sp of near) { if (CROWDS.length >= 6) break; spawnCrowd(sp); }
  }
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const c of CROWDS) {
    const dC = Math.hypot(c.sp.x - V.x, c.sp.z - V.z);
    for (const q of c.people) {
      if (q.dead) continue;
      const u = q.grp.userData;
      q.ph += dt;
      q.grp.visible = dC < 130;
      if (q.shock > 0) { q.shock -= dt; handsUp(u, dt); continue; }
      u.armL.rotation.z = 0; u.armR.rotation.z = 0;
      // пританцовывают и отпивают газировку
      q.grp.rotation.z = Math.sin(q.ph * q.sway) * 0.07;
      q.drink -= dt;
      const sip = q.drink < 0 ? Math.min(1, -q.drink * 3) * (q.drink > -1.2 ? 1 : 0) : 0;
      if (q.drink < -1.4) q.drink = rand(3, 8);
      u.armR.rotation.x = damp(u.armR.rotation.x, sip ? -2.3 : -0.5, 8, dt);
      u.head.rotation.x = damp(u.head.rotation.x, sip ? -0.45 : 0.05, 8, dt);
      u.armL.rotation.x = Math.sin(q.ph * 1.7) * 0.25;             // размахивают руками — разговор
      // под колёса — как все
      if (vsp > 3) {
        const dx = q.x - V.x, dz = q.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
          q.dead = 1; dropMesh(q.grp);
          gibHuman(q, V.vx, V.vz);
          S.people++;
          Snd.squish();
          toast($t('минус {what}', { what: q.person ? q.person.name : ADULT ? pick([$t('любитель пива'), $t('собутыльник'), $t('тостующий')]) : pick([$t('гитарист'), $t('певец'), $t('полуночник')]) }));
        }
      }
    }
    // поют по очереди: реплика над головой и пара нот, если рядом
    if (c.sayT > 0 && (c.sayT -= dt) <= 0 && c.say) { c.say.parent && c.say.parent.remove(c.say); c.say.material.dispose(); c.say = null; }
    if ((c.burpT -= dt) <= 0) {
      c.burpT = rand(2, 5);
      const alive = c.people.filter(q => !q.dead);
      if (alive.length && dC < 140) {
        const q = pick(alive), txt = pick(BURPS);
        if (c.say) { c.say.parent && c.say.parent.remove(c.say); c.say.material.dispose(); }
        c.say = sayBubble(q.grp, txt, ADULT ? '#5a7a2a' : '#5a4a9a', 2.6);
        c.sayT = 1.6;
        if (dC < 70 && ADULT && [0, 1, 2, 7].includes(BURPS.indexOf(txt))) { const v = 0.1 * (1 - dC / 70); Snd.blip(rand(70, 110), 0.35, 'sawtooth', v); Snd.noise(0.2, v * 0.8); }
        else if (dC < 70 && txt.includes('♪')) { const v = 0.06 * (1 - dC / 70), f0 = rand(330, 520); [0, 1, 2].forEach(i => setTimeout(() => Snd.blip(f0 * [1, 1.25, 1.5][i], 0.18, 'triangle', v), i * 180)); }
      }
    }
  }
}

buildPubSpots();

initPeds();
initPeople();
initScoots();
if (!INTRO) {
  buildNight(); initClouds(); initBirds();
  // прогрев шейдеров: дождь, ночной свет и фары впервые появляются посреди
  // смены — компиляция программ на лету давала заметный рывок
  const hid = [...NIGHT_OBJ, rainLines, headGlow];
  for (const o of hid) o.visible = true;
  renderer.compile(scene, cam);
  for (const o of hid) o.visible = false;
}
if (!INTRO) initSmokers();                         // во вступлении курилка — это кружок из кино

V.camX = V.x + 14; V.camZ = V.z + 14; V.camY = V.y + 6;
buildFullMap();
hudHearts();
resize();
function showTitle () {
  if (INTRO) return;
  showBig(OWN.pizza(),
    $t(GORE_ON ? MAP.tagline.adult : MAP.tagline.kids), '');
}
showTitle();

/* Прохожие дальше ста семидесяти метров и машины дальше двухсот
   восьмидесяти — точки в тумане: рисовать их незачем. Считаются они
   по-прежнему, прячем только меш. */
function cullFar () {
  const far2 = (x, z, r) => (x - V.x) ** 2 + (z - V.z) ** 2 > r * r;
  for (const list of [PEOPLE, PEDS, SCOOTS])
    for (const p of list) if (!p.dead) p.grp.visible = !far2(p.x, p.z, 130);
  for (const t of TRAFFIC) t.mesh.visible = !far2(t.x, t.z, 220);
}

/* ── геймпад: езда, карточки, меню (раскладка — в input/gamepad.js) ──
   Меню листаются крестовиной или стиком: какое сейчас открыто — то и
   листаем, остальное игнорируем. */
const padMenu = makePadMenu({
  onBack: () => { if (!elPanel.hidden) closePanel(); else if (S.paused) setPause(false); else if (FM.open) setFullMap(false); },
  onText: el => { if (Platform.steam && Platform.steam.textInput) Platform.steam.textInput(el); },
});
function padScreen () {
  if (!elPanel.hidden) return elPanel;
  if (FM.open) return null;
  if (!$('choice').hidden && CH.pause) return $('choice');
  if (S.paused && elPause && !elPause.hidden) return elPause;
  if (elPhone.classList.contains('on')) return elPhone;
  if (!$('over').hidden) return $('over');
  if (!elBig.hidden) return elBig;
  return null;
}
function padStep () {
  const p = pollPad();
  document.body.classList.toggle('pad', !!p.active);
  if (!p.connected) return;
  if (EXT.paused) return;
  if (p.any) { Snd.boot(); Snd.resume(); }
  const screen = padScreen();
  if (p.pause && !elPanel.hidden) closePanel();
  else if (p.pause && (S.paused || isPlaying())) setPause(!S.paused);
  if (p.map && !S.paused && isPlaying()) setFullMap(!FM.open);
  if (p.sound) Snd.set(!Snd.on);
  if (CH.opts.length && !CH.pause) { if (p.choice1) pickChoice(0); else if (p.choice2) pickChoice(1); else if (p.choice3) pickChoice(2); }
  if (screen) padMenu(p, screen);
  else if (!S.paused && !FM.open) applyToIN(IN, p);
}

/* что нужно life.js (парочки, богачи, графитисты, змеи и дроны): сам он
   переменных этого модуля не видит */
const LIFE_API = {
  THREE, scene, cam, V, S, ENV, CITY, ADULT, HUMAN_VC, CAR_L, CAR_W, TRAFFIC, Snd,
  groundH, curbAt, inHouse, inPoly, inBounds, nearestRoad, pushOut, walkerStep, walkSpawn, walkBack,
  ARCHES, makeHuman, dropMesh, makeCar, newCar, poseOnSlope, gibHuman, handsUp, emote, puff, sayBubble, toast, put, mergeGeos,
  onKill: () => { S.people++; Snd.squish(); },
};

/* ─────────────── цикл ─────────────── */
let last = performance.now(), tG = 0;

function frame (now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, (now - last) / 1000);
  const dt = clamp(raw, 0, 1 / 20);     // назад время не идёт
  last = now;
  CULL.govern(raw, isPlaying() && !S.paused && !EXT.paused && !FM.open && !document.hidden);
  padStep();
  if (S.paused || EXT.paused || DLG.isOpen()) return;     // диалог — мир стоит
  if (FM.open) { drawFullMap(); return; }        // на карте игра стоит
  tG += dt;
  if (isPlaying() && !S.ride && S.state !== 'brief' && S.state !== 'loading') S.shiftT = (S.shiftT || 0) + dt;

  let vf = 0;
  if (S.state === 'dying') {
    for (const k in IN) IN[k] = 0;              // руль из рук выпал, машина катится сама
    vf = driveStep(dt);
    deathTick(dt);
  } else if (S.state === 'brief' || S.state === 'loading') {
    touches.clear();
    for (const k in IN) IN[k] = 0;              // руль заблокирован до загрузки
    vf = driveStep(dt);
    camStep(dt, vf);
  } else if (S.state === 'title' || S.state === 'over') {
    // На заставке камера облетает пиццерию поверх крыш: в настоящем городе
    // дома вокруг выше, и на прежней высоте кадр уезжал внутрь стены.
    const a = tG * 0.16;
    cam.position.set(PIZZA.bx + Math.sin(a) * 64, PIZZA.by + 42 + Math.sin(a * 0.7) * 4, PIZZA.bz + Math.cos(a) * 64);
    cam.lookAt(PIZZA.bx, PIZZA.by + 3, PIZZA.bz);
    car.position.set(V.x, V.y, V.z);
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
  updateScoots(dt);
  if (MAPFIX || MAPCHECK) MAPW.step(dt, MAPW_API || (MAPW_API = mapApi()));     // дорожники, каток, ?mapcheck
  updateDrivers(dt);
  updateAmb(dt);
  updateThief(dt);
  updateAccidents(dt);
  RL.step(dt, RL_API || (RL_API = roadApi()));    // пробки, ремонт, знаки, фары потока (roadlife.js)
  updateRivals(dt);
  updateVerandas(dt);
  choiceStep(dt);
  updateSmokers(dt);
  updateParties(dt);
  updateCollect(dt);
  updateTrunk(dt);
  updateArrow(dt);
  updateGuide(dt);
  separateWalkers(dt);
  updateGibs(dt);
  updateGore(dt);
  updateFly(dt);
  updateNitro(dt);
  updateFX(dt);
  updateEnv(dt);
  SEAS.updateSeasons(dt);                         // снег, небо, снежки
  updateCrowds(dt);
  LIFE.step(dt, LIFE_API);
  LM.stepRink(RINK, dt, V.x, V.z);
  updateDrinkit(dt);
  updateSurf(dt);
  updateFootball(dt);
  S.hurt = Math.max(0, S.hurt - dt);

  if (S.state === 'drive') syncTarget();          // цель идёт по улице сама
  if (S.state === 'side') {
    S.time -= dt;
    if (S.time < 6) { S.tickT += dt; if (S.tickT > 0.4) { S.tickT = 0; Snd.tick(); } }
    if (S.time < 0) sideEnd(false, $t('не успел — клиент передумал'));
    else checkArrival(dt);
    S.routeT += dt;
    if (S.routeT > 0.35) { S.routeT = 0; rebuildRoutePath(); }
  }
  if (S.state === 'drive' || S.state === 'back') {
    if (!S.free) {                                // без времени срок стоит
      S.time -= dt;
      if (S.time < 6) { S.tickT += dt; if (S.tickT > 0.4) { S.tickT = 0; Snd.tick(); } }
      if (S.time < -GRACE) gameOver('не успел', [], { x: V.x, z: V.z });
    }
    checkArrival(dt);
    S.routeT += dt;
    if (S.routeT > 0.35) { S.routeT = 0; rebuildRoutePath(); }
  } else if (S.state === 'handover') {
    S.handT -= dt;
    if (S.handT <= 0) {
      if (!S.order) { if (mealDue()) showMeal(); else newOrder(); }
      else backToBase();
    }
  }

  // маркер адреса: пульсирует и крутится, его видно издалека
  if (S.target && S.state !== 'title' && S.state !== 'over') {
    marker.visible = true;
    marker.position.set(S.target.x, groundH(S.target.x, S.target.z), S.target.z);
    marker.rotation.y = tG * 1.2;
    marker.userData.ball.position.y = 6.6 + Math.sin(tG * 3) * 0.45;
    const p = 1 + Math.sin(tG * 3.4) * 0.12;
    marker.userData.ring.scale.set(p, p, p);
  } else marker.visible = false;

  cullFar();
  humanLod();
  drawRadar();
  hudStep(dt);
  rivalsStep(dt);

  // машину потряхивает после удара
  if (S.state !== 'intro') car.position.y = V.y + (V.kerb || 0) + (S.hurt > 0 ? Math.sin(tG * 60) * 0.06 : 0);
  if (S.hp <= 2 && S.state !== 'title' && S.state !== 'over') {
    S.smokeT = (S.smokeT || 0) - dt;
    if (S.smokeT <= 0) {
      S.smokeT = S.hp <= 1 ? 0.12 : 0.3;
      puff(V.x + Math.sin(V.h) * 1.9, 1.2, V.z + Math.cos(V.h) * 1.9, S.hp <= 1, rand(0.5, 0.9));
      if (S.hp <= 1 && chance(0.35)) fire(V.x + Math.sin(V.h) * 1.9, 1.1, V.z + Math.cos(V.h) * 1.9);
    }
  }

  CULL.step();
  renderer.render(scene, cam);
}
// шейдеры всех материалов города — сейчас, под экраном загрузки, а не рывком
// в первый раз, когда кусок попадёт в кадр (зимой на Деке это было 150 мс)
try { renderer.compile(scene, cam); } catch (e) { /* — */ }
CULL.freeze(scene, cam, PROPS);                   // город собран: неподвижное — в заморозку и отсечение
requestAnimationFrame(frame);

/* отладочная ручка */
/* отладочная ручка — только в dev и с ?debug: в релизе через неё можно было бы накрутить таблицу */
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) window.__dlv = { RL: RL.DEBUG, S, V, TRAFFIC, PEDS, PEOPLE, PIZZA, NODES, BENCHES, PROPS, SOLIDS, RINGS, YARD_RINGS, PARKINGS, LB, get car () { return car; }, get route () { return routePts; }, CAREER, DLG, ZN, ECON, donated, get RINK () { return RINK; }, FUEL_LOG: LM.FUEL_LOG, CULL: CULL.STATS, RAISED, SOLID_GRID, HOUSE_GRID, SMASH, setFullMap, setPause, newOrder, acceptOrder, gameOver, dentCar, boom, sparks, blood, runOver, wreckCar, knockCar, setGate, clearGate,
  // отладка города: посмотреть на карту сверху и проверить геометрию
  CITY, HOUSES, RSEG, scene, renderer, cam, nearestRoad, startPose, THREE,
  // рельеф и шаг цикла: прогнать смену без экрана, когда вкладка скрыта
  groundH, surfaceAt, BRIDGES, frame,
  // Москва: граф, светофоры, зебры, самокатчики, ввод
  EDGES, SIG_GROUPS, ZEBRAS, SCOOTS, TL, IN, touches, lightOf, edgeOf,
  DRIVERS, SMOKERS, NITRO_CANS, NOS, DRINKITS, CREW, WAR, warStart, SURF, surfPlan, PITCHES, ACCIDENTS, spawnAccident, CROWDS, PUB_SPOTS, RECENT, sectorOf, SMASH, VERANDAS, ARCHES, GEN_ENTR, ENV, CLOUDS, PIGEONS, AMB, INCIDENTS, scare, RIVALS, THIEF, spawnThief, showMeal, offerSide, CH, pickChoice, slackFor, routeLen, FXS, SIGNS, stallCar, Snd, RAMPS, BUILD_MS, BUILD_T, SPOTS, PARTIES, COL_ON_MAP, COLLECT };
// ?mapcheck: сводка проблем карты, столбики над ними, «]» — к следующей (mapworks.js)
if (MAPCHECK) MAPW.debug(MAPFIX, MAPW_API || (MAPW_API = mapApi()));
