# Homepage reference redesign implementation checklist

Branch: `feat/africalatency-homepage-dotfield`

## Scope and implementation status

- [x] Rebuild the homepage around the supplied four-section reference layout.
- [x] Keep AfricaLatency wordmark assets and real route destinations.
- [x] Header destinations verified from the existing homepage: **Log In** → `/login`; **Try for FREE** → `/scan`.
- [x] Keep the scan submission contract: normalize a public URL, then navigate to `/scan?url=<encoded URL>`.
- [x] Verify `js/scan-v2.js`: it reads only `url` from the query string; it does **not** read a device from `/scan?url=...`. It initializes `selectedDevice = 'mobile'` and reads the selected device from existing `[data-device]` controls. Therefore, no Mobile/Desktop toggle is shown on the homepage and `js/scan-v2.js` is unchanged.
- [x] Replace the old homepage dot canvas with the new DotField implementation.
- [x] Rotating words are exactly: AI-Built, WordPress, e-commerce, fintech, mobile-first, SaaS, agency, Next.js; 2.6-second interval and 450ms fade transition.
- [x] Six reference icon styles are mapped to the six updated card titles using inline SVG.
- [x] Four tabs remain in their requested order and have keyboard-accessible controls.
- [x] Built features are linked to current scan/report routes; unbuilt features are marked Coming soon with existing monitoring/contact/docs destinations.
- [x] Use semantic landmarks, a skip link, labelled URL input, visible focus styles, accessible tabs, mobile menu labels and reduced-motion handling.
- [x] Preserve existing scan, auth, report, checkout and monitoring pages and endpoints; no backend changes.

## Card claims

- [x] Lighthouse performance metrics: describe returned lab metrics, not field/CrUX data.
- [x] Mobile and desktop testing: describe existing scan profiles; the selector remains on the scan page.
- [x] Monitoring and alerts: Coming soon.
- [x] Request-level resource analysis: describe available resource/timing data without claiming a full phase-by-phase waterfall.
- [x] Real-user metrics: Coming soon on general reports; explicitly note CrUX is not connected and RUM needs site setup.
- [x] African network measurements: describe point-in-time results from available probes across nine requested countries, not guaranteed live coverage.

## Security and font audit

- [x] Searched repository source for a Content-Security-Policy meta tag/header and `script-src`; none was found in tracked source. `server.js` does not define a CSP.
- [x] Plus Jakarta Sans uses the Google Fonts stylesheet because no application-level CSP was found that blocks it.
- [ ] Hosting/CDN-level response headers were not verifiable from repository source alone. If the deployed environment adds a restrictive CSP, self-host Plus Jakarta Sans before production promotion.

## Old dot effect removal

- [x] Remove the old homepage-specific `js/hero-africa-dot-matrix.js` reference and file.
- [x] Remove the old homepage-specific `css/hero-africa-dot-matrix.css` reference and file.
- [x] Remove old homepage references to the Africa map illustration scripts from the homepage only; shared scripts remain in the repository because this PR does not prove they are unused by other routes.
- [x] The new homepage loads only `js/homepage-reference-redesign.js` for DotField and interactions.

## Visual review

- [x] Add a reference HTML fixture and a Playwright visual-review script.
- [x] Add an automated workflow to capture the implementation and reference at 1280px, 820px and 390px and upload the side-by-side comparison images as a workflow artifact.
- [x] Browser screenshots and side-by-side comparisons generated at 1280px, 820px and 390px; inspected for layout, contrast, responsive behavior and consent-banner overlap.
- [ ] Lighthouse scores and a live-device cross-browser pass are not claimed in this PR until run against a deployed preview.

## Deviations and known limitations

- The requested homepage Mobile/Desktop toggle is omitted because the URL query contract does not accept the device profile from the homepage link. Existing selection on `/scan` remains untouched.
- No feature is invented for Monitor, Collaborate or Integrate with AI tabs. Monitor links to the existing waitlist, Collaborate to Contact, and AI integration to the existing API documentation.
- Screenshots are from a static local HTTP preview of the PR branch, not a deployed Coolify preview. Lighthouse scores and a live-device cross-browser pass remain unverified.
- The repository does not contain a CSP declaration. A hosting-layer CSP could not be ruled out from tracked files alone.

## Files in this PR

### Modified
- `index.html`

### Added
- `css/homepage-reference-redesign.css`
- `js/homepage-reference-redesign.js`
- `SPEC.md`
- `docs/visual-review/reference.html`
- `scripts/visual-review.mjs`
- `.github/workflows/homepage-visual-review.yml`

### Deleted
- `css/hero-africa-dot-matrix.css`
- `js/hero-africa-dot-matrix.js`

No other application files are intended to change.
