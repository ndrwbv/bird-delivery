/* Кальянщики на лавочках. По городу на части лавочек сидят компании по 1—3
   человека, перед ними на земле кальян; раз в несколько секунд кто-то затягивается
   и выдувает большое облако дыма (иногда — три кольца). Детская версия (ADULT =
   false): вместо кальяна самовар, вместо дыма — пар, сидят пьют чай.

   Людей много не держим: компания «живёт» (люди и кальян в сцене), только пока
   машина ближе SPAWN_R, дальше DROP_R — убираем. Сбил — как курилку: ошмётки,
   «минус кальянщик», через полминуты компания на месте снова (когда отъедешь).

   Ещё кальян умеет стоять у гостя заказа (учебный клиент Степан Тугарев):
   HK.guest(p, bench) — кальян перед лавочкой, облака от гостя, пока он ждёт.

     HK.init(api)  — один раз после лавочек (BENCHES) и людей
     HK.step(dt)   — каждый кадр
     HK.guest(p, b) — кальян гостю на лавочке
   api: THREE, scene, BENCHES, V, S, ADULT, makeHuman, makePerson, dropMesh, gibHuman, groundH, curbAt,
        fxAdd, puffGeo, steam, toast, Snd, CAR_L, CAR_W, nearestRoad, t */

const SPAWN_R = 230, DROP_R = 320;
const SHARE = 0.09, MIN_GAP = 110, MAX_SPOTS = 60;   // доля лавочек с кальянщиками, не ближе друг к другу, всего не больше

let A = null, THREE = null;
const SPOTS = [], GUESTS = [];
let checkT = 0;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const hash = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

export function init (api) {
  A = api; THREE = api.THREE;
  const list = A.BENCHES.filter(b => hash(b.x, b.z, 7) < SHARE * 2.2)
    .sort((a, b) => hash(a.x, a.z, 3) - hash(b.x, b.z, 3));
  for (const b of list) {
    if (SPOTS.length >= MAX_SPOTS) break;
    if (SPOTS.some(s => Math.hypot(s.b.x - b.x, s.b.z - b.z) < MIN_GAP)) continue;
    // компания: 1 (30 %), 2 (45 %) или 3 (25 %) — третий стоит рядом
    const h = hash(b.x, b.z, 11), n = h < 0.3 ? 1 : h < 0.75 ? 2 : 3;
    SPOTS.push({ b, n, live: false, people: [], prop: null, puffT: rand(1, 4), deadT: 0 });
  }
  if (typeof window !== 'undefined' && window.__dlv) window.__dlv.HOOKAH = DEBUG;
  else setTimeout(() => { if (window.__dlv) window.__dlv.HOOKAH = DEBUG; }, 0);
}

/* ── кальян / самовар ── */
const MAT = {};
const mat = (hex, op) => MAT[hex + (op || '')] || (MAT[hex + (op || '')] = new THREE.MeshLambertMaterial({ color: hex, transparent: !!op, opacity: op || 1 }));
function hookahMesh () {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); g.add(o); return o; };
  if (A.ADULT) {
    const glass = pick(['#3fa8c9', '#6fd0a0', '#c95a8a', '#e0b13f']);
    add(new THREE.SphereGeometry(0.2, 10, 8), mat(glass, 0.8), 0, 0.2, 0);                               // колба
    add(new THREE.CylinderGeometry(0.035, 0.05, 0.55, 8), mat('#c9a24d'), 0, 0.62, 0);                  // шахта
    add(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12), mat('#c9a24d'), 0, 0.82, 0);                  // блюдце
    add(new THREE.CylinderGeometry(0.07, 0.045, 0.1, 8), mat('#a0522d'), 0, 0.89, 0);                   // чаша
    add(new THREE.BoxGeometry(0.06, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: 0xff6a1c }), 0, 0.955, 0);   // угли
    // шланг дугой к сидящему
    for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), mat('#2b2a30'), 0, 0.55 - k * 0.04 + k * k * 0.03, -0.12 - k * 0.18, 1.1 - k * 0.25);
  } else {
    // самовар: медное пузо, ножки, кран, трубка и чайник сверху
    add(new THREE.CylinderGeometry(0.2, 0.16, 0.36, 12), mat('#c9873a'), 0, 0.3, 0);
    add(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 10), mat('#a8692a'), 0, 0.07, 0);
    add(new THREE.BoxGeometry(0.1, 0.03, 0.03), mat('#a8692a'), 0, 0.22, -0.22);
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8), mat('#5a4a3a'), 0, 0.56, 0);
    add(new THREE.SphereGeometry(0.11, 10, 8), mat('#f4f1ea'), 0, 0.68, 0);
  }
  return g;
}
const frontOf = (b, d) => ({ x: b.x + Math.sin(b.ry) * d, z: b.z + Math.cos(b.ry) * d });
function placeProp (b) {
  const m = hookahMesh(), f = frontOf(b, 1.05);
  m.position.set(f.x, A.groundH(f.x, f.z) + A.curbAt(f.x, f.z), f.z);
  m.rotation.y = b.ry;
  A.scene.add(m);
  return m;
}
function dropProp (m) {
  if (!m) return;
  A.scene.remove(m);
  m.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}

