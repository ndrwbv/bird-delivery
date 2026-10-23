/* Плавные улицы (11ч, этап 4): адреса и подъезды списком — сравнить без и с ?smooth (node tools/smooth-addr-diff.cjs a.json b.json).
   npm run probe -- --eval=tools/probe-checks/smooth-addr.js --max=0 > a.json; … --q=smooth > b.json
   houses — дом с адресом: адрес, точка у фасада (x, z), куда смотрит фасад (ox, oz — наружу из «лицевой» стены bestEdge);
   entr — двери подъездов [x, z, ox, oz]; spots — адреса заказов [x, z]. */
await until(() => d.SPOTS && d.SPOTS.length > 50 && (!d.LATE || !d.LATE.busy()), 60000);
const r2 = v => Math.round(v * 100) / 100;
return {
  smooth: !!(d.SMOOTH && d.SMOOTH.STATS.on),
  houses: d.HOUSES.map(h => { const l = Math.hypot(h.mx - h.x, h.mz - h.z) || 1; return [h.addr, r2(h.x), r2(h.z), r2((h.mx - h.x) / l), r2((h.mz - h.z) / l)]; }),
  entr: d.GEN_ENTR.map(q => q.map(r2)),
  spots: d.SPOTS.map(q => [r2(q.x), r2(q.z)]),
};
