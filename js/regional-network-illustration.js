/* Animated dot-matrix Africa map. Illustration only, never live telemetry. */
(function () {
  'use strict';
  // Timing units: waveSpeed, shimmerSpeed, and packetSpeed are per millisecond; pulse intervals and pulseDuration are milliseconds.
  var CONFIG = {
    dotSpacing: 6, maxDotSpacing: 21, dotRadius: 1.2, dotColor: '100,168,245', dotAlpha: 0.6,
    waveGlow: 0.42, waveWidth: 115, waveSpeed: 0.00016, shimmerAmount: 0.22, shimmerSpeed: 0.00045,
    nodeColor: '#64a8f5', nodeGlow: 'rgba(80,165,245,0.78)', nodeRadius: 2.1,
    pulseIntervalMin: 800, pulseIntervalMax: 1500, pulseDuration: 2600, pulseRingCount: 3, pulseSpeed: 1,
    packetSpeedMin: 0.00007, packetSpeedRange: 0.00007, maxDpr: 2,
    adaptiveFrameMs: 21, adaptiveAfterFrames: 24, adaptiveSpacingIncrease: 2,
    nodes: [
      { name: 'Dakar', lon: -17.45, lat: 14.69 }, { name: 'Casablanca', lon: -7.59, lat: 33.57 },
      { name: 'Tunis', lon: 10.18, lat: 36.8 }, { name: 'Cairo', lon: 31.24, lat: 30.04 },
      { name: 'Lagos', lon: 3.38, lat: 6.52 }, { name: 'Accra', lon: -0.19, lat: 5.6 },
      { name: 'Addis Ababa', lon: 38.76, lat: 8.98 }, { name: 'Nairobi', lon: 36.82, lat: -1.29 },
      { name: 'Kigali', lon: 29.87, lat: -1.94 }, { name: 'Dar es Salaam', lon: 39.2, lat: -6.8 },
      { name: 'Luanda', lon: 13.23, lat: -8.84 }, { name: 'Johannesburg', lon: 28.05, lat: -26.2 },
      { name: 'Cape Town', lon: 18.42, lat: -33.92 }
    ]
  };
  var SHARED = window.AfricaDotMatrixShared;
  var canvas = document.querySelector('[data-africa-dot-map]');
  var panel = document.querySelector('[data-network-illustration]');
  if (!canvas || !panel || !SHARED || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduceMotion = !!(motionQuery && motionQuery.matches);
  var visible = false, pageVisible = !document.hidden, raf = 0;
  var width = 0, height = 0, scale = 1, spacing = CONFIG.dotSpacing, spacingOverride = 0;
  var lastPulse = 0, lastTime = 0, lastFrame = 0, slowFrames = 0;
  var dots = [], pulses = [], packets = [], mapRect = { left: 0, top: 0, width: 1, height: 1 };
  function rebuild() {
    var rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    scale = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    spacing = spacingOverride || CONFIG.dotSpacing;
    var mapW = Math.min(width * 0.99, height * 0.99);
    var mapH = Math.min(height * 0.98, mapW * (76 / 75));
    var ratio = (SHARED.bounds.maxLon - SHARED.bounds.minLon) / (SHARED.bounds.maxLat - SHARED.bounds.minLat);
    if (mapW / mapH > ratio) mapW = mapH * ratio; else mapH = mapW / ratio;
    mapRect = { left: (width - mapW) / 2, top: (height - mapH) / 2, width: mapW, height: mapH };
    dots = [];
    for (var y = 0; y < mapH; y += spacing) {
      for (var x = 0; x < mapW; x += spacing) {
        var geo = SHARED.unproject(x, y, { left: 0, top: 0, width: mapW, height: mapH });
        if (SHARED.pointInPolygon(geo.lon, geo.lat)) dots.push({ x: mapRect.left + x, y: mapRect.top + y, phase: Math.random() * Math.PI * 2 });
      }
    }
    CONFIG.nodes.forEach(function (n) {
      var p = SHARED.project(n.lon, n.lat, mapRect);
      n.px = p.x; n.py = p.y;
    });
    packets = [];
    for (var p = 0; p < 4; p++) packets.push({ from: p % CONFIG.nodes.length, to: (p * 5 + 4) % CONFIG.nodes.length, t: Math.random(),
      speed: CONFIG.packetSpeedMin + Math.random() * CONFIG.packetSpeedRange });
    if (reduceMotion) drawStatic();
  }
  function point(n) { return { x: n.px, y: n.py }; }
  function curve(from, to, t) {
    var a = point(CONFIG.nodes[from]), b = point(CONFIG.nodes[to]);
    var bend = ((from + to) % 2 ? 1 : -1) * Math.min(32, Math.abs(b.x - a.x) * 0.14);
    var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 - bend;
    return { x: (1-t)*(1-t)*a.x + 2*(1-t)*t*cx + t*t*b.x, y: (1-t)*(1-t)*a.y + 2*(1-t)*t*cy + t*t*b.y };
  }
  function draw(now) {
    raf = 0;
    if (!visible || !pageVisible || document.hidden || reduceMotion) return;
    if (lastFrame && now - lastFrame > CONFIG.adaptiveFrameMs) slowFrames++; else if (slowFrames > 0) slowFrames--;
    lastFrame = now;
    if (slowFrames >= CONFIG.adaptiveAfterFrames && spacing < CONFIG.maxDotSpacing) {
      slowFrames = 0; spacingOverride = Math.min(CONFIG.maxDotSpacing, spacing + CONFIG.adaptiveSpacingIncrease); rebuild();
    }
    ctx.clearRect(0, 0, width, height);
    if (now - lastPulse >= CONFIG.pulseIntervalMin + Math.random() * (CONFIG.pulseIntervalMax - CONFIG.pulseIntervalMin)) {
      pulses.push({ node: Math.floor(Math.random() * CONFIG.nodes.length), start: now }); lastPulse = now;
    }
    var wave = ((now * CONFIG.waveSpeed) % (width + height)) - height;
    dots.forEach(function (d) {
      var glow = Math.max(0, 1 - Math.abs((d.x + d.y) - wave) / CONFIG.waveWidth);
      var shimmer = 1 - CONFIG.shimmerAmount + CONFIG.shimmerAmount * (0.5 + 0.5 * Math.sin(now * CONFIG.shimmerSpeed + d.phase));
      ctx.beginPath(); ctx.arc(d.x, d.y, CONFIG.dotRadius + glow * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + CONFIG.dotColor + ',' + Math.min(1, (CONFIG.dotAlpha + glow * CONFIG.waveGlow) * shimmer) + ')'; ctx.fill();
    });
    CONFIG.nodes.forEach(function (n) {
      ctx.beginPath(); ctx.arc(n.px, n.py, CONFIG.nodeRadius, 0, Math.PI * 2);
      ctx.shadowColor = CONFIG.nodeGlow; ctx.shadowBlur = 11; ctx.fillStyle = CONFIG.nodeColor; ctx.fill(); ctx.shadowBlur = 0;
    });
    packets.forEach(function (p) {
      var a = point(CONFIG.nodes[p.from]), b = point(CONFIG.nodes[p.to]), mid = curve(p.from, p.to, 0.5);
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mid.x * 2 - (a.x + b.x) / 2, mid.y * 2 - (a.y + b.y) / 2, b.x, b.y);
      ctx.strokeStyle = 'rgba(80,165,240,.12)'; ctx.lineWidth = 0.8; ctx.stroke();
      p.t += p.speed * (now - (lastTime || now)) * CONFIG.pulseSpeed; if (p.t > 1) p.t = 0;
      var pos = curve(p.from, p.to, p.t);
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 1.65, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,190,255,.9)'; ctx.shadowColor = CONFIG.nodeGlow; ctx.shadowBlur = 7; ctx.fill(); ctx.shadowBlur = 0;
    });
    pulses = pulses.filter(function (p) { return now - p.start < CONFIG.pulseDuration; });
    pulses.forEach(function (p) {
      var n = CONFIG.nodes[p.node], age = now - p.start;
      for (var r = 0; r < CONFIG.pulseRingCount; r++) {
        var phase = (age - r * 220) / (CONFIG.pulseDuration - r * 220);
        if (phase < 0 || phase > 1) continue;
        ctx.beginPath(); ctx.arc(n.px, n.py, 4 + phase * 29, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(80,165,245,' + ((1 - phase) * 0.65) + ')'; ctx.lineWidth = 1.2;
        ctx.shadowColor = CONFIG.nodeGlow; ctx.shadowBlur = 7; ctx.stroke(); ctx.shadowBlur = 0;
      }
    });
    lastTime = now;
    if (visible && pageVisible && !document.hidden && !reduceMotion) raf = window.requestAnimationFrame(draw);
  }
  function drawStatic() {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    dots.forEach(function (d) {
      ctx.beginPath(); ctx.arc(d.x, d.y, CONFIG.dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + CONFIG.dotColor + ',' + CONFIG.dotAlpha + ')'; ctx.fill();
    });
    CONFIG.nodes.forEach(function (n) {
      ctx.beginPath(); ctx.arc(n.px, n.py, CONFIG.nodeRadius, 0, Math.PI * 2); ctx.fillStyle = CONFIG.nodeColor; ctx.fill();
    });
  }
  function start() {
    if (reduceMotion) { drawStatic(); return; }
    if (visible && pageVisible && !document.hidden && !raf) raf = window.requestAnimationFrame(draw);
  }
  function stop() { if (raf) window.cancelAnimationFrame(raf); raf = 0; }
  function updateMotion() {
    reduceMotion = !!(motionQuery && motionQuery.matches); stop();
    if (reduceMotion) drawStatic(); else start();
  }
  rebuild();
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.target !== panel) return; visible = entry.isIntersecting; if (visible) start(); else stop(); });
    }, { threshold: 0.01 });
    observer.observe(panel);
  } else {
    function updateVisible() {
      var r = panel.getBoundingClientRect(); visible = r.bottom > 0 && r.top < window.innerHeight;
      if (visible) start(); else stop();
    }
    window.addEventListener('scroll', updateVisible, { passive: true });
    window.addEventListener('resize', updateVisible, { passive: true }); updateVisible();
  }
  document.addEventListener('visibilitychange', function () { pageVisible = !document.hidden; if (pageVisible) start(); else stop(); });
  window.addEventListener('resize', function () { rebuild(); if (visible) start(); }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(function () { rebuild(); if (visible) start(); }).observe(canvas);
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', updateMotion);
  else if (motionQuery && motionQuery.addListener) motionQuery.addListener(updateMotion);
  if (reduceMotion) drawStatic();
}());
