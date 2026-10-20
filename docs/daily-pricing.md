# Daily GPU price refresh

The collection runs once each day at **10:30 Asia/Shanghai**, implemented as 02:30 UTC in `.github/workflows/refresh-data.yml`. GitHub can queue a scheduled run, so 10:30 is the scheduled start rather than a guaranteed completion time.

## Execution

1. Install the immutable collection-library revision in `requirements-collector.txt`, including its public browser dependency.
2. Run all eleven anonymous library sources and the existing public Hyperstack collector. No provider API keys, login state, recharge or instance provisioning is used.
3. Read the latest published ECB reference rates anonymously. Validate native amount, currency, billing period, source identity, geography and FX date; convert to USD while preserving the original prices and periods. Save the raw response, FX snapshot, adapted offers and history.
4. Run tests, typechecking and a production build. Any failure stops publication and retains the last verified files on main.
5. Commit the four data files on main. Railway follows `flatkey-ai/rackrate` main and rebuilds the public website.

Branch-dispatched workflow runs collect and validate but do not push data to main. This permits a real anonymous collection test before a code change is merged.

## Codex supervision

A daily Codex check at **10:45 Asia/Shanghai** verifies the workflow result, raw collection date, source statuses and live RackRate data. It does not start a second collection after a successful run. If today's job is missing or failed and no refresh is running, it can dispatch the same workflow once and verify the outcome. A pending deployment is followed without issuing another collection.

The workflow checks the verified main-branch snapshot before installing or fetching anything. If all eleven required sources already completed after today's 10:30 China-time cutoff, a later scheduled or manual run skips collection. The shared concurrency group serializes these checks. Branch validation runs always collect, so a developer can still verify the runner before merging.

The main collection runs on GitHub even when the desktop is off. The local Codex follow-up requires the computer and app to remain available. 11agents is not involved in this pipeline.

## Operator checks

Use GitHub Actions **Refresh public GPU pricing data** for execution history and its downloadable public result. Confirm all eleven library provider results succeeded and inspect `coverage` for model gaps; family coverage is not a completeness or live-stock guarantee.

On RackRate, verify the USD main price, original amount/currency, FX source/date/rate, hourly versus monthly periods, unknown geography, offline UCloud promotions and contact-sales records. Keep ordinary/member rates, Spot/on-demand, cloud tiers, VRAM variants and GPU-component versus complete-instance costs distinct. Never treat a failed source or absent row as a zero price.

The public library remains usable independently through Python and JSON CLI. It does not contain RackRate-specific storage, scheduling, upload endpoints or credentials.
