import { writeFileSync } from 'node:fs';
import { Vector3, Color } from '../../src/vendor/three.module.min.js';
import { Glb } from './glb.mjs';
import { generator, Sprigs } from './leaf-sprigs.mjs';
import { TREES } from './tree-styles.mjs';
import { CrownMesh } from './crown-mesh.mjs';

// Fill the broad grass pockets on the approach to the South depot.
const planting = [
  [-63.5,35.0,1.12,'maple'],[-64.3,46.5,1.06,'poplar'],[-62.8,27.0,0.88,'linden'],[-65.1,18.0,0.91,'birch'],
  [-48.7,50.0,0.85,'maple'],[-47.9,42.0,1.04,'linden'],[-46.9,34.0,0.90,'birch'],[-46.4,22.0,0.86,'rowan'],
];
const twigSides = 7;

export function bakeVerge(assets, ground, allowed) {
  const glb = new Glb();
  glb.data.materials = [{name:'VergeLeaves',doubleSided:true},{name:'Wood',doubleSided:true},{name:'CrownCore',doubleSided:true}];
  const accepted = [];
  const bark = {positions:[],colors:[],indices:[]};
  const sprigs = new Sprigs();
  const crowns = new CrownMesh();
  const random = generator(81163);
  const color = (hex,alpha) => [...new Color(hex).toArray().map(v=>Math.round(v*255)),alpha];
  function triangle(a,b,c,paint) {
    const first = bark.positions.length/3;
    bark.positions.push(...a,...b,...c);
    bark.indices.push(first,first+1,first+2);
    for(let i=0;i<3;i++) bark.colors.push(...paint);
  }
  function group(center,sizes,yaw,paint,frame) {
    const cos=Math.cos(yaw),sin=Math.sin(yaw);
    const [wide,tall,deep]=sizes;
    const count=Math.max(6,Math.round(51*(wide*tall+deep*tall+wide*deep)/3));
    for(let i=0;i<count;i++) {
      const tilt=1.0-2.0*(i+0.33)/count;
      const ring=Math.sqrt(1.0-tilt*tilt);
      const turn=i*2.39996+random()*0.45;
      const fringe=Math.pow(Math.max(0.0,Math.sin(turn*2.7+tilt*3.1)),2.0)*0.34;
      const r=0.79+random()*0.28+fringe;
      const x=Math.cos(turn)*ring,z=Math.sin(turn)*ring;
      const [u,w]=[x*cos-z*sin,x*sin+z*cos];
      const at=[center[0]+r*u*wide,center[1]+r*tilt*tall,center[2]+r*w*deep];
      const normal=new Vector3(u+(random()-0.5)*0.9,tilt+(random()-0.5)*1.27,w+(random()-0.5)*0.9).normalize();
      const light=0.77+(tilt+1.0)*0.16+random()*0.30;
      const tint=paint.map((v,i)=>i<3?Math.min(255,Math.round(v*light)):v);
      sprigs.add(at,normal,0.67+random()*0.73,tint,random,frame);
    }
  }
  function branch(start,end,radius,tip,shade) {
    const a=new Vector3(...start),b=new Vector3(...end);
    const axis=b.clone().sub(a).normalize();
    const tangent=axis.clone().cross(new Vector3(0,0,1)).normalize();
    const bitangent=axis.clone().cross(tangent).normalize();
    const ring=(center,width,i)=>{
      const theta=i/twigSides*Math.PI*2;
      return center.clone().addScaledVector(tangent,width*Math.cos(theta))
        .addScaledVector(bitangent,width*Math.sin(theta)).toArray();
    };
    for(let i=0;i<twigSides;i++) {
      const paint=color(shade[i%shade.length],0);
      const u=ring(a,radius,i),v=ring(a,radius,i+1),s=ring(b,tip,i),t=ring(b,tip,i+1);
      triangle(u,v,t,paint);
      triangle(u,t,s,paint);
    }
  }
  for(const [x,z,scale,species] of planting) {
    const style=TREES[species];
    if(!allowed(x,z)) continue;
    const thickness=0.49*scale*style.width;
    const rise=scale*style.height*1.39;
    accepted.push([x,z,thickness]);
    const y=ground([x,z]);
    const pt=(u,v,w)=>[x+u*scale*style.width-0.035*v,y+v*rise,z+w*scale*style.width];
    branch(pt(0,-0.10,0),pt(-0.18,3.8,0.07),thickness,0.19*scale,style.bark);
    branch(pt(-0.18,3.7,0.07),pt(0.12,6.8,-0.05),0.20*scale,0.04*scale,style.bark);
    const turn=random()*6.283;
    const leaf=(center,ex,ey,ez,k)=>{
      const paint=[...(k%3===1?style.outer:style.leaf),255];
      const dimensions=[ex*scale*style.width,ey*rise*0.87,ez*scale*style.width];
      const angle=turn+k*1.67;
      if(Math.min(...dimensions)>0.55) {
        crowns.add(center,dimensions.map(v=>v*0.80),angle,style,Math.max(0,Math.min(1,(center[1]-y-3.1)/5.0)));
      }
      group(center,dimensions,angle,paint,style.face);
    };
    leaf(pt(-0.2,6.4,0.07),2.5,2.42,2.42,3);
    leaf(pt(0.38,7.75,-0.20),1.8,1.64,1.63,1);
    for(let n=0;n<style.branches;n++) {
      const theta=turn+n*2.399;
      const r=1.65+random()*1.20;
      const h=3.95+random()*2.34;
      const u=Math.cos(theta),v=Math.sin(theta);
      branch(pt(-0.18,2.52+n*0.14,0.05),pt(u*r,h,v*r),scale*(0.15-n*0.007),0.035*scale,style.bark);
      leaf(pt(u*r,h+0.50,v*r),1.28+random()*0.73,1.06+random()*0.66,1.26+random()*0.48,n);
      if(n%2==0) leaf(pt(u*(r+0.47),h-0.66,v*(r+0.38)),0.95,0.70,0.76,n+2);
      leaf(pt(u*(r+0.57),h+0.82,v*(r+0.66)),0.87,0.84,0.91,n+1);
      for(let chip=0;chip<5;chip++) {
        const a=theta+(random()-0.5)*1.8, rad=r+0.47+random()*0.47;
        const height=h+0.44+random()*1.18, size=0.34+random()*0.30;
        leaf(pt(Math.cos(a)*rad,height,Math.sin(a)*rad),size,size*0.78,size,n+chip);
      }
      const fringe = r+1.07;
      leaf(pt(u*fringe,h+0.24,v*fringe),0.69,0.76,0.81,n+3);
    }
  }
  sprigs.write(glb,'Crowns',0);
  crowns.write(glb,'InteriorCrowns',2);
  glb.mesh('Trunks',new Float32Array(bark.positions),bark.indices,1,{colors:new Uint8Array(bark.colors)});
  writeFileSync(new URL('south-verge.glb',assets),glb.encode());
  return accepted;
}
