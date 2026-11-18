// Capture all floor quads, posts, worn markings, torn nets and signs using courts.js tennis(c).
import {readFile,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import * as THREE from '../../src/vendor/three.module.min.js';
const root=new URL('../assets/',import.meta.url);
const source=await readFile(new URL('../../src/game/courts.js',import.meta.url),'utf8');
const region=JSON.parse(await readFile(new URL('south-region.json',root)));
const parks=JSON.parse(await readFile(new URL('summer_park.json',root)));
const c=parks.courts[0],net={P:[],N:[],U:[],C:[],I:[],items:[]};
const sign=[],boxes=[],floor=[],posts=[];
const [ox,oz]=region.origin;
const round=x=>Math.round(x*1000)/1000;
let shade;
function ground(x,z){
 const t=region.terrain,gx=(x-ox-t.x)/t.step,gz=(z-oz-t.z)/t.step,ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
 const i=ix+iz*t.width,a=t.heights[i],b=t.heights[i+1],cc=t.heights[i+t.width],d=t.heights[i+t.width+1];
 return (u>=v?a+(b-a)*u+(d-b)*v:a+(d-cc)*u+(cc-a)*v)-region.water_y;
}
const xyz=(x,y,z)=>[round(x-ox),round(y+region.water_y),round(z-oz)];
const M={color(col){shade=col;},poly(p,level){floor.push({color:shade,p:p.map(([x,z])=>xyz(x,ground(x,z)+level,z))})},
 ribbon(x,z,u,v,w,level){const d=Math.hypot(u-x,v-z)||1,t=(v-z)/d*w*.5,s=(x-u)/d*w*.5;M.poly([[x-t,z-s],[u-t,v-s],[u+t,v+s],[x+t,z+s]],level);}};
const api={groundH:ground,LITM:M,box(_,w,h,d,hex,x,y,z,ry=0){boxes.push({size:[w,h,d].map(round),at:xyz(x,y,z),color:hex,yaw:round(ry)})},
 obb(x,z,w,d,ry){posts.push({at:xyz(x,ground(x,z),z),size:[round(w*2),round(d*2)]});}};
const ct=source.slice(source.indexOf('export const CT'),source.indexOf('export const ST')).replace('export ','');
const rng=source.slice(source.indexOf('function hsh'),source.indexOf('const rej'));
const netSource=source.slice(source.indexOf('function netQuad'),source.indexOf('function glassQuad'));
const courts=source.slice(source.indexOf('function post'),source.indexOf('/* лёд поверх пола'));
runInNewContext(ct+rng+netSource+courts+'\ntennis(c);',{A:api,LIT:[],ST:{holes:0,panels:0,gone:0},NET:net,tmpC:new THREE.Color(),
 c,iceRect(){},signQuad(x,y,z,nx,nz,w,h,variant){sign.push({at:xyz(x,y,z),n:[nx,nz].map(round),w,h,variant})}});
const panels=net.items.map(([kind,x,z,radius,start,count])=>({at:[round(x-ox),round(z-oz)],radius:round(radius),start,count}));
const points=[];
for(let i=0;i<net.P.length;i+=3) points.push(xyz(...net.P.slice(i,i+3)));
const nets={points,index:net.I,uv:net.U.map(round),colors:net.C.map(round),panels};
await writeFile(new URL('summer_tennis.json',root),JSON.stringify({at:[round(c.x-ox),round(c.z-oz)],axis:[c.ux,c.uz],floor,boxes,posts,sign,nets})+'\n');
console.log(floor.length,boxes.length,panels.length);
