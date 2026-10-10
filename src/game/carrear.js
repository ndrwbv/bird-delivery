/* ──────────────────────────────────────────────────────────────────────────
   Зад своей машины подробно (09.10.2026, группа Ж1 docs/IDEAS.md).
   Правила словами — docs/CAREER.md «Зад машины и багажник».

   Камера всегда сзади — поэтому зад машины игрока (makeCar opts.see) собран
   подробно; машины потока — как были (дальние, их много).
     «Крупно и мало» (10.10.2026, автор: «много лишних деталей, ощущаются
     грязно»): с камеры (6—8 м) читаются только крупные формы и 2—3 акцента —
     фонари, номер, бампер. Мелочь, которая на «Деке» мельче пикселя, убрана:
     заклёпки, замок и шильдик крышки, катафоты, крюк, хром брызговиков,
     кольцо на трубе, швы и ручка задней двери, рифлёные полоски фонарей,
     мелкие надписи на номере и наклейках.
     • выхлопная труба — сзади справа (−X, как у настоящей «семёрки»), с
       тёмным срезом и глушителем; оттуда же идут дым (exhaust.js) и пламя
       нитро (game.js) — точка трубы: car.userData.pipe. Двойной выхлоп
       (мотор 2-й ступени) — по краям, как был, со срезами;
     • задние фонари с глубиной: рамка-ниша вокруг каждого блока (стоп-сигнал
       горит в глубине), гладкое красное стекло и белое стекло заднего хода.
       Всё стекло фонаря — в меше фар (cars.js dress), поэтому бьётся целиком,
       как раньше (carglass.js, carlights.js kill);
     • бампер: одна тёмная полоса во всю ширину, рамка и номер — светлая
       плашка с крупными знаками «А 070 ПЦ» в ровной тёмной рамке; одним мешем
       с бампером: мнётся и отваливается вместе с ним;
     • крышка багажника (седаны): гладкая, обивка изнутри, сверху у заднего
       края — один круглый логотип пиццерии (птичка). У машин без багажника —
       тот же логотип посередине задней двери, у машин с запаской — на её колпаке;
     • задняя дверь у машин без багажника (10.10.2026) — своя панель над
       бампером, петля снизу: после аварии приоткрывается и распахивается
       (cardent.js REARD), за ней тёмный проём и коробки с пиццей; у машин с
       запаской на двери — как была, не открывается;
     • брызговики за задними колёсами — чёрные;
     • багажник внутри (седаны): ванна с обивкой, термосумка, огнетушитель;
       коробки с пиццей — сколько их сейчас в машине (до PIZZAS), видно, когда
       крышка открыта (загрузка, вручение).
   Кадр: почти всё — в общей склейке кузова; новые отрисовки — логотип и номер
   (по одной на крышку/дверь и бампер, одна текстура на все) и коробки в
   багажнике (только пока крышка открыта).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { BODY } from './carbody.js';

const CORNER = BODY.CORNER;

/* PIPE_X — где одна труба (м от середины, − — справа), PIPE_DUAL — пара по краям; PIZZAS — коробок в багажнике не больше */
export const REAR = { PIPE_X: -0.42, PIPE_DUAL: 0.25, PIZZAS: 4 };
export const STATS = { built: 0, cargo: 0, open: false };

const PLATE_NUM = 'А 070 ПЦ';                        // номер — буквы как на настоящем, не переводится

/* ─── текстура логотипа и номера: 512×256 ───
   «Крупно и мало» (10.10.2026, автор: «много лишних деталей, ощущаются грязно»): с камеры (6—8 м) читаются только
   крупные формы — поэтому один круглый логотип и номер без мелочи (без региона, RUS и флажка): светлая плашка,
   ровная тёмная рамка, крупные знаки */
