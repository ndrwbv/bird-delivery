/* ──────────────────────────────────────────────────────────────────────────
   Карта в сцене: чем закрыть тупики, плавные стыки полотна и отладка ?mapcheck.

   Проверки и починка данных — в mapcheck.js (без three.js, их же гоняет
   tools/mapcheck.mjs). Здесь то, что строится в сцене и живёт в кадре:

   • buildWorks — у каждого тупика «в никуда» что-то стоит: бетонные блоки
     со щитом и знаком «ДОРОГА ЗАКРЫТА» или ремонт — свежий асфальт, каток,
     дорожники в оранжевом с лопатами, конусы. Блоки и каток — препятствия,
     конусы сбиваются, дорожников можно сбить, как прохожих.
   • тапер — клин асфальта там, где улица на стыке резко меняет ширину.
   • curbOnAsphalt — поднятый тротуар не ложится на чужой асфальт.
   • step — дорожники копают, каток ездит (только рядом с камерой).
   • debug (?mapcheck) — сводка в консоль, столбики над проблемами, точки на
     полной карте, «]» — телепорт к следующей проблеме, «[» — столбики
     вкл/выкл, и сторож: раз в полсекунды проверяет, что люди и машины не
     проваливаются под асфальт и не стоят в домах и в настиле моста.

   Всё, что нужно из игры, приходит объектом api — модуль не лезет в
   game.js и не держит ссылок на его переменные.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';
import { checkMap, deadEnds as listDeadEnds, drivable } from './mapcheck.js';

const lerp = (a, b, k) => a + (b - a) * k;
/* детерминированный жребий по месту: один и тот же тупик всегда закрыт одинаково */
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

export const WORKS = { sites: [], men: [], rollers: [], signs: null, n: { blocks: 0, works: 0, tapers: 0, curbs: 0 }, ms: {} };
export const MAP_DOTS = [];                 // точки для полной карты (только ?mapcheck)

/* ── знаки: оба текста в одной текстуре, все таблички города — один меш ── */
function signAtlas () {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  // верх: «дорога закрыта» — белый щит с красной рамкой
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 64);
  x.strokeStyle = '#d9342c'; x.lineWidth = 8; x.strokeRect(5, 5, 246, 54);
  x.fillStyle = '#d9342c'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fit = (s, y, max) => { let f = 24; x.font = 'bold ' + f + 'px sans-serif'; while (f > 10 && x.measureText(s).width > max) { f--; x.font = 'bold ' + f + 'px sans-serif'; } x.fillText(s, 128, y); };
  fit(t('ДОРОГА ЗАКРЫТА'), 33, 226);
  // низ: «дорожные работы» — оранжевый щит с человечком с лопатой
  x.fillStyle = '#ff8a00'; x.fillRect(0, 64, 256, 64);
  x.fillStyle = '#1b1a1f'; x.fillRect(0, 64, 256, 5); x.fillRect(0, 123, 256, 5);
  x.save(); x.translate(34, 96);
  x.beginPath(); x.moveTo(0, -24); x.lineTo(24, 20); x.lineTo(-24, 20); x.closePath();
  x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 4; x.strokeStyle = '#d9342c'; x.stroke();
  x.fillStyle = '#1b1a1f';
  x.beginPath(); x.arc(-2, -6, 3.2, 0, Math.PI * 2); x.fill();
  x.fillRect(-4, -2, 5, 11); x.fillRect(-6, 9, 3, 8); x.fillRect(0, 9, 3, 8);
  x.fillRect(1, 0, 12, 2.5); x.fillRect(11, 0, 2.5, 10); x.fillRect(8, 9, 9, 3);
  x.beginPath(); x.moveTo(-14, 16); x.lineTo(-6, 10); x.lineTo(-2, 16); x.fill();
  x.restore();
  x.fillStyle = '#1b1a1f'; x.textAlign = 'center';
  let f = 22; x.font = 'bold ' + f + 'px sans-serif';
  const s = t('ДОРОЖНЫЕ РАБОТЫ');
  while (f > 10 && x.measureText(s).width > 180) { f--; x.font = 'bold ' + f + 'px sans-serif'; }
  x.fillText(s, 152, 97);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/* ── модели: каток и лопата склеены в один меш ── */
