/* Фон-сцена мини-игр у двери — один стиль на домофон (intercom.js: дверь подъезда снаружи) и подъезд (stairs.js:
   лестничная клетка внутри). Автор 10.10.2026: «весь экран — сам подъезд / дверь подъезда, полноценная игра в игре».
   Пиксельный стиль крупно: всё рисуется прямоугольниками по сетке «пикселя» P (≈ 1/90 высоты экрана).

   Подъезды разные по дому (пригодится для встреч у двери): LOOK.shabby — обшарпанный (облезлая краска, ржавчина,
   граффити, объявления, мусор, мигающая лампа), LOOK.clean — чистый (свежая краска, цветы в горшках, коврики, ровный свет).
     lookOf(seed, zone)        → 'shabby' | 'clean' — по дому: особняки — чистый, промзона / частный сектор / гаражи — обшарпанный,
                                 город — по зерну адреса (60 % обшарпанных)
     PAL[look]                 — цвета стен, дверей, света
     rng(seed)                 — детерминированный случайный (одинаковый подъезд у одного адреса)
     entrance(g, W, H, o)      — нарисовать дверь подъезда снаружи (css px; g уже в масштабе dpr) → { door, panel } (прямоугольники)
     helpers: rect, spr, glow, vignette, poster, sticker, graffiti, plant, urn, bulb, text */

const N_ = s => s;
export const GRAFFITI = [N_('ЦОЙ ЖИВ'), N_('Вася + Лена'), N_('здесь был Петя'), N_('лифт — для слабаков'), N_('Солнечный — сила'), N_('не курить!')];
export const ADS = [N_('ПРОДАМ ГАРАЖ'), N_('ВСКРЫТИЕ ЗАМКОВ'), N_('ПРОПАЛ КОТ'), N_('УБОРКА ПОДЪЕЗДА — СУББОТА'), N_('ИНТЕРНЕТ 100 МБ'), N_('ОТДАМ КОТЯТ')];

