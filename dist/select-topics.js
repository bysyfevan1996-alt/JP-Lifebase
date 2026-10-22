export function selectTopics(topics, options = {}) {
  const {category = 'all', query = '', sort = 'latest', solved = 'all'} = options;
  const limit = Number.isFinite(options.limit) ? Math.max(0, Math.floor(options.limit)) : 12;
  const keyword = query.trim().toLowerCase();
  const resolved=solved===true||solved==='true'?true:solved===false||solved==='false'?false:null;
  const filtered = topics.filter(t => (resolved===null||Boolean(t.solved)===resolved) && (category === 'all' || t.category === category) && (!keyword || [t.title,t.excerpt,t.author].join(' ').toLowerCase().includes(keyword)));
  function getTimestamp(topic){
    let ts=typeof topic.createdAt==='string'?Date.parse(topic.createdAt):topic.createdAt;
    if(Number.isFinite(ts))return ts;
    ts=typeof topic.updatedAt==='string'?Date.parse(topic.updatedAt):topic.updatedAt;
    if(Number.isFinite(ts))return ts;
    ts=topic.minutes;
    if(Number.isFinite(ts))return -ts*60000;
    return 0;
  }
  filtered.sort((a,b)=>{
    if(sort==='popular'){
      const repliesDiff=(Number.isFinite(b.replies)?b.replies:0)-(Number.isFinite(a.replies)?a.replies:0);
      if(repliesDiff!==0)return repliesDiff;
    }
    const aTs=getTimestamp(a),bTs=getTimestamp(b);
    if(aTs!==bTs)return bTs-aTs;
    return String(b.id??'').localeCompare(String(a.id??''));
  });
  return {items:filtered.slice(0,limit), total:filtered.length, hasMore:filtered.length > limit};
}
