# 社区服务与数据

2026-10-22新增成员POST /api/tags（name、expectedUserId）：await body后及事务内重验账号/禁言/封禁；以NFKC、合并空白及大小写key匹配既有ID/名称/五语别名，停用名称不重建；新ID为名称key的SHA256前32位加tag-。创建与create_tag审计同事务，审计失败回滚；原账号24小时最多10个、全库200个，请求限速。没有给成员开放目录编辑、改名或停用权限；使用原community_tags/admin_actions表，schema仍5，冻结迁移不改。摄影/生活及汽车改名通过受现有管理员约束的ops/update-community-sections.mjs执行，保留历史分类ID。详见docs/COMMUNITY_CATALOG_UPDATE.md。

先读当前 `server.mjs`、`auth.mjs` 与 `ops/README.md`。项目使用 Node.js **24+** 的内置 HTTP、crypto、SQLite，无外部运行依赖或打包步骤，不沿早期规划另建 WordPress／FastAPI。账号流程在 `auth.mjs`，投递在 `mailer.mjs`，头像校验在 `avatar.mjs`，独立账户页面在 `dist/auth-ui.js`。

管理服务在 `community-admin.mjs`，独立画面在 `/admin`。前端先读会话：匿名引导到 `/account/login?return=%2Fadmin`，普通成员显示无权限；入口隐藏只是界面约定，所有 `/api/admin/*` 仍由服务器强制匿名 401、非管理员 403。

## 账号与权限

- 账号、会话、主题、回复均在服务器持久化。`localStorage` 只保存偏好，不作为身份或帖子数据库。
- 所有公开注册都是 `member`，即使提交管理员字段也不能提升权限。没有“首位注册自动管理员”，没有通过 `ADMIN_EMAIL` 自动升权的实现。
- 登录使用 scrypt 密码校验；7 天会话的随机令牌放 HttpOnly、SameSite=Lax Cookie，数据库只存令牌 hash。生产 Cookie 保持 Secure，本地 HTTP 才用 `COOKIE_SECURE=0`。
- 注册先验证邮箱，再填写昵称、密码与可选头像；不能绕过验证直接创建账号。验证码有效 10 分钟、最多错 5 次，重发冷却 180 秒并持久化；成功验证后的完成授权有效 15 分钟且只能使用一次。投递失败不能激活新验证码，失败重发保留旧码。
- 密码找回仅适用于已验证邮箱，重设后撤销该账号所有会话。旧账号迁移保留原密码、角色、会话与内容；未验证的旧邮箱须登录后重输原密码才可验证，不能直接拿它重设密码。验证码／授权状态以服务端为准，不用前端倒计时替代校验。
- 发帖／回复需要登录，普通成员不能发 `site` 分类；删除主题只有作者或管理员有权限。前端发帖编辑器目前对所有账号都隐藏 `site` 选项；管理画面不等于已增加站务发帖编辑器。
- 所有 POST／DELETE 都校验同源 Origin（包含端口），请求体为 JSON；不要为修本地调用而移除校验。保留 Host 白名单和现有限流；测试用正确 Origin。

新密码前后端为 12–128 字符，保留有意输入的空格；旧版密码仅在兼容校验路径保持旧行为。回复界面与API均6000字符，主楼12000；源语言独立选择、默认und。

头像在浏览器接受最多 5 MB 的 JPEG／PNG／WebP，裁切为方形 PNG 并移除原图元数据；服务端仅接受通过严格校验、最大 256×256／90 KB 的 PNG。头像保存在同一 SQLite，移除后恢复昵称字素与稳定配色，不连接第三方头像服务。

## API 与功能边界

