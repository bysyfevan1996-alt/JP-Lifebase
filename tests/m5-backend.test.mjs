import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {applySchema,migrations} from '../schema.mjs';
import {runMigrations} from '../migrations.mjs';
import {createCommunityDirectory} from '../community-directory.mjs';
import {createCommunityProfiles} from '../community-profiles.mjs';
import {createCommunityInsights} from '../community-insights.mjs';
import {createTopicPosting} from '../topic-posting.mjs';
import {createCommunityInteractions} from '../community-interactions.mjs';

const date='2026-10-01T00:00:00.000Z';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');applySchema(db);
 for(const [id,role]of [['admin','admin'],['alice','member'],['bob','member']])db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@private.example','hash','salt',role,date);
 let identity='admin',duringBody=null;
 const httpError=(status,code)=>Object.assign(Error(code),{status,code});
 const userRequired=()=>{const row=db.prepare('SELECT * FROM users WHERE id=?').get(identity);if(!row||row.banned)throw httpError(401,'login_required');return row;};
 const common={db,httpError,userRequired,body:async req=>{duringBody?.();return req.input;},json:(res,status,body)=>Object.assign(res,{status,body}),limit(){},session:userRequired};
 const interactions=createCommunityInteractions(common),directory=createCommunityDirectory(common),profiles=createCommunityProfiles({...common,interactions}),insights=createCommunityInsights(common);
 const invoke=async(service,path,{who='admin',method='GET',input,midway}={})=>{identity=who;duringBody=midway;const res={};try{await service.handle({method,input},res,new URL(path,'http://local.test'));return res;}catch(error){return {status:error.status||500,body:{error:error.code||error.message}};}finally{duringBody=null;}};
 const topic=(id,user='alice',other={})=>db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at,hidden,seed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,other.title||'Topic '+id,other.body||'Original body','Excerpt',other.category||'daily',user,user,'A','en',other.date||date,other.date||date,other.hidden?1:0,other.seed?1:0);
 const post=(id,topicId,user='bob',other={})=>db.prepare('INSERT INTO posts(id,topic_id,user_id,body,language,created_at,hidden) VALUES(?,?,?,?,?,?,?)').run(id,topicId,user,other.body||'Reply original','en',other.date||date,other.hidden?1:0);
 return {db,common,directory,profiles,insights,interactions,invoke,topic,post,setIdentity:value=>identity=value,close:()=>db.close()};
}
const category=(id='newcat',extra={})=>({expectedUserId:'admin',id,name:'新分类',translations:{en:'New category','zh-CN':'新分类'},color:'#123456',position:100,active:true,...extra});
const tag=(id='newtag',extra={})=>({expectedUserId:'admin',id,name:'新标签',translations:{en:'New tag'},position:100,active:true,...extra});
const profile=(extra={})=>({expectedUserId:'alice',bio:'Plain <script>not HTML</script>','location':'Tokyo',website:'https://example.test',publicEnabled:true,showActivity:true,...extra});

test('M5 migration preserves exact legacy records/ledger, seeds known and historical IDs, synchronizes FTS transactionally',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');try{
  runMigrations(db,migrations.slice(0,4));db.prepare('INSERT INTO users(id,name,email,password,salt,created_at) VALUES(?,?,?,?,?,?)').run('u','User','private@example.test','old-hash','old-salt',date);
  db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('t','Original title','Original body','Excerpt','retired','u','User','U','ja',date,date);
  db.prepare('INSERT INTO topic_tags(topic_id,tag_id) VALUES(?,?)').run('t','oldtag');
  const original=db.prepare('SELECT * FROM topics').all(),users=db.prepare('SELECT * FROM users').all(),ledger=db.prepare('SELECT * FROM schema_migrations').all();
  assert.deepEqual(applySchema(db),{version:5,applied:[5]});assert.deepEqual(applySchema(db),{version:5,applied:[]});
  assert.deepEqual(db.prepare('SELECT * FROM topics').all(),original);assert.deepEqual(db.prepare('SELECT * FROM users').all(),users);assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version<=4').all(),ledger);
  assert.equal(db.prepare("SELECT active FROM community_categories WHERE id='retired'").get().active,0);assert.equal(db.prepare("SELECT active FROM community_tags WHERE id='oldtag'").get().active,0);
  assert.equal(db.prepare("SELECT count(*) n FROM community_search_fts WHERE community_search_fts MATCH 'Original'").get().n,1);
  db.exec("BEGIN;UPDATE topics SET body='Changed search text' WHERE id='t';ROLLBACK");assert.equal(db.prepare("SELECT body FROM community_search_fts WHERE content_id='t'").get().body,'Original body');
  db.exec("UPDATE topics SET body='Changed search text' WHERE id='t'");assert.equal(db.prepare("SELECT body FROM community_search_fts WHERE content_id='t'").get().body,'Changed search text');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});

