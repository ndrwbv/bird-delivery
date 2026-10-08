/* ──────────────────────────────────────────────────────────────────────────
   Площадки-качалки во дворах (docs/CAREER.md «Город: как выглядит» → «Площадки-качалки»).

   Где: у части спортплощадок-коробок (WO.SHARE), за их заборчиком — пятачок песка
   4,6 × 2,4 м: турник (перекладина на 2,3 м) и брусья (1,25 м). Не встаёт на дорогу,
   тротуар, дорожки и аллеи (pave.js), в дома, на лавочки и в другое твёрдое.
   Стойки — твёрдые (машина упирается, как в столб).

   Кто: днём (не ночью и не в дождь), когда машина ближе WO.NEAR м, на WO.ACTIVE ближайших
   площадках качаются 1—2 человека: на турнике подтягиваются (широким хватом, по 5—12 раз,
   потом виснут и отдыхают), на брусьях отжимаются. Дальше WO.DROP м — люди уходят.

   Сам: остановился ближе WO.ME_R м к площадке (медленнее 2 км/ч) и постоял WO.ME_WAIT с —
   курьер выходит и подтягивается сам (5—12 раз, счёт над головой). Раз за смену — бонус
   WO.ME_HEAL сердца (если не полные); тронулся — бросил подход.

   build(api) — game.js, в сборке дворов (после коробок, до склейки): { THREE, PITCHES, LIT, box, obb,
     groundH, inHouse, nearestRoad, solidAt, BENCHES, onPave }
   init(api)  — game.js, после сборки: { scene, V, S, ENV, makeHuman, dropMesh, sayBubble, toast, heal,
     shiftN, cutOn, courier, Snd }
   step(dt)   — каждый кадр
   отладка: __dlv.WORK
   ────────────────────────────────────────────────────────────────────────── */
import { t } from '../i18n/index.js';
import { makePerson } from './people.js';

export const WO = {
  SHARE: 0.55,             // у какой доли коробок есть качалка
  BAR_H: 2.3, DIP_H: 1.25,
  NEAR: 110, DROP: 150, ACTIVE: 2,
  ARM: 0.6, SHOULDER: 1.3,  // длина руки и высота плеча человека (people.js), м
  ME_R: 7, ME_WAIT: 1.5, ME_HEAL: 0.5,
};