/* ── компания на лавочке ── */
const SEAT = [[-0.5, 0], [0.5, 0], [0.95, 0.9]];       // вдоль лавочки, вперёд: двое сидят, третий стоит сбоку
function spawn (s) {
  const b = s.b, ax = Math.cos(b.ry), az = -Math.sin(b.ry), fx = Math.sin(b.ry), fz = Math.cos(b.ry);
  s.people = [];
  for (let i = 0; i < s.n; i++) {
    const [u, f] = s.n === 1 && i === 0 ? [0, 0] : SEAT[i];
    const x = b.x + ax * u + fx * f, z = b.z + az * u + fz * f;
    const person = A.makePerson({ seed: ((hash(b.x, b.z, 20 + i) * 4294967295) >>> 0) + s.gen });
    const grp = A.makeHuman(person);
    const sit = i < 2;
    const p = { person, grp, x, z, sit, ph: rand(0, 6), drag: 0, dead: 0 };
    grp.position.set(x, A.groundH(x, z) + A.curbAt(x, z) + (sit ? 0.42 : 0), z);
    // сидящие — лицом вперёд, как лавочка; стоящий — к кальяну
    const h = frontOf(b, 1.05);
    grp.rotation.y = sit ? b.ry : Math.atan2(h.x - x, h.z - z);
    if (sit) { grp.userData.legL.rotation.x = -1.45; grp.userData.legR.rotation.x = -1.45; }
    A.scene.add(grp);
    s.people.push(p);
  }
  s.prop = placeProp(b);
  s.live = true;
}
function despawn (s) {
  for (const p of s.people) A.dropMesh(p.grp);
  s.people = [];
  dropProp(s.prop); s.prop = null;
  s.live = false;
}

/* затяжка: рука к лицу, потом большое облако (или три кольца) вперёд и вверх */
function exhale (x, y, z, ry, big = 1) {
  const fx = Math.sin(ry), fz = Math.cos(ry);
  if (!A.ADULT) { for (let k = 0; k < 3; k++) setTimeout(() => A.steam(x, 1.0, z), k * 140); return; }
  const gy = A.groundH(x, z);
  if (Math.random() < 0.25) {
    // кольца: три бублика друг за другом
    for (let k = 0; k < 3; k++) setTimeout(() => {
      const m = new THREE.Mesh(RING_GEO || (RING_GEO = new THREE.TorusGeometry(0.22, 0.07, 6, 14)),
        new THREE.MeshBasicMaterial({ color: 0xeeece8, transparent: true, opacity: 0.7, depthWrite: false }));
      m.position.set(x + fx * 0.4, gy + y, z + fz * 0.4);
      m.rotation.y = ry;
      A.fxAdd(m, { vx: fx * 1.3, vz: fz * 1.3, vy: 0.35, life: 3, max: 3, grow: 0.3 });
    }, k * 380);
    return;
  }
  const n = Math.round(6 * big);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(A.puffGeo, new THREE.MeshBasicMaterial({ color: k % 3 ? 0xe9e7e2 : 0xf6f4f0, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.set(x + fx * (0.35 + k * 0.08), gy + y + rand(-0.05, 0.1), z + fz * (0.35 + k * 0.08));
    m.scale.setScalar(rand(0.35, 0.6) * big);
    A.fxAdd(m, { vx: fx * rand(0.6, 1.2) + rand(-0.3, 0.3), vz: fz * rand(0.6, 1.2) + rand(-0.3, 0.3), vy: rand(0.35, 0.8), life: rand(3, 4.5), max: 4.5, grow: 0.5 });     // к концу — облако метров семь, уже прозрачное
  }
}
let RING_GEO = null;

function hitCheck (s) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz);
  if (sp < 3) return;
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (const p of s.people) {
    if (p.dead) continue;
    const dx = p.x - V.x, dz = p.z - V.z;
    if (Math.abs(dx * fx + dz * fz) < A.CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < A.CAR_W + 0.4) {
      p.dead = 1;
      p.grp.visible = false;
      A.gibHuman(p, V.vx, V.vz);
      A.S.people++;
      s.deadT = 30;                                     // компания вернётся, когда отъедешь и полминуты пройдёт
    }
  }
  if (s.prop && Math.hypot(s.prop.position.x - V.x, s.prop.position.z - V.z) < A.CAR_W + 0.6) {
    // кальян под колёса — опрокинулся и дымит
    s.prop.rotation.z = 1.4; s.prop.position.y -= 0.15;
    exhale(s.prop.position.x, 0.4, s.prop.position.z, V.h, 1.4);
  }
}

