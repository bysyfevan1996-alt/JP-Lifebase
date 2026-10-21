import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applySchema} from '../schema.mjs';
import {setReleaseOrder} from '../release-notes.mjs';
import {selectTopics} from '../dist/select-topics.js';

test('pinned community guide precedes release chronology without changing the order of version notes',()=>{
 const topics=[{id:'v14',category:'site',releaseOrder:140,pinned:false,minutes:0},{id:'v11',category:'site',releaseOrder:110,pinned:true,minutes:2},{id:'guide',category:'site',releaseOrder:null,pinned:true,minutes:1},{id:'v10',category:'site',releaseOrder:100,pinned:false,minutes:3},{id:'ordinary',category:'site',releaseOrder:null,pinned:false,minutes:0}];
 assert.deepEqual(selectTopics(topics,{category:'site'}).items.map(item=>item.id),['guide','v10','v11','v14','ordinary']);
 assert.equal(topics[0].id,'v14');
});

test('release chronology is operator-only, audited, idempotent and preserves actual dates',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');applySchema(db);
 try{
  for(const [id,role]of [['admin','admin'],['reader','member']])db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.test','unused','unused',role,'created');
  for(const [id,date]of [['v10','2026-10-22'],['v11','2026-10-21'],['v12','2026-10-23']])db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,'Release '+id,'Public release note','note','site','admin','admin','A','zh-CN',date,date);
  const before=db.prepare('SELECT id,created_at,updated_at FROM topics ORDER BY id').all();
  assert.throws(()=>setReleaseOrder(db,{topicId:'v10',order:100,operatorId:'reader'}));
  for(const [id,order]of [['v10',100],['v11',110],['v12',120]])setReleaseOrder(db,{topicId:id,order,operatorId:'admin'});
  setReleaseOrder(db,{topicId:'v10',order:100,operatorId:'admin'});
  assert.equal(db.prepare('SELECT count(*) n FROM admin_actions').get().n,3);
  assert.deepEqual(db.prepare('SELECT id,created_at,updated_at FROM topics ORDER BY id').all(),before);
  const topics=db.prepare('SELECT id,title,category,release_order AS releaseOrder,0 AS minutes,0 AS replies FROM topics ORDER BY id DESC').all();
  assert.deepEqual(selectTopics(topics,{category:'site'}).items.map(t=>t.id),['v10','v11','v12']);
  for(const order of [NaN,-1,10001,'100'])assert.throws(()=>setReleaseOrder(db,{topicId:'v10',order,operatorId:'admin'}));
 }finally{db.close();}
});
