# Report repair progress

| Task | Status | PR | Last commit SHA |
|---|---|---:|---|
| F0 CI gates | done | #141 | 0dfaf5ac1fdde2f2f88cdea582bc36a3d0ea6c26 |
| F1 normalized report schema/statuses | ci-green | #142 | 04f07f5768db9862dc4334cee6ff213bc972a111 |
| F2 Lighthouse audits/opportunities/resource summary | ci-green | #143 | 2100404b28b6efb525ace309875890eaa52227b9 |
| F3 screenshot/filmstrip capture and playback states | done (merged) | #144 | 325cdd235f9ff73d0d123acd83a5e9fc1aa87ab8 |
| F4 scan profiles and optional repeat runs | todo | — | — |
| F5 truthful network waterfall | todo | — | — |
| F6 regional Globalping probes | todo | — | — |
| F7 CrUX and RUM | todo | — | — |
| F8 report history persistence/UI | todo | — | — |
| F9 alert persistence/delivery/UI | todo | — | — |
| F10 data-cost emulator | todo | — | — |
| F11 carrier matrix and route evidence | todo | — | — |
| F12 report/index UI polish and print | todo | — | — |

## Verification notes
- F0 CI gates are tracked as done for the report-repair workstream; #141 removed the pull_request branch filter. F3's CI workflow now also runs on pushes to task/** and integration/** plus workflow_dispatch, with no workflow-level concurrency cancellation.
- F1 latest head 04f07f5: Report repair CI run #40714491747 green, all four jobs green. Worker tests 13/13; auth return-path 32/32; report filmstrip 5/5.
- F2 latest head 2100404: Report repair CI run #40714742948 green, all four jobs green. Worker tests 12/12; added coverage for real audit score, returned opportunity savings, stripped query parameters, transferred bytes, and request timing.
- F3 PR #144 merged into integration/report-repair at merge commit 325cdd235f9ff73d0d123acd83a5e9fc1aa87ab8 (head 77235738798f5561a77d6e4656b25eaf9b9631f9). Report repair CI run #40724632703 and companion worker/auth runs passed on the exact PR head. Includes independent Puppeteer visual capture, high-quality signed frames, responsive player/lightbox, URL refresh, empty/partial/overlay/filename tests, and cache headers. The filename regex was not double-escaped; derivative filenames were the actual validation defect and are now rejected.
- Preview deployment lookup returned no Vercel preview for task/f3-visual-capture-redo; no live preview scan or full-resolution screenshot was possible. See REVIEW_PACKET.md for the explicit limitation. No production scan/deployment was performed.
- Workstream status: done F0–F3; next F4. Do not begin F4 until separately instructed.
- Historical PRs #134 and #135 were previously merged to main, outside this integration branch. No new merge to main was made in this run.
- No merge to main, deployment, SQL application, production config, or secret changes.
