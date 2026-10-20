/* ──────────────────────────────────────────────────────────────────────────
   Люди Quaternius — проба (ветка test/people, 21.10.2026, docs/IDEAS.md трек 15).

   Автор: «не нравится, что модели людей сделаны тобой». Пробуем бесплатные модели художника Quaternius (CC0,
   quaternius.com; файлы — с poly.pizza): рабочий в каске, парень в худи, мужчина в костюме, женщина. Их меши и кости
   сжаты скриптом в qpeople.data.js (без их анимаций — только поза покоя).

   Как надеты: человек игры собирается как раньше (people.js steps) — те же шесть «костей» (ноги, туловище, руки,
   голова), их крутит вся игра (ходьба, лавка, удар, катсцены). Вместо коробочного меша — модель Quaternius со своим
   скелетом (62 или 31 кость); каждый кадр, когда её видно, поворот наших костей переносится на её кости:
     ноги → UpperLeg, руки → UpperArm (руки опущены вдоль тела, у модели они в покое разведены), туловище → Abdomen,
     голова → Head; колени и локти сгибаются сами от взмаха ноги и руки; ступни (у Quaternius они не дети голени) —
     следом за голенью.
   Рост — как у человека игры (1,80, у женщин 1,72, × его рост), цвета — его: рубашка, штаны, кожа, волосы.

   Кто: каждый третий (QP.rate) по зерну человека; женщины — женская модель, мужчины — одна из трёх.
     ?qp=0 — как было (никого), ?qpall — все люди такие.
   Чего нет в пробе: зимней одежды (зимой — та же модель, верх цвета пуховика), живых лиц катсцен (у моделей свои
   нарисованные лица), дальней упрощённой модели (видно целиком на любом расстоянии), шапок и предметов «в меш». */
import * as THREE from '../vendor/three.module.min.js';
import { QDATA } from './qpeople.data.js';

const SRCH = typeof location !== 'undefined' ? location.search || '' : '';
export const QP = { on: !/[?&]qp=0\b/.test(SRCH), all: /[?&]qpall\b/.test(SRCH), rate: 0.34, built: 0, posed: 0 };
if (typeof window !== 'undefined') window.__qp = QP;   // отладка: сколько собрано и сколько поз за всё время

const MEN = ['worker', 'hoodie', 'business'], FEM = ['woman'];
/* чья краска: рубашка, штаны, кожа, волосы человека игры (остальное — как у художника) */
const ROLES = {
  worker: { Skin: 'skin', Moustache: 'hair', Eyebrows: 'hair' },
  hoodie: { Purple: 'shirt', LightBlue: 'pants', Skin: 'skin', Hair: 'hair', Eyebrows: 'hair' },
  business: { Skin: 'skin', Hair: 'hair', Eyebrows: 'hair' },
  woman: { Shirt: 'shirt', Pants: 'pants', Skin: 'skin', Hair: 'hair', HairBase: 'hair' },
};

/* какую модель надеть человеку (или null — как раньше) */
export function pickQ (Lk) {
  if (!QP.on || !Lk) return null;
  const h = Math.imul((Lk.seed >>> 0) ^ 0x9E3779B9, 2654435761) >>> 0;
  if (!QP.all && (h % 1000) / 1000 >= QP.rate) return null;
  const list = Lk.f ? FEM : MEN;
  return list[(h >>> 10) % list.length];
}

