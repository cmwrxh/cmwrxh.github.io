# Report repair progress

| Task | Status | PR | Last commit SHA |
|---|---|---:|---|
| F0 CI gates | in-PR | #141 | 0dfaf5ac1fdde2f2f88cdea582bc36a3d0ea6c26 |
| F1 normalized report schema/statuses | in-PR | #142 | 862dc1f9fea6f971241332c26a735961795c4ea7 |
| F2 Lighthouse audits/opportunities/resource summary | todo | — | — |
| F3 screenshot/filmstrip capture and playback states | todo | #134 (existing implementation; verify integration) | 8e6aceb412c350265b1945142941cc54210d2175 |
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
- F0 workflow has lint/syntax, site unit, generated CSS/build, and worker-test jobs. Pull-request trigger branch filter removed in PR #141; current updated PR head has no run returned yet.
- F1 commit 862dc1f has a completed successful Report repair CI run (#40713361432); all four jobs passed, including npm test, auth return-path tests, report filmstrip tests, syntax checks, and generated CSS/static validation.
- PR #132 is superseded by PR #134. PR #134's description says it replaces #132 and implements real Lighthouse filmstrip storage/signing and report.html UI. F3 should extend/verify that implementation and canonical /reports/<id> UI from PR #135, not duplicate it.
- No merge to main, deployment, SQL application, production config, or secret changes.
