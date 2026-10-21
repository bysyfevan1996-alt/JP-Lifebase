import test from 'node:test';
import assert from 'node:assert/strict';
import {captureReadingPosition,restoreReadingPosition} from '../dist/reading-position.js';
test('return to paragraph survives image growth above it and keeps negative gap offsets',()=>{
 const original=Object.freeze([Object.freeze({key:'a',top:100,bottom:300}),Object.freeze({key:'b',top:340,bottom:700})]);
 const point=captureReadingPosition(original,260,60);
 assert.deepEqual(point,{key:'b',offset:-20,y:260});
 assert.equal(restoreReadingPosition(point,[{key:'b',top:540,bottom:900}],80),440);
 assert.equal(restoreReadingPosition(point,[],80),260);
 assert.deepEqual(captureReadingPosition(original,800,60),{key:'b',offset:520,y:800});
});
test('reading geometry tolerates missing invalid and non-finite inputs without inventing coordinates',()=>{
 for(const items of [null,undefined,{},[null,{key:'',top:10,bottom:20},{key:'bad',top:Infinity,bottom:2}]])assert.deepEqual(captureReadingPosition(items,NaN,Infinity),{key:null,offset:0,y:0});
 for(const point of [null,undefined,{y:Infinity},{y:'40'}])assert.equal(restoreReadingPosition(point,undefined,NaN),0);
 assert.equal(restoreReadingPosition({key:'a',offset:Infinity,y:20},[{key:'a',top:30,bottom:40}],-4),30);
});
