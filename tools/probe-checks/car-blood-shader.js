/* 0п93: кровь потока поверх материала с грязью. Проверяем настоящую компиляцию WebGL:
   первый наезд (carblood.sample) и перенос пятен на подробную модель (FW.bloodTo). */
await onShift();
const T = d.THREE, scene = new T.Scene(), geometry = new T.BoxGeometry(1, 1, 1), groups = [];
const before = new Set(d.renderer.info.programs);
const dirtCar = () => {
  const g = new T.Group();
  const mesh = new T.Mesh(geometry, new T.MeshLambertMaterial({ color: 0xffffff }));
  mesh.frustumCulled = false;
  g.add(mesh); groups.push(g); scene.add(g); // общий материал грязи берём с живой машины ниже
  let material;
  d.car.traverse(o => { if (!material && o.isMesh && o.material?.isMeshLambertMaterial && o.material.userData.dirt && o.material.customProgramCacheKey() === 'carDirt|blood') material = o.material; });
  if (!material) throw new Error('Не найден исходный материал грязи и крови');
  mesh.material.dispose();
  mesh.material = material.clone();
  mesh.material.onBeforeCompile = material.onBeforeCompile;
  mesh.material.customProgramCacheKey = material.customProgramCacheKey;
  return g;
};
try {
  const first = dirtCar(); d.CBLOODM.sample(first);
  const detailed = dirtCar(); d.FW.bloodTo(detailed, first.userData.blood);
  d.renderer.compile(scene, d.cam);
  d.renderer.render(scene, d.cam);
  const programs = d.renderer.info.programs.filter(p => !before.has(p));
  const failed = programs.filter(p => p.diagnostics && !p.diagnostics.runnable);
  if (failed.length) throw new Error('Ошибка компиляции крови: ' + failed.length + ' программ');
  if (!programs.length) throw new Error('Проверка не скомпилировала новую программу');
  return { ok: true, programs: programs.length, scenarios: ['первый наезд', 'перенос на подробную модель'] };
} finally {
  for (const g of groups) g.traverse(o => { if (o.isMesh) o.material.dispose(); });
  geometry.dispose();
}