const WORKS_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
function rollerGeo (api) {
  const { box, put, mergeGeos } = api, L = [];
  box(L, 1.5, 0.9, 1.9, '#f2b705', 0, 1.05, -0.3);                 // корпус
  box(L, 1.6, 0.12, 2.1, '#1b1a1f', 0, 1.56, -0.3);
  box(L, 1.3, 0.6, 0.9, '#f2b705', 0, 0.75, 0.9);                   // рама над вальцом
  for (const sx of [-0.6, 0.6]) box(L, 0.09, 1.25, 0.09, '#1b1a1f', sx, 2.2, -0.75);   // стойки крыши
  box(L, 1.4, 0.1, 1.2, '#f2b705', 0, 2.85, -0.5);                  // крыша
  box(L, 0.5, 0.35, 0.45, '#3b3742', 0, 1.8, -0.55);                // сиденье
  box(L, 0.14, 0.2, 0.14, '#ff8a00', 0, 2.95, -0.5);                // маячок
  put(L, new THREE.CylinderGeometry(0.62, 0.62, 1.7, 10), '#5a5760', 0, 0.62, 1.05, 0, 0, Math.PI / 2);   // валец
  for (const sx of [-0.62, 0.62]) put(L, new THREE.CylinderGeometry(0.5, 0.5, 0.35, 8), '#2b2a30', sx, 0.5, -0.9, 0, 0, Math.PI / 2);
  return mergeGeos(L);
}
function shovelGeo (api) {
  const { box, mergeGeos } = api, L = [];
  box(L, 0.05, 1.1, 0.05, '#8a6b4e', 0, -0.35, 0.05);
  box(L, 0.26, 0.3, 0.04, '#6e6a72', 0, -0.95, 0.12);
  return mergeGeos(L);
}

/* ── тупики ── */
export function buildWorks (fix, api) {
  if (!fix) return;
  const t0 = performance.now();
  const { LIT, box, obb, groundH } = api;
  const signQuads = [];                 // [cx, y, cz, ry, w, h, v0, v1]
  let rollerG = null, shovelG = null;
  const sign = (x, z, ry, w, h, y, low) => signQuads.push([x, y, z, ry, w, h, low ? 0 : 0.5, low ? 0.5 : 1]);

  for (const d of fix.deadEnds) {
    const { x, z, ux, uz } = d, nx = -uz, nz = ux, ryA = Math.atan2(ux, uz);
    const W = Math.max(4, d.w + 0.8);
    const y = groundH(x, z);
    // смотрит на того, кто едет к тупику: лицом против u
    const face = Math.atan2(-ux, -uz);
    if (d.kind === 'blocks') {
      const bx = x + ux * 0.7, bz = z + uz * 0.7, by = groundH(bx, bz);
      const plastic = hash(x, z) < 0.35;
      const n = Math.max(2, Math.ceil(W / (plastic ? 1.3 : 2.4)));
      for (let k = 0; k < n; k++) {
        const o = (k + 0.5) / n * W - W / 2;
        if (plastic) box(LIT, 1.15, 0.8, 0.5, k % 2 ? '#f2eee6' : '#d9342c', bx + nx * o, by + 0.4, bz + nz * o, ryA);
        else box(LIT, W / n - 0.12, 0.8, 0.9, hash(x + k, z) < 0.3 ? '#b3ab9f' : '#bdb6ab', bx + nx * o, by + 0.4, bz + nz * o, ryA);
      }
      // полосатый щит на двух стойках над блоками
      const px = bx + ux * 0.7, pz = bz + uz * 0.7, py = groundH(px, pz);
      const m = Math.max(3, Math.round(W / 1.4));
      for (let k = 0; k < m; k++) {
        const o = (k + 0.5) / m * W - W / 2;
        box(LIT, W / m, 0.45, 0.14, k % 2 ? '#f2eee6' : '#d9342c', px + nx * o, py + 1.35, pz + nz * o, ryA);
      }
      for (const s of [-1, 1]) box(LIT, 0.18, 1.6, 0.18, '#585460', px + nx * (W / 2 - 0.2) * s, py + 0.8, pz + nz * (W / 2 - 0.2) * s, ryA);
      // знак — на стойке справа, если есть куда; на узком проезде — над щитом
      const sx = px, sz = pz;
      box(LIT, 0.14, 2.6, 0.14, '#585460', sx, py + 1.3, sz, ryA);
      sign(sx - ux * 0.09, sz - uz * 0.09, face, 2.6, 0.65, py + 2.35);
      // пара конусов перед блоками
      for (const s of [-0.3, 0.3]) cone(api, x - ux * 1.2 + nx * W * s, z - uz * 1.2 + nz * W * s);
      obb(bx + ux * 0.3, bz + uz * 0.3, W / 2 + 0.2, 0.75, Math.atan2(nz, nx));
      WORKS.n.blocks++;
      WORKS.sites.push({ kind: 'blocks', x, z, d });
    } else {
      rollerG = rollerG || rollerGeo(api);
      shovelG = shovelG || shovelGeo(api);
      works(api, d, W, face, sign, rollerG, shovelG);
    }
  }
  // одна склейка на все таблички: и «закрыта», и «работы»
  if (signQuads.length) {
    const P = [], U = [], I = [];
    for (const [cx, cy, cz, ry, w, h, v0, v1] of signQuads) {
      const c = Math.cos(ry), s = Math.sin(ry), vi = P.length / 3;
      const ax = c * w / 2, az = -s * w / 2;
      P.push(cx - ax, cy - h / 2, cz - az, cx + ax, cy - h / 2, cz + az, cx + ax, cy + h / 2, cz + az, cx - ax, cy + h / 2, cz - az);
      U.push(0, v0, 1, v0, 1, v1, 0, v1);
      I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeBoundingSphere();
    WORKS.signs = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: signAtlas(), side: THREE.DoubleSide }));
    api.scene.add(WORKS.signs);
  }
  tapers(fix, api);
  WORKS.ms.build = Math.round(performance.now() - t0);
}

