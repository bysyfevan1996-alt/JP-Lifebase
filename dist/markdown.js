import {parseMarkdown} from './markdown-core.js?v=20261021223719402';

export function renderMarkdownDocument(container,tree){
 container.replaceChildren();
 if(!tree||tree.version!==1||!Array.isArray(tree.blocks))return;
 let remaining=10000;
 const tags=new Set(['p','h1','h2','h3','blockquote','ul','ol','li','strong','em','br','hr']);
 function render(parent,node,depth=0){
  if(!node||typeof node!=='object'||--remaining<0||depth>16)return;
  if(node.type==='text'){parent.append(document.createTextNode(String(node.text??'')));return;}
  let element;
  if(node.type==='pre'||node.type==='code'){
   const code=document.createElement('code');code.textContent=String(node.text??'');
   if(node.type==='code')element=code;else{element=document.createElement('pre');element.append(code);}
  }else if(node.type==='link'){
   let url;try{url=new URL(node.href);}catch{}
   if(!url||!['https:','http:'].includes(url.protocol)){for(const child of node.children||[])render(parent,child,depth+1);return;}
   element=document.createElement('a');element.href=url.href;element.target='_blank';element.rel='noopener noreferrer';
   for(const child of node.children||[])render(element,child,depth+1);
  }else if(tags.has(node.type)){
   element=document.createElement(node.type);
   if(node.type==='ol')element.start=Number.isSafeInteger(node.start)&&node.start>0?node.start:1;
   for(const child of Array.isArray(node.children)?node.children:[])render(element,child,depth+1);
  }else return;
  parent.append(element);
 }
 for(const node of tree.blocks)render(container,node);
}
export function renderMarkdown(container,source){renderMarkdownDocument(container,parseMarkdown(source));}
