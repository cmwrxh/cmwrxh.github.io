# Test my connection — Phase 1 notes

- Latency is ten same-origin HTTP request round trips, not ICMP ping. Report median, p95, and median absolute consecutive-sample difference as jitter.
- Download and upload figures are browser-measured HTTP throughput against bounded, no-cache endpoints. They are not a replacement for a properly integrated LibreSpeed engine; that licensed engine integration is a remaining task before public launch.
- Network metadata is resolved server-side. The endpoint does not write the request IP to the database, but the current fallback sends the request IP to ipapi.co for ASN/country resolution. Review this third-party processing in the privacy notice before launch; prefer a local GeoIP/ASN database if strict first-party handling is required.
- Store only resolved ASN/operator, country and coarse location if added later, and metrics. Do not add raw IP, full user agent, or precise coordinates.
- Never label a result mobile solely from browser downlink/effective type. Use explicit navigator.connection.type === 'cellular' or a positively identified known mobile operator. Otherwise label it “This device’s connection.”
- Do not show operator rankings or aggregates unless there are at least 30 valid tests for that operator in the calendar month. Always show sample count and “Crowdsourced, self-selected sample.”
- RUM is phase 2 and is not implemented by this branch. It must be privacy-preserving, consent-aware, sampled, and must not collect URLs containing query strings, user identifiers, form fields, raw IPs, or payment content.
