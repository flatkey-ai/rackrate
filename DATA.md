# RackRate data contract

RackRate keeps immutable GPU specifications in code and time-varying offers in
`data/offers.json`. The generated file is public so a displayed rate can be
traced to a source URL and observation time.

## Refresh policy

- The scheduled workflow runs every six hours.
- Collectors use official public pricing pages or documented public APIs only.
- A collector must return a minimum expected record count and valid positive
  prices. If validation fails, the job stops and the last-known-good dataset
  remains online.
- A published list price is not treated as live inventory. Availability stays
  `unknown` unless the source explicitly exposes capacity.
- Seed observations are marked `dataStatus: "seed"`; automated official-page
  observations are marked `dataStatus: "official-page"`.

## Normalization

`pricePerGpuHour` is USD per physical GPU-hour. Node totals are divided by the
physical GPU count only when the source clearly describes a node total. Spot,
reserved, and on-demand rates keep distinct `rentalType` values.

## Current coverage

The RunPod, Hyperstack, Nebius, and Lambda adapters are automated. Lambda keeps the lowest published per-GPU rate across its listed node sizes. Vast.ai collection uses its authenticated search API when `VAST_API_KEY` is configured; otherwise its dated references are retained. AWS remains a reference until pricing access and region-complete validation are implemented. Contributions should add
a fixture-based parser test before enabling a new provider in the workflow.

## Ranking, corrections, and reuse

- Offer rows are ranked by normalized price after applying the visitor's filters. Commercial placement in provider directories is separate from offer ranking and cannot change source labels or price-table order.
- Flatkey is a commercial partner and appears first in provider directories. Its service profile and quote-request links are separate from sourced price rows and use sponsored link attributes. No Flatkey prices or inventory are inferred from its public reference index.
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