function cone (api, x, z) {
  const { put, smashAdd, groundH } = api, y = groundH(x, z) + 0.18, L = [];
  put(L, new THREE.CylinderGeometry(0.05, 0.24, 0.72, 6), '#ff6a13', x, y + 0.36, z);
  put(L, new THREE.CylinderGeometry(0.14, 0.18, 0.12, 6), '#f4f1ea', x, y + 0.42, z);
  put(L, new THREE.BoxGeometry(0.5, 0.05, 0.5), '#2b2a30', x, y + 0.02, z);
  smashAdd('cone', x, z, 0.45, L, '#ff6a13');
}

/* Ремонт: свежий асфальт дальше тупика, щебень под следующий кусок,
   каток катает, двое-трое копают, конусы по краям, знак перед работами
   и блоки в конце — дальше дороги ещё нет. */
function works (api, d, W, face, sign, rollerG, shovelG) {
  const { LIT, LITM, box, obb, groundH, makeHuman, scene } = api;
  const { x, z, ux, uz } = d, nx = -uz, nz = ux, ryA = Math.atan2(ux, uz);
  const P = (a, o) => [x + ux * a + nx * o, z + uz * a + nz * o];
  // свежий асфальт: чёрный, поверх края старого и дальше по земле
  const [ax, az] = P(-3, 0), [bx, bz] = P(10, 0), [cx, cz] = P(15.5, 0);
  LITM.color('#44464d'); LITM.ribbon(ax, az, bx, bz, d.w, 0.18);
  LITM.color('#8e877c'); LITM.ribbon(bx, bz, cx, cz, d.w + 0.6, 0.1);                  // щебень
  LITM.color('#e3ded4'); LITM.ribbon(ax, az, bx, bz, d.w + 1.6, 0.08);
  // кучка щебня сбоку и бочка с битумом
  const [hx, hz] = P(13, (d.w / 2 + 1.2) * (hash(x, z, 1) < 0.5 ? 1 : -1));
  api.put(LIT, new THREE.IcosahedronGeometry(1.3, 0), '#8e877c', hx, groundH(hx, hz) + 0.2, hz);
  const [kx, kz] = P(1.2, -(d.w / 2 + 0.9));
  box(LIT, 0.7, 0.9, 0.7, '#2b2a30', kx, groundH(kx, kz) + 0.45, kz, ryA);
  // блоки в конце — дальше ещё поле
  const [ex, ez] = P(16.3, 0), ey = groundH(ex, ez), n = Math.max(2, Math.ceil(W / 2.4));
  for (let k = 0; k < n; k++) {
    const o = (k + 0.5) / n * W - W / 2;
    box(LIT, W / n - 0.12, 0.8, 0.9, '#bdb6ab', ex + nx * o, ey + 0.4, ez + nz * o, ryA);
  }
  const m = Math.max(3, Math.round(W / 1.4));
  for (let k = 0; k < m; k++) {
    const o = (k + 0.5) / m * W - W / 2;
    box(LIT, W / m, 0.45, 0.14, k % 2 ? '#f2eee6' : '#d9342c', ex + ux * 0.6 + nx * o, ey + 1.35, ez + uz * 0.6 + nz * o, ryA);
  }
  for (const s of [-1, 1]) box(LIT, 0.18, 1.6, 0.18, '#585460', ex + ux * 0.6 + nx * (W / 2 - 0.2) * s, ey + 0.8, ez + uz * 0.6 + nz * (W / 2 - 0.2) * s, ryA);
  obb(ex, ez, W / 2 + 0.2, 0.75, Math.atan2(nz, nx));
  // знак до работ, у края полотна справа по ходу к тупику
  const side = d.w / 2 + 0.6;
  const [sx, sz] = P(-7, -side), sy = groundH(sx, sz);
  box(LIT, 0.12, 2.4, 0.12, '#585460', sx, sy + 1.2, sz, ryA);
  sign(sx - ux * 0.08, sz - uz * 0.08, face, 2.3, 0.58, sy + 2.2, true);
  // конусы: поперёк въезда (с проходом) и вдоль краёв
  for (let k = 0; k < 3; k++) { const [qx, qz] = P(-2.4, (k - 1) * d.w * 0.34); cone(api, qx, qz); }
  for (let a = 1; a < 10; a += 3.2) for (const s of [-1, 1]) { const [qx, qz] = P(a, s * (d.w / 2 + 0.35)); cone(api, qx, qz); }
  // каток: катается по свежему асфальту взад-вперёд
  const roller = new THREE.Mesh(rollerG, WORKS_MAT);
  const R = { mesh: roller, x, z, ux, uz, a0: 1.8, a1: 7.8, a: 4 + hash(x, z, 2) * 3, v: 0.9, dir: 1, ry: ryA };
  const [rx, rz] = P(R.a, 0);
  roller.position.set(rx, groundH(rx, rz) + 0.18, rz);
  roller.rotation.y = ryA;
  scene.add(roller);
  WORKS.rollers.push(R);
  const [ox, oz] = P((R.a0 + R.a1) / 2, 0);
  obb(ox, oz, 1.0, (R.a1 - R.a0) / 2 + 1.4, ryA);      // препятствие на всю дорожку катка
  // дорожники: у края нового асфальта, лицом к нему, с лопатами
  const site = { kind: 'works', x, z, d, men: [] };
  const cnt = 2 + (hash(x, z, 3) < 0.45 ? 1 : 0);
  for (let i = 0; i < cnt; i++) {
    const s = i % 2 ? 1 : -1, a = 1.5 + i * 3.1 + hash(x, z, 4 + i) * 1.2;
    const [mx, mz] = P(a, s * (d.w / 2 - 0.6));
    const grp = makeHuman(null, { cap: '#ff8a00', shirt: '#ff8a00', pants: '#2f3540', fat: hash(x, z, 9 + i) < 0.2 });
    const u = grp.userData;
    const sh = new THREE.Mesh(shovelG, WORKS_MAT);
    if (u.armR) { sh.rotation.x = 0.4; u.armR.add(sh); }
    // светоотражающая полоса на жилете
    if (u.parts) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.07, 0.29), new THREE.MeshBasicMaterial({ color: 0xe8f0f0 }));
      band.position.set(0, 1.08, 0);
      grp.add(band);
    }
    const ry = Math.atan2(-nx * s, -nz * s) + (hash(x, z, 20 + i) - 0.5) * 0.9;
    grp.rotation.y = ry;
    grp.position.set(mx, groundH(mx, mz) + 0.18, mz);
    scene.add(grp);
    const man = { grp, x: mx, z: mz, ry, ph: hash(x, z, 30 + i) * 6, dead: 0, deadT: 0, site };
    site.men.push(man);
    WORKS.men.push(man);
  }
  WORKS.n.works++;
  WORKS.sites.push(site);
}

