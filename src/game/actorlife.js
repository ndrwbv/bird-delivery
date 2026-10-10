/* ──────────────────────────────────────────────────────────────────────────
   Живые актёры катсцен (docs/IDEAS.md Н2, docs/ORDERS.md «Катсцены: живые лица»).
   Только в катсценах — главы героев и бабы Зины (story.js), Стёпа на лавочке
   (stepabench.js через story.js), вступление (intro.js). Обычные прохожие — как были:
   этот файл в обычной езде ничего не считает.

   Лицо: у актёра своя маленькая текстура лица (Wp×16 пикселей, как у всех) вместо общей —
   и её перерисовываем, только когда меняется кадр: моргнул, открыл / закрыл рот, сменил
   выражение. Это 5—10 перерисовок в секунду на двух человек — даром.
     • моргает — раз в 2—5 с на 0,12 с (иногда дважды подряд);
     • говорит — рот закрыт / приоткрыт / открыт (три кадра, как у портрета — talkface.js), пока его
       реплика печатается, с паузами-вдохами; допечаталась — рот закрыт;
     • выражение реплики — { emo } в сценарии: happy | angry | sad | scared | surprised
       (people.js EMO_FACE: брови, глаза, рот); после реплики держится ещё EMO_HOLD с.
       Действие тоже даёт лицо: joy — радуется, sad — грустит.
   Тело — по характеру (CHAR): походка (шаг, размах, подпрыгивает, шаркает, качает бёдрами),
   жест, пока говорит (машет руками, разводит руками, грозит пальцем, руки в боки…), и жест
   выражения: злится — топает, радуется — подпрыгивает, пугается — руки к груди и дрожит,
   удивляется — вскидывает руки, грустит — голова вниз, руки висят.

     attach(a, kind)          — актёр story.js { grp, … } → a.life; kind — ключ CHAR (id героя)
     faceOnly(grp)            — только лицо (вступление: Стёпа на лавочке, руками водит guestStep)
     say(a, on, emo)          — начал / кончил реплику
     hush(a)                  — реплика допечаталась: рот закрыт (жест и выражение — до конца реплики)
     emo(a, e, sec)           — выражение на время (действие joy / sad)
     pose(a, P, dt, t)        — поправить позу кадра: P { walking, ph, aL, aR, zL, zR, hx, hy, lift, legL, legR, roll }
     face(L, dt)              — шаг лица (L = a.life или то, что вернул faceOnly)
     detach(a | L)            — вернуть общее лицо, освободить свою текстуру
   ────────────────────────────────────────────────────────────────────────── */
import { EMO_FACE, drawFaceFrame } from './people.js';
import { nextMouth, calm } from './talkface.js';

export const LIFE = {
  BLINK: [2, 5],        // пауза между морганиями, с
  BLINK_T: 0.12,        // глаза закрыты, с
  EMO_HOLD: 0.8,        // выражение после реплики держится, с
};

/* характеры: walk — походка, talk — жест, пока говорит, idle — стоит и молчит.
   speed — × к скорости шага в катсцене, step — частота шага, leg — размах ног, arm — размах рук
   (× от ног), hop — подпрыгивает на шаге, drag — шаркает (ноги низко, шаг частый),
   sway — качает бёдрами, stoop — голова вперёд (сутулится) */
