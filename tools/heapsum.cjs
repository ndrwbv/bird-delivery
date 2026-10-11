/* Разбор снимка кучи (probe --heapsnap, docs/AGENTS.md «Память на телефоне»).
   node tools/heapsum.cjs a.heapsnapshot [b.heapsnapshot] [--top=25] [--who=имя] [--paths=3]
   Одна папка — самые большие группы по «своему» размеру (конструктор, массивы, строки, данные буферов…),
   две — что прибавилось от a к b. --who=Float32Array — у самых больших таких объектов цепочки «кто держит»
   (по первому держателю, без слабых ссылок), чтобы найти, чей это массив. */
const fs = require('fs');
const argv = process.argv.slice(2);
const files = argv.filter(a => !a.startsWith('--'));
const opt = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const TOP = +opt('top', 25), WHO = opt('who', null), PATHS = +opt('paths', 3), LINKS = +opt('links', 6);
const MB = 1048576;

/* снимок бывает больше 512 МБ (предел строки в node) — читаем буфером: числа узлов и рёбер — сами, строки — JSON */
function nums (buf, key, n) {
  let i = buf.indexOf(key) + key.length;
  const out = new Uint32Array(n);
  let k = 0, v = 0, inNum = false;
  for (; k < n; i++) {
    const c = buf[i];
    if (c >= 48 && c <= 57) { v = v * 10 + (c - 48); inNum = true; } else if (inNum) { out[k++] = v; v = 0; inNum = false; if (c === 93) break; } else if (c === 93) break;
  }
  return out;
}
function load (f) {
  const buf = fs.readFileSync(f);
  const ni = buf.indexOf('"nodes":[');
  const head = JSON.parse(buf.toString('utf8', 0, ni).replace(/,\s*$/, '') + '}');
  const m = head.snapshot.meta, NF = m.node_fields.length, EF = m.edge_fields.length;
  const N = nums(buf, '"nodes":[', head.snapshot.node_count * NF), E = nums(buf, '"edges":[', head.snapshot.edge_count * EF);
  const si = buf.indexOf('"strings":[') + 10, se = buf.lastIndexOf(']');
  const S = JSON.parse(buf.toString('utf8', si, se + 1));
  const T = m.node_types[0], ET = m.edge_types[0];
  const iT = m.node_fields.indexOf('type'), iN = m.node_fields.indexOf('name'), iS = m.node_fields.indexOf('self_size'), iE = m.node_fields.indexOf('edge_count');
  const eT = m.edge_fields.indexOf('type'), eN = m.edge_fields.indexOf('name_or_index'), eTo = m.edge_fields.indexOf('to_node');
  return { N, E, S, NF, EF, T, ET, iT, iN, iS, iE, eT, eN, eTo };
}
function group (h) {
  const g = new Map();
  let all = 0;
  for (let i = 0; i < h.N.length; i += h.NF) {
    const t = h.T[h.N[i + h.iT]], sz = h.N[i + h.iS];
    let k = t === 'object' || t === 'native' || t === 'closure' || t === 'hidden' ? t + ':' + h.S[h.N[i + h.iN]] : t === 'string' || t === 'concatenated string' || t === 'sliced string' ? 'string' : '(' + t + ')';
    if (k.length > 80) k = k.slice(0, 80);
    const r = g.get(k) || [0, 0];
    r[0] += sz; r[1]++;
    g.set(k, r);
    all += sz;
  }
  return { g, all };
}
const f1 = v => (v / MB).toFixed(1);
const a = load(files[0]), ga = group(a);
console.log(files[0] + ': всего ' + f1(ga.all) + ' МБ, узлов ' + (a.N.length / a.NF));
if (files[1]) {
  const b = load(files[1]), gb = group(b);
  console.log(files[1] + ': всего ' + f1(gb.all) + ' МБ (' + (gb.all >= ga.all ? '+' : '') + f1(gb.all - ga.all) + ')');
  const keys = new Set([...ga.g.keys(), ...gb.g.keys()]);
  const d = [...keys].map(k => { const x = ga.g.get(k) || [0, 0], y = gb.g.get(k) || [0, 0]; return [k, y[0] - x[0], y[1] - x[1], y[0]]; }).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, TOP);
  for (const [k, ds, dn, s] of d) console.log((ds >= 0 ? '+' : '') + f1(ds).padStart(7) + ' МБ  ' + (dn >= 0 ? '+' : '') + String(dn).padStart(8) + ' шт  (' + f1(s) + ' МБ)  ' + k);
} else {
  const top = [...ga.g.entries()].sort((p, q) => q[1][0] - p[1][0]).slice(0, TOP);
  for (const [k, [s, n]] of top) console.log(f1(s).padStart(8) + ' МБ  ' + String(n).padStart(9) + ' шт  ' + k);
}

/* --who: цепочки держателей у самых больших объектов с этим именем */
if (WHO) {
  const h = files[1] ? load(files[1]) : a;
  const n = h.N.length / h.NF;
  const first = new Uint32Array(n + 1);
  for (let i = 0, e = 0; i < n; i++) { first[i] = e; e += h.N[i * h.NF + h.iE] * h.EF; }
  first[n] = h.E.length;
  // обратные рёбра: кто держит узел (первый не слабый держатель)
  const owner = new Int32Array(n).fill(-1), oname = new Int32Array(n).fill(-1), otype = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    for (let e = first[i]; e < first[i + 1]; e += h.EF) {
      const et = h.ET[h.E[e + h.eT]];
      if (et === 'weak' || et === 'shortcut') continue;
      const to = h.E[e + h.eTo] / h.NF;
      if (owner[to] === -1) { owner[to] = i; oname[to] = h.E[e + h.eN]; otype[to] = h.E[e + h.eT]; }
    }
  }
  const nm = i => h.S[h.N[i * h.NF + h.iN]];
  const big = [];
  for (let i = 0; i < n; i++) if (nm(i) === WHO) big.push(i);
  // у буферов собственный размер мал — смотрим и на данные буфера (system / JSArrayBufferData) под ним
  const size = i => { let s = h.N[i * h.NF + h.iS]; for (let e = first[i]; e < first[i + 1]; e += h.EF) { const to = h.E[e + h.eTo] / h.NF; const t = nm(to); if (/ArrayBuffer|backing_store|JSArrayBufferData/.test(t)) s += h.N[to * h.NF + h.iS]; } return s; };
  big.sort((p, q) => size(q) - size(p));
  const groups = new Map();
  for (const i of big) {
    const chain = [];
    let x = i, guard = 0;
    while (owner[x] !== -1 && guard++ < 12) {
      const o = owner[x], et = h.ET[otype[x]], en = et === 'element' || et === 'hidden' ? '[]' : String(h.S[oname[x]] ?? oname[x]);
      chain.push(nm(o).slice(0, 30) + '.' + en.slice(0, 24));
      x = o;
      if (/^(Window|system \/ NativeContext|\(GC roots\))/.test(nm(o))) break;
    }
    const k = chain.slice(0, LINKS).join(' ← ');
    const r = groups.get(k) || [0, 0];
    r[0] += size(i); r[1]++;
    groups.set(k, r);
  }
  console.log('\n' + WHO + ': ' + big.length + ' шт, кто держит (первые ' + LINKS + ' звеньев):');
  for (const [k, [s, c]] of [...groups.entries()].sort((p, q) => q[1][0] - p[1][0]).slice(0, PATHS * 5)) console.log(f1(s).padStart(8) + ' МБ ' + String(c).padStart(7) + ' шт  ' + k);
}
