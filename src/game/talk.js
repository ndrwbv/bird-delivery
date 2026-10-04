/* ──────────────────────────────────────────────────────────────────────────
   Реплики над головами (облачка прохожих, водителей, героев, клиентов) — правила в docs/CAREER.md
   «Реплики людей на улице».

   Все облачка рисует tex(): тёмная плашка с цветной обводкой (цвет — кто говорит: красный — злой,
   синий — обычный…), белый жирный шрифт, хвостик вниз к голове; до 3 строк, длинное — по словам.
   track(sprite) — облачко под присмотром: каждый кадр step() решает, кого показать:
     • видно не дальше FAR м от машины (с FADE м — гаснет); дальше — скрыто;
     • одновременно — не больше MAX облачков, ближние к машине важнее;
     • размер на экране: вблизи (NEAR м и ближе) текст — BIG доли высоты экрана, к FAR м
       уменьшается до SMALL — чем ближе подъехал, тем крупнее;
     • поверх стен и деревьев (не прячется за столбом), низом — над головой; вне кадра место
       не занимает; налезает на ближнее — дальнее поднимается над ним.
   Кто создаёт облачко, тот его и убирает (как раньше): снятое со сцены облачко отсюда уходит само.

   Из game.js: sayBubble/rageTex → tex + track; step(dt, cam, V) — каждый кадр (CL.step 'talk').
   Из flirt.js, heroes.js — tex + track напрямую.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const TALK = {
  FAR: 42,        // м от машины: дальше облачко скрыто
  FADE: 8,        // м: последние столько до FAR — гаснет
  NEAR: 9,        // м: ближе — самый крупный текст
  BIG: 0.034,     // высота строки текста — доля высоты экрана вблизи (~24 px на 720p)
  SMALL: 0.019,   // …и у FAR (~14 px)
  MAX: 4,         // облачков одновременно
  LIFT: 0.3,      // м: низ облачка ниже прежней точки (раньше там был центр)
};

/* ═════════════ текстура ═════════════ */
const FONT = '"Arial Black", "Helvetica Neue", Arial, "Noto Sans", system-ui, sans-serif';
const FS = 52, LH = 62, PADX = 30, PADY = 20, TAIL = 22, MAXW = 600, BORDER = 7;
const CACHE = new Map(), CACHE_MAX = 240;

/* плашка: цвет обводки col, имя (необязательно) — строкой сверху в цвет обводки */
export function tex (text, col = '#5a4a9a', name = '') {
  const key = col + '|' + name + '|' + text;
  const hit = CACHE.get(key);
  if (hit) { CACHE.delete(key); CACHE.set(key, hit); return hit; }
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const font = s => 'bold ' + s + 'px ' + FONT;
  // перенос по словам: до 3 строк; не лезет — шрифт меньше
  let fs = FS, L = [];
  for (; fs >= 30; fs -= 4) {
    x.font = font(fs);
    L = []; let cur = '';
    for (const w of String(text).split(' ')) {
      const s = cur ? cur + ' ' + w : w;
      if (cur && x.measureText(s).width > MAXW) { L.push(cur); cur = w; } else cur = s;
    }
    if (cur) L.push(cur);
    if (L.length <= 3 && Math.max(...L.map(q => x.measureText(q).width)) <= MAXW) break;
  }
  const lh = LH * fs / FS, nameH = name ? 40 : 0;
  x.font = font(fs);
  let tw = Math.max(...L.map(q => x.measureText(q).width), 60);
  if (name) { x.font = font(30); tw = Math.max(tw, x.measureText(name).width); }
  const W = Math.ceil(tw + PADX * 2 + BORDER * 2), H = Math.ceil(nameH + L.length * lh + PADY * 2 + BORDER * 2);
  c.width = W; c.height = H + TAIL;
  const b = BORDER / 2;
  x.fillStyle = 'rgba(20, 20, 28, 0.9)'; x.strokeStyle = col; x.lineWidth = BORDER; x.lineJoin = 'round';
  x.beginPath(); x.roundRect(b, b, W - BORDER, H - BORDER, 22); x.fill(); x.stroke();
  // хвостик к голове
  x.beginPath(); x.moveTo(W / 2 - 16, H - BORDER); x.lineTo(W / 2, H + TAIL - 3); x.lineTo(W / 2 + 16, H - BORDER); x.closePath();
  x.fillStyle = col; x.fill();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  let y = BORDER + PADY;
  if (name) { x.font = font(30); x.fillStyle = light(col); x.fillText(name, W / 2, y + 16); y += nameH; }
  x.font = font(fs); x.fillStyle = '#ffffff';
  x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowOffsetY = 3;
  L.forEach((q, i) => x.fillText(q, W / 2, y + lh * (i + 0.5) + 2));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.userData.lines = L.length + (name ? 0.65 : 0);
  t.userData.lineH = lh;
  CACHE.set(key, t);
  if (CACHE.size > CACHE_MAX) { const k = CACHE.keys().next().value; CACHE.get(k).dispose(); CACHE.delete(k); }
  return t;
}
/* цвет говорящего на тёмной плашке: тёмные (синий, фиолетовый) — светлее, чтобы имя читалось */
function light (col) {
  const c = new THREE.Color(col), hsl = {};
  c.getHSL(hsl);
  return '#' + c.setHSL(hsl.h, Math.min(1, hsl.s + 0.1), Math.max(hsl.l, 0.68)).getHexString();
}

