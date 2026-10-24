/* ──────────────────────────────────────────────────────────────────────────
   Люди Quaternius (21.10.2026; проба в ветке test/people, стиль утверждён автором).

   Автор: «не нравится, что модели людей сделаны тобой». Пробуем бесплатные модели художника Quaternius (CC0,
   quaternius.com; файлы — с poly.pizza), сжатые скриптом в qpeople.data.js. Три семейства — у каждого свой скелет:
     M — мужчины «Ultimate Modular Men» (рабочий, худи, костюм, рубашка, фермер, панк, пляжник),
     F — женщины «Ultimate Modular Women» (повседневная, нарядная, панк),
     A — женщины «Animated Women» (в футболке, в майке, в платье) — цельные.
   У M и F каждый разрезан на голову, тело, ноги, ступни: человек собирается из частей разных моделей
   (7⁴ сочетаний у мужчин, 3⁴ у женщин), цвета — его: рубашка, штаны, кожа, волосы; очки — если есть в его внешности.

   Как надеты: человек игры собирается как раньше (people.js steps) — те же шесть «костей» (ноги, туловище, руки,
   голова), их крутит вся игра. Вместо коробок — модель со своим скелетом; каждый кадр, когда её видно:
   • идёт (группа двигается 0,25—7 м/с и игра машет ему ногами) — настоящая ходьба / бег художника, шаг в такт
     скорости: клип крутится так, чтобы ступня на земле ехала назад ровно со скоростью человека (не «летит»);
   • иначе — повороты наших костей переносятся на её кости: ноги → UpperLeg, руки → UpperArm (опущены вдоль тела),
     туловище → Abdomen, голова → Head; колени и локти сгибаются от взмаха; ступни — за голенью. Так работают лавка,
     взмах рукой, удары, катсцены. Между ними — плавный переход за ~0,2 с.

   Кто: все люди (стиль утверждён автором 21.10.2026). ?qp=0 — старые коробочные (для сравнения), ?qpmix — каждый третий.
   Чего нет в пробе: зимней одежды и шапок (верх зимой — цвета пуховика), живых лиц катсцен (у моделей свои лица).
   Дальний вариант (дальше 45 м) — та же модель одним мешем, стоит.
   23.10.2026: коробку с пиццей держит двумя руками на кистях (CARRY); сбитый — та же модель с цветами живого и тем, что
   надето поверх (corpseQ); на куски — та же модель (qPieces); наклон «Interact» — qpeople.clips.js.
   23.10.2026 (12аф): там же бег вбок «Run_Left / Run_Right» (u.qSide — peddodge.js) и кувырок «Roll» (u.qAnim c: 'roll').
   23.10.2026 (память телефона, docs/AGENTS.md): части сварены и упрощены (tools/quaternius/slim.mjs), кости — лёгкие (QBone,
   не в сцене), очки — только у кого есть во внешности. */
import * as THREE from '../vendor/three.module.min.js';
import { QDATA } from './qpeople.data.js';
import { QCLIPS } from './qpeople.clips.js';      // добавочные клипы (наклон «Interact» — поднять с земли), tools/quaternius/clipadd.py

const SRCH = typeof location !== 'undefined' ? location.search || '' : '';
export const QP = { on: !/[?&]qp=0\b/.test(SRCH), all: !/[?&]qpmix\b/.test(SRCH), rate: 0.34, built: 0, posed: 0, walk: 0, combos: 0, carry: 0 };
if (typeof window !== 'undefined') window.__qp = QP;   // отладка: сколько собрано, поз, кадров ходьбы

/* случайность от зерна человека */
function rng (seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}

/* кого и из чего собрать (или null — как раньше) */
export function pickQ (Lk) {
  if (!QP.on || !Lk) return null;
  const r = rng((Lk.seed >>> 0) ^ 0x51A7E);
  if (!QP.all && r() >= QP.rate) return null;
  const fam = Lk.f ? (r() < 0.65 ? 'F' : 'A') : 'M';
  const F = family(fam), ok = F.models.map((m, i) => i).filter(i => F.models[i].name !== 'winter'), k = () => ok[(r() * ok.length) | 0];
  return fam === 'A' ? { fam, all: k(), seed: Lk.seed } : { fam, head: k(), body: k(), legs: k(), feet: k(), seed: Lk.seed };
}

/* части модели силой, по именам моделей семейства M (people.js makeHuman o.q; minigames/stairs3d.js — мужик в трусах:
   { head: ['business', 'casual', 'beach'], body: 'punk', legs: 'beach', feet: 'beach' }; список — одна из них по зерну).
   Только мужчины (Lk.f — как было); q — что выбрал pickQ (или null — соберём сами) */
export function qForce (q, Lk, parts) {
  if (!QP.on || !Lk || Lk.f || !parts) return q;
  const F = family('M'), r = rng((Lk.seed >>> 0) ^ 0xF0CE), ok = F.models.map((m, i) => i).filter(i => F.models[i].name !== 'winter');
  const k = () => ok[(r() * ok.length) | 0];
  const out = q && q.fam === 'M' ? { ...q } : { fam: 'M', head: k(), body: k(), legs: k(), feet: k(), seed: Lk.seed };
  for (const key of ['head', 'body', 'legs', 'feet']) {
    const want = [].concat(parts[key] || []).map(n => F.models.findIndex(m => m.name === n)).filter(i => i >= 0);
    if (want.length) out[key] = want[(r() * want.length) | 0];
  }
  return out;
}

