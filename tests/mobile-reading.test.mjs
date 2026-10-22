import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileReading} from '../dist/mobile-reading.js';

import {Element} from './helpers/mobile-dom.mjs';

function environment(work){
 const keys=['document','window','matchMedia','MutationObserver','requestAnimationFrame','cancelAnimationFrame'],old=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const body=new Element('body'),root=new Element('main'),nav=new Element('nav'),controls=new Element('section'),bookmark=new Element('button'),heading=new Element('h1');
 controls.className='m4-topic-controls';bookmark.setAttribute('data-topic-bookmark','');bookmark.setAttribute('aria-pressed','false');bookmark.disabled=true;controls.append(bookmark);nav.append(controls);heading.className='detail-heading';root.append(heading,nav);body.append(root);
 const phone=new EventTarget();phone.matches=true;const window=new EventTarget(),queue=new Map();let seq=0,observer;
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),createComment:()=>new Element('comment')};globalThis.window=window;globalThis.matchMedia=()=>phone;
 globalThis.MutationObserver=class{constructor(callback){observer=this;this.callback=callback;}observe(){}disconnect(){this.disconnected=true;}};
 globalThis.requestAnimationFrame=callback=>{queue.set(++seq,callback);return seq;};globalThis.cancelAnimationFrame=id=>queue.delete(id);
 let back=0,search=0,menu=0,writes=0;bookmark.onclick=()=>{writes++;bookmark.setAttribute('aria-pressed',String(bookmark.getAttribute('aria-pressed')!=='true'));};
 const ui=createMobileReading({root,topic:{title:'A long real topic'},t:key=>key,onBack:()=>back++,onSearch:()=>{search++;document.activeElement='search';},onMenu:()=>menu++});
 const bar=body.querySelector('.mobile-reading-bar'),sheet=body.querySelector('.mobile-reading-sheet');
 const state={root,nav,controls,bookmark,heading,bar,sheet,body,phone,ui,observer,counts:()=>({back,search,menu,writes}),flush:()=>{for(const callback of queue.values())callback();queue.clear();},resize(value){phone.matches=value;phone.dispatchEvent(new Event('change'));},scroll(){window.dispatchEvent(new Event('scroll'));}};
 try{work(state);}finally{ui.destroy();for(const [key,descriptor]of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('phone toolbar proxies the real bookmark, preserves controls and exposes errors with retry',()=>environment(({bar,sheet,controls,bookmark,observer,counts})=>{
 assert.equal(sheet.querySelector('.m4-topic-controls'),controls);const save=bar.children[2],more=bar.children[3];
 assert.equal(save.disabled,true);save.click();assert.equal(counts().writes,0);
 bookmark.disabled=false;observer.callback();save.click();observer.callback();assert.equal(counts().writes,1);assert.equal(save.getAttribute('aria-pressed'),'true');
 more.click();assert.equal(sheet.open,true);assert.equal(more.getAttribute('aria-expanded'),'true');sheet.close();assert.equal(document.activeElement,more);
 const error=new Element('div');error.className='m4-topic-error';controls.append(error);observer.callback();assert.equal(sheet.open,true);assert.equal(sheet.querySelector('.m4-topic-error'),error);
}));

test('phone/desktop transitions restore the same controls and update compact topic title',()=>environment(({root,nav,controls,heading,bar,sheet,resize,scroll,flush})=>{
 controls.draft={body:'Retained',quotes:[{id:'quote'}]};heading.bottom=40;scroll();flush();assert.equal(bar.children[1].textContent,'A long real topic');
 bar.children[3].click();resize(false);assert.equal(sheet.open,false);assert.equal(bar.hidden,true);assert.equal(root.dataset.mobileReading,'false');assert.equal(nav.children[0],controls);assert.equal(nav.children.length,1);
 resize(true);assert.equal(sheet.querySelector('.m4-topic-controls'),controls);assert.deepEqual(controls.draft,{body:'Retained',quotes:[{id:'quote'}]});heading.bottom=180;scroll();flush();assert.equal(bar.children[1].textContent,'Japan Life Base');
}));

test('search gets focus after closing options; route disposal closes sheet and detaches all listeners',()=>environment(({root,nav,controls,bar,sheet,ui,observer,body,counts,resize,scroll,flush})=>{
 bar.children[0].click();assert.equal(counts().back,1);bar.children[3].click();sheet.querySelector('.mobile-reading-links').children[0].click();assert.equal(counts().search,1);assert.equal(document.activeElement,'search');
 bar.children[3].click();ui.destroy();assert.equal(sheet.open,false);assert.equal(nav.children[0],controls);assert.equal(root.dataset.mobileReading,undefined);assert.equal(body.querySelector('.mobile-reading-bar'),null);assert.equal(body.classList.contains('mobile-reading-options-open'),false);assert.equal(observer.disconnected,true);
 resize(true);scroll();flush();observer.callback();assert.equal(body.querySelector('.mobile-reading-sheet'),null);assert.equal(nav.children[0],controls);
}));
