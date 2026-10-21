import {readFile} from 'node:fs/promises';
import {parseMarkdown,markdownText} from './dist/markdown-core.js';

const origin='https://www.jp-lifebase.com';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const idPattern=/^[a-zA-Z0-9_-]{1,100}$/;
const language=value=>{try{return Intl.getCanonicalLocales(value)[0]||'und';}catch{return 'und';}};
export function safeMarkdownHTML(source,format='plain'){
 if(format!=='markdown')return '<p>'+escape(source).replace(/\r?\n/g,'<br>')+'</p>';
 function render(node){
  if(node.type==='text')return escape(node.text);
  if(node.type==='br'||node.type==='hr')return '<'+node.type+'>';
  if(node.type==='code')return '<code>'+escape(node.text)+'</code>';
  if(node.type==='pre')return '<pre><code>'+escape(node.text)+'</code></pre>';
  const children=(node.children||[]).map(render).join('');
  if(node.type==='link'){let url;try{url=new URL(node.href);}catch{}return url&&['http:','https:'].includes(url.protocol)?'<a href="'+escape(url.href)+'" rel="nofollow noopener noreferrer">'+children+'</a>':children;}
  if(['p','h1','h2','h3','strong','em','blockquote','ul','ol','li'].includes(node.type))return '<'+node.type+(node.type==='ol'&&Number.isSafeInteger(node.start)&&node.start>0?' start="'+node.start+'"':'')+'>'+children+'</'+node.type+'>';
  return children;
 }
 return parseMarkdown(source).blocks.map(render).join('\n');
}
const xml=items=>'<?xml version="1.0" encoding="UTF-8"?>\n'+items;
export function createCommunitySEO({db,interactions}){
 const q=sql=>db.prepare(sql),pageSize=5000;
 const visible="t.hidden=0 AND t.seed=0";
 function sitemapIndex(){const count=Number(q('SELECT count(*) n FROM topics t WHERE '+visible).get().n),pages=Math.ceil(count/pageSize);return xml('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<sitemap><loc>'+origin+'/sitemap-community.xml</loc></sitemap>\n'+Array.from({length:pages},(_,i)=>'<sitemap><loc>'+origin+'/sitemap-topics.xml?page='+(i+1)+'</loc></sitemap>').join('\n')+'\n</sitemapindex>');}
 function topicSitemap(page){
  const rows=q(`SELECT t.id,t.created_at,t.edited_at,(SELECT max(p.created_at) FROM posts p WHERE p.topic_id=t.id AND p.hidden=0) reply_at,(SELECT max(p.edited_at) FROM posts p WHERE p.topic_id=t.id AND p.hidden=0) reply_edit_at FROM topics t WHERE ${visible} ORDER BY t.id LIMIT ? OFFSET ?`).all(pageSize,(page-1)*pageSize);
  return xml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+rows.map(row=>{const dates=[row.created_at,row.edited_at,row.reply_at,row.reply_edit_at].filter(value=>value&&Number.isFinite(Date.parse(value))).sort();return '<url><loc>'+origin+'/t/'+escape(row.id)+'</loc>'+(dates.length?'<lastmod>'+escape(dates.at(-1))+'</lastmod>':'')+'</url>';}).join('\n')+'\n</urlset>');
 }
 function send(req,res,status,type,value,headers={}){res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers});res.end(req.method==='HEAD'?undefined:value);return true;}
 async function handle(req,res,url){
  if(!['GET','HEAD'].includes(req.method))return false;
  const path=url.pathname;
  if(path==='/sitemap.xml'&&String(req.headers.host||'').split(':')[0].toLowerCase()!=='jp-lifebase.com')return send(req,res,200,'application/xml',sitemapIndex());
  if(path==='/sitemap-community.xml')return send(req,res,200,'application/xml',xml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+origin+'/</loc></url></urlset>'));
  if(path==='/sitemap-topics.xml'){
   const value=url.searchParams.get('page')||'1';if(!/^[1-9][0-9]{0,6}$/.test(value))return send(req,res,400,'text/plain','Invalid sitemap page');
   const page=Number(value),count=Number(q('SELECT count(*) n FROM topics t WHERE '+visible).get().n);if(page>Math.max(1,Math.ceil(count/pageSize)))return send(req,res,404,'text/plain','Sitemap page not found');
   return send(req,res,200,'application/xml',topicSitemap(page));
  }
  if(!path.startsWith('/t/'))return false;
  const id=path.slice(3);if(!idPattern.test(id))return send(req,res,404,'text/html','<!doctype html><title>Not found</title><h1>404</h1>',{'X-Robots-Tag':'noindex'});
  // File IO happens before reading visibility/current content; no await separates
  // that database snapshot from serialization and response publication.
  let html=await readFile(new URL('./dist/index.html',import.meta.url),'utf8');
  const topic=q('SELECT t.* FROM topics t WHERE t.id=? AND t.hidden=0').get(id);
  if(!topic)return send(req,res,404,'text/html','<!doctype html><html lang="en"><title>Not found</title><meta name="robots" content="noindex"><main><h1>404</h1><p>Topic not found.</p><a href="/">Japan Life Base</a></main></html>',{'X-Robots-Tag':'noindex'});
  const replies=q('SELECT p.id,p.body,p.body_format,p.language,p.created_at,u.name author FROM posts p JOIN users u ON u.id=p.user_id WHERE p.topic_id=? AND p.hidden=0 ORDER BY p.created_at,p.id LIMIT 20').all(id);
  const plain=topic.body_format==='markdown'?markdownText(topic.body):topic.body,description=Array.from(plain.replace(/\s+/g,' ').trim()).slice(0,180).join('');
  const article='<article class="topic-ssr" lang="'+escape(language(topic.language))+'"><header><h1>'+escape(topic.title)+'</h1><p>'+escape(topic.author)+' · <time datetime="'+escape(topic.created_at)+'">'+escape(topic.created_at)+'</time></p></header><section aria-label="Original post">'+safeMarkdownHTML(topic.body,topic.body_format)+'</section>'+replies.map(reply=>'<article id="post-'+escape(reply.id)+'" lang="'+escape(language(reply.language))+'"><h2>'+escape(reply.author)+'</h2><time datetime="'+escape(reply.created_at)+'">'+escape(reply.created_at)+'</time>'+safeMarkdownHTML(reply.body,reply.body_format)+'<p><a href="/t/'+escape(id)+'?post='+escape(reply.id)+'">'+escape(reply.created_at)+'</a></p></article>').join('\n')+'</article>';
  html=html.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+escape(topic.title)+' · Japan Life Base</title>').replace(/<meta\s+name="description"[^>]*>/i,'').replace(/<link\s+rel="canonical"[^>]*>/i,'');
  html=html.replace('</head>','<meta name="description" content="'+escape(description)+'"><link rel="canonical" href="'+origin+'/t/'+escape(id)+'">'+(topic.seed?'<meta name="robots" content="noindex">':'')+'</head>');
  html=html.replace('<section id="list-view"','<section id="list-view" hidden').replace('<section id="detail-view" hidden','<section id="detail-view"').replace('<div id="topic-detail"></div>','<div id="topic-detail">'+article+'</div>');
  return send(req,res,200,'text/html',html,topic.seed?{'X-Robots-Tag':'noindex'}:{});
 }
 return {handle,sitemapIndex,topicSitemap};
}
