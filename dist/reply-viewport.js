export function bindReplyViewport({element,view=window}){
 const viewport=view.visualViewport;let frame=0,disposed=false;
 function update(){
  frame=0;if(disposed)return;
  const visible=viewport&&Number.isFinite(viewport.scale)&&Math.abs(viewport.scale-1)<.01&&Number.isFinite(viewport.height)&&viewport.height>0;
  const height=visible?viewport.height:Number.isFinite(view.innerHeight)&&view.innerHeight>0?view.innerHeight:1;
  const top=visible&&Number.isFinite(viewport.offsetTop)?Math.max(0,viewport.offsetTop):0;
  element.style.setProperty('--reply-viewport-height',Math.max(1,height)+'px');element.style.setProperty('--reply-viewport-top',top+'px');
 }
 function schedule(){if(!disposed&&!frame)frame=view.requestAnimationFrame(update);}
 function destroy(){if(disposed)return;disposed=true;viewport?.removeEventListener('resize',schedule);viewport?.removeEventListener('scroll',schedule);view.removeEventListener('resize',schedule);if(frame)view.cancelAnimationFrame(frame);frame=0;element.style.removeProperty('--reply-viewport-height');element.style.removeProperty('--reply-viewport-top');}
 viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);view.addEventListener('resize',schedule);update();return destroy;
}