/* клин асфальта и тротуара на стыке улиц разной ширины */
function tapers (fix, api) {
  const { LITM, ROAD_HEX } = api;
  for (const q of fix.tapers || []) {
    const { x, z, vx, vz, w1, w2, c, c1 } = q, L = Math.min(9, Math.max(5, (w2 - w1) * 2.2));
    const nx = -vz, nz = vx, ex = x + vx * L, ez = z + vz * L;
    for (const pass of [0, 1]) {
      const a = pass ? w2 / 2 : w2 / 2 + (c <= 5 ? 2.75 : 1), b = pass ? w1 / 2 : w1 / 2 + (c1 <= 5 ? 2.75 : 1);
      const lift = pass ? 0.14 + (7 - c) * 0.004 + 0.0015 : 0.09 + (7 - c) * 0.004 + 0.0015;
      LITM.color(pass ? ROAD_HEX[c] : '#e3ded4');
      LITM.dtri(x + nx * a, z + nz * a, ex + nx * b, ez + nz * b, ex - nx * b, ez - nz * b, lift);
      LITM.dtri(x + nx * a, z + nz * a, ex - nx * b, ez - nz * b, x - nx * a, z - nz * a, lift);
    }
    WORKS.n.tapers++;
  }
}

/* Поднятый тротуар кладётся кусками по шесть метров вдоль каждой улицы и
   не знает про соседние: у разделённого проспекта, у проезда вдоль улицы,
   на внутренней стороне крутого поворота кусок ложился на чужой асфальт —
   бордюр посреди полотна, машину подкидывало на пустом месте, а люди
   стояли в тротуаре. Растр асфальта по метру: game.js (osmCurbs)
   спрашивает curbOnAsphalt и такой кусок не кладёт — ни бордюр, ни RAISED. */
