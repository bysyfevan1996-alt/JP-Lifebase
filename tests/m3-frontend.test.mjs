import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMarkdown} from '../dist/m3-format.js';
import {selectTopics} from '../dist/select-topics.js';

test('shared formatter preserves selection and complete lines for all three editors',()=>{
 assert.deepEqual(formatMarkdown({value:'first\nsecond\nlast',start:7,end:12,format:'quote'}),{value:'first\n> second\nlast',start:8,end:14});
 assert.deepEqual(formatMarkdown({value:'abc def',start:0,end:3,format:'bold'}),{value:'**abc** def',start:2,end:5});
 assert.deepEqual(formatMarkdown({value:'',start:0,end:0,format:'italic',placeholder:'正文'}),{value:'*正文*',start:1,end:3});
 assert.equal(formatMarkdown({value:'abc',start:0,end:3,format:'bold',maxLength:6}),null);
 assert.equal(formatMarkdown({value:'abc',start:-1,end:1,format:'bold'}),null);
});
test('shared formatter supports fenced code, links and ordered lines without corrupting neighboring text',()=>{
 const code=formatMarkdown({value:'a\nb',start:0,end:3,format:'code'});assert.equal(code.value,'```\na\nb\n```');assert.equal(code.value.slice(code.start,code.end),'a\nb');
 const link=formatMarkdown({value:'example',start:0,end:7,format:'link'});assert.equal(link.value,'[example](https://example.com)');assert.equal(link.value.slice(link.start,link.end),'https://example.com');
 assert.equal(formatMarkdown({value:'one\ntwo\nthree',start:0,end:8,format:'ordered'}).value,'1. one\n2. two\nthree');
});
test('site release overview sorts V1.0 before V1.1 and V1.2 without changing timestamps or ordinary forum order',()=>{
 const topics=[{id:'v12',category:'site',releaseOrder:120,minutes:0},{id:'ordinary',category:'site',minutes:1},{id:'v10',category:'site',releaseOrder:100,minutes:3},{id:'v11',category:'site',releaseOrder:110,minutes:100}];
 assert.deepEqual(selectTopics(topics,{category:'site'}).items.map(x=>x.id),['v10','v11','v12','ordinary']);
 assert.deepEqual(selectTopics(topics).items.map(x=>x.id),['v12','ordinary','v10','v11']);
 assert.deepEqual(topics.map(x=>x.minutes),[0,1,3,100]);
});
import {createBodyEditor,languageSelect} from '../dist/m3-editor.js';
class TestNode{
 constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.value='';this.selectionStart=0;this.selectionEnd=0;this.parent=null;this.hidden=false;}
 append(...nodes){for(const n of nodes){const node=typeof n==='string'?{textContent:n}:n;node.parent=this;this.children.push(node);}}
 insertBefore(node,target){node.parent=this;this.children.splice(this.children.indexOf(target),0,node);}
 after(node){node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this)+1,0,node);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(name,value){this.attrs[name]=String(value);}
 querySelectorAll(name){return this.children.flatMap(n=>[...(n.tagName===name?[n]:[]),...(n.querySelectorAll?.(name)||[])]);}
 addEventListener(name,work,{signal}={}){(this.listeners[name]??=[]).push(event=>{if(!signal?.aborted)work(event);});}
 emit(name,event={}){for(const work of this.listeners[name]||[])work(event);}
 focus(){document.activeElement=this;}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
 get textContent(){return this.text??this.children.map(n=>n.textContent).join('');}
 set textContent(value){this.text=String(value);this.children=[];}
}
function withDOM(work){const old=globalThis.document;globalThis.document={createElement:tag=>new TestNode(tag),createTextNode:text=>({textContent:text})};try{return work();}finally{globalThis.document=old;}}
test('reply/edit editor respects IME, frozen request state, preview and keyboard submission without losing text',()=>withDOM(()=>{
 const host=new TestNode('section'),textarea=new TestNode('textarea');host.append(textarea);textarea.value='draft';textarea.selectionEnd=5;let sent=0,changes=0,frozen=false;
 const editor=createBodyEditor({host,textarea,t:key=>key,onSubmit:()=>sent++,onChange:()=>changes++,disabled:()=>frozen});
 const key={key:'Enter',ctrlKey:true,preventDefault(){this.prevented=true;}};
 textarea.emit('compositionstart');textarea.emit('keydown',key);assert.equal(sent,0);
 textarea.emit('compositionend');textarea.emit('keydown',{...key,isComposing:true});assert.equal(sent,0);
 textarea.emit('keydown',key);assert.equal(sent,1);assert.equal(textarea.value,'draft');
 frozen=true;editor.refresh();textarea.emit('keydown',key);assert.equal(sent,1);assert.equal(textarea.readOnly,true);assert(host.querySelectorAll('button').every(x=>x.disabled));
 frozen=false;editor.refresh();textarea.emit('keydown',{...key,key:'b'});assert.equal(textarea.value,'**draft**');assert.equal(changes,1);
 editor.setPreview(true);assert.equal(textarea.hidden,true);const preview=host.children.at(-1);assert.equal(preview.children[0].tagName,'p');assert.equal(preview.children[0].children[0].tagName,'strong');
 editor.destroy();assert.equal(textarea.hidden,false);assert.deepEqual(host.children,[textarea]);textarea.emit('keydown',key);assert.equal(sent,1);
}));
test('content language remains unspecified until explicitly selected; nonmanual stored language remains available',()=>withDOM(()=>{
 const input=languageSelect(key=>key);assert.equal(input.value,'und');assert.deepEqual(input.children.map(n=>n.value),['und','zh-CN','zh-TW','ja','en','ko']);
 const french=languageSelect(key=>key,'fr-FR');assert.equal(french.value,'fr-FR');assert.equal(french.children.at(-1).textContent,'fr-FR');
}));
import {createReplyMedia} from '../dist/m3-media.js';
const imageId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const imageMeta={id:imageId,url:'/api/topic-attachments/'+imageId,mime:'image/png',width:100,height:100,bytes:500,expiresAt:new Date(Date.now()+86400000).toISOString()};
async function mediaDOM(work){const old=globalThis.document;globalThis.document={createElement:tag=>new TestNode(tag)};TestNode.prototype.querySelector=function(){return null;};try{await work();}finally{globalThis.document=old;}}
test('reply images survive UI remount as volatile files and retain their idempotency key',()=>mediaDOM(async()=>{
 const file=new Blob(['unpublished image'],{type:'image/png'}),saved=[{file,status:'failed',uploadId:imageId,key:'draft-image'}],host=new TestNode('section');
 const first=createReplyMedia({host,t:key=>key,api:async()=>({}),getOwner:()=> 'owner',saved});const copy=first.getState();first.destroy();
 const next=createReplyMedia({host,t:key=>key,api:async()=>({}),getOwner:()=> 'owner',saved:copy});assert.equal(next.getState()[0].file,file);assert.equal(next.getState()[0].uploadId,imageId);assert.equal(next.isBusy(),true);assert.deepEqual(next.getIds(),[]);next.destroy();
}));
test('reply image retain rejects stale account completions and keeps failed IDs recoverable',()=>mediaDOM(async()=>{
 let resolve,owner='alice';const pending=new Promise(yes=>resolve=yes),host=new TestNode('section');
 const media=createReplyMedia({host,t:key=>key,api:()=>pending,getOwner:()=>owner,ids:[imageId]});
 owner='bob';resolve({attachments:[imageMeta]});await new Promise(done=>setImmediate(done));assert.equal(media.isBusy(),true);assert.equal(media.getState()[0].status,'checking');media.destroy();
 const bad=createReplyMedia({host,t:key=>key,api:async()=>({attachments:[]}),getOwner:()=>owner,ids:[imageId]});await new Promise(done=>setImmediate(done));assert.equal(bad.getState()[0].status,'failed');assert.equal(bad.isBusy(),true);assert.deepEqual(bad.getIds(),[imageId]);bad.destroy();
}));
