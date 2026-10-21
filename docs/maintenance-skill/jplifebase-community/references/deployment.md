# 发布与运维

仅在当前任务或仍有效授权涵盖上线时执行。先读源码 `ops/README.md` 和 `docs/IMPLEMENTATION_PROGRESS.md`。连接沿用 [VPS skill](C:/Users/byeva/.codex/skills/whyfshenlab-vps/SKILL.md) 及已核实 SSH 包装器，不跳过主机密钥校验。

## 位置与隔离

- 服务 jplifebase.service，用户 jplifebase，回环127.0.0.1:8797。
- /srv/jplifebase/current 指向不可变 release；数据库 /var/lib/jplifebase/community.sqlite，WAL。
- 私有配置 /etc/jplifebase/app.env，保留 AUTH_TOKEN_SECRET、邮件和翻译凭据，不输出或打包。
- Node /opt/whyfshenlab/node/bin/node；JS堆192MiB、服务MemoryMax384M。
- 在线备份 /var/backups/jplifebase，14份；timer每天日本时间03:30加抖动。
- SSH包装器 D:/2.Work/1.T/vps-migration/remote.ps1，现有Cloudflare tunnel/DNS不随普通发布改变。
- www 主站、apex电费工具；保持同机其他服务。不使用Sites发布，不运行初始route-vps.py。

2026-10-21 M0起使用以下发布约定，旧手工tar清单和“只检查电费catalog即回滚”已不适用。

## 本地验证与打包

在源码根目录运行：

```powershell
node --test tests/*.test.mjs
# 使用实际可用Python运行，不依赖Windows应用商店占位命令
python -B tests/installer_test.py
node ops/build-release.mjs <YYYYMMDDTHHMMSSZ-label>
# 对刚生成的 artifacts/releases/<id> 整体打包，保留 release-manifest.json
```

打包器按白名单复制根模块、dist、denki、ops、包元数据，生成逐文件SHA256和总体摘要。私密数据、环境文件、数据库、密钥和测试产物不入包。不得修改已生成发布目录复用同一ID；修改后生成新ID。前端本期有变化时先执行资产版本更新再打包；纯服务端变更无需改静态版本。

用现有包装器上传压缩包和对应 ops/install-vps.py，再在VPS运行该安装器。安装器需要已存在的本项目配置/数据库，不从其他应用借用密钥，不初始化DNS或系统服务。

## 安装器门槛

1. 核验清单、必需模块、每个文件SHA256；拒绝不安全路径、符号链接、额外或缺失文件。
2. 正式服务仍运行时做在线备份。由service用户在私有目录验证副本：原记录列/行摘要不变、连续迁移两次、完整性/外键、再次备份并恢复。
3. 私有随机回环端口预演候选服务，不传邮件和翻译配置。校验release/source/schema、公开读取、匿名session/admin边界和电费catalog。
4. 通过才切换链接并重启本服务。重启失败和健康失败均走同一恢复规则：仅清单声明同schema版本的已知release可以自动恢复。未知旧版不自动回切，优先前向修复。任何代码恢复都不覆盖数据库。
5. 发布后再次备份；结果报告含实际release、摘要、schema及私有验证记录位置。

生产启动也会核验实际源码清单；/api/health报告version、releaseId、sourceSha256、schemaVersion、datasetVersion。translationConfigured仅表示配置非空，不代表供应商可达。

## 备份和恢复

ops/backup.mjs 使用SQLite在线backup、quick_check和foreign_key_check，再写.sha256校验文件；验证成功才轮替14份。JPL_DB/JPL_BACKUP_DIR仅在明确隔离测试时覆盖，生产保持默认。

数据库恢复和代码恢复不同。确需恢复数据时停止本服务、保留当前库及WAL/SHM、验证备份、设置属主、启动并验证；不以旧备份覆盖新帖子作为自动代码回滚。本轮副本预演不是生产数据恢复演练。

图片在topic_attachments BLOB内，备份含字节、归属和顺序；恢复服务必须支持图片路由和Markdown。旧版也可能缺邮箱字段命名INSERT、图片或提交回执，不因能读电费就视为兼容。

## 发布后