let ASPH = null;
function asphalt (CITY) {
  if (ASPH) return ASPH;
  const t0 = performance.now();
  const ter = CITY.terrain, X0 = Math.floor(ter.x0) - 2, Z0 = Math.floor(ter.z0) - 2;
  const NX = Math.ceil(ter.nx * ter.g) + 4, NZ = Math.ceil(ter.nz * ter.g) + 4;
  const M = new Uint8Array(NX * NZ);
  const row = (iz, xa, xb) => {
    if (iz < 0 || iz >= NZ) return;
    const a = Math.max(0, Math.ceil(xa - X0)), b = Math.min(NX - 1, Math.floor(xb - X0));
    for (let ix = a; ix <= b; ix++) M[iz * NX + ix] = 1;
  };
  // прямоугольник вдоль отрезка — построчно, точно: на строке z оба условия
  // (вдоль и поперёк) линейны по x, пересечение — отрезок
  const rect = (x1, z1, x2, z2, hw) => {
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 0.01) return;
    const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
    const zmin = Math.min(z1, z2) - hw, zmax = Math.max(z1, z2) + hw;
    for (let z = Math.ceil(zmin); z <= zmax; z++) {
      let lo = -Infinity, hi = Infinity;
      // вдоль: 0 ≤ (x-x1)·ux + (z-z1)·uz ≤ L ; поперёк: |−(x-x1)·uz + (z-z1)·ux| ≤ hw
      const slab = (k, c, a0, a1) => {                 // a0 ≤ k·x + c ≤ a1
        if (Math.abs(k) < 1e-9) { if (c < a0 || c > a1) { lo = 1; hi = 0; } return; }
        let p = (a0 - c) / k, q = (a1 - c) / k;
        if (p > q) { const t = p; p = q; q = t; }
        if (p > lo) lo = p; if (q < hi) hi = q;
      };
      slab(ux, -x1 * ux + (z - z1) * uz, 0, L);
      slab(-uz, x1 * uz + (z - z1) * ux, -hw, hw);
      if (lo <= hi) row(z - Z0, lo, hi);
    }
  };
  const disc = (x, z, r) => { for (let dz = Math.ceil(-r); dz <= r; dz++) { const h = Math.sqrt(r * r - dz * dz); row(Math.round(z) + dz - Z0, x - h, x + h); } };
  for (const r of CITY.roads) {
    if (r.b) continue;
    const hw = (r.w || 5) / 2 - 0.2, p = r.p;
    for (let i = 1; i < p.length; i++) rect(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], hw);
    for (let i = 1; i < p.length - 1; i++) disc(p[i][0], p[i][1], hw);
  }
  WORKS.ms.asphalt = Math.round(performance.now() - t0);
  return (ASPH = { M, X0, Z0, NX, NZ, at: (x, z) => { const ix = Math.round(x) - X0, iz = Math.round(z) - Z0; return ix >= 0 && iz >= 0 && ix < NX && iz < NZ && M[iz * NX + ix] === 1; } });
}
export const onAsphalt = (CITY, x, z) => asphalt(CITY).at(x, z);
/* растр по метру нужен только на сборке — после неё отпускаем (в Северске это сто мегабайт) */
export function freeAsphalt () { ASPH = null; }

/* кусок тротуара вдоль ребра от d до dd, сторона sd: лёг бы на асфальт? */
export function curbOnAsphalt (CITY, ax, az, e, d, dd, sd, w, SW) {
  const A = asphalt(CITY);
  for (let t = d; t <= dd + 0.01; t += Math.max(0.5, (dd - d) / 6))
    for (const o of [w / 2 + 0.5, w / 2 + SW / 2, w / 2 + SW - 0.1]) {
      const x = ax + e.ux * t + e.rx * o * sd, z = az + e.uz * t + e.rz * o * sd;
      if (A.at(x, z)) { WORKS.n.curbs++; return true; }
    }
  return false;
}

/* ── в кадре: копают, катают, попадают под колёса ── */
let deadCheck = 0;
export function step (dt, api) {
  const { cam, V, groundH } = api, cx = cam.position.x, cz = cam.position.z;
  const T = performance.now() / 1000;
  for (const R of WORKS.rollers) {
    const near = (R.x - cx) ** 2 + (R.z - cz) ** 2 < 170 * 170;
    R.mesh.visible = near;
    if (!near) continue;
    R.a += R.v * R.dir * dt;
    if (R.a > R.a1) { R.a = R.a1; R.dir = -1; } else if (R.a < R.a0) { R.a = R.a0; R.dir = 1; }
    const x = R.x + R.ux * R.a, z = R.z + R.uz * R.a;
    R.mesh.position.set(x, groundH(x, z) + 0.18 + Math.sin(T * 18) * 0.012, z);
  }
  const sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (const m of WORKS.men) {
    const g = m.grp;
    if (m.dead) {
      if ((m.deadT -= dt) <= 0) { m.dead = 0; g.visible = true; }
      continue;
    }
    const d2 = (m.x - cx) ** 2 + (m.z - cz) ** 2;
    g.visible = d2 < 160 * 160;
    if (!g.visible) continue;
    // копают: рука с лопатой вниз-вверх, корпус кланяется, иногда передых
    m.ph += dt * 3.1;
    const k = Math.sin(m.ph), rest = Math.sin(m.ph * 0.13) > 0.8;
    const u = g.userData;
    if (u.armR) u.armR.rotation.x = rest ? -0.2 : -0.75 + k * 0.55;
    if (u.armL) u.armL.rotation.x = rest ? 0 : -0.5 + k * 0.35;
    g.rotation.x = rest ? 0 : 0.12 + k * 0.1;
    g.position.y = groundH(m.x, m.z) + 0.18 + (rest ? 0 : Math.abs(k) * 0.03);
    // наезд: как на прохожего
    if (sp > 3 && api.gibHuman) {
      const dx = m.x - V.x, dz = m.z - V.z;
      if (Math.abs(dx * fx + dz * fz) < 2.3 && Math.abs(dx * fz - dz * fx) < 1.25) {
        m.dead = 1; m.deadT = 25; g.visible = false;
        api.gibHuman({ x: m.x, z: m.z, grp: g }, V.vx, V.vz);
        if (api.onRunOver) api.onRunOver();
      }
    }
  }
  if (DBG.on) watch(dt, api);
}

