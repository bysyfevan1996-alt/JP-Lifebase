// Public ranking is independent of the chronological first/latest reply window.
export function selectReplyHighlights(db,topicId){
 const answerId=db.prepare('SELECT p.id FROM topic_answers a JOIN topics t ON t.id=a.topic_id JOIN posts p ON p.id=a.post_id AND p.topic_id=a.topic_id WHERE a.topic_id=? AND t.hidden=0 AND p.hidden=0').get(topicId)?.id||null;
 const rows=db.prepare("SELECT p.id,count(r.user_id) AS score FROM posts p JOIN topics t ON t.id=p.topic_id JOIN content_reactions r ON r.kind='post' AND r.content_id=p.id WHERE p.topic_id=? AND t.hidden=0 AND p.hidden=0 AND (? IS NULL OR p.id<>?) GROUP BY p.id HAVING count(r.user_id)>=3 ORDER BY score DESC,p.created_at ASC,p.id ASC LIMIT 3").all(topicId,answerId,answerId);
 return {answerId,hotIds:rows.map(row=>row.id)};
}
