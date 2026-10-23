import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {selectReplyHighlights} from '../reply-highlights.mjs';

test('highlights use visible global replies, total reactions, stable ties and deduplicate the answer',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE topics(id TEXT PRIMARY KEY,hidden INTEGER);CREATE TABLE posts(id TEXT PRIMARY KEY,topic_id TEXT,hidden INTEGER,created_at TEXT);CREATE TABLE topic_answers(topic_id TEXT PRIMARY KEY,post_id TEXT);CREATE TABLE content_reactions(kind TEXT,content_id TEXT,user_id TEXT,reaction TEXT);');
  for(const [id,hidden] of [['topic',0],['other',0],['secret',1]])db.prepare('INSERT INTO topics VALUES(?,?)').run(id,hidden);
  const add=(id,count,{topic='topic',hidden=0,date='2026-10-01'}={})=>{db.prepare('INSERT INTO posts VALUES(?,?,?,?)').run(id,topic,hidden,date);for(let i=0;i<count;i++)db.prepare('INSERT INTO content_reactions VALUES(?,?,?,?)').run('post',id,'r'+i,['like','thanks','helpful'][i%3]);};
  add('best',9);add('b',4);add('a',4);add('c',3);add('d',3);add('low',2);add('hidden',20,{hidden:1});add('foreign',30,{topic:'other'});add('secret-post',30,{topic:'secret'});
  db.prepare('INSERT INTO topic_answers VALUES(?,?)').run('topic','best');
  assert.deepEqual(selectReplyHighlights(db,'topic'),{answerId:'best',hotIds:['a','b','c']});
  db.prepare("UPDATE posts SET hidden=1 WHERE id='best'").run();
  assert.deepEqual(selectReplyHighlights(db,'topic'),{answerId:null,hotIds:['a','b','c']});
  db.prepare("UPDATE topic_answers SET post_id='foreign' WHERE topic_id='topic'").run();
  assert.equal(selectReplyHighlights(db,'topic').answerId,null);
  assert.deepEqual(selectReplyHighlights(db,'secret'),{answerId:null,hotIds:[]});
  assert.deepEqual(selectReplyHighlights(db,"topic' OR 1=1--"),{answerId:null,hotIds:[]});
  assert.deepEqual(selectReplyHighlights(db,'missing'),{answerId:null,hotIds:[]});
 }finally{db.close();}
});
