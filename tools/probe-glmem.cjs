/* probe --mem: сколько видеопамяти занято — обёртки WebGL до загрузки страницы (docs/AGENTS.md «Память на телефоне»).

   three.js сам знает только счёт (renderer.info.memory: геометрий, текстур), а не байты. Здесь — байты: каждая
   загрузка буфера (bufferData), текстуры (texImage2D / texStorage2D / …, мипмапы), буфера отрисовки (renderbufferStorage)
   прибавляет свой размер к объекту WebGL, удаление — вычитает. Кадр холста (цвет + глубина, ×4 при сглаживании) —
   отдельно, по размеру холста. window.__glmem.get() → { buf, tex, rb, fb, total } в МБ и счётчики; .top(n) — самые
   большие текстуры [ш, в, МБ]. Это прикидка снизу: драйвер выравнивает и держит свои копии, но рост и разница
   «до/после» видны точно. */
const GLMEM = `(() => {
  if (window.__glmem) return;
  const MB = 1048576;
  const S = new WeakMap();                    // объект WebGL → { b: байт, k: 'buf' | 'tex' | 'rb', parts: { уровень: байт } }
  const M = { buf: 0, tex: 0, rb: 0, nb: 0, nt: 0, nr: 0, peak: 0, ctx: [] };
  const TEX = new Set(), BUF = new Set();     // живые текстуры и буферы (для top и «копий в JS») — удаление их выкидывает
  const BPP = { 0x8058: 4, 0x8C43: 4, 0x8051: 4, 0x8C41: 4, 0x8229: 1, 0x822B: 2, 0x881A: 8, 0x8814: 16, 0x822E: 4, 0x8230: 8, 0x881B: 8, 0x8815: 16,
    0x822D: 2, 0x822F: 4, 0x81A6: 4, 0x88F0: 4, 0x81A5: 2, 0x8CAC: 4, 0x8CAD: 8, 0x1908: 4, 0x1907: 4, 0x1909: 1, 0x190A: 2, 0x1906: 1, 0x1902: 4, 0x84F9: 4, 0x8D48: 1,
    0x8D62: 2, 0x8056: 2, 0x8057: 2, 0x8059: 4, 0x8C3A: 4, 0x8C3D: 4, 0x8D7C: 4, 0x8D70: 16, 0x8D76: 8 };
  const bpp = (f, type) => { let b = BPP[f] || 4; if (type === 0x1406 && (f === 0x1908 || f === 0x1907)) b = 16; else if ((type === 0x140B || type === 0x8D61) && (f === 0x1908 || f === 0x1907)) b = 8; return b; };
  const total = () => M.buf + M.tex + M.rb;
  const peak = () => { const t = total(); if (t > M.peak) M.peak = t; };
  function set (o, k, key, bytes) {
    if (!o) return;
    let r = S.get(o);
    if (!r) { r = { b: 0, k, parts: {} }; S.set(o, r); if (k === 'buf') { M.nb++; BUF.add(o); } else if (k === 'tex') { M.nt++; TEX.add(o); } else M.nr++; }
    const old = r.parts[key] || 0;
    r.parts[key] = bytes; r.b += bytes - old; M[k] += bytes - old; peak();
  }
  function drop (o) {
    const r = o && S.get(o);
    if (!r) return;
    M[r.k] -= r.b; if (r.k === 'buf') { M.nb--; BUF.delete(o); } else if (r.k === 'tex') { M.nt--; TEX.delete(o); } else M.nr--;
    S.delete(o);
  }
  const srcWH = s => s ? [s.videoWidth || s.naturalWidth || s.displayWidth || s.width || 0, s.videoHeight || s.naturalHeight || s.displayHeight || s.height || 0] : [0, 0];
  function wrap (P, gl2) {
    if (!P || P.__glmem) return;
    P.__glmem = true;
    const O = {};
    for (const k of ['bufferData', 'deleteBuffer', 'texImage2D', 'texStorage2D', 'texImage3D', 'texStorage3D', 'compressedTexImage2D', 'generateMipmap', 'deleteTexture', 'renderbufferStorage', 'renderbufferStorageMultisample', 'deleteRenderbuffer']) O[k] = P[k];
    const BB = { 0x8892: 0x8894, 0x8893: 0x8895, 0x8A11: 0x8A28, 0x8F36: 0x8F36, 0x8F37: 0x8F37, 0x88EB: 0x88ED, 0x88EC: 0x88EF, 0x8C8E: 0x8C8F };
    const texBind = (gl, t) => gl.getParameter(t === 0x0DE1 ? 0x8069 : (t >= 0x8515 && t <= 0x851A) || t === 0x8513 ? 0x8514 : t === 0x806F ? 0x806A : t === 0x8C1A ? 0x8C1D : 0x8069);
    P.bufferData = function (target, a, usage, off, len) {
      const r = O.bufferData.apply(this, arguments);
      try {
        let n = typeof a === 'number' ? a : !a ? 0 : len ? len * (a.BYTES_PER_ELEMENT || 1) : off ? (a.byteLength - off * (a.BYTES_PER_ELEMENT || 1)) : a.byteLength;
        const o = this.getParameter(BB[target] || 0x8894);
        set(o, 'buf', 0, n || 0);
        const x = S.get(o);                   // копия в JS: жив ли ещё массив, из которого залили (three.js держит его у геометрии)
        if (x) x.src = a && typeof a === 'object' && a.byteLength ? new WeakRef(a) : null;
      } catch (e) { /* — */ }
      return r;
    };
    P.deleteBuffer = function (b) { drop(b); return O.deleteBuffer.apply(this, arguments); };
    P.texImage2D = function (t, lv, f) {
      const r = O.texImage2D.apply(this, arguments);
      try {
        let w, h, type;
        if (arguments.length >= 9) { w = arguments[3]; h = arguments[4]; type = arguments[7]; } else { [w, h] = srcWH(arguments[5]); type = arguments[4]; }
        const o = texBind(this, t);
        set(o, 'tex', t + ':' + lv, w * h * bpp(f, type));
        if (!lv && S.get(o)) S.get(o).wh = w + '×' + h;
      } catch (e) { /* — */ }
      return r;
    };
    P.compressedTexImage2D = function (t, lv, f, w, h) {
      const r = O.compressedTexImage2D.apply(this, arguments);
      try { set(texBind(this, t), 'tex', t + ':' + lv, (arguments[6] && arguments[6].byteLength) || w * h); } catch (e) { /* — */ }
      return r;
    };
    if (O.texStorage2D) P.texStorage2D = function (t, levels, f, w, h) {
      const r = O.texStorage2D.apply(this, arguments);
      try { let n = 0; for (let i = 0; i < levels; i++) n += Math.max(1, w >> i) * Math.max(1, h >> i) * bpp(f); const o = texBind(this, t); set(o, 'tex', 's', n * (t === 0x8513 ? 6 : 1)); if (S.get(o)) S.get(o).wh = w + '×' + h + (levels > 1 ? '/' + levels : ''); } catch (e) { /* — */ }
      return r;
    };
    if (O.texImage3D) P.texImage3D = function (t, lv, f, w, h, dd) {
      const r = O.texImage3D.apply(this, arguments);
      try { set(texBind(this, t), 'tex', t + ':' + lv, w * h * dd * bpp(f, arguments[8])); } catch (e) { /* — */ }
      return r;
    };
    if (O.texStorage3D) P.texStorage3D = function (t, levels, f, w, h, dd) {
      const r = O.texStorage3D.apply(this, arguments);
      try { let n = 0; for (let i = 0; i < levels; i++) n += Math.max(1, w >> i) * Math.max(1, h >> i) * (t === 0x806F ? Math.max(1, dd >> i) : dd) * bpp(f); set(texBind(this, t), 'tex', 's', n); } catch (e) { /* — */ }
      return r;
    };
    P.generateMipmap = function (t) {
      const r = O.generateMipmap.apply(this, arguments);
      try { const o = texBind(this, t), x = S.get(o); if (x) { let base = 0; for (const k in x.parts) if (/:0$/.test(k)) base += x.parts[k]; if (base) set(o, 'tex', 'mip', Math.round(base / 3)); } } catch (e) { /* — */ }
      return r;
    };
    P.deleteTexture = function (t) { drop(t); return O.deleteTexture.apply(this, arguments); };
    P.renderbufferStorage = function (t, f, w, h) {
      const r = O.renderbufferStorage.apply(this, arguments);
      try { set(this.getParameter(0x8CA7), 'rb', 0, w * h * bpp(f)); } catch (e) { /* — */ }
      return r;
    };
    if (O.renderbufferStorageMultisample) P.renderbufferStorageMultisample = function (t, sm, f, w, h) {
      const r = O.renderbufferStorageMultisample.apply(this, arguments);
      try { set(this.getParameter(0x8CA7), 'rb', 0, w * h * bpp(f) * Math.max(1, sm)); } catch (e) { /* — */ }
      return r;
    };
  }
  if (window.WebGL2RenderingContext) wrap(WebGL2RenderingContext.prototype, true);
  if (window.WebGLRenderingContext) wrap(WebGLRenderingContext.prototype, false);
  // кадр холста: цвет + глубина/трафарет (×сглаживание + итог) — по каждому контексту WebGL
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (k, o) {
    const c = gc.apply(this, arguments);
    if (c && /webgl/.test(k) && !M.ctx.some(x => x.c === c)) M.ctx.push({ c, cv: this, aa: !!(o && o.antialias) || o === undefined });
    return c;
  };
  const fb = () => { let n = 0; for (const x of M.ctx) { const a = x.c.getContextAttributes ? x.c.getContextAttributes() : null, s = a && a.antialias ? 4 : 1, px = x.cv.width * x.cv.height; n += px * 8 * s + (s > 1 ? px * 4 : 0); } return n; };
  const r1 = v => Math.round(v / MB * 10) / 10;
  const LATE = [];
  M.hpeak = 0;
  const hp = () => { const u = performance.memory ? performance.memory.usedJSHeapSize : 0; if (u > M.hpeak) M.hpeak = u; return u; };
  setInterval(hp, 100);                       // пик кучи JS (внутри долгой задачи не видно — ещё и в конце каждого куска поздней сборки)
  /* ?lategc — сборка мусора после каждого куска: куча — только живое (пик живого за сборку, как у браузера с жадной уборкой) */
  const LGC = /[?&]lategc\b/.test(location.search);
  const LSNAP = (location.search.match(/[?&]latesnap=([^&]+)/) || [])[1];   // ?latesnap=кусок — снимок кучи после этого куска (probe --heapsnap)
  window.__lateMem = n => { try { if (LGC && window.gc) gc(); LATE.push([n, total(), hp()]); if (LSNAP && decodeURIComponent(LSNAP).split(',').includes(n)) { window.__lateHold = true; console.debug('__probemem:heap:late-' + n); } } catch (e) { /* — */ } };
  window.__glmem = {
    get () { const f = fb(); return { buf: r1(M.buf), tex: r1(M.tex), rb: r1(M.rb), fb: r1(f), total: r1(total() + f), peak: r1(M.peak + f), nb: M.nb, nt: M.nt, nr: M.nr, heapPeak: r1(M.hpeak) }; },
    /* сколько массивов, из которых залиты буферы, ещё живы в JS (после gc() — точно): копия геометрии в памяти страницы */
    js () { let b = 0, n = 0; for (const o of BUF) { const x = S.get(o), a = x && x.src && x.src.deref(); if (a && a.byteLength) { b += a.byteLength; n++; } } return { mb: r1(b), n }; },
    /* по кускам поздней сборки (latebuild.js зовёт __lateMem(кусок) в конце каждого): [кусок, +МБ видео, +МБ кучи (без сборки мусора — шумно)] */
    late () { const out = []; for (let i = 1; i < LATE.length; i++) out.push([LATE[i][0], r1(LATE[i][1] - LATE[i - 1][1]), r1(LATE[i][2] - LATE[i - 1][2]), r1(LATE[i][2])]); return out; },
    top (n = 12) { return [...TEX].map(o => S.get(o)).filter(Boolean).sort((a, b) => b.b - a.b).slice(0, n).map(r => r1(r.b) + ' ' + (r.wh || '?')); },
    raw: M,
  };
})();`;

module.exports = { GLMEM };
