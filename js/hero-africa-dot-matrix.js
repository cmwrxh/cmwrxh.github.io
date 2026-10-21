/* Lightweight animated uniform dot matrix for the homepage hero. */
(function () {
  'use strict';
  var section = document.querySelector('[data-africa-dot-hero]');
  var canvas = section && section.querySelector('[data-africa-dot-canvas]');
  if (!section || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  var CONFIG = { spacing: 18, radius: 1.5, minOpacity: 0.1, maxOpacity: 0.5, maxDpr: 2, maxDots: 10000 };
  var width = 1, height = 1, dpr = 1, points = [], rafId = 0, running = false;
  var visible = false, pageVisible = !document.hidden, lastTime = 0;
  var reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducedMotion = !!(reducedQuery && reducedQuery.matches);

  function randomizeTarget(point) {
    point.from = point.opacity;
    point.target = CONFIG.minOpacity + Math.random() * (CONFIG.maxOpacity - CONFIG.minOpacity);
    point.elapsed = 0;
    point.duration = 900 + Math.random() * 2600;
  }
  function resize() {
    var rect = section.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var spacing = CONFIG.spacing;
    var cols = Math.ceil(width / spacing) + 1, rows = Math.ceil(height / spacing) + 1;
    while (cols * rows > CONFIG.maxDots) {
      spacing += 2;
      cols = Math.ceil(width / spacing) + 1;
      rows = Math.ceil(height / spacing) + 1;
    }
    var old = points;
    points = [];
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var idx = y * cols + x, prior = old[idx];
      var p = { x: x * spacing, y: y * spacing,
        opacity: prior ? prior.opacity : CONFIG.minOpacity + Math.random() * (CONFIG.maxOpacity - CONFIG.minOpacity),
        from: 0, target: 0, elapsed: 0, duration: 1000 + Math.random() * 2500 };
      randomizeTarget(p);
      points.push(p);
    }
    draw();
  }
  function draw() {
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, width, height);
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, CONFIG.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, ' + p.opacity.toFixed(3) + ')';
      ctx.fill();
    }
  }
  function animate(timestamp) {
    rafId = 0;
    if (!running || reducedMotion || !pageVisible || !visible) return;
    var delta = lastTime ? Math.min(50, timestamp - lastTime) : 16;
    lastTime = timestamp;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      p.elapsed += delta;
      var t = Math.min(1, p.elapsed / p.duration);
      var eased = t * t * (3 - 2 * t);
      p.opacity = p.from + (p.target - p.from) * eased;
      if (t >= 1) randomizeTarget(p);
    }
    draw();
    rafId = window.requestAnimationFrame(animate);
  }
  function start() {
    if (running || reducedMotion || !pageVisible || !visible) return;
    running = true; lastTime = 0; rafId = window.requestAnimationFrame(animate);
  }
  function stop() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0; lastTime = 0;
  }
  function motionChanged() {
    reducedMotion = !!(reducedQuery && reducedQuery.matches);
    stop();
    if (reducedMotion) draw(); else start();
  }
  resize();
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(resize); ro.observe(section);
  } else window.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      visible = !!(entries[entries.length - 1] && entries[entries.length - 1].isIntersecting);
      if (visible) start(); else stop();
    }, { threshold: 0.01 });
    io.observe(section);
  } else { visible = true; start(); }
  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden; if (pageVisible) start(); else stop();
  });
  if (reducedQuery && reducedQuery.addEventListener) reducedQuery.addEventListener('change', motionChanged);
  else if (reducedQuery && reducedQuery.addListener) reducedQuery.addListener(motionChanged);
  if (reducedMotion) draw();
}());