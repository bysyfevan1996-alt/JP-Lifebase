# 东京套餐扩充核验（2026-10-21）

第二步按用户调整后的顺序先增加东京套餐，原计划 P1 自动获取后置。本批接入两个同类住宅安培阶梯套餐：idemitsuでんき Sプラン（东京安培合同）与 CDエナジー ベーシックでんきB。仅普通完整检针周期、整数 1–10,000kWh、现有 10/15/20/30/40/50/60A；不包含 5A、kVA、零用电、日割、EV 或市场联动模型。人工核验，无新增自动抓取任务。

## 来源及归档

20 份新官方来源（18 PDF、2 HTML）原件位于 `evidence/2026-10-21.tokyo-v4/`，索引记录下载时间、URL、文件长度和 SHA-256。公开来源元信息在 `tokyo-expansion-sources.json`。带查询参数的 CD 9 月 PDF 按原 URL 归档；本批归档没有依赖旧脚本的 URL 后缀筛选。旧 V2 证据保持原位，V4 用 `evidenceVersions` 指向它；旧 V3 模型冻结为 `data-v3.mjs`，原始 JSON 基线另存于测试夹具。

数值表及约款相关页已渲染后检查，月度 PDF 只读取东京／低压住宅列。CD 公告中的现货市场文字同时涉及高压表，不能给本次低压住宅另加市场调整。补贴后的净燃调不能再次扣补贴。

## idemitsu Sプラン

