# Tokyo Gas / ENEOS / Octopus official tariff evidence

Checked 2026-10-20 JST. Scope: Tokyo electricity area, standard complete meter cycles, 10/15/20/30/40/50/60 A, integer monthly kWh, no optional bundle/loyalty/campaign/paper-bill discounts or charges. No user bill has yet been supplied for reconciliation. All amounts below include consumption tax.

## Ready to implement: Tokyo Gas 基本プラン

Historical definition, effective 2025-02-01 and applied from the March 2025 meter-reading bill:

- [Dated definition PDF](https://home.tokyo-gas.co.jp/information/qvk8cc0000000f5b-att/info_power_20241001_02.pdf), printed page 6 section 6.
- [Change notice](https://home.tokyo-gas.co.jp/information/power-202410-01.html), updated 2024-12-12, explicitly states March 2025 meter-reading application.

| A | Monthly base JPY |
| --- | ---: |
| 10 | 311.74 |
| 15 | 467.61 |
| 20 | 623.48 |
| 30 | 935.22 |
| 40 | 1246.96 |
| 50 | 1558.70 |
| 60 | 1870.44 |

Energy tiers: first 120 kWh 29.70 JPY/kWh; 120–300 kWh 35.69; above 300 kWh 39.50. Base is halved if monthly consumption is exactly zero. There is no positive minimum bill in this plan: if base + fuel-adjusted energy + applicable optional menus is negative, charge only renewable levy. Do not borrow the minimum fee from Tokyo Gas's separate さすてな電気 or 時間帯別プラン.

| Provider meter-reading bill month | Fuel before subsidy JPY/kWh | Subsidy JPY/kWh | Net adjustment JPY/kWh | Official dated source |
| --- | ---: | ---: | ---: | --- |
| 2025-09 | -7.50 | -2.40 | -9.90 | [2025-08-01 announcement](https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2509.pdf) |
| 2026-01 | -7.72 | 0 | -7.72 | [2025-12-01 announcement](https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2601.pdf) |

Important extraction defect: the 2026-01 PDF includes invisible leftover text about October's 2.0 subsidy. Rendering its actual visible page shows only -7.72 for Tokyo and no subsidy statement. The visible value was manually checked by rendering the downloaded official PDF. Do not parse the invisible leftover subsidy into the data. SHA256: `0759D2E928FC7AEBAB4032BD07F376B1CDA32BAA6608F7727F090B6C3BEC54F7`.

Historical general terms applicable from 2025-06-01:

- [Dated notice linking the historical terms](https://home.tokyo-gas.co.jp/information/power-202505-01.html).
- [Historical general terms PDF](https://home.tokyo-gas.co.jp/information/power-202505-01/pdf/info2505_yakkan.pdf). Printed page 7 section 3(4): final yen amount truncates fractions; renewable levy separately truncates to yen in appendix 2(3), printed page 32. Both pages were visually checked. SHA256: `F36965F9275739DB0AF85AB17A382D0E19C3756323686AE625E119E7D1FB420C`.
- [Official meter-cycle explanation](https://home.tokyo-gas.co.jp/gas_power/plan/power/calculation.html): one month is previous meter date through day before current meter date. New start/cancellation with less than 30 days can require base proration, subject to first-reading omission exception. Ordinary full cycles use the monthly base, regardless of whether calendar month has 28/30/31 days. Exclude starts/stops/contract changes from this initial exact monthly mode.

Standard undiscounted calculation: renewable = floor(kWh × levy); energy = tier sum + kWh × fuel before subsidy + kWh × subsidy; total = floor(max(0, base + energy) + renewable). Do not round each tier/fuel/subsidy to whole yen first. Optional Tokyo Gas gas bundle 0.5% and new-customer free base are excluded, not silently assumed.

## Ready to implement: ENEOS 東京Vプラン

[Historical ENEOS terms, 2025-03-03](https://www.eneos-power.co.jp/denki/contract/pdf/ene_clause_all_kanto_20250303.pdf), printed pages 17–18 section 16(5). The live [official V-plan page](https://www.eneos-power.co.jp/denki/plan/v/) corroborates these rates and says they apply through 2026-10-31.

| A | Monthly base JPY |
| --- | ---: |
| 10 | 311.75 |
| 15 | 467.63 |
| 20 | 623.50 |
| 30 | 935.25 |
| 40 | 1247.00 |
| 50 | 1558.75 |
| 60 | 1870.50 |

Energy tiers: first 120 kWh 29.80 JPY/kWh; 120–300 kWh 34.85; above 300 kWh 36.90. Monthly zero use halves base. No separate minimum is specified for 東京Vプラン. Do not borrow 東京5アンペア minimum or other regions' minimums.

| Provider bill month | Fuel before subsidy JPY/kWh | Subsidy JPY/kWh | Net adjustment JPY/kWh | Official PDF |
| --- | ---: | ---: | ---: | --- |
| 2025-09 | -7.50 | -2.40 | -9.90 | [September PDF, page 2 関東](https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2509.pdf) |
| 2026-01 | -7.72 | 0 | -7.72 | [January PDF, page 1 関東](https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2601.pdf) |

These PDF URLs are directly published by ENEOS official [fuel-cost page](https://www.eneos-power.co.jp/fuelcost-denki/). It populates links using its own `/wjcms/wjcms_fullpath.js` and public XML `https://eneospower-co.wjopen.jp/cmsdata/101_fuelcost_denki.xml`. Both PDF pages were downloaded and visually checked, not inferred from another provider. September SHA256 `78067C8D90152072162E7EDFF357C010772B79E629A03CA95285C1629482ED22`; January `7117DE4AF8719438EB3BA472B21A1BCF03EA21FC52C044DE6BF431EB65E605AB`.

Rounding: historical terms printed page 6 section 4(6) final yen truncation; energy-charge calculation rounds at third decimal to two decimals. Integer kWh with cent rates makes this intermediate rounding a no-op. Renewable levy has its own whole-yen truncation (appendix 1(3), printed page 55). Fuel applies to the relevant month's metering period, not consumption calendar-month buckets (appendix 2). Initial mode should require a standard full metering cycle and exact provider bill month.

Exclude にねんとく²割 (-0.20 first two years, -0.30 afterwards), payment-card benefits, points, gas bundle, intro campaign, paper charges. They require explicit contract eligibility/date choices and can be added later. No zero clamp was independently established for the entire ENEOS general plan, but input-supported historical months have positive effective energy rates so it cannot matter in this two-month dataset.

## Octopus: keep pending rather than rank with a 30-day assumption

Historical finding as of V2. Superseded for Green 2025-05 / 2026-04 Tokyo,
May–October 2026, by `research-octopus-202610.md` and V5's explicit actual-day
model. Other vintages and unverified months still must not borrow those prices.

The official [terms directory](https://octopusenergy.co.jp/terms) publishes [グリーンオクトパス 2025-05（東京電力エリア）definition](https://a.storyblok.com/f/122730/x/a9f2a9f355/_greenoctopus-2025-05-tokyo.pdf), effective 2025-05-14.

Section 6 explicitly requires actual metering-cycle day count, not a calendar month and not a fixed 30-day proxy. Base per day for 10/15/20/30/40/50/60 A = 9.70/14.55/19.40/29.10/38.80/48.50/58.20 JPY. Zero-use base half. Energy tiers at 120/300 kWh = 18.98/24.10/27.44. Fuel baseline is 44,200, which differs from Tokyo Gas/ENEOS; copying their fuel adjustment is invalid. This tariff is a named vintage, not an unspecified generic Green plan.

Missing for exact historical rankings: confirmed official fuel adjustment PDFs for those two months; historical general rounding rules; explicit actual start/end meter dates/day-count input; plan vintage selection. Mark `pending_rules` with reason and official terms link. Do not show a fictional price or apply current 2026-10 tariff retrospectively.
