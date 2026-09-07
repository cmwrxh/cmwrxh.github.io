/* africalatency.js — AfricaLatency RUM snippet v1.0
 * Install (customer sites):
 *   <script defer src="https://africalatency.dev/africalatency.js" data-al-key="YOUR_SITE_KEY"></script>
 * Uses web-vitals (v4, CDN) for Core Web Vitals + Navigation Timing fallback.
 * Sends one beacon per page view via navigator.sendBeacon (async, never blocks unload).
 */
(function () {
  'use strict';

  var cs = document.currentScript;
  var KEY = cs && cs.getAttribute('data-al-key');

  if (!KEY) return;

  var ENDPOINT =
    'https://www.africalatency.dev/api/rum?k=' + encodeURIComponent(KEY);

  var metrics = {};
  var timer = null;

  function flush() {
    if (!metrics.ttfb && !metrics.lcp && !metrics.load) return;

    metrics.url = location.href;
    metrics.ct =
      (navigator.connection && navigator.connection.effectiveType) || '';

    try {
      navigator.sendBeacon(
        ENDPOINT,
        new Blob([JSON.stringify(metrics)], {
          type: 'text/plain'
        })
      );
    } catch (e) {
      /* never break the customer's page */
    }

    metrics = {};
  }

  function hold(m) {
    for (var k in m) {
      metrics[k] = m[k];
    }

    clearTimeout(timer);
    timer = setTimeout(flush, 5000);
  }

  window.addEventListener('pagehide', flush);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  });

  var s = document.createElement('script');

  s.src = 'https://unpkg.com/web-vitals@4/dist/web-vitals.iife.js';

  s.onload = function () {
    var w = window.webVitals;

    if (!w) return;

    if (w.onTTFB) {
      w.onTTFB(function (x) {
        hold({ ttfb: Math.round(x.value) });
      });
    }

    if (w.onFCP) {
      w.onFCP(function (x) {
        hold({ fcp: Math.round(x.value) });
      });
    }

    if (w.onLCP) {
      w.onLCP(function (x) {
        hold({ lcp: Math.round(x.value) });
      });
    }

    if (w.onINP) {
      w.onINP(function (x) {
        hold({ inp: Math.round(x.value) });
      });
    }

    if (w.onCLS) {
      w.onCLS(function (x) {
        hold({
          cls: Math.round(x.value * 1000) / 1000
        });
      });
    }
  };

  s.onerror = function () {
    // Fallback when the CDN is unreachable: raw Navigation Timing only.
    try {
      var nav = performance.getEntriesByType('navigation')[0];

      if (nav) {
        hold({
          ttfb: Math.round(nav.responseStart),
          load: Math.round(nav.duration)
        });
      }
    } catch (e) {}
  };

  document.head.appendChild(s);
})();
