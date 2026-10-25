/* №9: первый проход у точек конкурентов. Шаг мира измеряется целиком на живой игре.
   npm run probe -- --eval=tools/probe-checks/rival-first-pass.js --cpu=3 --size=deck --seed=7 --max=0 */
const R=d.RIV, PF=d.crashlog.PROF, rows=[], samples=[];
let phase='начало смены';
PF.fn=(name,ms)=>{if(name==='rivalshops')samples.push({phase,ms});};
try {
  await onShift(); await wait(2000);
  const shops=R.SHOPS.filter(s=>!s.near).sort((a,b)=>Math.hypot(a.x-d.V.x,a.z-d.V.z)-Math.hypot(b.x-d.V.x,b.z-d.V.z)).slice(0,8);
  for(let i=0;i<shops.length;i++){
    const s=shops[i];phase='точка '+i+' '+s.chain;
    const b0=R.ST.bcars, jobs0=R.SHOPS.filter(s=>s.jobsAt).length;
    tp(s.x,s.z); await wait(2500);
    const q=samples.filter(x=>x.phase===phase).map(x=>x.ms).sort((a,b)=>a-b);
    rows.push({phase,x:Math.round(s.x),z:Math.round(s.z),n:q.length,max:+(q.at(-1)||0).toFixed(2),p95:+(q[Math.floor(q.length*.95)]||0).toFixed(2),cars:R.ST.bcars-b0,newJobLists:R.SHOPS.filter(s=>s.jobsAt).length-jobs0});
  }
  const initial=samples.filter(x=>x.phase==='начало смены').map(x=>x.ms);
  return {rows,initialMax:+Math.max(0,...initial).toFixed(2),cars:R.ST.bcars,shops:R.SHOPS.length,jobLists:R.SHOPS.filter(s=>s.jobsAt).length,slow:samples.filter(x=>x.ms>4).map(x=>({...x,ms:+x.ms.toFixed(2)})).slice(0,20),crashes:d.crashlog.list?.()};
} finally {PF.fn=null;}