const ATLAS = new Map();
const R = { round: [0, 0, 256, 256], plate: [256, 101, 512, 155] };
function atlas (brand, logo) {
  const key = 'own';                                // название больше не пишем (мелко) — текстура одна на всех
  if (ATLAS.has(key)) return ATLAS.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const rr = (x0, y0, w, h, r) => { x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x0 + w, y0, x0 + w, y0 + h, r); x.arcTo(x0 + w, y0 + h, x0, y0 + h, r); x.arcTo(x0, y0 + h, x0, y0, r); x.arcTo(x0, y0, x0 + w, y0, r); x.closePath(); };
  // логотип: оранжевый круг в белом кольце, птичка посередине
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(128, 128, 126, 0, 7); x.fill();
  x.fillStyle = '#f0522a'; x.beginPath(); x.arc(128, 128, 108, 0, 7); x.fill();
  if (logo) logo(x, 116, 140, 6);
  // номер: тёмная рамка, светлая плашка, крупные знаки во всю высоту
  x.fillStyle = '#1b1a1f'; rr(256, 101, 256, 54, 6); x.fill();
  x.fillStyle = '#f4f4f0'; rr(260, 105, 248, 46, 4); x.fill();
  x.fillStyle = '#1b1a1f'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(PLATE_NUM, 384, 129, 232);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = { t };
  ATLAS.set(key, m);
  return m;
}
/* наклейки одним мешем: q — { r: область атласа, w, h, at: [x, y, z], up — лежит сверху (иначе смотрит назад) } */
function decal (parent, brand, logo, list) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const q of list) {
    const [px0, py0, px1, py1] = R[q.r], u0 = px0 / 512, u1 = px1 / 512, v0 = 1 - py1 / 256, v1 = 1 - py0 / 256;
    const [x, y, z] = q.at, hw = q.w / 2, hh = q.h / 2, o = pos.length / 3;
    // сзади камера смотрит вперёд (+Z): её «вправо» — это −X, поэтому левый край надписи — на +X
    if (q.up) pos.push(x + hw, y, z - hh, x - hw, y, z - hh, x - hw, y, z + hh, x + hw, y, z + hh);
    else pos.push(x + hw, y - hh, z, x - hw, y - hh, z, x - hw, y + hh, z, x + hw, y + hh, z);
    for (let i = 0; i < 4; i++) nor.push(0, q.up ? 1 : 0, q.up ? 0 : -1);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: atlas(brand, logo).t, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(geo, mat);
  m.userData.decal = 1;
  parent.add(m);
  return m;
}

