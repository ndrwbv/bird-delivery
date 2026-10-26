import assert from 'node:assert/strict';
import {pruneLandIslands} from '../src/game/landislands.js';
const rect=(x0,z0,x1,z1)=>({outer:[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],holes:[]});
const groups=[{core:[0,0,32,32],regions:[rect(1,1,1.01,1.01),rect(31.99,10,32,11),rect(31.99,20,32,20.01)]},
  {core:[32,0,64,32],regions:[rect(32,10,40,11),rect(32,20.01,40,22)]}];
assert.equal(pruneLandIslands(groups),2,'Удалены изолированная крошка и обрывок, касающийся большого газона только точкой');
assert.equal(groups[0].regions.length,1,'Маленькая часть настоящего газона сохранена через общий край');
assert.equal(groups[1].regions.length,2);
const outside=[{core:[0,0,32,32],regions:[rect(0,10,.01,11)]}];
assert.equal(pruneLandIslands(outside,{open:(x,z)=>x<0}),0,'За открытой границей может продолжаться большой газон');
const hole=[{core:[0,0,32,32],regions:[{outer:rect(1,1,2,2).outer,holes:[rect(1.01,1.01,1.99,1.99).outer.reverse()]}]}];
assert.equal(pruneLandIslands(hole),1,'Из площади компоненты вычитаются отверстия');
console.log('landislands: изолированные обрывки убраны, цельный газон через шов и открытое поле сохранены — OK');
