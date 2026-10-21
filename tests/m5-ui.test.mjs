import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createM5UI,searchURL} from '../dist/m5-ui.js';
import {directoryLabel,applyDirectory,getDirectory} from '../dist/community-directory.js';
import {createDraftStore} from '../dist/compose-drafts.js';

// Exercise the same mutable catalog instance as the browser modules, including
// their generated cache version rather than an unversioned duplicate import.
const directoryURL=new URL('../dist/community-directory.js',import.meta.url);
const directorySource=await readFile(directoryURL,'utf8');
const catalogSpecifier=directorySource.match(/from ['"](.\/topic-tags\.js(?:\?v=[^'"]+)?)['"]/)[1];
const {normalizeTopicTags}=await import(new URL(catalogSpecifier,directoryURL));
const draftSource=await readFile(new URL('../dist/compose-drafts.js',import.meta.url),'utf8');
assert.equal(draftSource.match(/from ['"](.\/topic-tags\.js(?:\?v=[^'"]+)?)['"]/)[1],catalogSpecifier,'drafts and catalog must share the same versioned tag module');

class Node{
 constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.attrs={};this.events={};this.className='';this.hidden=false;this.disabled=false;this.open=false;this.isConnected=true;this.value='';this.checked=false;this.text='';}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 replaceChildren(...nodes){this.children=[];this.text='';this.append(...nodes);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.isConnected=false;}
 get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}set textContent(v){this.text=String(v);this.children=[];}
 get childElementCount(){return this.children.length;}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}
 addEventListener(k,v){(this.events[k]??=[]).push(v);}
 emit(k){for(const fn of this.events[k]||[])fn({preventDefault(){}});}
 querySelectorAll(selector){return this.children.flatMap(n=>[...(selector.split(',').some(s=>s.startsWith('.')?n.className.split(' ').includes(s.slice(1)):n.tagName===s)?[n]:[]),...n.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 showModal(){this.open=true;}close(){this.open=false;this.emit('close');}
}
const walk=n=>[n,...n.children.flatMap(walk)];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
async function fixture(work){const previous=Object.fromEntries(['document','location'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));const host=new Node('main'),body=new Node('body');let owner={id:'alice'},call=async()=>({results:[],nextCursor:null});const requests=[],paths=[];globalThis.document={createElement:tag=>new Node(tag),body,documentElement:{lang:'en'}};body.classList={add(){},remove(){}};globalThis.location={pathname:'/search',search:'?q=電気'};
 const ui=createM5UI({host,api:(path,options)=>{requests.push({path,options});return call(path,options);},t:(key,values={})=>key+(values.count??''),getUser:()=>owner,getLanguage:()=> 'en',navigate:path=>paths.push(path),openTopic:id=>paths.push('/t/'+id),toast(){}});
 try{await work({ui,host,body,requests,paths,setApi:fn=>call=fn,setOwner:value=>owner=value});}finally{ui.leave();for(const [key,value]of Object.entries(previous))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}
test('search paths whitelist parameters and dynamic labels preserve literal text',()=>{
 assert.equal(searchURL({q:' 東京 ',sort:'latest',category:'all',cursor:'ignored'}),'/search?q=%E6%9D%B1%E4%BA%AC&sort=latest');
 assert.equal(directoryLabel({id:'x',name:'fallback',translations:{ja:'  名前  '}},'ja'),'  名前  ');
 assert.equal(directoryLabel({id:'x',name:'fallback',translations:{ja:' '}},'ja'),'fallback');
 for(const value of [null,undefined,7,[],{}, {id:{}}])assert.equal(directoryLabel(value),'');
});
test('search reads server corpus, retains reply matches, and cannot render a stale route completion',async()=>fixture(async f=>{
 const pending=deferred();f.setApi(()=>pending.promise);f.ui.renderSearch();assert.match(f.requests[0].path,/^\/api\/search\?q=/);f.ui.leave();pending.resolve({results:[{kind:'topic',id:'old',topicId:'old',title:'old',createdAt:'2026-01-01'}]});await settle();assert.equal(f.host.textContent,'');
 f.setApi(async()=>({results:[{kind:'post',id:'post-400',topicId:'long',title:'reply full corpus',excerpt:'body hit only',author:{name:'Member',handle:'u_member'},createdAt:'2026-01-01'}],nextCursor:'stable'}));f.ui.renderSearch();await settle();assert.match(f.host.textContent,/reply full corpus/);assert.match(f.host.textContent,/body hit only/);assert.match(f.host.textContent,/m5Loaded1/);const more=walk(f.host).find(n=>n.className==='m5-button m5-more');assert.ok(more);more.onclick();await settle();assert.match(f.requests.at(-1).path,/cursor=stable/);
}));
test('profile settings keep unsaved fields across remount and discard late data from another account',async()=>fixture(async f=>{
 location.pathname='/account';location.search='';const card=new Node('section');card.className='auth-card';f.host.append(card);const initial=deferred();f.setApi(()=>initial.promise);f.ui.mountSettings(f.host);f.setOwner({id:'bob'});f.ui.setUser();initial.resolve({profile:{bio:'private alice',location:'',website:'',publicEnabled:false,showActivity:false}});await settle();assert.doesNotMatch(f.host.textContent,/private alice/);
 f.setApi(async()=>({profile:{bio:'original',location:'',website:'',publicEnabled:false,showActivity:false}}));f.ui.mountSettings(f.host);await settle();let textarea=walk(f.host).find(n=>n.tagName==='textarea');textarea.value='unsaved long bio';textarea.emit('input');const before=f.requests.length;f.ui.mountSettings(f.host);textarea=walk(f.host).find(n=>n.tagName==='textarea');assert.equal(textarea.value,'unsaved long bio');assert.equal(f.requests.length,before);
 const save=deferred();f.setApi(()=>save.promise);const form=walk(f.host).find(n=>n.tagName==='form');form.onsubmit({preventDefault(){}});assert.equal(textarea.disabled,true);f.ui.mountSettings(f.host);assert.equal(walk(f.host).find(n=>n.tagName==='textarea').disabled,true);save.resolve({profile:{bio:'unsaved long bio',location:'',website:'',publicEnabled:false,showActivity:false}});await settle();assert.equal(walk(f.host).find(n=>n.tagName==='textarea').disabled,false);assert.equal(walk(f.host).find(n=>n.tagName==='textarea').value,'unsaved long bio');
}));
test('public profile response after leaving cannot expose its body on another route',async()=>fixture(async f=>{
 const pending=deferred();f.setApi(()=>pending.promise);const loading=f.ui.renderProfile('u_member');f.ui.leave();pending.resolve({profile:{name:'Member',handle:'u_member',bio:'late private-ish view',joinedAt:'2026-01-01'},activity:[]});await loading;assert.equal(f.host.textContent,'');
}));
test('dynamic inactive directory IDs survive browser drafts and normalize only with explicit historical mode',()=>{
 const catalog=structuredClone(getDirectory());try{applyDirectory({categories:[{id:'site',name:'公告',active:true},{id:'new-category',name:'新分类',active:false}],tags:[{id:'custom-tag',name:'新标签',active:false}]});assert.deepEqual(normalizeTopicTags(['custom-tag']),['custom-tag']);assert.deepEqual(normalizeTopicTags(['older-tag'],{allowUnknown:true}),['older-tag']);assert.throws(()=>normalizeTopicTags(['older-tag']));
 const storage=new Map(),store=createDraftStore({storage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},writerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now:()=>100});const draft={title:'Long draft',body:'Unsaved text',category:'new-category',language:'und',clientRequestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',tagIds:['older-tag']};const saved=store.write('alice',draft,null);assert.equal(saved.status,'ok');const restored=store.read('alice');assert.equal(restored.status,'ok');assert.deepEqual(restored.record.draft.tagIds,['older-tag']);assert.equal(restored.record.draft.category,'new-category');
 }finally{applyDirectory(catalog);}
});
