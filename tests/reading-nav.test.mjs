import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadingNavigation} from '../dist/reading-nav.js';
export function createNavigationDOMHarness(createReadingNavigation, {
 width=1440, viewport=900, scroll=700, repliesTop=2400,
 repliesBottom=3200, editorTop=3300, docHeight=4200, bookmark=null,portaled=false,onWrite,
}={}) {
 const globalNames=['window','document','getComputedStyle','matchMedia','requestAnimationFrame','cancelAnimationFrame'];
 const previous=new Map(globalNames.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const queue=new Map();let frameId=0,saved=bookmark;
 const classList=(initial=[])=>{
  const values=new Set(initial);
  return {contains:key=>values.has(key),remove:key=>values.delete(key),toggle(key,force){
   const enabled=force===undefined?!values.has(key):!!force;
   if(enabled)values.add(key);else values.delete(key);return enabled;
  }};
 };
 const events=()=>{
  const listeners=new Map();
  return {addEventListener(type,callback,options={}){
   const item={callback,signal:options.signal};
   if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(item);
  },emit(type,event={}){for(const item of listeners.get(type)||[])if(!item.signal?.aborted)item.callback(event);}};
 };
 const bodyClasses=classList();
 const windowStub={...events(),scrollY:scroll,innerHeight:viewport,visualViewport:null,
  scrollTo({top}){this.scrollY=Math.max(0,Math.min(top,Math.max(0,docHeight-viewport)));},
 };
 globalThis.window=windowStub;
 const root={...events(),dataset:{replyCount:'8'}};
 const element=(top,bottom,properties={})=>({
  ...events(),dataset:{},classList:classList(),children:[],hidden:false,disabled:false,
  attributes:new Map(),textContent:'',innerHTML:'',
  getBoundingClientRect(){return {top:top-windowStub.scrollY,bottom:bottom-windowStub.scrollY,height:bottom-top,width:152};},
  setAttribute(key,value){this.attributes.set(key,value);},removeAttribute(key){this.attributes.delete(key);},
  focus(){globalThis.document.activeElement=this;root.emit('focusin');},
  closest(selector){return selector==='[data-reading-action]'&&this.dataset.readingAction?this:null;},
  ...properties,
 });
 const heading=element(100,140),postHeader=element(200,230);
 const originalBody=element(300,repliesTop-70,{classList:classList(['post-body'])});
 const original=element(200,repliesTop-25),replyHeading=element(repliesTop,repliesTop+40);
 const latest=element(repliesBottom-150,repliesBottom-20),input=element(editorTop,editorTop+130);
 const buttons=new Map(['original','replies','latest','write','return'].map(action=>[action,
  element(0,44,{dataset:{readingAction:action},hidden:action==='return'}),
 ]));
 const icon=element(0,0),label=element(0,0),count=element(0,0);
 const mobileLeft=element(0,44,{dataset:{readingMobileLeft:'',readingAction:'replies'},
  querySelector:selector=>({'.reading-action-icon':icon,'.reading-action-label':label,'.reading-count':count})[selector],
 });
 const desktop=element(0,300,{
  getBoundingClientRect(){return {top:88,bottom:388,height:width<=760?0:300,width:width<=760?0:152};},
  querySelector:selector=>selector==='[data-reading-action="return"]'?buttons.get('return'):null,
  querySelectorAll:()=>[...buttons.values()],
 });
 const replies=element(repliesTop,repliesBottom,{querySelector:selector=>selector==='h2'?replyHeading:latest});
 const selectors={'#topic-original':original,'#topic-replies':replies,'.reading-nav':desktop,'#reply-text':input,'.detail-heading':heading};
 root.querySelector=selector=>selectors[selector]||null;
 root.querySelectorAll=selector=>selector==='img'?[]:[heading,postHeader,originalBody];
 const mobile={...events(),querySelector:()=>mobileLeft};
 globalThis.document={activeElement:null,body:{classList:bodyClasses},documentElement:{scrollHeight:docHeight},
  querySelector:()=>({getBoundingClientRect:()=>({bottom:width<=760?112:64})}),
 };
 globalThis.getComputedStyle=()=>({position:'sticky'});
 globalThis.matchMedia=query=>({matches:query==='(max-width:760px)'&&width<=760});
 globalThis.requestAnimationFrame=callback=>{queue.set(++frameId,callback);return frameId;};
 globalThis.cancelAnimationFrame=id=>queue.delete(id);
 if(portaled)selectors['#reply-text']=null;
 const navigation=createReadingNavigation({root,mobile,bookmark,onWrite,replyInput:portaled?input:null,t:key=>key,
  onBookmark:point=>{saved=point;},onWindow:()=>false,
 });
 const flush=()=>{while(queue.size){const pending=[...queue.values()];queue.clear();pending.forEach(callback=>callback());}};
 return {navigation,input,mobileLeft,buttons,bodyClasses,flush,window:windowStub,bookmark:()=>saved,
  click(action){const button=buttons.get(action);button.focus();root.emit('click',{target:button,preventDefault(){}});flush();},
  dispose(){navigation.destroy();for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}},
 };
}

