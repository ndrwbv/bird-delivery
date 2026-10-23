/* ──────────────────────────────────────────────────────────────────────────
   Летающий родстер (17.10.2026, автор: «сделать летающий Тесла Роудстер, который умеет подлетать на время»).
   Правила словами и числами — docs/CAREER.md «Тесло Родстер: полёт». Машина в гараже — econ.js CAR_LIST
   (id 'roadster'), вид — cars.js LOOK / dress, открытый салон — openCabin ниже (makeCar в game.js, opts.open).

   Как летает (числа — FLY):
     • кнопка «полёт» (клавиатура Z или J, геймпад X / □, телефон — красная кнопка слева от педалей) — только
       на родстере, на земле, когда заряд полный;
     • взлёт UP с: плавно поднимается на H м над тем, на чём стоял (земля, мост, твёрдая крыша — roofs.js);
     • держит высоту HOLD с: летит туда, куда ехал, руль работает, газ и тормоз тоже, скорость почти не
       гаснет (сопротивление × DRAG); под тобой горка или крыша — не ближе GAP м к ней;
     • потом снижается (не быстрее, чем (высота × DOWN_K) м/с, у самой земли — DOWN_MIN м/с) и садится без удара;
       под тобой дом без твёрдой крыши или вода — не садится, висит, пока не вылетишь на место, куда можно;
     • приземлился — перезарядка CD с (полоска на хаде заполняется), полная — снова можно.
   В полёте (выше CLEAR м над опорой): поток, автобусы, люди, заборы, столбы, мелочь — пролетаешь; дом выше
   днища (game.js inTallHouse: крыша дома из карты, пиццерия-купол, клуб) — стена: влетел — откат и удар, как о
   стену на земле (сердца — по той же силе удара); заказ не вручить и за пиццей не заехать — только на земле
   (game.js checkArrival → blocksHand). Взлететь из-под арки нельзя — над тобой дом (noTakeoff).

   Крылья (WINGS) — то же на любой машине карьеры, купившей их в гараже: ниже, короче, дольше заряжается.
   Переменных игры модуль не видит: всё — через init(api):
     V, S, isFlyer() — сейчас родстер, wings() — на машине купленные крылья (числа — WINGS), canUse() — смена идёт, не пауза, не карта, не разговор,
     noLand(x, z, y) — сюда не сесть (дом без крыши, вода), noTakeoff(x, z) — над тобой дом (арка), toast(text), Snd
   game.js зовёт: tick(dt) — каждый кадр езды; fly(dt, gnd) — вместо V.y, пока on(); pitch() — наклон
   кузова в полёте; passSolid(s, y) — пролетаешь ли это препятствие; high() — выше потока; reset() — новая смена.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';
import { glyph, onInput } from '../input/glyphs.js';
import './flycar.css';

export const FLY = {
  ID: 'roadster',   // какая машина летает (econ.js CAR_LIST)
  UP: 0.5,          // с — взлёт
  H: 7,             // м над опорой при взлёте: одноэтажки (4,25 м) и гаражи — под тобой, двухэтажки (7,4 м) — уже стена
  GAP: 2.5,         // м — пока держит высоту, не ближе к земле / крыше под собой (горка поднимает)
  HOLD: 4.5,        // с — держит высоту
  DOWN_K: 1.6,      // снижение: (высота над опорой × DOWN_K) м/с…
  DOWN_MIN: 1.2,    //   …но не медленнее DOWN_MIN м/с — с 7 м садится за ~2 с, касание 1,2 м/с (без удара)
  CD: 25,           // с — перезарядка после посадки
  CLEAR: 1.6,       // м над опорой — выше этого пролетаешь поток, людей, заборы, мелочь
  PASS: 0.15,       // днище выше верха стены минус PASS — стена не держит (пролетаешь над домом)
  DRAG: 0.03,       // сопротивление в полёте — доля земного: за полёт теряет ~5 % скорости
  HINT: 2.5,        // с — не чаще: «не сесть — под тобой дом / вода», «садись — с неба не вручить»
};
/* крылья (18.10.2026, автор: «летающую функцию для машины можно докупить»): улучшение в гараже для любой машины
   карьеры, кроме родстера (econ.js ADDON.wings, cars.js upgrade(id, 'wings')). Та же кнопка и полоска, но слабее
   родстера: ниже, короче, дольше заряжается. Остальное (взлёт, снижение, где не сесть, что пролетаешь) — как у FLY */
