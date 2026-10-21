/* AfricaLatency live hero particle field. Decorative only; never represents live telemetry. */
(function () {
  'use strict';
  var hero = document.querySelector('[data-africa-dot-hero]');
  var canvas = hero && hero.querySelector('[data-africa-dot-canvas]');
  if (!hero || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  var COUNT = window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? 115 : 230;
  var LINK_DISTANCE = 108;
  var MAX_DPR = 1.5;
  var dots = [], width = 1, height = 1, dpr = 1, raf = 0;
  var inView = false, running = false, pageVisible = !document.hidden, lastTime = 0;
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(motion && motion.matches);

  function resize() {
    var rect = hero.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    for (var i = 0; i < COUNT; i++) {
      var angle = Math.random() * Math.PI * 2;
      dots.push({
        x: Math.random() * width, y: Math.random() * height,
        vx: Math.cos(angle) * (.09 + Math.random() * .2),
        vy: Math.sin(angle) * (.07 + Math.random() * .16),
        r: .75 + Math.random() * 1.35,
        base: .24 + Math.random() * .48,
        phase: Math.random() * Math.PI * 2,
        twinkle: .004 + Math.random() * .009,
        bright: Math.random() < .13
      });
    }
    draw(0, false);
  }

  function draw(time, move) {
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, width, height);
    var step = move ? Math.min(32, time - (lastTime || time)) : 0;
    if (move) lastTime = time;

    for (var i = 0; i < dots.length; i++) {
      var p = dots[i];
      if (move) {
        p.phase += p.twinkle * step;
        p.x += p.vx * step;
        p.y += p.vy * step;
        if (p.x < -4) p.x = width + 4;
        if (p.x > width + 4) p.x = -4;
        if (p.y < -4) p.y = height + 4;
        if (p.y > height + 4) p.y = -4;
      }
    }

    /* Short, faint links suggest network paths without becoming a web of lines. */
    for (var a = 0; a < dots.length; a++) {
      var one = dots[a];
      for (var b = a + 1; b < dots.length; b++) {
        var two = dots[b], dx = one.x - two.x, dy = one.y - two.y;
        var dist2 = dx * dx + dy * dy;
        if (dist2 < LINK_DISTANCE * LINK_DISTANCE) {
          var dist = Math.sqrt(dist2);
          var alpha = (1 - dist / LINK_DISTANCE) * .13;
          ctx.strokeStyle = 'rgba(56, 161, 255,' + alpha.toFixed(3) + ')';
          ctx.lineWidth = .65;
          ctx.beginPath(); ctx.moveTo(one.x, one.y); ctx.lineTo(two.x, two.y); ctx.stroke();
        }
      }
    }

    var cx = width * .5, cy = height * .45;
    var rx = Math.max(1, width * .72), ry = Math.max(1, height * .9);
    for (var j = 0; j < dots.length; j++) {
      var q = dots[j];
      var nx = (q.x - cx) / rx, ny = (q.y - cy) / ry;
      var edgeFade = Math.max(.18, 1 - Math.min(1, Math.sqrt(nx * nx + ny * ny)) * .72);
      var shimmer = move ? .68 + .32 * Math.sin(q.phase) : .85;
      var alphaDot = q.base * edgeFade * shimmer;
      if (q.bright) {
        var glow = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 12);
        glow.addColorStop(0, 'rgba(56, 189, 248,' + (alphaDot * .6) + ')');
        glow.addColorStop(1, 'rgba(59, 130, 246, 0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(q.x, q.y, 12, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(96, 180, 255,' + alphaDot.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.bright ? q.r * 1.5 : q.r, 0, Math.PI * 2); ctx.fill();
    }

    /* Radial vignette: dense center, softly disappearing edges. */
    var vignette = ctx.createRadialGradient(cx, cy, Math.min(width, height) * .08, cx, cy, Math.max(width, height) * .72);
    vignette.addColorStop(0, 'rgba(3,7,18,0)');
    vignette.addColorStop(.62, 'rgba(3,7,18,.08)');
    vignette.addColorStop(1, 'rgba(3,7,18,.68)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  }

  function frame(t) {
    raf = 0;
    if (!running || reduced || !pageVisible || !inView) return;
    draw(t, true);
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduced || !pageVisible || !inView) return;
    running = true; lastTime = 0; raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0; lastTime = 0;
  }

  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = !!(entries[0] && entries[0].isIntersecting);
      if (inView) start(); else stop();
    }, { threshold: .01 }).observe(hero);
  } else { inView = true; start(); }
  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
    if (pageVisible) start(); else stop();
  });
  if (motion) {
    var onMotion = function () {
      reduced = motion.matches; stop();
      if (reduced) draw(0, false); else start();
    };
    if (motion.addEventListener) motion.addEventListener('change', onMotion);
    else if (motion.addListener) motion.addListener(onMotion);
  }
  if (!reduced) start();
}());
