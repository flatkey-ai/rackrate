# RackRate

Independent cloud GPU price-comparison site. The launch UI is branded **RackRate** through `NEXT_PUBLIC_SITE_NAME`; the brand and final domain can be changed without touching page code.

## Included

- Filterable GPU-offer table by GPU, provider, region, availability, and rental type
- Indexable GPU and provider detail pages
- Transparent methodology page
- Sitemap and robots metadata
- Standalone Next.js build and Docker image
- Versioned dataset with source links, observation dates, and a fail-closed official-page collector
- High-intent CTAs routed to Flatkey Compute with per-page UTM attribution

RunPod, Hyperstack, Nebius, and Lambda prices are refreshed from their official pricing pages every six hours. Vast.ai refreshes through its official search API when the `VAST_API_KEY` GitHub Actions secret is present; without it, dated Vast.ai records remain references. AWS remains a reference until a read-only identity with `pricing:GetProducts` is configured and region-complete validation is implemented. The workflow validates each parser, typechecks, and builds before committing a new dataset; a source-layout change fails without replacing the last-known-good file.

Each successful refresh also appends a compact snapshot to `data/price-history.json`. The archive retains 180 days of normalized hourly price, availability, and source-status values so future trend pages can be built from auditable data rather than reconstructed estimates.

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
- `NEXT_PUBLIC_FLATKEY_COMPUTE_URL`: Flatkey Compute product entry (defaults to `https://console.flatkey.ai/compute/market`)

## Next data milestone

Keep immutable GPU specifications separate from time-series offers. Each production offer should preserve its provider SKU, source currency, billing unit, original total price, normalized USD/GPU-hour, availability status, source URL, and observation time.

## Refresh pricing locally

```bash
bun run data:refresh
bun run test
bun run typecheck
bun run build
```

The generated file is `data/offers.json`. Collector code is intentionally public under `scripts/` so every published number can be reproduced and reviewed.

See [DATA.md](DATA.md) for the freshness, normalization, and failure policy.

## License

MIT
