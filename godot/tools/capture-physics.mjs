const ORIGIN = [3181, 2071];
const LIMITS = [-365, -545, 310, 284];
const inArea = (x, z, pad = 15) => x >= LIMITS[0]-pad && x <= LIMITS[2]+pad
  && z >= LIMITS[1]-pad && z <= LIMITS[3]+pad;
const rounded = v => Number(v.toFixed(3));

export async function run(game) {
  const local = (x,z) => [x-ORIGIN[0],z-ORIGIN[1]];
  const solids = [];
  for (const item of game.SOLIDS) {
    const {cx,cz,hw,hd,cs,sn} = item;
    if (![cx,cz,hw,hd,cs,sn].every(Number.isFinite) || item.edGone || !inArea(...local(cx,cz))) continue;
    solids.push([...local(cx,cz),hw,hd,Math.atan2(sn,cs),item.tree?1:0].map(rounded));
  }
  const props = game.SMASH.filter(o => Number.isFinite(o.x) && Number.isFinite(o.z) && inArea(...local(o.x,o.z)))
    .map(o => ({ at:local(o.x,o.z).map(rounded), radius:o.r, kind:o.kind }));
  const roads = game.RSEG.filter(r=>r.c<=7 && inArea(...local((r.x1+r.x2)*0.5,(r.z1+r.z2)*0.5),80))
    .map(r=>[...local(r.x1,r.z1),...local(r.x2,r.z2),r.w??r.road?.w??6,r.c].map(rounded));
  const buildings = game.CITY.buildings.filter(b=>b.p.some(([x,z])=>inArea(...local(x,z),75)))
    .map(b=>({id:b.id, levels:b.lv||1, outline:b.p.map(p=>local(...p))}));
  const arches = game.ARCHES.filter(a=>inArea(...local(a.x,a.z),12))
    .map(a=>({entry:local(a.mx,a.mz),length:a.t,axis:[a.ix,a.iz],side:[a.ux,a.uz],top:a.top,crown:a.crown,round:a.round}));
  const data = { solids, props, roads, buildings, arches };
  console.log(`Captured ${solids.length} solids, ${props.length} objects and ${roads.length} road sections`);
  const response = await fetch('/__write/south-physics-source.json', { method: 'POST', body: JSON.stringify(data) });
  return response.ok;
}
