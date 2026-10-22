import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplyWriting} from '../dist/reply-writing.js';
import {Element} from './helpers/mobile-dom.mjs';

test('direct phone writing moves one editor, preserves long draft/quotes/uploads and restores scroll on collapse',()=>{
 const keys=['document','window','matchMedia'],old=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const body=new Element('body'),page=new Element('main'),host=new Element('section'),textarea=new Element('textarea'),label=new Element('label'),footer=new Element('footer');label.setAttribute('for','reply-text');footer.className='editor-actions';
 const quotes=new Element('div'),media=new Element('div'),language=new Element('label');quotes.className='m3-draft-quotes';media.className='m3-media';language.className='m3-language-field';quotes.receipts=[{id:'quote-123'}];media.receipts=[{id:'image-123'}];
 host.append(label,quotes,textarea,media,language,footer);page.append(host);body.append(page);
 const phone=new EventTarget();phone.matches=true;const view=new EventTarget();Object.assign(view,{scrollX:0,scrollY:733,innerHeight:844,visualViewport:null,scrollTo({top}){this.scrollY=top;},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
 globalThis.document={body,createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag),createComment:()=>new Element('comment')};globalThis.window=view;globalThis.matchMedia=()=>phone;
 let preview=false,changes=0;const editor={isPreview:()=>preview,setPreview:value=>preview=value,elements:{bar:new Element('div'),preview:new Element('div'),mode:new Element('button')}};
 textarea.value='Long reply '.repeat(400);textarea.selectionStart=12;textarea.selectionEnd=31;textarea.selectionDirection='forward';textarea.scrollTop=130;
 let writing;
 try{
  writing=createReplyWriting({host,textarea,editor,t:key=>key,topicTitle:'Real topic',onState:()=>changes++});
  writing.open();assert.equal(writing.isExpanded(),true);const dialog=body.querySelector('dialog');assert.equal(dialog.children[0],host);assert.equal(host.querySelector('textarea'),textarea);assert.equal(textarea.value.length,4400);assert.equal(textarea.selectionStart,12);assert.equal(document.activeElement,textarea);assert.equal(body.classList.contains('reply-fullscreen-open'),true);
  const expand=host.querySelector('.reply-expand');expand.click();assert.equal(writing.isExpanded(),false);assert.equal(page.children[0],host);assert.equal(view.scrollY,733);assert.equal(body.style.getPropertyValue('position'),'');assert.equal(document.activeElement,expand);
  preview=true;writing.refresh();writing.open();assert.equal(document.activeElement,host.querySelector('.reply-writing-tabs').children[1]);assert.equal(preview,true);assert.equal(quotes.receipts[0].id,'quote-123');assert.equal(media.receipts[0].id,'image-123');
  phone.matches=false;phone.dispatchEvent(new Event('change'));assert.equal(writing.isExpanded(),false);assert.equal(page.children[0],host);assert.equal(textarea.value.length,4400);assert.equal(body.classList.contains('reply-fullscreen-open'),false);writing.open();assert.equal(writing.isExpanded(),false);
  phone.matches=true;phone.dispatchEvent(new Event('change'));writing.open();writing.destroy();assert.equal(body.querySelector('dialog'),null);assert.equal(page.children[0],host);assert.equal(view.scrollY,733);assert.ok(changes>=5);writing=null;
 }finally{writing?.destroy();for(const [key,descriptor]of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
