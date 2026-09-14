/* Geo-aware homepage dogfooding copy. Country is resolved server-side by Vercel. */
(function () {
  'use strict';

  function countryName(code) {
    if (!code) return null;
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || null;
    } catch (_) {
      return null;
    }
  }

  function setTimingCopy() {
    const value = document.querySelector('[data-dogfood-value]');
    if (!value) return;

    const nav = performance.getEntriesByType('navigation')[0];
    const ms = nav && Number.isFinite(nav.loadEventEnd) && nav.loadEventEnd > 0
      ? Math.round(nav.loadEventEnd)
      : Math.round(performance.now());

    const generic = `This page loaded in ${ms} ms`;
    value.textContent = generic;

    fetch('/api/geo-country', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const country = countryName(data && data.country);
        if (country) value.textContent = `This page loaded in ${ms} ms for you, browsing from ${country}.`;
      })
      .catch(() => {
        value.textContent = generic;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setTimingCopy, { once: true });
  } else {
    setTimingCopy();
  }
}());
