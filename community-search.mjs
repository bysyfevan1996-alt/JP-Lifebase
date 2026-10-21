import {createHash} from 'node:crypto';
import {avatarUrl} from './avatar.mjs';
import {normalizeSearchQuery,makeExcerpt} from './search-text.mjs';

const idPattern=/^[a-z][a-z0-9-]{0,39}$/;
const handlePattern=/^[a-z][a-z0-9_]{2,31}$/;
const contentId=/^[a-zA-Z0-9_-]{1,100}$/;
export function createCommunitySearch({db,json,httpError,limit,interactions}){
 const q=sql=>db.prepare(sql);
 db.function('m5_casefold',{deterministic:true},value=>String(value??'').toLowerCase());
 function parse(params){
  let normalized;try{normalized=normalizeSearchQuery(params.get('q')||'');}catch{throw httpError(400,'invalid_search_query');}
  const values={query:normalized.query};
  for(const key of ['category','tag','author','language','from','to','solved','kind','sort'])values[key]=params.get(key)||'';
  for(const key of ['category','tag'])if(values[key]&&!idPattern.test(values[key]))throw httpError(400,'invalid_search_filter');
  if(values.author){values.author=values.author.replace(/^@/,'').toLowerCase();if(!handlePattern.test(values.author))throw httpError(400,'invalid_search_filter');}
  if(values.language){if(values.language.length>35)throw httpError(400,'invalid_search_filter');try{values.language=Intl.getCanonicalLocales(values.language)[0];}catch{throw httpError(400,'invalid_search_filter');}}
  for(const key of ['from','to'])if(values[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(values[key])||!Number.isFinite(Date.parse(values[key]+'T00:00:00.000Z'))||new Date(values[key]+'T00:00:00.000Z').toISOString().slice(0,10)!==values[key]))throw httpError(400,'invalid_search_filter');
  if(values.from&&values.to&&values.from>values.to)throw httpError(400,'invalid_search_filter');
  if(values.solved&&!['true','false'].includes(values.solved)||values.kind&&!['topic','post'].includes(values.kind)||values.sort&&!['relevance','latest'].includes(values.sort))throw httpError(400,'invalid_search_filter');
  values.sort||='relevance';
  if(!normalized.terms.length&&!['category','tag','author','language','from','to','solved','kind'].some(key=>values[key]))throw httpError(400,'search_query_required');
  const fingerprint=createHash('sha256').update(JSON.stringify(values)).digest('hex');
  let point=null;const cursor=params.get('cursor');
  if(cursor){try{if(cursor.length>1200||!/^[A-Za-z0-9_-]+$/.test(cursor))throw 0;point=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(!Array.isArray(point)||point.length!==5||point[0]!==fingerprint||typeof point[1]!=='number'||!Number.isFinite(point[1])||typeof point[2]!=='string'||!Number.isFinite(Date.parse(point[2]))||!['topic','post'].includes(point[3])||!contentId.test(point[4]))throw 0;}catch{throw httpError(400,'invalid_search_cursor');}}
  return {...normalized,...values,fingerprint,point};
 }
 function search(params){
  const input=parse(params),bind=[],where=["t.hidden=0","t.seed=0","(f.kind='topic' AND f.content_id=t.id OR f.kind='post' AND p.id IS NOT NULL AND p.hidden=0)"];
  let from='community_search_fts f',score='0.0';
  if(input.mode==='trigram'){
   from='(SELECT rowid,bm25(community_search_fts,0,0,0,0,5,1) score FROM community_search_fts WHERE community_search_fts MATCH ?) hit JOIN community_search_fts f ON f.rowid=hit.rowid';bind.push(input.match);score='hit.score';
  }
  // Literal checks also constrain punctuation/space semantics that the tokenizer may omit.
  for(const term of input.terms){where.push("instr(m5_casefold(f.title||char(10)||f.body),?)>0");bind.push(term.toLowerCase());}
  const exact=(field,value)=>{where.push(field+'=?');bind.push(value);};
  if(input.category)exact('t.category',input.category);
  if(input.tag){where.push('EXISTS(SELECT 1 FROM topic_tags tt WHERE tt.topic_id=t.id AND tt.tag_id=?)');bind.push(input.tag);}
  if(input.author)exact('h.handle COLLATE NOCASE',input.author);
  if(input.language)exact("CASE WHEN f.kind='topic' THEN t.language ELSE p.language END COLLATE NOCASE",input.language);
  if(input.kind)exact('f.kind',input.kind);
  const created="CASE WHEN f.kind='topic' THEN t.created_at ELSE p.created_at END";
  if(input.from){where.push(created+'>=?');bind.push(input.from+'T00:00:00.000Z');}
  if(input.to){where.push('substr('+created+',1,10)<=?');bind.push(input.to);}
  if(input.solved)where.push((input.solved==='false'?'NOT ':'')+'EXISTS(SELECT 1 FROM topic_answers a JOIN posts ap ON ap.id=a.post_id AND ap.topic_id=t.id WHERE a.topic_id=t.id AND ap.hidden=0)');
  const rank=input.sort==='relevance'?score:'0.0';
  let outer='';
  if(input.point){const [,rank,date,kind,id]=input.point;outer=' WHERE (score>? OR score=? AND (created_at<? OR created_at=? AND (kind>? OR kind=? AND content_id>?)))';bind.push(rank,rank,date,date,kind,kind,id);}
  const sql=`WITH matches AS (SELECT f.kind,f.content_id,t.id topic_id,t.title,CASE WHEN f.kind='topic' THEN t.body ELSE p.body END body,CASE WHEN f.kind='topic' THEN t.body_format ELSE p.body_format END body_format,CASE WHEN f.kind='topic' THEN t.language ELSE p.language END language,${created} created_at,u.id user_id,coalesce(u.name,t.author) author_name,u.avatar_hash,h.handle,${rank} score FROM ${from} JOIN topics t ON t.id=f.topic_id LEFT JOIN posts p ON f.kind='post' AND p.id=f.content_id AND p.topic_id=t.id LEFT JOIN users u ON u.id=f.author_id LEFT JOIN user_handles h ON h.user_id=u.id WHERE ${where.join(' AND ')}) SELECT * FROM matches${outer} ORDER BY score ASC,created_at DESC,kind ASC,content_id ASC LIMIT 31`;
  const rows=q(sql).all(...bind),page=rows.slice(0,30),last=page.at(-1);
  return {results:page.map(row=>({kind:row.kind,id:row.content_id,topicId:row.topic_id,title:row.title,excerpt:makeExcerpt(row.body,row.body_format,input.terms),author:{id:row.user_id,name:row.author_name,handle:interactions?.handleFor(row.user_id)||row.handle||null,avatarUrl:avatarUrl(row.user_id,row.avatar_hash)},language:row.language,createdAt:row.created_at,url:'/t/'+encodeURIComponent(row.topic_id)+(row.kind==='post'?'?post='+encodeURIComponent(row.content_id):'')})),nextCursor:rows.length>30&&last?Buffer.from(JSON.stringify([input.fingerprint,last.score,last.created_at,last.kind,last.content_id])).toString('base64url'):null,query:input.query,mode:input.mode};
 }
 async function handle(req,res,url){if(req.method!=='GET'||url.pathname!=='/api/search')return false;limit?.(req,'search',60,60000);json(res,200,search(url.searchParams));return true;}
 return {handle,search};
}