/* ═════════════════ ?mapcheck ═════════════════ */
const DBG = { on: false, api: null, list: [], i: -1, cols: null, run: { t: 0, n: 0, samples: 0, by: {}, spots: new Map() } };

export function debug (fix, api) {
  DBG.on = true; DBG.api = api;
  const t0 = performance.now();
  // ?nomapfix&mapcheck — без починки: «после» и есть «до»
  if (!fix) fix = { log: [], deadEnds: [], ms: 0, before: null, raw: true };
  const after = checkMap(api.CITY, api.TH, { fade: !fix.raw, treated: fix.deadEnds, tapers: fix.tapers });
  browserChecks(api, after);
  const ms = performance.now() - t0;
  const before = fix.before || (fix.raw ? after : []);
  const table = {};
  for (const [tag, list] of [['before', before], ['after', after]])
    for (const i of list) {
      const r = table[i.kind] || (table[i.kind] = { before: 0, after: 0, 'after errors': 0 });
      r[tag]++;
      if (tag === 'after' && i.severity === 'error') r['after errors']++;
    }
  console.groupCollapsed('%c[mapcheck] ' + after.filter(i => i.severity === 'error').length + ' errors, ' +
    after.filter(i => i.severity === 'warn').length + ' warnings after fixes (' + fix.log.length + ' fixes, ' + fix.ms.toFixed(0) + ' ms)', 'color:#d9342c;font-weight:bold');
  console.table(table);
  console.log('fixes:', fix.log);
  console.log('dead ends:', WORKS.n, fix.deadEnds);
  console.log('check took ' + ms.toFixed(0) + ' ms; keys: ] — next issue, [ — columns on/off; __dlv.MAPCHECK');
  console.groupEnd();
  const sevR = { error: 0, warn: 1, info: 2 };
  DBG.list = after.filter(i => i.severity !== 'info').sort((a, b) => sevR[a.severity] - sevR[b.severity]);
  api.MAPCHECK = { before, after, fixes: fix.log, deadEnds: fix.deadEnds, works: WORKS, runtime: DBG.run, report: runtimeReport, list: DBG.list };
  window.__dlv && (window.__dlv.MAPCHECK = api.MAPCHECK);
  columns(api, after);
  for (const i of after) MAP_DOTS.push(i);
  addEventListener('keydown', e => {
    if (e.code === 'BracketRight' && !e.repeat) next(api, e.shiftKey ? -1 : 1);
    if (e.code === 'BracketLeft' && !e.repeat && DBG.cols) DBG.cols.visible = !DBG.cols.visible;
  });
}

/* проверки, которым нужна собранная сцена */
function browserChecks (api, out) {
  const { SOLIDS, nearestRoad, RAISED, BRIDGES, groundH } = api;
  const add = (kind, x, z, severity, msg) => out.push({ kind, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, severity, msg });
  // препятствия на асфальте: деревья, столбы, будки (кроме нарочных — блоков, перил, рамп)
  const seen = [];
  for (const s of SOLIDS) {
    if (s.deckY !== undefined || s.ramp || s.hw > 4 || s.hd > 4) continue;
    if (!api.inBounds(s.cx, s.cz, 15)) continue;                  // блоки на рамке — нарочно
    const r = nearestRoad(s.cx, s.cz, 7, 1);
    if (!r || r.seg.x || r.seg.c > 7 || r.d > r.seg.w / 2 - 0.4 - Math.min(s.hw, s.hd)) continue;
    if (WORKS.sites.some(q => Math.hypot(q.x - s.cx, q.z - s.cz) < 20)) continue;
    if (seen.some(q => Math.hypot(q[0] - s.cx, q[1] - s.cz) < 6)) continue;
    seen.push([s.cx, s.cz]);
    const wall = Math.abs(s.hd - 0.5) < 0.01 && s.hw > 1;          // стена дома: проезд упёрся в дом
    add(wall ? 'wall-on-road' : 'solid-on-road', s.cx, s.cz, wall ? 'info' : 'warn', `${wall ? 'building wall' : 'obstacle'} ${(s.hw * 2).toFixed(1)}×${(s.hd * 2).toFixed(1)} m stands on the asphalt of "${r.seg.name || 'road'}"`);
  }
  // бордюр на асфальте: после curbOnAsphalt в osmCurbs таких клеток нет
  let curbs = 0;
  for (const k of RAISED) {
    const x = Math.floor(k / 8000) - 4000, z = (k % 8000) - 4000;
    if (onAsphalt(api.CITY, x, z) && curbs++ < 400) add('curb-on-road', x, z, 'warn', 'raised curb cell on asphalt (car hops, people float)');
  }
  // мост: настил в игре против модели проверок — не разошлись ли
  for (const b of BRIDGES) {
    const t = 0.5, x = lerp(b.x1, b.x2, t), z = lerp(b.z1, b.z2, t);
    const y = api.surfaceAt(x, z), g = groundH(x, z);
    if (y < g - 0.01) add('bridge-deck', x, z, 'error', 'deck below ground');
  }
}

