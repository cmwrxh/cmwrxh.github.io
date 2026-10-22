/* Animated, transparent hero dot field with fixed grid positions and independent twinkle. */
(function () {
  'use strict';

  var section = document.querySelector('[data-africa-dot-hero]');
  var canvas = section && section.querySelector('[data-africa-dot-canvas]');
  if (!section || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var spacing = 9;
  var dotSize = 2;
  var dots = [];
  var width = 0;
  var height = 0;
  var dpr = 1;
  var frameId = 0;
  var lastFrame = 0;
  var inView = true;
  var pageVisible = !document.hidden;
  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var resizeObserver = null;
  var intersectionObserver = null;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function hash(x, y, salt) {
    var n = Math.imul((x | 0) + 17 + (salt || 0), 374761393);
    n += Math.imul((y | 0) + 29, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function insideAfrica(nx, ny) {
    /* Fixed normalized silhouette, scaled into the right-hand hero field. */
    var polygon = [
      [0.64, 0.15], [0.72, 0.18], [0.77, 0.25], [0.82, 0.30],
      [0.80, 0.39], [0.76, 0.45], [0.75, 0.55], [0.70, 0.66],
      [0.67, 0.78], [0.62, 0.72], [0.59, 0.62], [0.55, 0.54],
      [0.53, 0.44], [0.56, 0.34], [0.59, 0.24]
    ];
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var xi = polygon[i][0], yi = polygon[i][1];
      var xj = polygon[j][0], yj = polygon[j][1];
      var crosses = ((yi > ny) !== (yj > ny)) &&
        (nx < (xj - xi) * (ny - yi) / ((yj - yi) || 0.000001) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function rebuild() {
    var rect = section.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    dots = [];
    var cols = Math.ceil(width / spacing);
    var rows = Math.ceil(height / spacing);
    for (var row = 0; row <= rows; row++) {
      for (var col = 0; col <= cols; col++) {
        var x = col * spacing + 3;
        var y = row * spacing + 3;
        var nx = x / width;
        var ny = y / height;
        var onMap = insideAfrica(nx, ny);
        /* Keep a sparse fixed background grid and a denser, fixed Africa silhouette. */
        if (onMap ? hash(col, row, 11) > 0.82 : hash(col, row, 23) > 0.075) continue;
        var colorRoll = hash(col, row, 41);
        var color = colorRoll < 0.08 ? '#ffffff' : (colorRoll < 0.13 ? '#d63f8c' : '#3b9be0');
        dots.push({
          x: x,
          y: y,
          color: color,
          phase: hash(col, row, 59) * Math.PI * 2,
          period: 1.5 + hash(col, row, 71) * 2.5
        });
      }
    }
    drawStatic();
  }

  function drawAt(seconds) {
    ctx.clearRect(0, 0, width, height);
    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];
      var wave = (Math.sin((seconds / dot.period) * Math.PI * 2 + dot.phase) + 1) / 2;
      var alpha = 0.08 + wave * 0.62;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = dot.color;
      ctx.fillRect(Math.round(dot.x), Math.round(dot.y), dotSize, dotSize);
    }
    ctx.globalAlpha = 1;
  }

  function drawStatic() {
    ctx.clearRect(0, 0, width, height);
    for (var i = 0; i < dots.length; i++) {
      ctx.globalAlpha = 0.39;
      ctx.fillStyle = dots[i].color;
      ctx.fillRect(Math.round(dots[i].x), Math.round(dots[i].y), dotSize, dotSize);
    }
    ctx.globalAlpha = 1;
  }

  function stop() {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrame = 0;
  }

  function tick(timestamp) {
    frameId = 0;
    if (reducedMotion || !pageVisible || !inView) return;
    if (timestamp - lastFrame < 1000 / 30) {
      frameId = window.requestAnimationFrame(tick);
      return;
    }
    lastFrame = timestamp;
    drawAt(timestamp / 1000);
    frameId = window.requestAnimationFrame(tick);
  }

  function updatePlayback() {
    if (reducedMotion) {
      stop();
      drawStatic();
    } else if (pageVisible && inView) {
      if (!frameId) frameId = window.requestAnimationFrame(tick);
    } else {
      stop();
    }
  }

  function onMotionPreferenceChange(event) {
    reducedMotion = event.matches;
    updatePlayback();
  }

  rebuild();
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(rebuild);
    resizeObserver.observe(section);
  } else {
    window.addEventListener('resize', rebuild, { passive: true });
  }

  if ('IntersectionObserver' in window) {
    intersectionObserver = new IntersectionObserver(function (entries) {
      inView = !!(entries[0] && entries[0].isIntersecting);
      updatePlayback();
    }, { threshold: 0 });
    intersectionObserver.observe(section);
  }

  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
    updatePlayback();
  });

  if (motionQuery) {
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionPreferenceChange);
    else if (motionQuery.addListener) motionQuery.addListener(onMotionPreferenceChange);
  }
  updatePlayback();
}());
