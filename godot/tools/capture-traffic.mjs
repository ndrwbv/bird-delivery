import { Glb } from './glb.mjs';

export async function captureTraffic(game,origin,within,write) {
  const glb=new Glb();
  glb.data.materials=[{name:'Traffic paint',doubleSided:true}];
  const cars=game.TRAFFIC.filter(car=>car.mesh && !car.mesh.userData.realLite && !car.svc && !car.bus &&
    car.mesh.children.some(o=>o.geometry?.attributes?.color?.array) && car.model!=='moped');
  const styles=[];
  const styleSet=new Set();
  for(const car of [...cars.filter(o=>!o.parked),...cars]) {
    const key=[car.model,!!car.taxi,car.mesh.userData.bodyHex].join('/');
    if(styleSet.has(key) || styles.filter(o=>o.model===car.model && o.taxi===car.taxi).length>=3) continue;
    const xyz=[],rgba=[],indices=[];
    const point=new game.THREE.Vector3();
    const rgb=new game.THREE.Color();
    for(const part of car.mesh.children) {
      const attr=part.geometry?.attributes;
      if(!part.visible||!attr?.position?.array||part.material.map||part.material.transparent) continue;
      const k=xyz.length/3;
      part.updateMatrix();
      for(let i=0;i<attr.position.count;i++) {
        point.fromBufferAttribute(attr.position,i).applyMatrix4(part.matrix);
        xyz.push(-point.x,point.y,-point.z);
        if(attr.color) rgb.fromBufferAttribute(attr.color,i);
        else rgb.copy(part.material.color);
        rgba.push(...rgb.toArray().map(v=>Math.round(Math.max(0,Math.min(1,v))*255)),0);
      }
      const src=part.geometry.index?.array;
      if(src) for(const i of src) indices.push(i+k);
      else for(let i=0;i<attr.position.count;i++) indices.push(i+k);
    }
    if(indices.length<30) continue;
    const name='Style'+styles.length;
    glb.mesh(name,new Float32Array(xyz),indices,0,{colors:new Uint8Array(rgba)});
    styles.push({model:car.model,taxi:car.taxi,hl:Math.abs(car.hl||2.1)});
    styleSet.add(key);
    if(styles.length>=15) break;
  }
  if(!styles.length) throw new Error('No city traffic model available');
  const parked=[];
  for(const car of game.TRAFFIC) {
    if(!car.parked || car.svc) continue;
    const x=car.x-origin[0],z=car.z-origin[2];
    if(!within(x,z,-4)) continue;
    const fits=styles.map((o,i)=>o.model===car.model&&!o.taxi?i:-1).filter(i=>i>=0);
    const model=fits.length?fits[parked.length%fits.length]:parked.length%styles.length;
    parked.push([x,z,car.h+Math.PI,model].map(v=>+v.toFixed(3)));
  }
  await write('south-traffic-models.glb',glb.encode());
  await write('south-parking.json',JSON.stringify({styles,parked}));
}
