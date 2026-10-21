import test from 'node:test';
import assert from 'node:assert/strict';
import {createM5Admin} from '../dist/m5-admin.js';
import {m5Dictionaries} from '../dist/m5-i18n.js';
class Node{
 constructor(tag){this.tagName=tag;this.children=[];this.className='';this.attrs={};this.disabled=false;this.value='';this.text='';}
 append(...n){this.children.push(...n);}replaceChildren(...n){this.text='';this.children=n;}
 setAttribute(k,v){this.attrs[k]=v;}get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}set textContent(v){this.text=String(v);this.children=[];}
 querySelectorAll(selector){return this.children.flatMap(n=>[...(selector.split(',').includes(n.tagName)?[n]:[]),...n.querySelectorAll(selector)]);}
}
const nodes=root=>[root,...root.children.flatMap(nodes)];
const tick=()=>new Promise(done=>setImmediate(done));
test('insights use maintained local definitions, show UTC range and reject late administrator data',async()=>{
 const prior=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};let owner={id:'admin'},resolve;const host=new Node('main'),data={range:{from:'2026-01-01T00:00:00Z',to:'2026-01-31T00:00:00Z'},metrics:{newMembers:3,topics:4,replies:5,activeAuthors:2,solvedTopics:1,reactions:8,openReports:7},definitions:{topics:'DO NOT SHOW API ENGLISH'}};const t=(key,args)=>m5Dictionaries['zh-CN'][key]?.replace('{count}',args?.count)||key;let request=async()=>data;
 const ui=createM5Admin({request:(...args)=>request(...args),t,getUser:()=>owner,getLanguage:()=> 'zh-CN',onError(){}});
 try{await ui.insights(host);assert.match(host.textContent,/统计区间（UTC）/);assert.match(host.textContent,/不是访客数或浏览量/);assert.doesNotMatch(host.textContent,/DO NOT SHOW/);request=()=>new Promise(done=>resolve=done);const pending=ui.insights(host);owner=null;ui.leave();host.replaceChildren();resolve(data);await pending;assert.equal(host.textContent,'');}finally{ui.leave();globalThis.document=prior;}
});
test('directory editor keeps stable ids readonly and posts account-bound explicit catalog values',async()=>{
 const prior=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};const host=new Node('main'),requests=[],catalog={categories:[{id:'daily',name:'杂谈',translations:{en:'Chat'},color:'#abcdef',position:3,active:true}],tags:[]};const ui=createM5Admin({request:async(path,options)=>{requests.push({path,options});return catalog;},t:key=>key,getUser:()=>({id:'admin'}),getLanguage:()=> 'zh-CN',onError(){}});
 try{await ui.directory(host);const row=nodes(host).find(n=>n.className==='m5-directory-row');row.onclick();const form=nodes(host).find(n=>n.tagName==='form'),inputs=form.querySelectorAll('input');assert.equal(inputs[0].readOnly,true);assert.equal(inputs[0].value,'daily');inputs[1].value='生活杂谈';await form.onsubmit({preventDefault(){}});await tick();const request=requests.find(row=>row.options?.method==='POST');assert.equal(request.path,'/api/admin/directory/categories');const payload=JSON.parse(request.options.body);assert.equal(payload.expectedUserId,'admin');assert.equal(payload.id,'daily');assert.equal(payload.name,'生活杂谈');assert.equal(payload.active,true);const save=nodes(host).find(n=>n.tagName==='button'&&n.type==='submit');assert.equal(save.disabled,false);}finally{ui.leave();globalThis.document=prior;}
});
