/* Accessible city rotation for the AfricaLatency homepage hero. */
(function () {
  'use strict';

  var target = document.querySelector('[data-city-rotator]');
  if (!target) return;

  var cities = ['Nairobi', 'Lagos', 'Johannesburg', 'Cairo', 'Accra', 'Casablanca'];
  var index = 0;
  var interval = 0;
  var swapTimer = 0;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducedMotion = !!(motionQuery && motionQuery.matches);
  var pageVisible = !document.hidden;
  var inView = true;

  function stop() {
    if (interval) window.clearInterval(interval);
    if (swapTimer) window.clearTimeout(swapTimer);
    interval = 0;
    swapTimer = 0;
  }

  function rotate() {
    index = (index + 1) % cities.length;
    if (reducedMotion) {
      target.textContent = cities[index];
      target.setAttribute('aria-label', cities[index]);
      return;
    }

    target.classList.add('is-changing');
    swapTimer = window.setTimeout(function () {
      target.textContent = cities[index];
      target.setAttribute('aria-label', cities[index]);
      window.requestAnimationFrame(function () {
        target.classList.remove('is-changing');
      });
      swapTimer = 0;
    }, 180);
  }

  function sync() {
    stop();
    if (!reducedMotion && pageVisible && inView) {
      interval = window.setInterval(rotate, 2500);
    }
  }

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target !== target) return;
        inView = entry.isIntersecting;
        sync();
      });
    }, { threshold: 0.01 });
    observer.observe(target);
  }

  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
    sync();
  });

  function updateMotionPreference() {
    reducedMotion = !!(motionQuery && motionQuery.matches);
    sync();
  }

  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', updateMotionPreference);
  else if (motionQuery && motionQuery.addListener) motionQuery.addListener(updateMotionPreference);

  sync();
}());
