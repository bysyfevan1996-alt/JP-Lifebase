export function readingControls({inReplies=false,hasBookmark=false,count=0}={}){
 const desktopReturnDisabled=!hasBookmark;
 const mobileAction=inReplies?(hasBookmark?'return':'original'):'replies';
 const mobileKey=inReplies?(hasBookmark?'readingReturn':'readingOriginal'):'readingReplies';
 let validatedCount=0;
 if(typeof count==='number'&&Number.isSafeInteger(count)&&count>=0)validatedCount=count;
 return {desktopReturnDisabled,mobileAction,mobileKey,count:validatedCount};
}
