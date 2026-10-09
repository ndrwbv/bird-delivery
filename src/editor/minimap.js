/* Мини-карта редактора: город сверху (зелень, дома, дороги, забор), где камера и куда смотрит,
   пометки и правки. Клик — камера туда. «весь город» / «рядом» — масштаб. Рисуется 4 раза в секунду. */
export function makeMinimap (canvas, d, onPick) {
  const C = d.CITY || d.MAP.data;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const ext = p => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; };
  for (const q of C.border || []) ext(q);
  if (!isFinite(x0)) for (const r of C.roads || []) for (const q of r.p) ext(q);
  const M = { near: false, view: null };
  const ctx = canvas.getContext('2d');

  function frame (cx, cz) {
    const W = canvas.width, H = canvas.height;
    let bx0, bz0, bw, bh;
    if (M.near) { const R = 900; bx0 = cx - R; bz0 = cz - R * H / W; bw = 2 * R; bh = 2 * R * H / W; }
    else { const pad = 60; bx0 = x0 - pad; bz0 = z0 - pad; bw = x1 - x0 + 2 * pad; bh = z1 - z0 + 2 * pad; }
    const k = Math.min(W / bw, H / bh);
    const ox = (W - bw * k) / 2 - bx0 * k, oz = (H - bh * k) / 2 - bz0 * k;
    return { k, ox, oz, X: x => ox + x * k, Z: z => oz + z * k, inv: (px, pz) => [(px - ox) / k, (pz - oz) / k] };
  }
  const poly = (F, p) => { ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(F.X(q[0]), F.Z(q[1])) : ctx.moveTo(F.X(q[0]), F.Z(q[1])))); ctx.closePath(); };

  /** st: { cam: {x, z, yaw}, notes, adds, removes, sel } */
  function draw (st) {
    const dpr = window.devicePixelRatio || 1, w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const F = M.view = frame(st.cam.x, st.cam.z);
    ctx.fillStyle = '#dfe8cf'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#bcd59e';
    for (const g of C.green || []) { if (g.p && g.p.length > 2) { poly(F, g.p); ctx.fill(); } }
    ctx.fillStyle = '#9cc3e0';
    for (const g of C.water || []) { const p = g.p || g; if (p && p.length > 2) { poly(F, p); ctx.fill(); } }
    ctx.fillStyle = '#b59f80';
    for (const b of C.buildings || []) { if (b.p && b.p.length > 2) { poly(F, b.p); ctx.fill(); } }
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    for (const r of C.roads || []) {
      if (!r.p || r.p.length < 2) continue;
      ctx.lineWidth = Math.max(0.7 * dpr, (r.w || 6) * F.k);
      ctx.strokeStyle = r.c >= 6 ? '#efe4c8' : '#ffffff';
      ctx.beginPath(); r.p.forEach((q, i) => (i ? ctx.lineTo(F.X(q[0]), F.Z(q[1])) : ctx.moveTo(F.X(q[0]), F.Z(q[1])))); ctx.stroke();
    }
    if (C.border && C.border.length > 2) { ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.strokeStyle = '#7a2d1f'; ctx.lineWidth = 1.5 * dpr; poly(F, C.border); ctx.stroke(); ctx.setLineDash([]); }
    const dot = (x, z, r, fill, line) => { ctx.beginPath(); ctx.arc(F.X(x), F.Z(z), r * dpr, 0, 7); ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.strokeStyle = line; ctx.lineWidth = dpr; ctx.stroke(); } };
    for (const a of st.adds || []) dot(a.x, a.z, 2.5, '#2f6fd0');
    for (const r of st.removes || []) dot(r.x, r.z, 2.5, '#222');
    for (const n of st.notes || []) dot(n.x, n.z, 4, n.done ? '#3c8d40' : '#d63a26', '#fff');
    if (st.sel) dot(st.sel.x, st.sel.z, 6, 'rgba(255,204,0,.5)', '#000');
    // камера: точка и клин взгляда
    const cx = F.X(st.cam.x), cz = F.Z(st.cam.z), a = st.cam.yaw, L = 16 * dpr;
    ctx.beginPath(); ctx.moveTo(cx, cz);
    ctx.lineTo(cx + (-Math.sin(a - 0.45)) * L, cz + (-Math.cos(a - 0.45)) * L);
    ctx.lineTo(cx + (-Math.sin(a + 0.45)) * L, cz + (-Math.cos(a + 0.45)) * L);
    ctx.closePath(); ctx.fillStyle = 'rgba(255,216,94,.75)'; ctx.fill(); ctx.strokeStyle = '#3a3226'; ctx.lineWidth = dpr; ctx.stroke();
    dot(st.cam.x, st.cam.z, 3.5, '#ffd85e', '#3a3226');
  }

  canvas.addEventListener('click', e => {
    if (!M.view) return;
    const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width;
    const [x, z] = M.view.inv((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    onPick(Math.round(x), Math.round(z));
  });
  return { draw, M, bounds: { x0, z0, x1, z1 } };
}
