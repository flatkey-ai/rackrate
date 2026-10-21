# RackRate

Cloud GPU price-comparison site with Flatkey as its preferred commercial recommendation. The site is branded **RackRate** through `NEXT_PUBLIC_SITE_NAME`; the brand and final domain can be changed without touching page code.

## Included

- Filterable numeric GPU-hour prices with verified country and region evidence
- Indexable GPU and provider detail pages
- Transparent methodology page
- Sitemap and robots metadata
- Standalone Next.js build and Docker image
- Versioned dataset with source links, observation dates, and a fail-closed official-page collector
- Flatkey retains a separate commercial service profile and quote-request CTAs carrying per-page UTM attribution
- Sourced offer rows remain sorted by price; Flatkey has no invented price or inventory records

RackRate consumes the reusable [GPU Price Monitor](https://github.com/flatkey-ai/gpu-price-monitor) Python library for nine competitors: **Nebius, Crusoe, Lambda, UCloud, AutoDL, RunPod, DigitalOcean, Verda and Microsoft Azure**. Public collection needs no cloud accounts, API keys or purchased GPU instances. The library only fetches and returns quotes; RackRate owns the schedule, storage, history and presentation. Flatkey is a separate commercial recommendation, with no competitor price or inventory records.

The GitHub Actions workflow starts once daily at **10:30 Asia/Shanghai (02:30 UTC)**. GitHub may queue scheduled runs. Tests, typechecking and a production build must succeed before data is committed. A failed or incomplete collection retains the last verified dataset. The price table, provider index and GPU directory use only comparable regional hourly quotes from these sources. The complete collection remains available for audit; a collected provider or GPU does not automatically qualify for the comparison. Earlier observations keep their original dates in history.

The running website reads the verified public `main/data/offers.json` snapshot at request time. After committing data, GitHub Actions warms the public status endpoint and verifies both its SHA-256 and the homepage's snapshot marker against the exact committed file bytes. A successful daily refresh therefore needs no Railway deployment token, CLI login, desktop computer or daily application deployment. Requests check for updates at most once per 60 seconds per server process; GitHub/CDN propagation can take several minutes, so verification retries for up to six minutes. If an upstream read fails or is invalid, the server keeps its last verified snapshot or bundled fallback and exposes that state instead of claiming a current publication.

Daily collection is deduplicated after the 10:30 cutoff. A manual workflow run can explicitly enable `force_refresh`; a scheduled run cannot force a duplicate. Runs that skip collection still verify the live cloud snapshot. Codex's 10:45 follow-up is additional supervision and can retry a missing or failed workflow; it is not needed for normal cloud publication. Code changes still require an application deployment. See [the daily runbook](docs/daily-pricing.md).

Collection is ordinary Python with deterministic adapters; it does not call Codex or an LLM at runtime. The cloud job explicitly selects `api_preferred`: anonymous APIs where available, fixed HTML/DOM rules for approved page sources, and visible source/fallback diagnostics. An API error never triggers a silent switch to page or historical data.

Each successful refresh collects once with **GPU Price Monitor 0.12.0** and keeps the unmodified result in `data/public-prices.json`. `prices_to_csv(result, profile="full")` produces `data/public-prices.csv`, the complete **51-column source audit** with original currencies, periods, geography, membership/cloud tiers, Spot and unavailable states, links and observation times. Its default bilingual headers retain stable English field IDs; `bilingual_headers=False` selects the same full fields with English headers. Both audit files describe the same collection, including records excluded from comparison.

RackRate adapts the full collection into `data/offers.json`, saves European Central Bank reference rates in `data/fx-rates.json`, and retains 180 days in `data/price-history.json`. The primary result table is **`data/prices.csv`**, a ten-column application export generated from that same adapted snapshot. It contains GPU/specification, provider, country/region, USD reference price per GPU, original quoted amount, billing period, price conditions, availability, source URL and Beijing collection time. Only actual GPU-hour prices with country and regional-price evidence qualify. Unlocated catalogs, platform coverage, unknown countries, unverified regions, monthly packages, starting prices, component-only prices, contact-sales entries and explicitly offline/ended/upcoming/unavailable records are excluded. Member and Spot prices can qualify and keep their conditions. No assumed global uniform rate or month-to-hour conversion is used.

Website tables, GPU/provider directory statistics and `data/prices.csv` share `isComparableRegionalOffer` in `lib/offer-geography.mjs`. Exact original and converted decimal strings are preserved; whole-instance original quotes retain their instance basis while the USD column remains per GPU-hour. Non-USD rows disclose the FX publication date, rate and source in their conditions. Both CSV files use UTF-8 BOM, CRLF and spreadsheet-formula protection. All outputs are staged before replacement, with `offers.json` published last. Export or validation failure stops publication.

Nebius collection includes its [anonymous current Spot pricing API](https://api.nebius.cloud/billing/v1alpha1/spot-price). Reading this public endpoint requires no account, key, recharge or GPU purchase. Regional Spot quotes retain the platform, country, currency, actual observation time, rate-effective time and provider snapshot time. Spot prices are dynamic and interruptible; they are not relabeled historical chart averages or generic minimum prices. Nebius platform coverage remains separate audit metadata and cannot establish a regional price.

`/api/pricing/status` distinguishes the full collection from comparable results: `counts.totalCollectedOffers`, `counts.comparableOffers`, `counts.excludedFromComparison` and `comparableProviderCounts` describe that relationship. Existing `counts.offers`, source counts and `providerCounts` retain their audit meaning for publication verification. The library's own default `prices_to_csv(result)` is also a strict ten-column export, in native currencies; it is separate from RackRate's USD application CSV. Use `profile="full"` for the 51-column audit schema (`CSV_COLUMNS` / `CSV_HEADERS`).

## Local development

```bash
bun install
bun run dev
```

Open <http://localhost:3000>.

## Production build

```bash
bun run typecheck
bun run build
PORT=3000 node .next/standalone/server.js
```

Or build and run the included Dockerfile.

The bundled fallback snapshot is read from its original JSON file and validated at server startup. `outputFileTracingIncludes` copies `data/offers.json` into the standalone image. Keep this file read as raw UTF-8: importing it as a JSON module can change the last binary digit of an FX number during compilation and invalidate its exact provenance.

## Configuration

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SITE_URL`: canonical production origin
- `NEXT_PUBLIC_SITE_NAME`: final public brand
- `NEXT_PUBLIC_FLATKEY_WEBSITE_URL`: request-based Compute service overview (defaults to `https://flatkey.ai/compute`); current quote CTAs use this page
- `NEXT_PUBLIC_FLATKEY_COMPUTE_URL`: console entry, reserved for console-specific links (defaults to `https://console.flatkey.ai/compute/market`)

## Next data milestone

Keep immutable GPU specifications separate from time-series offers. Each production offer should preserve its provider SKU, source currency, billing unit, original total price, normalized USD/GPU-hour, availability status, source URL, and observation time.

## Refresh pricing locally

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-collector.txt
.venv/bin/python -m playwright install chromium
bun run data:refresh
bun run test
bun run typecheck
bun run build
```

On Linux, install Chromium system dependencies with `.venv/bin/python -m playwright install --with-deps chromium`. On Windows, use `.venv\Scripts\python.exe` and set `GPU_PRICE_MONITOR_PYTHON` to that executable if needed. An existing installation can be selected with `GPU_PRICE_MONITOR_PYTHON=/path/to/python`. No `.env` is required for public collection.

The generated audit dataset preserves contact-sales entries, starting prices, membership requirements, Spot rates, component-only prices and offline promotions. Only eligible regional hourly quotes reach the website or primary CSV. Provider catalogs do not establish live inventory. To regenerate just the ten-column CSV from an existing adapted snapshot without collecting again, run `node scripts/export-csv.mjs`; optional source and destination paths are its first two arguments. See [DATA.md](DATA.md) and [the daily runbook](docs/daily-pricing.md).

The library's geographic evidence survives as `priceScope`, `regionPriceVerified`, `computeCountries` and `locationSource`. `coverageRegions` / `coverageCountries` describe platform footprint; `capacityRegions` describes inventory scope. Neither can supply the location of a price. `sourceSnapshotAt` and `effectiveFrom` preserve Spot timing independently of `observedAt`.

See [DATA.md](DATA.md) for the freshness, normalization, and failure policy.

## License

MIT

## Analytics

RackRate uses GA4 only. Set `NEXT_PUBLIC_GA4_MEASUREMENT_ID` to the web stream ID (`G-...`) before building; Next.js embeds public environment variables at build time. Analytics is loaded only after the visitor grants analytics consent. Events include `page_view`, `price_filter_changed`, `flatkey_console_clicked`, `flatkey_website_clicked`, and `external_source_clicked`. No Mixpanel requests are sent. Page URLs retain campaign parameters but exclude search text and other query parameters. Enhanced Measurement is disabled for this stream; the application sends page views, filter changes, and external-link events itself. Measurement ID: `G-PP87NKBGK5`.
