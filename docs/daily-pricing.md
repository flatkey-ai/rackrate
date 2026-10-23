# Daily GPU price publication

GitHub Actions runs `refresh-data.yml` at **10:30 Asia/Shanghai** (`02:30 UTC`). GitHub schedules may start late. Collection and publication run in GitHub's runner; no open laptop, Codex session, or 11agents job is required. A successful run checks the data, runs tests/type checking/build, verifies that the deployed runtime supports the dataset, commits the current data, provider CSVs and dated history shards on `main`, then verifies the published website snapshot. Existing duplicate-day and manual `force_refresh` behavior remains in place. A public-mode snapshot or an explicitly labelled offline replay does not suppress an authorized-mode run on the same day.

The collector is pinned to **gpu-price-monitor 0.24.0**, immutable commit `d9406e4f80febac332a25899ef1b390adb832576`. The library only collects; RackRate owns credentials delivery, scheduling, currency conversion, historical observations and publication.

## Choose the collection mode

Set the repository **Actions variable** `RACKRATE_COLLECTION_MODE`:

| Value | Behavior |
| --- | --- |
| Unset or `public` | Anonymous collection of Nebius, Crusoe, Lambda, UCloud, AutoDL, RunPod, Microsoft Azure, DigitalOcean, Verda and Vast.ai. No provider credentials enter Python. |
| `authorized` | Public prices plus the expressly selected signed-in catalogs below. All selected account credentials are required. Nebius can be explicitly set to public-only, with the account calculator marked excluded. No anonymous fallback after an account failure. Restricted to `main`. |

**Current anonymous limitation (verified under v0.22.0 on 2026-10-23; unchanged parser):** the public UCloud monthly-promotion parser returns `parse_failed`, so the default public plan currently stops without publishing. Crusoe's public catalog succeeds. The requested UCloud hourly UHost scope is the authorized console path. It collected successfully in the nine-source cloud run linked below, but that run did not publish. This change does not substitute CompShare or monthly prices to manufacture a successful run.

Unknown modes fail before installing or collecting. An authorized run on another branch fails before credentials are supplied. Pull-request checks use synthetic credential fixtures only. Changing a mode does not upload credentials or configure Nebius IAM trust.

## Authorized sources and scope

| Provider | Sources selected by code | Meaning |
| --- | --- | --- |
| Nebius | Anonymous regional Spot API + independent public on-demand website JSON; separately the authorized project/platform catalog and calculator | Every source observation remains separate. Account estimates apply to accessible projects and the explicit VM configuration; compute and separately billed disk costs retain their own fields. No region is borrowed from another source. |
| Lambda | `visible`: public price page + signed-in instance and reserved-cluster catalogs | Public and account observations remain separate; GPU count, hardware differences, cluster term and original price fields remain attached. Only verified shared-SKU selectable regions are searchable, labelled “Same catalog price in listed regions”. They are not independent regional prices or a worldwide uniform price. |
| Crusoe | Complete public GPU price page | Published numeric and contact-sales rows stay distinct; no private contract API or assumed region-wide rates. |
| AutoDL | Signed-in marketplace API, every returned page | Ordinary and member rates remain distinct. Missing country evidence stays missing; it is never filled from the region name or the platform's headquarters. |
| RunPod | Anonymous official GraphQL GPU Pods catalog plus country-verified datacenter lowest-price queries | Enabled Secure Cloud and Community Cloud hourly on-demand rates remain separate. Neither is a membership tier. Catalog rows retain GPU variant/memory with unknown region and stock. Separate one-GPU datacenter responses retain their explicit country/location and are labelled starting prices, excluded from the formal comparison. Datacenters with continent-only location labels are audited as exclusions, never assigned a guessed country. No global/uniform-price claim. Storage is extra; Spot, reserved, serverless and MIG/vGPU partitions are outside this source. |
| Azure | Anonymous Microsoft Retail Prices API for 17 reviewed full-GPU sizes | Exact documented GPU count/VRAM/CPU/RAM, ARM region and On-demand/Spot meter stay attached. Only explicit region-country evidence qualifies for the formal board; fractional GPUs, unreviewed sizes, reservations and license-incompatible meters are excluded. |
| DigitalOcean | Official GPU Droplet pricing documentation | Complete 1/8-GPU plan totals with On-demand/Spot kept separate. The table does not publish applicable regions, so these records remain audit-only. |
| Verda | Official GPU-instance tables, USD and EUR tabs | All listed card counts/configurations and On-demand/Spot totals stay separate. No price geography is inferred from the company location; these rates remain audit-only. |
| Vast.ai | Bounded anonymous official `bundles` API search, up to 1,000 returned offers | Concrete verified, rentable on-demand GPU bundles; hourly instance totals are divided by the stated GPU count. The request includes 8 storage units (API documentation says GB; CLI help says GiB), excluding additional bandwidth charges and unspecified taxes. Only an explicit US state or Canadian province is treated as a verified region; country-only locations remain audit-only, never nationwide-uniform prices. Search coverage is always partial, even when the API reports `truncated: false`; there is no verified complete-market pagination contract. |
| UCloud | Signed-in UHost catalog discovery and per-configuration hourly quotations | Region, zone, GPU count, CPU, RAM, network mode, compatible free image and minimum boot disk remain attached. This does not enumerate arbitrary add-ons or reserved billing. |

