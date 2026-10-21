# Daily GPU price refresh

Collection is scheduled once each day at **10:30 Asia/Shanghai**, implemented as `30 2 * * *` (02:30 UTC) in `.github/workflows/refresh-data.yml`. GitHub may queue a scheduled job; 10:30 is its scheduled start, not a guaranteed completion time.

## Cloud execution and publication

1. Check the verified main-branch JSON and full audit CSV. If all nine required sources already completed after today's 10:30 China-time cutoff and the matching full CSV is present and valid, skip another collection.
2. When collection is due, install the immutable GPU Price Monitor 0.11.0 revision in `requirements-collector.txt` and its browser dependency. Collect exactly Nebius, Crusoe, Lambda, UCloud, AutoDL, RunPod, DigitalOcean, Verda and Microsoft Azure through the anonymous library interface. Nebius includes its current public regional Spot API within the same provider result; it is not a tenth collector. No cloud-provider key, login, recharge or GPU provisioning is used.
3. Generate the full 51-column `data/public-prices.csv` using `prices_to_csv(result, profile="full")` from the same collection as `data/public-prices.json`. Preserve every source quote and its native currency, unit, geography, availability and timestamp. Read the latest ECB reference rates anonymously and build the complete adapted `data/offers.json`, `data/fx-rates.json` and `data/price-history.json` audit/history outputs. Generate the primary ten-column `data/prices.csv` from that adapted snapshot using RackRate's shared regional-hourly eligibility rule. Monthly packages remain in audit and are never converted to assumed hourly prices.
4. Run tests, typechecking and a production build before committing these six data files to main. Stage all outputs before replacement and publish `offers.json` last. Collection, either CSV export, or validation failure leaves the last verified main-branch data intact. Preserve both CSVs and their same-batch audit metadata in the workflow artifact.
5. The website reads the single self-contained public `main/data/offers.json` file at request time. Source metadata, GPU/provider catalogs and FX belong to that same snapshot. Price tables and GPU/provider directory statistics project only comparable regional hourly quotes; the complete collection remains intact for audit.
6. GitHub Actions warms the public status endpoint and verifies publication state, exact file SHA-256, timestamps, FX date, full source counts and raw unavailable/contact-sales counts. The endpoint separately reports total collected and comparable counts. The homepage's `rackrate-pricing-snapshot` marker must match the same SHA-256. A run succeeds only when API and page match; this verification also runs when collection was deduplicated.

Daily data publication uses no Railway deployment token, existing CLI session or desktop process. The website must first have the runtime snapshot reader deployed; subsequent pricing refreshes do not deploy the application. Changes to application code still require a normal deployment. 11agents is not part of this pipeline.

## Propagation, cache and failure behavior

The server uses a 60-second update cache, merges simultaneous refreshes and validates a complete candidate before replacing its active snapshot. GitHub raw content may be cached by its CDN for several minutes. A data commit is therefore not an immediate website-update guarantee; the verifier retries for up to six minutes and fails if the expected bytes are not visible.

An unavailable, incomplete, malformed or older upstream snapshot cannot replace newer verified data. The server serves its last verified snapshot, or the bundled snapshot after a cold start, with publication metadata that indicates fallback/staleness. The public status endpoint reports `publication.mode`, `status`, `sha256`, `sourceUrl`, `checkedAt`, `lastError` and `stale`. The verifier requires `mode=github-public-snapshot`, `status=current`, `stale=false` and the expected hash, so a fallback does not silently pass publication checks.

The public verifier only performs GET requests. It cannot choose the server's upstream URL, activate another commit or change credentials. A verification failure after a successful data commit leaves that validated data on main; a later normal manual run can retry publication checks without collecting again. Verified collection artifacts remain available for diagnosis.

`publication.status=current` means the website serves the latest verified GitHub snapshot. It does not mean the providers were collected today. `publication.checkedAt` is the snapshot check time; use `generatedAt`, source `fetchedAt` and quote `observedAt` to assess collection freshness. A successful fetch proves what the official source returned at that time, not current stock or a final account-specific checkout price. Historical and explicitly unavailable records remain in audit with their actual dates and statuses; they do not enter the current comparison.

`counts.offers`, `officialOffers`, `offlineOffers`, `contactSalesOffers`, source counts and `providerCounts` preserve full-collection semantics for deployment verification. `counts.totalCollectedOffers`, `counts.comparableOffers`, `counts.excludedFromComparison` and `comparableProviderCounts` report the comparison projection. Do not compare website row counts to the full audit count or assume that all nine successfully collected providers have eligible regional hourly prices.