export const PAL = {
  shabby: {
    sky: ['#1d1b33', '#4a3550'], facade: '#a59d8c', seam: '#7d7566', brick: '#8a4b3a', wallTop: '#d6cbb0', wallLow: '#5f7f69', stripe: '#3f5a48',
    door: '#4d5a66', doorHi: '#66737f', peel: '#9aa4a8', rust: '#8a4a2a', frame: '#2a2622', step: '#8c8679', stepHi: '#a59f92', grime: 0.32,
    light: '#ffcf7a', lamp: 0.8, flicker: true, trash: true, flowers: false, graffiti: true, mat: '#5a3a2a',
  },
  clean: {
    sky: ['#22305e', '#7a6aa0'], facade: '#d8d2c4', seam: '#b3ab9b', brick: '#b0614a', wallTop: '#f2ecdc', wallLow: '#6f93b8', stripe: '#4f6f94',
    door: '#2e6a8e', doorHi: '#4a86a8', peel: '#2e6a8e', rust: '#2e6a8e', frame: '#1f2a33', step: '#b8b2a5', stepHi: '#d2ccbf', grime: 0.06,
    light: '#fff1c4', lamp: 1, flicker: false, trash: false, flowers: true, graffiti: false, mat: '#a8324a',
  },
};
export function lookOf (seed, zone) {
  if (zone === 'rich') return 'clean';
  if (zone === 'ind' || zone === 'poor' || zone === 'garage' || zone === 'gang') return 'shabby';
  return rng(seed)() < 0.6 ? 'shabby' : 'clean';
}
export function hashStr (s) { let h = 2166136261; for (const c of String(s || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng (seed) {
  let x = (seed >>> 0) || 1;
  return () => { x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x ^= x + Math.imul(x ^ (x >>> 7), 0x297a2d39); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

/* ── кисти ── */
export const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
export function spr (g, rows, cx, by, u, flip, pal) {
  const h = rows.length, w = rows[0].length;
  const L = Math.round(cx - w * u / 2), T = Math.round(by - h * u);
  for (let r = 0; r < h; r++) {
    const row = rows[r];
    for (let c = 0; c < w; c++) {
      const ch = row[c];
      if (ch === '.' || !pal[ch]) continue;
      g.fillStyle = pal[ch];
      g.fillRect(L + (flip ? w - 1 - c : c) * u, T + r * u, u, u);
    }
  }
}
export function text (g, s, x, y, px, c, align = 'center', base = 'middle') {
  g.font = Math.max(6, Math.round(px)) + 'px "Press Start 2P", ui-monospace, monospace';
  g.fillStyle = c; g.textAlign = align; g.textBaseline = base;
  g.fillText(s, Math.round(x), Math.round(y));
}
/* тёплое пятно света (поверх сцены, режим «lighter») */
export function glow (g, x, y, r, c, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore();
}
export function vignette (g, W, H, k = 0.55) {
  const gr = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.25, W / 2, H * 0.55, Math.max(W, H) * 0.75);
  gr.addColorStop(0, 'rgba(10,6,4,0)'); gr.addColorStop(1, 'rgba(10,6,4,' + k + ')');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
/* лампа: провод, патрон, лампочка (в клетке — снаружи) */
export function bulb (g, x, y, P, on, cage) {
  rect(g, x - P * 0.5, y - P * 6, P, P * 6, '#1d1a16');
  rect(g, x - P * 1.5, y, P * 3, P * 2, '#3a3530');
  rect(g, x - P * 2, y + P * 2, P * 4, P * 3.5, on ? '#fff3c0' : '#8a8270');
  if (cage) { g.strokeStyle = '#2a2622'; g.lineWidth = Math.max(1, P * 0.6); g.strokeRect(Math.round(x - P * 2.8), Math.round(y + P * 1.5), Math.round(P * 5.6), Math.round(P * 5)); }
}
/* объявление: лист с текстом и лапшой отрывных полосок снизу */
export function poster (g, x, y, w, h, P, s, t) {
  rect(g, x + P * 0.6, y + P * 0.6, w, h, 'rgba(0,0,0,.25)');
  rect(g, x, y, w, h, '#f4efe2');
  text(g, t(s), x + w / 2, y + h * 0.28, Math.min(P * 2.2, w * 0.9 / Math.max(6, t(s).length)), '#2a2622');
  for (let i = 1; i < 4; i++) rect(g, x + P * 1.5, y + h * (0.38 + i * 0.1), w - P * 3, Math.max(1, P * 0.5), 'rgba(42,38,34,.45)');
  const n = Math.max(3, Math.floor(w / (P * 3)));
  for (let i = 0; i < n; i++) if ((i * 7 + Math.round(x)) % 4) rect(g, x + i * w / n + P * 0.4, y + h, w / n - P * 0.8, P * 4, '#ece6d6');
  rect(g, x + w / 2 - P, y - P * 0.5, P * 2, P * 2, '#c8b28a');          // скотч
}
export function sticker (g, x, y, w, h, P, c, s) {
  rect(g, x, y, w, h, c);
  if (s) text(g, s, x + w / 2, y + h / 2, Math.min(h * 0.45, w / Math.max(4, s.length) * 1.5), '#fff');
}
export function graffiti (g, s, x, y, px, c, rot = -0.08) {
  g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(rot);
  text(g, s, 0, 0, px, c);
  g.restore();
}
/* цветок в горшке (герань) — низ по y */
export function plant (g, x, y, P, kind = 0) {
  rect(g, x - P * 3, y - P * 5, P * 6, P * 5, kind ? '#b0613a' : '#8a4b2a');
  rect(g, x - P * 3.5, y - P * 5.5, P * 7, P * 1.2, '#c4734a');
  const leaf = '#3f8a4a', bloom = kind % 2 ? '#e8436a' : '#f2a03c';
  rect(g, x - P * 0.5, y - P * 11, P, P * 6, '#2f6a3a');
  rect(g, x - P * 4, y - P * 9, P * 3.5, P * 2.5, leaf); rect(g, x + P * 0.6, y - P * 10, P * 3.5, P * 2.5, leaf);
  rect(g, x - P * 2.5, y - P * 14, P * 5, P * 3.5, bloom); rect(g, x - P * 1.2, y - P * 15.5, P * 2.4, P * 1.5, bloom);
}
export function urn (g, x, y, P) {
  rect(g, x - P * 4, y - P * 11, P * 8, P * 11, '#5d6266');
  rect(g, x - P * 4.6, y - P * 12, P * 9.2, P * 1.6, '#3e4246');
  rect(g, x - P * 3, y - P * 9, P * 1.2, P * 7, '#787e82');
  rect(g, x - P * 2, y - P * 14, P * 3, P * 2.4, '#f4efe2');                   // торчит бумажка
  rect(g, x + P * 1.5, y - P * 13, P * 1.4, P * 1.6, '#c8402e');               // банка
}

/* ── дверь подъезда снаружи (домофон): весь экран; размеры — css px ──
   o: { look, seed, entr, range: 'кв. 37—72', t, flicker (0…1) } → { door: {x,y,w,h}, panel: {x,y,w,h} } */
export function entranceLayout (W, H) {
  const dh = H * 0.63, dw = Math.min(H * 0.48, W * 0.86), dx = (W - dw) / 2, dy = H * 0.265;
  const pw = Math.min(dw * 0.62, H * 0.36), ph = Math.min(pw * 1.55, dh * 0.78);
  const narrow = W < 640;
  const px = narrow ? dx + (dw - pw) / 2 : dx + dw * 0.93 - pw, py = dy + dh * (narrow ? 0.24 : 0.17);
  return { door: { x: dx, y: dy, w: dw, h: dh }, panel: { x: px, y: py, w: pw, h: ph } };
}
export function entrance (g, W, H, o) {
  const C = PAL[o.look] || PAL.shabby, R = rng(o.seed || 1), t = o.t || (s => s);
  const P = Math.max(2, Math.round(H / 110));
  const L = entranceLayout(W, H), D = L.door;
  // небо и фасад: панели с швами, окна первого этажа по бокам
  const sky = g.createLinearGradient(0, 0, 0, H * 0.2);
  sky.addColorStop(0, C.sky[0]); sky.addColorStop(1, C.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  rect(g, 0, H * 0.02, W, H, C.facade);
  const PW = H * 0.34, PH = H * 0.3;
  for (let y = H * 0.02; y < H; y += PH) for (let x = (W / 2) % PW - PW; x < W; x += PW) {
    rect(g, x, y, PW, P, C.seam); rect(g, x, y, P, PH, C.seam);
    if (C.grime > 0.2 && R() < 0.5) rect(g, x + P * 2, y + PH * (0.6 + R() * 0.3), PW * (0.2 + R() * 0.5), P * (2 + R() * 4), 'rgba(60,50,40,.18)');
  }
  for (const side of [-1, 1]) {   // окна первого этажа
    const wx = side < 0 ? D.x - H * 0.42 : D.x + D.w + H * 0.16, wy = H * 0.3, ww = H * 0.26, wh = H * 0.3;
    if (wx + ww < 0 || wx > W) continue;
    rect(g, wx - P * 1.5, wy - P * 1.5, ww + P * 3, wh + P * 3, '#3a332c');
    const lit = R() < 0.6;
    rect(g, wx, wy, ww, wh, lit ? '#f2b55a' : '#2b3550');
    if (lit) { rect(g, wx, wy, ww * 0.3, wh, '#d9744a'); rect(g, wx + ww * 0.7, wy, ww * 0.3, wh, '#d9744a'); }   // шторы
    rect(g, wx + ww / 2 - P * 0.6, wy, P * 1.2, wh, '#3a332c'); rect(g, wx, wy + wh * 0.4, ww, P * 1.2, '#3a332c');
    rect(g, wx - P * 2.5, wy + wh, ww + P * 5, P * 2, '#9a9284');
    if (C.flowers) for (let i = 0; i < 3; i++) plant(g, wx + ww * (0.2 + i * 0.3), wy + wh, P * 0.8, i);
    // решётка на окне — у обшарпанного
    if (!C.flowers) for (let i = 1; i < 5; i++) rect(g, wx + ww * i / 5, wy, P * 0.8, wh, 'rgba(30,26,22,.8)');
    if (C.graffiti && side > 0) graffiti(g, t(GRAFFITI[(o.seed || 0) % GRAFFITI.length]), wx + ww / 2, wy + wh + H * 0.12, P * 2.6, '#c8402e', -0.06);
  }
  // кирпичный портал вокруг двери
  const bx = D.x - P * 8, bw = D.w + P * 16;
  rect(g, bx, D.y - P * 4, bw, D.h + P * 4, C.brick);
  for (let y = D.y - P * 4; y < D.y + D.h; y += P * 3) {
    const off = ((y / (P * 3)) | 0) % 2 ? P * 4 : 0;
    rect(g, bx, y, bw, Math.max(1, P * 0.5), 'rgba(40,20,14,.35)');
    for (let x = bx + off; x < bx + bw; x += P * 8) rect(g, x, y, Math.max(1, P * 0.5), P * 3, 'rgba(40,20,14,.35)');
  }
  // козырёк и лампа
  const cy = D.y - P * 9, cx0 = D.x - H * 0.22, cw = D.w + H * 0.44;
  rect(g, cx0, cy, cw, P * 5, '#9a9284'); rect(g, cx0, cy + P * 5, cw, P * 1.5, '#6f685c');
  rect(g, cx0, cy - P * 1.5, cw, P * 1.5, '#b3ac9d');
  const on = !C.flicker || (o.flicker || 0) > 0.08;
  bulb(g, W / 2, cy + P * 6.5, P, on, true);
  // табличка над дверью: подъезд и квартиры
  const plW = Math.min(D.w * 0.8, P * 46), plH = P * 9, plX = W / 2 - plW / 2, plY = D.y - P * 2 - plH + P * 1;
  rect(g, plX - P, plY - P, plW + 2 * P, plH + 2 * P, '#f4efe2'); rect(g, plX, plY, plW, plH, '#2f5fb0');
  text(g, (o.entr ? t('подъезд {n}', { n: o.entr }) : t('подъезд')) + (o.range ? ' · ' + o.range : ''), W / 2, plY + plH / 2 + P * 0.3, Math.min(P * 2.6, plW / 22), '#fff6e0');
  // сама дверь: коробка, полотно, петли, ручка
  rect(g, D.x - P * 2, D.y - P * 2, D.w + P * 4, D.h + P * 2, C.frame);
  rect(g, D.x, D.y, D.w, D.h, C.door);
  rect(g, D.x, D.y, D.w, P * 1.2, C.doorHi);
  for (let i = 0; i < 3; i++) rect(g, D.x + P * 3, D.y + D.h * (0.12 + i * 0.36), D.w - P * 6, Math.max(1, P * 0.6), 'rgba(0,0,0,.18)');   // рёбра жёсткости
  for (const y of [0.12, 0.85]) rect(g, D.x - P * 2.5, D.y + D.h * y, P * 2, P * 6, '#1d1a16');            // петли
  if (C.grime > 0.2) {   // облезлая краска и ржавчина
    for (let i = 0; i < 22; i++) {
      const x = D.x + R() * D.w * 0.95, y = D.y + R() * D.h * 0.97, w = P * (1 + R() * 6), h = P * (1 + R() * 4);
      rect(g, x, y, w, h, R() < 0.45 ? C.rust : C.peel);
    }
    rect(g, D.x, D.y + D.h - P * 6, D.w, P * 6, C.rust);
  }
  const hx = D.x + D.w * 0.12, hy = D.y + D.h * 0.48;
  rect(g, hx, hy - P * 10, P * 2.2, P * 20, '#c9c2b0'); rect(g, hx - P * 1.2, hy - P * 10, P * 3.4, P * 1.6, '#8a8475'); rect(g, hx - P * 1.2, hy + P * 8.4, P * 3.4, P * 1.6, '#8a8475');
  // объявления и наклейки: у обшарпанного — много, у чистого — одно аккуратное в рамке
  if (C.grime > 0.2) {
    poster(g, D.x + D.w * 0.2, D.y + D.h * 0.12, D.w * 0.24, D.w * 0.26, P, ADS[(o.seed || 0) % ADS.length], t);
    poster(g, D.x + D.w * 0.18, D.y + D.h * 0.6, D.w * 0.22, D.w * 0.2, P, ADS[((o.seed || 0) + 2) % ADS.length], t);
    poster(g, bx - D.w * 0.3, D.y + D.h * 0.25, D.w * 0.22, D.w * 0.24, P, ADS[((o.seed || 0) + 4) % ADS.length], t);
    const SC = ['#e8436a', '#2f80ff', '#4fd65a', '#ffd85e', '#ff8a2b'];
    for (let i = 0; i < 6; i++) sticker(g, D.x + D.w * (0.08 + R() * 0.5), D.y + D.h * (0.4 + R() * 0.15), P * (5 + R() * 4), P * 3, P, SC[i % SC.length], i % 2 ? '' : '☎');
  } else {
    const fx = D.x + D.w * 0.2, fy = D.y + D.h * 0.14, fw = D.w * 0.24, fh = D.w * 0.24;
    rect(g, fx - P, fy - P, fw + 2 * P, fh + 2 * P, '#8a6b4e');
    poster(g, fx, fy, fw, fh * 0.8, P, N_('УБОРКА ПОДЪЕЗДА — СУББОТА'), t);
  }
  // ступеньки и площадка у двери
  const sy0 = D.y + D.h;
  for (let i = 0; i < 3; i++) {
    const y = sy0 + i * (H - sy0) / 3, x = cx0 - H * 0.04 - i * H * 0.06, w = cw + H * 0.08 + i * H * 0.12;
    rect(g, x, y, w, (H - sy0) / 3 + 1, i % 2 ? C.step : C.stepHi);
    rect(g, x, y, w, Math.max(1, P * 0.8), 'rgba(0,0,0,.2)');
  }
  rect(g, W / 2 - D.w * 0.4, sy0 + P, D.w * 0.8, P * 3, C.mat);                 // коврик
  // урна / цветы по бокам
  if (C.trash) { urn(g, D.x - H * 0.13, sy0 + P * 2, P * 1.3); rect(g, D.x + D.w + H * 0.08, sy0 - P * 2, P * 5, P * 3, '#4b6a3a'); }   // бутылка у стены
  if (C.flowers) { plant(g, D.x - H * 0.12, sy0 + P * 2, P * 1.6, 1); plant(g, D.x + D.w + H * 0.12, sy0 + P * 2, P * 1.6, 2); }
  // свет лампы и темнота по краям
  if (on) glow(g, W / 2, cy + P * 9, H * 0.55, C.light, 0.35 * C.lamp);
  vignette(g, W, H, C.grime > 0.2 ? 0.62 : 0.45);
  return L;
}
