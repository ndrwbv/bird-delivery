/* Код страницы для probe и perf --play: помощники скрипта (PRELUDE) и
   время кадров, ускорение, автопилот (INSTALL). Общий файл, чтобы perf.cjs
   ездил тем же автопилотом, что probe. */
/* что есть у скрипта в странице: ставится до него одной строкой */
const PRELUDE = `
const d = window.__dlv, wait = ms => new Promise(r => setTimeout(r, ms));
const P = window.__probe;
const log = (...a) => { P.logs.push(a.length === 1 ? a[0] : a); };
const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn(d)) return true; } catch (e) {} await wait(50); } return false; };
const run = async (secs, k = 1) => { const n0 = P.n; window.__warp = Math.max(0.1, Math.min(3, k)); await wait(secs * 1000); window.__warp = 1; return P.n - n0; };
const frames = (from = 0) => P.stats(from);
const tp = (x, z, h) => { const r = d.nearestRoad(x, z, 5, 4), V = d.V;
  if (r) { V.x = r.x; V.z = r.z; V.h = h !== undefined ? h : Math.atan2(r.seg.x2 - r.seg.x1, r.seg.z2 - r.seg.z1); } else { V.x = x; V.z = z; if (h !== undefined) V.h = h; }
  V.vx = V.vz = 0; V.y = d.surfaceAt(V.x, V.z); V.camX = V.x - Math.sin(V.h) * 11; V.camZ = V.z - Math.cos(V.h) * 11; V.camH = V.h; V.camY = V.y + 6; V.hero = 0;
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; } return { x: +V.x.toFixed(1), z: +V.z.toFixed(1) }; };
const onShift = async () => {
  const cm = d.CAREERM, on = cm && cm.shiftOn ? cm.shiftOn() : !d.S.ride && ['drive', 'back', 'handover', 'brief', 'loading', 'side'].includes(d.S.state);
  if (!on || d.S.ride) { d.startRun(false); await wait(300); }
  if (d.S.state === 'brief') { d.acceptOrder(); await until(x => x.S.state === 'drive', 4000); }
  return d.S.state; };
const ride = async () => { if (!d.S.ride || !['drive'].includes(d.S.state)) { d.startRun(true); await wait(200); } return d.S.state; };
const autopilot = (on = true) => P.autopilot(on);
/* smoke(secs): смена на автопилоте и проверка, что игра жива. → { ok, fail: [что не так], m, frames, clock, ft }
   жива — машина проехала ≥ 150 м, кадры идут, часы смены идут, числа конечные, в конце — смена и руль в руках */
const smoke = async (secs = 30, minM = 150) => {
  await onShift(); autopilot(true);
  const fail = [], V = d.V, fin = v => typeof v === 'number' && Number.isFinite(v);
  let m = 0, px = V.x, pz = V.z, bad = null, stuckMenu = 0;
  const n0 = P.n, f0 = P.ft.length, c0 = d.S.shiftT || 0, e0 = d.ENV ? d.ENV.t : 0, t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    await wait(250);
    const step = Math.hypot(V.x - px, V.z - pz);
    if (step < 60) m += step;                       // телепорт (оживление, новая смена) — не езда
    px = V.x; pz = V.z;
    const nums = { x: V.x, z: V.z, y: V.y, money: d.S.money, hp: d.S.hp, hpMax: d.S.hpMax, wallet: d.wallet ? d.wallet() : 0 };
    for (const k in nums) if (!fin(nums[k]) && !bad) bad = k + '=' + nums[k];
  }
  autopilot(false);
  const frames = P.n - n0, clock = +((d.S.shiftT || 0) - c0).toFixed(1), env = d.ENV ? +(d.ENV.t - e0).toFixed(4) : null;
  const playing = ['drive', 'back', 'handover', 'side', 'loading', 'brief'].includes(d.S.state);
  if (m < minM) fail.push('проехала ' + Math.round(m) + ' м < ' + minM + ' (застряла?)');
  if (frames < secs * 20) fail.push('кадров ' + frames + ' за ' + secs + ' с (зависла?)');
  if (!(clock > secs * 0.5)) fail.push('часы смены прошли ' + clock + ' с из ' + secs);
  if (bad) fail.push('не число: ' + bad);
  if (!playing || d.S.ride) fail.push('в конце не смена: state=' + d.S.state + (d.S.ride ? ', ride' : ''));
  if (d.S.paused) fail.push('пауза');
  if (d.DLG && d.DLG.isOpen && d.DLG.isOpen()) fail.push('открыт диалог');
  // журнал ошибок (src/platform/crashlog.js): предохранитель глотает исключения кадра — их видно только тут
  const crash = d.crashlog ? d.crashlog.entries().map(e => ({ kind: e.kind, where: e.where, n: e.n, msg: e.msg, at: (e.stack || '').split('\\n')[1] || '', phase: e.snap && e.snap.phase, state: e.snap && e.snap.state })) : null;
  if (crash && crash.length) fail.push('журнал ошибок: ' + crash.length + ' записей');
  return { ok: !fail.length, fail, m: Math.round(m), frames, clock, env, state: d.S.state, delivered: d.S.delivered || 0, ft: P.stats(f0), crash };
};
`;