[东京 Sプラン要纲](https://denki.idemitsu.com/docs/kanto_spplan.pdf)为 2025-07-22 实施版，官网[约款索引](https://denki.idemitsu.com/terms/list.html)列为 2026-10-31 前适用。PDF p3–5 确认东京、合同条件及含税价格：

| 契约 | 10A | 15A | 20A | 30A | 40A | 50A | 60A |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 月基本费（円） | 311.75 | 467.63 | 623.50 | 935.25 | 1247.00 | 1558.75 | 1870.50 |

阶梯为最初 120kWh 29.80、120 超至 300kWh 34.76、300 超 37.10 円/kWh。无 TEPCO 328.08 最低月费条款，不能借用。零使用半基本费虽在约款中存在，公共工具仍不开放 0kWh。

[东京需给约款](https://denki.idemitsu.com/docs/kanto_yakkan.pdf)现为 2026-07-17 版。p7–8 规定账单合计整円截断，p40 规定再生能源费单独整円截断，p15 确认前次至本次检针的账期。[7 月修订公告及新旧对照](https://denki.idemitsu.com/media/wp-content/uploads/2026/07/20260714_terms-change.pdf)只修订第22项支付方式，没有改本批涉及的费率、燃调或取整条款。因此可结合持续适用的 2025 Sプラン要纲及每月独立公告验证 5–7 月；没有把现行约款标记成当时下载过的旧原件。

供应范围为约款列明的东京电力管内，离岛例外保留；不代表任何地址一定能切换。车用特惠、EV／绿电选项、积分和签约活动不计入。当前申请仍以官网和供应商确认的合同为准。[重要事项说明](https://denki.idemitsu.com/docs/idemitsudenki_important.pdf)已与 10 月前的文档一同归档。

## CD ベーシックでんきB

[2026-01-01 个别要纲](https://www.cdedirect.co.jp/assets/pdf/agreement/denki/denki_youkou_basicB_202601.pdf) p3–4 确认 10–60A 七档、含税基本费及阶梯：

| 契约 | 10A | 15A | 20A | 30A | 40A | 50A | 60A |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 月基本费（円） | 276.90 | 415.35 | 553.80 | 830.70 | 1107.60 | 1384.50 | 1661.40 |

阶梯为最初 120kWh 29.90、120 超至 300kWh 35.59、300 超 36.50 円/kWh。可选燃气组合折扣 0.5% 不计入；不把积分当电费折扣。没有另加 TEPCO 最低料金。[低压基本要纲](https://www.cdedirect.co.jp/assets/pdf/agreement/denki/denki_youkou_kihon_low_202601.pdf)规定合计整円截断；个别要纲规定再生能源费独立截断。

[官方供电区域](https://www.cdedirect.co.jp/area/denki/)为东京电力 PG 网区，明确排除离岛与整栋统一受电公寓。10–60A 的 B 合同与 kVA 的 C 合同分开，本次只接 B。

[官方账期和计算说明](https://www.cdedirect.co.jp/agreement/denki/)区分前月计量日至当月计量日前一天与翌月第三营业日请款，不能按支付月选燃调。该页独立算例为 30A／320kWh、净燃调 -9.14、再生能源 4.18，合计 **9,967 円**。测试使用它验证公式，但不把该演示单价绑定为一个未经确认的月份。

两家公司都已公布未来改价。本批只确认 2026-05 至 2026-10，规则的已验证月份及结束月均止于 10 月；不把未来价格回填，也不自动开放 11 月。

## 各月燃调与补贴（円/kWh）

下面相同的值来自两家公司各自公告的独立核验，不根据一家推断另一家。

| 检针／料金月 | 燃调原额 | 支援 | 净燃调 | idemitsu 原件 | CD 原件 |
| --- | ---: | ---: | ---: | --- | --- |
| 2026-05 | -7.37 | 0.00 | -7.37 | [5月](https://denki.idemitsu.com/media/wp-content/uploads/2026/03/202605nencho.pdf) | [5月](https://www.cdedirect.co.jp/assets/pdf/agreement/denki/nencho_202605.pdf) |
| 2026-06 | -7.30 | 0.00 | -7.30 | [6月](https://denki.idemitsu.com/media/wp-content/uploads/2026/05/202606nencho.pdf) | [6月](https://www.cdedirect.co.jp/assets/pdf/agreement/denki/nencho_202606.pdf) |
| 2026-07 | -7.19 | 0.00 | -7.19 | [7月](https://denki.idemitsu.com/media/wp-content/uploads/2026/06/202607nencho.pdf) | [7月](https://www.cdedirect.co.jp/assets/pdf/agreement/denki/nencho_202607.pdf) |
| 2026-08 | -6.77 | 3.50 | -10.27 | [8月](https://denki.idemitsu.com/media/wp-content/uploads/2026/06/202608nencho.pdf) | [8月](https://www.cdedirect.co.jp/assets/pdf/agreement/denki/nencho_202608.pdf) |
| 2026-09 | -6.46 | 4.50 | -10.96 | [9月](https://denki.idemitsu.com/media/wp-content/uploads/2026/07/202609nencho.pdf) | [9月](https://www.cdedirect.co.jp/assets/pdf/agreement/denki/nencho_202609.pdf?2026-09-01=) |
| 2026-10 | -5.80 | 3.50 | -9.30 | [10月](https://denki.idemitsu.com/media/wp-content/uploads/2026/08/202610nencho.pdf) | [10月](https://www.cdedirect.co.jp/assets/pdf/agreement/denki/nencho_202610.pdf) |

六个月再生能源费均为 4.18 円/kWh，使用原有[经济产业省年度公告](https://www.meti.go.jp/press/2025/03/20260319004/20260319004.html)（`renewable-2026`）及本次两家约款与 CD 独立算例相互核对。

## 独立手算固定样本

不使用待测引擎生成期望值。2026-10、30A、260kWh：再生能源费 floor(260×4.18)=1086 円。

- idemitsu：floor(935.25 + 120×29.80 + 140×34.76 − 260×5.80 − 260×3.50) + 1086 = **8045**。
- CD：floor(830.70 + 120×29.90 + 140×35.59 − 260×5.80 − 260×3.50) + 1086 = **8069**。

| 月份 | idemitsu（30A／260kWh） | CD（30A／260kWh） |
| --- | ---: | ---: |
| 2026-05 | 8547 | 8571 |
| 2026-06 | 8565 | 8589 |
| 2026-07 | 8594 | 8617 |
| 2026-08 | 7793 | 7817 |
| 2026-09 | 7614 | 7637 |
| 2026-10 | 8045 | 8069 |

额外边界：10A／1kWh、10 月 CD 为 floor(276.90+29.90−9.30)+floor(4.18)=301 円。须测试 120／121、300／301，补贴仅扣一次、新基准套餐比较、5A/kVA/0kWh 拒绝、缺失月份排除、旧四套餐费用与来源不变、旧 V1/V2/V3 快照保存，以及两种界面布局。