| API | 用途／权限 |
| --- | --- |
| `GET /api/health` | 健康、实际releaseId、源码SHA256、schemaVersion、datasetVersion及翻译配置状态 |
| `GET /api/session` | 当前会话 |
| `POST /api/auth/register/start`、`/api/auth/password/start` | 开始注册邮箱验证／已验证邮箱的密码找回 |
| `POST /api/auth/email/start` | 登录旧账号重输原密码后，验证现有邮箱 |
| `GET /api/auth/flow` | 读取当前服务端验证流程的脱敏状态 |
| `POST /api/auth/verify`、`/api/auth/resend`、`/api/auth/cancel` | 校验六位码／重发／取消流程 |
| `POST /api/register`、`/api/login`、`/api/logout` | 消费已验证注册授权／登录／退出 |
| `POST /api/auth/password/complete` | 消费密码找回授权，更新密码并撤销会话 |
| `POST /api/me/avatar`、`GET /api/avatars/<user-id>/<hash>` | 登录后更新／移除头像，按内容 hash 提供 PNG |
| `GET /api/topics?lang=...` | 公开列表，最多 250 条 |
| `GET /api/topics/<id>?lang=...` | 主题和最多 250 条回复，含首帖 |
| `POST /api/topics` | 登录后发帖：title、body、category、language |
| `POST /api/topics/<id>/replies` | 登录后回复：body、可选 quote、language |
| `DELETE /api/topics/<id>` | 作者或管理员可恢复隐藏，保留回复/图片/回执；管理员恢复 |
| `POST /api/topics/<id>/report` | 登录举报，写 reports；管理员可在后台读取，管理员可处理open/reviewing/resolved/dismissed |
| `GET /api/me/topics` | 本人主题；支持 lang |
| `GET /api/me/messages` | 别人回复本人公开主题的通知，最多 100 条，原文 |
| `POST /api/contact` | 匿名联系：name、email、message，保存后返回成功 |
| `GET /api/admin/overview` | 仅管理员读取用户／话题／隐藏话题／回复／联系／举报数量 |
| `GET /api/admin/topics?query=...&status=all\|visible\|hidden` | 仅管理员搜索话题及查看状态，最多 100 条 |
| `POST /api/admin/topics/<id>` | 仅管理员设置布尔 `hidden`／`pinned`；可恢复隐藏与置顶，不执行删除 |
| `GET /api/admin/users?query=...` | 仅管理员用户列表，最多100条，包含banned/muted；不含密码、盐、会话、头像二进制等敏感字段 |
| `GET /api/admin/inbox` | 仅管理员读取最近 100 条联系与举报，原文显示 |
| `POST /api/translate` | 其他目标语言的公共文本翻译；五种人工语言返回 manual_language |

GET `lang=original` 保留原文；普通显示默认简中。已实现邮箱验证、密码找回、账号头像、密码变更通知邮件和上述管理画面；新主题支持Markdown、标签和最多5张图片；M3已有回复图片、版本编辑/历史和可恢复隐藏；私信、跨设备读／未读、回复邮件通知尚未实现。管理画面的用户列表可禁言/封禁普通成员，不提供改角色或重设密码按钮；自身和其他管理员不可限制。联系留言仍只入库，没有邮件转发。回复数查询真实 `posts`，不能写静态假计数。`/api/health` 包含包版本、releaseId、sourceSha256、schemaVersion和datasetVersion；生产必须有匹配实际源码的 release-manifest.json，否则启动失败。

## 可恢复审核

`community-admin.mjs` 增量添加 `topics.hidden INTEGER NOT NULL DEFAULT 0`、可见性索引及 `admin_actions`。话题发帖使用命名列 INSERT，不能退回旧位置插入破坏新表兼容性。隐藏主题保留原文、回复、引用和归属，并同时从公开列表、详情直链、回复／举报入口、个人主题和回复通知中排除；恢复后这些记录重新可见。种子主题也用隐藏状态而非删除，避免启动时重新插入。

隐藏／恢复和置顶更新在事务中执行；审计保存操作者、主题 ID、操作前后状态与时间，不复制帖子正文、联系留言或密码。管理表单只接受布尔 `hidden`／`pinned`，拒绝多余字段。管理画面不提供永久删除按钮。HTTP DELETE、管理API和CLI通过topic-state.mjs共享隐藏事务，重复操作不重复审计；保留已发布图片、标签和幂等回执。作者不可自行恢复，管理员可恢复。

## SQLite 与运营操作