核实公网首页/电费/健康、sitemap、匿名admin API 401、私有路径不可读、服务和备份timer。不要为验收在生产制造测试账号或帖子；权限、发布/隐藏/恢复、图片和邮件回归在隔离数据做。设备检查与未验收事项如实记录。

管理员原账号/邮箱转发沿用现有配置，不能按历史邮箱记录给新账号升权。域名Email Routing不等于联系表单邮件投递；联系仍只入库。Resend凭据、授权令牌秘密和私人内容不进入日志或skill。

M0实际发布：20261021T061748Z-m0，应用0.1.1/schema1，162文件源码SHA256为5fff6e46351764df621b97100eb275bccd658f714790965cbe44097bf90c6a18。124项Node+4项Python检查通过；真实副本17原表全部保留，发布后18表仅增加迁移账本。历史计数不代表未来任务已重跑。

## M1发布与仓库

V1.1阅读体验已发布20261021T110720Z-reading-v11，应用0.2.1/schema2，193文件源码摘要d5c241b84cf2b66669ee3b10eb5bb593066b3d441eb7eda2b3b1a62674223543，电费仍v5。176项应用测试、4项安装器和五语检查通过，19表真实副本重复迁移无变更、恢复通过。公告及最终公网/Git证据查项目docs/V1.1_READING.md；历史结果不代表下一轮重跑。

已发布20261021T102336Z-m1，应用0.2.0/schema2，188文件源码摘要91c00192c808c8d091d352f36d00c6a5d0d6d70f7d347c2b5d18642626351c07，电费保持2026-10-21.tokyo-v5。172项Node+4项Python及五语字典检查通过；真实副本18原表业务数据/账本前缀保留，发布后19表恢复验证通过。历史次数不代表后续重跑。公网从本机检查通过；VPS出站403时不要为验收放宽Cloudflare规则。

Schema版本2新增语言偏好和管理限制；M0/schema1代码不能直接回滚到schema2库。verify-migration对旧业务列摘要保持一致，旧迁移账本前缀完全不变，允许追加新版本；恢复副本验证迁移后全库。发布清单须包含migration-v2.mjs、community-policy.mjs、audit-cursor.mjs与新的前端偏好模块，使用build-release生成避免遗漏。

GitHub只提交源码、公开资费证据、测试和维护记录。CI检查不等于自动部署，不上传生产配置；远程历史保留，禁止强推。实际M1版本和验证结果查项目docs/M1_COMPLETION.md及IMPLEMENTATION_PROGRESS.md。


## V1.1 阅读导航修正与吸顶标题

2026-10-21完整修正版已发布20261021T114835Z-reading-header，应用0.2.3/schema2，196文件，sourceSha256 3acd04c48d737c329253ba9c0d929bece5f6b2d352a908573d2d0cbcaba247d0，电费仍v5。181项Node、4项Python、五语检查通过；19表副本重复迁移/恢复通过，发布后18张业务表摘要与发布前相同，14份备份校验正常。两端吸顶标题和灰色导航规则见frontend.md，完整证据见项目docs/READING_POLISH.md。历史结果不代表后续任务已重跑。


## M3 与手机全屏回复

M3首次上线20261021T123822Z-m3（0.3.0/schema3，209文件），202项Node/4项Python通过，真实翻译成功；V1.0补记与V1.2公告均已发布，站务顺序100/110/120，V1.1日期正文保持。完整证据查项目docs/M3_COMPLETION.md。

手机写作修正版20261021T130104Z-mobile-writing（0.3.1/schema3，212文件），源码摘要926ed5956b239f0c3fdcf698eb539732c69d58e6936d48ffa8f033953b5a0b68。206项Node、4项Python和五语检查通过；schema3不新增迁移，电费v5不变。全屏编辑器与键盘适配规则见frontend.md和项目docs/MOBILE_REPLY_WRITING.md。历史测试数不是后续已重跑证据；schema2旧发布不能直接回切。

该手机修正版真实副本24表不变，连续迁移均无新增，账本前缀及恢复通过；发布后14份备份校验/完整性/外键通过，24表与发布前完全一致。两个域名与既有服务均检查正常。
