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


## Review follow-up fixes

- [x] Restored manifest, mobile-web-app and Apple web-app metadata, canonical URL, Open Graph/Twitter metadata, favicon and Apple touch icon links from `main`.
- [x] Restored the `/service-worker.js` registration and FAQPage JSON-LD.
- [x] Restored the original homepage sections below the redesigned hero and tab strip, in original order: regional performance, workflow showcase, paid audit baseline, trust/safety, audience, FAQ, get-started banner.
- [x] Restored the legacy regional map and feature/showcase assets and their CSS dependencies. The old hero-dot files are restored in the repository but are not loaded by the redesigned homepage.
- [x] DotField now throttles draws to at most 30 fps and pauses when the hero is outside the IntersectionObserver viewport.
- [x] Reworded Collaborate tab in customer-facing language.
- [x] Canonical remains `https://www.africalatency.dev/`: main's CNAME contains `africalatency.dev`, and `vercel.json` does not establish a non-www canonical requirement. CNAME alone does not prove which host is served; the requested main canonical was preserved.
- [x] Kept analytics opt-in consent behavior without loading legacy `js/main.js` on the redesigned header, because that script rewrites the navigation/footer and injects the old sitewide dot layer.
- [ ] Self-host Plus Jakarta Sans remains blocked: font binaries could not be retrieved in this execution environment. Google Fonts links were removed, so fallback system fonts apply until valid WOFF2 assets are added. Do not merge until this is completed or explicitly waived.
- [ ] Screenshot workflow must finish against the updated head before visual review is considered complete.

### Country-count audit and proposed wording

The main homepage previously used both **9 African countries** (analysis label/card copy) and **up to 31 countries** (FAQ and Open Graph description). These describe different historical scopes and are inconsistent. Proposed single wording: **“We request measurements from up to 31 African countries; live results appear only where probes are available.”** Avoid implying that all 31 locations are currently live. This update normalizes the homepage analysis label to that wording; other pages still need a repository-wide audit before a site-wide claim of consistency can be certified.

### `js/main.js` homepage behavior review

- Cookie-consent banner with accept/reject choices; loads `/africalatency.js` only after acceptance.
- Rebuilds desktop navigation/dropdowns and the mobile full-screen menu.
- Adds a sitewide Africa dot-matrix canvas, adjusts header scroll styling and brand markup.
- Hides a legacy mobile sticky scan banner.
- Normalizes/replaces footer markup.
- It does **not** implement auth-aware login/logout state or session-aware header behavior. The redesign keeps the new accessible mobile menu and opt-in analytics consent, and intentionally does not load `main.js` because its header/footer mutations and sitewide dot layer conflict with the new design.


## Round 2 review fixes

- [x] Removed the duplicated visible FAQ block. The homepage now has one “Common questions.” heading and three visible FAQ items.
- [x] The free-scan label is restored to **“9 African countries”**, matching `worker/index.js`. FAQ, FAQPage JSON-LD and Open Graph description now state that the free scan requests measurements from nine African countries and live regional results depend on probe availability. Visible FAQ copy and JSON-LD answers/questions are aligned.
- [x] Removed broad global stylesheets (`style.css`, `brand.css`, `hero-theme.css`, `gtmetrix-color-system.css`, `desktop-header-canvas-fix.css`) from the homepage. Restored section styles remain for the legacy content; the new homepage stylesheet is loaded last to protect the redesigned header/hero/features/tabs. These legacy section styles still need screenshot verification at all three widths.
- [x] Added `@font-face` for Plus Jakarta Sans 400 and 700 with `font-display: swap`, plus preload links and system fallbacks.
- [x] Added one-time GitHub Actions workflow `.github/workflows/vendor-plus-jakarta-sans.yml` to download the two Latin WOFF2 assets from `@fontsource/plus-jakarta-sans` and commit them to `/fonts`.
- [ ] Awaiting the font workflow to commit the actual WOFF2 assets.
- [ ] Awaiting the homepage visual-review workflow and comparison artifact on this head before visual approval.


## Round 3 review fixes

- [x] Prefixed redesigned homepage shell classes with `al-` in HTML, CSS, and JavaScript to isolate the new header, hero, feature band, tabs, and footer.
- [x] Added `css/legacy-home.css` with layered imports for legacy global and restored-section stylesheets; it loads before the unlayered homepage redesign stylesheet.
- [x] Set the hero to pure black, feature band to the requested three-stop blue gradient, header to `#171619`, transparent header buttons, and content max width to 1280px.
- [x] Removed duplicate inline and `main.js` analytics consent banner paths. `js/compliance.js` remains the single consent owner using `africalatency_analytics_consent_v1`.
- [x] Extended font-vendoring workflow to 400, 500, 600 and 700 weights. Only 400 and 700 are preloaded.
- [x] Extended visual review to save viewport and full-page screenshots at 1280px, 820px and 390px and upload all artifacts.
- [ ] Inspect the new visual-review artifact and compare restored sections with main at 1280px and 390px before calling visual verification complete.