本地数据目录 `JPL_DATA_DIR`，默认项目 `data/`；生产为 `/var/lib/jplifebase/community.sqlite`。启用 WAL 和外键。主要表：`users`、`sessions`、`topics`、`posts`、`contacts`、`reports`、`translations`、`translation_usage`；账号还使用 `auth_challenges`、`auth_flows`、`auth_send_state`、`auth_mail_usage`，管理审计使用 `admin_actions`，同库也有电费历史 `denki_datasets`、`topic_tags`、`topic_attachments`、`topic_create_requests`和`schema_migrations`。

数据库升级由schema.mjs中的冻结基线和migrations.mjs账本统一执行：名称、摘要、版本、时间入库；未知未来版本、断档、旧步骤被改、外键异常均拒绝，失败回滚。现有模块的独立初始化仅供隔离调用兼容，server传migrate:false。版本2在migration-v2.mjs增加user_preferences、users.banned/muted、reports状态/处理人/时间，保留版本1摘要。未来DDL写新迁移，不在运行时构造器偷偷改表。测试同时覆盖空库、旧库、重复执行和失败回滚。

运营脚本 `ops/admin.mjs`：

- `promote <registered-email>`：提升已经注册的指定账号；只在用户授权管理该账号时使用，不猜测管理员邮箱。
- `inbox`：输出最近联系与举报，含个人信息；仅在实际处理需要时读取，回复或截图不散布完整内容。
- `hide-topic <id> <registered-admin-email>` / `restore-topic <id> <registered-admin-email>`：要求明确的现有管理员，开启外键，调用共享可恢复事务并审计。无管理员参数失败，不再执行DELETE；种子也可隐藏/恢复。

脚本默认打开生产库，与服务启动用的 `JPL_DATA_DIR` 不同；本地运营脚本应显式设 `JPL_DB` 到临时库，不能直接运行默认命令误操作。

## 翻译服务

配置变量为 `TRANSLATION_BASE_URL`、`TRANSLATION_API_KEY`、`TRANSLATION_MODEL`、`TRANSLATION_DAILY_CHAR_LIMIT`；由生产专用 env 提供。不要读取或复制其他应用密钥。

默认每日 200,000 输入字符、最多 2 个并发；当前按 UTC 日期记额度，非日本时间，失败请求也占已登记的字符额度。`pending` 合并相同进行中请求，SQLite 缓存翻译文本；缓存键不含模型，换模型不会自动刷新旧译文。供应商不可用或额度耗尽时回退原文，不悄悄取消标识或伪装翻译成功。修改翻译供应商与预算时以实际配置和本次要求为准，不把基线模型名当永久约束。

`translationConfigured` 仅表示三项连接配置非空，不证明供应商可达、凭据有效或仍有额度。“只翻译公开文本”是当前应用调用边界；匿名 `/api/translate` 接受调用方的 items，本身不会识别私密信息，不能宣称接口有自动隐私过滤。

管理画面使用独立五套人工字典 `dist/admin-i18n.js`。其他系统语言只能将静态英文字典发给翻译接口；用户列表、邮箱、举报、联系内容和管理查询结果都不进翻译载荷，原文用文本节点呈现。

## 本地验证

```powershell
node --test tests/*.test.mjs
node --check server.mjs
node --check auth.mjs
node --check mailer.mjs
node --check avatar.mjs
node --check translation.mjs
node --check community-admin.mjs
```

集成测试在 `artifacts/test-tmp/` 创建临时数据、启动随机端口，主动清除继承的 `TRANSLATION_*`、`RESEND_*`、`MAIL_*` 和 `AUTH_TOKEN_SECRET`，使用测试文件发件箱而不触发真实邮件或翻译。测试发件箱同时要求 `NODE_ENV=test` 与 `JPL_TEST_MAIL_OUTBOX=1`，只写隔离目录，不能在生产开启或随发布包上传。

账号相关测试在 `tests/auth.test.mjs`、`tests/auth-ui.test.mjs`、`tests/avatar.test.mjs`，覆盖验证码与冷却持久化、授权单次使用、失败重发、旧账号迁移、找回后会话撤销、头像边界和账户页面并发写入锁。修改相应流程时保留这些检查，不使用真实邮箱验证码作为回归样本。

`tests/admin.test.mjs` 覆盖旧库增量迁移、匿名／成员权限拒绝、隐藏后各公开入口不可见、重启后状态保持、恢复保留回复、种子审核、置顶、安全用户字段与审计。管理界面改动还要验证登录返回和手机卡片布局；不要仅凭统计接口通过就视为后台完整验收。

