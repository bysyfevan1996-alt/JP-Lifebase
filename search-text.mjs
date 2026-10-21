import {markdownText} from './dist/markdown-core.js';

export function normalizeSearchQuery(value){
 const invalid=()=>{throw Object.assign(new Error('invalid_search_query'),{code:'invalid_search_query'});};
 if(typeof value!=='string'||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))invalid();
 const query=value.trim().replace(/\s+/gu,' ');
 if(Array.from(query).length>100)invalid();
 const terms=query?query.split(' '):[];if(terms.length>6)invalid();
 const mode=!terms.length?'filters':terms.some(term=>Array.from(term).length<3)?'substring':'trigram';
 return {query,terms,mode,match:mode==='trigram'?terms.map(term=>'"'+term.replace(/"/g,'""')+'"').join(' AND '):null};
}

export function makeExcerpt(body,format='plain',terms=[],length=220){
 const source=(format==='markdown'?markdownText(body):String(body??'')).replace(/\s+/gu,' ').trim(),chars=Array.from(source),size=Number.isInteger(length)&&length>=8?length:220;
 if(chars.length<=size)return source;
 const folded=source.toLowerCase();let match=-1;
 for(const term of terms){const found=folded.indexOf(String(term).toLowerCase());if(found>=0&&(match<0||found<match))match=found;}
 const position=match<0?0:Array.from(source.slice(0,match)).length;
 const start=Math.max(0,position-Math.floor(size/4)),prefix=start>0?'…':'',available=size-Array.from(prefix).length;
 const hasSuffix=start+available<chars.length,end=start+available-(hasSuffix?1:0);
 return prefix+chars.slice(start,end).join('')+(hasSuffix?'…':'');
}
