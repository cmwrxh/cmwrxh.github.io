/* AfricaLatency hero: continuous matte network wave grid.
   Presentation-only animation; the map illustration below the hero remains separate. */
(function () {
  'use strict';

  var section = document.querySelector('[data-africa-dot-hero]');
  var canvas = section && section.querySelector('[data-africa-dot-canvas]');
  if (!section || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var CONFIG = {
    spacingX: 24,
    spacingY: 21,
    maxDpr: 1.75,
    maxDots: 4200,
    radius: 1.55,
    frameInterval: 1000 / 60,
    waveSpeed: 0.00072,
    waveFrequency: 0.0105,
    reducedMotion: false
  };

  var width = 0;
  var height = 0;
  var dpr = 1;
  var cols = 0;
  var rows = 0;
  var rafId = 0;
  var running = false;
  var visible = false;
  var pageVisible = !document.hidden;
  var reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducedMotion = !!(reducedMotionQuery && reducedMotionQuery.matches);
  var lastFrame = 0;
  var time = 0;
  var points = [];

  function resize() {
    var rect = section.getBoundingClientRect();
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = '100vw';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var spacingX = CONFIG.spacingX;
    var spacingY = CONFIG.spacingY;
    cols = Math.ceil(width / spacingX) + 2;
    rows = Math.ceil(height / spacingY) + 2;
    while (cols * rows > CONFIG.maxDots) {
      spacingX += 2;
      spacingY += 1;
      cols = Math.ceil(width / spacingX) + 2;
      rows = Math.ceil(height / spacingY) + 2;
    }

    points = new Array(cols * rows);
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        points[row * cols + col] = {
          x: (col - 1) * spacingX,
          y: (row - 1) * spacingY,
          row: row,
          col: col
        };
      }
    }
    draw(0);
  }

  function draw(elapsed) {
    ctx.clearRect(0, 0, width, height);

    var centerY = height * 0.5;
    var waveHeight = Math.min(38, Math.max(17, height * 0.045));
    var secondaryHeight = waveHeight * 0.38;
    var timePhase = elapsed * CONFIG.waveSpeed;

    for (var i = 0; i < points.length; i++) {
      var point = points[i];
      var baseY = point.y;
      var depth = (baseY - centerY) / Math.max(1, height * 0.5);
      var perspective = 0.72 + (1 - Math.min(1, Math.abs(depth))) * 0.58;
      var phase = point.x * CONFIG.waveFrequency + timePhase + point.row * 0.13;

      var waveA = Math.sin(phase) * waveHeight;
      var waveB = Math.sin(phase * 0.53 - timePhase * 0.72 + point.row * 0.21) * secondaryHeight;
      var waveC = Math.cos(phase * 0.29 + timePhase * 0.4) * 7;
      var y = centerY + (baseY - centerY) * perspective + (waveA + waveB + waveC);
      var x = point.x + Math.sin(phase * 0.19 + point.row * 0.08) * 5;

      var topFade = Math.min(1, Math.max(0, y / Math.max(1, height * 0.22)));
      var bottomFade = Math.min(1, Math.max(0, (height - y) / Math.max(1, height * 0.22)));
      var edgeFade = Math.min(topFade, bottomFade);
      edgeFade = edgeFade * edgeFade * (3 - 2 * edgeFade);

      var waveEnergy = (Math.sin(phase + point.row * 0.07) + 1) * 0.5;
      var alpha = (0.11 + waveEnergy * 0.38) * edgeFade;
      if (Math.abs(depth) > 0.92) alpha *= 0.62;
      if (alpha < 0.025) continue;

      var cyan = (point.row + point.col) % 4 === 0;
      ctx.beginPath();
      ctx.arc(x, y, CONFIG.radius * (0.82 + waveEnergy * 0.24), 0, Math.PI * 2);
      ctx.fillStyle = cyan
        ? 'rgba(0, 163, 255, ' + alpha.toFixed(3) + ')'
        : 'rgba(59, 130, 246, ' + alpha.toFixed(3) + ')';
      ctx.fill();
    }
  }

  function animate(timestamp) {
    rafId = 0;
    if (!running || reducedMotion || !pageVisible || !visible) return;

    if (lastFrame && timestamp - lastFrame < CONFIG.frameInterval - 1) {
      rafId = window.requestAnimationFrame(animate);
      return;
    }
    var delta = lastFrame ? Math.min(40, timestamp - lastFrame) : CONFIG.frameInterval;
    lastFrame = timestamp;
    time += delta;
    draw(time);
    rafId = window.requestAnimationFrame(animate);
  }

  function start() {
    if (running || reducedMotion || !pageVisible || !visible) return;
    running = true;
    lastFrame = 0;
    rafId = window.requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
    lastFrame = 0;
  }

  function updateMotionPreference() {
    reducedMotion = !!(reducedMotionQuery && reducedMotionQuery.matches);
    stop();
    if (reducedMotion) draw(0);
    else start();
  }

  resize();

  if ('ResizeObserver' in window) {
    var resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(section);
  } else {
    window.addEventListener('resize', resize, { passive: true });
  }

  if ('IntersectionObserver' in window) {
    var intersectionObserver = new IntersectionObserver(function (entries) {
      var entry = entries[entries.length - 1];
      if (!entry) return;
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    }, { threshold: 0.01 });
    intersectionObserver.observe(section);
  } else {
    function checkVisibility() {
      var rect = section.getBoundingClientRect();
      visible = rect.bottom > 0 && rect.top < window.innerHeight;
      if (visible) start();
      else stop();
    }
    window.addEventListener('scroll', checkVisibility, { passive: true });
    window.addEventListener('resize', checkVisibility, { passive: true });
    checkVisibility();
  }

  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
    if (pageVisible) start();
    else stop();
  });

  if (reducedMotionQuery && reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener('change', updateMotionPreference);
  } else if (reducedMotionQuery && reducedMotionQuery.addListener) {
    reducedMotionQuery.addListener(updateMotionPreference);
  }

  if (reducedMotion) draw(0);
  else start();
}());
