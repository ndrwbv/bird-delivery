// Serialise the actual clear/sand/snow corridors, tread gaps and ploughed banks.
export function winterReceivers(W, city, maps, region, inside) {
  const degrees = new Map(), pt = ([x,z]) => x+','+z;
  for (const road of city.roads) {
    if (!maps.drivable(road) || road.c>5) continue;
    for (let i=1;i<road.p.length;i++) {
      const a=pt(road.p[i-1]), b=pt(road.p[i]);
      if (!degrees.has(a)) degrees.set(a,new Set());
      if (!degrees.has(b)) degrees.set(b,new Set());
      degrees.get(a).add(b); degrees.get(b).add(a);
    }
  }
  const noop = {color(){},disc(){},tri3(){}};
  W.build({roads:city.roads,roadWidth:maps.roadWidth,junction:(x,z)=>(degrees.get(x+','+z)?.size||0)>=3,
    groundH:()=>0,yOf:()=>0.14,M:noop,softM:noop,rutM:noop,sendRoadSheets:()=>true});
  const [ox,oz] = region.origin, margin = 18;
  const [x0,z0,x1,z1] = region.bounds;
  function visible(ax,az,bx,bz) {
    if (Math.min(ax,bx)>x1+ox+margin || Math.max(ax,bx)<x0+ox-margin ||
        Math.min(az,bz)>z1+oz+margin || Math.max(az,bz)<z0+oz-margin) return false;
    const n = Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/12));
    for (let i=0;i<=n;i++) {
      const x=ax+(bx-ax)*i/n, z=az+(bz-az)*i/n;
      if (inside(x,z)||inside(x+margin,z)||inside(x-margin,z)||inside(x,z+margin)||inside(x,z-margin)) return true;
    }
    return false;
  }
  for (const road of city.roads) {
    if (!road.b || road.c>5 || !road.p.some(([x,z])=>inside(x,z))) continue;
    W.bridge({M:noop,softM:noop,road,points:road.p.map(([x,z])=>[x,0,z]),width:maps.roadWidth(road)});
  }
  const {segments,banks} = W.nativeReceivers();
  const fmt = n=>Math.round(n*1000)/1000;
  const corridors = [...new Set(segments.map(s=>s.corridor))].sort();
  const roads = [];
  for (const s of segments) {
    if (!visible(...s.a,...s.b)) continue;
    const gaps = [];
    for (const b of s.breaks) {
      const a=b.at-s.along;
      if (a+b.ramp+b.core>=-0.1 && a-b.ramp-b.core<=s.len+0.1) gaps.push(fmt(a),fmt(b.core),fmt(b.ramp));
    }
    roads.push([fmt(s.a[0]-ox),fmt(s.a[1]-oz),fmt(s.b[0]-ox),fmt(s.b[1]-oz),
      fmt(s.w),s.count,s.road.c,s.clear?2:s.sand?1:0,Number(!!s.road.b),corridors.indexOf(s.corridor),gaps]);
  }
  const mounds = [];
  for (const bank of banks) {
    const x=bank.x+bank.ux*bank.d0-bank.uz*bank.off,z=bank.z+bank.uz*bank.d0+bank.ux*bank.off;
    const len=bank.d1-bank.d0;
    if (!visible(x,z,x+bank.ux*len,z+bank.uz*len)) continue;
    mounds.push([fmt(x-ox),fmt(z-oz),fmt(bank.ux),fmt(bank.uz),fmt(len),fmt(bank.width),
      fmt(bank.base),fmt(bank.height),fmt(bank.phase),Number(bank.bridge)]);
  }
  return {roads,banks:mounds};
}

// Directory of 32 m cells followed by small UTF-8 chunks. Godot only decodes
// the cells currently touching the vehicle; reading these must not stall spawn.
export function packWinterCells(data) {
  const cells = new Map(), side = 32;
  function put(row, slot, x1,z1,x2,z2, pad) {
    for (let x=Math.floor((Math.min(x1,x2)-pad)/side);x<=Math.floor((Math.max(x1,x2)+pad)/side);x++)
      for (let z=Math.floor((Math.min(z1,z2)-pad)/side);z<=Math.floor((Math.max(z1,z2)+pad)/side);z++) {
        const key=x+','+z;
        if (!cells.has(key)) cells.set(key,[[],[]]);
        cells.get(key)[slot].push(row);
      }
  }
  for (const r of data.roads) put(r,0,r[0],r[1],r[2],r[3],r[4]*0.5+8);
  for (const b of data.banks) put(b,1,b[0],b[1],b[0]+b[2]*b[4],b[1]+b[3]*b[4],b[5]);
  const coords = [...cells.keys()].map(k=>k.split(',').map(Number));
  const xmin=Math.min(...coords.map(c=>c[0])),zmin=Math.min(...coords.map(c=>c[1]));
  const cols=Math.max(...coords.map(c=>c[0]))-xmin+1,rows=Math.max(...coords.map(c=>c[1]))-zmin+1;
  const header=Buffer.alloc(16+cols*rows*8);
  [xmin,zmin,cols,rows].forEach((n,i)=>header.writeInt32LE(n,i*4));
  const parts=[header];
  let offset=header.length;
  for (const [x,z] of coords) {
    const key=16+((z-zmin)*cols+x-xmin)*8;
    const bytes=Buffer.from(JSON.stringify(cells.get(x+','+z)));
    header.writeUInt32LE(offset,key);header.writeUInt32LE(bytes.length,key+4);
    parts.push(bytes);offset+=bytes.length;
  }
  return Buffer.concat(parts);
}
