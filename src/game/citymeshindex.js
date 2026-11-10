export const IXS = { n: 0, u: 0, cells: 0, plain: 0, ms: 0 };   // вершин было / стало, клеток с индексом / без, мс — для отладки (__dlv.IXS)
/* F — кусок «спереди» клетки ({ pos, col, n, ix, ixn } или null): по порядку, не сливается; его индекс — свой (block) или
   треугольники подряд. MP, MC, nm — основное (позиции, байты цвета, вершин). noMerge — не сливать и основное (индекс по порядку:
   клетка с куском block при ?nolix). Рабочие массивы — общие на все клетки (IXB, растут по нужде; ixFree — отпустить), иначе
   каждая клетка оставляла бы сборщику мусора ~30 байт на вершину — пик памяти поздней сборки на телефоне */
let IXB = null;
function ixBuf (N, CS) {
  if (!IXB || IXB.n < N) {
    let n = 1 << 12; while (n < N) n <<= 1;
    IXB = { n, tab: new Int32Array(n * 2), oP: new Float32Array(n * 3), oC: new Uint8Array(n * 4), I: new Uint32Array(n * 2) };
    IXB.oU = new Uint32Array(IXB.oP.buffer); IXB.oCU = new Uint32Array(IXB.oC.buffer);
  }
  return IXB;
}
export function ixFree () { IXB = null; }
export function ixCell (F, MP, MC, nm, CS, noMerge, MB, CSm = CS) {   // CSm — байт цвета в основном (MC): 3 — признак 0
  const t0 = performance.now();
  let mv = 0, mi = 0;                             // куски blockM: вершин, индекса
  if (MB) for (const q of MB) { mv += q.pos.length / 3; mi += q.idx.length; }
  const BL = F && F.blocks && F.blocks.length ? F.blocks : null;   // куски block ссылками (Mesher block)
  const nf = F ? F.n : 0, fi = F && !BL && F.ix ? F.ix.subarray(0, F.ixn) : null, N = nf + nm + mv;
  let fl = fi ? fi.length : 0;
  if (BL) for (const q of BL) fl += q.idx.length;
  const own = !!fi || !!BL || !!MB;               // у куска спереди свой индекс; куски blockM — только с индексом (их признак)
  if (N < 64 && !own) return null;
  const mo = fi || BL ? fl : nf;                 // индекс куска спереди: свой — fl, иначе треугольники подряд — nf
  const W = ixBuf(Math.max(N, mo + nm + mi), CS);
  const PU = new Uint32Array(MP.buffer, MP.byteOffset, nm * 3);
  const CU = CSm === 4 && MC.byteOffset % 4 === 0 ? new Uint32Array(MC.buffer, MC.byteOffset, nm) : null;
  let size = 64; while (size < (nm + mv) * 2) size <<= 1;
  const mask = size - 1, tab = W.tab.subarray(0, size).fill(-1);
  const oP = W.oP, oU = W.oU, oC = W.oC, oCU = CS === 4 ? W.oCU : null, I = W.I;
  // спереди — как есть, в начало; индекс — свой или треугольники подряд
  if (BL) {
    let k = 0;
    for (const q of BL) {
      oP.set(q.pos, q.v0 * 3); q.fill(oC, q.v0 * CS);
      const ix = q.idx, v0 = q.v0;
      for (let i = 0; i < ix.length; i++) I[k++] = ix[i] + v0;
    }
  } else {
    if (nf) { oP.set(F.pos.subarray(0, nf * 3)); oC.set(F.col.subarray(0, nf * CS)); }
    if (fi) I.set(fi); else for (let v = 0; v < nf; v++) I[v] = v;
  }
  let u = nf;
  for (let v = 0; v < nm; v++) {
    const x = PU[v * 3], y = PU[v * 3 + 1], z = PU[v * 3 + 2];
    const c = CU ? CU[v] : CSm === 4 ? (MC[v * 4] | (MC[v * 4 + 1] << 8) | (MC[v * 4 + 2] << 16) | (MC[v * 4 + 3] << 24)) >>> 0 : MC[v * 3] | (MC[v * 3 + 1] << 8) | (MC[v * 3 + 2] << 16);
    let w = -1;
    if (!noMerge) {
      let h = Math.imul(x, 0x9E3779B1) ^ Math.imul(y ^ 0x5bd1e995, 0x85EBCA6B) ^ Math.imul(z, 0xC2B2AE35) ^ Math.imul(c, 0x27D4EB2F);
      h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12;
      let s = h & mask;
      for (;;) {
        const e = tab[s];
        if (e < 0) { tab[s] = u; break; }
        if (oU[e * 3] === x && oU[e * 3 + 1] === y && oU[e * 3 + 2] === z && (oCU ? oCU[e] === c : (oC[e * 3] | (oC[e * 3 + 1] << 8) | (oC[e * 3 + 2] << 16)) === c)) { w = e; break; }
        s = (s + 1) & mask;
      }
    }
    if (w < 0) {
      w = u++;
      oU[w * 3] = x; oU[w * 3 + 1] = y; oU[w * 3 + 2] = z;
      if (oCU) oCU[w] = c; else { oC[w * 3] = c & 255; oC[w * 3 + 1] = (c >> 8) & 255; oC[w * 3 + 2] = (c >> 16) & 255; }
    }
    I[mo + v] = w;
  }
  if (MB) {                                       // куски blockM: свои вершины — через ту же таблицу, индекс — через их номера
    let k = mo + nm;
    const R = W.R && W.R.length >= 1024 ? W.R : (W.R = new Int32Array(1 << 16));
    for (const q of MB) {
      const p = q.pos, nv = p.length / 3, qi = q.idx, qc = q.col, fl = q.fl, Rq = nv <= R.length ? R : (W.R = new Int32Array(nv * 2));
      const QU = new Uint32Array(p.buffer, p.byteOffset, nv * 3);
      const rgb = q.rgb, r0 = rgb >> 16, g0 = (rgb >> 8) & 255, b0 = rgb & 255;
      for (let v = 0; v < nv; v++) {
        const x = QU[v * 3], y = QU[v * 3 + 1], z = QU[v * 3 + 2];
        const r = qc ? Math.round(qc[v * 3] * 255) : r0, g = qc ? Math.round(qc[v * 3 + 1] * 255) : g0, b = qc ? Math.round(qc[v * 3 + 2] * 255) : b0;
        const c = CS === 4 ? (r | (g << 8) | (b << 16) | (fl << 24)) >>> 0 : r | (g << 8) | (b << 16);
        let w = -1;
        if (!noMerge) {
          let h = Math.imul(x, 0x9E3779B1) ^ Math.imul(y ^ 0x5bd1e995, 0x85EBCA6B) ^ Math.imul(z, 0xC2B2AE35) ^ Math.imul(c, 0x27D4EB2F);
          h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12;
          let s = h & mask;
          for (;;) {
            const e = tab[s];
            if (e < 0) { tab[s] = u; break; }
            if (oU[e * 3] === x && oU[e * 3 + 1] === y && oU[e * 3 + 2] === z && (oCU ? oCU[e] === c : (oC[e * 3] | (oC[e * 3 + 1] << 8) | (oC[e * 3 + 2] << 16)) === c)) { w = e; break; }
            s = (s + 1) & mask;
          }
        }
        if (w < 0) {
          w = u++;
          oU[w * 3] = x; oU[w * 3 + 1] = y; oU[w * 3 + 2] = z;
          if (oCU) oCU[w] = c; else { oC[w * 3] = r; oC[w * 3 + 1] = g; oC[w * 3 + 2] = b; }
        }
        Rq[v] = w;
      }
      for (let i = 0; i < qi.length; i++) I[k++] = Rq[qi[i]];
    }
  }
  const ib = u <= 65535 ? 2 : 4;
  IXS.ms += performance.now() - t0;
  const NT = nf + nm + mi;                        // вершин было бы без индекса (куски blockM — треугольниками)
  if (!own && (NT - u) * (12 + CS) <= (mo + nm + mi) * ib * 1.1) { IXS.plain++; IXS.n += NT; IXS.u += NT; return null; }   // выгоды нет
  IXS.cells++; IXS.n += NT; IXS.u += u;
  // mo — с какого места индекса основное (до него — кусок спереди), fi — у куска спереди свой индекс
  const ii = I.subarray(0, mo + nm + mi);
  return { p: oP.slice(0, u * 3), c: oC.slice(0, u * CS), i: ib === 2 ? Uint16Array.from(ii) : ii.slice(), mo, fi: !!(fi || BL) };
}
