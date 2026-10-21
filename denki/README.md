# Electricity comparison, Tokyo

Public route: https://jp-lifebase.com/denkikakaku (also served on www).

The interface shares the community's language preference. Japanese, English,
Korean and Chinese (Simplified and Traditional) are maintained dictionaries;
other languages use labelled automatic translation. Plan and source document
names remain in their official Japanese form. Numerical data never pass through
translation.

## Verified coverage

Dataset `2026-10-21.tokyo-v5` (schema 2). Octopus Green 2025-05 and 2026-04
Tokyo are verified for actual-day basic fees. The original six monthly-base
offers retain their prices, source records and historical results. Frozen V3
and V4 are retained in `data-v3.mjs` and `data-v4.mjs` with exact JSON fixtures.
The public tool supports
the current Japan calendar month and the previous five months. At release this
is May–October 2026; the window rolls at midnight Japan time on the first day
of each month. Only independently verified tariff months inside that window
are offered. Both the catalog and comparison API enforce the boundary,
including requests pinned to an old saved dataset version.

| Provider / plan | Each month, 2026-05 through 2026-10 |
| --- | --- |
| TEPCO 従量電灯B | available |
| Mitsuuroko 従量電灯B 関東 | available, including the verified standard Vessel intermediary tariff |
| Tokyo Gas 基本プラン | available |
| ENEOS 東京Vプラン | available |
| idemitsuでんき Sプラン（東京・アンペア契約） | available, without car/EV or optional discounts |
| CDエナジー ベーシックでんきB | available, without gas bundle discount or points |
| Green Octopus 2025-05 東京 | available when actual billing days are entered |
| Green Octopus 2026-04 東京 | available when actual billing days are entered |
| Green Octopus 2026-10 東京 | excluded: launch-month full-cycle applicability unverified |

The original 2025-09 and 2026-01 numerical records remain archived for audit and
internal formula tests. They are no longer public comparison options.

These labels mean provider meter-reading / tariff-application months, not
calendar consumption months or payment dates. The user must select the month
shown for the relevant tariff and a standard full billing cycle. The app does
not infer that month from arbitrary dates. Starts, cancellations, mid-cycle
capacity changes and zero-use months are outside the public input range.

Only Tokyo low-voltage residential amp contracts 10/15/20/30/40/50/60 A and
integer billed usage 1–10,000 kWh are supported. Use the bill's rounded kWh;
fractional interval consumption is not rounded implicitly. No amount-only
reverse calculation or CSV import is offered in this version.

## Calculation

Rates include consumption tax. Basic fee + tier energy + gross fuel adjustment
minus government support are computed without rounding each line to whole yen.
TEPCO's 328.08 minimum is then applied to this subtotal. Renewable levy is
independently truncated to whole yen; the final total is truncated to whole yen.
The detail view includes the resulting final rounding adjustment. Government
support is split from gross fuel, so published net fuel is not discounted twice.

Octopus uses `amp_daily_tiered_v1` and daily base × actual billing days, with
unchanged monthly tier thresholds. Its negative combined total, including levy,
is floored at zero; it does not use TEPCO's minimum. Independent hand calculations
and all official evidence are in `research-octopus-202610.md`. No official
Octopus bill example was found; the numerical fixtures are identified as
independent arithmetic checks, not customer-bill validation.

Ranking uses calculated totals under identical inputs, with no sponsorship or
affiliate weighting. Delta is target total minus the chosen current plan's
calculated total. An optional actual bill is used only for reconciliation:
API `differenceYen = actualBillYen - calculatedYen`. UI labels explicitly state
the direction of any displayed difference. Campaigns, payment charges, paper
bill fees, points, gas bundles and optional contract discounts are excluded.

## Provenance and persistence

`data.mjs` composes frozen V4 with independently verified `octopus.mjs`.
V4 composes frozen V3 with `tokyo-expansion.mjs` and its source manifest.
The model separates providers,
grid areas, area-specific offers, dated rules and
monthly tariffs. Monthly records reference a rule and contain only monthly
adjustments, applicability and evidence. Static prices cannot be overridden in
a monthly record. A rule must be unique for its offer/area/month and explicitly
list that month in `verifiedMonths`; an open effective interval does not verify
future months. Tokyo Gas uses separate rules before/from October 2026. TEPCO's
current rule ends in October and needs new verification before extension.
The two new providers also require new verification beyond October; already
announced future rates are not substituted into the May–October records.

`model.mjs` validates references, rule intervals, calculation/rounding support,
capacity and source completeness before a snapshot can be installed. Unsupported
candidates are excluded individually; an ineligible current plan rejects the
comparison. Catalog capacity choices reflect the selected offer and month.

`legacy-data.mjs` is the frozen original V2 payload, not an editing surface for
future prices. V3 reuses its verified numbers and evidence. New records and
rules must be added to the new model under a new dataset version. `normalizeDataset`
creates an in-memory view of raw V1/V2 snapshots without altering their payload,
hash, version or source order. Old datasets remain reproducible. V3 also has a
fixed raw test fixture and SHA-256. Do not edit either frozen module to add prices.

