import test from 'node:test';
import assert from 'node:assert/strict';
import {formatContentTime} from '../dist/content-time.js';
test('edit and notification times show absolute Japan time independently of the client timezone',()=>{
 const instant='2026-10-21T23:15:00Z',value=formatContentTime(instant,'en');assert.equal(value.datetime,'2026-10-21T23:15:00.000Z');
 assert.equal(value.label,new Intl.DateTimeFormat('en',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo',timeZoneName:'short'}).format(new Date(instant)));
 assert.match(value.label,/22/);assert.match(value.label,/08:15/);assert.notEqual(formatContentTime(instant,'ja').label,value.label);assert.notEqual(formatContentTime(instant,'ko').label,value.label);
 assert.equal(formatContentTime('2026-10-22T08:15:00+09:00','en').datetime,value.datetime);
});
test('missing, date-only or malformed edit timestamps are omitted and unknown locales safely fall back',()=>{
 for(const value of [null,undefined,3,{},new Date(),'', '2026-10-21','garbage','2026-99-77T88:66:99Z'])assert.equal(formatContentTime(value),null);
 assert.deepEqual(formatContentTime('2026-10-21T23:15:00Z','bad_locale'),formatContentTime('2026-10-21T23:15:00Z','en'));
});
