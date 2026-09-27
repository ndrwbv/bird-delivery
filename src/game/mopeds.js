/* ──────────────────────────────────────────────────────────────────────────
   Курьеры еды на мопедах: жёлтая «Жуй-Еда» (больше всех), розовый
   «Самокатик», зелёный «Клуб Доставки». Бренды выдуманные.

   • Модель — два меша: мопед (кузов, щиток, руль, колёса одной склейкой)
     и седок с кубическим термокоробом цвета службы и полосой логотипа.
     Колёса не крутятся: на таком размере не видно, а меш лишний.
   • Едут в общем трафике (TRAFFIC): по полосам, на красный стоят, их мнёт и
     подбрасывает, как машины. Держатся правого края полосы, в городе
     быстрее машин, в пробке иногда просачиваются между рядами (ghost +
     сдвиг на межполосье). Ударили — седок слетает: сильно — как сбитый
     пешеход (кровь только во взрослой версии, это решает gibHuman), слабо —
     падает, встаёт, садится и едет дальше.
   • Часть стоит у кафе, магазинов и подъездов: мопед на тротуаре, курьер
     рядом с короба за спиной смотрит в телефон.
   • Рядом с курьером-игроком всегда около десяти на ходу и до четырёх
     стоящих; уехали далеко — переставляем поближе, как весь трафик.

   Всё из игры — через api (roadApi в game.js), шаг и полоса — из roadlife.js.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* службы: цвет короба и шлема, цвет полосы, доля */
const BRAND_NAMES = /*i18n*/ ['Жуй-Еда', 'Самокатик', 'Клуб Доставки'];
const BRANDS = [
  { i: 0, hex: '#ffd21f', stripe: '#1b1a1f', w: 0.6 },
  { i: 1, hex: '#ff4f9a', stripe: '#ffffff', w: 0.2 },
  { i: 2, hex: '#2fb35a', stripe: '#ffffff', w: 0.2 },
];
const brandName = b => t(BRAND_NAMES[b.i]);
const pickBrand = () => { let r = Math.random(); for (const b of BRANDS) if ((r -= b.w) <= 0) return b; return BRANDS[0]; };
const BODY_HEX = ['#e8e4dc', '#3c4048', '#c8323a', '#7f8a96'];

export const MP = { moving: 10, parked: 4, n: { spawned: 0, falls: 0, flown: 0, weaves: 0 }, spots: null, park: [], men: [], T: 0 };
const HL = 0.85;