export const WINGS = {
  H: 5,             // м над опорой: одноэтажки (4,25 м) и гаражи — ещё под тобой, двухэтажки — стена
  HOLD: 3,          // с — держит высоту (родстер 4,5)
  CD: 40,           // с — перезарядка (родстер 25)
};
export const STATS = { flights: 0, maxUp: 0, airT: 0, lastAir: 0, landV: 0, blockedLand: 0, wallHits: 0 };

let A = null;
const ST = { ph: 'ground', t: 0, y: 0, y0: 0, alt: 0, cd: 0, hi: false, hintT: 0, air: 0, gnd: 0 };
let hud = null, hudFill = null, hudLab = null, btn = null, lastShow = null, lastK = -1, lastCls = '';

const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function init (api) {
  A = Object.assign(A || {}, api);
  if (typeof document === 'undefined' || hud) return;
  // полоска на хаде — под скоростью, в стиле «кофе»: подпись, полоска в рамке
  const right = document.getElementById('hud-right');
  if (right) {
    hud = document.createElement('div');
    hud.id = 'flyhud';
    hud.hidden = true;
    hud.innerHTML = '<span></span><b><i></i></b>';
    hudLab = hud.firstChild; hudFill = hud.querySelector('i');
    const sp = document.getElementById('speed');
    if (sp && sp.parentNode === right) sp.after(hud); else right.appendChild(hud);
  }
  // телефон: кнопка слева от педалей (#touchpad виден только в езде на касаниях)
  const pad = document.querySelector('#touchpad .tp-right');
  if (pad) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tp-fly';
    btn.hidden = true;
    btn.textContent = t('полёт');
    btn.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
    btn.addEventListener('contextmenu', e => e.preventDefault());
    pad.appendChild(btn);
  }
  addEventListener('keydown', e => {
    if ((e.code === 'KeyZ' || e.code === 'KeyJ') && !e.repeat && !e.ctrlKey && !e.metaKey) {
      const tg = e.target;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      if (isFlyer()) press();
    }
  });
  onInput(() => { lastCls = ''; lastK = -1; });   // значок кнопки — по тому, чем играют
}

const winged = () => !!(A && A.wings && A.wings());
const isFlyer = () => !!(A && ((A.isFlyer && A.isFlyer()) || winged()));
/** число полёта: у крыльев H, HOLD, CD свои (WINGS), у родстера и остальное — FLY */
const par = k => (k in WINGS && winged() && !(A.isFlyer && A.isFlyer()) ? WINGS[k] : FLY[k]);
export const kind = () => (A && A.isFlyer && A.isFlyer() ? 'roadster' : winged() ? 'wings' : null);
export const on = () => ST.ph !== 'ground';
export const high = () => ST.hi;
export const ready = () => ST.ph === 'ground' && ST.cd <= 0;
/** заряд 0…1: на земле — сколько набралось, в полёте — сколько ещё держит высоту */
export function charge () {
  if (ST.ph === 'ground') return ST.cd > 0 ? Math.max(0, 1 - ST.cd / par('CD')) : 1;
  if (ST.ph === 'up') return 1;
  if (ST.ph === 'hold') return Math.max(0, 1 - ST.t / par('HOLD'));
  return 0;
}
export const state = () => ({ ph: ST.ph, t: ST.t, y: ST.y, alt: ST.alt, cd: ST.cd, hi: ST.hi, gnd: ST.gnd, charge: charge(), flyer: isFlyer(), kind: kind(), H: par('H'), HOLD: par('HOLD'), CD: par('CD') });

/* нажали «полёт»: можно — взлетаем; заряжается — короткая подсказка */
export function press () {
  if (!A || !isFlyer() || !(A.canUse && A.canUse())) return false;
  const V = A.V;
  if (ST.ph !== 'ground') return false;
  if (V.air || V.sink !== undefined) return false;
  if (A.noTakeoff && A.noTakeoff(V.x, V.z)) { hint(t('тут не взлететь — над тобой дом')); return false; }
  if (ST.cd > 0) {
    hint(t('крылья заряжаются: {n} с', { n: String(Math.ceil(ST.cd)) }));
    return false;
  }
  ST.ph = 'up'; ST.t = 0; ST.y0 = ST.y = V.y; ST.alt = V.y + par('H'); ST.air = 0;
  STATS.flights++; STATS.maxUp = 0;
  if (A.Snd && A.Snd.nosFire) A.Snd.nosFire();     // тот же «вжух», что у нитро — своих звуков нет
  if (A.S) A.S.shake = Math.max(A.S.shake || 0, 0.15);
  return true;
}