电费集成测试有日期相关固定样本，未来可能随窗口滚动过期。遇到失败先核对夹具与时间；不要为主站改版删除电费回归或放宽窗口。

手工本地预览使用独立临时 `JPL_DATA_DIR`、空闲本地端口和 `COOKIE_SECURE=0`；需要无种子时设 `JPL_SEED=0`。启动前确认数据路径，结束后仅停止本次启动的进程。

## M1语言与权限

## V1.1回复定位与公告

GET /api/topics/<id>增加replyWindow=first|latest（默认first）；各取最早或最新250条，按时间+ID稳定排序，latest反转为正序返回；replyWindow包含mode,total,loaded,hasEarlier,hasLater。保留隐藏话题不可读、人工UI不批量机器翻译用户正文的边界。该接口不等于M2完整分页。

用户明确要求公告时可用ops/publish-announcement.mjs，指定--db、--actor现有有效管理员邮箱、--file公开JSON、固定--request-id；无--publish为只读检查，明确发布时加--publish。通过既有命名列INSERT和topic_create_requests回执创建site分类Markdown主题，重试同请求不重复。不要把公告加到启动种子，不创建新管理员或泄露会话。发布前后按正常在线备份验证，公开页面核对标题、分类和正文。

GET/POST /api/me/preferences使用{preferences:{language:null|string}}；POST仅{language}，可携X-Expected-User-Id绑定当前账户，仍校验同源和await后身份。匿名401，账户偏好不会包含邮箱。

POST /api/admin/users/<id>以布尔banned/muted更改限制。封禁删除目标全部会话和已关联账号的验证/恢复授权；解封不复活旧会话。错误密码仍返回invalid_credentials，不用封禁状态探测账号。禁言阻止主题/回复/删除和图片upload/retain/delete；头像、偏好、举报仍允许。公开联系/翻译/电费维持匿名额度，不能宣称账号限制可识别所有匿名操作。

POST /api/admin/reports/<id>仅接受status，状态open/reviewing/resolved/dismissed；与review_report审计同事务。GET /api/admin/audit按时间+ID游标最多50条，支持action筛选，不复制私密正文。用户限制由restrict_user审计记录。所有管理写请求在await body后重读角色并确认同一操作者。

测试M1迁移、旧会话、重启、慢请求期间撤权、跨账号偏好、限制写入口、举报与同时间戳日志翻页。不能只检查前端按钮。


## M3 内容编辑与翻译（2026-10-21）

当前M3/schema3（手机写作修正应用0.3.1）。完整契约和证据在源码docs/M3_CONTRACT.md、M3_COMPLETION.md。主楼/回复拥有content_version与edited_at；编辑必须携expectedVersion并在事务比较，409保留草稿；历史只给作者/管理员。旧plain原文继续按文本展示，不改旧语言或强制升级格式。新增迁移版本3，冻结旧步骤。

GET /api/content/{topic|post}/<id>/source读取可见原文，/history限作者管理员；POST /edit、/visibility要求原账号及posting权限，await body后重读会话；/translate为用户点击的公开内容接口，按ID取得原文、不接受任意私密字符串。/hidden-replies只有管理员读取当前主题的隐藏回复元数据，恢复仍POST visibility。隐藏主题/回复也封住引用、译文、图片、通知及计数，不做物理删除。

回复POST沿用/api/topics/<id>/replies，新增bodyFormat、expectedUserId、clientRequestId、attachmentIds、quotes。UUID回执保证同内容重试不重复；旧7列INSERT要用命名列。最多6段引用，每段1500字，校验同话题、当前版本、原文可见文本。引用保存源ID/版本，来源隐藏时摘录与作者被移除。图片增加post_id，forTopic不得混入回复图片，所有图片入口检查主题和回复双重可见性。

content-translation.mjs按内容版本/语言/规则缓存，供应商await后重查版本和可见性；Markdown共用markdown-core.js的AST，仅翻译文本节点，代码、链接地址、数值和引用块保留。占位符验证在translation.mjs底层缓存写入前运行，避免失败结果污染重试。独立IP/账号持久配额（UTC日）加原全局预算/2并发；失败也计已登记额度。GET列表和详情不再自动翻译用户帖子；人工UI公共端点限制保持。