/* ── семейство из qpeople.data.js: разбор один раз ── */
const FAMS = new Map();
function family (fam) {
  let F = FAMS.get(fam);
  if (F) return F;
  const bin = Uint8Array.from(atob(QDATA[fam]), c => c.charCodeAt(0));
  const dv = new DataView(bin.buffer);
  let o = 0;
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; }, f32 = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const str = () => { const n = bin[o++], s = new TextDecoder().decode(bin.subarray(o, o + n)); o += n; return s; };
  const nJ = u32(), nM = u32(), nC = u32();
  const names = [], parent = [], RP = [], RQ = [];
  for (let i = 0; i < nJ; i++) {
    names.push(str()); parent.push(dv.getInt16(o, true)); o += 2;
    RP.push(new THREE.Vector3(f32(), f32(), f32())); RQ.push(new THREE.Quaternion(f32(), f32(), f32(), f32()));
  }
  const clips = {};
  // Run_Left / Run_Right — бег вбок, Roll — кувырок (уворот от машины, peddodge.js): до «run», иначе перепишут бег
  const clipKey = name => /run_?left/i.test(name) ? 'runl' : /run_?right/i.test(name) ? 'runr' : /roll/i.test(name) ? 'roll' : /kick/i.test(name) ? 'kick' : /run/i.test(name) ? 'run' : /death/i.test(name) ? 'death' : /punch/i.test(name) ? 'punch' : /interact|pick/i.test(name) ? 'interact' : /walk/i.test(name) ? 'walk' : name.toLowerCase();
  for (let c = 0; c < nC; c++) {
    const name = str(), nF = u32(), fps = f32(), speed = f32();
    const data = new Float32Array(bin.buffer.slice(o, o + nF * nJ * 7 * 4)); o += nF * nJ * 7 * 4;
    clips[clipKey(name)] = { nF, fps, speed, data, T: nF / fps };
  }
  // добавочные клипы (qpeople.clips.js): у семейства A (цельные женщины) наклона нет — игра наклоняет своими костями
  if (QCLIPS[fam]) {
    const xb = Uint8Array.from(atob(QCLIPS[fam]), c => c.charCodeAt(0)), xv = new DataView(xb.buffer);
    let p = 8;
    if (xv.getUint32(0, true) === nJ) {
      for (let c = 0, n = xv.getUint32(4, true); c < n; c++) {
        const ln = xb[p++], name = new TextDecoder().decode(xb.subarray(p, p + ln)); p += ln;
        const nF = xv.getUint32(p, true), fps = xv.getFloat32(p + 4, true), speed = xv.getFloat32(p + 8, true); p += 12;
        clips[clipKey(name)] = { nF, fps, speed, data: new Float32Array(xb.buffer.slice(p, p + nF * nJ * 28)), T: nF / fps }; p += nF * nJ * 28;
      }
    }
  }
  const models = [];
  for (let mI = 0; mI < nM; mI++) {
    const name = str(), nP = u32(), parts = {};
    for (let p = 0; p < nP; p++) {
      const type = str(), nV = u32(), nI = u32(), nPal = u32(), pal = [];
      for (let i = 0; i < nPal; i++) pal.push({ name: str(), rgb: [f32(), f32(), f32()] });
      const eye = new THREE.Vector3(f32(), f32(), f32()), mn = [f32(), f32(), f32()], mx = [f32(), f32(), f32()];
      const pos = new Float32Array(nV * 3);
      for (let i = 0; i < nV * 3; i++) { const c = i % 3; pos[i] = mn[c] + (dv.getInt16(o, true) + 32768) / 65535 * (mx[c] - mn[c]); o += 2; }
      const mat = bin.slice(o, o + nV); o += nV;
      const si = bin.slice(o, o + nV * 4); o += nV * 4;
      const sw = bin.slice(o, o + nV * 4); o += nV * 4;
      const big = nV > 65535, idx = big ? new Uint32Array(bin.buffer.slice(o, o + nI * 4)) : new Uint16Array(bin.buffer.slice(o, o + nI * 2));
      o += nI * (big ? 4 : 2);
      parts[type] = { type, nV, nI, pal, eye, pos, mat, si, sw, idx, y0: mn[1], y1: mx[1] };
    }
    models.push({ name, parts });
  }
  const depth = j => { let d = 0; while (parent[j] >= 0) { j = parent[j]; d++; } return d; };
  const order = [...names.keys()].sort((a, b) => depth(a) - depth(b));
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
    handL: -1, handR: -1,
  };
  J.handL = parent.findIndex((p, j) => p === J.elbowL && p >= 0); J.handR = parent.findIndex((p, j) => p === J.elbowR && p >= 0);   // кисть — первая кость под предплечьем
  // руки — вниз вдоль тела, чуть в сторону (у модели в покое разведены)
  const FIX = names.map(() => new THREE.Quaternion());
  for (const [a, e, s] of [[J.armL, J.elbowL, -1], [J.armR, J.elbowR, 1]]) {
    if (a < 0 || e < 0) continue;
    FIX[a].setFromUnitVectors(RP[e].clone().sub(RP[a]).normalize(), new THREE.Vector3(s * 0.13, -1, 0).normalize());
  }
  // ступня — следом за голенью: где она относительно голени в покое
  const FOOT = [];
  for (const [f, k] of [[J.footL, J.kneeL], [J.footR, J.kneeR]]) {
    if (f < 0 || k < 0 || parent[f] === k) continue;
    const iq = RQ[k].clone().invert();
    FOOT.push({ f, k, q: iq.clone().multiply(RQ[f]), p: RP[f].clone().sub(RP[k]).applyQuaternion(iq) });
  }
  let y0 = Infinity, y1 = -Infinity;
  for (const m of models) for (const t in m.parts) { y0 = Math.min(y0, m.parts[t].y0); y1 = Math.max(y1, m.parts[t].y1); }
  F = { fam, nJ, names, parent, RP, RQ, LP, LQ, order, J, FIX, FOOT, clips, models, y0, h: y1 - y0, combos: new Map() };
  FAMS.set(fam, F);
  return F;
}

/* ── по сезону (S.lvl: 0 лето … 3 зима, people.js wearOf): шорты — на брюки; с куртки (2) — пуховик из Blender,
   зимой (3) — сапоги и шапка (ушанка или вязаная, как у человека игры); цельные женщины (A) зимой — модульные (F) ── */
function dress (q, S, Lk) {
  const lvl = S.lvl || 0;
  if (!lvl) return q;
  if (q.fam === 'A' && lvl >= 2) { const r = rng((Lk.seed >>> 0) ^ 0xC0A7), F = family('F'), ok = F.models.map((m, i) => i).filter(i => F.models[i].name !== 'winter'), k = () => ok[(r() * ok.length) | 0]; q = { fam: 'F', head: k(), body: k(), legs: k(), feet: k(), seed: Lk.seed }; }
  if (q.fam === 'A') return q;
  const F = family(q.fam), W = F.models.findIndex(m => m.name === 'winter'), r = rng((Lk.seed >>> 0) ^ 0x5EA5);
  q = { ...q };
  if (F.models[q.legs] && /beach/.test(F.models[q.legs].name)) { const ok = F.models.map((m, i) => i).filter(i => !/beach|winter/.test(F.models[i].name)); q.legs = ok[(r() * ok.length) | 0]; }
  if (W < 0) return q;
  if (lvl >= 2) { q.hands = q.body; q.body = W; }
  if (lvl >= 3) {
    q.feet = W;
    const helmet = /worker|king|farmer/.test(F.models[q.head].name);   // каска, корона, шляпа фермера — без зимней шапки
    if (!helmet && /ushanka|beanie|hood|hat/.test(S.hw || '')) { q.hatM = W; q.hat = S.hw === 'ushanka' ? 'hatu' : 'hatb'; }
  }
  return q;
}

/* чья вершина (главная кость): 1 — плечо и предплечье, 2 — бедро и голень, 3 — кисть, 4 — голова, 5 — туловище;
  // зимой голая кожа рук, ног и туловища — цвета рукава / штанов (своих рукавов у маек и платьев нет) */
function classes (F) {
  if (!F.cls) {
    const J = F.J, cls = new Uint8Array(F.nJ), sub = (j, c) => { cls[j] = c; for (const k of F.order) if (F.parent[k] >= 0 && cls[F.parent[k]] === c && k !== j && !cls[k]) cls[k] = c; };
    for (const n of ['Hips', 'Abdomen', 'Torso', 'Chest', 'Body']) { const j = F.names.indexOf(n); if (j >= 0) cls[j] = 5; }
    for (const j of [J.head]) if (j >= 0) sub(j, 4);
    for (const j of [J.elbowL, J.elbowR]) if (j >= 0) sub(j, 3);
    for (const j of [J.elbowL, J.elbowR, J.armL, J.armR]) if (j >= 0) cls[j] = 1;
    for (const j of [J.legL, J.legR, J.kneeL, J.kneeR]) if (j >= 0) cls[j] = 2;
    for (const j of [J.footL, J.footR]) if (j >= 0) sub(j, 6);   // 6 — ступня: зимой голая — в сапоге
    F.cls = cls;
  }
  return F.cls;
}

/* кисти из тела модели (под пуховиком своего тела нет — кисти берём от прежнего) */
function handsOf (F, P) {
  if (P.handsPart) return P.handsPart;
  const cls = classes(F), keep = new Int32Array(P.nV).fill(-1), dom = v => { let b = 0, bj = 0; for (let c = 0; c < 4; c++) if (P.sw[v * 4 + c] > b) { b = P.sw[v * 4 + c]; bj = P.si[v * 4 + c]; } return bj; };
  let n = 0;
  for (let v = 0; v < P.nV; v++) if (cls[dom(v)] === 3) keep[v] = n++;
  const pos = new Float32Array(n * 3), mat = new Uint8Array(n), si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4), idx = [];
  for (let v = 0; v < P.nV; v++) { const k = keep[v]; if (k < 0) continue; pos.set(P.pos.subarray(v * 3, v * 3 + 3), k * 3); mat[k] = P.mat[v]; si.set(P.si.subarray(v * 4, v * 4 + 4), k * 4); sw.set(P.sw.subarray(v * 4, v * 4 + 4), k * 4); }
  for (let i = 0; i < P.nI; i += 3) { const a = keep[P.idx[i]], b = keep[P.idx[i + 1]], c = keep[P.idx[i + 2]]; if (a >= 0 && b >= 0 && c >= 0) idx.push(a, b, c); }
  P.handsPart = { type: 'hands', nV: n, nI: idx.length, pal: P.pal, eye: new THREE.Vector3(), pos, mat, si, sw, idx: new Uint16Array(idx), y0: P.y0, y1: P.y1 };
  return P.handsPart;
}