function hint (s) {
  if (ST.hintT > 0 || !A || !A.toast) return;
  ST.hintT = FLY.HINT;
  A.toast(s);
}

/* каждый кадр езды: перезарядка, подсказки, хад */
export function tick (dt) {
  if (!A) return;
  ST.hintT -= dt;
  if (ST.ph === 'ground' && ST.cd > 0) ST.cd = Math.max(0, ST.cd - dt);
  if (ST.ph !== 'ground' && !isFlyer()) reset();   // пересел (гараж, воскрешение) — полёт кончился
  drawHud();
}

/* высота машины в полёте: gnd — опора под ней сейчас (земля / мост / крыша, как у езды) */
export function fly (dt, gnd) {
  const V = A.V;
  ST.gnd = gnd;
  ST.air += dt;
  let y = ST.y;
  if (ST.ph === 'up') {
    ST.t += dt;
    const top = Math.max(ST.alt, gnd + FLY.GAP);
    y = ST.y0 + (top - ST.y0) * smooth(ST.t / FLY.UP);
    if (ST.t >= FLY.UP) { ST.ph = 'hold'; ST.t = 0; }
  } else if (ST.ph === 'hold') {
    ST.t += dt;
    const top = Math.max(ST.alt, gnd + FLY.GAP);
    y += (top - y) * Math.min(1, 6 * dt);
    if (ST.t >= par('HOLD')) { ST.ph = 'down'; ST.t = 0; }
  } else if (ST.ph === 'down') {
    ST.t += dt;
    if (A.noLand && A.noLand(V.x, V.z, y)) {
      // под тобой дом без твёрдой крыши или вода — висим, пока не вылетишь туда, где можно сесть
      y += (Math.max(y, gnd + FLY.GAP) - y) * Math.min(1, 6 * dt);
      STATS.blockedLand += dt;
      hint(t('сюда не сесть — лети дальше'));
    } else {
      const v = Math.max(FLY.DOWN_MIN, (y - gnd) * FLY.DOWN_K);
      y -= v * dt;
      if (y <= gnd + 0.02) {
        STATS.landV = v; STATS.lastAir = ST.air; STATS.airT += ST.air;
        y = gnd;
        ST.ph = 'ground'; ST.t = 0; ST.cd = par('CD'); ST.hi = false; ST.y = y;
        return y;
      }
    }
  }
  if (y < gnd) y = gnd;                            // горка или крыша выше — не сквозь неё
  ST.y = y;
  ST.hi = y - gnd > FLY.CLEAR;
  STATS.maxUp = Math.max(STATS.maxUp, y - ST.y0);
  return y;
}

/* наклон кузова в полёте: на взлёте нос вверх, на снижении — чуть вниз */
export function pitch () {
  if (ST.ph === 'up') return -0.12 * (1 - smooth(ST.t / FLY.UP));
  if (ST.ph === 'down') return 0.05;
  return 0;
}

/* пролетаешь ли препятствие s (SOLIDS) на высоте днища y. Стены низких домов (s.topY, roofs.js) — по их правилу
   в game.js (выше крыши — пропускает). Остальное (заборы, столбы, деревья, будки, стены высоких домов) — если ты
   выше потока; в дом выше днища не влетишь — game.js inTallHouse: залетел носом в контур — откат и удар */
export function passSolid (s, y) {
  if (ST.ph === 'ground' || s.topY !== undefined) return false;
  return ST.hi;
}

/* вручить заказ можно только на земле */
export function blocksHand () {
  if (ST.ph === 'ground') return false;
  hint(t('садись — с неба пиццу не вручить'));
  return true;
}

/* новая смена, воскрешение, пересел: на земле, заряд полный */
export function reset () {
  ST.ph = 'ground'; ST.t = 0; ST.cd = 0; ST.hi = false; ST.air = 0;
}