/* панель (бампер, крышка) — с мелочами одним мешем: цвет по вершинам, мнётся и отлетает как была */
export function dressPanel (mesh, hex, parts, k) {
  const list = [];
  const base = mesh.geometry;
  const prm = base.parameters;
  k.put(list, base.clone(), hex, 0, 0, 0);
  for (const [geo, h, x, y, z] of parts) k.put(list, geo, h, x, y, z);
  const geo = k.mergeGeos(list);
  geo.parameters = prm;                         // по глубине 0,22 dentCar узнаёт бампер (отлетает)
  base.dispose();
  mesh.geometry = geo;
  mesh.material.dispose();
  mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

const Bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cz = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

/* кузов с ванной багажника вместо сплошной коробки (своя машина-седан). Вернёт true, если собрал */
export function body (add, k) {
  const { S, W, L, hl, y0, bodyHex } = k;
  if (!S.trunk) return false;
  const zf = -hl + S.trunk + 0.05, tl = S.trunk + 0.05;          // передняя стенка ванны — у петли крышки
  const yb = y0 - S.h / 2, yF = yb + 0.12, top = y0 + S.h / 2;
  // углы срезаны скосом (carbody.js): спереди — у сплошной части, сзади — у дна и стенок ванны
  const c = k.bev ? CORNER : 0, bev = k.bev || ((w, h, d) => Bx(w, h, d));
  add(bev(W, S.h, L - tl, { c, ends: 1 }), bodyHex, 0, y0, (zf + hl) / 2);
  add(bev(W, yF - yb, tl, { c, ends: -1 }), bodyHex, 0, (yb + yF) / 2, -hl + tl / 2);               // дно
  for (const s of [-1, 1]) {
    add(Bx(0.06, S.h, tl - c), bodyHex, s * (W / 2 - 0.03), y0, -hl + c + (tl - c) / 2);   // борта
    if (c) {
      const n = Math.SQRT1_2, mx = s * (W / 2 - c / 2) - s * n * 0.03, mz = -hl + c / 2 + n * 0.03;
      add(new THREE.BoxGeometry(0.06, S.h, c * Math.SQRT2 + 0.03, 1, 2, 1).rotateY(s * Math.PI / 4), bodyHex, mx, y0, mz);   // скос угла
    }
  }
  add(Bx(W - 0.12 - Math.max(0, 2 * c - 0.12), S.h, 0.06), bodyHex, 0, y0, -hl + 0.03);                        // задняя стенка
  // обивка: серый ворс на дне и стенках
  const IN = '#45434b', FL = '#38363d';
  add(Bx(W - 0.13, 0.012, tl - 0.07), FL, 0, yF + 0.006, -hl + 0.06 + (tl - 0.07) / 2);
  for (const s of [-1, 1]) add(Bx(0.012, top - yF - 0.02, tl - 0.07), IN, s * (W / 2 - 0.066), (top + yF) / 2, -hl + 0.06 + (tl - 0.07) / 2);
  add(Bx(W - 0.13 - 2 * c, top - yF - 0.02, 0.012), IN, 0, (top + yF) / 2, -hl + 0.066);
  add(Bx(W - 0.13, top - yF - 0.02, 0.012), IN, 0, (top + yF) / 2, zf - 0.006);
  // термосумка слева (+X): красная с жёлтой полосой и молнией; справа — место под коробки
  const bh = Math.min(0.3, top - yF - 0.03), bw = Math.min(0.56, W / 2 - 0.12), bz = -hl + 0.06 + (tl - 0.07) * 0.55, bd = Math.min(0.62, tl - 0.2);
  const bx = W / 2 - 0.08 - bw / 2;
  add(Bx(bw, bh, bd), '#d8262e', bx, yF + bh / 2, bz);
  add(Bx(bw + 0.01, 0.05, bd + 0.01), '#ffd23f', bx, yF + bh * 0.55, bz);
  add(Bx(bw - 0.06, 0.012, 0.02), '#1b1a1f', bx, yF + bh + 0.004, bz - bd / 2 + 0.06);
  add(Bx(0.18, 0.03, 0.04), '#1b1a1f', bx, yF + bh + 0.012, bz);                          // ручка сумки
  // огнетушитель у задней стенки справа и аптечка
  add(Cz(0.055, 0.34, 8).rotateY(Math.PI / 2), '#c8202a', -W / 2 + 0.26, yF + 0.06, -hl + 0.14);
  add(Bx(0.2, 0.08, 0.12), '#ecebe6', -W / 2 + 0.2, yF + 0.04, zf - 0.14);
  add(Bx(0.06, 0.082, 0.02), '#d8262e', -W / 2 + 0.2, yF + 0.04, zf - 0.14 - 0.051);
  k.tub = { yF, x: -W / 2 + 0.36 + 0.06, z: -hl + 0.06 + (tl - 0.07) * 0.45 };
  return true;
}

/* задние фонари с глубиной: красное стекло в рамке-нише и белое стекло заднего хода; backs — стёкла фонарей сзади { w, h, x, y, face — z наружной грани, tail — красное };
   k.minY — верх заднего бампера (рамка ниже не опускается), k.frameHex — цвет рамки;
   frame(geo, hex, x, y, z) — в склейку кузова, lens(geo, hex, x, y, z) — в меш фар (бьётся вместе с фонарём) */
export function lampDepth (frame, lens, backs, k) {
  if (!backs.length) return;
  const frameHex = k.frameHex || '#1d1b20';
  for (const sg of [-1, 1]) {
    const mine = backs.filter(b => Math.sign(b.x) === sg);
    if (!mine.length) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, face = Infinity;
    for (const b of mine) { x0 = Math.min(x0, b.x - b.w / 2); x1 = Math.max(x1, b.x + b.w / 2); y0 = Math.min(y0, b.y - b.h / 2); y1 = Math.max(y1, b.y + b.h / 2); face = Math.min(face, b.face); }
    if (k.minY !== undefined) y0 = Math.max(y0, k.minY);          // ниже — бампер: он и так закрывает низ фонаря
    if (y1 - y0 < 0.04) continue;
    const tails = mine.filter(b => b.tail);
    // стекло фонаря — гладкое, одним цветом (рифлёные полоски и «лампа» в глубине убраны 10.10.2026: с камеры — рябь)
    // белое стекло заднего хода — ближе к середине, где загорается фонарь заднего хода (carlights.js)
    if (tails.length) {
      const T = tails.reduce((a, b) => (Math.abs(b.x) < Math.abs(a.x) ? b : a));
      const inner = sg > 0 ? T.x - T.w / 2 : T.x + T.w / 2, rh = Math.min(0.12, T.h), rx = inner - sg * 0.11;
      if (Math.abs(rx) > 0.18) {
        lens(Bx(0.13, rh, 0.04), '#dcd8d0', rx, Math.max(T.y, y0 + rh / 2), face + 0.02);
        x0 = Math.min(x0, rx - 0.065); x1 = Math.max(x1, rx + 0.065);
      }
    }
    // рамка-ниша вокруг блока: стоп-сигнал горит в глубине
    const t = 0.024, d = 0.09, zc = face - 0.022, w = x1 - x0 + 0.024, h = y1 - y0 + 0.024, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    frame(Bx(w + 2 * t, t, d), frameHex, cx, y1 + 0.012 + t / 2, zc);
    frame(Bx(w + 2 * t, t, d), frameHex, cx, y0 - 0.012 - t / 2, zc);
    frame(Bx(t, h, d), frameHex, x0 - 0.012 - t / 2, cy, zc);
    frame(Bx(t, h, d), frameHex, x1 + 0.012 + t / 2, cy, zc);
  }
}

/* всё остальное сзади: зовёт makeCar (game.js) после морды, до склейки и занижения; точку трубы (k.pipe)
   и коробки (k.cargo) makeCar кладёт в userData машины (pipe, cargo).
   k: S, W, hl, top, y0, bodyHex, CHR, dy, put, mergeGeos, bumper, trunk, brand, logo, dual, spare */
export function rear (g, add, k) {
  const { S, W, hl, top, y0, CHR, dy } = k;
  STATS.built++;
  // выхлоп: одна труба справа или двойная по краям (cars.js — сами трубы); у трубы — только тёмный срез, без колец
  const py = y0 - 0.2;
  if (k.dual) {
    for (const s of [-1, 1]) add(Cz(0.036, 0.02), '#141215', s * REAR.PIPE_DUAL, py, -hl - 0.205);
    k.pipe = { x: REAR.PIPE_DUAL, y: py + dy, z: -hl - 0.22, dual: true };
  } else {
    const x = REAR.PIPE_X;
    add(Cz(0.05, 0.4), '#9aa0a8', x, py, -hl + 0.01);
    add(Cz(0.036, 0.02), '#141215', x, py, -hl - 0.19);                    // тёмный срез — оттуда дым
    add(Bx(0.24, 0.15, 0.46), '#2a292d', x - 0.04, py + 0.03, -hl + 0.42);  // глушитель
    k.pipe = { x, y: py + dy, z: -hl - 0.17, dual: false };
  }
  // брызговики за задними колёсами — просто чёрные
  const yb = y0 - S.h / 2;
  for (const s of [-1, 1]) add(Bx(0.26, 0.3, 0.025), '#1c1b1f', s * (W / 2 - 0.02), yb - 0.14, S.bz - S.r - 0.08);
  // бампер: одна тёмная полоса во всю ширину и рамка номера — одним мешем с ним; номер — наклейкой на нём
  // (катафоты и крюк убраны 10.10.2026 — с камеры они читались мелкими пятнами)
  if (k.bumper) {
    const bz = -0.11;
    dressPanel(k.bumper, CHR, [
      [Bx(W + 0.02, 0.045, 0.02), '#1f1e22', 0, 0.045, bz - 0.006],
      [Bx(0.56, 0.13, 0.016), '#16151a', 0, -0.005, bz - 0.006],
    ], k);
    decal(k.bumper, k.brand, k.logo, [{ r: 'plate', w: 0.52, h: 0.11, at: [0, -0.005, bz - 0.016] }]);
  }
  if (k.trunk) {
    // крышка багажника: гладкая, обивка снизу; сверху у заднего края — один круглый логотип (без замка, шильдика и надписей)
    const T = k.trunk.len, lw = W - 0.06, q = Math.min(0.3, T * 0.4);
    dressPanel(k.trunk.m, k.bodyHex, [[Bx(lw - 0.16, 0.02, T - 0.12), '#3b3940', 0, -0.088, 0]], k);
    decal(k.trunk.m, k.brand, k.logo, [{ r: 'round', w: q, h: q, at: [0, 0.082, -T / 2 + 0.06 + q / 2], up: true }]);
    // ванна багажника: коробки с пиццей (одна отрисовка, только пока крышка открыта)
    if (k.tub) cargo(g, k);
  } else {
    // дверь сзади: гладкая панель (без швов-полосок и ручки), посередине — круглый логотип
    const yT = top, yB = y0 + 0.04, zb = -hl - 0.004, H = yT - yB, dw = W - 0.2;
    const q = Math.min(0.3, H * 0.55);
    if (!k.spare && H > 0.12) {
      // своя панель двери (10.10.2026): от сильных ударов приоткрывается и распахивается (cardent.js REARD),
      // за ней — тёмный проём и коробки с пиццей
      add(Bx(dw - 0.02, H - 0.02, 0.006), '#1e1d22', 0, (yT + yB) / 2, -hl - 0.003);
      const dm = add(Bx(dw, H, 0.02), k.bodyHex, 0, (yT + yB) / 2, -hl - 0.026, 'rdoor');
      dressPanel(dm, k.bodyHex, [
        [Bx(dw - 0.08, H - 0.06, 0.004), '#3b3940', 0, 0, 0.012],           // обивка изнутри
      ], k);
      decal(dm, k.brand, k.logo, [{ r: 'round', w: q, h: q, at: [0, H / 2 - 0.04 - q / 2, -0.012] }]);
      k.rdoor = { m: dm, h: H, a: 0, ajar: 0, p: null };
      k.tub = { yF: yB, x: -0.3, z: -hl + 0.17, max: Math.max(1, Math.floor((H - 0.068) / 0.062) + 1) };
      cargo(g, k);
    } else {
      // запаска на двери (k.spare — { y, z, r }: середина и лицо колпака, cars.js LOOK.spare): логотип — на колпаке запаски
      const sp = typeof k.spare === 'object' ? k.spare : null;
      const list = sp ? [{ r: 'round', w: sp.r * 2, h: sp.r * 2, at: [0, top + sp.y, -hl - sp.z - 0.004] }]
        : [{ r: 'round', w: q, h: q, at: [0, yT - 0.04 - q / 2, zb - 0.002] }];
      decal(g, k.brand, k.logo, list);                // занижение (dy) makeCar добавит сам, как всем детям
    }
  }
}

/* коробки с пиццей в багажнике: до REAR.PIZZAS стопкой, показываем столько, сколько в машине */
function cargo (g, k) {
  const list = [], t = k.tub;
  for (let i = 0; i < REAR.PIZZAS; i++) {
    const y = t.yF + 0.03 + i * 0.062, a = (i % 2 ? 1 : -1) * 0.06;
    k.put(list, Bx(0.4, 0.056, 0.4).rotateY(a), '#f0522a', t.x, y, t.z);
    k.put(list, Bx(0.22, 0.058, 0.08).rotateY(a), '#fff3d6', t.x, y + 0.002, t.z);
  }
  const m = new THREE.Mesh(k.mergeGeos(list), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.visible = false;
  m.geometry.setDrawRange(0, 0);
  m.userData.per = 72;                              // индексов на коробку: два бокса
  m.userData.max = t.max || REAR.PIZZAS;            // за задней дверью — сколько влезет по высоте проёма
  g.add(m);
  k.cargo = m;
}

/* крышка / дверь после удара (cardent.js REARD): ajar — на сколько приоткрыта (рад); на ходу болтается.
   o — u.trunk или u.rdoor, v — скорость машины, м/с. Вернёт угол, к которому тянется */
export const LID = { WOB: 0.07, WOB_V: 12, HZ: 11 };
export function lidGoal (o, dt, v) {
  const aj = o.ajar || 0;
  if (!aj) return o.want || 0;
  o.wt = (o.wt || 0) + dt;
  const w = Math.sin(o.wt * LID.HZ) * LID.WOB * Math.min(1, v / LID.WOB_V) * (aj > 1 ? 0.4 : 1);
  return Math.max(o.want || 0, aj + w);
}

const SPD = { car: null, x: 0, z: 0, v: 0 };
/* каждый кадр: n — сколько коробок сейчас в машине (game.js) */
export function step (dt, car, n) {
  const u = car && car.userData, m = u && u.cargo, tr = u && u.trunk, d = u && u.rdoor;
  if (d && !d.p) d.p = d.m.position.clone();        // закрытая — где стоит (уже с занижением)
  if (d && d.ajar) {
    // задняя дверь хэтчбека: петля снизу, над бампером — верх отваливается назад (камера сверху видит проём и коробки)
    if (SPD.car !== car) { SPD.car = car; SPD.x = car.position.x; SPD.z = car.position.z; }
    if (dt > 0) { SPD.v = Math.min(60, Math.hypot(car.position.x - SPD.x, car.position.z - SPD.z) / dt); SPD.x = car.position.x; SPD.z = car.position.z; }
    d.a += (lidGoal(d, dt, SPD.v) - d.a) * Math.min(1, dt * 9);
    const hy = d.p.y - d.h / 2;
    d.m.rotation.x = -d.a;
    d.m.position.y = hy + Math.cos(d.a) * d.h / 2;
    d.m.position.z = d.p.z - Math.sin(d.a) * d.h / 2;
  }
  if (!m) return;
  const open = !!(tr && (tr.a > 0.03 || tr.lost) || d && d.a > 0.03);   // крышку сорвало (cardent.js) — коробки видно всегда
  const k = open ? Math.max(0, Math.min(m.userData.max || REAR.PIZZAS, n | 0)) : 0;
  m.visible = k > 0;
  if (m.visible) m.geometry.setDrawRange(0, k * m.userData.per);
  STATS.cargo = k; STATS.open = open;
}