/* ═════════════ кого показать и каким размером ═════════════ */
const LIVE = new Set();
const ST = { tracked: 0, shown: 0, hidden: 0 };
export function track (s) {
  if (!s || !s.isSprite) return s;
  s.center.set(0.5, 0);                            // низом — над головой, растёт вверх
  if (!s.userData.talk) s.position.y -= TALK.LIFT;
  s.userData.talk = 1;
  s.material.depthTest = false; s.material.transparent = true;
  s.renderOrder = 30;
  s.visible = false;                               // покажет step(), когда решит, что можно
  LIVE.add(s);
  return s;
}
/* сменить текст у облачка под присмотром */
export function retext (s, text, col, name) { s.material.map = tex(text, col, name); s.material.needsUpdate = true; }

const P = new THREE.Vector3(), Q = new THREE.Vector3(), WS = new THREE.Vector3(), LIST = [], RECTS = [];
const sstep = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
function onScene (s) { let o = s; while (o.parent) o = o.parent; return o.isScene; }

export function step (dt, cam, V) {
  LIST.length = 0;
  for (const s of LIVE) {
    if (!s.parent) { LIVE.delete(s); continue; }
    if (s.userData.mute) { s.visible = false; continue; }               // хозяин облачка велел молчать
    if (!onScene(s)) { s.visible = false; if ((s.userData.off = (s.userData.off || 0) + dt) > 5) LIVE.delete(s); continue; }
    s.userData.off = 0;
    s.getWorldPosition(P);
    const d = Math.hypot(P.x - V.x, P.z - V.z);
    if (d > TALK.FAR) { s.visible = false; continue; }
    LIST.push([d, s]);
  }
  LIST.sort((a, b) => a[0] - b[0]);
  const tan = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), asp = cam.aspect || 1.6;
  let shown = 0;
  RECTS.length = 0;
  for (let i = 0; i < LIST.length; i++) {
    const [d, s] = LIST[i];
    const m = s.material.map, img = m && m.image;
    if (shown >= TALK.MAX || !img) { s.visible = false; continue; }
    s.getWorldPosition(P);
    const dc = Math.max(1, P.distanceTo(cam.position));
    Q.copy(P).project(cam);
    if (Q.z > 1 || Q.x < -1.15 || Q.x > 1.15 || Q.y < -1.2 || Q.y > 1.1) { s.visible = false; continue; }   // не в кадре — место не занимает
    const k = sstep(TALK.NEAR, TALK.FAR, d);
    const line = TALK.BIG + (TALK.SMALL - TALK.BIG) * k;                    // доля экрана на строку
    const hf = line * img.height / (m.userData.lineH || LH);                // доля высоты экрана на всю плашку
    const wf = hf * img.width / img.height / asp;
    const h = hf * dc * tan;                                                 // мировая высота
    s.parent.getWorldScale(WS);
    const ws = Math.max(1e-3, WS.y);
    s.scale.set(h * img.width / img.height / ws, h / ws, 1);
    // не налезать на ближние: дальнее облачко поднимаем над ними (сдвиг — центром спрайта)
    const x0 = (Q.x + 1) / 2 - wf / 2, x1 = x0 + wf, y0 = (Q.y + 1) / 2;
    let y = y0;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const r of RECTS) if (x0 < r[1] && x1 > r[0] && y < r[3] && y + hf > r[2]) { y = r[3] + 0.006; moved = true; }
      if (!moved) break;
    }
    s.center.set(0.5, -(y - y0) / hf);
    RECTS.push([x0, x1, y, y + hf]);
    s.renderOrder = 40 - shown;                                              // ближние — поверх
    s.material.opacity = 1 - sstep(TALK.FAR - TALK.FADE, TALK.FAR, d);
    s.visible = true;
    shown++;
  }
  ST.tracked = LIVE.size; ST.shown = shown; ST.hidden = LIST.length - shown;
}

export const DEBUG = { TALK, ST, LIVE, tex, track, get list () { return LIST.map(([d, s]) => ({ d: +d.toFixed(1), vis: s.visible, sy: +s.scale.y.toFixed(2), op: +s.material.opacity.toFixed(2) })); } };
