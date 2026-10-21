# RackRate data contract

RackRate keeps immutable GPU specifications in code and time-varying offers in
`data/offers.json`. The generated file is public so a displayed rate can be
traced to a source URL and observation time.

## Refresh policy

- The scheduled workflow runs daily at 10:30 Asia/Shanghai (02:30 UTC); GitHub queueing can delay the start.
- Collectors use official public pricing pages or documented public APIs only.
- The pinned GPU Price Monitor library must complete exactly five public sources successfully: Nebius, Crusoe, Lambda, UCloud and AutoDL. There is no additional collector. Invalid units, failed sources or incomplete data stop publication and retain the last-known-good dataset. Contact-sales entries are preserved with a null amount, never a zero price.
- A published list price is not treated as live inventory. Availability stays
  `unknown` unless the source explicitly exposes capacity.
- The current dataset contains only this collection's `dataStatus: "official-page"` observations from those five competitors. Seed observations and discontinued providers remain in existing dated history and are not relabeled or copied into the current board.

## Normalization

`pricePerGpuUnit` and `sourceAmount` preserve the published native amount and its exact decimal string. `sourceCurrency` retains USD, EUR, CNY or ILS. `billingUnit` distinguishes GPU-hour and GPU-month. `priceUsdPerGpuUnit` is the amount converted to USD for the same billing unit. `pricePerGpuHour` contains that USD value for hourly records and remains null for monthly prices or contact-sales entries. No month-to-hour conversion is performed.

RackRate uses the [European Central Bank's daily reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html), downloaded anonymously from its official XML feed and saved in `data/fx-rates.json`. ECB rates are quoted per EUR: `USD amount = native amount × USD-per-EUR ÷ native-currency-per-EUR`. Native USD prices use a factor of 1. Conversion uses exact decimal inputs and integer arithmetic, with half-up rounding at 12 decimal places; original source decimals stay intact. Complete-instance amounts are converted using the same source currency convention.

Each offer carries the FX publication date, fetch time, rate to USD, formula and source link. The publication date can be the previous working day and is not relabeled with the collection date. Invalid, future, missing or more-than-seven-day-old FX data stops publication. These are informational comparison rates, not a bank/card transaction quote; billing-provider exchange rates can differ.

Instance totals are divided by GPU count only when explicitly supported by the source. The original instance total, resources, card count and hardware variant remain available. A GPU component rate is labeled separately from an instance total. Ordinary/member rates, Secure/Community tiers, Spot/on-demand modes and promotional monthly commitments keep their conditions.

Region and zone values come from the source. Missing geography stays unpublished; a currency or provider's headquarters is not used to infer a compute country. The library fields `price_scope`, `compute_countries` and `location_source` become `priceScope`, `computeCountries` and `locationSource` in an adapted offer. Explicit regional/zone quote scope governs country-price filters and regional minima. Nebius public region lists describe platform coverage rather than independently confirmed regional prices; coverage cannot supply a compute country for a price. Availability remains unknown unless explicitly published; UCloud's offline activity records stay unavailable.

## Current coverage

The library supplies only Nebius, Crusoe, Lambda, UCloud and AutoDL to RackRate. Lambda retains all published node sizes rather than only the cheapest one. AutoDL's public homepage covers ordinary and member tariffs, not authenticated per-machine inventory. UCloud supplies promotional month packages, including offline records. A provider's footprint does not imply price coverage of every country in that footprint. The current provider index lists only competitors with current records, and the GPU index lists only models present in those records.

New snapshots declare these five slugs in `collector.providers`. The reader retains compatibility with previously verified bundled snapshots, but its current-board projection still excludes discontinued providers and historical reference offers. No historical JSON file is rewritten to imitate a fresh quote.

The raw library response in `data/public-prices.json` retains source URLs, collection timestamps, effective dates, original units and coverage indices. `generatedCatalog` in `data/offers.json` adds source-derived GPU/provider metadata without inventing missing specifications. New adapters belong in the open-source library and need meaningful fixture tests before publication.

## Ranking, corrections, and reuse

- Offer rows display USD after documented FX conversion and are compared within billing-unit, purchase-mode and price-basis groups. Original-currency filters remain available. Missing numeric prices, seed references, offline promotions, membership requirements and component-only rates retain explicit labels and eligibility rules. A family-level listing does not make different VRAM, interfaces or instance configurations equivalent. Commercial placement in provider directories is separate from offer ranking and cannot change source labels or price-table order.
- Flatkey is a commercial partner with a separate service profile and quote-request links using sponsored link attributes. It is not a competitor price source or an entry in the five-provider price comparison. No Flatkey prices or inventory are inferred from its public reference index.
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
