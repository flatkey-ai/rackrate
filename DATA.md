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

The RunPod, Hyperstack, and Nebius adapters are automated. Other providers remain seed observations
until a public source and parser have been validated. Contributions should add
a fixture-based parser test before enabling a new provider in the workflow.