let B = null, A = null;
const SITES = [];
const ST = { sites: 0, tried: 0, active: 0, people: 0, me: 0, heal: 0 };
const rand = (a, b) => a + Math.random() * (b - a);
const hsh = (x, z) => { let h = Math.imul(Math.round(x) ^ 0x51ed27, 0x9E3779B1) ^ Math.imul(Math.round(z) + 0x2545f491, 0x85ebca6b); h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

/* ── сборка: место у коробки и железо ── */
function spotOk (x, z, ux, uz) {
  for (const [a, b] of [[-2.6, -1.5], [2.6, -1.5], [2.6, 1.5], [-2.6, 1.5], [0, 0]]) {
    const px = x + ux * a - uz * b, pz = z + uz * a + ux * b;
    if (B.onPave(px, pz, 0.6) || B.inHouse(px, pz, 1.5) || B.groundH(px, pz) < 0.3) return false;
    const r = B.nearestRoad(px, pz, 7, 1);
    if (r && r.d < r.seg.w / 2 + 2) return false;
    if (B.solidAt(px, pz, 0.8)) return false;
  }
  for (const q of B.BENCHES || []) if (Math.hypot(q.x - x, q.z - z) < 5) return false;
  for (const s of SITES) if (Math.hypot(s.x - x, s.z - z) < 30) return false;
  for (const p of B.PITCHES) if (Math.abs((x - p.cx) * p.ux + (z - p.cz) * p.uz) < p.L / 2 + 2.5 && Math.abs((x - p.cx) * p.nx + (z - p.cz) * p.nz) < p.W / 2 + 2.5) return false;
  return true;
}
function place (pt) {
  // вдоль длинной стороны снаружи заборчика, ближе к краю; иначе у короткой
  const opts = [];
  for (const sd of [1, -1]) for (const a of [-0.3, 0.3, 0]) opts.push([pt.L * a, sd * (pt.W / 2 + 5.2), pt.ux, pt.uz]);
  for (const sd of [1, -1]) opts.push([sd * (pt.L / 2 + 5.2), 0, pt.nx, pt.nz]);
  for (const [a, b, ux, uz] of opts) {
    const x = pt.cx + pt.ux * a + pt.nx * b, z = pt.cz + pt.uz * a + pt.nz * b;
    if (spotOk(x, z, ux, uz)) return { x, z, ux, uz };
  }
  return null;
}
function iron (s) {
  const { LIT, box, obb } = B, { x, z, ux, uz } = s;
  const ry = Math.atan2(-uz, ux), nx = -uz, nz = ux;
  const P = (a, b) => [x + ux * a + nx * b, z + uz * a + nz * b];
  const gy = B.groundH(x, z);
  box(LIT, 4.6, 0.05, 2.4, '#cdb98f', x, gy + 0.025, z, ry);          // песок
  const STEEL = '#4f5a66', PAINT = s.paint;
  s.posts = [];
  const post = (a, b, h, hex) => { const [px, pz] = P(a, b); s.posts.push([px, pz]); box(LIT, 0.09, h, 0.09, hex, px, B.groundH(px, pz) + h / 2, pz, ry); obb(px, pz, 0.12, 0.12, ry); };
  // турник: две стойки, перекладина
  post(-2.0, 0, WO.BAR_H + 0.05, PAINT); post(-0.6, 0, WO.BAR_H + 0.05, PAINT);
  { const [bx, bz] = P(-1.3, 0); box(LIT, 1.5, 0.05, 0.05, STEEL, bx, gy + WO.BAR_H, bz, ry); }
  // брусья: четыре стойки, две жерди вдоль
  for (const b of [-0.3, 0.3]) {
    post(0.7, b, WO.DIP_H, PAINT); post(2.3, b, WO.DIP_H, PAINT);
    const [bx, bz] = P(1.5, b);
    box(LIT, 1.9, 0.06, 0.06, STEEL, bx, gy + WO.DIP_H, bz, ry);
  }
  s.bar = { ...xz(P(-1.3, 0)), y: gy + WO.BAR_H };
  s.dip = { ...xz(P(1.5, 0)), y: gy + WO.DIP_H };
  s.h = Math.atan2(nx, nz);                 // на турнике — лицом поперёк перекладины
  s.hd = Math.atan2(ux, uz);                // на брусьях — вдоль жердей
}
const xz = ([x, z]) => ({ x, z });

export function build (api) {
  B = api;
  const PAINTS = ['#3f6fa8', '#c9483a', '#3f8a4a', '#d9a03a', '#5a5f68'];
  for (const pt of B.PITCHES || []) {
    if (hsh(pt.cx, pt.cz) > WO.SHARE) continue;
    ST.tried++;
    const s = place(pt);
    if (!s) continue;
    s.paint = PAINTS[(hsh(pt.cz, pt.cx) * PAINTS.length) | 0];
    iron(s);
    s.people = null;
    SITES.push(s);
  }
  ST.sites = SITES.length;
  return ST;
}

/* ── люди: подтягиваются и отжимаются ── */
function pose (p, dt) {
  const u = p.grp.userData, hs = p.grp.scale.y, L = WO.ARM * hs, SH = WO.SHOULDER * hs;
  p.t += dt;
  // подход: reps повторений по per с, потом отдых rest с
  let k = 0;
  if (p.rep < p.reps) {
    const f = (p.t / p.per) % 1;
    k = 0.5 - 0.5 * Math.cos(f * Math.PI * 2);           // 0 — внизу, 1 — вверху
    if (p.t >= p.per * (p.rep + 1)) { p.rep++; if (p.onRep) p.onRep(p.rep); }
  } else if (p.t > p.per * p.reps + p.rest) {
    if (p.onSet && p.onSet()) return;
    p.t = 0; p.rep = 0; p.reps = 5 + ((Math.random() * 8) | 0);
  }
  if (p.kind === 'bar') {
    // широкий хват: руки вверх и в стороны, кисти на перекладине; вверх — руки шире, тело выше
    const th = 0.22 + 0.95 * k;
    u.armL.rotation.set(-Math.PI, 0, -th); u.armR.rotation.set(-Math.PI, 0, th);
    u.legL.rotation.x = u.legR.rotation.x = 0.25 + 0.1 * k;
    u.head.rotation.x = -0.15 * k;
    p.grp.position.set(p.x, p.y - SH - L * Math.cos(th), p.z);
  } else {
    // брусья: руки вниз и чуть назад, ниже — сильнее назад; ноги согнуты назад
    const ph = 0.12 + 0.75 * (1 - k);
    u.armL.rotation.set(ph, 0, 0.08); u.armR.rotation.set(ph, 0, -0.08);
    u.legL.rotation.x = u.legR.rotation.x = 0.9;
    u.head.rotation.x = 0;
    const back = L * Math.sin(ph);
    p.grp.position.set(p.x + p.fx * back, p.y - SH + L * Math.cos(ph), p.z + p.fz * back);
  }
  p.grp.rotation.y = p.h;
}
function athlete (s, kind, person) {
  const grp = A.makeHuman(person || makePerson({ seed: (Math.random() * 1e9) | 0, fem: Math.random() < 0.15 }), {});
  A.scene.add(grp);
  const at = kind === 'bar' ? s.bar : s.dip, h = kind === 'bar' ? s.h : s.hd;
  const p = { grp, kind, x: at.x, y: at.y, z: at.z, h, fx: Math.sin(h), fz: Math.cos(h),
    t: rand(0, 3), rep: 0, reps: 5 + ((Math.random() * 8) | 0), per: rand(1.4, 1.9), rest: rand(3, 6) };
  pose(p, 0);
  ST.people++;
  return p;
}
function start (s) {
  s.people = [athlete(s, Math.random() < 0.6 ? 'bar' : 'dip')];
  if (Math.random() < 0.55) s.people.push(athlete(s, s.people[0].kind === 'bar' ? 'dip' : 'bar'));
  ST.active++;
}
function stop (s) {
  for (const p of s.people || []) { A.dropMesh(p.grp); ST.people--; }
  s.people = null;
  ST.active--;
}

/* ── сам: курьер делает подход ── */
const ME = { site: null, p: null, wait: 0, shift: -1, bubble: null, done: null };
function meStart (s) {
  const busy = s.people && s.people.find(p => p.kind === 'bar');
  if (busy) { A.dropMesh(busy.grp); s.people.splice(s.people.indexOf(busy), 1); ST.people--; }   // уступил турник
  const p = athlete(s, 'bar', A.courier ? A.courier() : null);
  p.t = 0; p.rep = 0; p.reps = 5 + ((Math.random() * 8) | 0); p.per = 1.5; p.rest = 1.2;
  p.onRep = n => { bubble(p, String(n)); if (A.Snd && A.Snd.blip) A.Snd.blip(520 + n * 30, 0.06, 'triangle', 0.05); };
  p.onSet = () => { meDone(true); return true; };
  ME.site = s; ME.p = p; ST.me++;
}
function bubble (p, txt) {
  if (ME.bubble) { p.grp.remove(ME.bubble); ME.bubble.material.dispose(); }
  ME.bubble = A.sayBubble(p.grp, txt, '#ff6a13', 2.5);
}
function meDone (full) {
  const p = ME.p;
  if (!p) return;
  if (ME.bubble) { p.grp.remove(ME.bubble); ME.bubble.material.dispose(); ME.bubble = null; }
  A.dropMesh(p.grp); ST.people--;
  ME.done = ME.site; ME.p = null; ME.site = null; ME.wait = 0;   // у этой площадки — снова, только когда отъедешь
  if (!full) return;
  const sh = A.shiftN ? A.shiftN() : 0, S = A.S;
  if (ME.shift !== sh && S.hp < S.hpMax) {
    ME.shift = sh; ST.heal++;
    A.heal(WO.ME_HEAL);
    A.toast(t('Подтянулся {n} раз. Размялся: +½ сердца', { n: p.reps }));
  } else A.toast(t('Подтянулся {n} раз. Пицца подождёт', { n: p.reps }));
}

export function init (api) {
  A = api;
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.WORK = DEBUG; }, 0);
}

