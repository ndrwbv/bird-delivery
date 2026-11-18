// Use the original Canvas2D artwork routine once. Optional argument points to a local @napi-rs/canvas install.
import {readFile,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createCanvas}=require(process.argv[2]||'@napi-rs/canvas');
const source=await readFile(new URL('../../src/game/life.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('const SYL ='),source.indexOf('/* стены:')).replace('export function fakeTag','function fakeTag');
let state=18277;
const math=Object.create(Math);
math.random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
const draw=runInNewContext(fn+'\ndrawGraffiti;',{Math:math,
 rand:(a,b)=>a+(b-a)*math.random(),chance:p=>math.random()<p,pick:a=>a[Math.floor(math.random()*a.length)]});
const atlas=createCanvas(384,192),ctx=atlas.getContext('2d');
for(let i=0;i<16;i++){
  const tile=createCanvas(96,48);
  draw(tile,['piece','tag','throw','piece'][i%4]);
  ctx.drawImage(tile,i%4*96,Math.floor(i/4)*48);
}
await writeFile(new URL('../assets/summer_graffiti.png',import.meta.url),atlas.toBuffer('image/png'));
