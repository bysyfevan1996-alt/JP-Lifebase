import test from 'node:test';
import assert from 'node:assert/strict';
import {createComposerExtras} from '../dist/composer-extras.js';
import {readFile} from 'node:fs/promises';
const extrasSource=await readFile(new URL('../dist/composer-extras.js',import.meta.url),'utf8');
const directorySpecifier=extrasSource.match(/from '(\.\/community-directory\.js[^']*)'/)[1];
const {getDirectory,applyDirectory}=await import(new URL(directorySpecifier,new URL('../dist/composer-extras.js',import.meta.url)));

class Node {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.value='';this.hidden=false;this.disabled=false;this.listeners={};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this.attributes[key]=String(value);}
 addEventListener(key,work){this.listeners[key]=work;}
 focus(){document.activeElement=this;}
 querySelectorAll(selector){const out=[];const visit=node=>{for(const child of node.children){if(child instanceof Node){if(selector==='button'&&child.tagName==='button')out.push(child);visit(child);}}};visit(this);return out;}
}
const id1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const metadata=id=>({id,url:'/api/topic-attachments/'+id,mime:'image/png',width:100,height:100,bytes:500,expiresAt:new Date(Date.now()+86400000).toISOString()});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(work){
 const catalog=structuredClone(getDirectory());
 const original=globalThis.document;globalThis.document={activeElement:null,createElement:tag=>new Node(tag)};
 const nodes=Object.fromEntries(['tags','tags-menu','tag-search','tag-options','tag-chips','upload','image-input','images','images-region','sheet'].map(id=>[id,new Node()]));
 nodes['tags-menu'].hidden=true;const root=new Node();root.querySelector=selector=>{if(selector.startsWith('#write-'))return nodes[selector.slice(7)];const m=selector.match(/^\[data-extra-(tag|chip)="([a-z]+)"\]$/);if(m){const list=m[1]==='tag'?nodes['tag-options']:nodes['tag-chips'];return list.children.find(n=>n.dataset[m[1]==='tag'?'extraTag':'extraChip']===m[2])||null;}return null;};
 const context={owner:'alice',authenticated:true,frozen:false,conflict:false,identity:'draft-a',category:'daily'},calls=[],problems=[];let changes=0,states=0,auth=0;let api=async()=>({attachments:[],missingIds:[]});
 const extras=createComposerExtras({root,t:(key,args={})=>key+(args.name||''),getContext:()=>context,api:(...args)=>{calls.push(args);return api(...args);},onChange:()=>changes++,onState:()=>{states++;extras.refresh();},onAuth:()=>auth++,onProblem:key=>problems.push(key)});
 try{await work({extras,context,nodes,calls,problems,setApi:work=>api=work,get changes(){return changes;},get states(){return states;},get auth(){return auth;}});}finally{extras.reset();applyDirectory(catalog);globalThis.document=original;}
}

test('custom tag confirmation selects and persists a real tag, blocks publishing in flight, and respects IME',async()=>fixture(async f=>{
 f.extras.setDraft({},'draft-a');f.nodes['tag-search'].value='街头摄影';f.nodes['tag-search'].oninput();
 f.nodes['tag-search'].listeners.keydown({key:'Enter',isComposing:true,preventDefault(){throw Error('IME must remain untouched')}});assert.equal(f.calls.length,0);
 for(const modifier of ['ctrlKey','metaKey','altKey']){f.nodes['tag-search'].listeners.keydown({key:'Enter',[modifier]:true,preventDefault(){throw Error('Modified Enter belongs to existing shortcuts')}});assert.equal(f.calls.length,0);}
 const pending=deferred();f.setApi(()=>pending.promise);const create=f.nodes['tag-options'].children.find(row=>row.dataset?.createTag);
 const work=create.onclick();assert.equal(f.extras.hasBlockingWork(),true);assert.equal(f.calls[0][0],'/api/tags');assert.deepEqual(JSON.parse(f.calls[0][1].body),{name:'街头摄影',expectedUserId:'alice'});
 const tag={id:'tag-custom',name:'街头摄影',translations:{},active:true,position:200};const catalog=structuredClone(getDirectory());
 pending.resolve({...catalog,tags:[...catalog.tags,tag],tag,created:true});await work;
 assert.equal(f.extras.hasBlockingWork(),false);assert.deepEqual(f.extras.getDraft().tagIds,['tag-custom']);assert.equal(f.nodes['tag-search'].value,'');assert.equal(f.changes,1);
 f.nodes['tag-search'].value='街头摄影';f.nodes['tag-search'].listeners.keydown({key:'Enter',preventDefault(){}});assert.equal(f.calls.length,1);assert.deepEqual(f.extras.getDraft().tagIds,['tag-custom']);
}));

