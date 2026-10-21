import {captureReadingPosition,restoreReadingPosition} from './reading-position.js?v=20261021110501783';

// Page-local return points. No browser history or persistent read/unread state.
export function createReadingNavigation({root,mobile,t,bookmark=null,onBookmark,onWindow}){
 const controller=new AbortController(),options={signal:controller.signal};
 const original=root.querySelector('#topic-original'),replies=root.querySelector('#topic-replies');
 const desktop=root.querySelector('.reading-nav'),input=root.querySelector('#reply-text');
 let frame=0,disposed=false,returnPoint=bookmark,restoring=false,jumped=false;
 const anchors=[...root.querySelectorAll('.detail-heading,.post-header,.post-body,.post-body > *,.topic-image-gallery a,.post .quote')].filter(element=>!element.classList.contains('post-body')||!element.children.length);
 anchors.forEach((element,index)=>element.dataset.readingKey=String(index));
 const inset=()=>{
  const header=document.querySelector('.topbar')?.getBoundingClientRect().bottom||0;
  const compact=desktop&&getComputedStyle(desktop).position==='sticky'&&desktop.getBoundingClientRect().width>210;
  return header+12+(compact?desktop.getBoundingClientRect().height+12:0);
 };
 const items=()=>anchors.map(element=>{const rect=element.getBoundingClientRect();return {key:element.dataset.readingKey,top:rect.top+window.scrollY,bottom:rect.bottom+window.scrollY};});
 function remember(){
  if(window.scrollY+inset()<replies.getBoundingClientRect().top+window.scrollY){
   returnPoint=captureReadingPosition(items(),window.scrollY,inset());onBookmark(returnPoint);
  }
 }
 function update(){
  frame=0;if(disposed)return;
  const rect=replies.getBoundingClientRect();
  if(rect.top>=window.innerHeight)jumped=false;
  const atBottom=window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-3;
  const inReplies=rect.top<=inset()+32||((jumped||atBottom)&&rect.top<window.innerHeight-72&&rect.bottom>inset());
  const back=desktop.querySelector('[data-reading-action="return"]');back.hidden=!returnPoint;
  const left=mobile.querySelector('[data-reading-mobile-left]');
  left.dataset.readingAction=inReplies?(returnPoint?'return':'original'):'replies';
  left.textContent=inReplies?t(returnPoint?'readingReturn':'readingOriginal'):t('readingReplies',{count:root.dataset.replyCount});
  desktop.querySelectorAll('[data-reading-action]').forEach(button=>{
   const active=inReplies?button.dataset.readingAction==='replies':button.dataset.readingAction==='original';
   if(active)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
  });
  document.body.classList.toggle('reading-keyboard-open',document.activeElement===input);
 }
 function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(update);}
 function scrollToElement(element,focus=false){
  if(!element)return;
  if(focus)element.focus({preventScroll:true});
  window.scrollTo({top:Math.max(0,element.getBoundingClientRect().top+window.scrollY-inset()),behavior:'instant'});
  schedule();
 }
 function navigate(action,{rememberPosition=true}={}){
  if(disposed)return;
  if(['replies','latest','write'].includes(action)){if(rememberPosition)remember();jumped=true;}
  if(onWindow?.(action,returnPoint))return;
  if(action==='return'&&returnPoint){
   const point=returnPoint;restoring=true;jumped=false;
   window.scrollTo({top:restoreReadingPosition(point,items(),inset()),behavior:'instant'});
   returnPoint=null;onBookmark(null);
   // Re-anchor after a late image above the saved paragraph finishes loading.
   const correct=()=>{if(restoring&&!disposed)window.scrollTo({top:restoreReadingPosition(point,items(),inset()),behavior:'instant'});};
   for(const image of root.querySelectorAll('img'))if(!image.complete)image.addEventListener('load',correct,{...options,once:true});
   const stop=()=>restoring=false;
   for(const event of ['wheel','touchstart','keydown','pointerdown'])window.addEventListener(event,stop,{...options,once:true,passive:true});
   schedule();return;
  }
  restoring=false;
  if(action==='original'){jumped=false;scrollToElement(original||root.querySelector('.detail-heading'));}
  if(action==='replies')scrollToElement(replies.querySelector('h2'),true);
  if(action==='latest')scrollToElement(replies.querySelector('.reply-posts .post:last-child')||replies.querySelector('h2'),true);
  if(action==='write')scrollToElement(input,true);
  schedule();
 }
 function click(event){const button=event.target.closest('[data-reading-action]');if(button){event.preventDefault();navigate(button.dataset.readingAction);}}
 root.addEventListener('click',click,options);mobile.addEventListener('click',click,options);
 for(const target of [window,window.visualViewport].filter(Boolean)){
  target.addEventListener('scroll',schedule,{...options,passive:true});target.addEventListener('resize',schedule,options);
 }
 root.addEventListener('focusin',schedule,options);root.addEventListener('focusout',schedule,options);
 root.addEventListener('load',schedule,{...options,capture:true});
 update();
 return {navigate,getBookmark:()=>returnPoint,destroy(){disposed=true;controller.abort();if(frame)cancelAnimationFrame(frame);document.body.classList.remove('reading-keyboard-open');}};
}
