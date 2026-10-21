/* Lightweight animated regional network illustration. This is visual context, not live telemetry. */
(function () {
  'use strict';
  var panel = document.querySelector('[data-network-illustration]');
  if (!panel) return;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    panel.classList.add('network-illustration-static');
    return;
  }
  if (!('IntersectionObserver' in window)) {
    panel.classList.add('network-illustration-active');
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        panel.classList.add('network-illustration-active');
      } else {
        panel.classList.remove('network-illustration-active');
      }
    });
  }, { threshold: 0.12 });
  observer.observe(panel);
}());