## Manual operation and Codex supervision

Use GitHub Actions **Refresh public GPU pricing data** to run or inspect the workflow. `force_refresh` defaults to false. Only an explicit manual `workflow_dispatch` with `force_refresh=true` bypasses today's successful collection; scheduled events ignore force. Branch-dispatched runs always collect and validate, but do not commit to main or query production publication.

The optional daily Codex check at **10:45 Asia/Shanghai** verifies the cloud workflow, source statuses and live snapshot. It can dispatch the same workflow once if today's run is missing or failed and no refresh is running. It follows an active workflow instead of starting a duplicate. A normal retry keeps `force_refresh=false`; a completed collection can then reuse the main snapshot and repeat only cloud verification. This extra supervision requires Codex to be available, but daily collection and publication run entirely in the cloud without it.

To verify production against the `data/offers.json` bytes in a clean main checkout:

```bash
node scripts/verify-deployment.mjs
```

For a local test server only:

```bash
node scripts/verify-deployment.mjs --base-url http://localhost:3000
```

The test origin changes only where the verifier sends its public GETs. It does not change the website's fixed GitHub source. No upload or deployment command runs during verification.

## Data checks

Confirm all nine library provider results succeeded and inspect `coverage` for model gaps; model-family coverage is not a completeness or stock guarantee. Audit this collection's exact native amounts, units, geography and observation times before checking its comparison subset. Earlier records retain their own dates in history. Preserve monthly packages, unlocated catalogs, offline UCloud promotions, starting prices and contact-sales entries in the audit, without substituting them for eligible result rows.

For `data/prices.csv` and every website table, require numeric quoted GPU-hour prices with a valid price-bound country and actual region, verified regional/zone scope, original hourly unit consistency and complete per-GPU price basis. Exclude monthly, contact-sales, starting, component-only, unlocated, platform-coverage, unknown-country and unverified-region records, as well as explicit offline/ended/upcoming/unavailable states. Confirm each row is per GPU-hour and that the source whole-instance total is retained when its USD reference allocates the instance across documented GPUs. Member and Spot conditions, cloud tier, account restrictions, tax and dated FX provenance remain visible. Missing or failed data never becomes a zero price.

Preserve `price_scope`, `region_price_verified`, `compute_countries` and `location_source` in adapted fields. Keep platform `coverage_regions` / `coverage_countries` and `capacity_regions` separate from price regions. No headquarters, currency, capacity footprint or guessed global uniform price can supply missing price geography. Unknown codes stay unmapped in audit and outside comparison.

For Nebius Spot, verify the [current anonymous API](https://api.nebius.cloud/billing/v1alpha1/spot-price) response rather than a published minimum or historical chart average. Its exact platform/region/currency quote must retain `observed_at`, `effective_from` and `source_snapshot_at` as separate instants. The snapshot is the earliest per-SKU sample, not an upper bound on every effective event in the response. Preserve API decimals and USD/ILS billing jurisdiction conditions independently of compute location. Prices are dynamic and interruptible; public access to the price endpoint requires no API key or purchase and does not establish available GPU capacity.

The library remains independently usable through Python and JSON/CSV CLI. Its default `prices_to_csv(result)` now returns a strict ten-column **native-currency** compact profile; `profile="full"` returns all source records in the **51-column** audit profile used for `data/public-prices.csv`. `CSV_COLUMNS` / `CSV_HEADERS` refer to the full schema, while `COMPACT_CSV_COLUMNS` / `COMPACT_CSV_HEADERS` describe the compact schema. `bilingual_headers=False` selects English IDs without changing values. RackRate accepts bilingual and legacy English full headers during audit validation and deduplication, including `collected_at` / `collection_status`. A missing, invalid or different-batch full CSV triggers collection. The separate application exporter writes `data/prices.csv` with USD references, native original quotes and Beijing collection times; it does not reserialize or replace the full audit CSV. The library contains no RackRate scheduling, storage, publication endpoints or credentials.

To rebuild only RackRate's primary ten-column CSV from an existing adapted snapshot:

```bash
node scripts/export-csv.mjs
```

Optional first and second arguments select the source `offers.json` and output CSV path. This command makes no provider requests. Both CSVs use UTF-8 BOM, CRLF, standard quoting and spreadsheet-formula protection.