/* ── модели: склейки по вершинам, по одной на цвет, копия на каждый мопед ── */
const GEO = new Map();
function mopedGeo (A, hex) {
  const k = 'm' + hex;
  if (GEO.has(k)) return GEO.get(k);
  const { box, put, mergeGeos } = A, L = [];
  box(L, 0.34, 0.16, 1.0, '#2b2a30', 0, 0.34, -0.02);                 // рама-подножка
  box(L, 0.4, 0.62, 0.1, hex, 0, 0.64, 0.42);                          // щиток спереди
  box(L, 0.36, 0.3, 0.62, hex, 0, 0.56, -0.3);                         // задний кожух
  box(L, 0.3, 0.1, 0.56, '#1b1a1f', 0, 0.76, -0.24);                   // седло
  box(L, 0.07, 0.5, 0.07, '#585460', 0, 0.98, 0.46);                   // рулевая колонка
  box(L, 0.62, 0.05, 0.06, '#1b1a1f', 0, 1.22, 0.44);                  // руль
  box(L, 0.16, 0.12, 0.08, '#fff3c4', 0, 1.1, 0.52);                   // фара
  box(L, 0.14, 0.08, 0.05, '#e8323c', 0, 0.68, -0.62);                 // стоп
  box(L, 0.32, 0.05, 0.32, '#2b2a30', 0, 0.74, -0.66);                 // багажник
  for (const z of [0.52, -0.55]) put(L, new THREE.CylinderGeometry(0.24, 0.24, 0.12, 8), '#221c19', 0, 0.24, z, 0, 0, Math.PI / 2);
  const g = mergeGeos(L);
  GEO.set(k, g);
  return g;
}
/* седок: сидит, руки на руле, шлем и короб — цвета службы, по коробу полоса и «логотип» */
function riderGeo (A, br, look) {
  const k = 'r' + br.i + look;
  if (GEO.has(k)) return GEO.get(k);
  const { box, mergeGeos } = A, L = [];
  const pants = look ? '#2f3540' : '#3a3f4a', skin = ['#f1c7a5', '#d9a57e', '#a8744f'][look % 3];
  for (const s of [-1, 1]) {
    box(L, 0.15, 0.14, 0.5, pants, 0.13 * s, 0.84, 0.0);              // бёдра вперёд
    box(L, 0.14, 0.46, 0.14, pants, 0.14 * s, 0.6, 0.24);              // голени на подножку
    box(L, 0.12, 0.12, 0.5, br.hex, 0.24 * s, 1.26, 0.2);              // руки к рулю
  }
  box(L, 0.44, 0.56, 0.28, br.hex, 0, 1.2, -0.16);                     // куртка службы
  box(L, 0.3, 0.3, 0.28, skin, 0, 1.62, -0.12);                        // лицо
  box(L, 0.36, 0.26, 0.36, br.hex, 0, 1.8, -0.13);                     // шлем
  box(L, 0.3, 0.1, 0.04, '#1b1a1f', 0, 1.66, 0.04);                    // визор
  box(L, 0.58, 0.56, 0.44, br.hex, 0, 1.36, -0.52);                    // термокороб
  box(L, 0.59, 0.09, 0.45, br.stripe, 0, 1.4, -0.52);                  // полоса логотипа
  box(L, 0.24, 0.16, 0.02, br.stripe, 0, 1.2, -0.75);                  // логотип на спине
  box(L, 0.08, 0.3, 0.06, '#1b1a1f', 0.2, 1.22, -0.28);                // лямки
  box(L, 0.08, 0.3, 0.06, '#1b1a1f', -0.2, 1.22, -0.28);
  const g = mergeGeos(L);
  GEO.set(k, g);
  return g;
}
const vcMat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function makeMopedMesh (A, br) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const body = BODY_HEX[(Math.random() * BODY_HEX.length) | 0];
  g.add(new THREE.Mesh(mopedGeo(A, Math.random() < 0.45 ? br.hex : body).clone(), vcMat()));      // своя копия: svcGone/respawn её выбросят
  const rider = new THREE.Mesh(riderGeo(A, br, (Math.random() * 3) | 0).clone(), vcMat());
  g.add(rider);
  g.userData = { wheels: [], steer: [], panels: [], glass: [], hazard: [], dmg: 0, hl: HL, model: 'moped', bodyHex: br.hex, rider };
  return g;
}

/* новый мопед: поля трафика берём у newCar и меняем кузов */
function newMoped (A, parked) {
  const c = A.newCar(true);
  c.mesh.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  const br = pickBrand();
  c.mesh = makeMopedMesh(A, br);
  Object.assign(c, { model: 'moped', hl: HL, taxi: false, parked: !!parked, cruise: rand(12.5, 16.5), dot: br.hex, hp: 70,
    mp: { br, fell: 0, weave: 0, slowT: 0, man: null } });
  A.scene.add(c.mesh);
  A.TRAFFIC.push(c);
  MP.n.spawned++;
  return c;
}

/* ── полоса: у правого края; в пробке — между рядами ──
   Зовётся из RL.hold для каждого мопеда на ходу, до расчёта скорости. */
export function lane (c, dt, A) {
  const m = c.mp;
  if (!m || !c.e || c.turn) return 1;
  if (m.fell) return 0;                               // седока нет — стоит
  const e = c.e, n = A.laneCount(e), lw = (e.oneway ? e.w : e.w / 2) / n;
  // стоит за машиной — через секунду-две просачивается между рядами
  if (m.weave > 0) m.weave -= dt;
  else if (c.speed < 2.2) {
    if ((m.slowT += dt) > 1.3) {
      m.slowT = 0;
      if (Math.random() < 0.55 && carAhead(c, A)) { m.weave = rand(2.5, 4); MP.n.weaves++; }
    }
  } else m.slowT = 0;
  if (m.weave > 0) c.ghost = Math.max(c.ghost, 0.3);    // соседей по потоку не ждёт (людей и курьера — ждёт)
  const want = m.weave > 0 ? -lw / 2 + 0.15 : Math.max(0, lw / 2 - 0.65);
  c.pull += (want - c.pull) * (1 - Math.exp(-(m.weave > 0 ? 4 : 2) * dt));
  return 1;
}
function carAhead (c, A) {
  const hx = Math.sin(c.h), hz = Math.cos(c.h);
  for (const o of A.TRAFFIC) {
    if (o === c || o.model === 'moped' || Math.abs(o.x - c.x) > 12 || Math.abs(o.z - c.z) > 12) continue;
    const dx = o.x - c.x, dz = o.z - c.z, fw = dx * hx + dz * hz;
    if (fw > 0 && fw < 11 && Math.abs(-hz * dx + hx * dz) < 2.2) return true;
  }
  return false;
}

