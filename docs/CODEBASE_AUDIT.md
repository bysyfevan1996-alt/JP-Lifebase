# 社区代码与发布审计

日期：2026-10-21。范围：社区升级 M0，继续采用 Node.js 24 + 内置 HTTP/SQLite + 无构建静态前端。

## 实际基线

- 本轮 SSH 核实线上为 `/srv/jplifebase/releases/20261021T055009Z-denki-v4`，不是规划时记录的 sitemap release。
- Node.js 24.21.0；3 vCPU；内存约 1966 MiB，磁盘 99G；社区服务的 JS 堆 192 MiB、systemd 内存上限 384M。
- `jplifebase.service`、备份 timer 和 Cloudflare tunnel 检查为 active。
- 改动前 115 项 Node 隔离测试通过；首次受沙箱回环网络限制失败后，以允许本地端口连接的权限重跑通过。
- Git HEAD 为 `4ceac58dbf80b154a640e34517e40aa48e5e0cb2`，但大部分实际应用尚未纳入 Git，该提交不能代表完整上线版本。
- 已保存完整改动前源码包 `artifacts/m0/source-before-m0.tar.gz`，SHA-256：`b2de3a1c20fc6781ced72ef26b472d42666f505af0f6d08f1631e0c29cb52f0d`。包不含运行数据库、环境配置或密钥。

## 已有能力与证据

| 范围 | 状态 | 关键实现 |
| --- | --- | --- |
| 账号/邮箱验证/恢复/会话/头像 | COMPLETE（现有范围） | auth.mjs、mailer.mjs、avatar.mjs |
| 新主题 Markdown、预览、标签、图片、幂等发布 | COMPLETE（新主题范围） | topic-posting.mjs、topic-attachments.mjs、dist/composer* |
| 浏览器单草稿 | PARTIAL | dist/compose-drafts.js；每账号每浏览器，7天，无跨设备 |
| 回复/引用/编辑 | PARTIAL | server.mjs、dist/app.js；目前纯文本回复，无编辑历史 |
| 人工五套 UI 字典 | PARTIAL（目标策略尚待 M1） | dist/i18n.js、admin-i18n.js、composer-i18n.js、denki-i18n.js |
| 公开列表/搜索 | PARTIAL | 最多250主题/回复，客户端搜索，不是全库分页 |
| 管理 | PARTIAL | community-admin.mjs；权限、隐藏恢复、置顶、只读用户、收件箱 |
| 电脑/平板/手机独立布局 | COMPLETE（现有范围） | dist/responsive.css；真机软键盘、IME、读屏仍需验收 |
| 阅读进度/通知/私信/反应/收藏/最佳答案 | MISSING | 尚无对应完整数据模型；“我的消息”仅公开回复列表 |
| 分类标签后台/禁言封禁/举报处理 | MISSING | 本期不提前宣称完成，属于 M1/M5 |
| 稳定话题详情链接/原文 SEO | PARTIAL | 首页/工具 sitemap 已有，hash详情仍待 M2 |
| 电费比较 | COMPLETE（既有覆盖范围） | denki/；当前版本 2026-10-21.tokyo-v4，不因本期社区升级改价 |

## M0 处理

1. 将既有 schema 冻结为 schema.mjs 的版本1；migrations.mjs 记录名称、摘要、时间，检查未来版本/篡改/断档，失败原子回退。
2. 服务器统一执行迁移，运行时模块不再自行升级表；独立模块测试保留兼容初始化默认值。
3. HTTP DELETE 与运维 hide-topic 改成同一可恢复隐藏事务，保留原文、图片、回复、标签和幂等回执；管理员恢复。
4. 发布使用源码清单和校验，健康接口报告实际 release、源码摘要、schema 与电费版本。
5. 安装器先核验完整包，在真实备份副本上验证重复迁移和备份恢复，再用无邮件/翻译凭据的隔离服务预演。
6. 只有已声明兼容 schema 的代码才进入自动恢复候选；不自动覆盖正式数据库。

本报告不将未经复现的缺失功能标为 BROKEN，也不将历史测试或静态审查视为本轮线上验证。最终测试、真实副本和发布结论见 IMPLEMENTATION_PROGRESS.md。
