# GPU Prices

Independent cloud GPU price-comparison site. The launch UI is branded **RackRate** through `NEXT_PUBLIC_SITE_NAME`; the brand and final domain can be changed without touching page code.

## Included

- Filterable GPU-offer table by GPU, provider, region, availability, and rental type
- Indexable GPU and provider detail pages
- Transparent methodology page
- Sitemap and robots metadata
- Standalone Next.js build and Docker image
- Seed dataset with source links and observation dates
- High-intent CTAs routed to Flatkey Compute with per-page UTM attribution

The included prices are clearly labeled sample data for product validation. Replace `lib/data.ts` with collectors or a database/API before presenting the feed as live.

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
- `NEXT_PUBLIC_FLATKEY_COMPUTE_URL`: Flatkey Compute landing page (defaults to `https://flatkey.ai/compute`)

## Next data milestone

Keep immutable GPU specifications separate from time-series offers. Each production offer should preserve its provider SKU, source currency, billing unit, original total price, normalized USD/GPU-hour, availability status, source URL, and observation time.