/* ── хад: полоска «полёт» и кнопка на телефоне ── */
function drawHud () {
  if (!hud && !btn) return;
  const show = isFlyer() && !!(A.canUse ? A.canUse(true) : true);
  if (show !== lastShow) {
    lastShow = show;
    if (hud) hud.hidden = !show;
    if (btn) btn.hidden = !show;
    lastK = -1; lastCls = '';
  }
  if (!show) return;
  const k = Math.round(charge() * 100) / 100;
  const cls = ST.ph !== 'ground' ? 'fly' : ST.cd > 0 ? 'wait' : 'ready';
  if (k !== lastK) {
    lastK = k;
    if (hudFill) hudFill.style.width = (k * 100).toFixed(0) + '%';
    if (btn) btn.style.setProperty('--fly', k.toFixed(2));
  }
  if (cls !== lastCls) {
    lastCls = cls;
    if (hud) hud.className = cls;
    if (btn) btn.className = 'tp-fly ' + cls;
    const g = glyph('fly');
    if (hudLab) hudLab.textContent = cls === 'fly' ? t('в небе') : cls === 'wait' ? t('заряд крыльев') : (g ? '[' + g + '] ' : '') + t('полёт');
  }
}

/* ─────────────── крылышки (WINGS) ───────────────
   Зовёт cars.js dress, если куплены крылья: в склейку кузова (add(geo, hex, x, y, z)). k: { S, W, top, hl }.
   По бортам по линии пояса (под окнами) — короткие стреловидные крылышки (выступают на ~0,5 м) с оранжевой законцовкой
   и килем, на корме — узкое антикрыло на двух стойках. Коллизия машины не меняется — только вид */
export function wingsLook (add, k) {
  const { S, W, top, hl } = k;
  const B = (w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    add(g, hex, x, y, z);
  };
  const WING = '#e6e8ec', TIP = '#f0522a', DARK = '#2b2c31';
  const y = top - 0.03, z = S.cz - S.cab * 0.12;
  for (const s of [-1, 1]) {
    B(0.56, 0.05, 0.7, WING, s * (W / 2 + 0.24), y, z, 0, s * 0.42, s * -0.1);     // плоскость: стреловидная, чуть вверх
    B(0.05, 0.26, 0.34, TIP, s * (W / 2 + 0.5), y + 0.1, z - 0.2, 0, 0, s * 0.12);  // киль-законцовка
    B(0.14, 0.09, 0.34, DARK, s * (W / 2 + 0.03), y - 0.01, z + 0.04);             // крепление к борту
  }
  // антикрыло на корме: две стойки и узкая плоскость над крышкой багажника
  // без багажника (хэтчбек, джип, фургон) — козырьком над задним краем крыши, на коротких стойках
  const boot = S.trunk > 0.3, zb = boot ? -hl + 0.32 : S.cz - S.cab / 2 + 0.22, yb = boot ? top + 0.05 : top + S.ch - 0.16;
  for (const s of [-1, 1]) B(0.06, 0.28, 0.1, DARK, s * W * 0.32, yb + 0.14, zb);
  B(W * 0.86, 0.04, 0.28, WING, 0, yb + 0.3, zb - 0.02, -0.08);
  for (const s of [-1, 1]) B(0.04, 0.14, 0.3, TIP, s * W * 0.43, yb + 0.33, zb - 0.02);
}

/* ─────────────── открытый салон кабриолета ───────────────
   Зовёт makeCar (game.js) вместо крыши и стёкол, когда opts.open. add(geo, hex, x, y, z) — в склейку кузова.
   k: { S, W, top, GLASS, frame }. Курьер — за рулём слева по ходу (+x, как в carglass.js), справа — пасхалка:
   манекен в белом скафандре, локоть на двери. Низкое лобовое в рамке, две дуги за сиденьями, сиденья. */
