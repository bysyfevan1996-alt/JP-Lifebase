import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthUI,safeReturn} from '../dist/auth-ui.js';

test('admin return is an exact local path and does not allow external redirects',()=>{
 assert.equal(safeReturn('/admin'),'/admin');
 for(const target of ['//example.com/admin','https://example.com/admin','/admin?next=https://example.com','/admin/../other'])assert.equal(safeReturn(target),'/');
});

test('tag-list login returns accept only an exact maintained local tag URL',()=>{
 for(const id of ['travel','electricity','residence'])assert.equal(safeReturn('/?tag='+id),'/?tag='+id);
 for(const target of ['/?tag=unknown','/?tag=travel&next=https://example.test','//example.test/?tag=travel','https://example.test/?tag=travel','/?tag=%74ravel','/?tag=Travel','/?tag=travel#anything'])assert.equal(safeReturn(target),'/');
});

// A small form surface lets this test exercise the actual async controller,
// including forced submission after navigation, without a browser dependency.
class Surface {
 constructor(){this.nodes=[];this.attributes={};}
 set innerHTML(html){
  this.html=html;this.nodes=[];
  for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)){
   const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(m=>[m[1],m[2]??'']));
   const node={tag:match[1],attrs,id:attrs.id,type:attrs.type||'text',dataset:{},disabled:Object.hasOwn(attrs,'disabled'),hidden:false,textContent:attrs['data-primary']?'send':'',values:{},value:'',isConnected:true,
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},getAttribute(k){return this.attrs[k];},focus(){},addEventListener(){}};
   for(const [key,value] of Object.entries(attrs))if(key.startsWith('data-'))node.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
   this.nodes.push(node);
  }
 }
 setAttribute(key,value){this.attributes[key]=value;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){return this.nodes.filter(n=>selector.split(',').some(s=>s.startsWith('#')?n.attrs.id===s.slice(1):s.startsWith('[')?Object.hasOwn(n.attrs,s.slice(1,-1)):n.tag===s));}
 replaceChildren(){this.innerHTML='';}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('language repaint preserves login inputs and route without refreshing the page',async()=>{
 const saved=Object.fromEntries(['document','location','requestAnimationFrame'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const host=new Surface();let ui,language='en';
 try{
  globalThis.location={pathname:'/account/login',search:'?return=%2Fadmin'};globalThis.document={title:'',activeElement:null};globalThis.requestAnimationFrame=fn=>fn();
  ui=createAuthUI({host,api:async()=>({flow:null}),t:key=>language+':'+key,getUser:()=>null,onUser(){},avatar:()=>'',navigate(){throw Error('unexpected navigation');},onContinue(){},onLogout(){},getLanguage:()=>language});
  await ui.render();host.querySelector('#auth-email').value='person@example.test';host.querySelector('#auth-password').value='retained-password';language='zh-CN';await ui.refreshLanguage();
  assert.equal(host.querySelector('#auth-email').value,'person@example.test');assert.equal(host.querySelector('#auth-password').value,'retained-password');assert(host.html.includes('zh-CN:loginTitle'));assert.equal(location.search,'?return=%2Fadmin');
 }finally{ui?.leave();for(const [key,descriptor]of Object.entries(saved))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});

test('authentication write lock survives route changes and leave; later forms unlock after completion',async()=>{
 const saved=Object.fromEntries(['document','location','FormData','requestAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const host=new Surface(),requests=[];let activeFlow=null,resolveSend,ui;
 const point=path=>{const url=new URL(path,'http://localhost');globalThis.location={pathname:url.pathname,search:url.search};};
 const api=async(route,options)=>{
  if(!options)return {flow:activeFlow};
  requests.push(route);
  if(route==='/api/auth/register/start')return new Promise(resolve=>{resolveSend=value=>{activeFlow=value;resolve(value);};});
  activeFlow={purpose:'reset',step:'code',email:'b***@example.test',expiresAt:Date.now()+600000,resendAt:Date.now()+180000};
  return activeFlow;
 };
 try{
  globalThis.document={title:''};point('/account/register');
  globalThis.FormData=class {constructor(form){this.values=form.values;}get(key){return this.values[key];}*[Symbol.iterator](){yield*Object.entries(this.values);}};
  globalThis.requestAnimationFrame=fn=>fn();
  ui=createAuthUI({host,api,t:(key,values)=>key+(values?.email||''),getUser:()=>null,onUser(){},avatar:()=>'',navigate:path=>{point(path);void ui.render();},onContinue(){},onLogout(){},getLanguage:()=>'en'});
  await ui.render();
  let form=host.querySelector('#auth-form');form.values={email:'a@example.test'};form.onsubmit({preventDefault(){},currentTarget:form});
  assert.deepEqual(requests,['/api/auth/register/start']);
  point('/account/login');await ui.render();assert(host.querySelector('[data-primary]').disabled);
  ui.leave();point('/account/forgot-password');await ui.render();
  assert(host.querySelector('[data-primary]').disabled);
  form=host.querySelector('#auth-form');form.values={email:'b@example.test'};form.onsubmit({preventDefault(){},currentTarget:form});
  assert.deepEqual(requests,['/api/auth/register/start']);
  resolveSend({purpose:'register',step:'code',email:'a***@example.test',expiresAt:Date.now()+600000,resendAt:Date.now()+180000});
  await settle();await settle();
  assert.equal(location.pathname,'/account/forgot-password');
  assert.equal(host.querySelector('[data-primary]').disabled,false);
  form=host.querySelector('#auth-form');form.values={email:'b@example.test'};form.onsubmit({preventDefault(){},currentTarget:form});
  await settle();await settle();
  assert.deepEqual(requests,['/api/auth/register/start','/api/auth/password/start']);
  assert.equal(location.pathname,'/account/verify');
  assert(host.html.includes('b***@example.test'));
 }finally{
  ui?.leave();
  for(const [key,descriptor] of Object.entries(saved))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 }
});
