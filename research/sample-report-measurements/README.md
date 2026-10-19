# Sample report measurement collection

This branch contains a measurement-only runner. It deliberately does not implement or modify the sample report page.

## Triggering a single measurement

1. Open **Actions → Sample report measurements → Run workflow** on branch `research/sample-report-measurements`.
2. Select one country: KE, ZA, NG, GH, EG, UG, or TZ.
3. Choose 3 probes by default. Choose 5 only when the first results suggest enough probes are available.
4. Run it once. The workflow uploads a `measurement-output/*.json` artifact even when the API returns an error/unavailable result.
5. Download the artifact and retain it as raw evidence. Do not use a failed result as a numeric datapoint.

The workflow is **manual-dispatch only**. It has no cron schedule and will not start measurements by itself. It uses the public unauthenticated Globalping API and no API token, GitHub secret, production database, preview server, or RIPE Atlas credits. One invocation requests one HTTP measurement for one country, with a cap of five probes. It polls at one request per second.

## Required sampling protocol before calculating country summaries

- Collect at least five separate workflow runs per country, deliberately spread across different times of day. Do not launch them back-to-back.
- Since probe selection is dynamic, preserve each run's exact raw response, measurement ID, requested country, timestamps, returned probe count, network, ASN, HTTP timing data, status, and errors.
- Calculate median and min/max from comparable successful values only. Report both the number of successful measurements and the number of distinct probes/networks observed; do not imply the same probe was used in every run.
- Flag a country as **low confidence** if fewer than three probes answered. If no usable probe answered, report **Unavailable** and state the returned reason.
- Keep RIPE Atlas probe 1018329 as a separate, clearly labeled South Africa datapoint. It must never be included in Globalping country medians.
- Do not start a bulk campaign without explicit user approval. A full first pass of seven countries × five time-separated runs × up to five probes could involve as many as 175 probe tests.

## Metric and hosting notes

- Target: `https://africalatency.dev/` (production hostname, not the preview server).
- Measurement type: Globalping HTTP. Preserve raw timing fields and confirm their precise semantics before naming them in a public report. These are network/HTTP measurements, not Lighthouse page-quality scores.
- Record hosting origin/server region and CDN separately in the final methodology only after independently verifying them. This workflow does not change DNS, hosting, deployment configuration, or secrets and does not infer origin location from a CDN response.
- GTmetrix Grade A / Performance 90% / Structure 99% must remain attributed to **GTmetrix, Seattle, 19 Oct 2026**. Its Structure score is not AfricaLatency's Scan V2 Structure score.
- Do not publish recommendations unless supported by observed findings.

## Approval gate

This branch intentionally contains no public page implementation and no page links. The raw country summary table must be presented to Charles for review and explicit approval before these figures are incorporated into any public-facing page.

## GitHub Actions activation constraint

GitHub requires a `workflow_dispatch` workflow file to exist on the repository's default branch before it can be manually dispatched. This PR intentionally does not change the default branch. Therefore the workflow is prepared for review but will not be dispatchable until you explicitly approve putting this workflow file on the default branch (or choose another approved runner path). No measurements have been launched from this PR.