test('directory is public read-only for members, validates/admin audits atomically, and preserves original overview conventions',async()=>{
 const f=fixture();try{
  assert.equal((await f.invoke(f.directory,'/api/directory',{who:'alice'})).body.categories.length,6);
  assert.equal((await f.invoke(f.directory,'/api/admin/directory',{who:'alice'})).status,403);
  const create=await f.invoke(f.directory,'/api/admin/directory/categories',{method:'POST',input:category()});assert.equal(create.status,200);assert.equal(create.body.categories.find(x=>x.id==='newcat').color,'#123456');
  await f.invoke(f.directory,'/api/admin/directory/categories',{method:'POST',input:category()});assert.equal(f.db.prepare("SELECT count(*) n FROM admin_actions WHERE action='update_category'").get().n,1);
  for(const input of [category('bad id'),category('newcat',{color:'red'}),category('newcat',{translations:{fr:'Unknown'}}),category('newcat',{position:1.5}),category('newcat',{email:'private'})])assert.equal((await f.invoke(f.directory,'/api/admin/directory/categories',{method:'POST',input})).status,400);
  f.db.exec("CREATE TRIGGER fail_m5_directory_audit BEFORE INSERT ON admin_actions WHEN new.action='update_tag' BEGIN SELECT RAISE(ABORT,'synthetic failure');END");
  assert.equal((await f.invoke(f.directory,'/api/admin/directory/tags',{method:'POST',input:tag()})).status,500);assert.equal(f.db.prepare("SELECT count(*) n FROM community_tags WHERE id='newtag'").get().n,0);f.db.exec('DROP TRIGGER fail_m5_directory_audit');
  assert.equal((await f.invoke(f.directory,'/api/admin/directory/categories',{method:'POST',input:category('site',{active:false})})).body.error,'protected_category');
  assert.equal((await f.invoke(f.directory,'/api/admin/directory/tags',{method:'POST',input:tag(),midway:()=>f.db.exec("UPDATE users SET role='member' WHERE id='admin'")})).status,403);
  assert.equal(f.db.prepare("SELECT count(*) n FROM community_tags WHERE id='newtag'").get().n,0);
 }finally{f.close();}
});

test('directory inactive choices reject new posts but do not invalidate successful request receipts or associations',async()=>{
 const f=fixture();try{
  await f.invoke(f.directory,'/api/admin/directory/categories',{method:'POST',input:category()});await f.invoke(f.directory,'/api/admin/directory/tags',{method:'POST',input:tag()});
  const posting=createTopicPosting({...f.common,text:(v,min,max)=>{if(typeof v!=='string'||v.length<min||v.length>max)throw Error('text');return v.trim();},language:x=>x,directory:f.directory,interactions:f.interactions,migrate:false});
  const user=f.db.prepare("SELECT * FROM users WHERE id='alice'").get(),input={expectedUserId:'alice',category:'newcat',title:'A real title',body:'The original body',language:'en',tagIds:['newtag'],clientRequestId:randomUUID()};
  const original=posting.create({},user,input);assert.equal(original.replayed,false);
  await f.invoke(f.directory,'/api/admin/directory/categories',{method:'POST',input:category('newcat',{active:false})});await f.invoke(f.directory,'/api/admin/directory/tags',{method:'POST',input:tag('newtag',{active:false})});
  assert.deepEqual(posting.create({},user,input),{id:original.id,replayed:true});
  assert.throws(()=>posting.create({},user,{...input,clientRequestId:randomUUID()}),error=>error.code==='inactive_category');assert.deepEqual(posting.tagsForTopic(original.id),['newtag']);assert.equal(f.directory.catalog().categories.find(x=>x.id==='newcat').active,false);
  f.db.exec("UPDATE community_categories SET active=0 WHERE id<>'site' AND id<>'daily'");assert.equal((await f.invoke(f.directory,'/api/admin/directory/categories',{method:'POST',input:category('daily',{active:false})})).body.error,'protected_category');
 }finally{f.close();}
});

