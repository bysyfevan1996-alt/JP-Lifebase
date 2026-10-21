export function selectTopics(topics, options = {}) {
  const {category = 'all', query = '', sort = 'latest', solved = 'all'} = options;
  const limit = Number.isFinite(options.limit) ? Math.max(0, Math.floor(options.limit)) : 12;
  const keyword = query.trim().toLowerCase();
  const resolved=solved===true||solved==='true'?true:solved===false||solved==='false'?false:null;
  const filtered = topics.filter(t => (resolved===null||Boolean(t.solved)===resolved) && (category === 'all' || t.category === category) && (!keyword || [t.title,t.excerpt,t.author].join(' ').toLowerCase().includes(keyword)));
  filtered.sort((a,b) => (category==='site'?Number(!!b.pinned&&!Number.isInteger(b.releaseOrder))-Number(!!a.pinned&&!Number.isInteger(a.releaseOrder)):0) || (category==='site'?(Number.isInteger(a.releaseOrder)&&Number.isInteger(b.releaseOrder)?a.releaseOrder-b.releaseOrder:Number(Number.isInteger(b.releaseOrder))-Number(Number.isInteger(a.releaseOrder))):0) || Number(!!b.pinned)-Number(!!a.pinned) || (sort === 'popular' ? b.replies-a.replies : 0) || a.minutes-b.minutes || a.id.localeCompare(b.id));
  return {items:filtered.slice(0,limit), total:filtered.length, hasMore:filtered.length > limit};
}
