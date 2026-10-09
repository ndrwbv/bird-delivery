/* ──────────────────────────────────────────────────────────────────────────
   Лёд (Л4, 09.10.2026): зимой Томь и пруды замерзают, на лёд можно выехать —
   но лёд тонкий. Правила словами и цифрами — docs/CAREER.md «Вода как вода» →
   «Зимой: лёд».

   Когда замёрзло: лёд воды (water.js ice(), растёт со снегом) не меньше
   CFG.FROZEN — тогда по Томи едешь, как по земле (пол на уровне воды, ноль),
   речки и пруды подо льдом (streams.js at() — null: не вброд, не тонешь сразу).

   Треск (drive): под машиной вода глубже CFG.SAFE — копится «треск» 0…1:
   в секунду BASE + PER_M × (глубина − SAFE), не больше MAX; стоишь (медленнее
   STAND_V) — ×STAND. На мелком (у берега) и на земле треск спадает (HEAL/с).
   Пороги STAGES — лёд трещит: звук `ice-crack`, под машиной разбегаются трещины
   (декаль-звезда, растёт по TRAV м/с), трясёт; с SAG — машина проседает и
   качается. Треск 1 — лёд проломился: полынья (тёмная вода, льдины по краю),
   машина кренится на бок и за ~2 с уходит под воду (game.js drown: V.sink),
   дальше — как авария (game.js gameOver «утонул», в карьере — «воскреснуть?»,
   заказ сорван, новая машина спускается на берег — shore()).

   Речки подо льдом мелкие (streams.js WADE 0,45 м < SAFE) — не проваливаешься
   никогда; пруды — у берега мелко (0,12 м на метр от берега), дальше SAFE —
   так же, как Томь. В Томь в Солнечном можно попасть только у пляжа
   (beach.js — «карман» в заборе), там глубина подо льдом до ~1,5 м.

   Вид льда — в шейдере воды (water.js, под uWIce): снег с голубыми
   проплешинами, у берега торосы; у пляжа ещё глыбы-торосы геометрией (build).
   Следы шин на снегу льда — tracks.js (iceY).

   Из game.js: init(api) — после STREAMS.build; floor() — пол Томи для езды;
   drive(dt, sp) — в driveStep; pose(car, dt) — после поворота машины;
   step(dt) — каждый кадр (CL.step); broke() / shore() / reset() — смерть и
   воскрешение.
   ────────────────────────────────────────────────────────────────────────── */
import { t } from '../i18n/index.js';

export const CFG = {
  FROZEN: 0.6,          // лёд воды (water.js ice()) — с этого по воде едешь, как по льду (как в streams.js)
  SAFE: 0.5,            // м глубины под льдом: мельче — лёд держит сколько угодно
  BASE: 0.10,           // треск в секунду сразу за SAFE
  PER_M: 0.22,          // + столько за каждый метр глубины сверх SAFE
  MAX: 0.6,             // не быстрее (самая глубина — ≈ 1,7 с)
  STAND: 1.6,           // стоишь — трескается быстрее (вся тяжесть в одном месте)
  STAND_V: 2,           // м/с: медленнее — «стоишь»
  HEAL: 0.2,            // на мелком и на земле треск спадает за секунду
  STAGES: [0.25, 0.5, 0.75],   // пороги треска: звук и трещины под машиной
  SAG: 0.75,            // с этого машина проседает (до SAG_M) и качается
  SAG_M: 0.07,
  TILT: 0.42,           // проломился: крен на бок, рад
  TRAV: 9,              // трещины бегут, м/с
  STAR_R: [2.6, 4.2, 6, 7.5],  // радиус звезды трещин по порогу (последний — пролом)
  STAR_LIFE: 45,        // трещины держатся, с (последние 20 % — тают)
  HOLE_R: 3.4,          // полынья, м (по длинной стороне — ×1,2)
  HOLE_LIFE: 120,
  FAR: 600,             // уехал дальше — трещины и полынью убираем
};

