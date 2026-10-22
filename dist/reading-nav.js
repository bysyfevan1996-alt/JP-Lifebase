import {captureReadingPosition,restoreReadingPosition} from './reading-position.js?v=20261022012556469';
import {readingControls} from './reading-controls.js?v=20261022012556469';
import {icon} from './icons.js?v=20261022012556469';
import {createReadingHeader} from './reading-header.js?v=20261022012556469';

// Page-local return points. No browser history or persistent read/unread state.
export function createReadingNavigation({root,mobile,t,bookmark=null,onBookmark,onWindow,replyInput=null}){
 const controller=new AbortController(),options={signal:controller.signal};
 const original=root.querySelector('#topic-original'),replies=root.querySelector('#topic-replies');
 const desktop=root.querySelector('.reading-nav'),input=replyInput||root.querySelector('#reply-text');
 const header=createReadingHeader(root);
 let frame=0,disposed=false,returnPoint=bookmark,restoring=false,jumped=false;
 const anchors=[...root.querySelectorAll('.post-header,.post-body,.post-body > *,.topic-image-gallery a,.post .quote')].filter(element=>!element.classList.contains('post-body')||!element.children.length);
 const anchorCounts=new Map();
 anchors.forEach((element,index)=>{
  const post=element.closest?.('[data-post-id]'),postId=post?.dataset.postId;
  if(!postId){element.dataset.readingKey=String(index);return;}
  const ordinal=anchorCounts.get(postId)||0;anchorCounts.set(postId,ordinal+1);
  element.dataset.readingKey=postId+':'+ordinal;
 });
 const inset=()=>header.inset();
 const items=()=>anchors.map(element=>{const rect=element.getBoundingClientRect();return {key:element.dataset.readingKey,top:rect.top+window.scrollY,bottom:rect.bottom+window.scrollY};});
 function remember(){
  if(window.scrollY+inset()<replies.getBoundingClientRect().top+window.scrollY){
   returnPoint=captureReadingPosition(items(),window.scrollY,inset());onBookmark(returnPoint);
  }
 }
 function update(){
  frame=0;if(disposed)return;
  header.update();
  const rect=replies.getBoundingClientRect();
  if(rect.top>=window.innerHeight)jumped=false;
  const atBottom=window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-3;
  const inReplies=rect.top<=inset()+32||((jumped||atBottom)&&rect.top<window.innerHeight-72&&rect.bottom>inset());
  const controls=readingControls({inReplies,hasBookmark:!!returnPoint,count:Number(root.dataset.replyCount)});
  const back=desktop.querySelector('[data-reading-action="return"]');back.hidden=false;back.disabled=controls.desktopReturnDisabled;back.classList.toggle('is-ready',!back.disabled);
  back.title=t(back.disabled?'readingReturnHint':'readingReturn');
  const left=mobile.querySelector('[data-reading-mobile-left]');
  left.dataset.readingAction=controls.mobileAction;
  left.classList.toggle('is-return',controls.mobileAction==='return');
  const iconNode=left.querySelector('.reading-action-icon'),symbol=inReplies?'arrow-left':'message';
  if(iconNode.dataset.icon!==symbol){iconNode.innerHTML=icon(symbol);iconNode.dataset.icon=symbol;}
  left.querySelector('.reading-action-label').textContent=t(inReplies?controls.mobileKey:'readingRepliesLabel');
  const countBadge=left.querySelector('.reading-count');countBadge.hidden=inReplies;countBadge.textContent=String(controls.count);
  left.setAttribute('aria-label',t(controls.mobileKey,{count:controls.count}));
  desktop.querySelectorAll('[data-reading-action]').forEach(button=>{
   const active=inReplies?button.dataset.readingAction==='replies':button.dataset.readingAction==='original';
   if(active)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
  });
  document.body.classList.toggle('reading-keyboard-open',matchMedia('(max-width:760px)').matches&&document.activeElement===input);
 }
 function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(update);}
 function scrollToElement(element,focus=false){
  if(!element)return;
  if(focus)element.focus({preventScroll:true});
  for(let attempt=0;attempt<4;attempt++){
   const target=Math.max(0,element.getBoundingClientRect().top+window.scrollY-inset());
   if(attempt&&Math.abs(target-window.scrollY)<.5)break;
   window.scrollTo({top:target,behavior:'instant'});header.update();
  }
  update();
 }
 function navigate(action,{rememberPosition=true}={}){
  if(disposed)return;
  if(['replies','latest','write'].includes(action)){if(rememberPosition)remember();jumped=true;}
  if(onWindow?.(action,returnPoint))return;
  if(action==='return'&&returnPoint){
   const point=returnPoint;restoring=true;jumped=false;
   const restore=()=>{
    window.scrollTo({top:point.y,behavior:'instant'});header.update();
    for(let attempt=0;attempt<4;attempt++){
     const target=restoreReadingPosition(point,items(),inset());
     if(Math.abs(target-window.scrollY)<.5)break;
     window.scrollTo({top:target,behavior:'instant'});header.update();
    }
   };
   restore();
   returnPoint=null;onBookmark(null);
   // Re-anchor after a late image above the saved paragraph finishes loading.
   const correct=()=>{if(restoring&&!disposed)restore();};
   for(const image of root.querySelectorAll('img'))if(!image.complete)image.addEventListener('load',correct,{...options,once:true});
   const stop=()=>restoring=false;
   for(const event of ['wheel','touchstart','keydown','pointerdown'])window.addEventListener(event,stop,{...options,once:true,passive:true});
   update();return;
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
 return {navigate,getBookmark:()=>returnPoint,destroy(){disposed=true;controller.abort();header.destroy();if(frame)cancelAnimationFrame(frame);document.body.classList.remove('reading-keyboard-open');}};
}
