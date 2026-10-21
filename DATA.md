# RackRate data contract

RackRate keeps immutable GPU specifications in code and the complete adapted
collection in `data/offers.json`. The primary comparison CSV is
`data/prices.csv`; complete native source records remain in
`data/public-prices.json` and the 51-column `data/public-prices.csv` audit.
Every displayed price traces to a source URL and its actual observation time.

## Refresh policy

- The scheduled workflow runs daily at 10:30 Asia/Shanghai (02:30 UTC); GitHub queueing can delay the start.
- Collectors use official public pricing pages or documented public APIs only.
- The pinned GPU Price Monitor library must complete all nine public sources successfully: Nebius, Crusoe, Lambda, UCloud, AutoDL, RunPod, DigitalOcean, Verda and Microsoft Azure. There is no additional collector. Invalid units, failed sources or incomplete data stop publication and retain the last-known-good dataset. Contact-sales entries are preserved with a null amount, never a zero price.
- A published list price is not treated as live inventory. Availability stays
  `unknown` unless the source explicitly exposes capacity.
- The audit dataset contains this collection's `dataStatus: "official-page"` observations from those nine competitors. The website projects only eligible regional hourly quotes; it does not rewrite or discard excluded audit records. Seed observations and discontinued providers retain their original dates in history.

## Comparison eligibility and counts

`isComparableRegionalOffer` in `lib/offer-geography.mjs` is shared by the website and RackRate's ten-column CSV. An eligible quote has:

- A finite nonnegative native price and USD reference value, with an exact source amount and an original GPU-hour billing unit.
- `quoteStatus: "quoted"`, an actual nonempty region and a valid ISO country attached to the price.
- `priceScope` equal to `regional_quote`, `zone_quote`, `requested_region_quote` or `requested_zone_quote`, with explicit regional-price verification for new collector output.
- A complete advertised per-GPU or per-GPU allocation of a source-documented whole-instance hourly price. Native instance-month and per-card hourly units cannot be combined.
- No explicit `offline`, `ended`, `upcoming` or `unavailable` source/availability state. An `unknown` stock state may remain; a public price does not establish inventory.

Monthly packages, contact-sales entries, starting prices, GPU-component-only charges, platform coverage, unlocated catalogs and unverified or unmapped price locations do not qualify. There is currently no evidenced global uniform-price exception. No monthly amount is divided by assumed working hours. Member and Spot rates may qualify; membership, cloud tier, interruption, account and tax conditions remain attached.

The library's `publishable_quote` applies this regional-hourly scope to its native-currency compact CSV. RackRate additionally verifies native/USD numeric consistency and instance-unit provenance. For compatibility, older already validated snapshots may omit `regionPriceVerified`; an explicit false or invalid value excludes the quote. New collector output carries the flag explicitly. Country mappings use official location evidence, never billing currency, headquarters or capacity coverage.

The price table and GPU/provider directories derive their offers and catalog counts from this eligible set. `/api/pricing/status` keeps complete audit counts in `counts.offers`, `officialOffers`, `offlineOffers`, `contactSalesOffers`, source counts and `providerCounts`. It also exposes `counts.totalCollectedOffers`, `counts.comparableOffers`, `counts.excludedFromComparison` and `comparableProviderCounts`, with `comparisonScope: "regional-gpu-hour"`. A successful nine-source collection can therefore have fewer comparable providers and models. Raw counts remain suitable for publication verification without inflating the public comparison.

## Normalization

`pricePerGpuUnit` and `sourceAmount` preserve the published native amount and its exact decimal string. `sourceCurrency` retains USD, EUR, CNY or ILS. `billingUnit` distinguishes GPU-hour and GPU-month. `priceUsdPerGpuUnit` is the amount converted to USD for the same billing unit. `pricePerGpuHour` contains that USD value for hourly records and remains null for monthly prices or contact-sales entries. No month-to-hour conversion is performed.

