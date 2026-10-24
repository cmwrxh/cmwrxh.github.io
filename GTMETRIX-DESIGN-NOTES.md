# GTmetrix design pass A notes

- Use Plus Jakarta Sans only; font files are loaded locally with explicit preload/font-face declarations, not CSS import chains.
- No footer social row is rendered because verified social profile URLs were not found in schema.org `sameAs` or social metadata in the repository.
- TODO: add inline SVG social links only after verified official profile URLs are present in schema.org `sameAs` or page metadata.
- The Locations page names the nine configured product focus countries but does not imply live probes or complete measurement coverage for every country.
- QA screenshots are captured at 1280, 820, 720 and 390 CSS pixels and uploaded by the existing site-shell QA workflow as the `africalatency-site-shell-qa` artifact.
- Compare and Cases are explicitly checked for white content surfaces so the global design pass does not darken those pages.