export const CHAR = {
  courier: { walk: { speed: 1, step: 8, leg: 0.6, arm: 0.6 }, talk: 'small', idle: 'still' },
  zina: { walk: { speed: 0.8, step: 11, leg: 0.22, arm: 0.25, drag: 1, stoop: 0.16 }, talk: 'wag', idle: 'still' },        // баба Зина — шаркает, грозит пальцем
  stepa: { walk: { speed: 0.95, step: 6.5, leg: 0.5, arm: 1, sway: 0.06 }, talk: 'spread', idle: 'still' },               // вразвалку, разводит руками «брат»
  'stepa-bench': { walk: { speed: 0.95, step: 6.5, leg: 0.5, arm: 1, sway: 0.06 }, talk: 'spread', idle: 'still' },
  'stepa-first': { walk: { speed: 0.95, step: 6.5, leg: 0.5, arm: 1, sway: 0.06 }, talk: 'spread', idle: 'still' },   // учебный заказ (stepafirst.js)
  arisha: { walk: { speed: 1.05, step: 8.5, leg: 0.55, arm: 0.7 }, talk: 'flap', idle: 'still' },                       // машет руками
  leha: { walk: { speed: 1.05, step: 9, leg: 0.6, arm: 0.5, hop: 0.04 }, talk: 'rub', idle: 'fidget' },                 // азартный: трёт руки, не стоит на месте
  zheka: { walk: { speed: 1, step: 7.5, leg: 0.55, arm: 0.35 }, talk: 'point', idle: 'still' },                         // рабочий: шаг ровный, тычет пальцем
  igor: { walk: { speed: 1.15, step: 10, leg: 0.65, arm: 0.8, hop: 0.09 }, talk: 'flap', idle: 'bounce' },               // подпрыгивает
  nast: { walk: { speed: 1, step: 9.5, leg: 0.4, arm: 0.5, sway: 0.09 }, talk: 'hips', idle: 'sway' },                  // каблуки: качает бёдрами, руки в боки
  andr: { walk: { speed: 0.9, step: 7, leg: 0.4, arm: 0.2, drag: 0.6, stoop: 0.12 }, talk: 'shrug', idle: 'still' },     // вайбкодер: шаркает, сутулится, пожимает плечами
  host: { walk: { speed: 1, step: 8, leg: 0.6, arm: 0.6 }, talk: 'small', idle: 'still' },
};
const EMOS = ['happy', 'angry', 'sad', 'scared', 'surprised'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

/* ── лицо ── */
function liveFace (grp) {
  const u = grp && grp.userData;
  const m = u && u.faceM;
  if (!m || !m.material || !m.material.map || !u.look || !u.faceS) return null;
  const c = document.createElement('canvas');
  c.width = u.faceS.Wp; c.height = 16;
  const mat = m.material.clone();                 // тот же Lambert с alphaTest, но своя текстура
  const tex = m.material.map.clone();             // фильтры «крупный пиксель» и цвет — как у общей
  tex.image = c; tex.needsUpdate = true;
  mat.map = tex; mat.userData = {};               // своя — dropMesh её освободит (keep нет)
  const L = { m, shared: m.material, mat, tex, c, ctx: c.getContext('2d'), Lk: u.look, skin: u.faceS.skin, Wp: u.faceS.Wp,
    blinkIn: rnd(0.6, 2.5), blinkT: 0, talk: false, talkT: 0, mouth: 0, emo: '', emoT: 0, key: '', draws: 0 };
  m.material = mat;
  draw(L);
  return L;
}
function draw (L) {
  const open = L.talk ? L.mouth : 0, key = (L.blinkT > 0 ? 'b' : '-') + open + L.emo;
  if (key === L.key) return;
  L.key = key;
  const Lk = L.emo && EMO_FACE[L.emo] ? Object.assign({}, L.Lk, EMO_FACE[L.emo]) : L.Lk;
  drawFaceFrame(L.ctx, Lk, L.skin, L.Wp, { blink: L.blinkT > 0, half: open === 1, talk: open === 2 });
  L.tex.needsUpdate = true;
  L.draws++;
}
export function face (L, dt) {
  if (!L) return;
  // моргание: закрыл на BLINK_T, иногда — второй раз сразу
  if (L.blinkT > 0) { L.blinkT -= dt; if (L.blinkT <= 0 && Math.random() < 0.18) L.blinkIn = 0.16; }
  else if ((L.blinkIn -= dt) <= 0) { L.blinkT = LIFE.BLINK_T; L.blinkIn = rnd(LIFE.BLINK[0], LIFE.BLINK[1]); }
  // рот: закрыт / приоткрыт / открыт неровно, иногда — вдох (закрыт подольше); talkface.js nextMouth — как у портрета
  if (L.talk) {
    if ((L.talkT -= dt) <= 0) { const [m, hold] = nextMouth(L.mouth); L.mouth = m; L.talkT = hold; }
  } else L.mouth = 0;
  if (L.emoT > 0 && (L.emoT -= dt) <= 0) L.emo = '';
  draw(L);
}
export function faceOnly (grp) { return liveFace(grp); }
export function detach (x) {
  const L = x && x.life ? x.life.face : x && x.m ? x : null;
  if (L) {
    if (L.m.material === L.mat) L.m.material = L.shared;
    L.mat.dispose(); L.tex.dispose();
  }
  if (x && x.life) x.life = null;
}

/* ── актёр story.js ── */
export function attach (a, kind) {
  if (!a || !a.grp) return null;
  const ch = CHAR[kind] || CHAR.host;
  a.life = { ch, kind, face: liveFace(a.grp), emo: '', emoT: 0, talk: false, tt: Math.random() * 10, gest: 0 };
  return a.life;
}
/* выражение лица на sec секунд (0 — пока не снимут) */
function setEmo (a, e, sec) {
  const l = a && a.life;
  if (!l) return;
  l.emo = EMOS.includes(e) ? e : ''; l.emoT = sec || 0;
  if (l.face) { l.face.emo = l.emo; l.face.emoT = sec || 0; }
}
export function emo (a, e, sec) { setEmo(a, e, sec); }
export function say (a, on, e) {
  const l = a && a.life;
  if (!l) return;
  l.talk = !!on;
  if (l.face) { l.face.talk = !!on && !calm(); if (on) { l.face.mouth = 1; l.face.talkT = 0.1; } }
  if (on) { if (e || !(l.emoT > 0)) setEmo(a, e, 0); l.gest = 0; }      // без пометки — лицо от действия (joy) досиживает своё
  else if (l.emo) setEmo(a, l.emo, LIFE.EMO_HOLD);
}

export function hush (a) {
  const l = a && a.life;
  if (l && l.face) { l.face.talk = false; l.face.mouth = 0; }
}

/* поза кадра: story.js actorStep собирает P (ходьба), здесь — характер и чувства */
export function pose (a, P, dt, t) {
  const l = a && a.life;
  if (!l) return;
  if (l.emoT > 0 && (l.emoT -= dt) <= 0) l.emo = '';
  if (l.face) face(l.face, dt);
  const W = l.ch.walk, sit = !!a.sit;
  l.tt += dt;
  if (P.walking) {
    // походка: шаг и размах по характеру (story.js двигает фазу на 8 рад/с — свою считаем сами)
    l.ph = (l.ph || 0) + dt * W.step;
    const s = Math.sin(l.ph), lg = W.leg;
    P.legL = s * lg; P.legR = -s * lg;
    P.aL = -s * lg * W.arm; P.aR = s * lg * W.arm;
    if (W.hop) P.lift += Math.abs(s) * W.hop;
    if (W.drag) { P.legL *= 1 - 0.3 * W.drag; P.legR *= 1 - 0.3 * W.drag; P.lift += Math.abs(s) * 0.006; }
    if (W.sway) P.roll = Math.sin(l.ph) * W.sway;
    if (W.stoop) P.hx += W.stoop;
  } else {
    if (W.stoop) P.hx += W.stoop * 0.6;
    const tt = l.tt;
    // стоит молча — по характеру: Лёха переминается, Игорёк пружинит, Настюша покачивается
    if (!l.talk && !sit) {
      if (l.ch.idle === 'fidget') { P.legL = Math.max(0, Math.sin(tt * 2.2)) * 0.18; P.lift += Math.max(0, Math.sin(tt * 2.2)) * 0.015; }
      else if (l.ch.idle === 'bounce') P.lift += Math.abs(Math.sin(tt * 4.2)) * 0.03;
      else if (l.ch.idle === 'sway') P.roll = Math.sin(tt * 1.6) * 0.04;
    }
  }
  // жест, пока говорит (руки свободны — не держит коробку и не занят действием)
  const tt = l.tt, free = !a.hold && !a.act;
  if (l.talk && free && !P.walking) {
    l.gest += dt;
    const env = clamp(l.gest * 3, 0, 1);
    switch (l.ch.talk) {
      case 'wag': P.aR = -1.9 * env; P.zR = 0.35 + Math.sin(tt * 9) * 0.22 * env; break;                                         // грозит пальцем
      case 'spread': { const k = (Math.sin(tt * 2.1) * 0.5 + 0.5) * env; P.aL = P.aR = -0.75 * k; P.zL = -0.75 * k; P.zR = 0.75 * k; break; }   // разводит руками
      case 'flap': P.aL = (-0.9 + Math.sin(tt * 6.5) * 0.55) * env; P.aR = (-0.9 + Math.sin(tt * 6.5 + 2) * 0.55) * env; P.zL = -0.25 * env; P.zR = 0.25 * env; break;   // машет руками
      case 'rub': P.aL = P.aR = -1.05 * env; P.zL = (0.35 + Math.sin(tt * 12) * 0.12) * env; P.zR = -(0.35 + Math.sin(tt * 12) * 0.12) * env; break;   // трёт ладони
      case 'point': { const k = Math.sin(tt * 1.7) > -0.2 ? 1 : 0.3; P.aR = -1.45 * env * k + Math.sin(tt * 8) * 0.06; break; }   // тычет пальцем
      case 'hips': P.zL = -0.7 * env; P.zR = 0.7 * env; P.aL = P.aR = 0.35 * env; P.hy += Math.sin(tt * 2.4) * 0.12; break;   // руки в боки, голова набок
      case 'shrug': { const k = Math.max(0, Math.sin(tt * 2.6)) * env; P.zL = -0.55 * k; P.zR = 0.55 * k; P.aL = P.aR = -0.45 * k; P.hx -= 0.05 * k; break; }   // пожимает плечами
      default: P.aR = (-0.55 + Math.sin(tt * 4) * 0.2) * env; break;                                                         // курьер: чуть водит рукой
    }
  } else if (!l.talk) l.gest = 0;
  // чувства поверх характера
  if (l.emo && !a.act) {
    const k = l.talk ? clamp(l.gest * 3, 0, 1) : 1;
    switch (l.emo) {
      case 'angry':           // топает: правая нога бьёт в землю, руки вниз и в стороны (кулаки)
        if (!sit && !P.walking) { const st = Math.max(0, Math.sin(tt * 7)); P.legR = -0.55 * st * k; P.lift += 0.02 * st * k; }
        if (!a.hold) { P.zL = -0.28 * k; P.zR = 0.28 * k; P.aL = P.aR = 0.15 * k; }
        P.hx += 0.1 * k;
        break;
      case 'happy':           // подпрыгивает
        if (!sit && !P.walking) P.lift += Math.abs(Math.sin(tt * 8)) * 0.07 * k;
        break;
      case 'scared':          // руки к груди, дрожит, голова назад
        if (!a.hold) { P.aL = P.aR = -1.65 * k; P.zL = 0.45 * k; P.zR = -0.45 * k; }
        P.hx -= 0.12 * k; P.hy += Math.sin(tt * 37) * 0.04 * k; P.roll += Math.sin(tt * 41) * 0.015 * k;
        break;
      case 'surprised': {     // вскинул руки — и держит приподнятыми
        const up = l.talk ? Math.max(0.45, 1 - l.gest * 0.8) : 0.45;
        if (!a.hold) { P.aL = P.aR = -2.3 * up * k; P.zL = -0.35 * k; P.zR = 0.35 * k; }
        P.hx -= 0.14 * k;
        break;
      }
      case 'sad':             // голова вниз, руки висят
        P.hx += 0.28 * k;
        if (!a.hold) { P.aL = P.aR = 0.06; P.zL = P.zR = 0; }
        break;
    }
  }
}

/* отладка (__dlv.STORY_DBG.faceSheet): лица актёров во всех выражениях одной картинкой.
   grps — модели makeHuman; столбцы — спокойно, моргнул, говорит, потом выражения (молчит / говорит) */
function sheet (grps, px = 8) {
  const cols = [['', 0, 0], ['', 1, 0], ['', 0, 1]];
  for (const e of EMOS) cols.push([e, 0, 0], [e, 0, 1]);
  const rows = grps.filter(g => g && g.userData && g.userData.look && g.userData.faceS);
  const W = 22, c = document.createElement('canvas');
  c.width = cols.length * W * px; c.height = rows.length * 18 * px;
  const o = c.getContext('2d');
  o.imageSmoothingEnabled = false;
  const f = document.createElement('canvas'), fx = f.getContext('2d');
  rows.forEach((g, r) => {
    const u = g.userData;
    f.width = u.faceS.Wp; f.height = 16;
    cols.forEach(([e, b, tk], k) => {
      const Lk = e ? Object.assign({}, u.look, EMO_FACE[e]) : u.look;
      drawFaceFrame(fx, Lk, u.faceS.skin, u.faceS.Wp, { blink: !!b, talk: !!tk });
      const x0 = (k * W + (W - u.faceS.Wp) / 2) * px, y0 = (r * 18 + 1) * px;
      o.fillStyle = u.faceS.skin; o.fillRect(x0, y0, u.faceS.Wp * px, 16 * px);
      o.drawImage(f, x0, y0, u.faceS.Wp * px, 16 * px);
    });
  });
  return c.toDataURL('image/png');
}
export const DEBUG = { LIFE, CHAR, sheet, cols: () => ['calm', 'blink', 'talk'].concat(...EMOS.map(e => [e, e + '+talk'])) };
