# AfricaLatency probe-provider layer

## Current state

- The scanner still requests its existing 31-country scope. Country-level requests allow Globalping to choose an available probe in each requested country, including new probes registered later; no node inventory or node totals are shown to customers.
- `lib/probe-providers/globalping.js` is the current adapter. `lib/probe-providers/index.js` defines the provider-neutral orchestration contract.
- The normalized record includes `provider`, `probe_type`, `country`, `city`, `asn`, `network_name`, `tags`, `timestamp`, `metrics`, status, and `raw_provider_payload` JSON.
- Probe type remains `unknown` unless provider-supplied tags give sufficient evidence. Missing timestamps remain null; we do not invent observation times.
- The UI reports the number of countries that returned completed results out of the 31 requested, excludes unavailable countries from comparisons, and labels provider/probe type/network metadata without showing node totals.
- Scan history stores bounded raw provider JSON alongside normalized metadata when an authenticated user chooses to save a scan.

## Policy configuration

`PROBE_POLICY` centralizes:
- `minimumProbesPerCountry` (currently 1 to limit measurement volume);
- `preferredProviderOrder` (currently Globalping only);
- `providerTimeoutMs` per provider.

The orchestrator tries providers in preferred order, records failures including rate-limit/quota outcomes, and can fall back to the next registered adapter. The registry supports later RIPE Atlas, owned-agent, and Speedchecker adapters with the same interface. Those providers are not active yet, so no fallback to them is claimed today.

When a country returns multiple candidates, selection favors a new ASN and then a new network name. The current default requests one probe, so diversity becomes relevant when the configured minimum is increased or providers return multiple candidates.

## Launch verification still required

- Apply the migration to a disposable preview database only.
- Mount licensed GeoLite2 Country and ASN MMDB files in the preview runtime.
- Deploy the Coolify preview and run real measurements from the public scanner against a controlled domain.
- Confirm newly registered African datacenter probes appear in country-level live results.
- Capture real-data screenshots at 390px and 1440px.
- Do not merge to `main` or publish RUM beta claims before all end-to-end gates pass.
