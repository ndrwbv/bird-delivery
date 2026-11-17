import { readFileSync } from 'node:fs';

function nearestStreet(x,z,roads) {
  let closest=null;
  let edge=Infinity;
  for(const [u,v,a,b,width,kind] of roads) {
    const dx=a-u,dz=b-v,length=Math.hypot(dx,dz);
    if(kind>5 || width<4.8 || length<0.1) continue;
    const along=Math.min(length,Math.max(0,((x-u)*dx+(z-v)*dz)/length));
    const ahead=dx/length,across=dz/length;
    const roadX=u+ahead*along,roadZ=v+across*along;
    const distance=Math.hypot(roadX-x,roadZ-z);
    const gap=distance-width*0.5;
    if(gap>=edge) continue;
    const sign=Math.sign((roadX-x)*across-(roadZ-z)*ahead)||1;
    closest={roadX,roadZ,ahead,across,nx:across*sign,nz:-ahead*sign,width,gap};
    edge=gap;
  }
  return closest;
}

export function streetlightPositions(assets,bounds,roads,props) {
  const mesh=readFileSync(new URL('south-breakables.bin',assets));
  const [minX,minZ,maxX,maxZ]=bounds;
  return props.filter(({kind,at:[x,,z]})=>kind==='lamp' && x>=minX && x<=maxX && z>=minZ && z<=maxZ)
    .map(({id,at:[x,y,z],min,max,offset,count})=>{
      const road=nearestStreet(x,z,roads);
      let top=0;
      const points=[];
      // The captured lamp also owns its cables. A span must not pull the bulb away from its pole.
      for(let i=0;i<count;i++) {
        const index=offset+i*16;
        const u=mesh.readFloatLE(index),v=mesh.readFloatLE(index+8);
        if(Math.hypot(u,v)>4.4) continue;
        const h=mesh.readFloatLE(index+4);
        const [r,g,b]=mesh.subarray(index+12,index+15);
        top=Math.max(top,h);
        points.push([u,h,v,Math.max(r+g+b-360,0)]);
      }
      let total=0,dx=0,dz=0,headY=0;
      for(const [u,h,v,weight] of points) {
        if(h<top-0.70 || weight===0) continue;
        total+=weight;
        dx+=u*weight;
        dz+=v*weight;
        headY+=h*weight;
      }
      const approximate=Math.min(2.2,Math.max(0.45,top*0.21));
      const arm=Math.hypot(dx,dz)/Math.max(total,1);
      const street=road!==null && (road.gap<3.6 && top>4.6 || road.gap<9.0 && top>5.1 && arm>0.45);
      const hasWires=Math.max(max[0]-min[0],max[2]-min[2])>9.0;
      const scale=street && !hasWires && top>4.3 ? Math.max(1,(road.width>=7.5 ? 9.4 : 8.6)/top) : 1;
      const head=[x+(total ? dx/total : street ? road.nx*approximate : 0),
        y+(total ? headY/total : top-0.16)*scale,
        z+(total ? dz/total : street ? road.nz*approximate : 0)];
      const axis=street ? [road.ahead,road.across] : [1,0];
      const reach=street ? Math.max(0,Math.min(4.3,(road.roadX-head[0])*road.nx+(road.roadZ-head[2])*road.nz)) : 0;
      const pool=street ? [head[0]+road.nx*reach,head[2]+road.nz*reach] : [head[0],head[2]];
      const radii=street ? [17.4+road.width*0.37,7.5+road.width*0.27] : [7.0,7.0];
      return {id,base:[x,y,z],head,scale,street,axis,pool,radii};
    });
}