/* ── части в один меш (общий на всех с тем же набором частей): места, кости, веса, индексы, поза «стоит» ── */
const SKIN_RE = /skin/i, HAIR_RE = /^(hair|eyebrow|moustache|beard)/i, KEEP_RE = /^(eye|eyes|earrings|gold|metal)/i;
function combo (F, q) {
  const key = q.fam === 'A' ? 'a' + q.all : [q.head, q.body, q.legs, q.feet, q.hat || '', q.hands ?? ''].join(',');
  let C = F.combos.get(key);
  if (C) return C;
  const list = q.fam === 'A' ? [F.models[q.all].parts.all] : [F.models[q.head].parts.head, F.models[q.body].parts.body, F.models[q.legs].parts.legs, F.models[q.feet].parts.feet];
  if (q.hands !== undefined && F.models[q.hands].parts.body) list.push(handsOf(F, F.models[q.hands].parts.body));
  let hatFit = null;
  if (q.hat && F.models[q.hatM].parts[q.hat]) {
    list.push(F.models[q.hatM].parts[q.hat]);
    // шапки сделаны в Blender по черепу образца (M — худи, F — повседневная): масштаб и сдвиг — под череп этой головы
    const ref = F.models.find(m => m.name === (q.fam === 'M' ? 'hoodie' : 'wcasual')), a = skull(ref.parts.head), b = skull(F.models[q.head].parts.head);
    if (a && b) hatFit = { s: b.w / a.w, a, b };
  }
  let nV = 0, nI = 0;
  for (const P of list) { nV += P.nV; nI += P.nI; }
  const pos = new Float32Array(nV * 3), si = new Uint8Array(nV * 4), sw = new Uint8Array(nV * 4), mat = new Uint8Array(nV);
  const idx = nV > 65535 ? new Uint32Array(nI) : new Uint16Array(nI), pal = [];
  let v0 = 0, i0 = 0, eye = null;
  let iN = 0;
  for (const P of list) {
    pos.set(P.pos, v0 * 3); si.set(P.si, v0 * 4); sw.set(P.sw, v0 * 4);
    if (hatFit && /^hat/.test(P.type)) {                     // шапка — по черепу этой головы
      const { s: k, a, b } = hatFit;
      for (let i = v0; i < v0 + P.nV; i++) {
        pos[i * 3] = b.x + (pos[i * 3] - a.x) * k; pos[i * 3 + 1] = b.y + (pos[i * 3 + 1] - a.y) * k; pos[i * 3 + 2] = b.z + (pos[i * 3 + 2] - a.z) * k;
      }
    }
    const b = pal.length, cnt = new Array(P.pal.length).fill(0);
    for (let i = 0; i < P.nV; i++) { mat[v0 + i] = b + P.mat[i]; cnt[P.mat[i]]++; }
    // роль краски: кожа, волосы, рубашка (самая частая на теле), штаны (самая частая на ногах), остальное — как у художника
    let top = -1;
    if (P.type === 'body' || P.type === 'legs' || P.type === 'all') {
      const want = /shirt|dress|body|top/i;
      for (let k = 0; k < P.pal.length; k++) {
        const nm = P.pal[k].name;
        if (SKIN_RE.test(nm) || HAIR_RE.test(nm) || KEEP_RE.test(nm) || /shoe|sock/i.test(nm)) continue;
        if (P.type === 'all' ? want.test(nm) : top < 0 || cnt[k] > cnt[top]) top = k;
      }
    }
    for (let k = 0; k < P.pal.length; k++) {
      const nm = P.pal[k].name;
      const role = nm === 'Hat' ? 'hat' : SKIN_RE.test(nm) ? 'skin' : HAIR_RE.test(nm) ? 'hair' : k === top ? (P.type === 'legs' ? 'pants' : 'shirt')
        : P.type === 'all' && /pants/i.test(nm) ? 'pants' : null;
      pal.push({ rgb: P.pal[k].rgb, role, name: nm });
    }
    // под шапкой волос нет (иначе пробивают её насквозь)
    const bald = hatFit && P.type === 'head' ? P.pal.map(p => /^hair/i.test(p.name)) : null;
    for (let i = 0; i < P.nI; i += 3) {
      const x0 = P.idx[i], x1 = P.idx[i + 1], x2 = P.idx[i + 2];
      if (bald && (bald[P.mat[x0]] || bald[P.mat[x1]] || bald[P.mat[x2]])) continue;
      idx[iN++] = x0 + v0; idx[iN++] = x1 + v0; idx[iN++] = x2 + v0;
    }
    if (P.type === 'head' || P.type === 'all') eye = P.eye;
    v0 += P.nV; i0 += P.nI;
  }
  classes(F);
  const vcls = new Uint8Array(nV), sk = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nV; v++) {
    let b = 0, bj = 0;
    for (let c = 0; c < 4; c++) if (sw[v * 4 + c] > b) { b = sw[v * 4 + c]; bj = si[v * 4 + c]; }
    vcls[v] = F.cls[bj];
    if (vcls[v] === 4 && pal[mat[v]].role === 'skin') for (let a = 0; a < 3; a++) { sk[a] = Math.min(sk[a], pos[v * 3 + a]); sk[a + 3] = Math.max(sk[a + 3], pos[v * 3 + a]); }
  }
  const helmet = pal.some(p => /yellow|helmet|crown|hat/i.test(p.name || ''));
  C = {
    nV, pal, mat, eye, vcls, skull: sk[0] < Infinity ? sk : null, helmet,
    pos: new THREE.BufferAttribute(pos, 3), si: new THREE.BufferAttribute(si, 4), sw: new THREE.BufferAttribute(sw, 4, true),
    idx: new THREE.BufferAttribute(idx.slice(0, iN), 1), lod: new THREE.BufferAttribute(neutral(F, pos, si, sw, nV), 3),
  };
  F.combos.set(key, C);
  QP.combos++;
  return C;
}

/* череп головы: кожа (без волос) — ширина, середина и макушка, в осях модели; по нему садится шапка */
function skull (P) {
  if (!P) return null;
  if (P.skull !== undefined) return P.skull;
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0;
  for (let i = 0; i < P.nV; i++) {
    if (!SKIN_RE.test(P.pal[P.mat[i]].name)) continue;
    const x = P.pos[i * 3], y = P.pos[i * 3 + 1], z = P.pos[i * 3 + 2];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); n++;
  }
  P.skull = n ? { w: Math.max(x1 - x0, z1 - z0), x: (x0 + x1) / 2, y: y1, z: (z0 + z1) / 2 } : null;
  return P.skull;
}

const lin = new Map(), BOOT = [0.02, 0.018, 0.022];   // сапоги — почти чёрные (линейный цвет)
const col = hex => {
  let c = lin.get(hex);
  if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; lin.set(hex, c); }
  return c;
};

/* ── кость модели без Object3D (23.10.2026, 0п4): у человека ~60 костей (пальцы — по 19 на руку), людей в городе ~180 —
   было 11 тыс. THREE.Bone (~1,9 КБ каждая, ~22 МБ кучи), и сцена каждый кадр пересчитывала их матрицы, даже у тех, кого
   не видно (на «Деке» 2,7 мс из 3,9 мс всего обхода сцены). Теперь кость — место, поворот, масштаб и матрица в мире
   (~0,35 КБ); считает их только poseHook — когда модель в кадре (qBones). Обратные матрицы покоя — общие на семейство.
   Очки и шапка — на «гнезде» головы (sock, дочка меша: спрятан меш — спрятаны и они), его место ставит qBones ── */