The collection stores all source observations, including no-region public listings and unpriced contact-sales rows. The formal website comparison requires a fixed per-GPU-hour price with an evidenced country and region (or Lambda’s verified shared-SKU selectable regions). Unknown-region catalogs, platform coverage lists, regional starting prices, component-only charges and monthly or sales-only entries appear only in the source audit linked from each provider page. This rule applies equally to all ten providers; it does not copy catalog rates to covered regions. It does not truncate to the strict regional CSV or merge records solely because model/price match. Account estimates and signed-in catalogs are labelled separately from public prices. USD conversion preserves the original amount, currency, hourly/monthly unit and ECB provenance; no monthly-to-hourly assumptions are introduced.

The captured Vast.ai sample from **2026-10-23** contained 64 offers: 20 with an explicit US state/Canadian province and 44 with country-only location evidence. These counts describe that capture, not a complete marketplace or a successful ten-source production run. Daily counts can change.

## Credential delivery — requires account owner's cloud-storage approval

**Setup status, 2026-10-23:** the account owner separately approved GitHub credential storage and Nebius read-only OIDC setup. The three Lambda/AutoDL/UCloud session secrets below have been configured. After an earlier pre-collection failure, [nine-source run 39920103909](https://github.com/flatkey-ai/rackrate/actions/runs/39920103909) collected prices successfully but stopped at tests that incorrectly used daily data as fixed mutation fixtures. Those tests are now isolated from live data; that failed run made no publication. The Nebius console requires a USD 25 billing setup payment before the requested IAM group can be created; no payment was made. Until that prerequisite is resolved, select the explicit Nebius public-only profile. Other session credentials and the OIDC configuration are present. The current ten-source application has not been deployed: Railway upload returned HTTP 401, and source connection was blocked by permissions. No successful ten-source live publication or completed authorized daily publication is claimed. Local session-storage permission alone would not authorize this cloud upload.

After approval, add these **GitHub Actions repository secrets** from the owner's privately exported session files, using the GitHub settings UI or another approved secret-delivery method. Never paste their values in logs, issues, PRs or source files.

| Secret name | Value |
| --- | --- |
| `RACKRATE_LAMBDA_STORAGE_STATE_JSON` | Full JSON of Lambda's minimal storage state (`cookies` + `origins`). |
| `RACKRATE_AUTODL_STORAGE_STATE_JSON` | Full JSON of AutoDL's minimal storage state (`cookies` + `origins`, including its login token in local storage). |
| `RACKRATE_UCLOUD_CONSOLE_SESSION_JSON` | Minimal UCloud JSON with `format=ucloud-console-visible-cookie-v1`, `origin=https://console.ucloud.cn` and the login `cookie`. |
| `RACKRATE_NEBIUS_ACCESS_TOKEN` | A currently valid external Nebius Bearer token, when the Nebius auth mode is `token`. This token is short-lived. |

Credentials are injected only into the collection step. The bridge removes them from inherited process environment, constructs an explicit allowlisted `Settings.from_env(mapping, env_file=None)`, and creates unique `0700` temporary directories with `0600` session files. Files are removed in `finally`, including errors. The OIDC access token stays in process memory. Build/test/deploy steps and artifacts receive no credential files. The ephemeral runner is destroyed after the job; a hard runner kill cannot execute Python cleanup, so no credentials are written into the checkout or upload paths.

Publication uses allowlisted quote fields and reviewed nested configuration fields. Private metadata/account/parent/project identifiers and credential keys are removed, and any known credential value appearing in permitted output aborts the run. New nested schema fields fail closed for review rather than silently dropping a price-defining configuration. Child-process exceptions and upstream response bodies are not printed. Failures report only fixed reviewed stage/code constants (for example `oidc_github_identity/oidc_request_failed`), so credential setup, GitHub identity retrieval, Nebius exchange and each provider request can be distinguished safely.

## Optional Nebius OIDC (implemented, not yet production-validated)

`RACKRATE_NEBIUS_AUTH_MODE` is a repository Actions variable: `public` deliberately excludes the account calculator; unset/`token` uses the supplied token secret; `oidc` requests a new short-lived GitHub identity on each authorized run and exchanges it for a Nebius access token. It never falls back to a static token on failure.

OIDC requires an operator-approved, separately configured Nebius service account with the minimal directory-read/calculator permissions and federated credential trust bound to:

- issuer `https://token.actions.githubusercontent.com`;
- exact subject `repo:flatkey-ai/rackrate:ref:refs/heads/main`;
- service account ID supplied as `RACKRATE_NEBIUS_SERVICE_ACCOUNT_ID`.

The service account ID and `RACKRATE_NEBIUS_OIDC_AUDIENCE` are repository Actions variables. The audience selects the value requested from GitHub and checked by this helper; it is not an audience field in Nebius's federated-credential configuration. Nebius trust binds issuer, exact federated subject and service account. The bridge requires an explicit audience with no guessed default. Service-account access may differ from a user's accessible projects, so its first run must be reconciled against the intended account scope.

The job grants `id-token: write` at job scope, so that permission is available to all its steps (including dependency installation). The helper actually requests an identity **only** in `authorized` + `oidc` mode on `main`. Token mode and either public collection or the Nebius public-only profile do not request an identity. GitHub does not provide step-scoped permissions; changes to this workflow and its pinned dependencies need normal repository review.

The helper validates the GitHub endpoint, exact repository/ref, token issuer/subject/audience/expiry, rejects redirects, uses the fixed Nebius STS HTTPS endpoint, and checks returned Bearer type, issued token type and lifetime. It never writes an access token to GitHub outputs, files, logs or artifacts. The exchange uses [Nebius's official STS REST endpoint](https://docs.nebius.com/iam/wif/configure) with the inbound service-account parameters from the [official SDK](https://github.com/nebius/pysdk/blob/main/src/nebius/base/service_account/federated_credentials.py).

This implementation has deterministic mock tests. **The actual GitHub → Nebius trust exchange and service-account price scope still require live validation after approval.** No IAM account or trust has been created by this change. Do not describe this as already working automatic credential renewal.

Lambda, AutoDL and UCloud currently use exported static sessions. Their expiry is provider-controlled; no supported unattended refresh mechanism is implemented here. They must be manually re-exported and the approved GitHub secret replaced when expired. Static Nebius tokens likewise require renewal unless OIDC has been configured and validated. Cloud scheduling is independent of the laptop; authentication cannot be promised to last indefinitely.

## Failure, partial visibility and timestamps

Required missing, malformed or expired credentials, HTTP failures, parser changes, incomplete pagination, missing configuration prices, unknown coverage gaps and failed FX validation stop the run before dataset writes or a Git commit. There is no fallback to public sources and no new observation time assigned to earlier prices. The site continues displaying the last verified snapshot with its original timestamp. A fresh root collection time records completion; each quote and sub-source retains its own actual observation time.

Three reviewed non-request-failure cases are accepted while preserving `partial` status in raw results, coverage and source observations:

- Nebius: another documented region has no accessible project, other accounts/contracts are outside scope, or the calculator explicitly returned no compute tariff for a configuration. A zero compute amount is not published as free GPU capacity.
- AutoDL: marketplace rows were fully fetched and priced but the official region metadata does not establish a country for a named region (`market_region_country/country_not_verified`).
- Vast.ai: the bounded offer search cannot establish complete marketplace coverage (`bounded_marketplace_search/complete_marketplace_not_verified`). Concrete returned offers retain their actual locations and conditions; no missing regions or offers are invented.

Explicit `RACKRATE_NEBIUS_AUTH_MODE=public` is a separate profile: it collects Nebius public on-demand + Spot only, never requests OIDC or a token, and records `nebius_account / excluded_by_configuration / billing_setup_required`. Nebius and overall collection remain `partial`; account coverage is not claimed. This is an explicit operator choice, never an automatic authentication fallback. The other signed-in providers still fail closed.

Only the exact reviewed scope/status pairs and error codes are accepted. All other partial/failed core sources stop publication. Azure, DigitalOcean, Verda and Vast.ai are explicitly optional expansion sources: a failed request, incomplete parse or unreviewed schema yields `extension_source_failed`, zero current rows and a visible failed source status. Rows from a failed expansion attempt and stale prior quotes are never retained. Vast.ai's explicitly accepted bounded-search partial result is distinct from an incomplete or failed parse. These failures leave overall status `partial` and do not block the core sources. These limits do not become “all prices complete”. Source row counts and combined model coverage must match every retained observation. Explicitly sold-out inventory remains distinct from product retirement.

## CSV exports and publication checks

Each validated refresh writes `data/exports/{provider}.csv` for the ten configured provider slugs and `data/exports/manifest.json`. CSV headers contain English keys with Chinese translations. They contain fixed hourly GPU rental prices with verified country and region; Lambda's verified shared-catalog rows name their applicable regions without claiming independently queried regional prices. Unknown-region, country-only, starting, monthly, component-only and contact-sales records stay in the unchanged JSON audit. Verified equivalent AutoDL member tariffs are preferred in the CSV and explicitly require membership; original ordinary quotes remain in JSON/history.

The original `gpu_hour_amount`, `instance_hour_amount` and `currency` remain intact. RackRate adds `usd_gpu_hour_amount（美元单GPU每小时价格）` and `usd_instance_hour_amount（美元实例每小时价格）` using the same verified ECB rates as the website. An absent instance total stays blank. `pricing_conditions（价格适用条件）` identifies the conversion and FX rate date; `manifest.json` retains the full rate registry, original/exported/excluded counts, excluded reasons, hidden ordinary/member-pair counts, collection status, source observation times and each CSV's SHA-256. A provider with zero eligible rows still receives a header-only file; check its manifest entry rather than treating an empty table as a zero price or a successful complete catalog.

Before committing, `node scripts/verify-runtime-capability.mjs` checks the production status endpoint for the publication contract, supported collector version/providers, snapshot schema and size limit. A missing/old/incompatible runtime stops the workflow before `git commit` or `git push`: the existing GitHub dataset and website stay unchanged. Deploy compatible application code first, then rerun the workflow with `force_refresh=true` if a fresh collection is needed.

After tests, typechecking and build succeed, the workflow uploads `public-gpu-prices-<run_id>` even if the runtime preflight or later publication verification fails. This seven-day artifact contains the CSVs/manifest, normalized offers, publication-safe source JSON, FX registry and history. It is a validated collection output, not proof of live publication. Failed collection/validation does not upload this artifact. A completed data commit is followed by status-endpoint and homepage SHA-256 checks against the exact committed `offers.json`.

## Operation and validation

Run `python -m pip install -r requirements-collector.txt` and install Playwright Chromium for anonymous sources, then `bun install --frozen-lockfile`. `bun run data:refresh` defaults to public collection. For an approved authorized environment set the mode and selected credential variables; do not commit a local `.env`. The bridge does not auto-discover dotenv files.

Checks: `python -m unittest discover -s scripts -p 'test_*.py'`, `bun run test`, `bun run typecheck`, `bun run build`. Python tests use synthetic secrets only. The live captured-source replay is an offline schema check, not a fresh network collection and not a cloud-authentication test.

The existing website runtime loader still validates snapshot source counts, exact USD conversion and model indices. API and homepage verification retries for GitHub CDN/runtime cache propagation. `publication.status=current` means the latest verified GitHub snapshot, not necessarily a successful collection today. If a scheduled run fails, inspect its safe error message and last snapshot timestamp; fix the credential/source issue and manually rerun the workflow. Only `main` can publish the data commit.


Full signed-in catalogs are substantially larger than anonymous price pages. All observations are retained; snapshot JSON is written compactly, and runtime download/page verification is bounded at 64 MiB. Raw data and each history shard are bounded at 80 MiB; a larger publication stops before any file write.

History uses a schema-3 index in `data/price-history.json` and UTC-day files in `data/price-history/YYYY-MM-DD.json`. Existing schema-2 observations migrate without changing their original timestamps. New rows use each offer's actual source observation time; multiple observations on the same day are preserved, and replays merge only the same observation timestamp and offer ID. The 180-day retention policy is unchanged. All planned sizes are checked first; staged shards and index publish before `offers.json`, and expired shards are deleted only after successful publication. Historical rows are never silently removed to satisfy a file-size limit.


## Member-rate display preference

The comparison defaults to the member price only for the reviewed AutoDL `machine/list` internal API, CNY hourly container tariffs. Both displayed and exact milli-CNY prices must be finite, consistent with the official two-decimal half-up rule, and no higher than the ordinary price. One ordinary and one explicitly marked member observation must have exactly matching provider, source, SKU, GPU model/variant/memory/count, resource configuration, location, currency, unit, billing model, observation time and other conditions. Membership is visibly required. Ambiguous pairs or missing configuration identity retain both rows. Source datasets and history keep both original amounts; selecting “Hide member / eligibility rates” restores ordinary-only comparison. RunPod Secure/Community are separate clouds and are never treated as membership alternatives. Unknown geography remains unknown. Old page-derived RunPod records stay historical; only reviewed GraphQL observations enter the current source audit. The present RunPod responses are unlocated catalog rates or regional starting prices, so none enter the formal comparison.
