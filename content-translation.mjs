import {createHash} from 'node:crypto';
import {parseMarkdown} from './dist/markdown-core.js';
import {protectTranslationText} from './content-translation-text.mjs';

const RULES='markdown-tree-v1';
export function createContentTranslation({db,content,translator,body,json,language,session,limit,httpError}){
 const q=sql=>db.prepare(sql),pending=new Map();
 function current(kind,id,version){const row=content.source(kind,id);if(row.version!==version)throw httpError(409,'revision_conflict');return row;}
 function quota(req,chars){
  const day=new Date().toISOString().slice(0,10),user=session(req);
  const ip=createHash('sha256').update(String(req.headers['cf-connecting-ip']||req.socket.remoteAddress)).digest('hex');
  const principals=[{key:'ip:'+ip,max:80000,requests:120},...(user?[{key:'user:'+user.id,max:120000,requests:180}]:[])];
  db.exec('BEGIN IMMEDIATE');try{
   for(const principal of principals){const used=q('SELECT requests,characters FROM content_translation_quotas WHERE principal=? AND day=?').get(principal.key,day);if((used?.characters||0)+chars>principal.max||(used?.requests||0)>=principal.requests)throw httpError(429,'content_translation_limit');}
   for(const principal of principals)q('INSERT INTO content_translation_quotas(principal,day,requests,characters) VALUES(?,?,1,?) ON CONFLICT(principal,day) DO UPDATE SET requests=requests+1,characters=characters+excluded.characters').run(principal.key,day,chars);
   q('DELETE FROM content_translation_quotas WHERE day<?').run(new Date(Date.now()-8*86400000).toISOString().slice(0,10));
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 async function translate(req,kind,id,input){
  const row=content.source(kind,id),version=input.expectedVersion;
  if(!Number.isSafeInteger(version)||version<1)throw httpError(400,'invalid_content_version');
  if(row.version!==version)throw httpError(409,'revision_conflict');
  const target=language(input.target);if(target==='original'||target==='und')throw httpError(400,'invalid_language');
  const identity={kind,id,topicId:row.topicId,version,sourceLanguage:row.language,language:target,bodyFormat:row.bodyFormat};
  if(row.language===target)return {...identity,automatic:false,fromCache:false,body:row.body,...(row.bodyFormat==='markdown'?{document:parseMarkdown(row.body)}:{})};
  const key=[kind,id,version,target,row.language,RULES];
  const cached=q('SELECT payload FROM content_translations WHERE kind=? AND content_id=? AND version=? AND target=? AND source_language=? AND rules_version=?').get(...key);
  if(cached)return {...identity,...JSON.parse(cached.payload),automatic:true,fromCache:true};
  const pendingKey=JSON.stringify(key);
  if(pending.has(pendingKey)){const result=await pending.get(pendingKey);current(kind,id,version);return result;}
  const task=(async()=>{
   const tree=row.bodyFormat==='markdown'?parseMarkdown(row.body):null,nodes=[];
   function walk(node){if(node.type==='text'&&node.text.trim())nodes.push(node);if(!['pre','code','blockquote'].includes(node.type))for(const child of node.children||[])walk(child);}
   if(tree)for(const block of tree.blocks)walk(block);else nodes.push({text:row.body});
   const protectedNodes=nodes.map(node=>protectTranslationText(node.text));
   const items=Object.fromEntries(protectedNodes.map((part,index)=>['text'+index,part.text]));
   // Long documents are bounded by existing posting limits and provider item limits.
   if(nodes.length>190)throw httpError(400,'translation_too_large');
   quota(req,protectedNodes.reduce((sum,part)=>sum+part.text.length,0));
   let result;
   try{
    const validate=values=>{for(const [index,part]of protectedNodes.entries())part.restore(values['text'+index]);};
    const output=nodes.length?await translator.translate(target,row.language,items,{timeout:20000,cacheScope:JSON.stringify(key),validate}):{items:{}};
    for(const [index,node]of nodes.entries())node.text=protectedNodes[index].restore(output.items['text'+index]);
    result=tree?{document:tree}:{body:nodes[0]?.text??row.body};
   }catch(error){if(error.status)throw error;throw httpError(503,'translation_structure_invalid');}
   current(kind,id,version);
   q('INSERT OR REPLACE INTO content_translations(kind,content_id,version,target,source_language,rules_version,payload,created_at) VALUES(?,?,?,?,?,?,?,?)').run(...key,JSON.stringify(result),new Date().toISOString());
   return {...identity,...result,automatic:true,fromCache:false};
  })();
  pending.set(pendingKey,task);
  try{return await task;}finally{pending.delete(pendingKey);}
 }
 async function handle(req,res,url){
  const match=url.pathname.match(/^\/api\/content\/(topic|post)\/([a-zA-Z0-9_-]{1,100})\/translate$/);if(!match)return false;
  if(req.method!=='POST')throw httpError(405,'method_not_allowed');
  limit(req,'content-translate',30,60000);const input=await body(req);
  json(res,200,{content:await translate(req,match[1],match[2],input)});return true;
 }
 return {handle,translate};
}
