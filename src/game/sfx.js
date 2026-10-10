/* Звуки из файлов и звук в пространстве (М2, 09.10.2026). Правила словами — docs/SOUNDS.md.

   Автор кладёт файл в public/sfx: «coin.ogg», «crash-heavy-1.ogg», «crash-heavy-2.ogg» … Игра один раз
   читает sfx/index.json (его строит плагин в vite.config.js из папки — tools/sfx-index.mjs), качает
   и раскодирует файлы, когда появился звук (первое касание). Есть файл у имени — играет файл (случайный
   из вариантов, высота ±5 %), нет — звучит синтез из кода, как раньше. Сломанный файл — тоже синтез.

   Звук в мире (Snd.fx(…, { x, z })) — громче-тише от расстояния до своей машины и слева / справа
   по камере: общий узел (громкость + StereoPanner) для файла и для синтеза.

     load()              — прочитать список файлов (из game.js сразу при загрузке)
     attach(ctx)         — есть AudioContext (Snd.boot): раскодировать файлы
     ear(x, z, rx, rz)   — где «уши» (своя машина) и куда смотрит правое ухо (камера), каждый кадр
     place(at)           — { g, pan } для точки в мире или null — слишком далеко
     node(out, sp)       — узел «громкость + сторона» перед шиной out (sp — от place) или сам out
     play(name, out, v)  — сыграть файл (вариант подряд не повторяется); false — файла нет (тогда синтез), иначе длина, с
     buffer(name)        — готовый файл для петли (ambience.js) или null; fileGain(name) — его громкость
     STATS               — сколько раз сыграл файл / синтез по именам, ошибки (отладка: __dlv.Snd.SFX) */

const BASE = 'sfx/';
/* файлы обычно громче синтеза (у синтеза пик ~0,1—0,5): общий множитель. Автор нормализует файлы
   к пику около −3 дБ; громко / тихо одно имя — поправка в GAIN */
const FILE_GAIN = 0.45;
const GAIN = {};                                      // имя → множитель громкости файла (по просьбе автора)
const PITCH = 0.05;                                   // ±5 % высоты у каждого проигрыша файла

let LIST = {};                                        // имя → ['coin-1.ogg', …]
const BUF = {};                                       // имя → [AudioBuffer | false (сломан) | undefined (грузится)]
let ctx = null;
export const STATS = { listed: 0, loaded: 0, file: {}, synth: {}, errors: [], spatial: 0, far: 0 };

export function load () {
  if (typeof fetch !== 'function') return;
  fetch(BASE + 'index.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : {}))
    .then(j => {
      LIST = j && typeof j === 'object' ? j : {};
      STATS.listed = Object.values(LIST).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
      if (ctx) decodeAll();
    })
    .catch(() => { /* списка нет (старая сборка, файл открыт с диска) — только синтез */ });
}

export function attach (c) { ctx = c; decodeAll(); }

function decodeAll () {
  for (const name in LIST) {
    const files = LIST[name];
    if (!Array.isArray(files)) continue;
    const arr = BUF[name] || (BUF[name] = []);
    files.forEach((f, i) => {
      if (arr[i] !== undefined || arr['p' + i]) return;
      arr['p' + i] = 1;
      fetch(BASE + encodeURIComponent(f))
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(ab => new Promise((ok, no) => { const p = ctx.decodeAudioData(ab, ok, no); if (p && p.catch) p.catch(no); }))
        .then(b => { arr[i] = b; STATS.loaded++; })
        .catch(e => { arr[i] = false; STATS.errors.push(f + ': ' + ((e && e.message) || e || 'не раскодировался')); });
    });
  }
}

/** есть ли у имени готовый файл */
export const has = name => !!(BUF[name] && BUF[name].some(b => b));

/** случайный готовый файл имени (AudioBuffer) или null — для петель (ambience.js) */
export function buffer (name) {
  const arr = (BUF[name] || []).filter(Boolean);
  return arr.length ? arr[(Math.random() * arr.length) | 0] : null;
}
/** громкость файла имени, как у play() */
export const fileGain = name => FILE_GAIN * (GAIN[name] || 1);

const count = (box, name) => { box[name] = (box[name] || 0) + 1; };
export const synthed = name => count(STATS.synth, name);

/** сыграть файл имени в out; v — громкость (1 — как есть); false — файла нет, иначе — длина звучания, с.
    Вариант (имя-1, имя-2 …) подряд не повторяется */
const LASTI = {};
export function play (name, out, v = 1) {
  if (!ctx) return false;
  const arr = (BUF[name] || []).filter(Boolean);
  if (!arr.length) return false;
  let i = (Math.random() * arr.length) | 0;
  if (arr.length > 1 && i === LASTI[name]) i = (i + 1 + ((Math.random() * (arr.length - 1)) | 0)) % arr.length;
  LASTI[name] = i;
  const s = ctx.createBufferSource();
  s.buffer = arr[i];
  const rate = 1 + (Math.random() * 2 - 1) * PITCH;
  s.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = FILE_GAIN * (GAIN[name] || 1) * (v == null ? 1 : v);
  s.connect(g); g.connect(out);
  s.onended = () => { try { g.disconnect(); } catch (e) { /* — */ } };
  s.start();
  count(STATS.file, name);
  return s.buffer.duration / rate || 0.01;
}

/* ─── в пространстве ─── */
const EAR = { x: 0, z: 0, rx: 1, rz: 0, set: false };
export function ear (x, z, rx, rz) {
  const l = Math.hypot(rx, rz) || 1;
  EAR.x = x; EAR.z = z; EAR.rx = rx / l; EAR.rz = rz / l; EAR.set = true;
}
export const EAR_DBG = EAR;

/** at: { x, z, far = 90, near = 5 }; → { g, pan } или null (дальше far) */
export function place (at) {
  if (!at || at.x == null || !EAR.set) return null;
  const dx = at.x - EAR.x, dz = at.z - EAR.z, d = Math.hypot(dx, dz);
  const far = at.far || 90, near = Math.min(at.near != null ? at.near : 5, far * 0.5);
  if (d >= far) { STATS.far++; return { g: 0, pan: 0 }; }
  const k = d <= near ? 1 : 1 - (d - near) / (far - near);
  // в сторону — по правому уху камеры; рядом (в машине) — почти по центру, иначе каждый пустяк скачет по ушам
  const side = d > 0.01 ? (dx * EAR.rx + dz * EAR.rz) / d : 0;
  return { g: k * k * 0.6 + k * 0.4, pan: Math.max(-0.85, Math.min(0.85, side * Math.min(1, d / 10))) };
}

/** узел «громкость + сторона» перед out; sp — от place() */
export function node (out, sp) {
  if (!ctx || !sp) return out;
  STATS.spatial++;
  const g = ctx.createGain();
  g.gain.value = sp.g;
  g.__bus = out; g.__sp = sp.g;                       // тёплый синтез (sfxsynth.js): отзвук — в шину, вдали глуше
  let p = null;
  if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = sp.pan; g.connect(p); p.connect(out); }
  else g.connect(out);
  // синтез из нескольких нот (сирена, клаксон) идёт до ~1 с, файлы — снимаются сами (onended);
  // узел отцепляем позже — к этому времени всё уже отзвучало
  setTimeout(() => { try { g.disconnect(); if (p) p.disconnect(); } catch (e) { /* — */ } }, 12000);
  return g;
}

export const DEBUG = { STATS, get LIST () { return LIST; }, BUF, has, EAR, place, GAIN, reload: () => { for (const k in BUF) delete BUF[k]; load(); } };
