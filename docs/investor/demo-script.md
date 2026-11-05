# Live demo script (5–7 minutes)
Environment: preview plus an approved public read-only demo. No production writes, paid checkout, real customer data or live alerts without separate approval.

1. **0:00–0:40 — Context.** Pre-seed product; no revenue yet; demo is not an uptime/SLA promise.
2. **0:40–1:35 — Scan.** Run a permitted public test URL. Show progress and status. If it fails, show the sanitized error and dated backup capture; do not pretend the recording is live.
3. **1:35–2:20 — Report/filmstrip.** Show metrics actually returned and frames if available. State when frames are missing/expired.
4. **2:20–3:05 — African RTT.** Show actual probe/location label, timestamp, method, sample count and status. Missing probes are not zero latency. Explain community probe limitations.
5. **3:05–3:45 — Mobile vs desktop.** Compare same target with profile and timestamps; note run-to-run variation.
6. **3:45–4:15 — History.** Use only a test account after account isolation is verified.
7. **4:15–4:45 — API.** Use disposable preview credential held in a secret manager. Never record keys. If key issuance isn't verified, show a clearly labeled illustrative example.
8. **4:45–5:20 — RUM.** Show only real preview test events; otherwise state live capture is unverified.
9. **5:20–6:00 — Monitoring.** Keep scheduler and alerts OFF. Use isolated mock/fixture only; never cause a real service outage or send real alerts. If unavailable, show the diagram and label it unverified.
10. **6:00–6:30 — Close.** Customer proof, recurring revenue, production verification and hardening are next milestones.

## Checklist
- [ ] Preview URL, environment and commit SHA recorded.
- [ ] Read-only public demo scope approved; no production writes.
- [ ] Test entities named `test-*`; no customer data.
- [ ] Scan/report/filmstrip/history checked.
- [ ] RTT labels, sample count, timestamp and failures visible.
- [ ] Credentials excluded from slides/recording.
- [ ] RUM uses real preview test events; monitoring scheduler/alerts remain off.
- [ ] Recording reviewed/redacted and labeled with date, environment and SHA.

## Fallback
Use a redacted capture with its recording date and SHA, or skip the segment and explain the gap. A recording is not proof of current availability.