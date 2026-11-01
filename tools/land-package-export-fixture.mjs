/* Small owned data only, shared by ordinary exporter transport contracts. */
import {createLandCover} from '../src/game/landcover.js';
import {createLandMask} from '../src/game/landmask.js';
import {createLandPackageExporter} from '../src/game/landdata/land-package-export.js';
import {RNG_PROVIDER,BASE_SEED} from '../src/game/landdata/land-package-key.js';
export const base={mapId:'fixture',mapHash:'a'.repeat(64),editsHash:'b'.repeat(64),sourceHash:'c'.repeat(64)};
export const parameters={minWidth:.8,coverCell:32,maskCell:32,indexCell:8,terrainG:16,terrainNX:2,terrainNZ:2,terrainX0:0,terrainZ0:0};
export const descriptor=()=>({provider:RNG_PROVIDER,ordinaryAtImport:true,hookOwned:true,baseSeed:BASE_SEED});
export const runtime={mapId:'fixture',mode:'steam',adult:true,career:true,intro:false,editor:false,streamed:true,graphics:'high',district:0,quick:false,externalSeed:false};
export const receipt={base,limits:{},receiptHash:'f'.repeat(64)};
export function fixture(options={}){
 const cover=createLandCover(),green=createLandCover();cover.triangle(0,0,10,0,0,10,.085);cover.compact();
 const source={cover,green,ST:{built:false,supportReady:false},finalMask:createLandMask((x,z)=>green.height(x,z)>cover.height(x,z)||!cover.covered(x,z),(...a)=>[...cover.breaks(...a),...green.breaks(...a)])};
 let endpoint;
 const exporter=createLandPackageExporter({receipt:structuredClone(receipt),descriptor,base64:b=>Buffer.from(b).toString('base64'),...options,expose:a=>{endpoint=a;}});
 const ctx={source,cores:[...cover.cells()].map(core=>({core,skipped:false})),parameters:{...parameters},runtime:{...runtime},prepared:true,deferDraw:true,query:'?mute&landexport17b'};
 function finish(){
  Object.assign(source.ST,{minWidth:.8,cleanedArea:0,fillTriangles:0,fillDraw:0,cleanTiles:0,maskTriangles:0,maskEdges:0});source.finalMask.reserve([0,0,32,32]);source.finalMask.finish();
 }
 function ready(){exporter.beforeClean(ctx);const it=exporter.watch((function*(){finish();})());it.next();exporter.afterClean({source});return endpoint;}
 return{exporter,endpoint,ctx,source,finish,ready};
}
