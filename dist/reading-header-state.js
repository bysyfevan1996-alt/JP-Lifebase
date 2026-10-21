export function readingHeaderProgress({scrollY=0,headerTop=0,topInset=0}={}){
 let s=scrollY;
 if(!Number.isFinite(s))s=0;
 s=Math.max(0,s);
 let t=topInset;
 if(!Number.isFinite(t))t=0;
 t=Math.max(0,t);
 let h=headerTop;
 if(!Number.isFinite(h))h=0;
 const threshold=Math.max(0,h-t);
 const value=s-threshold;
 return Math.max(0,Math.min(1,value/96));
}
