# Report repair progress

| Task | Status | PR | Last commit SHA |
|---|---|---:|---|
| F0 CI gates | in-PR | #141 | 0dfaf5ac1fdde2f2f88cdea582bc36a3d0ea6c26 |
| F1 normalized report schema/statuses | ci-green | #142 | 04f07f5768db9862dc4334cee6ff213bc972a111 |
| F2 Lighthouse audits/opportunities/resource summary | ci-green | #143 | 2100404b28b6efb525ace309875890eaa52227b9 |
| F3 screenshot/filmstrip capture and playback states | todo | #134 merged; #135 follow-up | 8e6aceb412c350265b1945142941cc54210d2175 |
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
- F0 PR #141 removes the pull_request branch filter. No PR-triggered run has been returned for its current head SHA; keep F0 in-PR until evidence exists.
- F1 latest head 04f07f5: Report repair CI run #40714491747 green, all four jobs green. Worker test log: 13/13 passed; auth return-path 32/32 and report filmstrip 5/5 passed.
- F2 latest head 2100404: Report repair CI run #40714742948 green, all four jobs green. Worker tests 12/12 passed; the additional test verifies actual audit score, returned opportunity savings, stripped query parameters, transferred bytes, and request timing.
- PR #134 is merged to main (merge state confirmed); it replaces #132 and implements actual Lighthouse filmstrip extraction/storage/signing and legacy report UI. F3 should verify/build on this plus canonical dashboard follow-up #135, not duplicate the feature.
- No merge to main, deployment, SQL application, production config, or secret changes.
