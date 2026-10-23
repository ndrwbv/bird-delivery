/* ──────────────────────────────────────────────────────────────────────────
   Цепочки графа улиц для поиска пути (плавные улицы 11ч, этап 4; docs/plan/smooth-roads.md,
   docs/CAREER.md «Путь на дороге»).

   С плавными улицами (по умолчанию; без них — ?oldroads) каждая точка дуги — узел графа (game.js NODES): узлов ~×1,8, и поиск пути — навигатор
   (roadPath), срок заказа (routeNodes), курьеры и скорая (svcpath.js) — перебирал бы их по одному
   (поиск ×2,5 по времени). Здесь узлы ровно с двумя соседями (точка дуги, излом, середина улицы) собраны
   в цепочки — от развилки (перекрёсток, тупик, узел за линией закрытого города) до следующей. Поиск
   проходит цепочку за один шаг очереди, а по дороге проверяет на каждом куске то же, что проверял бы
   сам (закрытый район, фестиваль, перекрытие, ремонт, цель или хвост к клиенту внутри цепочки).
   Путь в ответе — тот же, со всеми узлами. Строится раз после графа; с ?oldroads не строится —
   поиск как был, бит в бит.

   build(NODES, edgeOf) → RC:
     SEQ[c] — узлы цепочки c от конца до конца (Int32Array; концы — развилки; замкнутая — с одного узла на него же),
     EF[c][i] — ребро SEQ[i] → SEQ[i + 1], EB[c][i] — обратно; SC[k], SP[k] — у узла внутри цепочки: её номер и место (−1 — развилка);
     OUT[u] — куда из узла u: { to, e } — прямо по ребру к соседней развилке, { c, p0, dir, end, to } — по цепочке c
       от места p0 шагом dir (±1) до места end (to — узел на конце). У узла цепочки — два хода (в обе стороны).
   ────────────────────────────────────────────────────────────────────────── */

export const STATS = { nodes: 0, soft: 0, chains: 0, longest: 0, ms: 0, lockSoft: 0 };

/* заглушка-проверка (этап 5, 24.10.2026): lock у узлов сейчас всегда 0 (game.js districtLocks — закрытые районы без стен),
   поэтому поиск по цепочке lock у мягких узлов внутри не смотрит (game.js routeNodesRC). Если lock когда-нибудь вернут —
   мягкий узел с lock должен стать развилкой (пересобрать цепочки: build, soft[k] = 0 при lock), иначе поиск пройдёт сквозь
   закрытое. Пока — только считает такие узлы (STATS.lockSoft) и пишет в консоль; зовётся из districtLocks. */
export function lockCheck (RC, NODES) {
  if (!RC) return 0;
  let n = 0;
  for (let k = 0; k < NODES.length; k++) if (RC.soft[k] && NODES[k].lock) n++;
  STATS.lockSoft = n;
  if (n) console.warn('routechain: lock у ' + n + ' мягких узлов — цепочки их не видят, пересобрать (routechain.js lockCheck)');
  return n;
}

export function build (NODES, edgeOf) {
  const t0 = performance.now(), n = NODES.length;
  const soft = new Uint8Array(n);
  for (let k = 0; k < n; k++) soft[k] = NODES[k].nb.length === 2 && !NODES[k].out ? 1 : 0;
  const SC = new Int32Array(n).fill(-1), SP = new Int32Array(n), SEQ = [], EF = [], EB = [];
  // от мягкого узла k к соседу to — по мягким до развилки (или обратно к k: цепочка замкнута)
  const walk = (k, to) => {
    const out = [];
    let p = k, c = to;
    while (soft[c] && c !== k) { out.push(c); const nb = NODES[c].nb, nx = nb[0] === p ? nb[1] : nb[0]; p = c; c = nx; }
    out.push(c);
    return out;
  };
  for (let k = 0; k < n; k++) {
    if (!soft[k] || SC[k] >= 0) continue;
    const nb = NODES[k].nb, L = walk(k, nb[0]);
    let seq;
    if (L[L.length - 1] === k) { soft[k] = 0; seq = [k, ...L]; }      // кольцо из одних мягких — k становится развилкой
    else { const R = walk(k, nb[1]); seq = [...L.reverse(), k, ...R]; }
    const c = SEQ.length, S = Int32Array.from(seq), ef = [], eb = [];
    for (let i = 1; i < S.length - 1; i++) { SC[S[i]] = c; SP[S[i]] = i; }
    for (let i = 0; i + 1 < S.length; i++) { ef.push(edgeOf(S[i], S[i + 1])); eb.push(edgeOf(S[i + 1], S[i])); }
    SEQ.push(S); EF.push(ef); EB.push(eb);
    STATS.longest = Math.max(STATS.longest, S.length);
  }
  const step = (c, p0, dir) => { const end = dir > 0 ? SEQ[c].length - 1 : 0; return { c, p0, dir, end, to: SEQ[c][end] }; };
  const OUT = new Array(n);
  for (let u = 0; u < n; u++) {
    if (soft[u]) { OUT[u] = [step(SC[u], SP[u], -1), step(SC[u], SP[u], 1)]; continue; }
    OUT[u] = NODES[u].nb.map(v => {
      if (!soft[v]) return { c: -1, to: v, e: edgeOf(u, v) };
      const c = SC[v], p = SP[v], S = SEQ[c];
      // u — конец цепочки со стороны v (у замкнутой через развилку u — оба конца, выбираем по соседу)
      return S[p - 1] === u ? step(c, 0, 1) : step(c, S.length - 1, -1);
    });
  }
  let ns = 0;
  for (let k = 0; k < n; k++) ns += soft[k];
  Object.assign(STATS, { nodes: n, soft: ns, chains: SEQ.length, ms: Math.round((performance.now() - t0) * 10) / 10 });
  return { SEQ, EF, EB, OUT, soft, SC, SP, STATS };
}

/* узлы пути до k: PR — откуда пришли (узел очереди), PO — каким ходом (цепочка или null — прямо по ребру);
   via — k внутри цепочки: { u, o, q } — из узла u ходом o до места q. Возвращает номера узлов от старта до k */
export function unwind (RC, PR, PO, k, via) {
  const out = [];
  let w = k;
  if (via) {
    const S = RC.SEQ[via.o.c];
    for (let q = via.q; q !== via.o.p0; q -= via.o.dir) out.push(S[q]);
    w = via.u;
  }
  for (; w !== -1; w = PR[w]) {
    out.push(w);
    const o = PO[w];
    if (o) { const S = RC.SEQ[o.c]; for (let q = o.end - o.dir; q !== o.p0; q -= o.dir) out.push(S[q]); }
  }
  return out.reverse();
}