export function openCabin (add, k) {
  const { S, W, top, GLASS } = k;
  const B = (w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    add(g, hex, x, y, z);
  };
  const cf = S.cz + S.cab / 2, cb = S.cz - S.cab / 2;
  const IN = '#1d1b20', SEAT = '#2a2629', TRIM = '#ece6da';
  // проём салона: тёмная «ванна» и пол, по краю — светлый кант
  B(W - 0.3, 0.04, S.cab - 0.1, IN, 0, top + 0.005, S.cz);
  for (const sx of [-1, 1]) B(0.05, 0.05, S.cab - 0.1, TRIM, sx * (W / 2 - 0.15), top + 0.03, S.cz);
  // торпедо у лобового
  B(W - 0.34, 0.12, 0.3, IN, 0, top + 0.06, cf - 0.15);
  // низкое лобовое: наклонная рамка цвета кузова и стекло
  const rise = Math.min(0.48, S.ch), run = 0.5, len = Math.hypot(run, rise), a = Math.atan2(rise, run);
  const zc = cf - run / 2 + 0.06;
  B(W - 0.3, 0.035, len, GLASS, 0, top + rise / 2 + 0.03, zc, a);
  B(W - 0.22, 0.06, 0.07, k.frame, 0, top + rise + 0.03, cf - run + 0.06);                 // верхняя кромка рамки
  for (const sx of [-1, 1]) B(0.06, 0.06, len, k.frame, sx * (W / 2 - 0.14), top + rise / 2 + 0.03, zc, a);   // стойки
  // сиденья: подушки и спинки, за ними — две дуги безопасности и гладкая палуба
  const dz = cf - 0.78, dx = W * 0.23;
  for (const sx of [-1, 1]) {
    B(0.5, 0.1, 0.5, SEAT, sx * dx, top - 0.02, dz + 0.05);
    B(0.5, 0.5, 0.12, SEAT, sx * dx, top + 0.2, dz - 0.24, -0.18);
    B(0.32, 0.16, 0.1, SEAT, sx * dx, top + 0.53, dz - 0.3, -0.18);                     // подголовник
    B(0.05, 0.36, 0.05, '#2b2a30', sx * dx - 0.15, top + 0.32, dz - 0.42);
    B(0.05, 0.36, 0.05, '#2b2a30', sx * dx + 0.15, top + 0.32, dz - 0.42);
    B(0.35, 0.05, 0.05, '#2b2a30', sx * dx, top + 0.5, dz - 0.42);
  }
  B(W - 0.3, 0.08, Math.max(0.2, dz - 0.5 - cb), k.body || '#d8262e', 0, top + 0.04, (dz - 0.5 + cb) / 2);   // палуба за сиденьями
  // курьер: оранжевая куртка и кепка, руки к рулю (как в carglass.js)
  const by = top - 0.02;
  B(0.38, 0.26, 0.26, '#f0522a', dx, by + 0.1, dz);                    // туловище
  B(0.44, 0.16, 0.28, '#f0522a', dx, by + 0.3, dz);                    // плечи
  B(0.2, 0.2, 0.2, '#e2b48c', dx, by + 0.48, dz + 0.01);                // голова
  B(0.22, 0.06, 0.22, '#f0522a', dx, by + 0.6, dz);                    // кепка
  B(0.2, 0.025, 0.11, '#c93f1f', dx, by + 0.58, dz + 0.15);             // козырёк
  for (const s of [-1, 1]) B(0.07, 0.07, 0.34, '#f0522a', dx + s * 0.16, by + 0.3, dz + 0.2, 0.35);   // руки к рулю
  B(0.28, 0.28, 0.03, '#1b1a1f', dx, by + 0.3, dz + 0.42, -0.35);       // руль
  // пасхалка: манекен в скафандре на пассажирском — белый костюм, шлем с тёмным стеклом, локоть на двери
  const px = -dx, SUIT = '#f2f0ea', SUIT2 = '#c9c6bd';
  B(0.38, 0.28, 0.26, SUIT, px, by + 0.1, dz);
  B(0.46, 0.17, 0.3, SUIT, px, by + 0.31, dz);
  B(0.2, 0.06, 0.08, '#d23a2f', px + 0.1, by + 0.31, dz + 0.16);        // нашивка на груди
  B(0.12, 0.08, 0.14, SUIT2, px, by + 0.38, dz);                        // ворот шлема
  B(0.3, 0.3, 0.3, SUIT, px, by + 0.56, dz);                            // шлем
  B(0.24, 0.15, 0.04, '#141a26', px, by + 0.57, dz + 0.15);             // стекло шлема
  B(0.18, 0.04, 0.02, '#8fb0d8', px - 0.02, by + 0.62, dz + 0.17);      // блик на стекле
  B(0.08, 0.08, 0.36, SUIT, px - 0.2, by + 0.3, dz + 0.08, 0.2);        // рука на двери…
  B(0.1, 0.08, 0.1, SUIT2, px - 0.24, by + 0.36, dz + 0.26);            //   …перчатка на кромке
  B(0.07, 0.07, 0.3, SUIT, px + 0.14, by + 0.18, dz + 0.16, 0.6);       // вторая — на коленях
  return { cf, cb };
}