const YAX = new THREE.Vector3(0, 1, 0), RQY = new THREE.Quaternion(), BM = new THREE.Matrix4();
class QBone {
  constructor (parent) { this.parent = parent; this.position = new THREE.Vector3(); this.quaternion = new THREE.Quaternion(); this.scale = new THREE.Vector3(1, 1, 1); this.matrixWorld = new THREE.Matrix4(); }
  getWorldPosition (v) { return v.setFromMatrixPosition(this.matrixWorld); }
  rotateY (a) { this.quaternion.multiply(RQY.setFromAxisAngle(YAX, a)); return this; }
}
/* матрицы костей в мире — от корня модели (его матрица — уже в этом кадре) */
function qBones (st) {
  st.root.updateMatrixWorld(true);
  const F = st.F, B = st.bones, RW = st.root.matrixWorld;
  for (const j of F.order) {
    const b = B[j];
    b.matrixWorld.multiplyMatrices(b.parent ? b.parent.matrixWorld : RW, BM.compose(b.position, b.quaternion, b.scale));
  }
  if (st.sock && F.J.head >= 0) {                   // гнездо головы: место головы в осях корня (меш — в начале корня)
    st.sock.matrix.copy(IM.copy(RW).invert()).multiply(B[F.J.head].matrixWorld);
    st.sock.updateMatrixWorld(true);
  }
}
/* обратные матрицы покоя (кости в осях модели, корень без масштаба) — одни на семейство */
function restInv (F) {
  if (!F.inv) {
    const W = [];
    for (const j of F.order) { const m = new THREE.Matrix4().compose(F.LP[j], F.LQ[j], ONE3); W[j] = F.parent[j] < 0 ? m : m.premultiply(W[F.parent[j]]); }
    F.headM = F.J.head >= 0 ? W[F.J.head].clone() : null;
    F.inv = W.map(m => m.clone().invert());
  }
  return F.inv;
}

/* надеть модель: в группу человека g (кости игры уже в ней) — корень модели со скелетом, меш и дальний меш */
export function buildQ (g, q, S, Lk, mat, dressed = false) {
  if (!dressed) q = dress(q, S, Lk);
  const F = family(q.fam), C = combo(F, q);
  const bones = new Array(F.nJ);
  for (const j of F.order) {                       // родитель — раньше ребёнка
    const b = new QBone(F.parent[j] < 0 ? null : bones[F.parent[j]]);
    b.position.copy(F.LP[j]); b.quaternion.copy(F.LQ[j]);
    bones[j] = b;
  }
  const root = new THREE.Group();
  // цвета человека игры
  const want = { skin: S.skin, shirt: S.shirt, pants: S.pants, hair: Lk.hairC, hat: HATS[(Lk.seed >>> 5) % HATS.length] };
  const pc = C.pal.map(p => p.role && want[p.role] ? col(want[p.role]) : p.rgb);
  const lvl = S.lvl || 0, sl = col(S.shirt || '#555'), pl = col(S.pants || '#333');   // 0 лето … 3 зима (people.js wearOf)
  const cl = new Float32Array(C.nV * 3);
  for (let i = 0; i < C.nV; i++) {
    let c = pc[C.mat[i]];
    if (lvl && C.pal[C.mat[i]].role === 'skin') {
      const k = C.vcls[i];
      if (k === 1 || (k === 5 && lvl >= 2)) c = sl; else if (k === 2 && lvl >= 2) c = pl; else if (k === 6 && lvl >= 2) c = BOOT;
    }
    cl[i * 3] = c[0]; cl[i * 3 + 1] = c[1]; cl[i * 3 + 2] = c[2];
  }
  const ca = new THREE.BufferAttribute(cl, 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', C.pos); geo.setAttribute('color', ca);
  geo.setAttribute('skinIndex', C.si); geo.setAttribute('skinWeight', C.sw);
  geo.setIndex(C.idx);
  const skin = new THREE.SkinnedMesh(geo, mat);
  root.add(skin);
  const skel = new THREE.Skeleton(bones, restInv(F));   // обратные покоя — общие на семейство (кости в покое — в осях модели, как вершины)
  skin.bind(skel, new THREE.Matrix4());
  skin.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, F.h * 0.5 + F.y0, 0), F.h * 0.8);
  // очки (если они есть во внешности человека игры) и шапка зимой (ушанка / вязаная, если на голове не каска и не корона) —
  // на гнездо головы (qBones); нет шапки из Blender — простая
  const wantHat = lvl >= 3 && !q.hat && C.skull && !C.helmet && F.J.head >= 0 && /ushanka|beanie|hood|hat/.test(S.hw || '');
  const wantGl = Lk.glasses && Lk.glasses !== 'none' && C.eye && F.J.head >= 0 && C.eye.lengthSq() > 0;   // 'none' — без очков (было: очки у всех)
  let sock = null;
  if (wantHat || wantGl) {
    sock = new THREE.Group();
    sock.matrixAutoUpdate = false; sock.matrix.copy(F.headM);   // до первой позы — голова в покое
    skin.add(sock);
    if (wantGl) sock.add(glasses(F, C.eye, Lk));
    if (wantHat) sock.add(hat(F, C.skull, S, Lk));
  }
  // дальний вариант (humanLod, дальше 45 м): та же модель одним мешем — стоит, руки опущены
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', C.lod); lg.setAttribute('color', ca); lg.setIndex(C.idx);
  const lod = new THREE.Mesh(lg, mat);
  lod.visible = false;
  root.add(lod);
  // места, кости и индексы — общие на всех с этим набором частей: человек ушёл — их из видеокарты не выгружать
  // (иначе у остальных пропадёт меш). Освобождаются только свои цвета: dispose сначала снимает с геометрии общее
  // (было KEEP — ничего: three.js держал геометрию и цвета каждого ушедшего человека в своём кэше, до конца игры)
  lg.dispose = ownDispose;
  geo.dispose = function () { skel.dispose(); ownDispose.call(this); };   // и текстуру костей (её заводит three.js при первом показе)
  const k = (Lk.f ? 1.72 : 1.8) / F.h;              // рост — как у человека игры (дальше × его рост, g.scale)
  root.scale.setScalar(k);
  root.position.y = -F.y0 * k;
  g.add(root);
  const st = { F, C, bones, root, skel, sock, g, k, qd: q, S: { skin: S.skin, shirt: S.shirt, pants: S.pants, lvl: S.lvl, hw: S.hw }, y0: root.position.y, lift: 0, liftT: 0, dq: new Array(F.nJ).fill(null), ang: {},
    frame: -1, nb: 0, nh: 0, nl: 0, lastT: 0, lx: 0, lz: 0, v: 0, swing: 0, w: 0, t: Math.random() * 10, run: 0 };
  skin.userData.q = st;
  skin.onBeforeRender = poseHook;
  QP.built++;
  return { skin, lod };
}

const SHARED = ['position', 'skinIndex', 'skinWeight'];
function ownDispose () {
  for (const n of SHARED) if (this.attributes[n]) this.deleteAttribute(n);
  this.setIndex(null);
  THREE.BufferGeometry.prototype.dispose.call(this);
}

