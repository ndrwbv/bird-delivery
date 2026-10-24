/* Породы деревьев и кустов (trees.js, М6): сколько каких, где, и кадры по местам в четыре сезона. В npm run check не входит.
   Числа:  npm run probe -- --eval=tools/probe-checks/tree-vars.js --size=deck --max=0 --timeout=400
   Кадры:  ... --q="tvshots=/папка" — по месту × сезону (лето 0,5, осень 1,5, зима 2,5, весна 3,45) кадр полным размером;
           tvat=имя,X,Z,ГЛАЗ_X,ГЛАЗ_Z,ВЫСОТА;… — свои места (глаз смотрит на X, Z; имя,X,Z[,D,В] — глаз с ближней дороги в D м); tvseas=0.5,2.5 — свои сезоны; tvh — час (13);
           tvcar=1 — ещё кадр из-за машины (камера игры) на каждом месте.
   Ответ: kinds — деревьев каждой породы, places — посажено садами, у администраций и по берегам, pts — где (до 40 на породу), tris — треугольников на дерево, gardens / ygroups — сады и рощицы новых пород,
   pile — треугольников в склейке деревьев, calls — вызовов в кадре по кадрам. Глаз свой (EYE), но машина ставится носом к месту:
   статику отсекает камера игры (cull.js), иначе то, что у неё за спиной, в кадре пропадает. --q=oldsee — деревья не тают. */
const Q = new URLSearchParams(location.search), DIR = Q.get('tvshots') || '', H = +(Q.get('tvh') || 13);
await onShift(); autopilot(false);
await until(() => !d.LATE || !d.LATE.busy(), 120000);
await until(() => window.__boot && window.__boot.full, 120000);
const S = d.TREES.STATS, R = d.renderer;
const out = { pile: d.season.BUILT.pile, trees: d.season.BUILT.trees, kinds: S.kinds, places: S.places, shore: S.shore, pts: {}, calls: [] };
const dist = (x, z) => (d.DIST && d.DIST.at ? d.DIST.at(x, z) : -1);
for (const k in S.pts) out.pts[k] = S.pts[k].map(p => [...p, dist(p[0], p[1])]);
out.tris = {}; for (const k in S.kinds) out.tris[k] = Math.round((S.tris[k] || 0) / S.kinds[k]);   // треугольников на дерево
out.gardens = S.gardens; out.ygroups = S.ygroups; out.admin = S.admin;
if (DIR) {
  const st = document.createElement('style'); st.textContent = '#phone, :has(> .oc-go) { visibility: hidden !important; }'; document.head.appendChild(st);   // накладная заказа не заслоняет кадр
  let EYE = null, calls = 0;
  const r0 = R.render.bind(R);
  R.render = (s, c) => { if (EYE && c === d.cam) { c.position.set(EYE[0], EYE[1], EYE[2]); c.lookAt(EYE[3], EYE[4], EYE[5]); c.updateMatrixWorld(); } r0(s, c); calls = R.info.render.calls; };
  let hold = () => { d.V.vx = d.V.vz = 0; for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0; d.ENV.t = d.ECON.tOfHour(H); };
  const seas = (Q.get('tvseas') || '0.5,1.5,2.5,3.45').split(',').map(Number);
  const places = (Q.get('tvat') || '').split(';').filter(Boolean).map(a => { const [n, ...v] = a.split(','); return [n, ...v.map(Number)]; });
  for (let [name, x, z, ex, ez, eh] of places) {
    if (!Number.isFinite(eh)) {                     // имя,X,Z[,D,В]: глаз — с ближней дороги (как подъедет игрок), в D м (14) от места, В м (6) высоты
      const D = Number.isFinite(ex) ? ex : 14; eh = Number.isFinite(ez) ? ez : 6;
      tp(x, z);
      const vx = d.V.x - x, vz = d.V.z - z, l = Math.hypot(vx, vz) || 1;
      ex = x + vx / l * D; ez = z + vz / l * D;
    }
    tp(ex, ez);
    // машина носом к месту: камера игры (по ней отсекается статика — cull.js) смотрит туда же, куда наш глаз
    const cx = d.V.x, cz = d.V.z, h = Math.atan2(x - cx, z - cz);
    const pose = () => { const V = d.V; V.x = cx; V.z = cz; V.h = h; V.y = d.groundH(cx, cz); if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = h; } };
    const hold0 = hold; hold = () => { hold0(); pose(); };
    for (let k = 0; k < 30; k++) { hold(); await wait(40); }
    for (const sv of seas) {
      d.setSeason(sv);
      EYE = [ex, d.groundH(ex, ez) + eh, ez, x, d.groundH(x, z) + Math.min(4, eh * 0.45), z];
      for (let k = 0; k < 25; k++) { hold(); await wait(40); }
      await shot(`${DIR}/${name}_${String(sv).replace('.', '')}.png`);
      out.calls.push([name, sv, calls]);
      if (Q.get('tvcar')) { EYE = null; for (let k = 0; k < 25; k++) { hold(); await wait(40); } await shot(`${DIR}/${name}_${String(sv).replace('.', '')}_car.png`); }
    }
    hold = hold0;
  }
}
return out;
