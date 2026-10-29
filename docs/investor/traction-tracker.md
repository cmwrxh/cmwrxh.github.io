# Customer and traction proof tracker
Keep values blank until evidence exists. Attach a source reference for every entry: sanitized query output, redacted invoice/payment record, dated test artifact, or written permission. Do not infer customers from scans or test accounts.

| Metric | Value | Period/date | Evidence | Definition/notes |
|---|---|---|---|---|
| Paid audits delivered |  |  |  | Completed and delivered, with proof |
| Free diagnostics |  |  |  | Deduplicate by scan/report ID; exclude internal tests |
| Pilots |  |  |  | Name only with permission |
| Paid invoices |  |  |  | Settlement verified; redact personal data |
| Recognized revenue |  |  |  | Founder reports no revenue yet; confirm accounting period |
| Active customer sites |  |  |  | Define active window; exclude test-* |
| Repeat usage |  |  |  | Distinct non-test accounts/sites in defined window |
| Quotes |  |  |  | Quote/date/written permission/approved attribution |
| Before/after results |  |  |  | Same target/method/conditions, sample sizes and permission |
| Approved logos/case studies |  |  |  | Written permission required |
| Free-to-paid conversion |  |  |  | Defined numerator, denominator and period |

## Evidence handling
- Prefix test entities with `test-`; exclude them from investor metrics.
- Maintain a test account/site allowlist or explicit test flag.
- Save query, timestamp, environment label and redacted export.
- Never include emails, raw IPs, tokens, payment secrets or signed URLs.
- Obtain founder approval before publishing names, logos, quotes or identifiable screenshots.