Evidence is in
`research-tepco-mitsu.md` and `research-other.md`. A few official PDFs contain
invisible stale text; rendered visible content was checked for those sources.
Source PDFs are archived under `evidence/<dataset-version>/` with a SHA-256
index, outside the public static directory. V3's `evidenceVersions` references
the existing verified V2 evidence; no new price documents were fetched for P0.
The original V1 evidence is retained.
The new offers are documented in `research-tokyo-expansion-202610.md`.
V4 additionally archives 20 official sources (18 PDFs and 2 HTML pages),
including both providers' six monthly announcements and the CD independent
calculation example. `evidenceVersions` references the retained V2 evidence and
the V4 directory. Mutable URLs, including a PDF with a query string, have saved
bytes and hashes; no scheduled acquisition job is implied by this one-off archive.
Mutable URLs are identified and must not be treated as immutable documents.
`ops/archive-denki-sources.mjs` collects only the manifest's PDF URLs and refuses
known checksum mismatches.

V5 additionally archives 13 official PDFs and the terms directory HTML, with
fixed byte counts and SHA-256. The December revision notice is retained for
scope review only. Source records reference 12 PDFs and the directory; future
prices are not applied to these historical months. The original V2/V4 evidence
directories are retained and still referenced by `evidenceVersions`.

On startup, the dataset's exact JSON and SHA-256 are stored in the existing
SQLite database (`denki_datasets`). Reusing a version with different content
fails rather than overwriting history. A correction must use a new version;
old versions remain available and are included in the community backup.

The rankings compare the selected historical tariff month. A result does not
confirm current enrollment or address-specific supply eligibility. CD excludes
islands and bulk-receiving apartment buildings; idemitsu's regional exclusions
also apply. Confirm current terms with the provider. No switching application,
campaign, car discount, gas bundle or points calculation is offered.

- `GET /api/denki/catalog?area=tokyo`: supported areas, selected area, months,
  plans and each month's `capacityAmpsByPlan`. Unsupported areas return 400.
- `GET /api/denki/dataset?version=...`: exact saved numerical/source snapshot.
- `POST /api/denki/compare`: anonymous same-origin calculation, optionally pinned
  to a saved `version`. Input is not saved to the database or sent for translation.

The comparison accepts optional `days` as an explicit integer 1–62. Missing
days excludes only daily-base candidates; selecting Octopus as the current
plan requires days. Invalid supplied days rejects the request. The bill's
actual full-cycle day count is required: no 30-day or calendar-month default.
This bound does not make partial cycles eligible. Octopus vintages must match
the user's contract and do not imply current new-customer availability.

The comparison accepts the existing `amps` input and typed
`capacity: {type: 'amp', value: 30}`; if both are supplied they must agree.
Other capacity types and additional calculation models require separate implementation and
verification. Area changes reload the catalog and clear invalid selections;
late catalog/comparison responses cannot overwrite the new selection.

Desktop retains a 320px input column and 24px gap. At widths up to 900px the
tool switches to a separate vertical layout rather than squeezing the desktop
columns, typography or spacing. Verify desktop, phone and breakpoint widths
independently. The release-notes link remains in the heading.

Comparison conditions start empty, including area, month, current plan, amp
capacity, kWh and optional bill. The full-cycle checkbox starts unchecked.
Catalog discovery does not select the only area or newest month automatically.
Each dependent selector requires a deliberate user choice; language changes
preserve that choice without adding defaults. Reloads and restored history
pages reset comparison inputs. No supplier or sample usage is preselected.

V4, including P0, was published on 2026-10-21 JST to
`/srv/jplifebase/releases/20261021T055009Z-denki-v4`. Exact dataset SHA-256:
`2adf677e5035791bc5640e2a1afaf1161cc40110d11ce6aca2becccf8cea8009`.
The previous production release was `20261021T030013Z-sitemap`; V1/V2 saved
SQLite payloads, hashes and import timestamps remained unchanged. Full local
regression: 115 tests passed. Live comparison, initial empty fields, desktop
and phone layouts, release-notes link, sitemaps and service health passed.
Deployment evidence is in `artifacts/denki-tokyo-expansion/verification.md`.

No scheduled scraper has been enabled: each additional month or tariff must be
verified, tested and released with a new immutable dataset. Do not interpolate
missing months or silently substitute today's tariff.

## Validation and limits

TEPCO's published 30A / 260kWh examples reproduce exactly: May–October 2026
8,777 / 8,795 / 8,823 / 8,023 / 7,843 / 8,275 yen, as well as the archived
September 2025 and January 2026 cases. Tests also cover tier boundaries, explicit
government support, separate levy truncation, low-use minimum, input refusal,
baseline reconciliation, snapshot immutability and public API integration.
P0 additionally compares 2,926 pre-refactor V1/V2 calculation cases and all
2,387 V3 cases against fixed pre-refactor baselines, plus seven complete
comparison fixtures. An HTTP upgrade/restart test preserves exact old SQLite
rows and hashes while testing area isolation and the public month boundary.

One privately supplied September 2026 Vessel bill's total was independently
reproduced with zero yen difference. Personal bill details are kept only in
ignored local verification artifacts, not in the public dataset or deployment.
This checks that one total; it is not complete customer-bill validation or a
claim of coverage for individual discounts or all Japanese retail plans.