RackRate uses the [European Central Bank's daily reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html), downloaded anonymously from its official XML feed and saved in `data/fx-rates.json`. ECB rates are quoted per EUR: `USD amount = native amount × USD-per-EUR ÷ native-currency-per-EUR`. Native USD prices use a factor of 1. Conversion uses exact decimal inputs and integer arithmetic, with half-up rounding at 12 decimal places; original source decimals stay intact. Complete-instance amounts are converted using the same source currency convention.

Each offer carries the FX publication date, fetch time, rate to USD, formula and source link. The publication date can be the previous working day and is not relabeled with the collection date. Invalid, future, missing or more-than-seven-day-old FX data stops publication. These are informational comparison rates, not a bank/card transaction quote; billing-provider exchange rates can differ.

Instance totals are divided by GPU count only when explicitly supported by the source. The original instance total, resources, card count and hardware variant remain available. Ordinary/member rates, Secure/Community tiers and Spot/on-demand modes retain their conditions. Component-only rates and promotional monthly commitments remain in audit and are excluded from comparison.

Region and zone values come from the source. Missing geography stays unknown in audit and is excluded from comparison. The library fields `price_scope`, `region_price_verified`, `compute_countries` and `location_source` become `priceScope`, `regionPriceVerified`, `computeCountries` and `locationSource`. `coverage_regions` / `coverage_countries` become `coverageRegions` / `coverageCountries`; these are platform footprint evidence. `capacityRegions` is inventory scope. Neither coverage nor capacity creates a price location. Official provider-specific country mappings resolve known region codes; unmapped codes do not receive a guessed country. UCloud's offline activity records remain unavailable and never become current comparison rates.

## Current coverage

GPU Price Monitor 0.12.0 collects Nebius, Crusoe, Lambda, UCloud, AutoDL, RunPod, DigitalOcean, Verda and Microsoft Azure. RunPod Secure Cloud and Community Cloud audit rates remain distinct. Azure records retain their region, SKU, billing meter and purchase mode; verified hardware and country mappings support regional per-GPU hourly comparison. DigitalOcean and Verda public catalogs, Lambda node sizes, Crusoe catalog rates and AutoDL ordinary/member tariffs remain in audit when they lack a price-bound location. UCloud promotional month packages, including offline records, remain in audit. A provider's footprint never implies a price in each covered country. The public provider and GPU directories list only providers and models with eligible comparable quotes.

Nebius includes the [official current Spot API](https://api.nebius.cloud/billing/v1alpha1/spot-price), fetched by anonymous GET without a key, account, payment or GPU provisioning. These are current per-GPU-hour regional quotes, with `price_scope=regional_quote`, `region_price_verified=true` and a country only when its exact region has official country evidence. The adapter preserves the API currency and decimal amount. Generic Nebius catalog/coverage rates remain separate and do not substitute for these regional quotes. Spot prices can change every 15 minutes and are interruptible; published prices do not confirm capacity. `observedAt`, `effectiveFrom` and `sourceSnapshotAt` preserve collection time, the rate's effective event and the provider's earliest per-SKU snapshot time. A snapshot timestamp is not an upper bound for every rate event, nor is it a new collection date. Historical graph points and advertised minimums are not relabeled current Spot quotes.

New snapshots declare all nine slugs in `collector.providers`. Every required source must succeed before a new collection can replace the published dataset. The reader also accepts the complete prior five-source collector 0.7.0 snapshot during rollout, and verified older bundled snapshots at their original collection times. Historical reference offers and untracked providers remain outside the current board. No historical JSON file is rewritten to imitate a fresh quote.

## CSV outputs

| File or API | Scope and currency | Shape |
| --- | --- | --- |
| `data/prices.csv` | RackRate's primary eligible regional GPU-hour comparison, USD reference plus original quoted amount | Ten Chinese columns |
| `data/public-prices.csv` | Every returned source quote, native currencies and original periods, including excluded audit records | Full 51-column bilingual library schema |
| Library `prices_to_csv(result)` | Eligible regional GPU-hour quotes only, native currencies without FX conversion | Default ten-column compact library schema |

RackRate creates the audit CSV with `prices_to_csv(result, profile="full")` from the same collection as `data/public-prices.json`. `CSV_COLUMNS` / `CSV_HEADERS` describe the full schema; `COMPACT_CSV_COLUMNS` / `COMPACT_CSV_HEADERS` describe the library's default compact schema. `bilingual_headers=False` chooses stable English field IDs for either profile without changing values. Additional source metadata, including coverage and Spot snapshot evidence, remains in the full audit's JSON metadata fields.

`compactPricesToCsv` in `scripts/lib/compact-csv.mjs` projects `data/offers.json` into `data/prices.csv`. Its columns are GPU model/specification, platform, country/region, USD reference per GPU, original quote, billing period, price type/conditions, availability, official URL and Beijing collection time. Every row's period is hourly. Exact decimals are preserved without further display rounding. For `instance_total_allocated`, the original-quote column retains the source whole-instance amount and currency; the USD column is the per-GPU hourly reference. Other eligible quoted rates retain their per-card original basis. Conditions include member/Spot/cloud tier, account and tax restrictions, non-USD FX rate/date/source, and Spot effective/snapshot times. Output timestamps use Asia/Shanghai; source audit timestamps keep their original zones and precision.

Both CSV outputs use UTF-8 BOM, CRLF and proper quoting for embedded commas, quotes and newlines. Text beginning with spreadsheet formula characters is escaped. The application exporter does not recollect or alter source observations. Full-audit validation and daily deduplication accept bilingual and legacy English full headers and require the same exact collection timestamp; compact application rows are not a replacement for these audit checks. An export or validation failure prevents publication. `generatedCatalog` adds source-derived metadata without inventing missing specifications. New adapters belong in the library and require meaningful fixture tests.

## Ranking, corrections, and reuse

- Eligible rows display USD per GPU-hour after documented FX conversion and are compared within purchase-mode, hardware and full-price groups. Original-currency filters remain available. Ordinary and member minima stay separate; Spot prices retain their interruption conditions. Missing numeric, historical, explicitly unavailable, starting and component-only rates stay outside the result table. A family-level listing does not make different VRAM, interfaces or instance configurations equivalent. Commercial placement cannot change source labels or price-table order.
- Flatkey is a commercial partner with a separate service profile and quote-request links using sponsored link attributes. It is not a competitor price source or an entry in the competitor price comparison. No Flatkey prices or inventory are inferred from its public reference index.
- Corrections are accepted through the public `data-correction` issue form in the `flatkey-ai/rackrate` repository and must include a source URL.
- Repository code and the normalized dataset are published under the repository's MIT license. Upstream provider names, marks, and source-page content remain the property of their respective owners.

## Flatkey service copy

Service claims were checked against https://flatkey.ai/compute on 2026-10-15.
The profile describes workload matching, formal quotes and flexible, reserved
or dedicated capacity requests. The official page explicitly says that online
self-service creation is not currently available. Quote CTAs therefore link to
the service overview, not an assumed instant-deployment console flow.
No listed reference index, term multiplier, response-time promise or inventory
count is imported as a Flatkey rental offer. Availability, price, configuration
and delivery conditions require confirmation in the formal quote.
