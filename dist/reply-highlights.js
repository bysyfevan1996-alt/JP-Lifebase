// Move the original articles: edits, quotes, reaction controls and IDs stay attached.
export function createReplyHighlights({root,featured=[],t}){
 const list=root.querySelector('.reply-posts');
 const rows=[...list.querySelectorAll('.post')].sort((a,b)=>Number(a.dataset.floor)-Number(b.dataset.floor));
 const byId=new Map(rows.map(node=>[node.dataset.postId,node]));
 const hotIds=featured.filter(post=>post.featured==='hot').map(post=>post.id);
 let answerId,initialized=false;
 function setAnswer(id){
  if(initialized&&answerId===id)return;
  initialized=true;answerId=id||null;
  const order=[...(byId.has(answerId)?[answerId]:[]),...hotIds.filter(key=>key!==answerId&&byId.has(key))];
  const ranked=new Set(order);
  for(const node of rows){
   const kind=node.dataset.postId===answerId?'answer':ranked.has(node.dataset.postId)?'hot':null;
   node.classList.toggle('featured-reply',!!kind);
   node.dataset.featured=kind||'';
   let label=node.querySelector('.featured-reply-label');
   if(kind){if(!label){label=document.createElement('p');label.className='featured-reply-label';node.prepend(label);}label.textContent=t(kind==='answer'?'readingPinnedAnswer':'readingPinnedHot');}
   else label?.remove();
  }
  for(const id of order)list.append(byId.get(id));
  for(const node of rows)if(!ranked.has(node.dataset.postId))list.append(node);
  for(const action of ['answer','hot']){
   const enabled=rows.some(node=>node.dataset.featured===action);
   root.querySelectorAll('[data-reading-action="'+action+'"]').forEach(button=>button.hidden=!enabled);
  }
 }
 setAnswer(featured.find(post=>post.featured==='answer')?.id||null);
 return {setAnswer};
}
