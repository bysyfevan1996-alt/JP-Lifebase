# Tokyo-area standard plans, May–October 2026

Checked 2026-10-20 JST. Read-only research apart from this note. Scope expanded from September to the six current eligible provider bill months, inclusive of October 2026. These are provider `料金月` / meter-reading bill months, not calendar consumption months. Rates include tax. Do not use these figures for daily prorated starts/stops, changes during a period, optional discounts, point rewards, paper-bill fees, time-of-use or market-linked plans.

## Confirmed monthly adjustment values

Each provider was verified independently from its own official sources. Values happen to match; no provider was inferred from another.

| Bill month | Gross fuel JPY/kWh | Government support, deducted JPY/kWh | Published net fuel JPY/kWh | Renewable JPY/kWh |
| --- | ---: | ---: | ---: | ---: |
| 2026-05 | -7.37 | 0 | -7.37 | 4.18 |
| 2026-06 | -7.30 | 0 | -7.30 | 4.18 |
| 2026-07 | -7.19 | 0 | -7.19 | 4.18 |
| 2026-08 | -6.77 | 3.50 | -10.27 | 4.18 |
| 2026-09 | -6.46 | 4.50 | -10.96 | 4.18 |
| 2026-10 | -5.80 | 3.50 | -9.30 | 4.18 |

The table applies to TEPCO 従量電灯B, Tokyo Gas 基本プラン, and ENEOS 東京Vプラン. The published net already includes subsidy: either multiply by net, or separately use gross minus subsidy; never subtract the subsidy twice. Renewable 4.18 for May 2026–April 2027 is directly stated in TEPCO's May announcement below, not inferred from its 260-kWh rounded model amount.

All downloaded documents are available locally in the temporary directory `C:/Users/byeva/AppData/Local/Temp/jplb-sep2026-rates/`, with descriptive names below, for the parent to archive into its new immutable dataset release. No implementation/data files or existing archived sources were changed by this agent.

## TEPCO 従量電灯B