/* ── модель из qpeople.data.js: разбор один раз ── */
const MODELS = new Map();
function model (name) {
  let m = MODELS.get(name);
  if (m) return m;
  const bin = Uint8Array.from(atob(QDATA[name]), c => c.charCodeAt(0));
  const dv = new DataView(bin.buffer);
  let o = 0;
  const u8 = () => bin[o++], u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const str = () => { const n = u8(), s = new TextDecoder().decode(bin.subarray(o, o + n)); o += n; return s; };
  const nJ = u32(), nV = u32(), nI = u32(), nP = u32();
  const pal = [];
  for (let i = 0; i < nP; i++) pal.push({ name: str(), rgb: [f32(), f32(), f32()] });
  const names = [], parent = [], RP = [], RQ = [];
  for (let i = 0; i < nJ; i++) {
    names.push(str()); parent.push(dv.getInt16(o, true)); o += 2;
    RP.push(new THREE.Vector3(f32(), f32(), f32()));
    RQ.push(new THREE.Quaternion(f32(), f32(), f32(), f32()));
  }
  const mn = [f32(), f32(), f32()], mx = [f32(), f32(), f32()];
  const pos = new Float32Array(nV * 3);
  for (let i = 0; i < nV * 3; i++) {
    const c = i % 3, q = dv.getInt16(o, true); o += 2;
    pos[i] = mn[c] + (q + 32768) / 65535 * (mx[c] - mn[c]);
  }
  const mat = bin.slice(o, o + nV); o += nV;
  const si = bin.slice(o, o + nV * 4); o += nV * 4;
  const sw8 = bin.slice(o, o + nV * 4); o += nV * 4;
  const sw = new Float32Array(nV * 4);
  for (let i = 0; i < sw.length; i++) sw[i] = sw8[i] / 255;
  const idx = nV > 65535 ? new Uint32Array(bin.buffer.slice(o, o + nI * 4)) : new Uint16Array(bin.buffer.slice(o, o + nI * 2));
  // порядок: родитель раньше детей
  const depth = j => { let d = 0; while (parent[j] >= 0) { j = parent[j]; d++; } return d; };
  const order = [...names.keys()].sort((a, b) => depth(a) - depth(b));
  // поворот и сдвиг каждой кости относительно родителя в покое
  const LQ = RQ.map((q, j) => parent[j] < 0 ? q.clone() : RQ[parent[j]].clone().invert().multiply(q));
  const LP = RP.map((p, j) => parent[j] < 0 ? p.clone() : p.clone().sub(RP[parent[j]]).applyQuaternion(RQ[parent[j]].clone().invert()));
  // наши кости: левая у нас — с минусом по x (people.js piv), ищем у модели кость на той же стороне
  const side = (base, s) => {
    for (const suf of ['.L', '.R', '_L', '_R']) { const j = names.indexOf(base + suf); if (j >= 0 && Math.sign(RP[j].x) === s) return j; }
    return -1;
  };
  const J = {
    legL: side('UpperLeg', -1), legR: side('UpperLeg', 1), armL: side('UpperArm', -1), armR: side('UpperArm', 1),
    kneeL: side('LowerLeg', -1), kneeR: side('LowerLeg', 1), elbowL: side('LowerArm', -1), elbowR: side('LowerArm', 1),
    footL: side('Foot', -1), footR: side('Foot', 1), body: names.indexOf('Abdomen'), head: names.indexOf('Head'),
  };
  // руки — вниз вдоль тела, чуть в сторону (у модели в покое разведены)
  const FIX = names.map(() => new THREE.Quaternion());
  for (const [a, e, s] of [[J.armL, J.elbowL, -1], [J.armR, J.elbowR, 1]]) {
    if (a < 0 || e < 0) continue;
    const d = RP[e].clone().sub(RP[a]).normalize();
    FIX[a].setFromUnitVectors(d, new THREE.Vector3(s * 0.13, -1, 0).normalize());
  }
  // ступня — следом за голенью: где она относительно голени в покое
  const FOOT = [];
  for (const [f, k] of [[J.footL, J.kneeL], [J.footR, J.kneeR]]) {
    if (f < 0 || k < 0 || parent[f] === k) continue;
    const iq = RQ[k].clone().invert();
    FOOT.push({ f, k, q: iq.clone().multiply(RQ[f]), p: RP[f].clone().sub(RP[k]).applyQuaternion(iq) });
  }
  m = { name, nJ, nV, names, parent, RP, RQ, LP, LQ, order, J, FIX, FOOT, pal, mat, pos, si, sw, idx, h: mx[1] - mn[1], y0: mn[1], roles: ROLES[name] || {} };
  MODELS.set(name, m);
  return m;
}

