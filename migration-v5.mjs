import {createHash} from 'node:crypto';

// Frozen migration: seed labels are literal data, not imports from mutable UI modules.
function up(db){
 db.exec(`CREATE TABLE community_categories(
  id TEXT PRIMARY KEY,name TEXT NOT NULL,translations TEXT NOT NULL DEFAULT '{}',color TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 10000),active INTEGER NOT NULL CHECK(active IN (0,1)),updated_at TEXT NOT NULL
 );
 CREATE TABLE community_tags(
  id TEXT PRIMARY KEY,name TEXT NOT NULL,translations TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 10000),active INTEGER NOT NULL CHECK(active IN (0,1)),updated_at TEXT NOT NULL
 );
 CREATE TABLE user_profiles(
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,bio TEXT NOT NULL DEFAULT '',location TEXT NOT NULL DEFAULT '',website TEXT NOT NULL DEFAULT '',
  public_enabled INTEGER NOT NULL DEFAULT 0 CHECK(public_enabled IN (0,1)),show_activity INTEGER NOT NULL DEFAULT 0 CHECK(show_activity IN (0,1)),updated_at TEXT NOT NULL
 );
 CREATE VIRTUAL TABLE community_search_fts USING fts5(kind UNINDEXED,content_id UNINDEXED,topic_id UNINDEXED,author_id UNINDEXED,title,body,tokenize='trigram');
 INSERT INTO community_search_fts(kind,content_id,topic_id,author_id,title,body) SELECT 'topic',id,id,user_id,title,body FROM topics;
 INSERT INTO community_search_fts(kind,content_id,topic_id,author_id,title,body) SELECT 'post',id,topic_id,user_id,'',body FROM posts;
 CREATE TRIGGER m5_topic_search_ai AFTER INSERT ON topics BEGIN
  INSERT INTO community_search_fts(kind,content_id,topic_id,author_id,title,body) VALUES('topic',new.id,new.id,new.user_id,new.title,new.body);
 END;
 CREATE TRIGGER m5_topic_search_au AFTER UPDATE OF title,body,user_id ON topics BEGIN
  DELETE FROM community_search_fts WHERE kind='topic' AND content_id=old.id;
  INSERT INTO community_search_fts(kind,content_id,topic_id,author_id,title,body) VALUES('topic',new.id,new.id,new.user_id,new.title,new.body);
 END;
 CREATE TRIGGER m5_topic_search_ad AFTER DELETE ON topics BEGIN
  DELETE FROM community_search_fts WHERE kind='topic' AND content_id=old.id;
 END;
 CREATE TRIGGER m5_post_search_ai AFTER INSERT ON posts BEGIN
  INSERT INTO community_search_fts(kind,content_id,topic_id,author_id,title,body) VALUES('post',new.id,new.topic_id,new.user_id,'',new.body);
 END;
 CREATE TRIGGER m5_post_search_au AFTER UPDATE OF body,user_id,topic_id ON posts BEGIN
  DELETE FROM community_search_fts WHERE kind='post' AND content_id=old.id;
  INSERT INTO community_search_fts(kind,content_id,topic_id,author_id,title,body) VALUES('post',new.id,new.topic_id,new.user_id,'',new.body);
 END;
 CREATE TRIGGER m5_post_search_ad AFTER DELETE ON posts BEGIN
  DELETE FROM community_search_fts WHERE kind='post' AND content_id=old.id;
 END;`);
 const languages=['en','ja','zh-CN','zh-TW','ko'],stamp=new Date().toISOString();
 const categories=[
  ['housing','#6d9c81',['Housing & bills','住まい・光熱費','住房与账单','住房與帳單','주거·공과금']],
  ['visa','#c4a16a',['Visas & paperwork','ビザ・手続き','签证与手续','簽證與手續','비자·행정 절차']],
  ['work','#8b8fbc',['Work & taxes','仕事・税金','工作与税务','工作與稅務','일·세금']],
  ['car','#709fb7',['Cars & travel','車・お出かけ','汽车与出行','汽車與出行','자동차·외출']],
  ['daily','#bd8781',['General chat','雑談','杂谈','閒聊','자유게시판']],
  ['site','#9b9b9b',['Site announcements','運営・お知らせ','站务与公告','站務與公告','운영·공지']]
 ];
 const tags=[
  ['rent',['Rent','賃貸','租房','租屋','임대']],['moving',['Moving','引越し','搬家','搬家','이사']],
  ['electricity',['Electricity','電気','电费','電費','전기']],['gas',['Gas','ガス','燃气','瓦斯','가스']],
  ['visa',['Visa','ビザ','签证','簽證','비자']],['residence',['Residence procedures','在留手続き','在留手续','在留手續','체류 수속']],
  ['employment',['Employment','仕事','就业','就業','취업']],['tax',['Tax','税金','税务','稅務','세금']],
  ['driving',['Driving','運転','驾车','開車','운전']],['transport',['Public transport','公共交通','公共交通','公共交通','대중교통']],
  ['travel',['Travel','旅行','旅行','旅行','여행']],['food',['Food','食事','美食','美食','음식']],
  ['shopping',['Shopping','買い物','购物','購物','쇼핑']],['family',['Family','家族','家庭','家庭','가족']],
  ['community',['Community','コミュニティ','社区','社群','커뮤니티']]
 ];
 const translations=names=>JSON.stringify(Object.fromEntries(languages.map((lang,index)=>[lang,names[index]])));
 const category=db.prepare('INSERT INTO community_categories(id,name,translations,color,position,active,updated_at) VALUES(?,?,?,?,?,1,?)');
 categories.forEach(([id,color,names],index)=>category.run(id,names[2],translations(names),color,index*10,stamp));
 const tag=db.prepare('INSERT INTO community_tags(id,name,translations,position,active,updated_at) VALUES(?,?,?,?,1,?)');
 tags.forEach(([id,names],index)=>tag.run(id,names[2],translations(names),index*10,stamp));
 db.prepare("INSERT OR IGNORE INTO community_categories(id,name,translations,color,position,active,updated_at) SELECT DISTINCT category,category,'{}','#9b9b9b',10000,0,? FROM topics").run(stamp);
 db.prepare("INSERT OR IGNORE INTO community_tags(id,name,translations,position,active,updated_at) SELECT DISTINCT tag_id,tag_id,'{}',10000,0,? FROM topic_tags").run(stamp);
}
export const migrationV5={version:5,name:'directory-profiles-original-search',checksum:createHash('sha256').update(up.toString()).digest('hex'),up};
