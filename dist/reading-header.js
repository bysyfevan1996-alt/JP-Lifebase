import {readingHeaderProgress} from './reading-header-state.js?v=20261021234459592';

// Keep a stable space in the document while the visible sticky header shrinks.
export function createReadingHeader(root){
 const header=root.querySelector('.reading-topic-header'),surface=root.querySelector('.reading-header-surface');
 const topInset=()=>{
  const topbar=document.querySelector('.topbar');
  const detailView=root.closest?.('#detail-view');
  const actions=detailView?.querySelector('.detail-top-actions');
  const actionsHeight=actions?actions.getBoundingClientRect().height:0;
  return (topbar?.getBoundingClientRect().bottom||0)+actionsHeight;
 };
 if(!header||!surface)return {update(){},inset:()=>topInset()+12,destroy(){}};
 let width=-1,disposed=false;
 function update(){
  if(disposed)return;
  const rect=root.getBoundingClientRect();
  if(Math.abs(rect.width-width)>.5){
   width=rect.width;
   header.style.setProperty('--reading-progress','0');
   delete header.dataset.compact;
   header.style.setProperty('--reading-expanded-height',surface.getBoundingClientRect().height+'px');
   header.dataset.ready='';
  }
  const progress=readingHeaderProgress({scrollY:window.scrollY,headerTop:rect.top+window.scrollY,topInset:topInset()});
  header.style.setProperty('--reading-progress',String(progress));
  header.classList.toggle('is-stuck',window.scrollY>rect.top+window.scrollY-topInset());
  if(progress===1)header.dataset.compact='';else delete header.dataset.compact;
  root.style.setProperty('--reading-live-height',surface.getBoundingClientRect().height+'px');
 }
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):null;
 observer?.observe(root);
 update();
 return {update,inset:()=>topInset()+surface.getBoundingClientRect().height+12,destroy(){disposed=true;observer?.disconnect();root.style.removeProperty('--reading-live-height');}};
}