const lin = new Map();
const col = hex => {
  let c = lin.get(hex);
  if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; lin.set(hex, c); }
  return c;
};

/* надеть модель: в группу человека g (кости игры уже в ней) — корень модели со скелетом и мешем.
   Вернёт меш (u.skin) — его прячет humanLod вместе с частями */
export function buildQ (g, name, S, Lk, mat) {
  const m = model(name);
  const bones = [];
  for (let j = 0; j < m.nJ; j++) {
    const b = new THREE.Bone();
    b.name = m.names[j];
    b.position.copy(m.LP[j]); b.quaternion.copy(m.LQ[j]);
    bones.push(b);
  }
  const root = new THREE.Group();
  for (let j = 0; j < m.nJ; j++) (m.parent[j] < 0 ? root : bones[m.parent[j]]).add(bones[j]);
  // цвета человека игры
  const want = { skin: S.skin, shirt: S.shirt, pants: S.pants, hair: Lk.hairC };
  const pc = m.pal.map(p => { const r = m.roles[p.name]; return r && want[r] ? col(want[r]) : p.rgb; });
  const cl = new Float32Array(m.nV * 3);
  for (let i = 0; i < m.nV; i++) { const c = pc[m.mat[i]]; cl[i * 3] = c[0]; cl[i * 3 + 1] = c[1]; cl[i * 3 + 2] = c[2]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.pos.slice(), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(m.si.slice(), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(m.sw.slice(), 4));
  geo.setIndex(new THREE.BufferAttribute(m.idx.slice(), 1));
  const skin = new THREE.SkinnedMesh(geo, mat);
  root.add(skin);
  root.updateMatrixWorld(true);                     // корень пока без масштаба и вне группы: кости в покое — в осях модели, как вершины
  const skel = new THREE.Skeleton(bones);
  skel.calculateInverses();
  skin.bind(skel, new THREE.Matrix4());
  skin.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, m.h * 0.5 + m.y0, 0), m.h * 0.8);
  // дальний вариант (humanLod, дальше 45 м): та же модель одним мешем — стоит, руки опущены
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(neutral(m).slice(), 3));
  lg.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  lg.setIndex(new THREE.BufferAttribute(m.idx.slice(), 1));
  const lod = new THREE.Mesh(lg, mat);
  lod.visible = false;
  root.add(lod);
  const k = (Lk.f ? 1.72 : 1.8) / m.h;              // рост — как у человека игры (дальше × его рост, g.scale)
  root.scale.setScalar(k);
  root.position.y = -m.y0 * k;
  g.add(root);
  const st = { m, bones, root, skel, g, WQ: m.RQ.map(q => q.clone()), WP: m.RP.map(p => p.clone()), dq: new Array(m.nJ).fill(null), ang: {}, frame: -1 };
  skin.userData.q = st;
  skin.onBeforeRender = poseHook;
  QP.built++;
  return { skin, lod };
}

/* ── поза: наши повороты (dq — по костям модели) → мировые повороты и места всех её костей; bones — и в сами кости ── */
const T = new THREE.Quaternion(), IQ = new THREE.Quaternion(), ID = new THREE.Quaternion(), V = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0);
function solve (m, dq, ang, WQ, WP, bones) {
  const J = m.J;
  for (const j of m.order) {
    const p = m.parent[j], Wp = p < 0 ? ID : WQ[p], d = dq[j];
    const b = j === J.kneeL ? 'kneeL' : j === J.kneeR ? 'kneeR' : j === J.elbowL ? 'elbL' : j === J.elbowR ? 'elbR' : null;
    if (d) T.copy(d).multiply(m.FIX[j]).multiply(m.RQ[j]);
    else if (b) T.setFromAxisAngle(AX, ang[b] || 0).multiply(Wp).multiply(m.LQ[j]);
    else T.copy(Wp).multiply(m.LQ[j]);
    WQ[j].copy(T);
    if (p < 0) WP[j].copy(m.LP[j]);
    else WP[j].copy(m.LP[j]).applyQuaternion(Wp).add(WP[p]);
    if (bones && (d || b)) bones[j].quaternion.copy(IQ.copy(Wp).invert().multiply(T));
  }
  // ступни — за голенью (у Quaternius они дети корня, а не голени)
  for (const F of m.FOOT) {
    const p = m.parent[F.f], Wp = p < 0 ? ID : WQ[p];
    T.copy(WQ[F.k]).multiply(F.q);
    V.copy(F.p).applyQuaternion(WQ[F.k]).add(WP[F.k]);
    WQ[F.f].copy(T); WP[F.f].copy(V);
    if (bones) {
      IQ.copy(Wp).invert();
      bones[F.f].quaternion.copy(IQ).multiply(T);
      if (p >= 0) V.sub(WP[p]);
      bones[F.f].position.copy(V.applyQuaternion(IQ));
    }
  }
}

