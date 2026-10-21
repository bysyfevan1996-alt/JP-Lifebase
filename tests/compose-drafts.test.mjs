import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftStore} from '../dist/compose-drafts.js';

const WRITER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WRITER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQUEST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TTL = 7 * 24 * 60 * 60 * 1000;
const key = userId => `jlb-compose-v1:${encodeURIComponent(userId)}`;
const draft = (extra = {}) => ({title:'Hello',body:'  Body with spaces\n\n ',category:'daily',language:'zh-CN',clientRequestId:REQUEST,...extra});

class MapStorage {
  values = new Map();
  fail = null;
  calls = [];
  getItem(key) { this.calls.push(['get',key]); if(this.fail === 'get')throw new Error('blocked'); return this.values.get(key) ?? null; }
  setItem(key,value) { this.calls.push(['set',key]); if(this.fail === 'set')throw new Error('quota'); this.values.set(key,value); }
  removeItem(key) { this.calls.push(['remove',key]); if(this.fail === 'remove')throw new Error('blocked'); this.values.delete(key); }
}

function fixture() {
  const storage = new MapStorage();
  let time = 1000000;
  const store = createDraftStore({storage,now:()=>time,writerId:WRITER_A});
  return {storage,store,setTime:value=>{time=value;}};
}

test('writes preserve all title/body whitespace and persist only draft payload fields',()=>{
  const {storage,store}=fixture();
  const input=draft({title:'  A title  ',password:'secret',token:'secret',pendingSubmission:{...draft(),bodyFormat:'markdown',password:'secret'}});
  const result=store.write('user',input,null);
  assert.equal(result.status,'ok');
  assert.equal(result.record.draft.title,input.title);
  assert.equal(result.record.draft.body,input.body);
  assert.equal(result.record.writerId,WRITER_A);
  assert.equal(result.record.updatedAt,1000000);
  assert.equal(result.record.expiresAt,1000000+TTL);
  assert.match(result.record.revision,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.deepEqual(Object.keys(result.record.draft).sort(),['body','category','clientRequestId','language','pendingSubmission','title']);
  assert.deepEqual(Object.keys(result.record.draft.pendingSubmission).sort(),['body','bodyFormat','category','clientRequestId','language','title']);
  assert(!storage.values.get(key('user')).includes('secret'));
  input.body='changed';input.pendingSubmission.body='changed';
  assert.equal(store.read('user').record.draft.body,'  Body with spaces\n\n ');
  assert.equal(store.read('user').record.draft.pendingSubmission.body,'  Body with spaces\n\n ');
});

test('accounts are isolated and a user id is encoded as one exact storage key',()=>{
  const {storage,store}=fixture();
  const userA='user/a@example.test',userB='user b';
  store.write(userA,draft(),null);store.write(userB,draft({body:'B'}),null);
  assert.equal(store.read(userA).record.draft.body,draft().body);
  assert.equal(store.read(userB).record.draft.body,'B');
  const revision=store.read(userA).record.revision;
  assert.deepEqual(store.remove(userA,revision),{status:'ok'});
  assert.deepEqual(store.read(userA),{status:'empty'});
  assert.equal(store.read(userB).record.draft.body,'B');
  assert.deepEqual([...storage.values.keys()],[key(userB)]);
});

test('draft expires exactly after seven days and only its own key is cleared',()=>{
  const {storage,store,setTime}=fixture();
  const saved=store.write('user',draft(),null).record;
  storage.values.set('unrelated','keep');
  setTime(saved.expiresAt-1);assert.equal(store.read('user').status,'ok');
  setTime(saved.expiresAt);assert.deepEqual(store.read('user'),{status:'expired'});
  assert.deepEqual(store.read('user'),{status:'empty'});
  assert.equal(storage.values.get('unrelated'),'keep');
  assert.equal(store.write('user',draft(),null).status,'ok');
});

test('corrupt, incompatible and wrong-account records are removed',()=>{
  const {storage,store}=fixture();
  const valid=store.write('user',draft(),null).record;
  const invalidRecords=[
    '{broken',JSON.stringify(null),JSON.stringify([]),
    JSON.stringify({...valid,version:2}),JSON.stringify({...valid,userId:'someone-else'}),
    JSON.stringify({...valid,revision:'bad'}),JSON.stringify({...valid,writerId:'bad'}),
    JSON.stringify({...valid,updatedAt:-1}),JSON.stringify({...valid,expiresAt:valid.expiresAt+1}),
    JSON.stringify({...valid,draft:{...valid.draft,body:null}}),
    JSON.stringify({...valid,draft:{...valid.draft,pendingSubmission:{...draft(),bodyFormat:'html'}}}),
  ];
  for(const raw of invalidRecords){
    storage.values.set(key('user'),raw);
    assert.deepEqual(store.read('user'),{status:'invalid'},raw);
    assert.equal(storage.values.has(key('user')),false);
  }
});

test('draft validation accepts limits, rejects invalid fields, and does not touch storage',()=>{
  const {storage,store}=fixture();
  assert.equal(store.write('user',draft({title:'a'.repeat(140),body:'b'.repeat(12000),language:'l'.repeat(35),category:''}),null).status,'ok');
  const invalidDrafts=[null,[],draft({title:null}),draft({title:'a'.repeat(141)}),draft({body:1}),draft({body:'b'.repeat(12001)}),
    draft({category:'-other'}),draft({language:''}),draft({language:'l'.repeat(36)}),draft({clientRequestId:'no'}),
    draft({pendingSubmission:null}),draft({pendingSubmission:{...draft(),bodyFormat:'html'}}),
    draft({pendingSubmission:{...draft(),bodyFormat:'markdown',clientRequestId:'no'}})];
  for(const input of invalidDrafts){
    storage.calls=[];
    assert.deepEqual(store.write('user',input,null),{status:'invalid'});
    assert.deepEqual(storage.calls,[]);
  }
  for(const user of ['',null,1,'x'.repeat(201),'\ud800']){
    storage.calls=[];
    assert.equal(store.write(user,draft(),null).status,'invalid');
    assert.equal(store.read(user).status,'invalid');
    assert.equal(store.remove(user,null).status,'invalid');
    assert.deepEqual(storage.calls,[]);
  }
});

test('writes require an explicit expected revision and detect another writer',()=>{
  const {storage,store}=fixture();
  assert.deepEqual(store.write('user',draft()),{status:'conflict',record:null});
  const first=store.write('user',draft(),null).record;
  const other=createDraftStore({storage,now:()=>1000001,writerId:WRITER_B});
  const second=other.write('user',draft({body:'other tab'}),first.revision).record;
  assert.notEqual(second.revision,first.revision);
  assert.equal(second.writerId,WRITER_B);
  for(const revision of [null,undefined,first.revision]){
    const result=store.write('user',draft({body:'stale'}),revision);
    assert.equal(result.status,'conflict');assert.deepEqual(result.record,second);
  }
  assert.equal(store.read('user').record.draft.body,'other tab');
  const result=store.write('user',draft({body:'accepted'}),second.revision);
  assert.equal(result.status,'ok');assert.equal(result.record.draft.body,'accepted');
});

test('remove requires the expected revision and leaves a conflicting draft intact',()=>{
  const {store}=fixture();
  assert.deepEqual(store.remove('user'),{status:'conflict',record:null});
  assert.deepEqual(store.remove('user',null),{status:'ok'});
  const first=store.write('user',draft(),null).record;
  const second=store.write('user',draft({body:'updated'}),first.revision).record;
  for(const revision of [null,undefined,first.revision]){
    assert.deepEqual(store.remove('user',revision),{status:'conflict',record:second});
  }
  assert.deepEqual(store.remove('user',second.revision),{status:'ok'});
  assert.deepEqual(store.read('user'),{status:'empty'});
});

test('storage read and write failures report unavailable and never claim a save',()=>{
  const {storage,store}=fixture();
  for(const fail of ['get','set']){
    storage.fail=fail;
    assert.deepEqual(store.write('user',draft(),null),{status:'unavailable'});
    assert.equal(storage.values.has(key('user')),false);
  }
  storage.fail='get';assert.deepEqual(store.read('user'),{status:'unavailable'});
  assert.deepEqual(store.remove('user',null),{status:'unavailable'});
  const unavailable=createDraftStore({storage:null,now:()=>1000000,writerId:WRITER_A});
  assert.deepEqual(unavailable.read('user'),{status:'unavailable'});
  assert.deepEqual(unavailable.write('user',draft(),null),{status:'unavailable'});
  assert.deepEqual(unavailable.remove('user',null),{status:'unavailable'});
});

test('failed removals and failed cleanup report unavailable',()=>{
  const {storage,store,setTime}=fixture();
  const record=store.write('user',draft(),null).record;
  storage.fail='remove';
  assert.deepEqual(store.remove('user',record.revision),{status:'unavailable'});
  assert(storage.values.has(key('user')));
  setTime(record.expiresAt);
  assert.deepEqual(store.read('user'),{status:'unavailable'});
  storage.values.set(key('user'),'bad');
  assert.deepEqual(store.read('user'),{status:'unavailable'});
});

test('tag and attachment references persist without binary content and keep a frozen pending submission',()=>{
  const {storage,store}=fixture();
  const input=draft({tagIds:['tax','moving'],attachmentIds:[WRITER_B,WRITER_A],imageBytes:'not persisted',pendingSubmission:{...draft(),bodyFormat:'markdown',tagIds:['tax','moving'],attachmentIds:[WRITER_B,WRITER_A],blob:'not persisted'}});
  const saved=store.write('user',input,null);
  assert.equal(saved.status,'ok');
  assert.deepEqual(saved.record.draft.tagIds,['moving','tax']);
  assert.deepEqual(saved.record.draft.attachmentIds,[WRITER_B,WRITER_A]);
  assert.deepEqual(saved.record.draft.pendingSubmission.tagIds,['moving','tax']);
  assert.deepEqual(saved.record.draft.pendingSubmission.attachmentIds,[WRITER_B,WRITER_A]);
  assert(!storage.values.get(key('user')).includes('not persisted'));
  input.tagIds.pop();input.attachmentIds.reverse();input.pendingSubmission.attachmentIds.length=0;
  const read=store.read('user').record.draft;
  assert.deepEqual(read.tagIds,['moving','tax']);assert.deepEqual(read.attachmentIds,[WRITER_B,WRITER_A]);assert.deepEqual(read.pendingSubmission.attachmentIds,[WRITER_B,WRITER_A]);
});

test('legacy drafts without optional references remain valid and malformed reference lists never touch storage',()=>{
  const {storage,store}=fixture();
  const legacy=store.write('user',draft({pendingSubmission:{...draft(),bodyFormat:'markdown'}}),null);
  assert.equal(legacy.status,'ok');assert.equal(store.read('user').status,'ok');
  assert(!Object.hasOwn(legacy.record.draft,'tagIds'));assert(!Object.hasOwn(legacy.record.draft.pendingSubmission,'attachmentIds'));
  const invalid=[
    {tagIds:null},{tagIds:'tax'},{tagIds:['bad_tag']},{tagIds:['tax','tax']},{tagIds:Array(1)},{tagIds:['rent','moving','electricity','gas','visa','residence']},
    {attachmentIds:null},{attachmentIds:'bad'},{attachmentIds:['bad']},{attachmentIds:Array(1)},{attachmentIds:[WRITER_A,WRITER_A]},{attachmentIds:[WRITER_A,WRITER_B,REQUEST,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff']},
    {pendingSubmission:{...draft(),bodyFormat:'markdown',tagIds:['bad_tag']}},{pendingSubmission:{...draft(),bodyFormat:'markdown',attachmentIds:['bad']}},
  ];
  for(const extra of invalid){storage.calls=[];assert.deepEqual(store.write('user',draft(extra),legacy.record.revision),{status:'invalid'});assert.deepEqual(storage.calls,[]);}
});
