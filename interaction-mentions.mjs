import {parseMarkdown} from './dist/markdown-core.js';

// Only visible original text is eligible. URLs and quoted/code nodes are never scanned.
export function extractMentionHandles(source,bodyFormat='plain'){
 if(typeof source!=='string'||!source)return [];
 let visible;
 if(bodyFormat==='markdown'){
  const read=node=>{
   if(['pre','code','blockquote'].includes(node.type))return ' ';
   if(node.type==='br')return '\n';
   if(node.type==='text')return node.text||'';
   return (node.children||[]).map(read).join(node.type==='ul'||node.type==='ol'?'\n':'');
  };
  visible=parseMarkdown(source).blocks.map(read).join('\n');
 }else{
  let fenced=false;const lines=[];
  for(const line of source.replace(/\r\n?/g,'\n').split('\n')){
   if(/^\s*```/.test(line)){fenced=!fenced;lines.push('');continue;}
   lines.push(fenced||/^\s*>/.test(line)?'':line.replace(/`+[^`]*`+/g,' '));
  }
  visible=lines.join('\n');
 }
 visible=visible.replace(/https?:\/\/\S+/gi,' ');
 const found=[],seen=new Set(),pattern=/(^|[^a-z0-9_@.+-])@([a-z][a-z0-9_]{2,31})(?![a-z0-9_])/gi;
 for(const match of visible.matchAll(pattern)){const handle=match[2].toLowerCase();if(!seen.has(handle)){seen.add(handle);found.push(handle);if(found.length===20)break;}}
 return found;
}
