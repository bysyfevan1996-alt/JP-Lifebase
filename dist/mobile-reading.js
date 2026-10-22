import {icon} from './icons.js?v=20261022055817972';

const node=(tag,className,text)=>{const item=document.createElement(tag);item.className=className;if(text!==undefined)item.textContent=text;return item;};

// Reuse the real interaction controls. There is only one bookmark/subscription state.
export function createMobileReading({root,topic,t,onBack,onSearch,onMenu}){
 const events=new AbortController(),options={signal:events.signal},phone=matchMedia('(max-width:760px)');
 let disposed=false,frame=0,placeholder=null,returnFocus=true;
 const controls=root.querySelector('.m4-topic-controls'),bookmark=controls?.querySelector('[data-topic-bookmark]');
 const bar=node('header','mobile-reading-bar'),title=node('span','mobile-reading-title','Japan Life Base');
 function button(label,symbol,handler){const item=node('button','mobile-reading-icon');item.type='button';item.innerHTML=icon(symbol);item.setAttribute('aria-label',label);item.onclick=handler;return item;}
 const back=button(t('back'),'arrow-left',onBack),save=button(t('m4Bookmark'),'bookmark',()=>bookmark?.click());
 const sheet=node('dialog','mobile-reading-sheet');sheet.setAttribute('aria-label',t('mobileTopicOptions'));
 const heading=node('header','mobile-reading-sheet-head'),label=node('h2','',t('mobileTopicOptions'));
 const close=button(t('close'),'x',()=>sheet.close());heading.append(label,close);
 const content=node('div','mobile-reading-sheet-content');sheet.append(heading,content);
 const more=button(t('mobileTopicOptions'),'more',()=>{if(disposed||!phone.matches)return;returnFocus=true;sheet.showModal();document.body.classList.add('mobile-reading-options-open');more.setAttribute('aria-expanded','true');close.focus({preventScroll:true});});
 more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-expanded','false');
 const links=node('div','mobile-reading-links');
 for(const [key,symbol,handler]of [['communitySearch','search',onSearch],['menu','menu',onMenu]]){
  const item=button(t(key),symbol,()=>{returnFocus=false;sheet.close();handler?.();});item.append(node('span','',t(key)));links.append(item);
 }
 content.append(links);bar.append(back,title,save,more);document.body.append(bar,sheet);
 function syncInteraction(){if(disposed)return;save.disabled=!bookmark||bookmark.disabled;const active=bookmark?.getAttribute('aria-pressed')==='true';save.setAttribute('aria-pressed',String(active));save.setAttribute('aria-label',t(active?'m4Bookmarked':'m4Bookmark'));}
 const observer=typeof MutationObserver==='function'&&controls?new MutationObserver(()=>{syncInteraction();if(!disposed&&phone.matches&&controls.querySelector('.m4-topic-error')&&!sheet.open)more.click();}):null;
 observer?.observe(controls,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed','disabled']});
 function update(){frame=0;if(disposed||!phone.matches)return;const compact=(root.querySelector('.detail-heading')?.getBoundingClientRect().bottom??0)<=52;title.textContent=compact?topic.title:'Japan Life Base';title.classList.toggle('is-topic',compact);title.title=compact?topic.title:'';}
 function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(update);}
 function layout(){
  root.dataset.mobileReading=String(phone.matches);bar.hidden=!phone.matches;
  if(phone.matches&&controls&&!placeholder){placeholder=document.createComment('topic controls desktop position');controls.before(placeholder);content.prepend(controls);}
  if(!phone.matches){if(sheet.open)sheet.close();if(placeholder){placeholder.replaceWith(controls);placeholder=null;}}
  update();
 }
 sheet.addEventListener('close',()=>{document.body.classList.remove('mobile-reading-options-open');more.setAttribute('aria-expanded','false');if(returnFocus&&!disposed&&phone.matches&&more.isConnected)more.focus({preventScroll:true});},options);
 sheet.addEventListener('click',event=>{if(event.target===sheet){const rect=sheet.getBoundingClientRect();if(event.clientY<rect.top||event.clientY>rect.bottom||event.clientX<rect.left||event.clientX>rect.right)sheet.close();}},options);
 phone.addEventListener('change',layout,options);window.addEventListener('scroll',schedule,{...options,passive:true});window.addEventListener('resize',schedule,options);root.addEventListener('load',schedule,{...options,capture:true});
 layout();syncInteraction();
 return {syncInteraction,destroy(){if(disposed)return;disposed=true;events.abort();observer?.disconnect();if(frame)cancelAnimationFrame(frame);if(sheet.open)sheet.close();if(placeholder){placeholder.replaceWith(controls);placeholder=null;}bar.remove();sheet.remove();delete root.dataset.mobileReading;document.body.classList.remove('mobile-reading-options-open');}};
}
