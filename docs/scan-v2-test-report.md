# Scan V2 test report

Date: 2026-10-19
Branch: `feature/scan-v2`

## Implemented checks

- Unit tests added for score median, letter-grade thresholds, Structure composite, disallowed URL schemes, localhost, private/link-local literal IPs, URL credentials and non-standard ports.
- Worker-side URL and DNS validation runs before Lighthouse; redirect destinations are manually followed and revalidated up to five redirects.
- The SQL migration defines RLS-protected scan tables, hashed-IP rate limits, an atomic global queue cap, and an atomic queue claim.
- Scan V2 endpoints use an internal worker token; the service key is referenced only by the worker implementation. No production secrets were edited.
- Mobile is the default profile. Authenticated scans are configured for three sequential runs and median aggregation.
- A separate test workflow was added so the unit tests can run in GitHub Actions.

## Not yet verified

- The unit tests have been authored but have not yet been executed in this tool session.
- No preview deployment was created and no live Lighthouse scan was run from this branch.
- Therefore, no real screenshots of each progress stage or a completed report are attached. Capturing those requires deploying the branch to a non-production Coolify preview with Turnstile and worker environment variables configured.
- SSRF acceptance is not complete until the worker container has a tested network egress policy blocking private/reserved/link-local destinations and cloud metadata IPs. DNS/redirect checks alone are not sufficient against browser subresources and DNS rebinding.
- Production migration application, secret configuration, and deployment remain intentionally out of scope pending separate approval.

## Preview test checklist

1. Verify an anonymous scan is rejected when Turnstile is missing/invalid and accepted after successful challenge.
2. Scan a controlled public URL with Mobile selected; capture queue, fetching, Lighthouse, African measurement and report stages.
3. Repeat on Desktop and verify cache reuse for the same URL + device within four hours.
4. Verify a logged-in scan reports the median of three runs and that the same report unlocks after login.
5. Verify private IP, loopback, metadata IP, non-HTTP scheme, credentials, non-standard port and private redirect destinations are rejected.
6. Confirm queue cap under parallel submissions, one-worker concurrency, stale-job recovery/alert marker, and anonymous retention.
7. Confirm Globalping results are shown only when the provider returns completed ping RTT values; other countries say unavailable.
8. Confirm the API key path is rate-limited and keys are stored as hashes.