/* ставится в страницу один раз после загрузки: время кадров, ускорение, автопилот */
const INSTALL = `(() => { if (window.__probe) return; const P = window.__probe = { logs: [], ft: [], n: 0 };
  const raf0 = window.requestAnimationFrame.bind(window); let lastR = null, vt = 0, lastP = -1;
  window.__warp = 1;
  // время кадра — по часам в начале первого колбэка кадра (отметки rAF вне экрана идут ровно по 16,7 мс)
  const map = t => { if (t !== lastR) { const now = performance.now(); if (lastP >= 0) { P.ft.push(now - lastP); if (P.ft.length > 20000) P.ft.splice(0, 10000); } lastP = now; P.n++;
      vt = lastR === null ? t : vt + (t - lastR) * window.__warp; lastR = t; } return vt; };
  window.requestAnimationFrame = cb => raf0(t => cb(map(t)));
  P.stats = (from = 0) => { const s = P.ft.slice(from).sort((a, b) => a - b), q = p => s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : 0;
    return { n: s.length, p50: q(0.5), p95: q(0.95), max: s.length ? +s[s.length - 1].toFixed(1) : 0 }; };
  /* автопилот: руль к точке маршрута в L м впереди, тормоз перед машинами; следующий заказ
     принимает сам, от поручений отказывается.
     Точка — в L м от ПРОЕКЦИИ машины на маршрут, а не от его начала: маршрут игры всегда идёт
     «машина → ближайшая точка дороги → … → пин», и съехавшую с дороги машину (пин во дворе,
     занесло, вытолкнули) старый автопилот тянул назад к дороге — она кружила вокруг одной точки
     и не доезжала (до 03.10.2026: 0—1 доставка за 90 с, смена кончалась сердцами). */
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  P.ap = { on: false, vmax: 14 };
  P.autopilot = on => { P.ap.on = !!on; if (!on) { const IN = window.__dlv.IN; IN.joy = 0; IN.gas = 0; IN.brake = 0; } return P.ap.on; };
  /* ближайшая точка ломаной R[i0..] к (x, z): участок i (R[i-1] → R[i]) и доля k; почти поровну — дальше по маршруту */
  const proj = (R, x, z) => {
    let bi = 1, bk = 0, bd = Infinity;
    for (let i = R.length > 2 ? 2 : 1; i < R.length; i++) {
      const ax = R[i - 1][0], az = R[i - 1][1], ux = R[i][0] - ax, uz = R[i][1] - az, l2 = ux * ux + uz * uz || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / l2)), dd = Math.hypot(ax + ux * k - x, az + uz * k - z);
      if (dd < bd + 0.5) { bd = Math.min(bd, dd); bi = i; bk = k; }
    }
    return { i: bi, k: bk };
  };
  /* точка в L м по маршруту от (i, k) и направление участка там: [x, z, ux, uz] */
  const along = (R, i, k, L) => {
    let x = R[i - 1][0] + (R[i][0] - R[i - 1][0]) * k, z = R[i - 1][1] + (R[i][1] - R[i - 1][1]) * k, ux = 0, uz = 1;
    for (; i < R.length; i++) {
      const ex = R[i][0], ez = R[i][1], l = Math.hypot(ex - x, ez - z);
      if (l > 1e-3) { ux = (ex - x) / l; uz = (ez - z) / l; }
      if (l >= L) return [x + ux * L, z + uz * L, ux, uz];
      L -= l; x = ex; z = ez;
    }
    return [x, z, ux, uz];
  };
  /* Объезд ремонта. Ремонт (roadlife.js «works») ставят поперёк улицы на маршруте курьера, и навигатор
     нарочно ведёт прямо туда — «ищи объезд». Живой игрок видит щиты и сворачивает; автопилот упирался
     в блоки и пятился до конца смены. Теперь: маршрут игры идёт через закрытое ребро (e.closed) или
     первый/последний кусок улицы перегорожен — свой путь по узлам улиц (A*) в обход закрытых рёбер. */
  let NIDX = null;
  const nodeAt = (D, x, z) => { if (!NIDX) { NIDX = new Map(); D.NODES.forEach((n, i) => NIDX.set(n.x + ',' + n.z, i)); } const i = NIDX.get(x + ',' + z); return i === undefined ? -1 : i; };
  const shut = (D, a, b) => { const e = D.edgeOf(a, b), N = D.NODES; return !!(e && e.closed) && !N[a].out && !N[b].out; };
  /* перегорожен ли отрезок дороги чем-то большим (блоки ремонта, а не деревья и столбы) */
  const blockedLine = (D, x0, z0, x1, z1) => {
    const l = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s <= l; s += 1.5) {
      const px = x0 + (x1 - x0) * s / (l || 1), pz = z0 + (z1 - z0) * s / (l || 1), cell = D.SOLID_GRID.get(Math.floor(px / 30) + ',' + Math.floor(pz / 30));
      if (cell) for (const q of cell) {
        if (Math.max(q.hw, q.hd) < 1.5 || q.deckY !== undefined || q.ramp !== undefined) continue;
        const dx = px - q.cx, dz = pz - q.cz, lx = dx * q.cs + dz * q.sn, lz = -dx * q.sn + dz * q.cs;
        if (Math.abs(lx) < q.hw + 0.5 && Math.abs(lz) < q.hd + 0.5) return true;
      }
    }
    return false;
  };
  /* концы улицы под точкой (узлы графа), которые не отрезаны от неё перегородкой: [[узел, метры]] */
  const ends = (D, x, z) => {
    const r = D.nearestRoad(x, z), out = [];
    if (!r) return out;
    for (const [ex, ez] of [[r.seg.x1, r.seg.z1], [r.seg.x2, r.seg.z2]]) {
      const n = nodeAt(D, ex, ez);
      if (n >= 0 && !blockedLine(D, x, z, ex, ez)) out.push([n, Math.hypot(ex - x, ez - z)]);
    }
    return out;
  };
  const astar = (D, starts, goals) => {
    const N = D.NODES, g = new Map(), prev = new Map(), H = [];
    const push = (n, f) => { H.push([f, n]); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < H.length && H[a][0] < H[m][0]) m = a; if (b < H.length && H[b][0] < H[m][0]) m = b; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
    let gx = 0, gz = 0; for (const [n] of goals) { gx += N[n].x / goals.length; gz += N[n].z / goals.length; }
    for (const [n, c] of starts) if (!(g.get(n) <= c)) { g.set(n, c); prev.set(n, -1); push(n, c + Math.hypot(N[n].x - gx, N[n].z - gz)); }
    const gm = new Map(goals); let best = Infinity, bn = -1, it = 0;
    while (H.length && it++ < 40000) {
      const [f, u] = pop(), gu = g.get(u);
      if (f >= best) break;
      if (gm.has(u) && gu + gm.get(u) < best) { best = gu + gm.get(u); bn = u; }
      for (const v of N[u].nb) {
        if (shut(D, u, v) || ((N[v].out || N[v].lock) && !gm.has(v))) continue;
        const c = gu + Math.hypot(N[v].x - N[u].x, N[v].z - N[u].z);
        if (g.get(v) <= c) continue;
        g.set(v, c); prev.set(v, u); push(v, c + Math.hypot(N[v].x - gx, N[v].z - gz));
      }
    }
    if (bn < 0) return null;
    const path = []; for (let k = bn; k !== -1; k = prev.get(k)) path.push([N[k].x, N[k].z]);
    return path.reverse();
  };
  /* маршрут игры R = [машина, (точка на улице), узлы…, (точка у клиента), пин] — нужен ли объезд:
     ребро между узлами закрыто или кусок улицы (не от узла до узла) по дороге перегорожен */
  const onRd = (D, x, z) => { const r = D.nearestRoad(x, z); return !!r && r.d < r.seg.w / 2 + 0.5; };
  const needDetour = (D, R) => {
    const ids = R.map((p, i) => (i ? nodeAt(D, p[0], p[1]) : -1));
    for (let i = 1; i < R.length - 1; i++) {
      if (ids[i - 1] >= 0 && ids[i] >= 0) { if (shut(D, ids[i - 1], ids[i])) return true; }
      else if (onRd(D, R[i - 1][0], R[i - 1][1]) && onRd(D, R[i][0], R[i][1]) && blockedLine(D, R[i - 1][0], R[i - 1][1], R[i][0], R[i][1])) return true;
    }
    return false;
  };
  /* свой путь: от точки дороги под машиной (к тому концу улицы, что не за перегородкой) по узлам в обход
     закрытых рёбер к улице клиента, дальше — как у игры */
  const detour = (D, R, V, tail) => {
    const rc = D.nearestRoad(V.x, V.z); if (!rc) return null;
    tail = tail || [R[R.length - 2], R[R.length - 1]];
    const q = tail[0], st = ends(D, rc.x, rc.z), gl = ends(D, q[0], q[1]);
    if (!st.length || !gl.length) return null;
    const path = astar(D, st, gl);
    return path ? [[V.x, V.z], [rc.x, rc.z], ...path, ...tail] : null;
  };
  /* Последние метры до пина вдали от дорог (двор, территория за забором — до ближайшей улицы бывает
     и 100 м). Маршрут игры кончается прямой «точка улицы → пин», часто сквозь забор. Ищем проезд
     по клеткам 2 × 2 м от пина наружу (поиск в ширину, клетка свободна — не стена, не забор, не вода)
     до ближайшей улицы; дальше едем: по улицам до этой точки, по клеткам — к пину. */
  const lastMile = (D, tx, tz) => {
    const r0 = D.nearestRoad(tx, tz); if (r0 && r0.d < 12) return null;
    const C = 2, RR = 1.2, MAXN = 30000;
    const free = (x, z) => {
      if (D.groundH(x, z) < 0.3) return false;
      const cell = D.SOLID_GRID.get(Math.floor(x / 30) + ',' + Math.floor(z / 30));
      if (cell) for (const q of cell) {
        if (q.deckY !== undefined) continue;
        const dx = x - q.cx, dz = z - q.cz, lx = dx * q.cs + dz * q.sn, lz = -dx * q.sn + dz * q.cs;
        if (Math.abs(lx) < q.hw + RR && Math.abs(lz) < q.hd + RR) return false;
      }
      return true;
    };
    const par = new Map([['0,0', null]]), Q = [[0, 0]];
    for (let h = 0, n = 0; h < Q.length && n < MAXN; h++, n++) {
      const [i, j] = Q[h], x = tx + i * C, z = tz + j * C, r = D.nearestRoad(x, z);
      if (r && r.d < r.seg.w / 2 - 0.5) {
        const pts = []; for (let k = i + ',' + j; k; k = par.get(k)) { const [a, b] = k.split(',').map(Number); pts.push([tx + a * C, tz + b * C]); }
        const sm = pts.filter((p, m) => m === 0 || m === pts.length - 1 || m % 3 === 0);   // от улицы к пину
        return { entry: sm[0], pts: sm };
      }
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (i + a) + ',' + (j + b);
        if (par.has(k)) continue;
        par.set(k, i + ',' + j);
        if (free(tx + (i + a) * C, tz + (j + b) * C)) Q.push([i + a, j + b]);
      }
    }
    return null;
  };
  const step = () => { raf0(step);
    const D = window.__dlv, A = P.ap; if (!A.on || !D) return; const IN = D.IN, V = D.V, S = D.S;
    try {
      if (S.state === 'brief') { D.acceptOrder(); return; }
      if (D.CH && D.CH.opts && D.CH.opts.length && D.pickChoice) { D.pickChoice(1); return; }
      if (!['drive', 'back', 'side'].includes(S.state)) { IN.joy = 0; IN.gas = 0; IN.brake = 0; return; }
      const GR = D.route; if (!GR || GR.length < 2) { IN.joy = 0; IN.gas = 0; return; }
      // таймеры — в игровых секундах (run(secs, 3) ускоряет игру, а не performance.now)
      const now = performance.now(), dts = A.t ? Math.min(0.1, (now - A.t) / 1000) * (window.__warp || 1) : 0; A.t = now;
      /* след вне дорог: со двора (пин во дворе) выезжать тем же путём, каким въехал, — прямая к
         ближайшей дороге, куда ведёт маршрут игры, часто через дом или забор */
      const rdC = D.nearestRoad(V.x, V.z), onRoad = !!rdC && rdC.d < rdC.seg.w / 2 + 1;
      if (onRoad || !A.trail) A.trail = [[V.x, V.z]];
      else { const l = A.trail[A.trail.length - 1]; if (Math.hypot(V.x - l[0], V.z - l[1]) > 2) { A.trail.push([V.x, V.z]); if (A.trail.length > 150) A.trail.shift(); } }
      const tkey = S.target ? Math.round(S.target.x) + ',' + Math.round(S.target.z) : '';
      if (tkey !== A.tkey) { A.tkey = tkey; A.own = null; A.detT = 0; A.lm = S.target ? lastMile(D, S.target.x, S.target.z) : null; A.lmOn = false;
        if (!onRoad && A.trail.length > 2) A.own = { kind: 'trail', pts: [[V.x, V.z], ...A.trail.slice().reverse()] }; }
      if (A.own && A.own.kind === 'trail' && (onRoad || Math.hypot(V.x - A.own.pts[A.own.pts.length - 1][0], V.z - A.own.pts[A.own.pts.length - 1][1]) < 3)) A.own = null;
      // доехали до въезда к пину вдали от улиц — дальше по клеткам, маршрут больше не пересчитываем
      if (A.lm && !A.lmOn && !(A.own && A.own.kind === 'trail') && Math.hypot(V.x - A.lm.entry[0], V.z - A.lm.entry[1]) < 8) {
        A.lmOn = true; A.own = { kind: 'last', pts: [[V.x, V.z], ...A.lm.pts] };
      }
      // объезд ремонта и путь к въезду: раз в секунду, свой путь по улицам
      if ((!A.own || A.own.kind === 'detour') && !A.lmOn && (A.detT = (A.detT || 0) - dts) <= 0) {
        A.detT = 1;
        const dt = A.lm ? detour(D, GR, V, A.lm.pts) : needDetour(D, GR) ? detour(D, GR, V) : null;
        A.own = dt ? { kind: 'detour', pts: dt } : null;
      }
      const R = A.own ? A.own.pts : GR;
      /* не застревать: упёрлась — газ есть, а едет медленнее 0,6 м/с 1,5 с — назад с рулём в другую
         сторону (каждый следующий раз подряд — дольше); 2,5 с стоит за машиной, что не едет
         (светофор, пробка, припаркованная), — объезжает по встречной, если она свободна, не быстрее 8 м/с */
      if (A.rev > 0) { A.rev -= dts; IN.joy = 1; IN.jx = A.rjx; IN.gas = 0; IN.brake = V.vx * Math.sin(V.h) + V.vz * Math.cos(V.h) > -5 ? 1 : 0; return; }   // назад не быстрее 5 м/с
      if (A.pass > 0) A.pass -= dts;
      const sp = Math.hypot(V.vx, V.vz), left = S.target ? Math.hypot(S.target.x - V.x, S.target.z - V.z) : 99;
      const pr = proj(R, V.x, V.z), L = 9 + sp * 0.35;
      let [tx, tz, ux, uz] = along(R, pr.i, pr.k, L);
      // полоса: правая (как поток), на обгоне — встречная; у пина — прямо на него
      let lane = 0;
      if (left > 25 && !(A.own && A.own.kind !== 'detour')) {
        const rd = D.nearestRoad(tx, tz, 7, 1), w = rd && rd.d < rd.seg.w / 2 + 2 ? rd.seg.w : 7;
        lane = Math.max(1.4, Math.min(2.6, w >= 12.5 ? w / 8 : w / 4)) * (A.pass > 0 ? -1 : 1);
      }
      tx += -uz * lane; tz += ux * lane;
      const diff = wrap(Math.atan2(tx - V.x, tz - V.z) - V.h), sv = Math.max(-1, Math.min(1, diff * 2));
      IN.joy = 1; IN.jx = -sv / 1.35;
      // поворот впереди по маршруту — сбросить заранее
      const [fx2, fz2] = along(R, pr.i, pr.k, L + 10 + sp * 1.2), turn = Math.abs(wrap(Math.atan2(fx2 - tx, fz2 - tz) - Math.atan2(ux, uz)));
      /* машины: в коридоре впереди (шириной с машину, длиной с тормозной путь) или сойдутся с нами
         ближе 3 м в ближайшие 1,6 с, если обе поедут как едут (поперечные на перекрёстке, встречные на изгибе) */
      const fx = Math.sin(V.h), fz = Math.cos(V.h), reach = 5 + sp * 0.9;
      let block = false, oncoming = false, moving = false;
      for (const t of D.TRAFFIC) {
        const ax = t.x - V.x, az = t.z - V.z;
        if (ax * ax + az * az > 2500) continue;
        const f = ax * fx + az * fz, lat = ax * fz - az * fx, ts = t.speed || 0;
        if (f > 1.5 && f < reach && Math.abs(lat) < 2.3) { block = true; if (Math.abs(ts) > 0.5) moving = true; }
        if (f > 0 && f < 40 && lat > 0.5 && lat < 7 && Math.abs(ts) > 0.5) oncoming = true;   // по встречной кто-то едет
        if (f > 1 && !block && sp > 2) {
          const rvx = Math.sin(t.h || 0) * ts - V.vx, rvz = Math.cos(t.h || 0) * ts - V.vz;
          for (let tau = 0.4; tau <= 1.6; tau += 0.4) { const px = ax + rvx * tau, pz = az + rvz * tau; if (px * px + pz * pz < 9) { block = true; moving = Math.abs(ts) > 0.5; break; } }
        }
      }
      /* стены, деревья, столбы впереди: удар о стену бьёт сердца только быстрее 13 м/с — рядом с ними не быстрее 10 */
      let wall = false;
      for (let f = 2; f < reach && !wall; f += 1.5) for (const o of [-1.1, 0, 1.1]) {
        const px = V.x + fx * f + fz * o, pz = V.z + fz * f - fx * o, cell = D.SOLID_GRID.get(Math.floor(px / 30) + ',' + Math.floor(pz / 30));
        if (cell) for (const q of cell) {
          if (q.deckY !== undefined && V.y < q.deckY - 1.2) continue;
          if (q.ramp !== undefined) continue;
          const dx = px - q.cx, dz = pz - q.cz, lx = dx * q.cs + dz * q.sn, lz = -dx * q.sn + dz * q.cs;
          if (Math.abs(lx) < q.hw + 0.3 && Math.abs(lz) < q.hd + 0.3) { wall = true; break; }
        }
        if (wall) break;
      }
      if (A.pass > 0 && block && moving) { A.pass = 0; }            // на обгоне навстречу едут — назад в свою полосу, тормоз
      else if (A.pass > 0) block = false;
      A.wait = block && sp < 1 ? (A.wait || 0) + dts : 0;
      if (A.wait > 2.5 && !oncoming) { A.wait = 0; A.pass = 3; }
      let want = block ? 0 : left < 14 ? 3.5 : Math.abs(diff) > 1.5 ? 4 : left < 30 ? 7 : Math.abs(diff) > 0.45 ? 6 : turn > 0.7 ? 8 : A.pass > 0 ? 8 : A.vmax;
      if (wall) want = Math.min(want, 10);
      if (A.own && A.own.kind !== 'detour') want = Math.min(want, 7);   // по двору и по своему следу — не спеша
      /* таран конкурента (game.js svcDrive, ECON.FOES): несётся на тебя ~30 м/с, удар — 2 сердца. Сзади —
         газ в пол (удар слабее на разницу скоростей, а то и не догонит за 2,6 с тарана); спереди — тормоз и руль прочь */
      let ram = null, rd2 = 35 * 35;
      for (const t of D.TRAFFIC) if (t.ramT > 0) { const q = (t.x - V.x) ** 2 + (t.z - V.z) ** 2; if (q < rd2) { rd2 = q; ram = t; } }
      if (ram) {
        const ax = ram.x - V.x, az = ram.z - V.z, f = ax * fx + az * fz, lat = ax * fz - az * fx;
        if (f < 2) want = wall && Math.sqrt(rd2) > 12 ? 10 : 32;
        else { want = Math.min(want, 6); IN.jx = lat > 0 ? 0.8 : -0.8; }
      }
      // тормоз на месте — это задний ход: катится назад (после разворота, со склона) — гасим газом, не тормозом
      const vf = V.vx * fx + V.vz * fz;
      if (vf < -0.5) { IN.gas = 1; IN.brake = 0; }
      else { IN.gas = sp < want ? 1 : 0; IN.brake = sp > want + 1 ? 1 : 0; }
      A.stk = IN.gas && vf < 0.6 ? (A.stk || 0) + dts : 0;
      if (A.stk > 1.5) { A.stk = 0; A.nrev = now - (A.lastRev || 0) < 8000 / (window.__warp || 1) ? (A.nrev || 0) + 1 : 0; A.lastRev = now;
        // цель сзади (разворот на узкой улице) — разворот в три приёма: назад с рулём в другую сторону, каждый раз;
        // цель впереди, а упёрлась — то так, то этак
        A.rev = Math.min(3, 1.2 + A.nrev * 0.6); A.rjx = (Math.abs(diff) > 1.2 || A.nrev % 2 === 0 ? 1 : -1) * (IN.jx > 0 ? -0.8 : 0.8);
        if (onRoad && Math.abs(diff) < 0.6 && !oncoming) A.pass = 3; }   // впереди перегорожена своя полоса (ремонт полосы) — потом по встречной
    } catch (e) { console.error('[probe autopilot]', e && e.message); A.on = false; }
  };
  raf0(step);
})()`;

module.exports = { PRELUDE, INSTALL };