function columns (api, list) {
  const L = [], col = { error: '#ff2d3c', warn: '#ffa010', info: '#3fa0ff' };
  for (const i of list) {
    const y = api.surfaceAt(i.x, i.z), h = i.severity === 'error' ? 26 : i.severity === 'warn' ? 16 : 8;
    api.put(L, new THREE.BoxGeometry(0.5, h, 0.5), col[i.severity], i.x, y + h / 2, i.z);
    api.put(L, new THREE.OctahedronGeometry(1.1, 0), col[i.severity], i.x, y + h + 1, i.z);
  }
  if (!L.length) return;
  DBG.cols = new THREE.Mesh(api.mergeGeos(L), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
  DBG.cols.geometry.computeBoundingSphere();
  api.scene.add(DBG.cols);
}

function next (api, dir) {
  const L = DBG.list.concat(runtimeSpots());
  if (!L.length) return;
  DBG.i = (DBG.i + dir + L.length) % L.length;
  const i = L[DBG.i], V = api.V;
  // встаём на улицу метрах в шестнадцати от места, лицом к нему, и так, чтобы
  // камера за машиной не оказалась в доме
  const road = api.nearestRoad(i.x, i.z, 7, 2);
  const cands = [];
  if (road && road.d < 30) {
    const sg = road.seg, l = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) || 1, ux = (sg.x2 - sg.x1) / l, uz = (sg.z2 - sg.z1) / l;
    for (const k of [16, -16, 24, -24, 10, -10]) cands.push([road.x + ux * k, road.z + uz * k]);
  }
  for (let a = 0; a < 6.28; a += 0.785) cands.push([i.x + Math.sin(a) * 16, i.z + Math.cos(a) * 16]);
  let x = cands[0][0], z = cands[0][1];
  for (const [cx, cz] of cands) {
    const dx = i.x - cx, dz = i.z - cz, l = Math.hypot(dx, dz) || 1;
    if (api.inHouse(cx, cz) || api.inHouse(cx - dx / l * 13, cz - dz / l * 13) || api.inHouse(cx - dx / l * 7, cz - dz / l * 7)) continue;
    x = cx; z = cz; break;
  }
  V.x = x; V.z = z; V.vx = V.vz = 0;
  V.h = Math.atan2(i.x - x, i.z - z);
  V.y = api.surfaceAt(x, z);
  console.log(`[mapcheck] ${DBG.i + 1}/${L.length} ${i.severity} ${i.kind} @ ${i.x}, ${i.z}: ${i.msg}`);
  if (api.toast) api.toast(`${i.kind}: ${i.msg}`.slice(0, 90));
}

/* точки на полной карте */
export function drawMapDots (x, fmX, fmZ, s) {
  const col = { error: '#ff2d3c', warn: '#ffa010', info: '#3fa0ff' };
  x.lineWidth = 1.5; x.strokeStyle = '#ffffff';
  for (const i of MAP_DOTS) {
    x.fillStyle = col[i.severity];
    x.beginPath(); x.arc(fmX(i.x), fmZ(i.z), (i.severity === 'info' ? 3 : 6) * s, 0, Math.PI * 2); x.fill();
    if (i.severity !== 'info') x.stroke();
  }
  for (const q of runtimeSpots()) {
    x.strokeStyle = '#ff00d0'; x.lineWidth = 2;
    x.strokeRect(fmX(q.x) - 5 * s, fmZ(q.z) - 5 * s, 10 * s, 10 * s);
  }
}

/* ── сторож: люди и машины не под асфальтом, не в домах, не в настиле ──
   Раз в полсекунды проходим по всем, кто ходит и ездит, и сверяем высоту
   с тем, на чём они должны стоять. */
