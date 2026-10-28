# F3 Review Packet

## CI
- Report repair CI run #40723826155 passed all four jobs at head `e870f28efe1b338421a3bd46dece5a9951f72aa3`.
- Follow-up cache-header change is at `d837b0b66a3aa375e45c4bc338f183a4b17f886b`; Report repair CI run #40724164185 was still pending at the time of this note. Do not treat this follow-up SHA as green until its run completes.
- Worker tests passed at the follow-up SHA: run #40724164239.
- Visual capture is separate from Lighthouse and uses Puppeteer/CDP.

## Frame schedule
Each profile attempts these timed frames:
- Desktop: 1366×768 at device scale factor 2
- Mobile: 390×844 at device scale factor 3
- Timed frames: 250 ms, 500 ms, 1000 ms, 1500 ms, 2000 ms, 3000 ms, 5000 ms
- Additional frames when observed: FCP, LCP, document load, visually complete
- Timed and milestone captures use WebP quality 90; visually-complete uses PNG.
- Derivatives: blurred 320px WebP thumbnail and 640px WebP, with long-lived storage cache headers.
- Filenames encode profile, index, timing, milestone label, and overlay flag. Signed listing rejects thumbnail derivative filenames.

## Preview scan and screenshot evidence
Checked Vercel deployments for branch `task/f3-visual-capture-redo`: no deployments returned. Also checked recent deployments for that branch: none returned. Therefore no preview URL was available for a live scan, and no live frame list or full-resolution screenshot is attached. No production scan or deployment was performed.

## Regex finding
The filename validator's regex is a regex literal with ordinary single escapes (for example, `\d` and `\.`), not a double-escaped regex bug. The real filename validation defect found by CI was that derivative names ending in `-thumb.webp` and `-640.webp` were accepted as original frames. Those are now rejected.

## Remaining verification
- Confirm Report repair CI is green on the latest head SHA before marking F3 CI-green.
- Live preview verification remains unavailable unless a preview deployment is created by the hosting integration.
