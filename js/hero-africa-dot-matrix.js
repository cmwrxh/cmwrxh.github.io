/* Africa dot-matrix hero background. Independent, smoothly fading dots; no directional sweep or ripple. */
(function () {
  'use strict';

  var CONFIG = {
    spacing: 10,
    adaptiveFrameMs: 21,
    adaptiveAfterFrames: 24,
    adaptiveSpacingIncrease: 2,
    adaptiveSpacingCeiling: 28,
    maxDevicePixelRatio: 2,
    maxDots: 18000,
    radius: 1,
    color: '80,135,210',
    peakAlpha: 0.85,
    buckets: 8,
    targetWeights: { high: 0.20, mid: 0.40, low: 0.40 },
    targetRanges: {
      high: { min: 0.85, max: 1.0 },
      mid: { min: 0.40, max: 0.60 },
      low: { min: 0.12, max: 0.22 }
    },
    fadeMs: { min: 1000, max: 3500 },
    holdMs: { min: 300, max: 2600 },
    mapBounds: { minLon: -20, maxLon: 55, minLat: -37, maxLat: 39 },
    mapHeightRatio: 0.9,
    mapWidthRatio: 0.36,
    mobileMapMinSize: 280,
    mapCenterBreakpoint: 700,
    mapCenterXFactor: 0.43
  };

  var SHARED = window.AfricaDotMatrixShared;
  if (!SHARED) return;

  var section = document.querySelector('[data-africa-dot-hero]');
  var canvas = section && section.querySelector('[data-africa-dot-canvas]');
  if (!section || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducedMotion = !!(motionQuery && motionQuery.matches);
  var width = 0, height = 0, dpr = 1, spacing = CONFIG.spacing, spacingOverride = 0;
  var xs = new Float32Array(0), ys = new Float32Array(0);
  var levels = new Float32Array(0), targets = new Float32Array(0);
  var startLevels = new Float32Array(0), startTimes = new Float32Array(0);
  var fadeDurations = new Float32Array(0), holdDurations = new Float32Array(0);
  var dotCount = 0, rafId = 0, running = false, visible = false, pageVisible = !document.hidden;
  var lastFrame = 0, slowFrames = 0, mapLeft = 0, mapTop = 0, mapWidth = 0, mapHeight = 0;
  var dotBuckets = new Uint8Array(0);
  var bucketColors = new Array(CONFIG.buckets);
  for (var colorBucket = 0; colorBucket < CONFIG.buckets; colorBucket++) {
    var colorAlpha = (colorBucket / (CONFIG.buckets - 1)) * CONFIG.peakAlpha;
    bucketColors[colorBucket] = 'rgba(' + CONFIG.color + ',' + colorAlpha.toFixed(3) + ')';
  }

  function randomBetween(range) {
    return range.min + Math.random() * (range.max - range.min);
  }

  function pickTarget() {
    var roll = Math.random();
    var range;
    if (roll < CONFIG.targetWeights.high) range = CONFIG.targetRanges.high;
    else if (roll < CONFIG.targetWeights.high + CONFIG.targetWeights.mid) range = CONFIG.targetRanges.mid;
    else range = CONFIG.targetRanges.low;
    return randomBetween(range);
  }

  function easeInOut(value) {
    return value * value * (3 - 2 * value);
  }

  function updateDot(i, time) {
    var elapsed = time - startTimes[i];
    var cycleLength = fadeDurations[i] + holdDurations[i];
    if (elapsed >= cycleLength) {
      // Skip any complete cycles after a long pause without allocating per frame.
      var cycles = Math.floor(elapsed / cycleLength);
      startTimes[i] += cycles * cycleLength;
      elapsed = time - startTimes[i];
      startLevels[i] = targets[i];
      levels[i] = targets[i];
      targets[i] = pickTarget();
      fadeDurations[i] = randomBetween(CONFIG.fadeMs);
      holdDurations[i] = randomBetween(CONFIG.holdMs);
      startTimes[i] = time;
      elapsed = 0;
    }

    if (elapsed < fadeDurations[i]) {
      var progress = easeInOut(Math.max(0, elapsed / fadeDurations[i]));
      levels[i] = startLevels[i] + (targets[i] - startLevels[i]) * progress;
    } else {
      levels[i] = targets[i];
    }
  }

  function draw(time, animateDots) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    for (var i = 0; i < dotCount; i++) {
      if (animateDots) updateDot(i, time);
      var alpha = Math.min(CONFIG.peakAlpha, Math.max(0, levels[i]));
      dotBuckets[i] = Math.min(CONFIG.buckets - 1, Math.floor((alpha / CONFIG.peakAlpha) * CONFIG.buckets));
    }

    // Eight shared paths, one per alpha bucket; no per-frame arrays or per-dot draw calls.
    for (var bucketIndex = 0; bucketIndex < CONFIG.buckets; bucketIndex++) {
      ctx.beginPath();
      for (var j = 0; j < dotCount; j++) {
        if (dotBuckets[j] !== bucketIndex) continue;
        ctx.moveTo(xs[j] + CONFIG.radius, ys[j]);
        ctx.arc(xs[j], ys[j], CONFIG.radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = bucketColors[bucketIndex];
      ctx.fill();
    }
  }

  function rebuildGrid() {
    var rect = section.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDevicePixelRatio);
    spacing = spacingOverride || CONFIG.spacing;
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
    var capacity = cols * rows;
    xs = new Float32Array(capacity);
    ys = new Float32Array(capacity);
    levels = new Float32Array(capacity);
    targets = new Float32Array(capacity);
    startLevels = new Float32Array(capacity);
    dotBuckets = new Uint8Array(capacity);
    startTimes = new Float32Array(capacity);
    fadeDurations = new Float32Array(capacity);
    holdDurations = new Float32Array(capacity);
    dotCount = 0;

    for (var row = 0; row < rows; row++) {
      var y = row * spacing;
      for (var col = 0; col < cols; col++) {
        var x = col * spacing;
        if (x < mapLeft || x > mapLeft + mapWidth || y < mapTop || y > mapTop + mapHeight) continue;
        var geo = SHARED.unproject(x, y, { left: mapLeft, top: mapTop, width: mapWidth, height: mapHeight }, CONFIG.mapBounds);
        if (!SHARED.pointInPolygon(geo.lon, geo.lat)) continue;

        var i = dotCount++;
        xs[i] = x;
        ys[i] = y;
        var initial = 0.12 + Math.random() * 0.88;
        var target = pickTarget();
        var fade = randomBetween(CONFIG.fadeMs);
        var hold = randomBetween(CONFIG.holdMs);
        var phase = Math.random() * (fade + hold);
        startLevels[i] = initial;
        targets[i] = target;
        fadeDurations[i] = fade;
        holdDurations[i] = hold;
        startTimes[i] = -phase;
        if (phase < fade) {
          levels[i] = initial + (target - initial) * easeInOut(phase / fade);
        } else {
          levels[i] = target;
        }
      }
    }
    draw(0, false);
  }

  function animate(timestamp) {
    rafId = 0;
    if (!running || reducedMotion || !pageVisible || !visible) return;
    if (lastFrame && timestamp - lastFrame > CONFIG.adaptiveFrameMs) slowFrames++;
    else if (slowFrames > 0) slowFrames--;
    lastFrame = timestamp;

    if (slowFrames >= CONFIG.adaptiveAfterFrames && spacing < CONFIG.adaptiveSpacingCeiling) {
      slowFrames = 0;
      spacingOverride = Math.min(CONFIG.adaptiveSpacingCeiling, spacing + CONFIG.adaptiveSpacingIncrease);
      rebuildGrid();
    }
    draw(timestamp, true);
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
  }

  function updateMotionPreference() {
    reducedMotion = !!(motionQuery && motionQuery.matches);
    stop();
    if (reducedMotion) draw(0, false);
    else start();
  }

  rebuildGrid();
  if (reducedMotion) draw(0, false);
  else start();

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
        if (visible) start();
        else stop();
      }
    }, { threshold: 0.01 });
    intersectionObserver.observe(section);
  } else {
    function updateVisibilityFallback() {
      var rect = section.getBoundingClientRect();
      visible = rect.bottom > 0 && rect.top < window.innerHeight;
      if (visible) start();
      else stop();
    }
    window.addEventListener('scroll', updateVisibilityFallback, { passive: true });
    window.addEventListener('resize', updateVisibilityFallback, { passive: true });
    updateVisibilityFallback();
  }

  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
    if (pageVisible) start();
    else stop();
  });

  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', updateMotionPreference);
  else if (motionQuery && motionQuery.addListener) motionQuery.addListener(updateMotionPreference);
}());
