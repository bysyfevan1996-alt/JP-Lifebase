// One small Markdown tree shared by rendering, quoting and translation.
const text=value=>({type:'text',text:value});
export function inlineMarkdown(value,depth=0){
 if(depth>3)return [text(value)];
 const out=[],pattern=/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)/g;
 let previous=0,match;
 while((match=pattern.exec(value))){
  if(match.index>previous)out.push(text(value.slice(previous,match.index)));
  if(match[1]!==undefined||match[2]!==undefined)out.push({type:match[1]!==undefined?'strong':'em',children:inlineMarkdown(match[1]??match[2],depth+1)});
  else if(match[3]!==undefined)out.push({type:'code',text:match[3]});
  else{let url;try{url=new URL(match[5]);}catch{}out.push(url&&['https:','http:'].includes(url.protocol)?{type:'link',href:url.href,children:[text(match[4])]}:text(match[0]));}
  previous=pattern.lastIndex;
 }
 if(previous<value.length)out.push(text(value.slice(previous)));
 return out;
}
export function parseMarkdown(source){
 const lines=String(source??'').replace(/\r\n?/g,'\n').split('\n'),blocks=[];let index=0;
 const isBlock=line=>/^\s*$|^```|^#{1,3}\s|^>\s?|^\s*[-*]\s|^\s*\d+\.\s|^\s*---+\s*$/.test(line);
 while(index<lines.length){
  const line=lines[index];if(!line.trim()){index++;continue;}
  if(/^```/.test(line)){index++;const code=[];while(index<lines.length&&!/^```/.test(lines[index]))code.push(lines[index++]);if(index<lines.length)index++;blocks.push({type:'pre',text:code.join('\n')});continue;}
  const heading=line.match(/^(#{1,3})\s+(.*)$/);
  if(heading){blocks.push({type:'h'+heading[1].length,children:inlineMarkdown(heading[2])});index++;continue;}
  if(/^\s*---+\s*$/.test(line)){blocks.push({type:'hr'});index++;continue;}
  if(/^>\s?/.test(line)){
   const children=[];while(index<lines.length&&/^>\s?/.test(lines[index])){if(children.length)children.push({type:'br'});children.push(...inlineMarkdown(lines[index++].replace(/^>\s?/,'')));}blocks.push({type:'blockquote',children});continue;
  }
  const list=line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)$/);
  if(list){const ordered=Boolean(list[2]),children=[],pattern=ordered?/^\s*\d+\.\s+(.*)$/:/^\s*[-*]\s+(.*)$/;let item;while(index<lines.length&&(item=lines[index].match(pattern))){children.push({type:'li',children:inlineMarkdown(item[1])});index++;}blocks.push({type:ordered?'ol':'ul',...(ordered?{start:Number(list[2])||1}:{}),children});continue;}
  const children=inlineMarkdown(lines[index++]);while(index<lines.length&&!isBlock(lines[index]))children.push({type:'br'},...inlineMarkdown(lines[index++]));blocks.push({type:'p',children});
 }
 return {version:1,blocks};
}
export function markdownText(source){
 const read=node=>node.type==='br'?'\n':typeof node.text==='string'?node.text:(node.children||[]).map(read).join(node.type==='ul'||node.type==='ol'?'\n':'');
 return parseMarkdown(source).blocks.map(read).join('\n');
}
