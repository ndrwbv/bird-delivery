/* Compare with --seed=7 --q=season=0.4&weather=clear, then add &hardcity.
   Optional --q=...&softshots=/absolute/output/prefix writes day/night screenshots. */
await ride();
await until(() => !d.LATE.busy(), 60000);
let clock = 0.3;
Object.defineProperty(d.ENV, 't', { configurable: true, get: () => clock, set: () => {} });
d.ENV.rain = d.ENV.rainWant = 0; d.ENV.rainT = 10000;
const prefix = new URLSearchParams(location.search).get('softshots');
const out = { style: d.SOFTCITY.STYLE, stats: d.SOFTCITY.STATS, tris: d.BUILD_T.tris, phases: [] };
for (const [name, t] of [['day', 0.3], ['sunset', 0.7], ['night', 0.85]]) {
  clock = t;
  await wait(600);
  const lights = d.scene.children.filter(o => o.isLight).map(o => ({ type: o.type, intensity: o.intensity }));
  if (lights.some(o => !Number.isFinite(o.intensity) || o.intensity < 0)) throw Error('Invalid light: ' + name);
  out.phases.push({ name, lights });
  if (prefix) await shot(prefix + '-' + name + '.png');
}
clock = 0.3;
await run(4);
out.frames = frames();
out.world = { houses: d.HOUSES.length, entrances: d.GEN_ENTR.length, spots: d.SPOTS.length, nodes: d.NODES.length };
return out;
