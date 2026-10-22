import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTopics} from '../dist/select-topics.js';

test('resolved status combines with category, keyword and pagination without mutating the source',()=>{
 const input=[{id:'a',title:'Tokyo bill',category:'daily',solved:true,minutes:2},{id:'b',title:'Tokyo rental',category:'housing',solved:true,minutes:1},{id:'c',title:'Tokyo bill',category:'daily',solved:false,minutes:3},{id:'d',title:'Another bill',category:'daily',minutes:0}];
 assert.deepEqual(selectTopics(input,{solved:'true',category:'daily',query:'Tokyo'}).items.map(row=>row.id),['a']);
 assert.deepEqual(selectTopics(input,{solved:false,category:'daily',limit:1}).items.map(row=>row.id),['d']);assert.equal(selectTopics(input,{solved:false,limit:1}).hasMore,true);
 assert.equal(selectTopics(input,{solved:'all'}).total,4);assert.equal(selectTopics(input,{solved:'unknown'}).total,4);assert.equal(selectTopics(input,{solved:true}).total,2);assert.equal(selectTopics(input,{solved:'false'}).total,2);assert.deepEqual(input.map(row=>row.id),['a','b','c','d']);
});
test('solved filtering uses descending time in site category just like other discussions',()=>{
 const input=[{id:'v14',category:'site',releaseOrder:140,solved:true,minutes:0},{id:'v13',category:'site',releaseOrder:130,solved:true,minutes:1},{id:'ordinary',category:'site',minutes:2}];
 assert.deepEqual(selectTopics(input,{category:'site',solved:true}).items.map(row=>row.id),['v14','v13']);assert.deepEqual(selectTopics(input,{solved:true}).items.map(row=>row.id),['v14','v13']);assert.deepEqual(input.map(row=>row.id),['v14','v13','ordinary']);
});
test('actual creation timestamps win over edits, pins and version numbers; millisecond ties remain stable',()=>{
 const input=[
  {id:'older',category:'site',createdAt:'2026-10-21T00:00:00.000Z',updatedAt:'2030-01-01',pinned:true,releaseOrder:100},
  {id:'a',category:'site',createdAt:'2026-10-22T00:00:00.001Z',releaseOrder:200},
  {id:'b',category:'site',createdAt:'2026-10-22T00:00:00.001Z',releaseOrder:1},
  {id:'fallback',category:'site',createdAt:'bad',updatedAt:'2026-10-20',replies:NaN},
 ];
 assert.deepEqual(selectTopics(input,{category:'site'}).items.map(row=>row.id),['b','a','older','fallback']);
 assert.deepEqual(selectTopics(input,{sort:'popular'}).items.map(row=>row.id),['b','a','older','fallback']);
 assert.deepEqual(input.map(row=>row.id),['older','a','b','fallback']);
});