/* шапка по черепу (кожа головы в покое): вязаная с помпоном или ушанка с ушами; в осях кости головы */
const HATS = ['#c9476b', '#2e4a6b', '#e0b13f', '#3f5a3a', '#8a2a3a', '#d9d2c2', '#4f7fd6', '#2b2a30'], FURS = ['#5a4a3a', '#3a3036', '#6b5a48', '#8a7a68'];
const HAT_MAT = new Map();
const hatMat = hex => { let m = HAT_MAT.get(hex); if (!m) { m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); HAT_MAT.set(hex, m); } return m; };
function hat (F, sk, S, Lk) {
  const W = Math.max(sk[3] - sk[0], sk[5] - sk[2]) * 1.25, cx = (sk[0] + sk[3]) / 2, cz = (sk[2] + sk[5]) / 2 - W * 0.04, top = sk[4];
  const g = new THREE.Group(), r = (Lk.seed >>> 5);
  const add = (geo, hex, x, y, z) => { const m = new THREE.Mesh(geo, hatMat(hex)); m.position.set(x, y, z); g.add(m); };
  if (S.hw === 'ushanka') {
    const fur = FURS[r % FURS.length];
    add(new THREE.CylinderGeometry(W * 0.6, W * 0.62, W * 0.42, 8), fur, cx, top - W * 0.05, cz);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(W * 0.12, W * 0.42, W * 0.36), fur, cx + sx * W * 0.55, top - W * 0.38, cz);
    add(new THREE.BoxGeometry(W * 0.9, W * 0.14, W * 0.12), fur, cx, top + W * 0.02, cz + W * 0.55);
  } else {
    const hex = S.hw === 'hood' ? S.shirt : HATS[r % HATS.length];
    add(new THREE.CylinderGeometry(W * 0.5, W * 0.58, W * 0.5, 8), hex, cx, top - W * 0.08, cz);
    if (S.hw !== 'hood') add(new THREE.BoxGeometry(W * 0.2, W * 0.2, W * 0.2), HATS[(r >> 3) % HATS.length], cx, top + W * 0.22, cz);
  }
  const j = F.J.head, iq = F.RQ[j].clone().invert();
  g.quaternion.copy(iq);
  g.position.copy(F.RP[j]).negate().applyQuaternion(iq);
  return g;
}

/* очки: две тёмные рамки и перемычка у глаз, в осях кости головы */
const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x1d1a1f, flatShading: true });
/* 23.10.2026: рамки — одной склейкой на человека (было 9—11 мешей — столько же вызовов отрисовки на каждого в очках);
   вершины — общие на семейство и вид очков (GLASS_ARR), геометрия — своя (dropMesh её освобождает), выглядит так же */
const GLASS_ARR = new Map();
function glassGeo (s, sun) {
  const key = s.toFixed(4) + (sun ? 's' : '');
  let A = GLASS_ARR.get(key);
  if (!A) {
    const P = [], N = [], I = [];
    const add = (w, h, d, x, y, z) => {
      const b = new THREE.BoxGeometry(w * s, h * s, d * s), bp = b.attributes.position, bn = b.attributes.normal, o = P.length / 3;
      for (let i = 0; i < bp.count; i++) { P.push(bp.getX(i) + x * s, bp.getY(i) + y * s, bp.getZ(i) + z * s); N.push(bn.getX(i), bn.getY(i), bn.getZ(i)); }
      for (const k of b.index.array) I.push(k + o);
      b.dispose();
    };
    for (const x of [-0.035, 0.035]) { add(0.05, 0.008, 0.008, x, 0.02, 0); add(0.05, 0.008, 0.008, x, -0.02, 0); add(0.008, 0.045, 0.008, x - 0.025, 0, 0); add(0.008, 0.045, 0.008, x + 0.025, 0, 0); }
    add(0.022, 0.008, 0.008, 0, 0.012, 0);
    if (sun) for (const x of [-0.035, 0.035]) add(0.045, 0.035, 0.004, x, 0, 0.002);
    A = { P: new Float32Array(P), N: new Float32Array(N), I: new Uint16Array(I) };
    GLASS_ARR.set(key, A);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(A.P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(A.N, 3));
  geo.setIndex(new THREE.BufferAttribute(A.I, 1));
  geo.computeBoundingSphere();
  return geo;
}
function glasses (F, eye, Lk) {
  const s = F.h / 1.83, g = new THREE.Group();
  g.add(new THREE.Mesh(glassGeo(s, Lk.glasses === 'sun'), GLASS_MAT));
  const j = F.J.head, iq = F.RQ[j].clone().invert();
  g.quaternion.copy(iq);
  g.position.copy(eye).add(new THREE.Vector3(0, 0, 0.012 * s)).sub(F.RP[j]).applyQuaternion(iq);
  return g;
}

/* ── поза наших костей → мировые повороты и места всех костей модели; bones — и в сами кости ── */
const V2 = new THREE.Vector3(), T = new THREE.Quaternion(), IQ = new THREE.Quaternion(), ID = new THREE.Quaternion(), V = new THREE.Vector3(), CQ = new THREE.Quaternion(), CQ2 = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), FM = new THREE.Matrix4(), IM = new THREE.Matrix4(), ONE3 = new THREE.Vector3(1, 1, 1), SC3 = new THREE.Vector3();
function solve (F, dq, ang, WQ, WP, bones) {
  const J = F.J;
  for (const j of F.order) {
    const p = F.parent[j], Wp = p < 0 ? ID : WQ[p], d = dq[j];
    const b = j === J.kneeL ? 'kneeL' : j === J.kneeR ? 'kneeR' : j === J.elbowL ? 'elbL' : j === J.elbowR ? 'elbR' : null;
    if (d) T.copy(d).multiply(F.FIX[j]).multiply(F.RQ[j]);
    else if (b) T.setFromAxisAngle(AX, ang[b] || 0).multiply(Wp).multiply(F.LQ[j]);
    else T.copy(Wp).multiply(F.LQ[j]);
    WQ[j].copy(T);
    if (p < 0) WP[j].copy(F.LP[j]); else WP[j].copy(F.LP[j]).applyQuaternion(Wp).add(WP[p]);
    if (bones) { bones[j].quaternion.copy(IQ.copy(Wp).invert().multiply(T)); bones[j].position.copy(F.LP[j]); }
  }
  // ступни — за голенью (у Quaternius они дети корня, а не голени)
  for (const Ft of F.FOOT) {
    const p = F.parent[Ft.f], Wp = p < 0 ? ID : WQ[p];
    T.copy(WQ[Ft.k]).multiply(Ft.q);
    V.copy(Ft.p).applyQuaternion(WQ[Ft.k]).add(WP[Ft.k]);
    WQ[Ft.f].copy(T); WP[Ft.f].copy(V);
    if (bones) {
      IQ.copy(Wp).invert();
      bones[Ft.f].quaternion.copy(IQ).multiply(T);
      if (p >= 0) V.sub(WP[p]);
      bones[Ft.f].position.copy(V.applyQuaternion(IQ));
    }
  }
}