let scanT = 0;
export function step (dt) {
  if (!A || !SITES.length) return;
  const V = A.V, ENV = A.ENV;
  if ((scanT -= dt) <= 0) {
    scanT = 1;
    const day = ENV.night < 0.45 && ENV.rain < 0.5;
    for (const s of SITES) {
      const d = Math.hypot(s.x - V.x, s.z - V.z);
      if (s.people && (d > WO.DROP || !day) && ME.site !== s) stop(s);
    }
    if (day) {
      const near = SITES.filter(s => !s.people && Math.hypot(s.x - V.x, s.z - V.z) < WO.NEAR)
        .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z));
      if (near.length && ST.active < WO.ACTIVE) start(near[0]);
    }
  }
  for (const s of SITES) if (s.people) for (const p of s.people) pose(p, dt);
  // сам: стоишь у площадки — курьер подтягивается
  const sp = Math.hypot(V.vx, V.vz), S = A.S;
  const free = !(A.cutOn && A.cutOn()) && ['drive', 'back'].includes(S.state);
  if (ME.p) {
    pose(ME.p, dt);
    if (sp > 1 || !free) meDone(false);
    return;
  }
  if (ME.done && Math.hypot(ME.done.x - V.x, ME.done.z - V.z) > WO.ME_R + 6) ME.done = null;
  if (!free || sp > 0.55) { ME.wait = 0; return; }
  let s0 = null;
  for (const s of SITES) if (Math.abs(s.x - V.x) < WO.ME_R + 3 && Math.abs(s.z - V.z) < WO.ME_R + 3 && Math.hypot(s.bar.x - V.x, s.bar.z - V.z) < WO.ME_R) { s0 = s; break; }
  if (!s0 || s0 === ME.done) { ME.wait = 0; return; }
  if ((ME.wait += dt) >= WO.ME_WAIT) { ME.wait = 0; meStart(s0); }
}

const DEBUG = { WO, ST, SITES, ME, start, stop, meStart: i => meStart(SITES[i || 0]) };
