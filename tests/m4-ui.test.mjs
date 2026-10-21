import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunityInteractionsUI} from '../dist/m4-ui.js';

class Node{
 constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.attrs={};this.listeners={};this.hidden=false;this.open=false;this.className='';this.value='';this.isConnected=true;this.classList={add:key=>{if(!this.className.split(' ').includes(key))this.className+=' '+key;},remove:key=>{this.className=this.className.split(' ').filter(x=>x!==key).join(' ');},contains:key=>this.className.split(' ').includes(key)};}
 append(...nodes){for(const value of nodes){const node=typeof value==='string'?{textContent:value}:value;node.parent=this;this.children.push(node);}}
 before(...values){if(!this.parent)return;const index=this.parent.children.indexOf(this);for(const node of values)node.parent=this.parent;this.parent.children.splice(index,0,...values);}
 after(...values){if(!this.parent)return;const index=this.parent.children.indexOf(this);for(const node of values)node.parent=this.parent;this.parent.children.splice(index+1,0,...values);}
 querySelectorAll(selector){const match=node=>selector.startsWith('.')?node.className?.split(' ').includes(selector.slice(1)):node.tagName===selector;return this.children.flatMap(child=>[...(match(child)?[child]:[]),...(child.querySelectorAll?.(selector)||[])]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.isConnected=false;}
 setAttribute(name,value){this.attrs[name]=String(value);}
 addEventListener(name,work){(this.listeners[name]??=[]).push(work);}
 showModal(){this.open=true;}
 close(){this.open=false;for(const work of this.listeners.close||[])work();}
 focus(){document.activeElement=this;}
 get textContent(){return this.text||this.children.map(node=>node.textContent).join('');}
 set textContent(value){this.text=String(value);this.children=[];}
}
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};
const tick=()=>new Promise(done=>setImmediate(done));
function nodes(root){return [root,...root.children.flatMap(child=>nodes(child))];}
async function environment(work){
 const previous=new Map(['document','setInterval','clearInterval'].map(key=>[key,globalThis[key]])),body=new Node('body'),listeners=new Map(),timers=new Map();let counter=0;
 const draft={value:'Long reply must remain untouched'};
 globalThis.document={body,hidden:false,activeElement:null,documentElement:{lang:'en'},createElement:tag=>new Node(tag),createTextNode:value=>({textContent:value,children:[]}),getElementById:id=>id==='reply-text'?draft:null,addEventListener:(type,work)=>listeners.set(type,work),removeEventListener:(type,work)=>{assert.equal(listeners.get(type),work);listeners.delete(type);}};
 globalThis.setInterval=(fn,delay)=>{assert.equal(delay,60000);timers.set(++counter,fn);return counter;};globalThis.clearInterval=id=>timers.delete(id);
 try{await work({body,draft,listeners,timers});}finally{for(const [key,value]of previous)globalThis[key]=value;}
}
test('notification polling ignores previous-account identity and never touches reply drafts',()=>environment(async({draft,timers})=>{
 let user={id:'alice'};const alice=deferred(),bob=deferred(),changes=[],calls=[];
 const ui=createCommunityInteractionsUI({api:async(path)=>{calls.push(path);if(path==='/api/me/identity')return user.id==='alice'?alice.promise:bob.promise;return {unreadCount:3,notifications:[]};},t:key=>key,getUser:()=>user,onAuth(){},onOpenTopic(){},onChange:value=>changes.push(value)});
 const a=ui.refreshIdentity();user={id:'bob'};const b=ui.refreshIdentity();bob.resolve({identity:{id:'bob',name:'Bob',handle:'u_bob'}});await b;alice.resolve({identity:{id:'alice',name:'Alice',handle:'u_alice'}});await a;
 assert(changes.some(change=>change.identity?.id==='bob'));assert(!changes.some(change=>change.identity?.id==='alice'));assert.equal(changes.at(-1).unreadCount,3);assert.equal(draft.value,'Long reply must remain untouched');assert.equal(timers.size,1);ui.destroy();assert.equal(timers.size,0);
}));
test('leaving a route closes inbox and ignores a late private response',()=>environment(async({body,draft})=>{
 const pending=deferred(),requests=[];let user={id:'owner'};
 const ui=createCommunityInteractionsUI({api:(path,config)=>{requests.push({path,config});if(path==='/api/me/identity')return Promise.resolve({identity:{id:'owner',handle:'u_owner'}});return pending.promise;},t:key=>key,getUser:()=>user,onAuth(){},onOpenTopic(){}});
 const initial=ui.refreshIdentity();await tick();ui.openNotifications();const modal=body.children[0];assert.equal(modal.open,true);ui.leaveRoute();assert.equal(modal.open,false);assert.equal(body.children.length,0);assert(requests.filter(request=>request.path.startsWith('/api/me/notifications')).every(request=>request.config.signal.aborted));
 pending.resolve({notifications:[{id:'private-old',topicTitle:'Must not be displayed'}],unreadCount:9});await initial;await tick();assert.equal(body.children.length,0);assert.equal(draft.value,'Long reply must remain untouched');ui.destroy();
}));
test('notification mark-read sends only selected IDs and binds the signed-in account',()=>environment(async({body})=>{
 const calls=[],updates=[];const item={id:'notice-1',type:'mention',topicId:'topic-a',topicTitle:'Topic title',kind:'post',contentId:'post-a',actor:{name:'Other',handle:'u_other'},createdAt:'2026-10-22T00:00:00Z',readAt:null};
 const ui=createCommunityInteractionsUI({api:async(path,config)=>{calls.push({path,config});if(path==='/api/me/identity')return {identity:{id:'owner',handle:'u_owner'}};if(path==='/api/me/notifications/read')return {ok:true,unreadCount:0};return {notifications:[item],unreadCount:1,nextCursor:null};},t:key=>key,getUser:()=>({id:'owner'}),onAuth(){},onOpenTopic(){},onChange:value=>updates.push(value)});
 await ui.refreshIdentity();ui.openNotifications();await tick();const mark=nodes(body).find(node=>node.tagName==='button'&&node.textContent==='m4MarkRead');assert(mark);await mark.onclick();
 const write=calls.find(call=>call.path==='/api/me/notifications/read');assert.equal(write.config.method,'POST');assert.deepEqual(JSON.parse(write.config.body),{ids:['notice-1'],expectedUserId:'owner'});assert.equal(updates.at(-1).unreadCount,0);ui.destroy();
}));
test('anonymous personal lists request authentication without reading private APIs',()=>environment(async({body})=>{
 let requested=0,auth=0;const ui=createCommunityInteractionsUI({api:async()=>{requested++;},t:key=>key,getUser:()=>null,onAuth:()=>auth++,onOpenTopic(){}});await ui.refreshIdentity();ui.openNotifications();ui.openBookmarks();assert.equal(auth,2);assert.equal(requested,0);assert.equal(body.children.length,0);ui.destroy();
}));
test('opening an unread notification reflects read state and never marks it twice',()=>environment(async({body})=>{
 const item={id:'notice-1',type:'quote',topicId:'topic-a',topicTitle:'Topic title',kind:'post',contentId:'post-a',actor:{name:'Other'},createdAt:'2026-10-22T00:00:00Z',readAt:null};let reads=0;
 const ui=createCommunityInteractionsUI({api:async(path)=>{if(path==='/api/me/identity')return {identity:{id:'owner',handle:'u_owner'}};if(path==='/api/me/notifications/read'){reads++;return {unreadCount:0};}if(path.endsWith('/source'))return {content:{topicId:'topic-a',author:'Other',body:'Visible source',bodyFormat:'plain',createdAt:item.createdAt}};return {notifications:[item],unreadCount:1};},t:key=>key,getUser:()=>({id:'owner'}),onAuth(){},onOpenTopic(){}});
 await ui.refreshIdentity();ui.openNotifications();await tick();const row=nodes(body).find(node=>node.className==='m4-notification'),open=nodes(row).find(node=>node.className==='m4-notification-open');await open.onclick();await tick();assert(row.classList.contains('m4-read'));assert.equal(nodes(row).filter(node=>node.textContent==='m4MarkRead').length,0);await open.onclick();assert.equal(reads,1);ui.destroy();
}));
test('reaction response after account/route change cannot update the detached post or reply draft',()=>environment(async({body,draft})=>{
 const pending=deferred();let user={id:'owner'};const requests=[];
 const ui=createCommunityInteractionsUI({api:async(path,config)=>{requests.push({path,config});if(path==='/api/me/identity')return {identity:{id:'owner',handle:'u_owner'}};if(path.includes('notifications'))return {notifications:[],unreadCount:0};if(path.endsWith('/interaction'))return {interaction:{subscription:'normal',bookmark:false,answerPostId:null,canChooseAnswer:false,newReplies:0}};if(config?.method==='POST')return pending.promise;return {reactions:{counts:{like:1,thanks:0,helpful:0},mine:null}};},t:key=>key,getUser:()=>user,onAuth(){},onOpenTopic(){}});
 await ui.refreshIdentity();const root=new Node('section'),posts=new Node('div');posts.className='posts';const article=new Node('article');article.className='post';const content=new Node('div'),header=new Node('header');header.className='post-header';header.append(new Node('strong'));const text=new Node('div');text.className='post-body';const tools=new Node('div');tools.className='post-tools';content.append(header,text,tools);article.append(content);posts.append(article);root.append(posts);body.append(root);
 const cleanup=ui.attachTopic({root,topic:{id:'topic-a',userId:'other'},posts:[{userId:'other'}]});await tick();const like=nodes(root).find(node=>node.className==='m4-reaction');const counter=like.children[0];assert.equal(counter.textContent,'1');const change=like.onclick();assert.equal(like.disabled,true);const write=requests.find(request=>request.config?.method==='POST');assert.deepEqual(JSON.parse(write.config.body),{reaction:'like',expectedUserId:'owner'});
 cleanup();user={id:'different'};pending.resolve({reactions:{counts:{like:2,thanks:0,helpful:0},mine:'like'}});await change;assert.equal(counter.textContent,'1');assert.equal(draft.value,'Long reply must remain untouched');ui.destroy();
}));
test('a late best-answer response after leaving the topic cannot change list state',()=>environment(async({body})=>{
 const pending=deferred(),changes=[];const base={subscription:'normal',bookmark:false,answerPostId:null,canChooseAnswer:true,newReplies:0};
 const ui=createCommunityInteractionsUI({api:async(path,config)=>{if(path==='/api/me/identity')return {identity:{id:'owner',handle:'u_owner'}};if(path.includes('notifications'))return {notifications:[],unreadCount:0};if(path.endsWith('/interaction'))return {interaction:base};if(config?.method==='POST'){assert.deepEqual(JSON.parse(config.body),{postId:'reply-a',expectedUserId:'owner'});return pending.promise;}return {reactions:{counts:{like:0,thanks:0,helpful:0},mine:null}};},t:key=>key,getUser:()=>({id:'owner'}),onAuth(){},onOpenTopic(){},onChange:value=>changes.push(value)});
 await ui.refreshIdentity();const root=new Node('section'),posts=new Node('div');posts.className='posts';for(let i=0;i<2;i++){const article=new Node('article');article.className='post';const content=new Node('div'),header=new Node('header');header.className='post-header';header.append(new Node('strong'));const text=new Node('div');text.className='post-body';const tools=new Node('div');tools.className='post-tools';content.append(header,text,tools);article.append(content);posts.append(article);}root.append(posts);body.append(root);
 const cleanup=ui.attachTopic({root,topic:{id:'topic-a',userId:'owner'},posts:[{userId:'owner'},{id:'reply-a',userId:'other'}]});await tick();const choose=nodes(root).find(node=>node.className==='m4-answer-button');assert.equal(choose.hidden,false);const change=choose.onclick();cleanup();pending.resolve({interaction:{...base,answerPostId:'reply-a'}});await change;assert.equal(changes.filter(value=>value.topicId).length,0);ui.destroy();
}));