/* вершины набора частей в позе «стоит, руки опущены» — для дальнего варианта */
function neutral (F, pos, si, sw, nV) {
  const dq = new Array(F.nJ).fill(null);
  for (const k of ['legL', 'legR', 'armL', 'armR', 'head', 'body']) if (F.J[k] >= 0) dq[F.J[k]] = new THREE.Quaternion();
  const WQ = F.RQ.map(q => q.clone()), WP = F.RP.map(p => p.clone());
  solve(F, dq, { elbL: -0.22, elbR: -0.22 }, WQ, WP, null);
  F.NWP = WP;                                       // где кости в позе «стоит» — для оторванной руки/ноги (qLimb)
  const M = [], A = new THREE.Matrix4(), B = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1);
  for (let j = 0; j < F.nJ; j++) M.push(A.compose(WP[j], WQ[j], ONE).clone().multiply(B.compose(F.RP[j], F.RQ[j], ONE).invert()));
  const out = new Float32Array(nV * 3), t = new THREE.Vector3();
  for (let i = 0; i < nV; i++) {
    let x = 0, y = 0, z = 0;
    for (let c = 0; c < 4; c++) {
      const w = sw[i * 4 + c] / 255;
      if (!w) continue;
      t.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(M[si[i * 4 + c]]);
      x += w * t.x; y += w * t.y; z += w * t.z;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}

/* кадр клипа (fi — дробный номер кадра) — в кости, с весом w поверх того, что в них уже есть */
function clipPose (st, c, fi, loop, w, skip) {
  const F = st.F, D = c.data, nJ = F.nJ, f0 = Math.floor(fi), f1 = loop ? (f0 + 1) % c.nF : Math.min(f0 + 1, c.nF - 1), fr = fi - f0;
  for (let j = 0; j < nJ; j++) {
    if (skip && skip[j]) continue;                 // руки заняты (несёт коробку) — ходьба им не машет
    const o0 = (f0 * nJ + j) * 7, o1 = (f1 * nJ + j) * 7, b = st.bones[j];
    CQ.set(D[o0], D[o0 + 1], D[o0 + 2], D[o0 + 3]); CQ2.set(D[o1], D[o1 + 1], D[o1 + 2], D[o1 + 3]);
    CQ.slerp(CQ2, fr);
    b.quaternion.slerp(CQ, w);
    V.set(D[o0 + 4] + (D[o1 + 4] - D[o0 + 4]) * fr, D[o0 + 5] + (D[o1 + 5] - D[o0 + 5]) * fr, D[o0 + 6] + (D[o1 + 6] - D[o0 + 6]) * fr);
    b.position.lerp(V, w);
  }
}

/* ── коробка с пиццей в руках (game.js pizzaBox — userData.pbox; закрытая, без откинутой крышки — openBox) ──
   Автор 23.10.2026 (0п9): «клиент берёт пиццу — коробка проходит сквозь него». Держит двумя руками перед собой:
   плечи вперёд на ARM, локти согнуты на ELB (предплечья почти горизонтально), чуть внутрь (IN); коробка лежит на кистях
   модели (Y — м над запястьями), не ближе ZMIN м перед осью тела (задний край — перед животом). Ходьба художника рукам
   не машет. Так держат все: клиент у двери, на лавочке, по дороге домой, в катсценах */
export const CARRY = { ARM: -0.5, ELB: -1.0, IN: 0.1, Y: 0.035, ZMIN: 0.47 };
const CQL = new THREE.Quaternion().setFromEuler(new THREE.Euler(CARRY.ARM, 0, CARRY.IN)), CQR = new THREE.Quaternion().setFromEuler(new THREE.Euler(CARRY.ARM, 0, -CARRY.IN));
function carriedBox (st) {
  const g = st.g;
  if (g.children.length !== st.nc || (st.box && st.box.parent !== g)) { st.nc = g.children.length; st.box = null; for (const c of g.children) if (c.userData && c.userData.pbox) { st.box = c; break; } }
  const b = st.box;
  return b && b.parent === g && b.visible && b.children.length <= 2 ? b : null;
}
function armMask (F) {
  if (!F.armMask) { const cls = classes(F); F.armMask = new Uint8Array(F.nJ); for (let j = 0; j < F.nJ; j++) if (cls[j] === 1 || cls[j] === 3) F.armMask[j] = 1; }
  return F.armMask;
}

/* ── каждый кадр, когда модель в кадре ── */
let FRAME = 0, LAST = 0;
function poseHook () {
  const now = performance.now();
  if (now !== LAST) { LAST = now; FRAME++; }
  const st = this.userData.q;
  if (!st || st.frame === FRAME) return;
  st.frame = FRAME;
  const u = st.g.userData, F = st.F, J = F.J;
  if (!u.legL) return;
  // коробки, которые игра вешает на кости туловища и головы человека (форма, юбки, маски, шапки), сшиты под коробочное
  // тело — на модели они висели бы квадратами: прячем (предметы в руках остаются)
  const bd = u.parts && u.parts[2], hd = u.head;
  if (bd && bd.children.length !== st.nb) { for (const c of bd.children) if (!c.isSprite) c.visible = false; st.nb = bd.children.length; }
  if (hd && hd.children.length !== st.nh) { for (const c of hd.children) if (!c.isSprite) c.visible = false; st.nh = hd.children.length; }
  // и на ногах (юбки, шорты-коробки у ночной жизни и костюмов — на модели висели «раздутыми квадратами» у бёдер)
  const nl = u.legL.children.length + u.legR.children.length;
  if (nl !== st.nl) { for (const c of [...u.legL.children, ...u.legR.children]) if (!c.isSprite) c.visible = false; st.nl = nl; }
  const dt = st.lastT ? Math.min(0.1, (now - st.lastT) / 1000) : 0;
  st.lastT = now;
  // скорость: где группа человека в мире сейчас и кадр назад
  const e = st.g.matrixWorld.elements, x = e[12], z = e[14];
  if (dt > 0) st.v += (Math.min(Math.hypot(x - st.lx, z - st.lz) / dt, 20) - st.v) * Math.min(1, dt * 8);
  st.lx = x; st.lz = z;
  if (u.qV != null) st.v = u.qV;                   // скорость задана игрой (подъезд, minigames/stairs3d.js: бег по пролёту быстрее 7 м/с по ровному)
  // игра машет ему ногами (идёт), а не стоит / сидит / лежит / едет в машине
  st.swing = Math.max(st.swing * Math.exp(-dt * 3), Math.abs(u.legL.rotation.x), Math.abs(u.legR.rotation.x));
  const sitting = u.legL.rotation.x < -0.8 && u.legR.rotation.x < -0.8;
  const walking = !st.noWalk && st.v > 0.25 && st.v < 7 && st.swing > 0.08 && !sitting && Math.abs(st.g.rotation.x) < 0.3 && Math.abs(st.g.rotation.z) < 0.3;
  st.w += ((walking ? 1 : 0) - st.w) * Math.min(1, dt * 6);
  // наши кости → кости модели
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
  const box = !u.qAnim && !st.noWalk ? carriedBox(st) : null;   // несёт коробку: руки вперёд, коробка — на кистях (CARRY)
  if (box) { if (J.armL >= 0) dq[J.armL] = CQL; if (J.armR >= 0) dq[J.armR] = CQR; a.elbL = a.elbR = CARRY.ELB; }
  if (!F.WQ) { F.WQ = F.RQ.map(x => x.clone()); F.WP = F.RP.map(x => x.clone()); }   // повороты и места в мире — черновик на семейство (нужны только внутри solve)
  solve(F, dq, a, F.WQ, F.WP, st.bones);
  // анимация художника, которую задаёт игра (hits.js fallStep: падает навзничь, лежит, встаёт, грозит кулаком;
  // carried.js: наклон «Interact» — поднять с земли то, что выронил)
  const an = u.qAnim, ac = an && F.clips[an.c];
  if (ac) {
    clipPose(st, ac, Math.max(0, Math.min(1, an.f)) * (ac.nF - 1), false, 1);
    // наклон поверх клипа (carried.js: «Interact» тянется рукой вперёд — а вещь на земле): туловище вперёд на bend рад
    // вокруг оси x группы, с ним грудь, руки и голова
    if (an.bend && J.body >= 0) {
      const b = st.bones[J.body];
      CQ.identity();
      for (let o = b.parent; o && o !== st.root; o = o.parent) CQ.premultiply(o.quaternion);
      V.copy(AX).applyQuaternion(CQ.invert());
      b.quaternion.premultiply(CQ2.setFromAxisAngle(V, an.bend));
    }
    // ступни у Quaternius — цели ног, в этих клипах не следуют за ногой: пристегнуть к голени, как в покое
    qBones(st);
    for (const Ft of F.FOOT) {
      const fb = st.bones[Ft.f], kb = st.bones[Ft.k];
      FM.compose(Ft.p, Ft.q, ONE3).premultiply(kb.matrixWorld).premultiply(IM.copy(fb.parent ? fb.parent.matrixWorld : st.root.matrixWorld).invert());
      FM.decompose(fb.position, fb.quaternion, SC3);
    }
  }
  // ходьба / бег художника, шаг в такт скорости: ступня на земле — назад со скоростью человека
  else if (st.w > 0.01 && F.clips.walk) {
    const sc = st.k * (st.g.scale.x || 1);                 // единицы модели → метры мира
    st.run += ((st.v > 2.4 && F.clips.run ? 1 : 0) - st.run) * Math.min(1, dt * 5);
    // бег вбок лицом к машине (peddodge.js: u.qSide 1 — влево, −1 — вправо), если у семейства есть клип; нет — обычный бег
    const sd = u.qSide && st.v > 1 ? (u.qSide > 0 ? F.clips.runl : F.clips.runr) : null;
    const c = sd || (st.run > 0.5 ? F.clips.run : F.clips.walk);
    st.t += dt * st.v / (c.speed * sc);
    clipPose(st, c, ((st.t / c.T) % 1) * c.nF, true, st.w, box || u.qArms ? armMask(F) : null);   // qArms — руки заняты (митингующий держит плакат, protests.js): ходьба им не машет
    // голова — куда смотрит игра (на машину, на собеседника)
    if (J.head >= 0 && u.head.rotation.y) st.bones[J.head].rotateY(u.head.rotation.y * st.w);
    QP.walk++;
  }
  // подошва — на видимый слой (асфальт, плитка, тротуар): игра ставит людей на рельеф, а слой выше на 6—7 см —
  // тонкие подошвы модели в нём тонули (у коробочных людей толстый «ботинок» это прятал). Раз в 0,2 с — высота слоя
  if (QP.topAt && !st.noWalk) {
    if (now - st.liftT > 200) { st.liftT = now; const top = QP.topAt(x, z); st.want = Math.max(0, Math.min(0.15, top - e[13])); }
    st.lift += ((st.want || 0) - st.lift) * Math.min(1, dt * 10);
  }
  // сидит (обе ноги вперёд): игра сажает по тазу коробочного человека (0,7 над подошвой), у модели таз выше — опустить
  const sit = Math.max(0, Math.min(1, (-Math.max(u.legL.rotation.x, u.legR.rotation.x) - 0.8) / 0.5));
  if (st.hip === undefined) st.hip = J.legL >= 0 ? (F.RP[J.legL].y - F.y0) * st.k - 0.7 : 0;
  st.root.position.y = st.y0 + (st.noWalk ? 0 : st.lift / (st.g.scale.y || 1)) - sit * st.hip;
  qBones(st);                                       // поза — в этот же кадр, без запаздывания
  st.skel.update();
  // вещи в руках (бутылка, лопата, портфель) висят на наших руках-костях: кисть коробочного человека — в 0,58 под
  // плечом, у модели кисть ниже и дальше. Сдвигаем нашу «руку» так, чтобы её кисть была в кисти модели
  for (const [arm, h] of [[u.armL, J.handL], [u.armR, J.handR]]) {
    if (h < 0 || !arm.children.length) continue;
    st.bones[h].getWorldPosition(V); st.g.worldToLocal(V);
    arm.position.copy(V).sub(V2.set(0, -0.58, 0).applyQuaternion(arm.quaternion));
  }
  // коробка — на кистях: между запястьями, дном на них, перед животом
  if (box && J.handL >= 0 && J.handR >= 0) {
    st.bones[J.handL].getWorldPosition(V); st.g.worldToLocal(V);
    st.bones[J.handR].getWorldPosition(V2); st.g.worldToLocal(V2);
    box.position.set((V.x + V2.x) / 2, (V.y + V2.y) / 2 + 0.11 * box.scale.y + CARRY.Y, Math.max((V.z + V2.z) / 2 + 0.03, CARRY.ZMIN));
    box.rotation.set(0, 0, 0);
    QP.carry++;
  }
  QP.posed++;
}

/* есть ли у модели человека клип художника (peddodge.js: 'roll', 'runl'; carried.js: 'interact') */
export function qHas (grp, c) {
  const u = grp && grp.userData, st = u && u.skin && u.skin.userData.q;
  return !!(st && st.F.clips[c]);
}

/* ── тело сбитого (hits.js throwBody): вместо шести коробок — та же модель, что у человека; куски тела hits.js
   (ноги, туловище, руки, голова — пустые шарниры в тех же местах) крутят её кости, как кости человека ── */
export function corpseQ (gu, mat, grp) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const mk = (x, y) => { const o = new THREE.Group(); o.position.set(x, y, 0); root.add(o); return o; };
  const parts = { legL: mk(-0.12, -0.25), legR: mk(0.12, -0.25), torso: mk(0, 0.05), armL: mk(-0.3, 0.57), armR: mk(0.3, 0.57), head: mk(0, 0.63) };
  const holder = new THREE.Group();
  holder.position.y = -0.95;                        // таз тела hits.js — на 0,95 над землёй, ступни модели — на земле
  holder.userData = { legL: parts.legL, legR: parts.legR, armL: parts.armL, armR: parts.armR, head: parts.head, parts: [null, null, parts.torso] };
  root.add(holder);
  const c = gu.colors || {}, was = gu.skin && gu.skin.userData.q;   // тот же человек: те же части (одет по сезону) и цвета
  const { skin } = was ? buildQ(holder, was.qd, was.S, gu.look, mat, true) : buildQ(holder, gu.q, { skin: c.skin, shirt: c.shirt, pants: c.pants }, gu.look, mat);
  skin.userData.q.noWalk = true;                    // тело не «шагает», даже когда скользит по земле
  // автор 23.10.2026 (0аз): «сбил человека в чёрном — улетает в белом». Тот же человек в той же одежде:
  // цвета вершин — с живого (та же сборка — те же вершины; перекрашенная голова — маска, злое лицо — тоже)
  const lc = gu.skin && gu.skin.geometry && gu.skin.geometry.attributes.color, nc = skin.geometry.attributes.color;
  if (was && lc && lc.array.length === nc.array.length) { nc.array.set(lc.array); nc.needsUpdate = true; }
  // и то, что игра надела прямо на группу человека поверх модели (шуба и воротник, галстук и цепь богача…) — копией на тело
  if (grp) for (const o of grp.children) if (isDecor(o, gu, was)) { const k = o.clone(); k.visible = true; k.userData = {}; holder.add(k); }
  return { root, parts, qskin: skin };
}
/* надетое на группу человека поверх модели (hits.js fallStep прячет, пока он лежит: группа стоит, модель лежит клипом) */
export function decorOf (grp) {
  const gu = grp && grp.userData, st = gu && gu.skin && gu.skin.userData.q;
  return gu ? grp.children.filter(o => isDecor(o, gu, st)) : [];
}
/* надето на группу человека (не кость, не модель, не коробка с пиццей, не надпись над головой) — на тело тоже */
function isDecor (o, gu, st) {
  if (o.isBone || o.isSprite || (!o.visible && !(o.userData && o.userData.fallHid)) || (st && o === st.root) || o === gu.lod || (o.userData && (o.userData.pbox || o.userData.noDecor))) return false;
  let mesh = false, model = false;
  o.traverse(m => { if (m.isSkinnedMesh || m.isBone) model = true; else if (m.isMesh) mesh = true; });
  return mesh && !model;
}
/* позу модели — сейчас, не дожидаясь кадра (тело кладут на землю по самой низкой точке — и за кадром тоже) */
export function qPose (skin) {
  const st = skin && skin.userData.q;
  if (!st) return;
  st.frame = -1;
  poseHook.call(skin);
}
/* оторвать руку/ногу у тела-модели: кость сложить (не видно), а кусок — отдельным мешем в позе «висит», с места
   сустава; вешается на кусок hits.js, который улетает */
