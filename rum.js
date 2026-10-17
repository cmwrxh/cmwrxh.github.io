/* AfricaLatency RUM Beta. Google web-vitals is Apache-2.0 licensed. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute('data-key') || '';
  if (!/^rum_pub_[a-f0-9]{48}$/.test(key)) return;
  var rawRate = Number(script.getAttribute('data-sample-rate'));
  var rate = Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 1 ? rawRate : 1;
  if (rate === 0 || Math.random() > rate) return;
  var endpoint = new URL('/api/rum', script.src).href;
  var path = location.pathname.slice(0, 512) || '/';
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var connectionType = connection && (connection.type || connection.effectiveType) || 'unknown';
  var events = [];
  var sent = false;
  function send(metric) {
    if (!metric || !['LCP', 'INP', 'CLS', 'TTFB'].includes(metric.name) || !Number.isFinite(metric.value) || metric.value < 0) return;
    events.push({ metric: metric.name, value: metric.value, path: path, connection_type: connectionType });
    if (events.length >= 4) flush();
  }
  function flush() {
    if (sent || !events.length || !navigator.sendBeacon) return;
    var payload = new URLSearchParams();
    payload.set('key', key);
    payload.set('events', JSON.stringify(events.slice(0, 8)));
    try { if (navigator.sendBeacon(endpoint, payload)) sent = true; } catch (_) {}
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
