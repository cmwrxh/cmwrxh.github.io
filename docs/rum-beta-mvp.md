# AfricaLatency RUM Beta MVP

## Current status
This branch is not a live product. The public marketing page and navigation links remain unpublished until a real site sends metrics and the authenticated dashboard displays verified aggregates end to end. The RUM dashboard and login must read the deployment-specific public Supabase URL/key from `/api/rum-config`; never hardcode the hosted production project into a preview. `SUPABASE_PUBLIC_URL` overrides `SUPABASE_URL` for the browser if the server uses an internal service URL; the public key comes from `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`. The service-role key is never returned to the browser.

## Data flow
- Customer embeds `<script async src="https://africalatency.dev/rum.js" data-key="PUBLIC_KEY"></script>`.
- First-party snippet loads the self-hosted Google `web-vitals` IIFE bundle from `/api/rum-library`, records LCP, INP, CLS and TTFB, and sends sampled events with `navigator.sendBeacon`.
- No cookies or local storage are used by the snippet. Event payload contains metric name/value, pathname only, and connection type where available. It excludes the full URL, query string, raw user agent, user ID, and IP address.
- Ingest checks the key, exact Origin hostname allowlist, active site, and per-key hourly request limit.
- Country and ASN/network organization are resolved using local MaxMind GeoLite2 Country and ASN MMDB files mounted at `/app/data/GeoLite2-Country.mmdb` and `/app/data/GeoLite2-ASN.mmdb`. The IP is used transiently for lookup, never inserted into RUM tables or logged by this endpoint.
- Authenticated dashboard uses the current deployment's Supabase public configuration, Supabase sessions and owner checks. SQL aggregation returns site-wide p75 and sample counts plus country/operator/connection breakdowns. Each group is suppressed below 30 samples.
- Customers can delete a site only after an owner-scoped lookup; deleting the site cascades to its stored events. The UI requires confirmation and reports success only after the API confirms deletion.
- The follow-up migration `sql/20261029_rum_stats_retention.sql` adds the overall p75 aggregation and a 90-day event purge. It schedules a daily purge at 02:17 UTC when `pg_cron` is installed. If not installed, the migration emits a notice and an operator must configure an external daily scheduler; retention is not automatic until that is verified.

## GeoIP licensing
GeoLite databases are governed by MaxMind's GeoLite End User License Agreement, which incorporates CC BY-SA 4.0 for copyrightable data and requires attribution. MaxMind support guidance says public-facing apps and displayed GeoLite data can be used with attribution, subject to the EULA and restrictions against identifying specific households/individuals/addresses. Attribution: “This product includes GeoLite Data created by MaxMind, available from https://www.maxmind.com.” The database must be kept up to date and old versions deleted within 30 days after a new release. Confirm precise GeoLite ASN/Country use against the current EULA before launch. Do not commit MMDB files; mount them privately.
Official EULA: https://www.maxmind.com/en/geolite/eula
Official guidance: https://support.maxmind.com/knowledge-base/articles/sell-and-display-data-from-geolite-databases-and-web-services
Google web-vitals license: Apache-2.0, https://github.com/GoogleChrome/web-vitals/blob/main/LICENSE

## Kenya privacy
Engineering summary, not legal advice. Kenya's Data Protection Act 2019 and ODPC guidance require transparent, lawful, purpose-limited processing and safeguards. Even when raw IP is not retained, the server receives an IP and uses it transiently for GeoIP lookup; do not describe that as “no IP processing.” Site owners must provide an appropriate visitor notice and assess their lawful basis and cross-border processing. Update AfricaLatency's policy before production activation.

## Launch gates
1. Confirm the exact self-hosted preview database and schema, then apply `sql/rum-beta-mvp.sql` only if the beta tables are absent. For an already initialized preview, review and apply `sql/20261029_rum_stats_retention.sql` only after confirming the existing `rum_beta_*` schema.
2. Mount current GeoLite2 Country and ASN MMDBs at `/app/data`; verify account/license, attribution, update cadence and old-file deletion.
3. Install `maxmind` and `web-vitals`; verify gzip size of `rum.js` is under 3 KB and library is self-hosted.
4. Test site creation using real authenticated Supabase session, domain allowlist and per-key rate limit.
5. Send real browser vitals from an authorized preview hostname; verify rows contain no IP/full URL/query/UA/user IDs.
6. Validate p75 values and suppression under 30 samples.
7. Verify the daily retention schedule is actually present and execute a controlled purge test; if `pg_cron` is unavailable, configure and test a scheduler before claiming retention is active.
8. Test deletion with two accounts, ensure one account cannot delete/read the other account's site, and verify the associated events disappear.
9. Test dashboard at 390px and 1440px; obtain genuine screenshots.
10. Install on the live site only after preview passes. Do not publish the `/rum` page or product links before then.
