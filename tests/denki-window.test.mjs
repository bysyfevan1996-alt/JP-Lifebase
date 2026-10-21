import test from 'node:test';
import assert from 'node:assert/strict';
import {monthWindow,monthAllowed} from '../denki/window.mjs';
import {catalog} from '../denki/engine.mjs';
import {dataset} from '../denki/data.mjs';

test('six month range includes the current Japan month and excludes future/older months',()=>{
 const now=new Date('2026-10-20T00:00:00Z'),range=monthWindow(now);
 assert.deepEqual(range.months,['2026-10','2026-09','2026-08','2026-07','2026-06','2026-05']);
 assert.equal(range.from,'2026-05');assert.equal(range.to,'2026-10');
 for(const value of ['2026-04','2026-11','2025-09','2026-1',null,202610])assert.equal(monthAllowed(value,now),false);
 assert.equal(monthAllowed('2026-05',now),true);assert.equal(monthAllowed('2026-10',now),true);
});
test('range rolls over at midnight in Japan, including year boundaries',()=>{
 assert.equal(monthWindow('2026-10-31T14:59:59Z').to,'2026-10');
 assert.equal(monthWindow('2026-10-31T15:00:00Z').to,'2026-11');
 assert.deepEqual(monthWindow('2026-12-31T15:00:00Z').months,['2027-01','2026-12','2026-11','2026-10','2026-09','2026-08']);
 assert.throws(()=>monthWindow('invalid'));
});
test('public catalog filters archived tariffs without modifying their saved numerical records',()=>{
 const original=JSON.stringify(dataset),c=catalog(dataset,'2026-10-20T00:00:00Z');
 assert(c.months.every(m=>monthAllowed(m.id,'2026-10-20T00:00:00Z')));
 assert.equal(c.months.length,6);
 assert(!c.months.some(m=>['2025-09','2026-01'].includes(m.id)));
 assert.equal(JSON.stringify(dataset),original);
});