test('profiles are opt-in, field-whitelisted and account-bound; mute permits private settings but banned/stale actors cannot save',async()=>{
 const f=fixture();try{
  const handle=f.interactions.handleFor('alice'),path='/api/users/'+handle+'/profile';assert.equal((await f.invoke(f.profiles,path,{who:'bob'})).status,404);
  const own=await f.invoke(f.profiles,'/api/me/profile',{who:'alice'});assert.equal(own.body.profile.publicEnabled,false);assert.equal(own.body.handle,handle);
  const save=await f.invoke(f.profiles,'/api/me/profile',{who:'alice',method:'POST',input:profile()});assert.equal(save.status,200);assert.equal(save.body.profile.website,'https://example.test/');
  const publicResult=await f.invoke(f.profiles,path,{who:'bob'});assert.equal(publicResult.status,200);assert.deepEqual(Object.keys(publicResult.body.profile).sort(),['avatarUrl','bio','handle','id','joinedAt','location','name','website']);assert(!JSON.stringify(publicResult.body).includes('private.example'));
  for(const input of [profile({website:'javascript:alert(1)'}),profile({website:'https://name:pass@example.test'}),profile({website:'http://example.test'}),profile({publicEnabled:1}),profile({email:'private'}),profile({bio:'x'.repeat(1001)}),profile({location:'Tokyo\nprivate'})])assert.equal((await f.invoke(f.profiles,'/api/me/profile',{who:'alice',method:'POST',input})).status,400);
  f.db.exec("UPDATE users SET muted=1 WHERE id='alice'");assert.equal((await f.invoke(f.profiles,'/api/me/profile',{who:'alice',method:'POST',input:profile({publicEnabled:false})})).status,200);assert.equal((await f.invoke(f.profiles,path,{who:'admin'})).status,404);
  assert.equal((await f.invoke(f.profiles,'/api/me/profile',{who:'alice',method:'POST',input:profile(),midway:()=>f.setIdentity('bob')})).status,409);
  assert.equal((await f.invoke(f.profiles,'/api/me/profile',{who:'alice',method:'POST',input:profile(),midway:()=>f.db.exec("UPDATE users SET banned=1 WHERE id='alice'")})).status,401);
 }finally{f.close();}
});

test('public profile activity has stable tie cursors, current visibility and an explicit activity-off state',async()=>{
 const f=fixture();try{
  const handle=f.interactions.handleFor('alice'),path='/api/users/'+handle+'/profile';for(let i=0;i<25;i++){f.topic('topic-'+i);f.post('post-'+i,'topic-'+i,'alice');}f.topic('hidden','alice',{hidden:true});f.topic('sample','alice',{seed:true});
  await f.invoke(f.profiles,'/api/me/profile',{who:'alice',method:'POST',input:profile()});
  const all=[];let cursor=null;do{const page=await f.invoke(f.profiles,path+(cursor?'?cursor='+cursor:''),{who:'bob'});assert.equal(page.status,200);all.push(...page.body.activity);cursor=page.body.nextCursor;}while(cursor);
  assert.equal(all.length,50);assert.equal(new Set(all.map(x=>x.kind+':'+x.id)).size,50);assert(all.every(x=>!['hidden','sample'].includes(x.id)));
  f.db.exec("UPDATE topics SET hidden=1 WHERE id='topic-0'");assert(!f.profiles.profile(handle).activity.some(x=>x.topicId==='topic-0'));
  await f.invoke(f.profiles,'/api/me/profile',{who:'alice',method:'POST',input:profile({showActivity:false})});assert.deepEqual(f.profiles.profile(handle).activity,[]);
 }finally{f.close();}
});

test('insights use a bounded UTC range with visible non-sample definitions, distinct authors and current backlog',()=>{
 const f=fixture();try{
  const recent=new Date(Date.now()-3600000).toISOString();f.db.prepare("UPDATE users SET created_at=? WHERE id IN ('alice','bob')").run(recent);
  f.topic('visible','alice',{date:recent});f.topic('hidden','alice',{date:recent,hidden:true});f.topic('sample','alice',{date:recent,seed:true});f.post('reply','visible','bob',{date:recent});f.post('hiddenreply','visible','bob',{date:recent,hidden:true});f.post('sample-reply','sample','bob',{date:recent});
  f.db.prepare('INSERT INTO topic_answers(topic_id,post_id,chosen_by,chosen_at) VALUES(?,?,?,?)').run('visible','reply','alice',recent);
  f.db.prepare('INSERT INTO content_reactions(kind,content_id,user_id,reaction,created_at) VALUES(?,?,?,?,?)').run('post','reply','alice','helpful',recent);f.db.prepare('INSERT INTO content_reactions(kind,content_id,user_id,reaction,created_at) VALUES(?,?,?,?,?)').run('topic','sample','bob','like',recent);
  f.db.prepare('INSERT INTO reports(id,topic_id,user_id,reason,created_at,status) VALUES(?,?,?,?,?,?)').run('old-report','visible','bob','old backlog','2000-01-01','open');
  const result=f.insights.calculate(7);assert.equal(result.range.timezone,'UTC');assert.equal(Date.parse(result.range.to)-Date.parse(result.range.from),7*86400000);assert.deepEqual(result.metrics,{newMembers:2,topics:1,replies:1,activeAuthors:2,solvedTopics:1,reactions:1,openReports:1});assert.match(result.definitions.activeAuthors,/not visitors/);assert.match(result.definitions.openReports,/regardless/);
 }finally{f.close();}
});
