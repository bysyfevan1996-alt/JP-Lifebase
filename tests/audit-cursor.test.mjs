import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAuditCursor,decodeAuditCursor} from '../audit-cursor.mjs';
const row={id:'00000000-0000-4000-8000-000000000001',created_at:'2026-10-21T00:00:00.000Z'};
const raw=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
test('audit cursor round trips a stable time/id boundary and permits an absent cursor',()=>{
 for(const empty of [null,undefined,''])assert.equal(decodeAuditCursor(empty),null);
 const encoded=encodeAuditCursor(row);assert.match(encoded,/^[A-Za-z0-9_-]+$/);
 assert.deepEqual(decodeAuditCursor(encoded),{createdAt:row.created_at,id:row.id});
});
test('audit cursor rejects malformed input and noncanonical dates or identifiers',()=>{
 const error={status:400,code:'invalid_cursor'};
 for(const value of [42,{},'a'.repeat(257),'not+base64','e30=',raw({createdAt:row.created_at,id:row.id}),raw([row.created_at,row.id,'extra']),raw(['2026-02-30T00:00:00.000Z',row.id]),raw(['2026-10-21',row.id]),raw([row.created_at,'anything']),raw([row.created_at,row.id.toUpperCase().replace('8000','ABCD')])])assert.throws(()=>decodeAuditCursor(value),error);
 for(const input of [null,{}, {...row,id:7},{...row,created_at:'2026-02-30T00:00:00.000Z'},{...row,id:'foo'}])assert.throws(()=>encodeAuditCursor(input),error);
});
