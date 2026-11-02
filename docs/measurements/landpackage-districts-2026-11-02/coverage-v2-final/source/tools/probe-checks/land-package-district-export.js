/* Diagnostic export only. Observe the already selected pizzeria before late jobs; never select a district or leave the menu. */
const query = new URLSearchParams(location.search), targets = query.getAll('startupdistrict');
if (!query.has('landexport17b') || targets.length !== 1 || !/^(0|3|7)$/.test(targets[0])) throw Error('District export requires landexport17b and one startupdistrict=0|3|7');
const target = Number(targets[0]);
const preLate = window.__landPackage17bPreLate, property = Object.getOwnPropertyDescriptor(window, '__landPackage17bPreLate');
if (!preLate || property?.value !== preLate || property.writable || property.configurable || !Object.isFrozen(preLate) || !Object.isFrozen(preLate.pizza)) throw Error('Immutable pre-late pizzeria observation missing');
if (preLate.phase !== 'city-pizzeria-before-late' || !Number.isFinite(preLate.at) || preLate.at < 0 || preLate.district !== target || preLate.pizzaIndex !== target || preLate.lateWorkStarted !== false) throw Error('Invalid pre-late pizzeria observation: ' + JSON.stringify(preLate));
const pizza = d.PIZZERIAS[target], fields = ['x', 'z', 'bx', 'bz'];
if (!pizza || !fields.every(key => Number.isFinite(preLate.pizza[key]) && Number.isFinite(pizza[key]) && Object.is(preLate.pizza[key], pizza[key]))) throw Error('Pre-late pizzeria coordinates differ from actual target');
const assertMenuPizzeria = () => {
  if (d.S.state !== 'title' || d.S.ride || d.CAREERM?.shiftOn?.() || window.__startupTrace?.firstControl) throw Error('District export left the ordinary menu');
  if (d.DIST.cur() !== target || d.PZ_CUR !== pizza || d.PIZZERIAS[target] !== pizza || window.__landPackage17bPreLate !== preLate || !fields.every(key => Object.is(pizza[key], preLate.pizza[key]))) throw Error('Actual selected pizzeria changed during export');
};
assertMenuPizzeria();
if (!await until(() => ['ready', 'failed'].includes(window.__landPackage17bExport?.meta()?.phase), 300000)) throw Error('Ordinary district land export did not finish');
const meta = window.__landPackage17bExport.meta();
if (meta.phase !== 'ready' || meta.error || meta.cleanCalls !== 1 || meta.randomCalls !== 0 || !meta.summary?.byteExact || meta.conditions?.district !== target) throw Error('Ordinary district land export rejected: ' + JSON.stringify(meta));
assertMenuPizzeria();
const crash = d.crashlog.entries();
if (crash.length) throw Error('Ordinary district land export crashed: ' + JSON.stringify(crash));
return { ok: true, meta, preLate, target, state: d.S.state,
  current: { district: d.DIST.cur(), pizzaIndex: d.PIZZERIAS.indexOf(d.PZ_CUR), pizza: Object.fromEntries(fields.map(key => [key, pizza[key]])), samePizzeriaReference: d.PZ_CUR === pizza },
  graphics: { preset: d.GFX.preset, device: d.GFX.dev, width: innerWidth, height: innerHeight }, descriptor: d.LAND_RNG?.() || null, crash };
