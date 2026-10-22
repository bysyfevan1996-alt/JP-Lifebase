import test from 'node:test';
import assert from 'node:assert/strict';
import {createInterfaceShell} from '../dist/interface-shell.js';
import {Element} from './helpers/mobile-dom.mjs';

test('phone navigation keeps one language picker, preserves its value and clears private badges',()=>{
 const names=['document','location','matchMedia'],old=new Map(names.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const body=new Element('body'),header=new Element('div'),sidebar=new Element('div'),language=new Element('label');header.className='header-right';sidebar.className='sidebar-inner';language.className='language-control';language.value='ja';header.append(language);body.append(header,sidebar);
 for(const id of ['my-topics','my-messages','my-bookmarks']){const button=new Element('button');button.setAttribute('id',id);sidebar.append(button);}
 const phone=new EventTarget();phone.matches=true;let user={id:'alice'},composed=0;const paths=[];
 globalThis.document={body,createElement:tag=>new Element(tag),createComment:()=>new Element('comment'),querySelector:selector=>body.querySelector(selector),getElementById:id=>body.querySelector('#'+id)};globalThis.location={pathname:'/account',hash:''};globalThis.matchMedia=()=>phone;
 let shell;
 try{
  shell=createInterfaceShell({t:key=>key,icon:()=>'',navigate:path=>paths.push(path),newTopic:()=>composed++,getUser:()=>user});
  assert.equal(body.querySelector('.sidebar-language').children[0],language);assert.equal(language.value,'ja');
  const nav=body.querySelector('.mobile-main-navigation');assert.equal(nav.children[3].getAttribute('aria-current'),'page');nav.children[2].click();assert.deepEqual(paths,['/notifications']);
  shell.refresh({unreadCount:5});assert.equal(nav.children[2].children.at(-1).textContent,'5');user=null;shell.refresh({});assert.equal(nav.children[2].children.length,1,'private unread badge disappears for an anonymous session');
  phone.matches=false;phone.dispatchEvent(new Event('change'));assert.equal(language.parentNode,header);assert.equal(language.value,'ja');
  location.pathname='/t/topic';shell.refresh();assert.equal(nav.hidden,true);shell.destroy();shell=null;assert.equal(body.querySelector('.mobile-main-navigation'),null);assert.equal(language.parentNode,header);
 }finally{shell?.destroy();for(const [key,descriptor]of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
