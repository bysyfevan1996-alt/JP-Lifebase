import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTranslator} from './translation.mjs';
import {dataset as denkiSeed} from './denki/data.mjs';
import {installDataset,readDataset} from './denki/store.mjs';
import {catalog as denkiCatalog,compare as denkiCompare} from './denki/engine.mjs';
import {monthAllowed} from './denki/window.mjs';
import {createAuth} from './auth.mjs';
import {defaultAvatar,avatarUrl} from './avatar.mjs';
import {createCommunityAdmin} from './community-admin.mjs';
import {createTopicPosting} from './topic-posting.mjs';
import {createTopicAttachments} from './topic-attachments.mjs';
import {topicTags} from './dist/topic-tags.js';
import {sitemapForHost,robotsForHost} from './sitemap.mjs';
import {applySchema} from './schema.mjs';
import {releaseInfo} from './release.mjs';
import {changeTopicFlags} from './topic-state.mjs';
import {createCommunityPolicy} from './community-policy.mjs';

const root=path.dirname(fileURLToPath(import.meta.url)),dist=path.join(root,'dist');
const release=await releaseInfo(root);
const dataDir=process.env.JPL_DATA_DIR||path.join(root,'data');
await mkdir(dataDir,{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(dataDir,'community.sqlite'),{timeout:5000});
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
const schemaState=applySchema(db);
const translator=createTranslator(db);
const denkiData=installDataset(db,denkiSeed);
const q=sql=>db.prepare(sql),now=()=>new Date().toISOString();
const port=Number(process.env.PORT||8797),secure=process.env.COOKIE_SECURE!=='0';
const approvedHosts=new Set((process.env.JPL_HOSTS||'jp-lifebase.com,www.jp-lifebase.com,localhost,127.0.0.1').split(','));
let seedContent={ja:[],en:[]};
try{seedContent=(await import('./dist/seed-content.js')).topicsByLocale;}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
if(process.env.JPL_SEED!=='0'){
 const seeds=seedContent.ja?.length?seedContent.ja:[{id:'welcome',title:'Japan Life Baseへようこそ',body:'日本での暮らしについて、質問や経験を共有しましょう。',excerpt:'日本の生活について話すコミュニティです。',category:'site',author:'Japan Life Base',avatar:'J',pinned:true}];
 const insert=q('INSERT OR IGNORE INTO topics(id,title,body,excerpt,category,user_id,author,avatar,tone,pinned,language,seed,created_at,updated_at) VALUES(?,?,?,?,?,NULL,?,?,?,?,?,1,?,?)');
 for(const t of seeds)insert.run(t.id,t.title,t.body,t.excerpt||t.body.slice(0,160),t.category,t.author||'Japan Life Base',t.avatar||'J',t.tone||0,t.pinned?1:0,'ja',now(),now());
}
const limits=new Map();
function httpError(status,code){return Object.assign(new Error(code),{status,code});}
function limit(req,bucket,max,windowMs){
 const ip=req.headers['cf-connecting-ip']||req.socket.remoteAddress;
 const key=bucket+':'+ip,time=Date.now();let current=limits.get(key);
 if(!current||current.until<time){current={until:time+windowMs,count:0};limits.set(key,current);}
 if(++current.count>max)throw Object.assign(httpError(429,'rate_limited'),{retryAfter:Math.max(1,Math.ceil((current.until-time)/1000))});
 if(limits.size>10000)for(const [k,v]of limits)if(v.until<time)limits.delete(k);
}
function json(res,status,value,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(value));}
function text(value,min,max,code='invalid_input'){
 if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||value.includes('\0'))throw httpError(400,code);
 return value.trim();
}
function language(value='zh-CN'){
 if(value==='original')return value;
 if(typeof value!=='string'||value.length>35)throw httpError(400,'invalid_language');
 try{const tag=Intl.getCanonicalLocales(value)[0]||'zh-CN',locale=new Intl.Locale(tag);if(['ja','en','ko'].includes(locale.language))return locale.language;if(locale.language==='zh')return locale.script==='Hant'||['TW','HK','MO'].includes(locale.region)?'zh-TW':'zh-CN';return tag;}catch{throw httpError(400,'invalid_language');}
}
const humanLanguage=lang=>['ja','en','ko','zh-CN','zh-TW'].includes(lang);
function email(value){const normalized=text(value,3,254,'invalid_email').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw httpError(400,'invalid_email');return normalized;}
async function body(req){
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw httpError(415,'json_required');
 const chunks=[];let bytes=0;
 for await(const chunk of req){bytes+=chunk.length;if(bytes>160000)throw httpError(413,'request_too_large');chunks.push(chunk);}
 try{const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!b||Array.isArray(b)||typeof b!=='object')throw 0;return b;}catch{throw httpError(400,'invalid_json');}
}
function session(req){
 return auth.session(req);
}
function userRequired(req){const u=session(req);if(!u)throw httpError(401,'login_required');return u;}
function transaction(work){db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
const auth=await createAuth({db,dataDir,secure,body,json,language,limit,text,migrate:false});
const policy=createCommunityPolicy({db,body,json,userRequired,httpError,language});
const communityAdmin=createCommunityAdmin({db,body,json,userRequired,httpError,policy,migrate:false});
const topicAttachments=createTopicAttachments({db,body,json,userRequired,httpError,limit,migrate:false,postingRequired:policy.postingRequired});
const topicPosting=createTopicPosting({db,text,language,httpError,limit,attachments:topicAttachments,migrate:false});
const attachmentCleanup=setInterval(()=>{try{topicAttachments.cleanup();}catch(e){console.error('Attachment cleanup failed:',e.code||e.name);}},3600000);
attachmentCleanup.unref();
function serializeTopic(row){return {id:row.id,title:row.title,body:row.body,bodyFormat:row.body_format||'plain',tagIds:topicPosting.tagsForTopic(row.id),attachments:topicAttachments.forTopic(row.id),excerpt:row.excerpt,category:row.category,author:row.author,...(row.user_id?defaultAvatar(row.author):{avatar:row.avatar,tone:row.tone}),avatarUrl:avatarUrl(row.user_id,row.avatar_hash),pinned:!!row.pinned,seed:!!row.seed,language:row.language,userId:row.user_id,createdAt:row.created_at,updatedAt:row.updated_at,minutes:Math.max(0,Math.floor((Date.now()-Date.parse(row.updated_at))/60000)),replies:Number(row.replies||0)};}
const topicQuery='SELECT t.*,u.avatar_hash,(SELECT count(*) FROM posts p WHERE p.topic_id=t.id) AS replies FROM topics t LEFT JOIN users u ON u.id=t.user_id';
async function localizedTopics(rows,target,full=false){
 const result=rows.map(serializeTopic);let automatic=false,unavailable=false;
 if(target==='original')return {topics:result,translation:{automatic:false,language:target}};
 const pending=[],markdownOriginals=[];
 for(const t of result){
  const manual=t.seed?seedContent[target]?.find(s=>s.id===t.id):null;
  if(manual){Object.assign(t,{title:manual.title,body:manual.body,excerpt:manual.excerpt||manual.body.slice(0,160)});continue;}
  if(humanLanguage(target))continue;
  if(t.language.split('-')[0]===target.split('-')[0])continue;
  if(full&&t.bodyFormat==='markdown')markdownOriginals.push(t);
  pending.push({item:t,source:t.language,keys:full&&t.bodyFormat!=='markdown'?['title','body','excerpt']:['title','excerpt']});
 }
 const translated=await batchTranslate(pending,target);automatic=translated.automatic;unavailable=translated.unavailable;
 for(const t of markdownOriginals){t.original={...t.original,body:t.body,bodyFormat:t.bodyFormat,language:t.language};t.translation={...t.translation,unavailable:true,language:target};unavailable=true;}
 return {topics:result,translation:{automatic,unavailable,language:target}};
}
async function batchTranslate(entries,target){
 let automatic=false,unavailable=false;
 const groups=new Map();
 for(const entry of entries){if(!groups.has(entry.source))groups.set(entry.source,[]);groups.get(entry.source).push(entry);}
 await Promise.all([...groups].map(async([source,group])=>{
  const items={},selected=[];let chars=0,count=0;
  for(const [index,entry]of group.entries()){
   const size=entry.keys.reduce((n,k)=>n+String(entry.item[k]||'').length,0);
   if(count+entry.keys.length>190||chars+size>55000){entry.item.translation={automatic:false,unavailable:true,language:target};unavailable=true;continue;}
   count+=entry.keys.length;chars+=size;selected.push({entry,index});for(const k of entry.keys)items[`p${index}_${k}`]=String(entry.item[k]||'');
  }
  if(!selected.length)return;
  try{const out=await translator.translate(target,source,items,{timeout:12000});for(const {entry,index}of selected){entry.item.original=Object.fromEntries([...entry.keys.map(k=>[k,entry.item[k]]),['language',source],['bodyFormat',entry.item.bodyFormat||'plain']]);for(const k of entry.keys)entry.item[k]=out.items[`p${index}_${k}`];entry.item.translation={automatic:true,language:target};}automatic=true;}
  catch{for(const {entry}of selected)entry.item.translation={automatic:false,unavailable:true,language:target};unavailable=true;}
 }));
 return {automatic,unavailable};
}
async function getTopic(id,target){
 const row=q(topicQuery+' WHERE t.id=? AND t.hidden=0').get(id);if(!row)throw httpError(404,'topic_not_found');
 const localized=await localizedTopics([row],target,true),topic=localized.topics[0];
 const replies=q('SELECT p.*,u.name AS author,u.avatar_hash FROM posts p JOIN users u ON u.id=p.user_id WHERE p.topic_id=? ORDER BY p.created_at,p.id LIMIT 250').all(id);
 const posts=[{id:'first-'+id,author:topic.author,avatar:topic.avatar,tone:topic.tone,avatarUrl:topic.avatarUrl,body:topic.body,bodyFormat:topic.bodyFormat,language:topic.language,userId:topic.userId,createdAt:topic.createdAt,original:topic.original,translation:topic.bodyFormat==='markdown'&&topic.translation?.unavailable?{...topic.translation,automatic:false}:topic.translation}];
 let automatic=localized.translation.automatic,unavailable=localized.translation.unavailable;
 const pending=[];
 for(const row of replies){const p={id:row.id,author:row.author,...defaultAvatar(row.author),avatarUrl:avatarUrl(row.user_id,row.avatar_hash),body:row.body,bodyFormat:'plain',quote:row.quote,language:row.language,userId:row.user_id,createdAt:row.created_at};
  if(target!=='original'&&!humanLanguage(target)&&p.language.split('-')[0]!==target.split('-')[0])pending.push({item:p,source:p.language,keys:p.quote?['body','quote']:['body']});
  posts.push(p);
 }
 const translated=await batchTranslate(pending,target);automatic||=translated.automatic;unavailable||=translated.unavailable;
 return {topic,posts,translation:{automatic,unavailable,language:target}};
}
async function api(req,res,url){
 const route=url.pathname,method=req.method,target=language(url.searchParams.get('lang')||'zh-CN');
 if(await auth.handle(req,res,route))return;
 if(req.method==='POST'&&route==='/api/me/preferences')limit(req,'preferences',60,60000);
 if(await policy.handle(req,res,url))return;
 if(await communityAdmin.handle(req,res,url))return;
 if(await topicAttachments.handle(req,res,url))return;
 if(method==='GET'&&route==='/api/tags')return json(res,200,{tags:topicTags});
 if(method==='GET'&&route==='/api/denki/catalog')return json(res,200,denkiCatalog(denkiData,undefined,url.searchParams.get('area')??'tokyo'));
 if(method==='GET'&&route==='/api/denki/dataset'){
  const version=url.searchParams.get('version')||denkiData.version;
  if(version.length>80)throw httpError(400,'invalid_version');
  const snapshot=readDataset(db,version);if(!snapshot)throw httpError(404,'version_not_found');
  return json(res,200,snapshot);
 }
 if(method==='POST'&&route==='/api/denki/compare'){
  limit(req,'denki',60,60000);const b=await body(req);
  if(!monthAllowed(b.billingMonth))throw httpError(400,'month_outside_window');
  const snapshot=b.version?readDataset(db,text(b.version,1,80,'invalid_version')):denkiData;
  if(!snapshot)throw httpError(400,'version_not_found');
  return json(res,200,denkiCompare(b,snapshot));
 }
 if(method==='GET'&&route==='/api/health')return json(res,200,{ok:true,service:'jp-lifebase',...release,schemaVersion:schemaState.version,datasetVersion:denkiData.version,translationConfigured:translator.configured});
 if(method==='GET'&&route==='/api/topics'){
  limit(req,'read',120,60000);const tag=url.searchParams.get('tag');
  if(tag!==null&&!topicTags.some(item=>item.id===tag))throw httpError(400,'invalid_tags');
  const rows=tag===null?q(topicQuery+' WHERE t.hidden=0 ORDER BY t.pinned DESC,t.updated_at DESC LIMIT 250').all():q(topicQuery+' WHERE t.hidden=0 AND EXISTS (SELECT 1 FROM topic_tags tt WHERE tt.topic_id=t.id AND tt.tag_id=?) ORDER BY t.pinned DESC,t.updated_at DESC LIMIT 250').all(tag);
  return json(res,200,{...await localizedTopics(rows,target),tag:tag||null});
 }
 if(method==='POST'&&route==='/api/topics'){
  const previous=policy.postingRequired(req),input=await body(req),user=policy.postingRequired(req);if(user.id!==previous.id)throw httpError(409,'account_changed');const result=topicPosting.create(req,user,input);
  return json(res,result.replayed?200:201,{topic:serializeTopic(q(topicQuery+' WHERE t.id=?').get(result.id)),replayed:result.replayed});
 }
 const match=route.match(/^\/api\/topics\/([a-zA-Z0-9_-]{1,100})(?:\/(replies|report))?$/);
 if(match){const id=match[1];
  if(method==='GET'&&!match[2]){limit(req,'read',120,60000);return json(res,200,await getTopic(id,target));}
  if(method==='POST'&&match[2]==='replies'){
   const previous=policy.postingRequired(req);limit(req,'reply',15,10*60000);const b=await body(req),user=policy.postingRequired(req);if(user.id!==previous.id)throw httpError(409,'account_changed');const content=text(b.body,1,6000),lang=language(b.language||'zh-CN');if(lang==='original')throw httpError(400,'invalid_language');
   if(!q('SELECT id FROM topics WHERE id=? AND hidden=0').get(id))throw httpError(404,'topic_not_found');
   const quote=b.quote?text(typeof b.quote==='string'?b.quote:`${b.quote.author||''}: ${b.quote.body||''}`,1,5000):null;
   const post={id:randomUUID(),topicId:id,body:content,bodyFormat:'plain',author:user.name,userId:user.id,avatar:user.avatar,tone:user.tone,avatarUrl:user.avatarUrl,createdAt:now(),language:lang,quote};
   transaction(()=>{q('INSERT INTO posts VALUES(?,?,?,?,?,?,?)').run(post.id,id,user.id,content,quote,lang,post.createdAt);q('UPDATE topics SET updated_at=? WHERE id=?').run(post.createdAt,id);});return json(res,201,{post});
  }
  if(method==='POST'&&match[2]==='report'){const previous=userRequired(req);limit(req,'report',5,3600000);const b=await body(req),u=userRequired(req);if(u.id!==previous.id)throw httpError(409,'account_changed');if(!q('SELECT id FROM topics WHERE id=? AND hidden=0').get(id))throw httpError(404,'topic_not_found');q('INSERT INTO reports(id,topic_id,user_id,reason,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),id,u.id,text(b.reason,3,1000),now());return json(res,201,{ok:true});}
  if(method==='DELETE'&&!match[2]){const u=policy.postingRequired(req);const topic=changeTopicFlags(db,{topicId:id,operator:u,hidden:true,action:'author_hide',allowAuthor:true});return json(res,200,{ok:true,topic,recoverable:true});}
 }
 if(method==='GET'&&route==='/api/me/topics'){const u=userRequired(req);return json(res,200,await localizedTopics(q(topicQuery+' WHERE t.user_id=? AND t.hidden=0 ORDER BY t.updated_at DESC').all(u.id),target));}
 if(method==='GET'&&route==='/api/me/messages'){
  const u=userRequired(req);const rows=q('SELECT p.id,p.topic_id AS topicId,t.title AS topicTitle,u.name AS author,p.body,p.created_at AS createdAt FROM posts p JOIN topics t ON t.id=p.topic_id JOIN users u ON u.id=p.user_id WHERE t.user_id=? AND p.user_id<>? AND t.hidden=0 ORDER BY p.created_at DESC LIMIT 100').all(u.id,u.id);
  return json(res,200,{messages:rows});
 }
 if(method==='POST'&&route==='/api/contact'){limit(req,'contact',3,3600000);const b=await body(req);q('INSERT INTO contacts VALUES(?,?,?,?,?)').run(randomUUID(),text(b.name,1,60),email(b.email),text(b.message,5,5000),now());return json(res,201,{ok:true});}
 if(method==='POST'&&route==='/api/translate'){limit(req,'translate',20,60000);const b=await body(req),target=language(b.target);if(humanLanguage(target))throw httpError(400,'manual_language');return json(res,200,await translator.translate(target,language(b.source||'en'),b.items));}
 throw httpError(404,'not_found');
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 try{
  const hostname=String(req.headers.host||'').split(':')[0].toLowerCase();if(!approvedHosts.has(hostname))throw httpError(400,'invalid_host');
  const url=new URL(req.url,'http://'+req.headers.host);
  if(req.method==='GET'&&hostname==='jp-lifebase.com'&&url.pathname==='/'){res.writeHead(308,{Location:'https://www.jp-lifebase.com/'+url.search});return res.end();}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if(!['GET','HEAD','POST','DELETE'].includes(req.method))throw httpError(405,'method_not_allowed');
  if(['POST','DELETE'].includes(req.method)){
   const origin=req.headers.origin;if(!origin||!['http:','https:'].includes(new URL(origin).protocol)||new URL(origin).host!==req.headers.host)throw httpError(403,'invalid_origin');
   if(req.headers['sec-fetch-site']==='cross-site')throw httpError(403,'invalid_origin');
  }
  if(url.pathname.startsWith('/api/'))return await api(req,res,url);
  if(!['GET','HEAD'].includes(req.method))throw httpError(405,'method_not_allowed');
  if(url.pathname==='/robots.txt'||url.pathname==='/sitemap.xml'){
   const xml=url.pathname==='/sitemap.xml';
   res.writeHead(200,{'Content-Type':xml?'application/xml; charset=utf-8':'text/plain; charset=utf-8','Cache-Control':'no-store, max-age=0'});
   return res.end(req.method==='HEAD'?undefined:xml?sitemapForHost(hostname):robotsForHost(hostname));
  }
  let pathname=decodeURIComponent(url.pathname);if(pathname.includes('\0')||pathname.includes('\\')||pathname.split('/').some(s=>s.startsWith('.')))throw httpError(404,'not_found');
  if(/^\/denkikakaku\/?$/.test(pathname))pathname='/denki.html';
  if(/^\/admin\/?$/.test(pathname))pathname='/admin.html';
  if(pathname==='/'||/^\/moving-checklist\/?$/.test(pathname)||/^\/t\/[a-zA-Z0-9_-]+$/.test(pathname)||/^\/account(?:\/[a-z-]+)?\/?$/.test(pathname))pathname='/index.html';
  const filename=path.resolve(dist,'.'+pathname);if(!filename.startsWith(dist+path.sep)||!mime[path.extname(filename)])throw httpError(404,'not_found');
  let bytes;try{if(!(await stat(filename)).isFile())throw 0;bytes=await readFile(filename);}catch{throw httpError(404,'not_found');}
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)],'Cache-Control':'no-store, max-age=0'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.code||'server_error',code:e.code||'server_error',...(e.retryAfter?{retryAfter:e.retryAfter}:{}),...(Number.isInteger(e.remainingAttempts)?{remainingAttempts:e.remainingAttempts}:{})},e.retryAfter?{'Retry-After':String(e.retryAfter)}:{});else res.end();if(!e.status)console.error('Request failed:',e.code||e.name);}
});
server.headersTimeout=15000;server.requestTimeout=30000;
server.listen(port,'127.0.0.1',()=>console.log(`Japan Life Base listening on http://127.0.0.1:${server.address().port}`));
function shutdown(){server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(0),8000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
