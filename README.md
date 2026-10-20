# RackRate

Cloud GPU price-comparison site with Flatkey as its preferred commercial recommendation. The site is branded **RackRate** through `NEXT_PUBLIC_SITE_NAME`; the brand and final domain can be changed without touching page code.

## Included

- Filterable GPU-offer table by GPU, provider, region, availability, and rental type
- Indexable GPU and provider detail pages
- Transparent methodology page
- Sitemap and robots metadata
- Standalone Next.js build and Docker image
- Versioned dataset with source links, observation dates, and a fail-closed official-page collector
- Flatkey appears first in the provider directory, with a service profile and quote-request CTAs carrying per-page UTM attribution
- Sourced offer rows remain sorted by price; Flatkey has no invented price or inventory records

RackRate consumes the reusable [GPU Price Monitor](https://github.com/flatkey-ai/gpu-price-monitor) Python library for Nebius, Crusoe, Lambda, UCloud, AutoDL, RunPod, DigitalOcean, Verda, EBCloud, Azure and Suanli, plus its existing anonymous Hyperstack collector. Public collection needs no cloud accounts, API keys or purchased GPU instances. The library only fetches and returns quotes; RackRate owns the schedule, storage, history and presentation.

The GitHub Actions workflow starts once daily at **10:30 Asia/Shanghai (02:30 UTC)**. GitHub may queue scheduled runs. Codex checks the result at 10:45 and can retry a failed or missing collection; the primary collection does not need a desktop computer to stay on. Tests, typechecking and a production build must succeed before data is committed. A failed or incomplete collection retains the last verified dataset. Dated Vast.ai and AWS references remain explicitly labeled and are excluded from current-price rankings; this public refresh does not use their credentials.

After a verified data commit, Codex publishes current main through the existing Railway CLI login and verifies the live snapshot. Website publication requires the desktop and Codex to stay available. Railway currently rejects migrating its legacy GitHub connection or creating a project-scoped deployment token, so cloud-only automatic publication still needs Railway administrator authorization. No account-wide deployment token is copied into GitHub. The reusable collection library needs no deployment token.

Each successful refresh saves the unmodified library result to `data/public-prices.json`, adapts it into `data/offers.json`, saves European Central Bank reference rates in `data/fx-rates.json`, and appends a compact snapshot to `data/price-history.json`. Prices display in USD with their original amount and currency alongside. Every conversion includes its rate, publication date and official source. Monthly prices stay USD per GPU-month; they are not divided by an assumed number of hours. The archive retains 180 days of original and converted amounts, units, FX metadata and source status.

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

See [DATA.md](DATA.md) for the freshness, normalization, and failure policy.

## License

MIT

## Analytics

RackRate uses GA4 only. Set `NEXT_PUBLIC_GA4_MEASUREMENT_ID` to the web stream ID (`G-...`) before building; Next.js embeds public environment variables at build time. Analytics is loaded only after the visitor grants analytics consent. Events include `page_view`, `price_filter_changed`, `flatkey_console_clicked`, `flatkey_website_clicked`, and `external_source_clicked`. No Mixpanel requests are sent. Page URLs retain campaign parameters but exclude search text and other query parameters. Enhanced Measurement is disabled for this stream; the application sends page views, filter changes, and external-link events itself. Measurement ID: `G-PP87NKBGK5`.
