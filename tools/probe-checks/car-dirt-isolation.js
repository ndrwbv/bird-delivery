/* 0п94: общие материалы прохожих не получают грязь и кровь машины курьера. */
await onShift(); await wait(500);
const dirtyPeople = () => {
  let n = 0;
  for (const p of d.PEOPLE) p.grp?.traverse(o => { if (o.isMesh && o.material?.userData.dirt) n++; });
  return n;
};
const rows = [];
for (let i = 0; i < 3; i++) {
  if (i) { d.resetCar(); await wait(500); }
  const n = dirtyPeople();
  if (n) throw new Error('Грязь машины на прохожих: ' + n);
  const mats = new Set();
  d.car.traverse(o => { if (o.isMesh && o.material?.userData.dirt) mats.add(o.material); });
  if (!mats.size) throw new Error('Грязь исчезла со своей машины');
  // Повторное dress той же машины через обычный step не создаёт новые материалы.
  d.DIRT.ST.car = null; await wait(100);
  const after = new Set();
  d.car.traverse(o => { if (o.isMesh && o.material?.userData.dirt) after.add(o.material); });
  if (after.size !== mats.size || [...after].some(m => !mats.has(m))) throw new Error('Повторное dress размножает материалы');
  rows.push({reset:i, dirtyPeople:n, ownMaterials:mats.size});
}
return {ok:true,rows};