/* точка внутри препятствия (дом, веранда, будка): те же повёрнутые коробки, что у физики */
function inSolid (A, x, z, r) {
  for (const s of A.SOLID_GRID.get(Math.floor(x / A.SCELL) + ',' + Math.floor(z / A.SCELL)) || []) {
    if (s.deckY !== undefined) continue;
    const dx = x - s.cx, dz = z - s.cz, lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
    if (Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r) return true;
  }
  return false;
}

/* ── места стоянки: у дверей заведений и у подъездов, на тротуаре ── */
function spots (A) {
  if (MP.spots) return MP.spots;
  const out = [];
  const add = (x, z, nx, nz) => {
    const px = x + nx * 2.4, pz = z + nz * 2.4, tx = nz, tz = -nx;
    if (!A.inBounds(px, pz, 20) || A.inHouse(px, pz, 0.8) || A.groundH(px, pz) < 0.3) return;
    const r = A.nearestRoad(px, pz, 7, 1), st = A.nearestRoad(px, pz, 5, 1);
    if (!r || r.d < r.seg.w / 2 + 0.8 || !st || st.d > 24) return;       // у улицы, но не на полотне
    for (const q of [[0, 0], [tx, tz], [-tx, -tz]]) if (inSolid(A, px + q[0] * 1.2, pz + q[1] * 1.2, 0.6)) return;   // не в веранде, будке, заборе
    if (A.PARKED.some(q => Math.abs(q[0] - px) < 4 && Math.abs(q[1] - pz) < 4)) return;
    out.push([px, pz, nx, nz]);
  };
  for (const p of A.CITY.pois || []) if (p.w && /food|cafe|grocery|shop|pickup/.test(p.k)) add(p.w[0], p.w[1], p.w[2], p.w[3]);
  const E = A.CITY.entrances || [];
  for (let i = 0; i < E.length; i += 3) add(E[i][0], E[i][1], E[i][2], E[i][3]);
  return (MP.spots = out);
}

function parkAt (A, sp) {
  const [x, z, nx, nz] = sp, tx = nz, tz = -nx;
  const c = newMoped(A, true);
  c.x = x + tx * 0.8; c.z = z + tz * 0.8; c.h = Math.atan2(tx, tz) + rand(-0.25, 0.25); c.gy = undefined; c.speed = 0;
  A.poseOnSlope(c);
  c.mesh.userData.rider.visible = false;               // седок слез
  // курьер рядом: шлем и короб его службы, в руке телефон
  const br = c.mp.br, grp = A.makeHuman(null, { cap: br.hex, shirt: br.hex, pants: '#2f3540' });
  const bag = new THREE.Mesh(riderBagGeo(A, br), vcMat());
  bag.position.set(0, 0, 0); grp.add(bag);
  const u = grp.userData;
  if (u.armR) { const ph = new THREE.Mesh(PHONE, PHONE_MAT); ph.position.set(0, -0.5, 0.12); u.armR.add(ph); }
  const mx = x - tx * 0.7 + nx * 0.3, mz = z - tz * 0.7 + nz * 0.3;
  grp.position.set(mx, A.groundH(mx, mz) + A.curbAt(mx, mz), mz);
  grp.rotation.y = Math.atan2(nx, nz) + rand(-0.7, 0.7);          // лицом к улице, в телефон
  A.scene.add(grp);
  const man = { grp, x: mx, z: mz, ph: rand(0, 6), c, sp, dead: 0, said: 0 };
  c.mp.man = man;
  MP.park.push(man);
}
const PHONE = new THREE.BoxGeometry(0.1, 0.16, 0.03), PHONE_MAT = new THREE.MeshBasicMaterial({ color: 0x9fd4ff });
function riderBagGeo (A, br) {
  const k = 'b' + br.i;
  if (GEO.has(k)) return GEO.get(k).clone();
  const L = [];
  A.box(L, 0.58, 0.56, 0.44, br.hex, 0, 1.34, -0.4);
  A.box(L, 0.59, 0.09, 0.45, br.stripe, 0, 1.38, -0.4);
  A.box(L, 0.24, 0.16, 0.02, br.stripe, 0, 1.18, -0.63);
  const g = A.mergeGeos(L);
  GEO.set(k, g);
  return g.clone();
}