/* вершины модели в позе «стоит, руки опущены» — для дальнего варианта (один раз на модель) */
function neutral (m) {
  if (m.neutral) return m.neutral;
  const dq = new Array(m.nJ).fill(null);
  for (const k of ['legL', 'legR', 'armL', 'armR', 'head', 'body']) if (m.J[k] >= 0) dq[m.J[k]] = new THREE.Quaternion();
  const WQ = m.RQ.map(q => q.clone()), WP = m.RP.map(p => p.clone());
  solve(m, dq, { elbL: -0.22, elbR: -0.22 }, WQ, WP, null);
  const M = [], A = new THREE.Matrix4(), B = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1);
  for (let j = 0; j < m.nJ; j++) M.push(A.compose(WP[j], WQ[j], ONE).clone().multiply(B.compose(m.RP[j], m.RQ[j], ONE).invert()));
  const out = new Float32Array(m.nV * 3), t = new THREE.Vector3();
  for (let i = 0; i < m.nV; i++) {
    let x = 0, y = 0, z = 0;
    for (let c = 0; c < 4; c++) {
      const w = m.sw[i * 4 + c];
      if (!w) continue;
      t.set(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]).applyMatrix4(M[m.si[i * 4 + c]]);
      x += w * t.x; y += w * t.y; z += w * t.z;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  m.neutral = out;
  return out;
}

/* ── каждый кадр, когда модель в кадре: позу наших костей — на её кости ── */
let FRAME = 0, LAST = 0;
function poseHook () {
  const now = performance.now();
  if (now !== LAST) { LAST = now; FRAME++; }
  const st = this.userData.q;
  if (!st || st.frame === FRAME) return;
  st.frame = FRAME;
  const u = st.g.userData, m = st.m, J = m.J;
  if (!u.legL) return;
  const dq = st.dq;
  if (J.legL >= 0) dq[J.legL] = u.legL.quaternion; if (J.legR >= 0) dq[J.legR] = u.legR.quaternion;
  if (J.armL >= 0) dq[J.armL] = u.armL.quaternion; if (J.armR >= 0) dq[J.armR] = u.armR.quaternion;
  if (J.head >= 0) dq[J.head] = u.head.quaternion;
  if (J.body >= 0 && u.parts) dq[J.body] = u.parts[2].quaternion;
  // колени и локти — от взмаха ноги / руки (взмах назад — плюс по x); сидит (нога вперёд) — голень вниз
  const knee = r => 0.08 + 1.2 * Math.max(0, r) + (r < -0.8 ? -r : 0), elb = r => -(0.22 + 0.6 * Math.max(0, -r));
  const a = st.ang;
  a.kneeL = knee(u.legL.rotation.x); a.kneeR = knee(u.legR.rotation.x);
  a.elbL = elb(u.armL.rotation.x); a.elbR = elb(u.armR.rotation.x);
  solve(m, dq, a, st.WQ, st.WP, st.bones);
  st.root.updateMatrixWorld(true);                  // поза — в этот же кадр, без запаздывания
  st.skel.update();
  QP.posed++;
}