/* на лавочке сейчас кальянщики — другим не садиться (клиент с пиццей, game.js afterStart) */
export const busy = b => SPOTS.some(s => s.live && s.b === b);
export function step (dt) {
  if (!A) return;
  const V = A.V;
  if ((checkT -= dt) <= 0) {
    checkT = 0.5;
    for (const s of SPOTS) {
      const d = Math.hypot(s.b.x - V.x, s.b.z - V.z);
      s.deadT = Math.max(0, s.deadT - 0.5);
      if (!s.live && d < SPAWN_R && !s.deadT && !(s.b.prop && s.b.prop.down) && !s.b.taken) { s.gen = (s.gen || 0) + (s.people.length ? 1 : 0); spawn(s); }
      else if (s.live && (d > DROP_R || (s.b.prop && s.b.prop.down))) despawn(s);
    }
  }
  for (const s of SPOTS) {
    if (!s.live) continue;
    for (const p of s.people) {
      if (p.dead) continue;
      p.ph += dt;
      const u = p.grp.userData;
      // затяжка: рука со шлангом к лицу, плавно
      p.drag = Math.max(0, p.drag - dt);
      const k = p.drag > 0 ? Math.sin(Math.min(1, (1.6 - p.drag) / 0.6) * Math.PI / 2) : 0;
      u.armR.rotation.x = -0.4 - k * 1.8;
      u.armL.rotation.x = p.sit ? -0.3 : -0.1;
      u.head.rotation.y = Math.sin(p.ph * 0.5) * 0.4;
    }
    if ((s.puffT -= dt) <= 0) {
      const alive = s.people.filter(p => !p.dead);
      s.puffT = rand(2.2, 5);
      if (alive.length) {
        const p = pick(alive);
        p.drag = 1.6;
        setTimeout(() => { if (s.live && !p.dead) exhale(p.x, p.sit ? 1.25 : 1.6, p.z, p.grp.rotation.y, p.sit ? 1 : 0.8); }, 900);
      }
    }
    hitCheck(s);
  }
  // гость с кальяном (учебный Степан): облака, пока ждёт; ушёл — кальян убираем, когда отъедешь
  for (let i = GUESTS.length - 1; i >= 0; i--) {
    const g = GUESTS[i], p = g.p;
    const waiting = p.guest && !p.dead && !p.served;
    if (waiting && (g.t -= dt) <= 0) {
      g.t = rand(2.4, 3.6);
      exhale(p.x, p.sitting ? 1.25 : 1.6, p.z, p.grp.rotation.y, 1.5);   // крупнее обычного: по облакам его и ищут
    }
    if (!waiting && Math.hypot(g.prop.position.x - V.x, g.prop.position.z - V.z) > 150) { dropProp(g.prop); GUESTS.splice(i, 1); }
  }
}

/* кальян гостю: перед лавочкой b, облака от гостя p, пока он ждёт заказ */
export function guest (p, b) {
  if (!A || !p || !b) return;
  GUESTS.push({ p, b, prop: placeProp(b), t: 0.5 });
}

const DEBUG = {
  get SPOTS () { return SPOTS; }, get GUESTS () { return GUESTS; },
  nearest () { const V = A.V; return SPOTS.slice().sort((a, b) => Math.hypot(a.b.x - V.x, a.b.z - V.z) - Math.hypot(b.b.x - V.x, b.b.z - V.z))[0]; },
};