export function qLimb (skin, key) {
  const st = skin.userData.q, F = st && st.F, C = st && st.C;
  if (!F || !F.NWP) return null;
  const J = F.J, top = J[key], foot = key === 'legL' ? J.footL : key === 'legR' ? J.footR : -1;
  if (top < 0) return null;
  const set = new Set([top]);
  if (foot >= 0) set.add(foot);
  for (const j of F.order) if (set.has(F.parent[j])) set.add(j);
  for (const j of [top, foot]) if (j >= 0) st.bones[j].scale.setScalar(0.001);
  const P = C.lod.array, si = C.si.array, sw = C.sw.array, I = C.idx.array, col = skin.geometry.attributes.color.array;
  const mine = v => { let b = 0, bj = 0; for (let c = 0; c < 4; c++) if (sw[v * 4 + c] > b) { b = sw[v * 4 + c]; bj = si[v * 4 + c]; } return set.has(bj); };
  const map = new Map(), pos = [], cl = [], idx = [], o = F.NWP[top];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!mine(a) || !mine(b) || !mine(c)) continue;
    for (const v of [a, b, c]) {
      let n = map.get(v);
      if (n === undefined) { n = pos.length / 3; map.set(v, n); pos.push(P[v * 3] - o.x, P[v * 3 + 1] - o.y, P[v * 3 + 2] - o.z); cl.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]); }
      idx.push(n);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, skin.material);
  m.scale.setScalar(st.k);
  return m;
}