Official [historical low-voltage table](https://www.tepco.co.jp/ep/private/fuelcost2/newlist/index-j.html), lines in the current page under `燃料費調整単価（低圧）`, shows all six net values and footnote 1 shows the subsidy months/rates. The same page expressly applies the April 2026 supply terms for April–October 2026. The [terms directory](https://www.tepco.co.jp/ep/company2/agreement03.html) also identifies the April 1 terms as valid through October 31, before the new November terms.

Official individual monthly PDFs (first page contains the residential low-voltage table and official model; second page identifies the model assumptions). All six were downloaded and parsed; same official historical table independently corroborates their numbers.

| Month | Published date | Official PDF | SHA256 |
| --- | --- | --- | --- |
| 2026-05 | 2026-03-27 | https://www.tepco.co.jp/ep/notice/pressrelease/2026/pdf/260327j0101.pdf | `50365fecfbcf977a6c36f74383a4ba85dd5540046c7adb56dc46365449d09652` |
| 2026-06 | 2026-04-28 | https://www.tepco.co.jp/ep/notice/pressrelease/2026/pdf/260428j0101.pdf | `b66c4470f396b976099b37d2b74a88e990c501359173da1188a53cfef7b140a8` |
| 2026-07 | 2026-05-28 | https://www.tepco.co.jp/ep/notice/pressrelease/2026/pdf/260528j0101.pdf | `54614afe7c233c8112c9f04666775be96005459b481a0a467867fe0bd0fc383b` |
| 2026-08 | 2026-06-26 | https://www.tepco.co.jp/ep/notice/pressrelease/2026/pdf/260626j0201.pdf | `19581d9f60f862bb14e2b9b1a227515269b4771629c26c18f5e0e209d458c508` |
| 2026-09 | 2026-07-30 | https://www.tepco.co.jp/ep/notice/pressrelease/2026/pdf/260730j0101.pdf | `6d2d682d97edc485ee0655de45afb6958c083e1ea142d10ecd3e74261827b6e1` |
| 2026-10 | 2026-08-28 | https://www.tepco.co.jp/ep/notice/pressrelease/2026/pdf/260828j0601.pdf | `4c26b6f5b305e7405f790adcb23eebebde5159cac1aca2e863909ae6ae5498ad` |

TEPCO's official 30A / 260-kWh standard monthly totals, including renewable and government support, from those six announcements: May **8,777**, June **8,795**, July **8,823**, August **8,023**, September **7,843**, October **8,275** JPY. October was also visually checked in the original PDF; its gross/net fuel and 8,275-yen model agree with the independent recomputation.

April 2026 terms confirm unchanged base/tier/rounding rules:

- [Tariff chapter](https://www.tepco.co.jp/ep/company2/agreement/pdf/20260401kyoukyu003-j.pdf), file pp. 6–7 / printed pp. 12–13: 10/15/20/30/40/50/60 A bases 311.75 / 467.63 / 623.50 / 935.25 / 1247.00 / 1558.75 / 1870.50; tiers through 120, through 300, over 300 are 29.80 / 36.40 / 40.49; zero use halves base, minimum monthly base plus fuel-adjusted energy 328.08 applies. SHA256 `74767e23bfe67330a3bf13a71c83da177003bcb47e6f4aaa16c2f16ae6684bd7`.
- [Rounding chapter](https://www.tepco.co.jp/ep/company2/agreement/pdf/20260401kyoukyu001-j.pdf), file p. 3, section 4: integer kWh rounded half-up, final bill truncates yen. SHA256 `bcdb3d5f55b3f14e4029a20ddedd00271ac164e42f3cb4b9b78ab0d2e3178bcb`.
- [Appendices](https://www.tepco.co.jp/ep/company2/agreement/pdf/20260401kyoukyu009-j.pdf), file p. 1 / printed p. 57, appendix 1(3): renewable amount separately truncates yen. SHA256 `f1bb4fc32d0658171d6092f32dd12236160a89bd3a8591568d041266479acdd7`.
- [Government-support special terms, July 2026](https://www.tepco.co.jp/ep/company2/agreement/pdf/20260701kyoukyu010-j.pdf): SHA256 `226bbac5638aa4dc8e231a663705fd744dd05fb277ef1b0a5381d2a59fd6fc32`.

## Tokyo Gas 基本プラン

Official [price and adjustment page](https://home.tokyo-gas.co.jp/gas_power/plan/power/price.html) publishes the monthly PDF series below. Each PDF is one page; Tokyo electricity area is the first row. All six visible tables were rendered and reviewed. Published dates are printed within the documents. The PDFs for May, June and July contain invisible leftover blank subsidy boilerplate in the text stream; it is not visible and contains no amount. Do not interpret that as an actual subsidy. Their visible official pages contain no subsidy.

| Month | Published date | Official PDF | SHA256 |
| --- | --- | --- | --- |
| 2026-05 | 2026-04-01 | https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2605.pdf | `ed38bfdf1952f392a3a1457585cebad09cbe1fce6c551a7746ca98f526545036` |
| 2026-06 | 2026-05-07 | https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2606.pdf | `ac029b1bdb88bc1e1a0a21ef19b24be7e1d29ef2804848bbe076646a95b3cbd2` |
| 2026-07 | 2026-06-01 | https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2607.pdf | `70b17d10a3fc9d0d8af448dca8d30c4ce88fe2fce4a16f01d369c4245b198b52` |
| 2026-08 | 2026-07-01 | https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2608.pdf | `c6cd145538bed786c454ceed30504bbc43302645e3e303c69e45552b46a535c9` |
| 2026-09 | 2026-08-03 | https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2609.pdf | `38d959f9924feb94989555e2581b9b92b59f6136dac0a4690c442b88eaf1357e` |
| 2026-10 | 2026-09-01 | https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2610.pdf | `ebdb386c192f1104a0e06a0f63ef11eb3d0d305cf269955eb5f1cf32fe13db0c` |

Base/tier amounts are unchanged from the dated February 2025 definition recorded in `research-other.md`. To document the complete historical window, use that definition and the June 2025 general terms for May–September, plus the new October documents and change notice for October:

- [October change notice, dated 2026-04-27](https://home.tokyo-gas.co.jp/information/power-202604-01.html): chiefly November paper-invoice fee and gas-bundle conditions, October cancellation clause; no residential basic/energy rate change. New December 2026 price revision is outside this six-month window.
- [October 1, 2026 basic definition](https://home.tokyo-gas.co.jp/gas_power/plan/power/d1c6tj00000018fm-att/denki_basic.pdf), file p. 6 section 6: 10/15/20/30/40/50/60 A 311.74 / 467.61 / 623.48 / 935.22 / 1246.96 / 1558.70 / 1870.44; tiers 29.70 / 35.69 / 39.50 at 120/300 kWh; zero-use half base; renewable-only clamp if base+fuel-adjusted energy+applicable options negative. SHA256 `b2a274e66338f83089e82640505fbd5f86f780ace2f7a4b7d81f535e1a4fdb1e`.
- [October 1, 2026 general terms](https://home.tokyo-gas.co.jp/gas_power/plan/power/d1c6tj00000018fm-att/jukyuu_yakkan.pdf), file p. 7 section 3(4) final yen truncation; p. 32 appendix 2(3) renewable amount separately truncates yen. SHA256 `f9b75ba514949d96b98fb38ec6ec96237bbef8e336a126fc390707c9b6ef59fc`.

Optional gas bundle, free-base campaign, points, payment and paper fees remain excluded. Ordinary full meter cycles use the monthly base, not days/30. A new account or contract change can require proration and stays unsupported.

## ENEOS 東京Vプラン

Official [fuel adjustment directory](https://www.eneos-power.co.jp/fuelcost-denki/) publishes these direct official hosting PDFs via its public CMS XML `https://eneospower-co.wjopen.jp/cmsdata/101_fuelcost_denki.xml`. XML was fetched successfully and explicitly has 2026 and each of the six PDF links; URLs were not merely guessed. All six visible tables were rendered and reviewed. The PDFs label the month but do not print a separate exact publication date, so leave `publishedAt` unknown unless separately established.

| Month | File page with Kanto table | Official PDF | SHA256 |
| --- | ---: | --- | --- |
| 2026-05 | 1 | https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2605.pdf | `40417d6833da7447ae4fadfb12dc6765dbf17c0e7816ad343665e4db310f9acf` |
| 2026-06 | 1 | https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2606.pdf | `7c015d128185dda2a8a8da95eb7fbffc247597e5b91f5271e935eb68a7e5af3a` |
| 2026-07 | 1 | https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2607.pdf | `e32490b6e71f6e29e1041df808a10a7102869057bf1e1c415cc86cd11b12f5f2` |
| 2026-08 | 2 | https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2608.pdf | `658414ab602fb7d4044204381930ebbffa2896463123a4be7f61713e8c7b5322` |
| 2026-09 | 2 | https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2609.pdf | `521e4a210eb95b27ff6fd4cc5e145da3268ad7224c01e0e8c26275ae25b64ca4` |
| 2026-10 | 2 | https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2610.pdf | `1be460e4b8ec4bca045f0c9a9d91dd43fcead60322532db5f743035d2c9f7059` |

Use the newer [September 1, 2025 Kanto terms](https://www.eneos-power.co.jp/denki/contract/pdf/ene_clause_all_kanto_20250901.pdf), rather than relying solely on the March 2025 copy. The [official terms directory](https://www.eneos-power.co.jp/denki/contract/clause.html) lists this as the current Kanto version before the November 2026 replacement. SHA256 `4c9b380df969e091bbb07b3ee2e4513a33c348ddd541da3cb58f01581dcc2fef`.

- File pp. 24–25 / printed pp. 19–20 section 16(5): base 311.75 / 467.63 / 623.50 / 935.25 / 1247.00 / 1558.75 / 1870.50 for 10/15/20/30/40/50/60 A; tiers 29.80 / 34.85 / 36.90 at 120/300 kWh. Zero-use half base; no separate positive minimum for this plan.
- File p. 12 / printed p. 7 section 4(6): final yen truncation, energy-charge calculation rounded at third decimal to two decimals. Integer kWh and cent unit rates make intermediate rounding a no-op.
- File p. 66 / printed p. 61 appendix 1(3): renewable amount separately truncates yen.
- [Official V-plan page](https://www.eneos-power.co.jp/denki/plan/v/) expressly says displayed current rates apply through October 31, 2026 and change from November 1.

Exclude にねんとく²割, bundle discounts, point/card benefits, campaigns and invoice fees. No personal eligibility or contract-age discount has been assumed.

## September full-cycle comparison cross-check at 60A / 303 kWh

These are independent example calculations from the verified standard tariffs, rather than a supplier-bill reconciliation:

```
renewable = floor(303 * 4.18) = 1266
net adjustment = 303 * -10.96 = -3320.88
TEPCO: floor(1870.50 + 120*29.80 + 180*36.40 + 3*40.49 - 3320.88 + 1266) = 10065
Tokyo Gas: floor(1870.44 + 120*29.70 + 180*35.69 + 3*39.50 - 3320.88 + 1266) = 9922
ENEOS: floor(1870.50 + 120*29.80 + 180*34.85 + 3*36.90 - 3320.88 + 1266) = 9775
```

