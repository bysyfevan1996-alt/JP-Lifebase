export function createCommunityInsights({db,json,userRequired,httpError}){
 const q=sql=>db.prepare(sql);
 function calculate(days){
  const to=new Date(),from=new Date(to.getTime()-days*86400000),start=from.toISOString(),end=to.toISOString();
  const count=(sql,...args)=>Number(q(sql).get(...args).n);
  const visible="t.hidden=0 AND t.seed=0";
  const metrics={
   newMembers:count('SELECT count(*) AS n FROM users WHERE created_at>=? AND created_at<?',start,end),
   topics:count('SELECT count(*) AS n FROM topics t WHERE '+visible+' AND t.created_at>=? AND t.created_at<?',start,end),
   replies:count('SELECT count(*) AS n FROM posts p JOIN topics t ON t.id=p.topic_id WHERE '+visible+' AND p.hidden=0 AND p.created_at>=? AND p.created_at<?',start,end),
   activeAuthors:count('SELECT count(DISTINCT user_id) AS n FROM (SELECT t.user_id FROM topics t WHERE '+visible+' AND t.created_at>=? AND t.created_at<? UNION ALL SELECT p.user_id FROM posts p JOIN topics t ON t.id=p.topic_id WHERE '+visible+' AND p.hidden=0 AND p.created_at>=? AND p.created_at<?)',start,end,start,end),
   solvedTopics:count('SELECT count(*) AS n FROM topics t JOIN topic_answers a ON a.topic_id=t.id JOIN posts p ON p.id=a.post_id AND p.topic_id=t.id WHERE '+visible+' AND p.hidden=0 AND t.created_at>=? AND t.created_at<?',start,end),
   reactions:count("SELECT count(*) AS n FROM content_reactions r JOIN topics t ON t.id=CASE WHEN r.kind='topic' THEN r.content_id ELSE (SELECT p.topic_id FROM posts p WHERE p.id=r.content_id AND p.hidden=0) END WHERE "+visible+" AND r.created_at>=? AND r.created_at<?",start,end),
   openReports:count("SELECT count(*) AS n FROM reports WHERE status IN ('open','reviewing')")
  };
  return {range:{from:start,to:end,days,timezone:'UTC'},metrics,definitions:{newMembers:'Accounts created in [from,to), including currently restricted accounts.',topics:'Currently visible non-sample topics created in [from,to).',replies:'Currently visible replies under visible non-sample topics, created in [from,to).',activeAuthors:'Distinct non-null authors of those topics or replies; this is not visitors or page views.',solvedTopics:'Visible non-sample topics created in [from,to) with a currently visible selected answer.',reactions:'Current reaction rows on visible non-sample content, whose reaction timestamp is in [from,to); deleted reactions are not counted.',openReports:'Current open or reviewing report backlog, regardless of report date; not period arrivals.'}};
 }
 async function handle(req,res,url){if(url.pathname!=='/api/admin/insights')return false;const user=userRequired(req);if(user.role!=='admin')throw httpError(403,'forbidden');if(req.method!=='GET')throw httpError(404,'not_found');const raw=url.searchParams.get('days')||'30';if(!['7','30','90'].includes(raw))throw httpError(400,'invalid_range');json(res,200,calculate(Number(raw)));return true;}
 return {handle,calculate};
}
