// Geometry helpers for this page's temporary return point, never persisted.
const finite=value=>Number.isFinite(value)?value:0;
const valid=item=>item&&typeof item.key==='string'&&item.key.trim()!==''&&Number.isFinite(item.top)&&Number.isFinite(item.bottom);
export function captureReadingPosition(items,scrollY,inset){
 const y=Math.max(0,finite(scrollY)),readingLine=y+Math.max(0,finite(inset));
 let foundItem=null,lastValidItem=null;
 for(const item of Array.isArray(items)?items:[]){
  if(valid(item)){
   lastValidItem=item;
   if(item.bottom>readingLine){foundItem=item;break;}
  }
 }
 const item=foundItem||lastValidItem;
 return item?{key:item.key,offset:readingLine-item.top,y}:{key:null,offset:0,y};
}
export function restoreReadingPosition(bookmark,items,inset){
 const point=bookmark&&typeof bookmark==='object'?bookmark:{};
 const foundItem=Array.isArray(items)?items.find(item=>valid(item)&&item.key===point.key):null;
 return foundItem?Math.max(0,foundItem.top+finite(point.offset)-Math.max(0,finite(inset))):Math.max(0,finite(point.y));
}
