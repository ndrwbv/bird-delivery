// Run only through tools/probe.cjs: its save/session is disposable.
const assert = (ok, msg) => { if (!ok) throw Error(msg); };
const startOrigin = performance.timeOrigin;
const inp = document.querySelector('#crm-nin');
if (inp) { inp.value = 'Аудит загрузки'; document.querySelector('.crm-nok').click(); }
const early = { at: performance.now(), busy: d.LATE.busy(), left: d.LATE.left() };
const swap = document.querySelector('.crm-swap');
assert(swap, 'No profile button');
swap.click();
early.overlay = !!document.querySelector('.late-wait');
assert(await until(() => !!d.PROF.root(), 200000), 'Profiles never opened');
early.openMs = Math.round(performance.now() - early.at);
early.full = window.__boot.full;
early.busyAfter = d.LATE.busy();
log({ early });
const build = JSON.stringify(d.BUILD_T);
const stage = { boot: {pre:window.__boot.pre,game:window.__boot.game,menu:window.__boot.menu,full:window.__boot.full}, build:d.BUILD_T, late:d.LATE.T, max:d.LATE.MAX, land:{...d.LAND_STREAM.stats}, workers:d.RLAND.ST.workers, fallbacks:d.RLAND.ST.workerFallbacks };
const id = d.PROF.create('Аудит второго профиля', false);
assert(id, 'Could not create isolated fixture');
d.PROF.use(1, false);
d.PROF.back();
const rows = [];
async function select(id, label) {
  const t0 = performance.now();
  document.querySelector('.crm-swap').click();
  assert(await until(() => !!d.PROF.root(), 10000), 'No profile picker');
  const opened = performance.now();
  const btn = document.querySelector('.prf-pick[data-id="'+id+'"]');
  assert(btn, 'No target profile');
  btn.click();
  assert(await until(() => !d.PROF.root() && d.PROF.cur() === id, 20000), 'Switch did not settle');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  rows.push({label,id,openMs:Math.round(opened-t0),selectToTwoFramesMs:Math.round(performance.now()-opened),reprofileMs:Math.round(d.REPROFILE_MS),district:d.DIST.cur(),sameDocument:performance.timeOrigin===startOrigin,sameBuild:JSON.stringify(d.BUILD_T)===build,land:{...d.LAND_STREAM.stats}});
}
for(let i=0;i<3;i++){await select(id,'same-area-'+i);await select(1,'return-'+i);}
localStorage.setItem(d.PROF.phys('dlv-dist-open',id),JSON.stringify(8));
localStorage.setItem(d.PROF.phys('dlv-district',id),JSON.stringify(7));
await select(id,'far-area');
const readyAtSwitch=d.LAND_STREAM.readyAt(d.V.x,d.V.z,640), farStart=performance.now();
assert(await until(()=>d.LAND_STREAM.readyAt(d.V.x,d.V.z,640),90000),'Far menu land did not settle');
const farReadyMs=Math.round(performance.now()-farStart);
await select(1,'far-return');
const resources=performance.getEntriesByType('resource').map(x=>({name:x.name.replace(location.origin,''),ms:Math.round(x.duration),bytes:x.decodedBodySize}));
const count = Object.fromEntries(Object.entries(d.CITY||{}).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]));
return {early,stage,rows,readyAtSwitch,farReadyMs,resources,count,crash:d.crashlog.entries()};
