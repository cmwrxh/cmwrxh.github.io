/* AfricaLatency RUM Beta. Google web-vitals is Apache-2.0 licensed. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute('data-key') || '';
  if (!/^rum_pub_[a-f0-9]{48}$/.test(key)) return;
  var rateAttribute = script.getAttribute('data-sample-rate');
  var rawRate = rateAttribute === null ? 1 : Number(rateAttribute);
  var rate = Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 1 ? rawRate : 1;
  if (rate === 0 || Math.random() > rate) return;
  var endpoint = new URL('/api/rum', script.src).href;
  function cleanPath(value) {
    return String(value || '/').split(/[?#]/, 1)[0].split('/').map(function (part) {
      if (!part) return '';
      if (part.indexOf('@') !== -1 || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) ||
          /^\d{4,}$/.test(part) || /^[A-Za-z0-9_-]{32,}$/.test(part)) return ':id';
      return part.slice(0, 80);
    }).join('/').slice(0, 512) || '/';
  }
  var path = cleanPath(location.pathname);
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var connectionType = connection && (connection.type || connection.effectiveType) || 'unknown';
  var events = [];
  function send(metric) {
    if (!metric || !['LCP', 'INP', 'CLS', 'TTFB'].includes(metric.name) || !Number.isFinite(metric.value) || metric.value < 0) return;
    events.push({ metric: metric.name, value: metric.value, path: path, connection_type: connectionType });
    if (events.length >= 4) flush();
  }
  function flush() {
    if (!events.length || !navigator.sendBeacon) return;
    var payload = new URLSearchParams();
    payload.set('key', key);
    payload.set('events', JSON.stringify(events.slice(0, 8)));
    try { if (navigator.sendBeacon(endpoint, payload)) events = []; } catch (_) {}
  }
  var library = document.createElement('script');
  library.src = new URL('/api/rum-library', script.src).href;
  library.async = true;
  library.onload = function () {
    var vitals = window.webVitals;
    if (!vitals) return;
    try { vitals.onLCP(send); vitals.onINP(send); vitals.onCLS(send); vitals.onTTFB(send); } catch (_) {}
  };
  (document.head || document.documentElement).appendChild(library);
  addEventListener('pagehide', flush, { once: true });
  addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
})();