/* ── слетел с мопеда ── */
const FLY = [];
function fall (A, c) {
  const m = c.mp, u = c.mesh.userData;
  m.fell = 1;
  u.rider.visible = false;
  c.angry = 0;                                          // это не водитель машины — разбираться не выйдет
  const sp = Math.hypot(c.kvx, c.kvz), br = m.br;
  const grp = A.makeHuman(null, { cap: br.hex, shirt: br.hex, pants: '#2f3540' });
  grp.add(new THREE.Mesh(riderBagGeo(A, br), vcMat()));
  const x = c.x, z = c.z;
  if (sp > 16 || c.wreck) {
    // сильный удар — как сбитый пешеход: кровь и куски только во взрослой версии (решает gibHuman)
    A.gibHuman({ x, z, grp }, c.kvx || 0, c.kvz || 0);
    A.dropMesh(grp);
    A.S.people++;
    A.toast(t('курьер «{brand}» улетел с мопеда', { brand: brandName(br) }));
    m.gone = 1;
    MP.n.flown++;
    return;
  }
  grp.position.set(x, A.groundH(x, z) + 0.9, z);
  A.scene.add(grp);
  FLY.push({ grp, c, x, z, y: 0.9, vx: c.kvx * 0.9 + rand(-1, 1), vz: c.kvz * 0.9 + rand(-1, 1), vy: rand(2.5, 4), st: 'air', T: 0, rot: rand(-3, 3) });
  A.toast(t('курьер «{brand}» слетел с мопеда', { brand: brandName(br) }));
  MP.n.falls++;
}

function stepFly (dt, A) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (let i = FLY.length - 1; i >= 0; i--) {
    const f = FLY[i], g = f.grp, u = g.userData, c = f.c;
    const gy = A.groundH(f.x, f.z) + A.curbAt(f.x, f.z);
    if (f.st === 'air') {
      f.vy -= 20 * dt; f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
      g.rotation.x += f.rot * dt;
      if (f.y <= 0.15 && f.vy < 0) { f.y = 0.15; f.st = 'lie'; f.T = rand(2.5, 4); g.rotation.x = -Math.PI / 2; }
    } else if (f.st === 'lie') {
      if ((f.T -= dt) <= 0) { f.st = 'walk'; g.rotation.x = 0; f.y = 0; }
    } else {
      // встал, отряхнулся — к мопеду; мопеда нет — уходит пешком и пропадает
      const ok = c && !c.gone && !c.wreck && !c.knock;
      const tx = ok ? c.x + Math.cos(c.h) * 0.7 : f.x + 1, tz = ok ? c.z - Math.sin(c.h) * 0.7 : f.z;
      const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
      f.T += dt;
      if ((ok && d < 0.4) || f.T > 12) {
        A.dropMesh(g);
        if (ok) { c.mp.fell = 0; c.mesh.userData.rider.visible = true; c.speed = 0; }
        FLY.splice(i, 1);
        continue;
      }
      if (ok) { f.x += dx / d * Math.min(d, 1.5 * dt); f.z += dz / d * Math.min(d, 1.5 * dt); g.rotation.y = Math.atan2(dx, dz); }
      if (u.legL) { const s = Math.sin(f.T * 9) * 0.5; u.legL.rotation.x = s; u.legR.rotation.x = -s; }
    }
    g.position.set(f.x, gy + f.y, f.z);
    // лежит на асфальте — можно переехать
    if (sp > 3 && f.st !== 'air') {
      const dx = f.x - V.x, dz = f.z - V.z;
      if (Math.abs(dx * fx + dz * fz) < 2.4 && Math.abs(dx * fz - dz * fx) < 1.3) {
        A.gibHuman({ x: f.x, z: f.z, grp: g }, V.vx, V.vz);
        A.dropMesh(g);
        A.S.people++;
        A.toast(t('минус курьер «{brand}»', { brand: brandName(c.mp.br) }));
        if (c.mp) c.mp.gone = 1;
        FLY.splice(i, 1);
      }
    }
  }
}

