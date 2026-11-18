// Fauna and cats from the released model factories. Run from any directory.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
import vm from 'node:vm';
const T=await import(new URL('../../src/vendor/three.module.min.js',import.meta.url));
const fauna=readFileSync('src/game/fauna.js','utf8'), cats=readFileSync('src/game/cats.js','utf8');
const ctx={THREE:T,Math:Object.create(Math),Map};
ctx.Math.random=()=>0.1;
vm.createContext(ctx);vm.runInContext(fauna.slice(fauna.indexOf('const GEO ='),fauna.indexOf('function forests')),ctx);
const cat= cats.slice(cats.indexOf('export const FURS'),cats.indexOf('const HOLES')).replaceAll('export ','');
vm.runInContext(cat+';this.cat = (i) => ({g:makeCatModel(THREE,FURS[i])});',ctx);
function store(id,model){
 const {g}=model;g.updateMatrixWorld(true);
 const legs=model.legs||g.userData.legs||[],vertices=[],normals=[],colors=[],uv=[],uv2=[];
 const pos=new T.Vector3(),normal=new T.Vector3(),color=new T.Color(),pivot=new T.Vector3(),normMatrix=new T.Matrix3();
 g.traverse(o=>{
  if(!o.isMesh)return; const m=o.geometry,idx=m.index; let p=o,k=-1;while(p&&k<0){k=legs.indexOf(p);p=p.parent}
  if(k>=0)legs[k].getWorldPosition(pivot);else pivot.set(0,0,0);
  const n=idx?idx.count:m.getAttribute('position').count;normMatrix.getNormalMatrix(o.matrixWorld);
  for(let j=0;j<n;j+=3)for(let delta of [0,2,1]){
   let v=idx?idx.getX(j+delta):j+delta;pos.fromBufferAttribute(m.getAttribute('position'),v).applyMatrix4(o.matrixWorld);
   normal.fromBufferAttribute(m.getAttribute('normal'),v).applyMatrix3(normMatrix).normalize();
   if(m.getAttribute('color'))color.fromBufferAttribute(m.getAttribute('color'),v);else color.copy(o.material.color);
   vertices.push(pos.x,pos.y,pos.z);normals.push(normal.x,normal.y,normal.z);colors.push(color.r,color.g,color.b,1);
   uv.push(pivot.y,pivot.z);uv2.push(k<0?0:[1,-1,-1,1][k],0);
  }
 });
 const fields=[vertices,normals,colors,uv,uv2];
 const binary=Buffer.concat(fields.map(f=>Buffer.from(Float32Array.from(f).buffer)));
 writeFileSync('godot/assets/wildlife/'+id+'.bin',binary);
}
for(let [name,func] of [['moose','mooseModel'],['fox','foxModel'],['hare','hareModel']])store(name,ctx[func]());
ctx.Math.random=()=>.9;store('cow',ctx.mooseModel());
for(let i=0;i<6;i++)store('cat'+i,ctx.cat(i));
