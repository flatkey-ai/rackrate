# Daily GPU price refresh

Collection is scheduled once each day at **10:30 Asia/Shanghai**, implemented as `30 2 * * *` (02:30 UTC) in `.github/workflows/refresh-data.yml`. GitHub may queue a scheduled job; 10:30 is its scheduled start, not a guaranteed completion time.

## Cloud execution and publication

1. Check the verified main-branch snapshot. If all five required sources already completed after today's 10:30 China-time cutoff, skip another collection.
2. When collection is due, install the immutable library revision in `requirements-collector.txt` and its browser dependency. Collect exactly Nebius, Crusoe, Lambda, UCloud and AutoDL through the anonymous library interface. No additional collector, cloud-provider keys, login state, recharge or GPU provisioning is used.
3. Read the latest published ECB reference rates anonymously. Validate prices, currencies, billing periods, source identity, geography and FX date. Preserve original amounts and convert only currency; monthly rates stay per month. Save the raw library response, FX snapshot, adapted offers and history.
4. Run tests, typechecking and a production build before committing the four data files to main. Collection or validation failure leaves the last verified main-branch data intact.
5. The website reads the single self-contained public `main/data/offers.json` file at request time. Source metadata, GPU/provider catalogs and FX belong to that same snapshot; the website does not combine independently fetched main-branch files.
6. GitHub Actions calls the public status endpoint to warm the server's snapshot, then checks its publication state, exact file SHA-256, timestamps, FX date, source counts and offline/contact-sales counts. It also fetches the homepage and checks its `rackrate-pricing-snapshot` meta marker against that same SHA-256. A run is successful only when both API and page match. This step runs even when duplicate collection was skipped.

Daily data publication uses no Railway deployment token, existing CLI session or desktop process. The website must first have the runtime snapshot reader deployed; subsequent pricing refreshes do not deploy the application. Changes to application code still require a normal deployment. 11agents is not part of this pipeline.

## Propagation, cache and failure behavior

The server uses a 60-second update cache, merges simultaneous refreshes and validates a complete candidate before replacing its active snapshot. GitHub raw content may be cached by its CDN for several minutes. A data commit is therefore not an immediate website-update guarantee; the verifier retries for up to six minutes and fails if the expected bytes are not visible.

An unavailable, incomplete, malformed or older upstream snapshot cannot replace newer verified data. The server serves its last verified snapshot, or the bundled snapshot after a cold start, with publication metadata that indicates fallback/staleness. The public status endpoint reports `publication.mode`, `status`, `sha256`, `sourceUrl`, `checkedAt`, `lastError` and `stale`. The verifier requires `mode=github-public-snapshot`, `status=current`, `stale=false` and the expected hash, so a fallback does not silently pass publication checks.

The public verifier only performs GET requests. It cannot choose the server's upstream URL, activate another commit or change credentials. A verification failure after a successful data commit leaves that validated data on main; a later normal manual run can retry publication checks without collecting again. Verified collection artifacts remain available for diagnosis.

`publication.status=current` means the website serves the latest verified GitHub snapshot. It does not mean the providers were collected today. `publication.checkedAt` is the snapshot check time; use `generatedAt`, source `fetchedAt` and quote `observedAt` to assess collection freshness. A successful fetch proves what the official source returned at that time, not current stock or a final account-specific checkout price. Historical references and offline listings keep their own dates and labels.

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

Confirm all five library provider results succeeded and inspect `coverage` for model gaps; model-family coverage is not a completeness or stock guarantee. The current dataset contains only this collection's offers, and the GPU directory omits models without such offers. Earlier records are preserved in dated history rather than re-observed as current prices. Check the USD main price, exact original amount/currency, dated FX source/rate, hourly versus monthly periods, unpublished geography, offline UCloud promotions and contact-sales rows. Ordinary/member rates, Spot/on-demand, hardware variants and GPU-component versus complete-instance costs retain their conditions. Missing or failed data is never a zero price.

Preserve `price_scope`, `compute_countries` and `location_source` in the adapted offer. Only region- or zone-bound quotes support country-price filters and regional minima. A provider's platform coverage remains coverage; it is not expanded into prices in those countries. An offline promotional listing remains offline.

The reusable library remains independently usable through Python and JSON CLI. It contains no RackRate storage, scheduling, publication endpoints or credentials.
