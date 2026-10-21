/* Africa dot-matrix hero background. Canvas-only, configurable, and isolated to the homepage hero. */
(function () {
  'use strict';

  // Timing units: sweepSpeed, rippleSpeed, and per-dot dotSpeed are per second; drawFrame converts its RAF timestamp to seconds.
  var CONFIG = {
    dotSpacing: 13,
    wideScreenBreakpoint: 1200,
    wideScreenDotSpacing: 10,
    maxDevicePixelRatio: 2,
    maxDots: 18000,
    adaptiveFrameMs: 21,
    adaptiveAfterFrames: 24,
    adaptiveSpacingIncrease: 2,
    colors: { dot: '56,161,224', background: '#000000', blue: '43,128,197', cyan: '56,161,224', indigo: '99,102,241', purple: '139,92,246' },
    land: { baseAlpha: 0.045, baseRadius: 0.85, alphaBoost: 0.34, radiusBoost: 0.30, brightnessScale: 1, twinkleScale: 1 },
    ocean: { baseAlpha: 0.025, baseRadius: 0.8, alphaBoost: 0.22, brightnessScale: 0.8, twinkleScale: 0.9 },
    sweepSpeed: 1.8,
    sweepWidth: 0.012,
    sweepXFactor: 0.9,
    sweepYFactor: 0.5,
    rippleSpeed: 1.3,
    rippleSpacing: 0.025,
    rippleContribution: 0.9,
    sharpness: { sweep: 7, ripple: 12, twinkle: 30 },
    haloThreshold: 0.7,
    haloRadius: 7,
    haloAlpha: 0.12,
    twinkleAmount: 0.35,
    waveOrigin: { x: 0.5, y: 0.5 },
    mapBounds: { minLon: -20, maxLon: 55, minLat: -37, maxLat: 39 },
    mapHeightRatio: 0.9,
    mapWidthRatio: 0.36,
    mobileMapMinSize: 280,
    mapCenterBreakpoint: 700,
    mapCenterXFactor: 0.43,
    dotSpeedMin: 0.55,
    dotSpeedRange: 1.4,
    adaptiveSpacingCeiling: 28
  };

  var SHARED = window.AfricaDotMatrixShared;
  if (!SHARED) return;
  var CITY_COORDS = {
    nairobi: [36.8219, -1.2921], lagos: [3.3792, 6.5244],
    johannesburg: [28.0473, -26.2041], cairo: [31.2357, 30.0444],
    accra: [-0.187, 5.6037], kampala: [32.5825, 0.3476],
    casablanca: [-7.5898, 33.5731]
  };
  var PAN_AFRICAN_NODES = [
    { lon: 3.3792, lat: 6.5244, color: '56,161,224' },
    { lon: 31.2357, lat: 30.0444, color: '99,102,241' },
    { lon: 28.0473, lat: -26.2041, color: '139,92,246' },
    { lon: 36.8219, lat: -1.2921, color: '43,128,197' },
    { lon: -7.5898, lat: 33.5731, color: '99,102,241' },
    { lon: -0.187, lat: 5.6037, color: '56,161,224' }
  ];

  var section = document.querySelector('[data-africa-dot-hero]');
  var canvas = section && section.querySelector('[data-africa-dot-canvas]');
  if (!section || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducedMotion = !!(motionQuery && motionQuery.matches);
  var width = 0, height = 0, dpr = 1, spacing = CONFIG.dotSpacing, spacingOverride = 0;
  var dots = [], dotCount = 0, rafId = 0, running = false, visible = false, pageVisible = !document.hidden;
  var lastFrame = 0, slowFrames = 0, startTime = 0, mapLeft = 0, mapTop = 0, mapWidth = 0, mapHeight = 0;
  var originX = 0, originY = 0;

  function resolveOrigin() {
    var wave = CONFIG.waveOrigin;
    if (typeof wave === 'string') {
      var city = CITY_COORDS[wave.toLowerCase()];
      if (city) {
        var projected = SHARED.project(city[0], city[1], { left: mapLeft, top: mapTop, width: mapWidth, height: mapHeight }, CONFIG.mapBounds);
        originX = projected.x; originY = projected.y;
        return;
      }
      originX = width * 0.5; originY = height * 0.5;
      return;
    }
    originX = width * (typeof wave.x === 'number' ? wave.x : 0.5);
    originY = height * (typeof wave.y === 'number' ? wave.y : 0.5);
  }

  function rebuildGrid() {
    var rect = section.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDevicePixelRatio);
    spacing = spacingOverride || (width >= CONFIG.wideScreenBreakpoint ? CONFIG.wideScreenDotSpacing : CONFIG.dotSpacing);
    var estimated = (Math.ceil(width / spacing) + 1) * (Math.ceil(height / spacing) + 1);
    while (estimated > CONFIG.maxDots) {
      spacing += CONFIG.adaptiveSpacingIncrease;
      estimated = (Math.ceil(width / spacing) + 1) * (Math.ceil(height / spacing) + 1);
    }
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    mapHeight = Math.min(height * CONFIG.mapHeightRatio, Math.max(CONFIG.mobileMapMinSize, width * CONFIG.mapWidthRatio));
    mapWidth = mapHeight * (CONFIG.mapBounds.maxLon - CONFIG.mapBounds.minLon) / (CONFIG.mapBounds.maxLat - CONFIG.mapBounds.minLat);
    var mapCenterX = width * (width < CONFIG.mapCenterBreakpoint ? 0.5 : CONFIG.mapCenterXFactor);
    mapLeft = Math.max(0, Math.min(width - mapWidth, mapCenterX - mapWidth * 0.5));
    mapTop = (height - mapHeight) * 0.5;

    var cols = Math.ceil(width / spacing) + 1;
    var rows = Math.ceil(height / spacing) + 1;
    dots = new Array(cols * rows);
    var k = 0;
    for (var row = 0; row < rows; row++) {
      var y = row * spacing;
      for (var col = 0; col < cols; col++) {
        var x = col * spacing, land = false, accent = null;
        if (x >= mapLeft && x <= mapLeft + mapWidth && y >= mapTop && y <= mapTop + mapHeight) {
          var geo = SHARED.unproject(x, y, { left: mapLeft, top: mapTop, width: mapWidth, height: mapHeight }, CONFIG.mapBounds);
          land = SHARED.pointInPolygon(geo.lon, geo.lat);
          if (land) {
            for (var nodeIndex = 0; nodeIndex < PAN_AFRICAN_NODES.length; nodeIndex++) {
              var node = PAN_AFRICAN_NODES[nodeIndex];
              var lonDelta = geo.lon - node.lon, latDelta = geo.lat - node.lat;
              if (lonDelta * lonDelta + latDelta * latDelta < 18) { accent = node.color; break; }
            }
          }
        }
        dots[k++] = {
          x: x, y: y, land: land, accent: accent, phase: Math.random() * Math.PI * 2,
          speed: CONFIG.dotSpeedMin + Math.random() * CONFIG.dotSpeedRange,
          baseAlpha: land ? CONFIG.land.baseAlpha : CONFIG.ocean.baseAlpha,
          baseRadius: land ? CONFIG.land.baseRadius : CONFIG.ocean.baseRadius
        };
      }
    }
    dotCount = k;
    resolveOrigin();
    render(0);
  }

  function render(time) {
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, width, height);
    var t = time * 0.001, color = CONFIG.colors.dot;
    for (var i = 0; i < dotCount; i++) {
      var dot = dots[i];
      var dotColor = color;
      var sweep = Math.pow(Math.max(0, Math.sin((dot.x * CONFIG.sweepXFactor + dot.y * CONFIG.sweepYFactor) * CONFIG.sweepWidth - t * CONFIG.sweepSpeed)), CONFIG.sharpness.sweep);
      var dx = dot.x - originX, dy = dot.y - originY;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var ripple = Math.pow(Math.max(0, Math.sin(distance * CONFIG.rippleSpacing - t * CONFIG.rippleSpeed)), CONFIG.sharpness.ripple);
      var twinkle = Math.pow(Math.sin(t * dot.speed + dot.phase), CONFIG.sharpness.twinkle) * CONFIG.twinkleAmount;
      var brightness = Math.max(sweep, ripple * CONFIG.rippleContribution) * (dot.land ? CONFIG.land.brightnessScale : CONFIG.ocean.brightnessScale) +
        twinkle * (dot.land ? CONFIG.land.twinkleScale : CONFIG.ocean.twinkleScale);
      if (brightness > 1) brightness = 1;
      if (brightness < 0) brightness = 0;
      /* Blend the travelling sweep through the approved blue-to-indigo palette. */
      var blend = Math.max(0, Math.min(1, brightness));
      var blueRgb = blend < 0.5 ? CONFIG.colors.blue.split(',') : CONFIG.colors.indigo.split(',');
      var startRgb = blend < 0.5 ? CONFIG.colors.blue.split(',') : CONFIG.colors.indigo.split(',');
      var endRgb = blend < 0.5 ? CONFIG.colors.cyan.split(',') : CONFIG.colors.purple.split(',');
      var localBlend = blend < 0.5 ? blend * 2 : (blend - 0.5) * 2;
      dotColor = startRgb.map(function (channel, index) { return Math.round(Number(channel) + (Number(endRgb[index]) - Number(channel)) * localBlend); }).join(',');
      if (dot.accent && brightness < 0.25) dotColor = dot.accent;
      var alphaBoost = dot.land ? CONFIG.land.alphaBoost : CONFIG.ocean.alphaBoost;
      var alpha = dot.baseAlpha + brightness * alphaBoost;
      /* Radial fade keeps the dot field delicate at its outer edges. */
      var radialDistance = Math.sqrt(Math.pow((dot.x - width * 0.5) / Math.max(1, width * 0.5), 2) + Math.pow((dot.y - height * 0.5) / Math.max(1, height * 0.5), 2));
      var edgeFade = Math.max(0, Math.min(1, (1.18 - radialDistance) / 0.52));
      alpha *= edgeFade;
      var radius = dot.baseRadius + (dot.land ? brightness * CONFIG.land.radiusBoost : 0);
      if (dot.land && brightness > CONFIG.haloThreshold) {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + dotColor + ',' + (brightness * CONFIG.haloAlpha) + ')';
        ctx.arc(dot.x, dot.y, CONFIG.haloRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + dotColor + ',' + alpha + ')';
      ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function animate(timestamp) {
    rafId = 0;
    if (!running || reducedMotion || !pageVisible || !visible) return;
    if (lastFrame && timestamp - lastFrame > CONFIG.adaptiveFrameMs) slowFrames++;
    else if (slowFrames > 0) slowFrames--;
    lastFrame = timestamp;
    if (slowFrames >= CONFIG.adaptiveAfterFrames && spacing < CONFIG.adaptiveSpacingCeiling) {
      slowFrames = 0;
      spacingOverride = spacing + CONFIG.adaptiveSpacingIncrease;
      rebuildGrid();
    }
    render(timestamp - startTime);
    rafId = window.requestAnimationFrame(animate);
  }
  function start() {
    if (running || reducedMotion || !pageVisible || !visible) return;
    running = true; startTime = performance.now(); lastFrame = 0;
    rafId = window.requestAnimationFrame(animate);
  }
  function stop() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function updateMotionPreference() {
    reducedMotion = !!(motionQuery && motionQuery.matches);
    stop();
    if (reducedMotion) render(0); else start();
  }

  rebuildGrid();
  if (reducedMotion) render(0); else start();
  if ('ResizeObserver' in window) {
    var resizeObserver = new ResizeObserver(function () {
      rebuildGrid();
      if (!reducedMotion && pageVisible && visible && !running) start();
    });
    resizeObserver.observe(section);
  } else {
    window.addEventListener('resize', function () {
      rebuildGrid();
      if (!reducedMotion && pageVisible && visible && !running) start();
    }, { passive: true });
  }
  if ('IntersectionObserver' in window) {
    var intersectionObserver = new IntersectionObserver(function (entries) {
      var latest = entries[entries.length - 1];
      if (latest && latest.target === section) {
        visible = !!latest.isIntersecting;
        if (visible) start(); else stop();
      }
    }, { threshold: 0.01 });
    intersectionObserver.observe(section);
  } else {
    function updateVisibilityFallback() {
      var rect = section.getBoundingClientRect();
      visible = rect.bottom > 0 && rect.top < window.innerHeight;
      if (visible) start(); else stop();
    }
    window.addEventListener('scroll', updateVisibilityFallback, { passive: true });
    window.addEventListener('resize', updateVisibilityFallback, { passive: true });
    updateVisibilityFallback();
  }
  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
    if (pageVisible) start(); else stop();
  });
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', updateMotionPreference);
  else if (motionQuery && motionQuery.addListener) motionQuery.addListener(updateMotionPreference);
}());