function watch (dt, api) {
  const R = DBG.run;
  if ((R.t -= dt) > 0) return;
  R.t = 0.5; R.n++;
  const { groundH, surfaceAt, curbAt, inHouse, BRIDGES } = api;
  const flag = (who, x, z, why, dy) => {
    R.by[why] = (R.by[why] || 0) + 1;
    const k = Math.round(x / 8) + ',' + Math.round(z / 8) + ',' + why;
    const s = R.spots.get(k);
    if (s) { s.n++; s.who.add(who); } else R.spots.set(k, { x: Math.round(x), z: Math.round(z), why, n: 1, who: new Set([who]), dy: Math.round(dy * 100) / 100 });
  };
  // над головой настил моста ниже, чем рост человека или машина
  const lowDeck = (x, z, y, h) => {
    for (const b of BRIDGES) {
      if (x < b.bx0 || x > b.bx1 || z < b.bz0 || z > b.bz1) continue;
      const dx = b.x2 - b.x1, dz = b.z2 - b.z1, t = ((x - b.x1) * dx + (z - b.z1) * dz) / (dx * dx + dz * dz || 1);
      if (t < 0 || t > 1 || Math.hypot(x - b.x1 - dx * t, z - b.z1 - dz * t) > b.ws / 2) continue;
      const deck = b.deck(lerp(b.s1, b.s2, t));
      if (deck - 1.8 < y + h && deck > y + 0.4) return deck - y;       // низ балок ниже макушки, а настил — не под ногами
    }
    return null;
  };
  const walker = (list, who) => {
    for (const p of list) {
      if (!p || p.dead || !p.grp || p.grp.parent !== api.scene || !p.grp.visible) continue;
      R.samples++;
      const x = p.x, z = p.z, y = p.grp.position.y, g = groundH(x, z);
      const floor = g + curbAt(x, z), deck = surfaceAt(x, z);        // без prevY — настил в приоритете
      if (inHouse(x, z)) flag(who, x, z, 'walker-in-house', 0);
      if (deck > g + 0.5) {
        if (Math.abs(y - deck) < 0.6) continue;                        // идёт по мосту
        const ld = lowDeck(x, z, y, 1.8);
        if (ld !== null) flag(who, x, z, 'walker-in-deck', ld);
        else if (g < 0.2) flag(who, x, z, 'walker-under-deck-in-river', y - deck);
        continue;
      }
      if (y < floor - 0.2) flag(who, x, z, 'walker-sunk', y - floor);
      if (g < -0.15 && y < 0.1) flag(who, x, z, 'walker-in-water', g);
    }
  };
  walker(api.PEOPLE, 'person'); walker(api.PEDS, 'burger'); walker(api.SCOOTS, 'scooter');
  for (const c of api.CROWDS) walker(c.people, 'crowd');
  walker(api.DRIVERS || [], 'driver'); walker(api.SMOKERS || [], 'smoker');
  for (const t of api.TRAFFIC) {
    if (!t.mesh || !t.mesh.visible || t.wreck) continue;
    R.samples++;
    const x = t.x, z = t.z, y = t.mesh.position.y, g = groundH(x, z), top = surfaceAt(x, z, y);
    if (inHouse(x, z)) flag('car', x, z, 'car-in-house', 0);
    if (y < top - 0.35) flag('car', x, z, 'car-sunk', y - top);
    if (top - g < 0.5) { const ld = lowDeck(x, z, y, 1.5); if (ld !== null) flag('car', x, z, 'car-in-deck', ld); }
    if (g < -0.3 && top - g < 0.3 && !t.sunk) flag('car', x, z, 'car-in-water', g);
  }
  const V = api.V;
  if (V) {
    R.samples++;
    const g = groundH(V.x, V.z), top = surfaceAt(V.x, V.z, V.y);
    if (inHouse(V.x, V.z)) flag('player', V.x, V.z, 'car-in-house', 0);
    if (V.y < top - 0.35 && !V.air) flag('player', V.x, V.z, 'car-sunk', V.y - top);
    if (top - g < 0.5) { const ld = lowDeck(V.x, V.z, V.y, 1.5); if (ld !== null) flag('player', V.x, V.z, 'car-in-deck', ld); }
  }
}
function runtimeSpots () {
  return [...DBG.run.spots.values()].sort((a, b) => b.n - a.n).slice(0, 60)
    .map(s => ({ kind: s.why, x: s.x, z: s.z, severity: 'error', msg: `${s.n}× (${[...s.who].join(', ')}), dy ${s.dy}` }));
}
export function runtimeReport () {
  const R = DBG.run;
  const out = { ticks: R.n, samples: R.samples, byReason: { ...R.by }, spots: runtimeSpots() };
  console.log('[mapcheck] runtime watch:', out.ticks, 'ticks,', out.samples, 'samples', out.byReason);
  console.table(out.spots.slice(0, 20));
  return out;
}

export { listDeadEnds, drivable };
