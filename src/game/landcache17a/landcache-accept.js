/* Outside timing only. Independent data target; never restore/activate the live RLAND. */
import {createLandCover} from '../landcover.js';
import {createLandMask} from '../landmask.js';
import {encodeCheckpoint,decodeCheckpoint,restoreResult,captureResult} from './checkpoint-codec.js';
import {limitsOf,budget} from './checkpoint-limits.js';
const ok=(v,c)=>{if(!v)throw Error('land-export17a:'+c);};
const same=(a,b)=>Object.is(a,b)||!!(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
const equalBytes=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
export function makeDataTarget(){const cover=createLandCover(),green=createLandCover();return{cover,green,finalMask:createLandMask((x,z)=>green.height(x,z)>cover.height(x,z)||!cover.covered(x,z),(...args)=>[...cover.breaks(...args),...green.breaks(...args)]),ST:{built:false,supportReady:false}};}
function pointsFor(s){const out=[];for(const c of [s.cover,s.green,s.mask.kept]){const pages=c.packed?.blocks||[];for(const page of [...new Set([0,Math.floor(pages.length/2),pages.length-1])]){const p=pages[page];if(!p)continue;for(const i of [...new Set([0,Math.floor(p.n/2),p.n-1])]){const ids=p.indices.subarray(i*3,i*3+3);out.push([ids.reduce((n,id)=>n+p.xy[id*2],0)/3,ids.reduce((n,id)=>n+p.xy[id*2+1],0)/3]);}}}let yes=false,no=false,maxX=0,maxZ=0;for(const[i,row]of s.mask.domain)for(const[j,state]of row){maxX=Math.max(maxX,i*32);maxZ=Math.max(maxZ,j*32);if(state?!yes:!no){out.push([i*32+16,j*32+16]);if(state)yes=true;else no=true;}}out.push([maxX+96,maxZ+96]);const a=s.mask.segments;for(const i of [...new Set([0,Math.floor(a.length/8)*4,a.length-4])])if(i>=0&&i+3<a.length)out.push([(a[i]+a[i+2])/2,(a[i+1]+a[i+3])/2]);return out.slice(0,48);}
function query(t,points,skip){const {cover:c,green:g,finalMask:m}=t;return points.map(([x,z])=>{const square=[[x-.5,z-.5],[x+.5,z-.5],[x+.5,z+.5],[x-.5,z+.5]],bounds=[x-2,z-2,x+2,z+2];return{drawInputs:[c,g,m.kept].map(field=>field.inBox(bounds).slice(0,512).map(t=>({id:t.id,p:t.p,lift:t.lift,rgb:t.rgb,initial:t.initial}))),heights:[c.height(x,z),g.height(x,z),m.kept.height(x,z)],sides:[c.sideHeights(x,z,1,0),g.sideHeights(x,z,1,0),m.sides(x,z,1,0)],state:m.cellState(x,z),contains:m.contains(x,z),parts:[...m.parts(square,p=>c.cut(p))],breaks:m.breaks(x-1,z,x+1,z),boundaries:[...m.boundaries({bounds,accept:(a,b)=>!skip?.(a,b),floorAt:(a,b)=>{const h=c.height(a,b);return Number.isFinite(h)?h:.085;},floorBreaks:(...v)=>c.breaks(...v,.49)})].filter(Boolean)};});}
export function acceptCleanRoundtrip(source,snapshot,identity,{limits={},skip=null}={}){
 const bytes=encodeCheckpoint(snapshot,identity,{limits}),L=limitsOf(limits),fields=[snapshot.cover,snapshot.green,snapshot.mask.kept],cells=fields.reduce((n,c)=>n+c.grid.size,0),domainCells=snapshot.mask.domainCells,domainRows=snapshot.mask.domain.size,pages=fields.reduce((n,c)=>n+(c.packed?.blocks.length||0),0),ids=fields.reduce((n,c)=>n+[...c.grid.values()].reduce((m,list)=>m+list.length,0),0);
 // Owned snapshot, wire, decoded target, re-capture and re-encode exist only in this export acceptance.
 budget(ok,L,{bytes:bytes.length,inputBytes:3*bytes.length+3*cells*192+3*domainCells*96+3*domainRows*128,cells,domainCells,domainRows,pages,ids});
 const decoded=decodeCheckpoint(bytes,identity,{limits}),target=makeDataTarget(),points=pointsFor(snapshot),expected=query(source,points,skip),refs=[source.cover,source.green,source.finalMask,source.finalMask.kept];
 restoreResult(target,decoded,{prepared:true,limits});
 const again=encodeCheckpoint(captureResult(target,{prepared:true,completed:true,deferDraw:true,limits}),identity,{limits});ok(equalBytes(bytes,again),'ROUNDTRIP_BYTES');ok(same(expected,query(target,points,skip)),'ROUNDTRIP_QUERIES');
 target.cover.triangle(1e9,1e9,1e9+2,1e9,1e9,1e9+2,.33);target.cover.compact();restoreResult(target,decoded,{prepared:true,limits});
 ok(equalBytes(bytes,encodeCheckpoint(captureResult(target,{prepared:true,completed:true,deferDraw:true,limits}),identity,{limits})),'REPEAT_BYTES');ok(same(expected,query(target,points,skip)),'REPEAT_QUERIES');
 ok(refs.every((r,i)=>r===[source.cover,source.green,source.finalMask,source.finalMask.kept][i])&&!source.ST.built&&!source.ST.supportReady,'LIVE_SOURCE_CHANGED');
 return{bytes,summary:{version:1,byteExact:true,repeated:true,queryPoints:points.length,selectedDrawInputs:true,rendered:false,bytes:bytes.length,liveRestored:false,activated:false}};
}
