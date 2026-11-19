# Performance

## Measured changes

On a local in-memory Node 24 SQLite fixture with 3,000 sessions and roughly 16 KB of transcript data per session, the median of nine reads fell from **90.73 ms to 40.54 ms** when the query returned only session metadata and used the composite index. `EXPLAIN QUERY PLAN` showed the old index using a temporary B-tree for the ID tie-breaker. The replacement index covers workspace scope and timestamp/ID order. This is a synthetic query measurement.

The app now imports compiled Astryx components and CSS from the installed packages. The previous local StyleX pass took 33 seconds in a cold loader run. The packaged component stylesheet covers the full Astryx library and can be larger than the previous app-only stylesheet.

The preloaded Inter font fell from **874,708 to 464,252 bytes**, a 47% reduction before HTTP compression. The WOFF repack preserves all 21 font tables and the variable weights. Next.js emits a fingerprinted font URL, preloads it, and uses a metric-adjusted fallback during loading.

## Application paths

| Area | Implementation |
| --- | --- |
| SQLite connections and indexes | The gateway reuses one SQLite connection per Node process with WAL and prepared statements. The index migrates on startup. SQLite serializes writers to the same file, so this deployment uses a shared handle and keeps transactions short. |
| N+1 reads | The session list and usage reconciliation batch related runs by workspace. Session listing parses metadata in Node and leaves transcripts in SQLite. Requests for a specific model connection read that connection by primary key. |
| Query cache | A bounded connection-list cache serves recent workspace reads. Connection writes invalidate their workspace, external SQLite commits invalidate cached lists, and transactional reads bypass the cache. Budget admission, run state, and secrets read durable storage. |
| Pagination and search | The history drawer displays 30 results at a time and debounces title filtering by 150 ms. IndexedDB upgrades in place to index owner and update time and reuses an open connection. Authenticated API clients can pass `limit` (1–100) and `offset` to `GET /api/gateway/sessions`. Paged `total` counts the returned page and `nextOffset` is null at the end. Calls without pagination retain the existing full listing. |
| Uploads | PDF and DOCX extraction runs in separate Node processes so native parser crashes stay outside the gateway. Each gateway process runs two jobs with six waiting slots. A busy queue or 30-second worker timeout returns HTTP 503 with `Retry-After`. The upload request waits for its own result and jobs are in memory. Text and image uploads follow their lightweight paths. Run the production server from the application root with its source worker file and installed dependencies available. |
| Cache headers | Public upload limits are cacheable for 60 seconds and writes validate against the current limits. Authenticated gateway responses use `no-store`. Event streams also use `no-transform`. |
| JavaScript and CSS | Next.js production builds minify and split route bundles. Chat loads Astryx Markdown when it first displays a message and memoizes finished message rows. The app uses the packaged Astryx styles. |
| Images and layout | Next's image optimizer is configured for WebP where used. Markdown images load lazily and decode asynchronously. External Markdown images and provider attachments retain their source formats. For known-size app images, supply dimensions or a reserved aspect ratio to prevent shifts. |

## CDN and Brotli

1. Set `CDN_URL` to the static asset origin before `npm run build`. Omit it for same-origin asset serving.
2. Publish `.next/static/` under `/_next/static/` before switching traffic to the build. Keep older build assets available during rollout. Honor Next.js's immutable cache policy for fingerprinted assets and configure cross-origin access for fonts.
3. Enable Brotli for static JavaScript and CSS on the CDN. A self-hosted static server that supports precompressed sidecars can use `npm run assets:brotli` after building. Publish each `.br` beside its original file and configure the server to negotiate it using `Accept-Encoding`, emit `Content-Encoding: br` and `Vary: Accept-Encoding`, and serve the original URL with its original content type. Direct `next start` uses its standard gzip handling.
4. Verify the deployed asset URL with and without `Accept-Encoding: br`. Keep protected APIs and streams on the app origin and disable proxy buffering for SSE.

## Profile the app

Build with `NEXT_PUBLIC_REPORT_WEB_VITALS=1`, run `npm start`, then profile the app using an isolated gateway and a fixture provider. The browser console reports LCP, INP, CLS, and TTFB. Interact with Chat, the history drawer, and provider settings, then switch tabs or navigate away to finalize metrics. Record cold and warm runs on desktop and a narrow viewport. Compare the median of several like-for-like runs and inspect any regressions in the Performance and Network panels.

For field monitoring, compare the 75th percentile against LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1. Track initial JS/CSS/font transfer, model catalog latency, and time to first chat output. Record provider response time independently because it affects the streaming path. In a warm local Chromium fixture, Chat recorded an LCP of 176 ms, and the history flow verified the 30-row first page, loading all 36 owned rows, and a one-result title search. The fixture suite covers application behavior. Browser measurements and deployed CDN behavior require their own verification.