/* ── на куски (hits.js burst, нитро быстрее 55 км/ч; автор 23.10.2026, 0п21: «разлетается кусками старой коробочной
   модели»): та же модель, что у человека, — голова, туловище, руки, ноги, в позе «стоит», цвета — его (с живого меша);
   у каждого куска — места разрезов (шея, плечи, бёдра), вершины ближе BLOOD_R м к разрезу — цвета крови (blood — hex,
   только взрослая решает в hits.js). Кусок — обычный меш (общий материал людей), начало — середина куска ── */
const BLOOD_R = 0.09;
export function qPieces (skin, blood) {
  const st = skin && skin.userData.q, F = st && st.F, C = st && st.C;
  if (!F || !F.NWP || !skin.geometry.attributes.color) return null;
  const J = F.J, own = new Int8Array(F.nJ).fill(1);   // 0 голова, 1 туловище, 2—3 руки, 4—5 ноги
  const TOPS = [[J.head, -1, 0], [J.armL, -1, 2], [J.armR, -1, 3], [J.legL, J.footL, 4], [J.legR, J.footR, 5]];
  for (const [top, foot, k] of TOPS) {
    if (top < 0) continue;
    const set = new Set([top]); if (foot >= 0) set.add(foot);
    for (const j of F.order) if (set.has(F.parent[j])) set.add(j);
    for (const j of set) own[j] = k;
  }
  const P = C.lod.array, si = C.si.array, sw = C.sw.array, I = C.idx.array, vc = skin.geometry.attributes.color.array;
  const nV = C.nV, vp = new Int8Array(nV);
  for (let v = 0; v < nV; v++) { let b = 0, bj = 0; for (let c = 0; c < 4; c++) if (sw[v * 4 + c] > b) { b = sw[v * 4 + c]; bj = si[v * 4 + c]; } vp[v] = own[bj]; }
  const cutOf = k => { const j = [J.head, J.body, J.armL, J.armR, J.legL, J.legR][k]; return j >= 0 ? F.NWP[j] : null; };
  const cuts = [[cutOf(0)], [cutOf(0), cutOf(2), cutOf(3), cutOf(4), cutOf(5)], [cutOf(2)], [cutOf(3)], [cutOf(4)], [cutOf(5)]].map(l => l.filter(Boolean));
  const bc = blood ? col(blood) : null, R = BLOOD_R / st.k, out = [];
  for (let k = 0; k < 6; k++) {
    const map = new Map(), pos = [], cl = [], idx = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const pa = vp[a], tk = pa === vp[b] || pa === vp[c] ? pa : vp[b] === vp[c] ? vp[b] : pa;   // по большинству вершин — без дыр
      if (tk !== k) continue;
      for (const v of [a, b, c]) {
        let n = map.get(v);
        if (n === undefined) {
          n = pos.length / 3; map.set(v, n);
          const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
          pos.push(x, y, z);
          const red = bc && cuts[k].some(q => (q.x - x) ** 2 + (q.y - y) ** 2 + (q.z - z) ** 2 < R * R);
          if (red) cl.push(bc[0], bc[1], bc[2]); else cl.push(vc[v * 3], vc[v * 3 + 1], vc[v * 3 + 2]);
        }
        idx.push(n);
      }
    }
    if (!idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    g.setIndex(idx);
    g.computeBoundingBox();
    const c = new THREE.Vector3(); g.boundingBox.getCenter(c);
    g.translate(-c.x, -c.y, -c.z);                  // начало — середина куска: кувыркается вокруг себя
    const m = new THREE.Mesh(g, skin.material);
    m.scale.setScalar(st.k);
    out.push({ key: ['head', 'torso', 'armL', 'armR', 'legL', 'legR'][k], m, x: c.x * st.k, y: (c.y - F.y0) * st.k, z: c.z * st.k });
  }
  return out;
}

/* ── портрет для окон разговора, карточки заказа и чата (people.js faceDataURL): у человека-модели — снимок её
   головы (свой маленький рендер, 48 точек, увеличен без сглаживания — крупный пиксель, как у портретов игры),
   фон — пастельный по зерну; один на человека и размер (настроение и рот не меняются) ── */
const PCACHE = new Map(), PASTEL = ['#f6d6c8', '#d8e8f6', '#e2f2d4', '#f4e6bc', '#ead8f2', '#d4f0ec', '#f6dce6'];
let PR = null;
export function qPortrait (Lk, spec, size, id) {
  const q = pickQ(Lk);
  if (!q || typeof document === 'undefined') return null;
  const key = id + ':' + size;
  let url = PCACHE.get(key);
  if (url) return url;
  if (!PR) {
    const r = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(48, 48, false);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xeaf7ff, 0xb6c8a6, 1.7));
    const sun = new THREE.DirectionalLight(0xfff6e4, 1.45); sun.position.set(-2, 3, 4); sc.add(sun);
    sc.add(new THREE.AmbientLight(0xdfeaff, 0.5));
    PR = { r, sc, cam: new THREE.PerspectiveCamera(22, 1, 0.05, 20), mat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) };
  }
  const S = spec(), g = new THREE.Group(), o = () => new THREE.Object3D();
  g.userData = { legL: o(), legR: o(), armL: o(), armR: o(), head: o(), parts: [null, null, o()] };
  const { skin } = buildQ(g, q, S, Lk, PR.mat);
  PR.sc.add(g);
  g.updateMatrixWorld(true);
  poseHook.call(skin);                              // руки опущены, голова прямо
  const st = skin.userData.q, e = st.C.eye && st.C.eye.lengthSq() ? st.C.eye : st.F.RP[st.F.J.head];
  const hx = e.x * st.k, hy = (e.y - st.F.y0) * st.k, hz = e.z * st.k;
  PR.cam.position.set(hx + 0.2, hy + 0.06, hz + 1.4); PR.cam.lookAt(hx, hy - 0.03, hz);
  PR.r.setClearColor(PASTEL[(Lk.seed >>> 3) % PASTEL.length], 1);
  PR.r.render(PR.sc, PR.cam);
  PR.sc.remove(g);
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); });   // свои цвета, кости, очки — вон (общее у людей остаётся)
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(PR.r.domElement, 0, 0, size, size);
  // снимок не вышел (контекст рендера портретов потерян — память видеокарты, телефон; холст пустой): угол — не пастельный
  // фон, а чёрный / прозрачный. Тогда — обычный портрет игры (people.js), не чёрный квадрат; не в кэш — в другой раз снимет
  const k0 = x.getImageData(0, 0, 1, 1).data;
  if (PR.r.getContext().isContextLost() || k0[3] < 200 || k0[0] + k0[1] + k0[2] < 300) { QP.fails = (QP.fails || 0) + 1; return null; }
  url = c.toDataURL();
  PCACHE.set(key, url);
  return url;
}

/* отладка (tools/probe-checks/qcatalog.js): человек из заданных частей в цветах художника — лист всей одежды */
QP.families = () => ['M', 'F', 'A'].map(f => ({ fam: f, models: family(f).models.map(m => m.name) }));
QP.make = (spec, lvl = 0, hw = '') => {
  const g = new THREE.Group(), o = () => new THREE.Object3D();
  g.userData = { legL: o(), legR: o(), armL: o(), armR: o(), head: o(), parts: [null, null, o()] };
  QP.mat = QP.mat || new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  buildQ(g, spec, { lvl, hw }, { seed: 7, f: spec.fam !== 'M' }, QP.mat);
  return g;
};