test('failed or stale tag creation cannot discard selected tags or alter a new account draft',async()=>fixture(async f=>{
 f.extras.setDraft({tagIds:['food']},'draft-a');f.nodes['tag-search'].value='新标签';f.nodes['tag-search'].oninput();
 f.setApi(async()=>{throw {status:500}});await f.nodes['tag-options'].children.find(row=>row.dataset?.createTag).onclick();
 assert.deepEqual(f.extras.getDraft().tagIds,['food']);assert.equal(f.nodes['tag-search'].value,'新标签');assert.equal(f.problems.at(-1),'composeTagCreateFailed');assert.equal(f.extras.hasBlockingWork(),false);
 const pending=deferred();f.setApi(()=>pending.promise);const work=f.nodes['tag-options'].children.find(row=>row.dataset?.createTag).onclick();
 f.context.owner='bob';f.context.identity='draft-b';f.extras.setDraft({tagIds:['family']},'draft-b');
 pending.reject({status:401});await work;assert.deepEqual(f.extras.getDraft().tagIds,['family']);assert.equal(f.auth,0);assert.equal(f.extras.hasBlockingWork(),false);
}));

test('refresh is silent and maintained tag choices enforce the limit without losing the active search',async()=>fixture(async f=>{
 f.extras.setDraft({tagIds:['food','family','community','travel','shopping']},'draft-a');f.extras.refresh();assert.equal(f.changes,0);assert.equal(f.states,0);
 const button=id=>f.nodes['tag-options'].children.find(n=>n.dataset.extraTag===id);
 assert.equal(button('transport').disabled,true);assert.equal(button('travel').disabled,false);
 button('travel').onclick();assert.equal(f.changes,1);assert.equal(button('transport').disabled,false);button('transport').onclick();assert.equal(f.extras.getDraft().tagIds.length,5);
 f.nodes['tag-search'].value='no_such_tag';f.nodes['tag-search'].focus();f.nodes['tag-search'].oninput();assert.equal(f.nodes['tag-options'].children[0].textContent,'composeTagNone');assert.equal(document.activeElement,f.nodes['tag-search']);
}));

test('missing restored images retain their identifiers and block publishing until explicitly removed',async()=>fixture(async f=>{
 f.setApi(async()=>({attachments:[metadata(id2)],missingIds:[id1]}));f.extras.setDraft({attachmentIds:[id1,id2]},'draft-a');await settle();
 assert.deepEqual(f.extras.getDraft().attachmentIds,[id1,id2]);assert.equal(f.extras.hasBlockingWork(),true);assert.equal(f.nodes.images.children[0].dataset.imageStatus,'missing');assert.equal(f.nodes.images.children[1].dataset.imageStatus,'ready');assert.equal(f.changes,0);
}));

test('a stale account retain success or 401 cannot modify the new account or start its login flow',async()=>fixture(async f=>{
 for(const reject of [false,true]){
  const pending=deferred();f.setApi(()=>pending.promise);f.context.identity='draft-a';f.context.owner='alice';f.extras.setDraft({attachmentIds:[id1]},'draft-a');await settle();
  f.context.owner='bob';f.context.identity='draft-b';f.extras.setDraft({tagIds:['food']},'draft-b');
  reject?pending.reject({status:401}):pending.resolve({attachments:[metadata(id1)],missingIds:[]});await settle();
  assert.equal(f.auth,0);assert.deepEqual(f.extras.getDraft(),{tagIds:['food'],attachmentIds:[]});assert.equal(f.extras.hasBlockingWork(),false);
 }
}));

test('release works while frozen and stale deletion completion cannot reset a different account draft',async()=>fixture(async f=>{
 f.setApi(async()=>({attachments:[metadata(id1),metadata(id2)],missingIds:[]}));f.extras.setDraft({attachmentIds:[id2,id1]},'draft-a');await settle();assert.deepEqual(f.extras.getDraft().attachmentIds,[id2,id1]);
 f.context.frozen=true;const pending=deferred();let deletes=0;f.setApi((url,options)=>{assert.equal(options.method,'DELETE');deletes++;return pending.promise;});
 const release=f.extras.release();assert.equal(deletes,1);f.context.owner='bob';f.context.identity='draft-b';f.context.frozen=false;f.extras.setDraft({tagIds:['family']},'draft-b');pending.resolve({ok:true});await release;
 assert.equal(deletes,1);assert.deepEqual(f.extras.getDraft(),{tagIds:['family'],attachmentIds:[]});
}));
