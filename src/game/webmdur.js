/* Длительность в заголовке webm (повтор, replay.js; docs/CAREER.md «Повтор»).

   MediaRecorder пишет webm «потоком»: в заголовке (Segment → Info) нет длительности, и часть плееров
   не показывает время и не даёт перематывать. После записи дописываем элемент Duration в Info —
   переписываем только начало файла (до 64 КБ), остальное — те же байты (Blob.slice, без копии).

   Формат — EBML (как двоичный XML): элемент = id (1—4 байта) + размер (1—8 байт, «vint») + данные.
   Segment у MediaRecorder — «размер неизвестен», так что Info можно удлинить без пересчёта. Есть
   SeekHead (ссылки на места в файле — сдвинулись бы) или что-то не так — файл как был.

     fixDuration(blob, ms) → Promise<Blob>   ms — длительность ролика, мс
     patch(u8, ms)         → { head, cut } | null   для проверок: новое начало и сколько байт старого оно заменяет */

const ID = { EBML: 0x1A45DFA3, SEGMENT: 0x18538067, SEEKHEAD: 0x114D9B74, INFO: 0x1549A966, CLUSTER: 0x1F43B675, SCALE: 0x2AD7B1, DURATION: 0x4489 };
const HEAD = 1 << 16;

const vlen = b => { for (let i = 0; i < 8; i++) if (b & (0x80 >> i)) return i + 1; return 0; };
function readId (u, p) {
  const n = vlen(u[p]);
  if (!n || n > 4 || p + n > u.length) return null;
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + u[p + i];
  return { v, n };
}
function readSize (u, p) {
  const n = vlen(u[p]);
  if (!n || p + n > u.length) return null;
  let v = u[p] & (0xff >> n), ones = v === (0xff >> n);
  for (let i = 1; i < n; i++) { v = v * 256 + u[p + i]; if (u[p + i] !== 0xff) ones = false; }
  return { v, n, unknown: ones };
}
/* размер v в n байт (с меткой длины); не влезает — null */
function sizeBytes (v, n) {
  if (v > 2 ** (7 * n) - 2) return null;
  const out = new Uint8Array(n);
  let x = v;
  for (let i = n - 1; i >= 0; i--) { out[i] = x % 256; x = Math.floor(x / 256); }
  out[0] |= 0x80 >> (n - 1);
  return out;
}
const minSize = v => { for (let n = 1; n <= 8; n++) if (v <= 2 ** (7 * n) - 2) return n; return 8; };
function f64 (x) { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b; }
const cat = parts => { const L = parts.reduce((s, p) => s + p.length, 0), o = new Uint8Array(L); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };

/** начало файла u8 → новое начало (head) вместо первых cut байт; null — не трогать */
export function patch (u, ms) {
  if (!(ms > 0)) return null;
  let p = 0;
  const e = readId(u, p);
  if (!e || e.v !== ID.EBML) return null;
  const es = readSize(u, p + e.n);
  if (!es || es.unknown) return null;
  p += e.n + es.n + es.v;
  const s = readId(u, p);
  if (!s || s.v !== ID.SEGMENT) return null;
  const segSizeAt = p + s.n, ss = readSize(u, segSizeAt);
  if (!ss) return null;
  p = segSizeAt + ss.n;
  // дети Segment до Info
  while (p < u.length) {
    const c = readId(u, p);
    if (!c) return null;
    const cs = readSize(u, p + c.n);
    if (!cs || cs.unknown) return null;
    if (c.v === ID.SEEKHEAD || c.v === ID.CLUSTER) return null;
    const d0 = p + c.n + cs.n, d1 = d0 + cs.v;
    if (c.v !== ID.INFO) { p = d1; continue; }
    if (d1 > u.length) return null;
    // Info: масштаб времени (нс на единицу, по умолчанию 1 мс) и есть ли уже Duration
    let scale = 1e6, durAt = -1, durN = 0, q = d0;
    while (q < d1) {
      const x = readId(u, q); if (!x) return null;
      const xs = readSize(u, q + x.n); if (!xs || xs.unknown) return null;
      const x0 = q + x.n + xs.n;
      if (x.v === ID.SCALE) { let v = 0; for (let i = 0; i < xs.v; i++) v = v * 256 + u[x0 + i]; if (v > 0) scale = v; }
      if (x.v === ID.DURATION) { durAt = x0; durN = xs.v; }
      q = x0 + xs.v;
    }
    const dur = ms * 1e6 / scale;
    if (durAt >= 0) {                                      // уже есть — переписать на месте
      const head = u.slice(0, d1), dv = new DataView(head.buffer);
      if (durN === 8) dv.setFloat64(durAt, dur); else if (durN === 4) dv.setFloat32(durAt, dur); else return null;
      return { head, cut: d1 };
    }
    const add = cat([new Uint8Array([0x44, 0x89, 0x88]), f64(dur)]);   // Duration, 8 байт float
    const nv = cs.v + add.length;
    const nsz = sizeBytes(nv, Math.max(cs.n, minSize(nv)));
    if (!nsz) return null;
    let seg = u.subarray(segSizeAt, segSizeAt + ss.n);
    if (!ss.unknown) { seg = sizeBytes(ss.v + add.length + (nsz.length - cs.n), ss.n); if (!seg) return null; }
    const head = cat([u.subarray(0, segSizeAt), seg, u.subarray(segSizeAt + ss.n, p + c.n), nsz, u.subarray(d0, d1), add]);
    return { head, cut: d1 };
  }
  return null;
}

/** blob webm + длительность, мс → blob с длительностью в заголовке (не вышло — тот же blob) */
export async function fixDuration (blob, ms) {
  try {
    if (!blob || !blob.size || !(ms > 0)) return blob;
    const u = new Uint8Array(await blob.slice(0, Math.min(blob.size, HEAD)).arrayBuffer());
    const r = patch(u, ms);
    if (!r) return blob;
    return new Blob([r.head, blob.slice(r.cut)], { type: blob.type });
  } catch (e) { return blob; }
}