let A = null, THREE = null;
const ST = { load: 0, stage: 0, broke: false, brokeT: 0, side: 1, sag: 0, wob: 0, seen: false, kind: '', d: 0 };
let LAND = null;                       // где последний раз стоял на земле: { x, z, h }
const STARS = [];                      // { mesh, n, q: [дистанции кусков], grow, t, life }
let HOLE = null;                       // { grp, shards, t }
let STAR_MAT = null, HOLE_MAT = null, SHARD_MAT = null, RIDGES = null;
export const STATS = { stars: 0, ridges: 0, breaks: 0, cracks: 0 };

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* api: THREE, scene, V, WATER, STREAMS, BEACH, groundH, Snd, CHAT, Store, ADULT, splash, shake(k), live() */
export function init (api) {
  A = api; THREE = api.THREE;
  STAR_MAT = new THREE.MeshBasicMaterial({ color: 0x1f3446, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  HOLE_MAT = new THREE.MeshBasicMaterial({ color: 0x12293a, transparent: true, opacity: 0.93, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  SHARD_MAT = new THREE.MeshLambertMaterial({ color: 0xdce9f2, flatShading: true });
  try { ST.seen = !!A.Store.get('dlv-ice', 0); } catch (e) { ST.seen = false; }
  ridges();
}

export const frozen = () => !!A && A.WATER.ice() >= CFG.FROZEN;
/* пол Томи для езды: замёрзла — лёд на уровне воды (ноль), нет — не мешает */
export const floor = () => (frozen() ? 0 : -1e9);

/* лёд в точке: { d — глубина воды подо льдом, м; y — верх льда; kind — 'tom' | 'pond' | 'stream' } или null */
export function at (x, z) {
  if (!frozen()) return null;
  const g = A.groundH(x, z);
  if (g < -0.02) return { d: -g, y: 0, kind: 'tom' };
  const w = A.STREAMS.under(x, z);
  return w ? { d: w.kind === 'stream' ? Math.min(w.d, CFG.SAFE * 0.8) : w.d, y: w.y, kind: w.kind } : null;
}
/* верх льда (tracks.js: след шин на снегу льда), null — не лёд */
export function iceY (x, z) { const w = at(x, z); return w ? w.y : null; }

/* ── каждый кадр из driveStep (только пока смена идёт, машина на земле и не тонет): треск.
   sp — скорость, м/с. Вернёт { y } — лёд проломился, уровень воды (game.js drown) ── */
export function drive (dt, sp) {
  if (!A || ST.broke) return null;
  const V = A.V;
  const w = at(V.x, V.z);
  if (!w || V.y > w.y + 1.2) {                     // на земле (или на мосту над льдом)
    ST.load = Math.max(0, ST.load - CFG.HEAL * dt); ST.d = 0; ST.kind = '';
    if (!w && !V.wade && !V.air) LAND = { x: V.x, z: V.z, h: V.h };
    restage();
    return null;
  }
  ST.d = w.d; ST.kind = w.kind;
  if (!ST.seen && w.kind !== 'stream' && sp > 0.5) hint();
  if (w.d < CFG.SAFE) { ST.load = Math.max(0, ST.load - CFG.HEAL * dt); restage(); return null; }
  const rate = Math.min(CFG.MAX, CFG.BASE + CFG.PER_M * (w.d - CFG.SAFE)) * (sp < CFG.STAND_V ? CFG.STAND : 1);
  ST.load += rate * dt;
  while (ST.stage < CFG.STAGES.length && ST.load >= CFG.STAGES[ST.stage]) { ST.stage++; crack(ST.stage, w); }
  if (ST.load < 1) return null;
  ST.load = 1; ST.broke = true; ST.brokeT = 0; ST.side = Math.random() < 0.5 ? -1 : 1;
  STATS.breaks++;
  star(V.x, V.z, w, CFG.STAR_R[3], 1.4);
  hole(V.x, V.z, w);
  sound(1.4);
  A.shake(0.5);
  return { y: w.y };
}
/* треск спал — пороги снова впереди (трещины на льду остаются) */
function restage () { let s = 0; while (s < CFG.STAGES.length && ST.load >= CFG.STAGES[s]) s++; ST.stage = Math.min(ST.stage, s); }

function crack (stage, w) {
  const V = A.V;
  STATS.cracks++;
  // звезда — под машиной, чуть со сдвигом назад: машина едет дальше, а трещины догоняют
  star(V.x - Math.sin(V.h) * 0.6, V.z - Math.cos(V.h) * 0.6, w, CFG.STAR_R[stage - 1], 0.6 + 0.2 * stage);
  sound(0.55 + stage * 0.2);
  A.shake(0.08 + stage * 0.07);
}

function hint () {
  ST.seen = true;
  try { A.Store.set('dlv-ice', 1); } catch (e) { /* — */ }
  if (A.CHAT && A.CHAT.say) A.CHAT.say(A.ADULT ? t('лёд тонкий, блять! пицца утонет первой, а ты — за ней. к берегу!') : t('лёд тонкий! пицца утонет первой — давай к берегу!'));
}

/* звук `ice-crack` (docs/SOUNDS.md): нет файла — синтез: сухие щелчки и звонкое «пиу» льда */
function sound (k) {
  A.Snd.fx('ice-crack', s => {
    const c = s.ctx;
    if (!c) return;
    const now = c.currentTime;
    const n = 3 + Math.round(k * 2);
    for (let i = 0; i < n; i++) {                     // щелчки: короткий шум сверху
      const at = now + i * rand(0.03, 0.09) + (i ? 0.02 : 0), d = rand(0.015, 0.045);
      const len = Math.max(1, Math.round(c.sampleRate * d)), b = c.createBuffer(1, len, c.sampleRate), a = b.getChannelData(0);
      for (let j = 0; j < len; j++) a[j] = (Math.random() * 2 - 1) * (1 - j / len) ** 2;
      const src = c.createBufferSource(); src.buffer = b;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800 + Math.random() * 1500;
      const g = c.createGain(); g.gain.value = 0.32 * k * (i ? 0.6 + Math.random() * 0.4 : 1);
      src.connect(hp); hp.connect(g); g.connect(s.out); src.start(at);
    }
    // «пиу»: звон по льду сверху вниз
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(2600 + Math.random() * 600, now);
    o.frequency.exponentialRampToValueAtTime(260, now + 0.35 + k * 0.1);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.07 * k, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4 + k * 0.1);
    o.connect(g); g.connect(s.out); o.start(now); o.stop(now + 0.6);
    if (k > 1.2) s.noise(0.5, 0.35);                  // пролом: глухой хруст снизу
  });
}

/* ── трещины: звезда из тонких полосок, бегут от середины (drawRange по расстоянию) ── */
function star (x, z, w, R, wd) {
  const Q = [];                                       // [d, ax, az, bx, bz, w]
  const seg = (ax, az, bx, bz, d, ww) => Q.push([d, ax, az, bx, bz, ww]);
  const nb = Math.round(6 + R * 0.9);
  const ends = [];
  const a0 = Math.random() * 6.28;
  for (let b = 0; b < nb; b++) {
    let a = a0 + b / nb * 6.2832 + rand(-0.25, 0.25), px = x, pz = z, d = 0;
    const L = R * rand(0.6, 1), n = 4 + Math.floor(Math.random() * 3), pts = [];
    for (let s = 0; s < n; s++) {
      const l = L / n * rand(0.8, 1.2);
      a += rand(-0.45, 0.45);
      const qx = px + Math.sin(a) * l, qz = pz + Math.cos(a) * l;
      seg(px, pz, qx, qz, d, 0.1 * wd * (1 - s / n * 0.6));
      // ветка в сторону
      if (s >= 1 && s < n - 1 && Math.random() < 0.45) {
        const ba = a + (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1.1), bl = L * rand(0.18, 0.35);
        seg(qx, qz, qx + Math.sin(ba) * bl, qz + Math.cos(ba) * bl, d + l, 0.06 * wd);
      }
      d += l; px = qx; pz = qz;
      pts.push([qx, qz, d]);
    }
    ends.push(pts);
  }
  // паутинка: дуги между соседними лучами
  for (let b = 0; b < nb; b++) {
    const p = ends[b], q = ends[(b + 1) % nb];
    for (const k of [1, 2]) if (p[k] && q[k] && Math.random() < 0.55) seg(p[k][0], p[k][1], q[k][0], q[k][1], Math.max(p[k][2], q[k][2]), 0.05 * wd);
  }
  Q.sort((u, v) => u[0] - v[0]);
  const pos = new Float32Array(Q.length * 18), ds = new Float32Array(Q.length);
  const y0 = w.y + 0.03;
  const yAt = (px, pz) => { const q = at(px, pz); return q ? q.y + 0.03 : y0; };
  Q.forEach((s, i) => {
    const [d, ax, az, bx, bz, ww] = s, l = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / l * ww / 2, nz = (bx - ax) / l * ww / 2;
    const ya = yAt(ax, az), yb = yAt(bx, bz);
    pos.set([ax + nx, ya, az + nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz, ax + nx, ya, az + nz, bx - nx, yb, bz - nz, ax - nx, ya, az - nz], i * 18);
    ds[i] = d;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setDrawRange(0, 0);
  const m = new THREE.Mesh(g, STAR_MAT.clone());
  m.renderOrder = 3; m.frustumCulled = false;
  A.scene.add(m);
  STARS.push({ mesh: m, ds, grow: 0, t: 0, life: CFG.STAR_LIFE, x, z });
  while (STARS.length > 8) dropStar(STARS[0]);
  STATS.stars = STARS.length;
}
function dropStar (s) {
  A.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose();
  STARS.splice(STARS.indexOf(s), 1);
  STATS.stars = STARS.length;
}

/* ── полынья: тёмная вода с рваным краем и льдины по кругу ── */
function hole (x, z, w) {
  clearHole();
  const grp = new THREE.Group();
  const n = 14, R = CFG.HOLE_R, pts = [];
  const hh = A.V.h, ch = Math.cos(hh), shh = Math.sin(hh);
  const W = (lx, lz) => [x + lx * ch + lz * shh, z - lx * shh + lz * ch];   // вдоль машины длиннее
  for (let i = 0; i < n; i++) { const a = i / n * 6.2832, r = R * rand(0.72, 1.12); pts.push(W(Math.sin(a) * r * 0.85, Math.cos(a) * r * 1.2)); }
  const pos = [];
  const y = w.y + 0.035;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; pos.push(x, y, z, q[0], y, q[1], p[0], y, p[1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const disc = new THREE.Mesh(g, HOLE_MAT);
  disc.renderOrder = 3;
  grp.add(disc);
  // льдины: плоские неровные куски по краю, качаются на воде
  const shards = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * 6.2832 + rand(-0.2, 0.2), r = R * rand(0.6, 0.95), s = rand(0.5, 1.1);
    const sp = [];
    for (let k = 0; k < 5; k++) { const b = k / 5 * 6.2832, rr = s * rand(0.55, 1); sp.push([Math.sin(b) * rr, Math.cos(b) * rr]); }
    const sh = new THREE.Shape(sp.map(p => new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, SHARD_MAT);
    const [px, pz] = W(Math.sin(a) * r * 0.85, Math.cos(a) * r * 1.2);
    m.position.set(px, y + 0.04, pz);
    const tx = rand(-0.5, 0.5), tz = rand(-0.5, 0.5);
    m.rotation.set(tx, rand(0, 6.28), tz);
    m.userData = { tx, tz, ph: Math.random() * 6.28, y: y + 0.04 };
    grp.add(m); shards.push(m);
  }
  A.scene.add(grp);
  HOLE = { grp, shards, t: 0, x, z };
  if (A.splash) { A.splash(x, z); A.splash(x + 1.5, z - 1); A.splash(x - 1.2, z + 1.3); }
}
function clearHole () {
  if (!HOLE) return;
  A.scene.remove(HOLE.grp);
  HOLE.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  HOLE = null;
}

/* ── торосы у пляжа: глыбы льда вдоль уреза (одна сетка, видна, только когда замёрзло) ── */
function ridges () {
  const B = A.BEACH, site = B && B.DEBUG && B.DEBUG.site;
  if (!site) return;
  const S = B.SHAPE || B.DEBUG.SHAPE, out = S.TOP / S.SLOPE;
  const geos = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const tmp = new THREE.Object3D();
  const cols = [new THREE.Color('#e3eef6'), new THREE.Color('#c6dbea'), new THREE.Color('#a9c7dc'), new THREE.Color('#f2f6fa')];
  for (let a = -S.HALF + 2; a < S.HALF - 2; a += rand(1.6, 3.2)) {
    if (Math.random() < 0.18) continue;                 // разрывы в гряде
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const b = -out - rand(1, 6), [x, z] = B.DEBUG.at(a + rand(-0.8, 0.8), b);
      if (A.groundH(x, z) > -0.05) continue;
      const w = rand(0.7, 1.6), h = rand(0.3, 0.9), d = rand(0.15, 0.35);
      tmp.position.set(x, h * 0.25, z);
      tmp.rotation.set(rand(-0.9, 0.9), rand(0, 6.28), rand(-0.6, 0.6));
      tmp.scale.set(w, h, d);
      tmp.updateMatrix();
      const g = box.clone().applyMatrix4(tmp.matrix).toNonIndexed();
      const c = cols[Math.floor(Math.random() * cols.length)], n3 = g.attributes.position.count, ca = new Float32Array(n3 * 3);
      for (let i = 0; i < n3; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      g.deleteAttribute('uv');
      geos.push(g);
    }
  }
  if (!geos.length) return;
  // склейка руками: одинаковые атрибуты (position, normal, color)
  let total = 0; for (const g of geos) total += g.attributes.position.count;
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const G = new THREE.BufferGeometry();
  G.setAttribute('position', new THREE.BufferAttribute(P, 3));
  G.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  G.setAttribute('color', new THREE.BufferAttribute(C, 3));
  G.computeBoundingSphere();
  RIDGES = new THREE.Mesh(G, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  RIDGES.name = 'ice-ridges';
  RIDGES.visible = false;
  A.scene.add(RIDGES);
  STATS.ridges = geos.length;
}

/* после поворота машины (game.js): проседает и качается на трещащем льду, проломился — на бок */
export function pose (car, dt) {
  if (!A) return;
  if (ST.broke) {
    ST.brokeT += dt;
    car.rotation.z += ST.side * CFG.TILT * clamp(ST.brokeT / 0.9, 0, 1);
    return;
  }
  const k = clamp((ST.load - CFG.SAG) / (1 - CFG.SAG), 0, 1);
  ST.sag += (k - ST.sag) * Math.min(1, dt * 6);
  if (ST.sag < 0.002) return;
  ST.wob += dt * (7 + ST.sag * 6);
  car.position.y -= CFG.SAG_M * ST.sag;
  car.rotation.z += Math.sin(ST.wob) * 0.035 * ST.sag;
  car.rotation.x += Math.sin(ST.wob * 0.7 + 1) * 0.02 * ST.sag;
}

/* каждый кадр: трещины бегут и тают, льдины качаются, торосы — по льду */
export function step (dt) {
  if (!A) return;
  if (RIDGES) RIDGES.visible = frozen();
  const V = A.V;
  for (let i = STARS.length - 1; i >= 0; i--) {
    const s = STARS[i];
    s.t += dt;
    if (s.t > s.life || Math.hypot(s.x - V.x, s.z - V.z) > CFG.FAR || !frozen()) { dropStar(s); continue; }
    if (s.grow < 1e3) {
      s.grow += CFG.TRAV * dt;
      let n = 0; while (n < s.ds.length && s.ds[n] <= s.grow) n++;
      s.mesh.geometry.setDrawRange(0, n * 6);
      if (n >= s.ds.length) s.grow = 1e3;
    }
    const f = clamp((s.life - s.t) / (s.life * 0.2), 0, 1);
    s.mesh.material.opacity = 0.85 * f;
  }
  if (HOLE) {
    HOLE.t += dt;
    if (HOLE.t > CFG.HOLE_LIFE || Math.hypot(HOLE.x - V.x, HOLE.z - V.z) > CFG.FAR || !frozen()) clearHole();
    else for (const m of HOLE.shards) {
      const u = m.userData, w = HOLE.t * 2.2 + u.ph;
      m.position.y = u.y + Math.sin(w) * 0.04;
      m.rotation.x = u.tx + Math.sin(w) * 0.06; m.rotation.z = u.tz + Math.cos(w * 0.8) * 0.06;
    }
  }
}

/* лёд проломился в этот раз (game.js gameOver: «воскреснуть?», заказ сорван) */
export const broke = () => ST.broke;
/* куда спустить новую машину: последнее место на земле, носом от воды */
export const shore = () => (LAND ? { x: LAND.x, z: LAND.z, h: LAND.h + Math.PI } : null);
/* новая машина / новая смена: треск с нуля (трещины и полынья остаются на льду) */
export function reset () { ST.load = 0; ST.stage = 0; ST.broke = false; ST.brokeT = 0; ST.sag = 0; }

export const DEBUG = {
  CFG, STATS, ST, at, frozen, iceY, reset, star: (x, z, r) => { const w = at(x, z) || { y: 0 }; star(x, z, w, r || 5, 1); }, hole: (x, z) => hole(x, z, at(x, z) || { y: 0 }),
  get land () { return LAND; }, get ridges () { return RIDGES; },
  /* сколько секунд до пролома на глубине d, м (едешь / стоишь) */
  secs: d => { const r = Math.min(CFG.MAX, CFG.BASE + CFG.PER_M * (d - CFG.SAFE)); return d < CFG.SAFE ? Infinity : { drive: +(1 / r).toFixed(1), stand: +(1 / r / CFG.STAND).toFixed(1) }; },
};
