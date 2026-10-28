# Report repair progress

| Task | Status | PR | Last commit SHA |
|---|---|---:|---|
| F0 CI gates | in-PR | #141 | 0dfaf5ac1fdde2f2f88cdea582bc36a3d0ea6c26 |
| F1 normalized report schema/statuses | ci-green | #142 | 04f07f5768db9862dc4334cee6ff213bc972a111 |
| F2 Lighthouse audits/opportunities/resource summary | ci-green | #143 | 2100404b28b6efb525ace309875890eaa52227b9 |
| F3 screenshot/filmstrip capture and playback states | ci-green | #144 | 8437c3a09b4f351fde1619c7a422708f12aca19e |
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
- F0 PR #141 removes the pull_request branch filter. API query for current head 0dfaf5a returned no PR-triggered workflow runs; keep F0 in-PR pending direct run evidence for that head. Report repair CI did run successfully on PR #142 and PR #143.
- F1 latest head 04f07f5: Report repair CI run #40714491747 green, all four jobs green. Worker tests 13/13; auth return-path 32/32; report filmstrip 5/5.
- F2 latest head 2100404: Report repair CI run #40714742948 green, all four jobs green. Worker tests 12/12; added coverage for real audit score, returned opportunity savings, stripped query parameters, transferred bytes, and request timing.
- F3 redo PR #144 is draft and targets integration/report-repair. Adds separate Puppeteer visual capture, high-resolution storage/signing helpers, filmstrip UI and initial tests. CI and implementation remain incomplete; live preview verification not yet performed.
- Historical PRs #134 and #135 were previously merged to main, outside this integration branch. No new merge to main was made in this run.
- No merge to main, deployment, SQL application, production config, or secret changes.
