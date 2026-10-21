/* Lightweight GTmetrix-inspired decorative hero network. No telemetry, trackers, or external dependencies. */
(function () {
  'use strict';
  var canvas = document.querySelector('[data-hero-network]');
  if (!canvas) return;
  var section = canvas.closest('[data-hero-network-section]');
  var context = canvas.getContext && canvas.getContext('2d');
  if (!context || !section) return;
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (motion && motion.matches) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var width = 0, height = 0, frame = 0, points = [], running = false;
  function resize() {
    var rect = section.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.max(24, Math.min(58, Math.round(width / 22)));
    points = [];
    for (var i = 0; i < count; i++) {
      points.push({
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22,
        r: Math.random() * 1.7 + .7, phase: Math.random() * Math.PI * 2
      });
    }
  }
  function draw() {
    if (!running) return;
    context.clearRect(0, 0, width, height);
    var now = Date.now() * .001;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < -8) p.x = width + 8;
      if (p.x > width + 8) p.x = -8;
      if (p.y < -8) p.y = height + 8;
      if (p.y > height + 8) p.y = -8;
      for (var j = i + 1; j < points.length; j++) {
        var q = points[j], dx = p.x - q.x, dy = p.y - q.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 138) {
          context.beginPath();
          context.strokeStyle = 'rgba(73, 180, 244,' + ((1 - dist / 138) * .22) + ')';
          context.lineWidth = .7;
          context.moveTo(p.x, p.y); context.lineTo(q.x, q.y); context.stroke();
        }
      }
      var pulse = .55 + .45 * Math.sin(now * 1.3 + p.phase);
      context.beginPath();
      context.fillStyle = 'rgba(99, 207, 255,' + (.25 + pulse * .48) + ')';
      context.shadowColor = 'rgba(52, 174, 255,.75)';
      context.shadowBlur = 7 * pulse;
      context.arc(p.x, p.y, p.r * (.8 + pulse * .45), 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    }
    frame = window.requestAnimationFrame(draw);
  }
  function start() { if (!running) { running = true; frame = window.requestAnimationFrame(draw); } }
  function stop() { running = false; if (frame) window.cancelAnimationFrame(frame); }
  resize();
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) start(); else stop(); });
    }, { threshold: 0.01 });
    observer.observe(section);
  } else start();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(section);
  else window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (!motion || !motion.matches) start(); });
}());
