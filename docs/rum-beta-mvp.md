# AfricaLatency RUM Beta MVP

## Current status
This branch is not a live product. The page and navigation links remain unpublished until a real site sends metrics and the authenticated dashboard displays verified aggregates end to end.

## Data flow
- Customer embeds `<script async src="https://africalatency.dev/rum.js" data-key="PUBLIC_KEY"></script>`.
- First-party snippet loads the self-hosted Google `web-vitals` IIFE bundle from `/api/rum-library`, records LCP, INP, CLS and TTFB, and sends sampled events with `navigator.sendBeacon`.
- No cookies or local storage are used by the snippet. Event payload contains metric name/value, pathname only, and connection type where available. It excludes the full URL, query string, raw user agent, user ID, and IP address.
- Ingest checks the key, exact Origin hostname allowlist, active site, and per-key hourly request limit.
- Country and ASN/network organization are resolved using local MaxMind GeoLite2 Country and ASN MMDB files mounted at `/app/data/GeoLite2-Country.mmdb` and `/app/data/GeoLite2-ASN.mmdb`. The IP is used transiently for lookup, never inserted into RUM tables or logged by this endpoint.
- Authenticated dashboard uses Supabase sessions and owner checks. SQL aggregation returns p75 and sample counts. Breakdown rows under 30 samples are suppressed.

## GeoIP licensing
GeoLite databases are governed by MaxMind's GeoLite End User License Agreement, which incorporates CC BY-SA 4.0 for copyrightable data and requires attribution. MaxMind support guidance says public-facing apps and displayed GeoLite data can be used with attribution, subject to the EULA and restrictions against identifying specific households/individuals/addresses. Attribution: “This product includes GeoLite Data created by MaxMind, available from https://www.maxmind.com.” The database must be kept up to date and old versions deleted within 30 days after a new release. Confirm precise GeoLite ASN/Country use against the current EULA before launch. Do not commit MMDB files; mount them privately.
Official EULA: https://www.maxmind.com/en/geolite/eula
Official guidance: https://support.maxmind.com/knowledge-base/articles/sell-and-display-data-from-geolite-databases-and-web-services
Google web-vitals license: Apache-2.0, https://github.com/GoogleChrome/web-vitals/blob/main/LICENSE

## Kenya privacy
Engineering summary, not legal advice. Kenya's Data Protection Act 2019 and ODPC guidance require transparent, lawful, purpose-limited processing and safeguards. Even when raw IP is not retained, the server receives an IP and uses it transiently for GeoIP lookup; do not describe that as “no IP processing.” Site owners must provide an appropriate visitor notice and assess their lawful basis and cross-border processing. Update AfricaLatency's policy before production activation.

## Launch gates
1. Apply `sql/rum-beta-mvp.sql` to a dedicated preview database only.
2. Mount current GeoLite2 Country and ASN MMDBs at `/app/data`; verify account/license, attribution, update cadence and old-file deletion.
3. Install `maxmind` and `web-vitals`; verify gzip size of `rum.js` is under 3 KB and library is self-hosted.
4. Test site creation using real authenticated Supabase session, domain allowlist and per-key rate limit.
5. Send real browser vitals from an authorized preview hostname; verify rows contain no IP/full URL/query/UA/user IDs.
6. Validate p75 values and suppression under 30 samples.
7. Test dashboard at 390px and 1440px; obtain genuine screenshots.
8. Install on the live site only after preview passes. Do not publish the `/rum` page or product links before then.