运营公告通过publish-announcement.mjs --release-order创建顺序，order-release-note.mjs独立预检/--apply调整既有公告；必须已有有效管理员并审计。只在站务分类按100/110/120显示版本顺序，保留真实日期；公开发布载荷不能设置releaseOrder。不要倒填created_at来伪装补写V1.0。

## M4 通知与互动（2026-10-22）

migration4追加user_handles、community_events/notifications、content_mentions、topic_subscriptions、content_reactions、topic_bookmarks、topic_answers；旧user列/内容/账本不改。统一事件和内容创建/回复/编辑同事务；回执重试不重复hook，事件+接收者唯一，不通知自己。提及>引用>回复合并同事件，编辑只新加入的目标一次，旧内容不补发。seq自增作为新回复seen单调标记，避免同毫秒UUID顺序漏计，不依赖可被VACUUM改变的rowid。

GET /api/me/identity给公开稳定handle，GET /api/users/mentions?q=只搜索昵称/handle，绑定参数最多8，无邮箱；Markdown提及排除pre/code/blockquote和链接URL。GET /api/me/notifications支持unread=1与稳定cursor、可见未读总数；POST /read携ids或all与expectedUserId，只改本人当前可见通知。隐藏主题/回复会动态排除列表、计数和source，通知只存源ID，不复制正文。

GET/POST /api/topics/<id>/interaction|subscription|seen|bookmark|answer，四mode为watching/tracking/normal/muted：watching所有新回复，tracking话题新回复数+直接提醒，normal直接提醒，muted全部新通知静音。收藏仅本人GET /api/me/bookmarks，分页可见过滤。反应GET/POST /api/content/{kind}/{id}/reactions是like/thanks/helpful/null准确期望值，一账号一帖一个当前反应，不许self，重复切换同值不刷通知。最佳答案仅同话题可见回复、作者/管理员可选/换/取消；隐藏后有效答案空，恢复保留选择；solved在server筛选后才LIMIT250。

所有POST在await body后重新核对会话/expectedUserId与限制。禁言阻止公开反应/答案，允许自有订阅/收藏/已读；封禁无效会话仍不能写。完整契约docs/M4_CONTRACT.md，实际发布/权限/迁移/浏览器证据docs/M4_COMPLETION.md；不将本轮功能当M2或M5全量完成。

## M5 搜索、资料与目录

migration5新增community_categories/tags、user_profiles与community_search_fts及同步触发器；1–4冻结。FTS存当前原文（包含隐藏状态的记录），API每次JOIN主题/回复当前可见性后才分页，不能把索引本身当授权。索引无旧修订/邮箱/联系/机器译文。>=3字符词用trigram，1–2字符字面回退，q最多100字符6词，字面AND、参数绑定、30条分页和筛选指纹cursor。GET /api/search覆盖全库，不再依赖首页250篇；精确回复来源按ID权限检查。全文检索增加内容不扩大公开权限。

GET /api/me/profile与POST保存私人设置；公开页默认关闭，showActivity独立，公开API只白名单昵称/头像/handle/加入时间/自填简介地区HTTPS网站。关闭资料不删除公开帖子，公开活动排隐藏与seed；邮箱、收藏、通知和管理字段不公开。保存在await及事务中重验当前会话，禁言可管理私人资料，封禁不可写。

GET /api/directory含所有active和inactive，显示历史用全部，新选择只active。后台POST /api/admin/directory/categories|tags稳定ID不能重命名，不提供物理删除；保护site及最后普通分类。修改与update_category/update_tag审计同事务且重查admin。新发帖先规范化回执并匹配成功记录，再检查当前active；不能让目录停用破坏已成功发布的重试。

GET /api/admin/insights?days=7|30|90说明UTC半开区间及定义；可见非seed主题/回复、去重作者、有效答案/当前反应、待处理举报积压分开。没有访客/浏览量采集，不把作者数叫访问人数。静态指标定义保持五语人工字典，不能直接展示API英文来替代其他语言。
