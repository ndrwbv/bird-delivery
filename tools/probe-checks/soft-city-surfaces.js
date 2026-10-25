/* Close inspection of shared pavement/curb outlines. Requires noview and softshots=/absolute/prefix. */
const q=new URLSearchParams(location.search), prefix=q.get('softshots');
if(!prefix||!q.has('noview'))throw Error('Use noview and softshots');
await ride();await until(()=>!d.LATE.busy(),60000);
d.ENV.t=.3;d.ENV.rain=d.ENV.rainWant=0;await wait(400);d.S.paused=true;
const home=[d.V.x,d.V.z],dist=p=>Math.hypot(p[0]-home[0],p[1]-home[1]);
const views=[];
const view=async(name,p,offset=[10,10,10])=>{const y=d.groundH(...p);const pos=[p[0]+offset[0],y+offset[1],p[1]+offset[2]],target=[p[0],y+.2,p[1]];d.cam.position.set(...pos);d.cam.lookAt(...target);d.cam.updateMatrixWorld();d.CULLREFRESH();d.renderer.render(d.scene,d.cam);await wait(100);await shot(prefix+'-'+name+'.png');views.push({name,pos,target});};
const caps=d.CITY.roads.flatMap(r=>(r.softEnds||[]).flatMap((on,i)=>on?[r.p[i?r.p.length-1:0]]:[])).filter(p=>!d.CITY.buildings.some(b=>d.SOFTSURF.contains(b.p,p[0],p[1],5))).sort((a,b)=>dist(a)-dist(b));
if(!caps.length)throw Error('No soft road end');await view('cap',caps[0],[3,18,5]);
const lots=d.CITY.lots.filter(l=>l.softP?.soft).sort((a,b)=>dist(a.p[0])-dist(b.p[0]));
if(!lots.length)throw Error('No soft parking');await view('lot',lots[0].p[0]);
const pockets=d.YCARS.POCKETS.filter(p=>p.outline?.soft).sort((a,b)=>dist([a.cx,a.cz])-dist([b.cx,b.cz]));
if(!pockets.length)throw Error('No soft pocket');await view('pocket',[pockets[0].cx,pockets[0].cz],[9,10,9]);
const plaza=d.CITY.green.filter(g=>g.k==='play'&&g.softP?.soft).sort((a,b)=>dist(a.p[0])-dist(b.p[0]))[0];
if(plaza)await view('playground',plaza.p[0]);
await view('pizza',[d.PIZZA.x,d.PIZZA.z],[14,11,14]);
return {views,surfaces:d.SOFTSURF.ST};
