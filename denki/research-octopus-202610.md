# Octopus Tokyo: actual-day base and dated Green vintages

Verified 2026-10-21 JST. New immutable dataset: `2026-10-21.tokyo-v5`.
V4 remains frozen in `data-v4.mjs` and its exact JSON fixture. No monthly
automation is enabled by this change.

## Official evidence and scope

The [official terms directory](https://octopusenergy.co.jp/terms) was downloaded
successfully with a direct HTTP client (the search reader returned 403).
Its dated copy and PDFs are under `evidence/2026-10-21.tokyo-v5/`; `index.json`
records original URLs, exact byte counts and SHA-256. The source manifest in
`octopus.mjs` uses those fixed hashes. PDFs with damaged text extraction were
rendered and visually checked, including general terms pages 7, 12, 13 and 35;
plan pages 6–7 and fuel applicability page 12; all six monthly fuel tables;
support definition page 6 and the levy notice. These visible tables take
precedence over the corrupted pypdf text layer.

- [General terms, effective 2025-03-17](https://a.storyblok.com/f/122730/x/bb974dfd6c/_250317.pdf):
  section 3(2), page 7 truncates the final combined amount to whole yen;
  section 14, page 12 defines a normal billing cycle from the preceding
  meter-reading date through the day before the current reading; section 16,
  page 13 combines base, fuel-adjusted energy and renewable levy; appendix 1(3),
  page 35 separately truncates renewable levy to whole yen.
- [Green 2025-05 Tokyo](https://a.storyblok.com/f/122730/x/a9f2a9f355/_greenoctopus-2025-05-tokyo.pdf),
  effective 2025-05-14. Section 6, pages 6–7 explicitly multiplies daily base
  by the actual cycle's days. Monthly tiers are not adjusted for the number of
  days in an ordinary full cycle. Section 6(3) floors a negative **combined
  total including levy** at zero; do not borrow TEPCO's minimum charge or clamp
  only the non-levy subtotal. Zero-use base is halved, but public zero-use input
  remains outside scope.
- [Green 2026-04 Tokyo](https://a.storyblok.com/f/122730/x/e2541792da/_greenoctopus-2026-04-tokyo.pdf),
  effective 2026-04-28, same day-based model with different energy rates.
- [Green 2026-10 Tokyo](https://a.storyblok.com/f/122730/x/5ebddf63fa/_greenoctopus-2026-10-tokyo.pdf),
  effective 2026-10-01, has **different** base and energy prices. Its launch-month
  full-cycle eligibility is not verified by this release. It remains a separately
  named pending offer with an explicit explanation; no older prices are used.
  Its published daily bases are 12.30/18.45/24.60/36.90/49.20/61.50/73.80,
  tiers 19.95/25.15/28.54. These are research only, not calculation data.
- The directory's 2026-10-06 notice announces a revision from the first meter
  reading on/after 2026-12-01. The linked comparison PDF is archived for scope
  review only. It is not applied to May–October data.

The two implemented offers refer to existing contracts of those exact vintages.
Their historical comparability is not a claim that they accept new customers.
Starts, cancellations, mid-cycle plan/capacity changes, fractional kWh, kVA,
Simple Octopus, 2026-10-L, All Denka, EV and other Green vintages are excluded.
User confirmation of a normal full cycle and contract-version selection remains
necessary. No personal bill was used as a public fixture.

## Static prices, including tax

| Amps | Daily base, both implemented vintages (JPY/day) |
| --- | ---: |
| 10 | 9.70 |
| 15 | 14.55 |
| 20 | 19.40 |
| 30 | 29.10 |
| 40 | 38.80 |
| 50 | 48.50 |
| 60 | 58.20 |

| Monthly energy band | Green 2025-05 JPY/kWh | Green 2026-04 JPY/kWh |
| --- | ---: | ---: |
| First 120 kWh | 18.98 | 19.27 |
| Over 120, through 300 kWh | 24.10 | 24.47 |
| Over 300 kWh | 27.44 | 27.86 |

## Each month independently checked

The directory explicitly says the monthly fuel notices **exclude** government
support. Support is separately deducted from the electricity total. Do not use
Tokyo Gas/ENEOS fuel rates: Octopus's fuel baseline is 44,200 JPY/kl.

| Rate / meter-reading month | Gross fuel | Support to deduct | Net fuel | Levy |
| --- | ---: | ---: | ---: | ---: |
| 2026-05 | 2.76 | 0.00 | 2.76 | 4.18 |
| 2026-06 | 2.83 | 0.00 | 2.83 | 4.18 |
| 2026-07 | 3.18 | 0.00 | 3.18 | 4.18 |
| 2026-08 | 4.32 | 3.50 | 0.82 | 4.18 |
| 2026-09 | 5.78 | 4.50 | 1.28 | 4.18 |
| 2026-10 | 6.75 | 3.50 | 3.25 | 4.18 |

Each monthly PDF's URL is preserved in the index and matching source record.
Their visible Tokyo rows were checked individually. The plan appendix maps the
fuel statistics period to the preceding/current meter-reading cycle; e.g.
May–July statistics apply from September's reading to the day before October's,
consistent with the October notice. This is not calendar-month consumption.

[Support definition, 2026-06-30](https://a.storyblok.com/f/122730/x/4fbd10fa11/20260630_-_.pdf),
page 6: July→August reading 3.50, August→September 4.50, September→October 3.50.
Directory labels these August/September/October reading/billing months.
[FY2026 levy notice](https://a.storyblok.com/f/122730/x/ae167b8a44/fy2026_.pdf):
4.18 JPY/kWh for May 2026–April 2027 bills. This matches general-terms appendix
application from April's reading to the next April reading.

## Independent arithmetic

These are independently added examples, **not official published bill examples**.
For 30 A / 260 kWh / 30 actual days, base = 29.10 × 30 = 873.00;
2025-05 energy = 120 × 18.98 + 140 × 24.10 = 5,651.60;
2026-04 energy = 120 × 19.27 + 140 × 24.47 = 5,738.20;
levy = floor(260 × 4.18) = 1,086.

| Month | Green 2025-05 total JPY | Green 2026-04 total JPY |
| --- | ---: | ---: |
| 2026-05 | 8,328 | 8,414 |
| 2026-06 | 8,346 | 8,433 |
| 2026-07 | 8,437 | 8,524 |
| 2026-08 | 7,823 | 7,910 |
| 2026-09 | 7,943 | 8,030 |
| 2026-10 | 8,455 | 8,542 |

October 2025-05 subtotal: 873 + 5,651.60 + 1,755 − 910 = 7,369.60;
floor(7,369.60) + 1,086 = 8,455. With 31 days: base 902.10,
subtotal 7,398.70, total 8,484. 15 A / 121 kWh / 31 days:
451.05 + 2,301.70 + 816.75 − 423.50 = 3,146.00;
levy floor(505.78) = 505; total 3,651.

## Input and implementation

`amp_daily_tiered_v1` is separate from unchanged monthly-base arithmetic.
`baseDailyYenByAmps` is a static rule field; monthly records cannot override it.
`days` must be an explicit integer 1–62; missing days excludes only daily
candidates, while a daily current plan returns `days_required`. Invalid provided
days returns `invalid_days`, including null, strings, fractions and zero.
The day count is the bill's actual complete-cycle duration; no dates, calendar
month length or 30-day default is inferred. This technical bound does not make
a partial cycle eligible.

The interface retains blank initial conditions, makes days required only for
a daily current plan, displays daily rate × actual days in the base breakdown
and days in the result context. Five maintained languages explain missing days,
exact plan vintage and historical enrollment limits. Desktop/mobile layouts
remain independently designed with the existing 900px switch.
