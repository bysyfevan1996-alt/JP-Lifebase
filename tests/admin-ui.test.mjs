import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {dictionaries} from '../dist/admin-i18n.js';
import {m5Dictionaries} from '../dist/m5-i18n.js';
import {createM5Admin} from '../dist/m5-admin.js';

class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.hidden=false;this.disabled=false;this.textContent='';this.classList={toggle(){},add(){},remove(){}};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 get childElementCount(){return this.children.length;}
 setAttribute(key,value){this.attributes[key]=value;}
 removeAttribute(key){delete this.attributes[key];}
 addEventListener(name,fn){this.listeners[name]=fn;}
 get options(){return this.children.filter(item=>item.tagName==='option');}
 querySelector(){return null;}
 querySelectorAll(){return [];}
}
const descendants=node=>[node,...node.children.flatMap(descendants)];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const source=(await readFile(new URL('../dist/admin.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/\ninitialize\(\);\s*$/,"\nglobalThis.controller={state,renderUsers,renderInbox,renderAudit,writeChange,changeView,loadView};");
function fixture(){
 const selectors=['#admin-language','#view-status','#admin-content','#admin-layout','#admin-gate','#translation-notice','#view-heading','#admin-identity','.admin-sidebar nav'];
 const nodes=new Map(selectors.map(selector=>[selector,new Element()])),requests=[];
 const context={dictionaries,m5Dictionaries,createM5Admin,createLanguagePreferences:()=>({preference:'zh-CN',explicit:false,setUser:async()=>{},choose(){}}),readLanguagePreference:()=> 'zh-CN',ensureLanguageOption(){},resolveLocale:()=>({language:'zh-CN',source:'zh-CN',automatic:false}),Intl,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Node:Element,location:{hash:''},history:{replaceState(){}},navigator:{languages:[]},window:{confirm:()=>true,addEventListener(){}},document:{createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('fragment'),querySelector:selector=>nodes.get(selector),querySelectorAll:()=>[],documentElement:{lang:'zh-CN'}},fetch:async(path,options)=>{requests.push({path,options});return {ok:true,status:200,json:async()=>path.includes('/api/admin/users')&&options?.method!=='POST'?{users:[]}:{}};}};
 runInNewContext(source,context);const ui=context.controller;ui.state.user={id:'operator',role:'admin',name:'Operator'};ui.state.dictionary=dictionaries['zh-CN'];return{ui,nodes,requests,context};
}
test('user restrictions protect administrators and self, require confirmation, and send only the chosen flag',async()=>{
 const app=fixture();app.ui.state.view='users';
 const fragment=app.ui.renderUsers({users:[{id:'operator',role:'admin',name:'Operator'},{id:'other-admin',role:'admin',name:'Other'},{id:'member',role:'member',name:'<script>',banned:false,muted:true}]});
 const actions=descendants(fragment).filter(node=>node.tagName==='button'&&['封禁','解除禁言'].includes(node.textContent));assert.equal(actions.length,2);
 app.context.window.confirm=()=>false;actions[0].listeners.click();await tick();assert.equal(app.requests.length,0);
 app.context.window.confirm=()=>true;actions[0].listeners.click();await tick();
 assert.equal(app.requests[0].path,'/api/admin/users/member');assert.deepEqual(JSON.parse(app.requests[0].options.body),{banned:true});assert.equal(app.requests[0].options.method,'POST');
 assert(descendants(fragment).some(node=>node.textContent==='<script>'));assert(!('innerHTML' in fragment));
});
test('report status editor saves the selected status, and audit pagination retains action filtering',async()=>{
 const app=fixture();app.ui.state.view='reports';const fragment=app.ui.renderInbox({reports:[{id:'report-1',topic_id:'topic-1',user_id:'member',reason:'Reason',created_at:'2026-10-21',status:'open'}]});
 const select=descendants(fragment).find(node=>node.tagName==='select');assert.deepEqual(select.options.map(option=>option.value),['open','reviewing','resolved','dismissed']);select.value='resolved';
 descendants(fragment).find(node=>node.tagName==='button'&&node.textContent==='保存').listeners.click();await tick();assert.deepEqual(JSON.parse(app.requests[0].options.body),{status:'resolved'});
 app.ui.state.view='audit';app.ui.state.auditAction='review_report';const audit=app.ui.renderAudit({actions:[{id:'action-1',action:'review_report',userId:'operator',details:{status:'resolved'},createdAt:'2026-10-21'}],nextCursor:'opaque-cursor'});
 descendants(audit).find(node=>node.tagName==='button'&&node.textContent==='更早记录').listeners.click();await tick();assert.equal(app.requests.at(-1).path,'/api/admin/audit?before=opaque-cursor&action=review_report');
});
test('protected-account failures stay recoverable without clearing the administrator session',async()=>{
 const app=fixture();app.context.fetch=async()=>({ok:false,status:403,json:async()=>({code:'protected_admin'})});
 await app.ui.writeChange('/api/admin/users/other-admin',{banned:true});assert.equal(app.ui.state.user.id,'operator');assert.equal(app.ui.state.writeBusy,false);assert.equal(app.nodes.get('#view-status').hidden,false);
});
