/*
AfricaLatency RUM — Phase 2 proposal, NOT enabled by this branch.
Install only after consent, privacy review, endpoint implementation, and sampling controls.
Do not collect full URLs, query strings, user IDs, form data, raw IP addresses, or payment data.
*/
(function () {
  'use strict';
  if (window.__AFRICALATENCY_RUM_ENABLED__ !== true) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  if (!('PerformanceObserver' in window) || !navigator.sendBeacon) return;
  var sampleRate = 0.05;
  if (Math.random() > sampleRate) return;
  var payload = { page_path: location.pathname.slice(0, 160), metrics: {} };
  try {
    var po = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (entry.entryType === 'largest-contentful-paint') payload.metrics.lcp_ms = Math.round(entry.startTime);
        if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) payload.metrics.cls = (payload.metrics.cls || 0) + entry.value;
        if (entry.entryType === 'event' && entry.interactionId && entry.duration) payload.metrics.inp_ms = Math.max(payload.metrics.inp_ms || 0, Math.round(entry.duration));
      });
    });
    ['largest-contentful-paint', 'layout-shift', 'event'].forEach(function (type) {
      try { po.observe({ type: type, buffered: true, durationThreshold: 40 }); } catch (_) {}
    });
    window.addEventListener('pagehide', function () {
      if (Object.keys(payload.metrics).length) navigator.sendBeacon('/api/rum-vitals', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    }, { once: true });
  } catch (_) {}
})();