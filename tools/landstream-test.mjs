import assert from 'node:assert/strict';
import {createLandStream} from '../src/game/landstream.js';
let clock=0,events=[];
const terrain={g:16,nx:161,nz:161,x0:-1024,z0:-1024};
const stream=createLandStream({terrain,radius:300,now:()=>clock,
  build:function*(bounds){events.push(['start',bounds]);for(let i=0;i<4;i++){clock++;yield;}return bounds;},
  publish:(id,bounds)=>events.push(['publish',id,bounds])});
const it=stream.prepare(0,0,0);
assert.equal(it.next().done,false);
assert.equal(stream.stats.ready,0,'нельзя прятать исходную землю до готовности замены');
for(const step of it){}
assert.equal(stream.stats.ready,1,'точка принадлежит одной клетке полуоткрытой сетки');
assert(stream.readyAt(0,0));
const initial=stream.stats.ready;
for(const step of stream.prepare(0,0,0)){}
assert.equal(stream.stats.ready,initial,'повторный запрос не дублирует меши');
const steps=stream.stats.steps;stream.step(900,900,2);
assert(stream.stats.steps-steps<=2,'фоновая сборка соблюдает бюджет между шагами');
for(let i=0;i<100;i++)stream.step(900,900,2);
assert(stream.readyAt(900,900,300),'новый район достраивается при приближении');
assert(stream.stats.ready<stream.stats.total/2,'дальний город без запроса не строится');
assert.equal(new Set(events.filter(e=>e[0]==='publish').map(e=>e[1])).size,stream.stats.ready);
const failure=createLandStream({terrain,build:function*(){yield;throw Error('test');}});
assert.throws(()=>{for(const x of failure.prepare(1,1,0)){}},/test/);
assert.equal(failure.stats.ready,0);assert.equal(failure.ready.reduce((a,b)=>a+b,0),0,'ошибка оставляет старую землю видимой');
console.log('landstream: сначала ближнее, публикация целиком, бюджет, поездка в другой район, запасная земля при ошибке — ок');

const random=Math.random;let gameDraws=0;
Math.random=()=>{gameDraws++;return .5;};
try {
  const cosmetic=createLandStream({terrain,build:function*(){Math.random();yield;Math.random();},publish:()=>Math.random()});
  for(const step of cosmetic.prepare(1,1,0)){}
  assert.equal(gameDraws,0,'время загрузки мешей не меняет случайность игровой симуляции');
  Math.random();assert.equal(gameDraws,1,'генератор игры восстановлен');
} finally {Math.random=random;}