/* ── шаг: сколько на ходу, сколько стоит, падения, курьеры у дверей ── */
export function step (dt, A) {
  const V = A.V, cx = A.cam.position.x, cz = A.cam.position.z;
  let moving = 0;
  for (const c of A.TRAFFIC) {
    if (!c.mp) continue;
    if (c.model !== 'moped') { if (!c.gone && Math.hypot(c.x - cx, c.z - cz) > 90) A.svcGone(c); continue; }   // respawnTraffic сделал из него машину — лишняя
    if (c.gone) continue;
    const m = c.mp;
    if (!m.fell && (c.knock || c.wreck)) fall(A, c);
    if (c.parked) continue;
    if (m.gone) {
      // седока нет: мопед стоит брошенный, пока не уедем
      c.parked = 1;
      continue;
    }
    moving++;
    // укатил далеко — ближе к курьеру, пока трафик не сделал из него машину
    if (!c.knock && !c.wreck && !m.fell && Math.hypot(c.x - V.x, c.z - V.z) > 420) A.placeTraffic(c, 120, 330);
  }
  // брошенные и дальние — прочь, когда их не видно
  for (const c of A.TRAFFIC) {
    if (!c.mp || c.gone || c.model !== 'moped' || !c.parked || c.mp.man) continue;
    if (Math.hypot(c.x - cx, c.z - cz) > 160) A.svcGone(c);
  }
  if ((MP.T -= dt) <= 0) {
    MP.T = 1;
    for (let k = moving; k < MP.moving; k++) { const c = newMoped(A, false); A.placeTraffic(c, 60, 330); }
    // стоящие: дальние убираем, новые — в кольце вокруг
    for (let i = MP.park.length - 1; i >= 0; i--) {
      const man = MP.park[i], d = Math.hypot(man.x - V.x, man.z - V.z);
      if (d > 280 || man.c.gone) {
        if (!man.dead) A.dropMesh(man.grp);
        if (!man.c.gone) A.svcGone(man.c);
        MP.park.splice(i, 1);
      }
    }
    const S = spots(A);
    for (let k = 0; k < 30 && MP.park.length < MP.parked && S.length; k++) {
      const sp = pick(S), d = Math.hypot(sp[0] - V.x, sp[1] - V.z);
      if (d < 70 || d > 230 || MP.park.some(m => Math.abs(m.x - sp[0]) < 45 && Math.abs(m.z - sp[1]) < 45)) continue;   // не кучкой у одного ТЦ
      parkAt(A, sp);
    }
  }
  stepFly(dt, A);
  // курьеры у дверей: смотрят в телефон, переминаются; мопед сбили — ругаются; наезд — как на пешехода
  const sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (const man of MP.park) {
    if (man.dead) continue;
    const g = man.grp, u = g.userData, near = (man.x - cx) ** 2 + (man.z - cz) ** 2 < 150 * 150;
    g.visible = near;
    if (!near) continue;
    man.ph += dt;
    if (u.armR) u.armR.rotation.x = -1.25 + Math.sin(man.ph * 0.7) * 0.05;
    if (u.head) u.head.rotation.x = 0.35;
    g.rotation.z = Math.sin(man.ph * 0.4) * 0.03;
    if (man.c.knock && !man.said) { man.said = 1; A.sayBubble(g, t('эй, мой мопед!'), '#4f7fd6', 2.6); }
    if (sp > 3) {
      const dx = man.x - V.x, dz = man.z - V.z;
      if (Math.abs(dx * fx + dz * fz) < 2.4 && Math.abs(dx * fz - dz * fx) < 1.25) {
        man.dead = 1;
        A.gibHuman({ x: man.x, z: man.z, grp: g }, V.vx, V.vz);
        A.dropMesh(g);
        A.S.people++;
        A.toast(t('минус курьер «{brand}»', { brand: brandName(man.c.mp.br) }));
        man.c.mp.man = null;
      }
    }
  }
}

export const DEBUG = { MP, FLY };
