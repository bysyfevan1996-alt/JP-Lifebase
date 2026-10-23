import {readingHeaderProgress} from './reading-header-state.js?v=20261023030157187';

// Keep a stable space in the document while the visible sticky header shrinks.
export function createReadingHeader(root){
 const header=root.querySelector('.reading-topic-header'),surface=root.querySelector('.reading-header-surface');
 const topInset=()=>{
  if(root.dataset?.mobileReading==='true')return 52;
  const topbar=document.querySelector('.topbar');
  if(root.dataset?.desktopSticky==='true')return topbar?.getBoundingClientRect().bottom||0;
  if(root.dataset?.flowHeader==='true'){const row=typeof matchMedia==='function'&&matchMedia('(min-width:761px) and (max-width:1199px)').matches?root.querySelector('.reading-desktop-aside'):null;return (topbar?.getBoundingClientRect().bottom||0)+(row?.getBoundingClientRect().height||0);}
  const detailView=root.closest?.('#detail-view');
  const actions=detailView?.querySelector('.detail-top-actions');
  const actionsHeight=actions?actions.getBoundingClientRect().height:0;
  return (topbar?.getBoundingClientRect().bottom||0)+actionsHeight;
 };
 if(!header||!surface)return {update(){},inset:()=>topInset()+12,destroy(){}};
 let width=-1,disposed=false,wasMobile=false;
 function update(){
  if(disposed)return;
  if(root.dataset?.mobileReading==='true'||root.dataset?.flowHeader==='true'&&root.dataset?.desktopSticky!=='true'){
   wasMobile=true;width=-1;
   header.style.setProperty('--reading-progress','0');
   header.style.removeProperty('--reading-expanded-height');
   delete header.dataset.compact;header.classList.toggle('is-stuck',false);
   root.style.setProperty('--reading-live-height','0px');return;
  }
  const rect=root.getBoundingClientRect();
  if(wasMobile||Math.abs(rect.width-width)>.5){
   wasMobile=false;
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
 return {update,inset:()=>{const desktop=root.dataset?.desktopSticky==='true'&&root.dataset?.mobileReading!=='true';const row=desktop&&typeof matchMedia==='function'&&matchMedia('(min-width:761px) and (max-width:1199px)').matches?root.querySelector('.reading-desktop-aside'):null;return topInset()+(root.dataset?.mobileReading==='true'||root.dataset?.flowHeader==='true'&&!desktop?0:surface.getBoundingClientRect().height)+(row?.getBoundingClientRect().height||0)+12;},destroy(){disposed=true;observer?.disconnect();root.style.removeProperty('--reading-live-height');}};
}
