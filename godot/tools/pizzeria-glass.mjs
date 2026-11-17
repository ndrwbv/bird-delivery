import { CircleGeometry, Shape, ShapeGeometry, Vector3 } from '../../src/vendor/three.module.min.js';
import { STYLES } from '../../src/game/pizzastyles.js';

export function bakePizzeriaGlass(city,material,area,entrance,ground) {
  const positions=[],colors=[],uv=[],uv2=[],indices=[];
  const [x,z]=area.home;
  const floor=ground+0.45;
  const side=[entrance.front[1],-entrance.front[0]];
  const pickupSide=(area.spawn[0]-x)*side[0]+(area.spawn[1]-z)*side[1]>=0 ? 1 : -1;
  function vertex(point,u,v,width,height,seed) {
    positions.push(...point);
    colors.push(77,65,43,seed);
    uv.push(u,v);
    uv2.push(width,height);
    return positions.length/3-1;
  }
  for (const [index,[angle,height,radius,kind]] of STYLES[0].win.entries()) {
    if(Math.abs(angle-pickupSide*62)<20 && 9*Math.sin(height*Math.PI/180)<3.85) continue;
    const turn=entrance.yaw+angle*Math.PI/180;
    const elevation=height*Math.PI/180;
    const center=new Vector3(Math.sin(turn)*Math.cos(elevation),Math.sin(elevation),Math.cos(turn)*Math.cos(elevation));
    const tangent=new Vector3(Math.cos(turn),0,-Math.sin(turn));
    const up=center.clone().cross(tangent);
    let shape;
    if(kind==='o') {
      shape=new CircleGeometry(radius,24);
    } else {
      const outline=new Shape();
      outline.moveTo(0,-radius*1.15);
      outline.lineTo(radius*0.95,radius*0.55);
      outline.quadraticCurveTo(0,radius*1.05,-radius*0.95,radius*0.55);
      outline.closePath();
      shape=new ShapeGeometry(outline,8);
    }
    const start=positions.length/3;
    const source=shape.attributes.position;
    for(let i=0;i<source.count;i++) {
      const u=source.getX(i),v=source.getY(i);
      const point=center.clone().multiplyScalar(9.0).addScaledVector(tangent,u).addScaledVector(up,v)
        .normalize().multiplyScalar(9.105);
      vertex([x+point.x,floor+point.y,z+point.z],u/(radius*2.1)+0.5,v/(radius*2.4)+0.5,
        radius*2.1,radius*2.4,(index*37+91)%255);
    }
    for(const i of shape.index.array) indices.push(start+i);
  }
  const [ex,ez]=entrance.door;
  function portal(u,v) {
    return vertex([ex+side[0]*u+entrance.front[0]*0.028,floor+v,
      ez+side[1]*u+entrance.front[1]*0.028],u/5.7+0.5,v/4.4,5.7,4.4,232);
  }
  function portalQuad(a,b,lo,ta,tb) {
    const i=portal(a,lo),j=portal(b,lo),k=portal(b,tb),l=portal(a,ta);
    indices.push(i,j,k,i,k,l);
  }
  for(const [first,last] of [[-2.87,-1.065],[-1.065,1.065],[1.065,2.87]]) {
    for(let i=0;i<10;i++) {
      const a=first+(last-first)*i/10,b=first+(last-first)*(i+1)/10;
      const top=u=>1.5+Math.sqrt(2.89**2-u*u);
      const bottom=first>=-1.065 && last<=1.065 ? 2.41 : 0.00;
      portalQuad(a,b,bottom,top(a),top(b));
    }
  }
  city.mesh('PizzeriaGlass',Float32Array.from(positions),indices,material,{
    colors:Uint8Array.from(colors),uv:Float32Array.from(uv),uv2:Float32Array.from(uv2)
  });
}