test('desktop reply focus keeps visible enabled return; clicking it restores reading without consuming the draft',()=>{
 const harness=createNavigationDOMHarness(createReadingNavigation);
 try{
  const back=harness.buttons.get('return');assert.equal(back.hidden,false);assert.equal(back.disabled,true);
  harness.navigation.navigate('write');harness.flush();
  assert.ok(harness.bookmark());assert.equal(globalThis.document.activeElement,harness.input);
  assert.equal(harness.bodyClasses.contains('reading-keyboard-open'),false);
  assert.equal(back.hidden,false);assert.equal(back.disabled,false);
  harness.input.value='Unpublished draft';harness.click('return');
  assert.equal(harness.window.scrollY,700);assert.equal(harness.input.value,'Unpublished draft');
  assert.equal(harness.bookmark(),null);assert.equal(back.hidden,false);assert.equal(back.disabled,true);
 }finally{harness.dispose();}
});
test('mobile reply focus hides only mobile actions and preserves a return after keyboard dismissal',()=>{
 const harness=createNavigationDOMHarness(createReadingNavigation,{width:390,viewport:844});
 try{
  harness.navigation.navigate('write');harness.flush();
  assert.equal(harness.bodyClasses.contains('reading-keyboard-open'),true);
  assert.equal(harness.mobileLeft.dataset.readingAction,'return');
  harness.click('return');assert.equal(harness.window.scrollY,700);
  assert.equal(harness.bodyClasses.contains('reading-keyboard-open'),false);
 }finally{harness.dispose();}
});
test('short reply area clamped by the bottom of the document still exposes the return action',()=>{
 const harness=createNavigationDOMHarness(createReadingNavigation,{width:390,viewport:900,repliesTop:2400,repliesBottom:2500,editorTop:2600,docHeight:2900});
 try{harness.navigation.navigate('replies');harness.flush();assert.equal(harness.window.scrollY,2000);assert.equal(harness.mobileLeft.dataset.readingAction,'return');}
 finally{harness.dispose();}
});
test('navigation rebuilt while the reply editor is in a full-screen dialog keeps the original input reference',()=>{
 const harness=createNavigationDOMHarness(createReadingNavigation,{portaled:true});
 try{harness.input.value='Long reply retained';harness.navigation.navigate('write');harness.flush();assert.equal(document.activeElement,harness.input);assert.equal(harness.buttons.get('return').disabled,false);harness.click('return');assert.equal(harness.input.value,'Long reply retained');assert.equal(harness.window.scrollY,700);}
 finally{harness.dispose();}
});

test('opening the phone writer remembers the paragraph without scrolling to the inline editor',()=>{
 let opened=0;const harness=createNavigationDOMHarness(createReadingNavigation,{width:390,onWrite:()=>{opened++;return true;}});
 try{harness.input.value='Existing draft';harness.navigation.navigate('write');harness.flush();assert.equal(opened,1);assert.ok(harness.bookmark());assert.equal(harness.window.scrollY,700);assert.equal(harness.input.value,'Existing draft');harness.click('return');assert.equal(harness.window.scrollY,700);assert.equal(harness.bookmark(),null);}
 finally{harness.dispose();}
});
