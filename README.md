# RackRate

Cloud GPU price-comparison site with Flatkey as its preferred commercial recommendation. The site is branded **RackRate** through `NEXT_PUBLIC_SITE_NAME`; the brand and final domain can be changed without touching page code.

## Included

- Filterable GPU-offer table by GPU, provider, region, availability, and rental type
- Indexable GPU and provider detail pages
- Transparent methodology page
- Sitemap and robots metadata
- Standalone Next.js build and Docker image
- Versioned dataset with source links, observation dates, and a fail-closed official-page collector
- Flatkey retains a separate commercial service profile and quote-request CTAs carrying per-page UTM attribution
- Sourced offer rows remain sorted by price; Flatkey has no invented price or inventory records

RackRate consumes the reusable [GPU Price Monitor](https://github.com/flatkey-ai/gpu-price-monitor) Python library for nine competitors: **Nebius, Crusoe, Lambda, UCloud, AutoDL, RunPod, DigitalOcean, Verda and Microsoft Azure**. Public collection needs no cloud accounts, API keys or purchased GPU instances. The library only fetches and returns quotes; RackRate owns the schedule, storage, history and presentation. Flatkey is a separate commercial recommendation, with no competitor price or inventory records.

The GitHub Actions workflow starts once daily at **10:30 Asia/Shanghai (02:30 UTC)**. GitHub may queue scheduled runs. Tests, typechecking and a production build must succeed before data is committed. A failed or incomplete collection retains the last verified dataset. The current board, provider index and GPU directory use only these nine sources and models with current offers. Earlier observations stay in dated history and are not carried into a new current dataset.

The running website reads the verified public `main/data/offers.json` snapshot at request time. After committing data, GitHub Actions warms the public status endpoint and verifies both its SHA-256 and the homepage's snapshot marker against the exact committed file bytes. A successful daily refresh therefore needs no Railway deployment token, CLI login, desktop computer or daily application deployment. Requests check for updates at most once per 60 seconds per server process; GitHub/CDN propagation can take several minutes, so verification retries for up to six minutes. If an upstream read fails or is invalid, the server keeps its last verified snapshot or bundled fallback and exposes that state instead of claiming a current publication.

Daily collection is deduplicated after the 10:30 cutoff. A manual workflow run can explicitly enable `force_refresh`; a scheduled run cannot force a duplicate. Runs that skip collection still verify the live cloud snapshot. Codex's 10:45 follow-up is additional supervision and can retry a missing or failed workflow; it is not needed for normal cloud publication. Code changes still require an application deployment. See [the daily runbook](docs/daily-pricing.md).

Each successful refresh collects once with GPU Price Monitor 0.9.0, saves the unmodified result to `data/public-prices.json`, and calls the Python library's `prices_to_csv(result)` on that same result to create `data/public-prices.csv`. CSV uses UTF-8 BOM / CRLF and retains the original currencies, billing periods, location evidence, membership / cloud tiers, Spot and offline status, sources and observation times. There is no second collection or JavaScript CSV serializer. The daily workflow commits the CSV and includes it in the verified collection artifact; an invalid or failed CSV export stops publication.

RackRate adapts the result into `data/offers.json`, saves European Central Bank reference rates in `data/fx-rates.json`, and appends a compact snapshot to `data/price-history.json`. All outputs are staged before replacement, and `offers.json` is published last. Website prices display in USD with their original amount and currency alongside; the source CSV stays in its native currencies. Every conversion includes its rate, publication date and official source. Monthly prices stay USD per GPU-month; they are not divided by an assumed number of hours. The archive retains 180 days of original and converted amounts, units, FX metadata and source status. CSV is only the quote table; complete provider status and coverage remain in `data/public-prices.json`.

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

The generated dataset preserves contact-sales entries, starting prices, membership requirements, Spot rates, component-only prices and offline promotions. Prices are converted to USD for display; original currency, billing unit, hardware configuration and price basis remain visible comparison dimensions. Provider catalogs do not establish live inventory. See [DATA.md](DATA.md) and [the daily runbook](docs/daily-pricing.md).

The library's `price_scope`, `compute_countries` and `location_source` survive as `priceScope`, `computeCountries` and `locationSource` in RackRate offers. A platform footprint does not become a country-specific price; regional comparisons require a quote explicitly tied to that region or zone.

See [DATA.md](DATA.md) for the freshness, normalization, and failure policy.

## License

MIT

## Analytics

RackRate uses GA4 only. Set `NEXT_PUBLIC_GA4_MEASUREMENT_ID` to the web stream ID (`G-...`) before building; Next.js embeds public environment variables at build time. Analytics is loaded only after the visitor grants analytics consent. Events include `page_view`, `price_filter_changed`, `flatkey_console_clicked`, `flatkey_website_clicked`, and `external_source_clicked`. No Mixpanel requests are sent. Page URLs retain campaign parameters but exclude search text and other query parameters. Enhanced Measurement is disabled for this stream; the application sends page views, filter changes, and external-link events itself. Measurement ID: `G-PP87NKBGK5`.
