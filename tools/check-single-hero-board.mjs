/* №12: localBoard сохраняет историю и отличает свою карьеру от совпавших старых имён.
   node tools/check-single-hero-board.mjs — без запуска игры. */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const text=await readFile(new URL('../src/platform/common.js',import.meta.url),'utf8');
const {localBoard}=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
const old=[{name:'Женя',score:5000,ts:1},{name:'Женя',score:4000,ts:2},{name:'Старый профиль',score:3000,ts:3}];
const data=new Map([['scores',structuredClone(old)]]),store={get:(k,d)=>data.get(k)??d,set:(k,v)=>data.set(k,v)};
let name='Женя';const board=localBoard(store,'scores',()=>name,()=> 'career-12');
assert.equal((await board.top()).filter(r=>r.me).length,0);
assert.equal(await board.mine(),null);
await board.submit(4500,{name:'Имя аккаунта Steam',level:2});
const top=await board.top();assert.equal(top.filter(r=>r.me).length,1);
assert.equal(top.find(r=>r.me).name,'Женя');assert.equal((await board.mine()).rank,2);
assert.deepEqual(data.get('scores').filter(r=>!r.ownerId),old);
name='Zhenya';assert.equal((await board.top()).find(r=>r.me).name,'Zhenya');
const foreign=localBoard(store,'scores',()=>name,()=> 'another-save');
assert.equal(await foreign.mine(),null);assert.equal((await foreign.top()).filter(r=>r.me).length,0);
const boot=localBoard(store,'scores',()=>'',()=> '');
assert.equal(await boot.mine(),null);
boot.setIdentity(()=> 'career-12',()=>name);
assert.equal((await boot.mine()).score,4500);
assert.equal((await boot.top()).find(r=>r.me).name,'Zhenya');
// Внешний SDK без нового meId сохраняет прежний контракт.
const sdk=localBoard(store,'scores',()=> 'Старый профиль');assert.equal((await sdk.mine()).score,3000);
console.log(JSON.stringify({ok:true,history:old.length,mine:await board.mine(),languages:['Женя','Zhenya']}));
