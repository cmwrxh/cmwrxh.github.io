/* Africa dot-matrix hero background. Canvas-only, configurable, and isolated to the homepage hero. */
(function () {
  'use strict';

  var CONFIG = {
    dotSpacing: 13,
    wideScreenBreakpoint: 1200,
    wideScreenDotSpacing: 10,
    maxDevicePixelRatio: 2,
    maxDots: 18000,
    adaptiveFrameMs: 21,
    adaptiveAfterFrames: 24,
    adaptiveSpacingIncrease: 2,
    colors: { dot: '80,165,255', background: '#000000' },
    land: { baseAlpha: 0.22, baseRadius: 1.3, alphaBoost: 0.8, radiusBoost: 1.4, brightnessScale: 1, twinkleScale: 1 },
    ocean: { baseAlpha: 0.05, baseRadius: 1, alphaBoost: 0.35, brightnessScale: 0.45, twinkleScale: 0.3 },
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
    mobileMapMinSize: 280
  };

  /* Approximate mainland Africa coastline. Swap this array for GeoJSON-derived points later. */
  var AFRICA_POLYGON = [
    [-17.5, 14.7], [-16.8, 21.0], [-13.0, 27.7], [-8.7, 27.3],
    [-5.5, 35.8], [-1.0, 35.2], [3.0, 36.0], [9.5, 37.0],
    [11.0, 33.0], [25.0, 31.5], [34.0, 31.0], [36.8, 22.0],
    [43.0, 12.7], [51.0, 11.5], [49.0, 2.0], [42.0, -4.5],
    [40.5, -11.0], [35.0, -17.0], [35.8, -24.5], [32.9, -29.5],
    [28.5, -34.8], [25.0, -34.7], [19.0, -34.8], [16.5, -28.5],
    [12.5, -17.0], [12.0, -6.0], [8.5, 4.5], [2.0, 5.5],
    [-4.5, 5.0], [-8.5, 4.0], [-12.0, 7.0], [-16.5, 12.0]
  ];
  var CITY_COORDS = {
    nairobi: [36.8219, -1.2921], lagos: [3.3792, 6.5244],
    johannesburg: [28.0473, -26.2041], cairo: [31.2357, 30.0444],
    accra: [-0.187, 5.6037], kampala: [32.5825, 0.3476]
  };

  var section = document.querySelector('[data-africa-dot-hero]');
  var canvas = section && section.querySelector('[data-africa-dot-canvas]');
  if (!section || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducedMotion = !!(motionQuery && motionQuery.matches);
  var width = 0, height = 0, dpr = 1, spacing = CONFIG.dotSpacing, spacingOverride = 0;
  var dots = [], dotCount = 0, rafId = 0, running = false, visible = true, pageVisible = !document.hidden;
  var lastFrame = 0, slowFrames = 0, startTime = 0, mapLeft = 0, mapTop = 0, mapWidth = 0, mapHeight = 0;
  var originX = 0, originY = 0;

  function pointInPolygon(lon, lat) {
    var inside = false;
    for (var i = 0, j = AFRICA_POLYGON.length - 1; i < AFRICA_POLYGON.length; j = i++) {
      var xi = AFRICA_POLYGON[i][0], yi = AFRICA_POLYGON[i][1];
      var xj = AFRICA_POLYGON[j][0], yj = AFRICA_POLYGON[j][1];
      if (((yi > lat) !== (yj > lat)) &&
          (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 0.000001) + xi)) inside = !inside;
    }
    return inside;
  }

  function resolveOrigin() {
    var wave = CONFIG.waveOrigin;
    if (typeof wave === 'string') {
      var city = CITY_COORDS[wave.toLowerCase()];
      if (city) {
        originX = mapLeft + ((city[0] - CONFIG.mapBounds.minLon) / (CONFIG.mapBounds.maxLon - CONFIG.mapBounds.minLon)) * mapWidth;
        originY = mapTop + ((CONFIG.mapBounds.maxLat - city[1]) / (CONFIG.mapBounds.maxLat - CONFIG.mapBounds.minLat)) * mapHeight;
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
    var estimated = Math.ceil(width / spacing) * Math.ceil(height / spacing);
    while (estimated > CONFIG.maxDots) {
      spacing += CONFIG.adaptiveSpacingIncrease;
      estimated = Math.ceil(width / spacing) * Math.ceil(height / spacing);
    }
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    mapHeight = Math.min(height * CONFIG.mapHeightRatio, Math.max(CONFIG.mobileMapMinSize, width * CONFIG.mapWidthRatio));
    mapWidth = mapHeight * (CONFIG.mapBounds.maxLon - CONFIG.mapBounds.minLon) / (CONFIG.mapBounds.maxLat - CONFIG.mapBounds.minLat);
    var mapCenterX = width * (width < 700 ? 0.5 : 0.43);
    mapLeft = Math.max(0, Math.min(width - mapWidth, mapCenterX - mapWidth * 0.5));
    mapTop = (height - mapHeight) * 0.5;

    var cols = Math.ceil(width / spacing) + 1;
    var rows = Math.ceil(height / spacing) + 1;
    dots = new Array(cols * rows);
    var k = 0;
    for (var row = 0; row < rows; row++) {
      var y = row * spacing;
      for (var col = 0; col < cols; col++) {
        var x = col * spacing, land = false;
        if (x >= mapLeft && x <= mapLeft + mapWidth && y >= mapTop && y <= mapTop + mapHeight) {
          var lon = CONFIG.mapBounds.minLon + ((x - mapLeft) / mapWidth) * (CONFIG.mapBounds.maxLon - CONFIG.mapBounds.minLon);
          var lat = CONFIG.mapBounds.maxLat - ((y - mapTop) / mapHeight) * (CONFIG.mapBounds.maxLat - CONFIG.mapBounds.minLat);
          land = pointInPolygon(lon, lat);
        }
        dots[k++] = {
          x: x, y: y, land: land, phase: Math.random() * Math.PI * 2,
          speed: 0.55 + Math.random() * 1.4,
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
      var sweep = Math.pow(Math.max(0, Math.sin((dot.x * CONFIG.sweepXFactor + dot.y * CONFIG.sweepYFactor) * CONFIG.sweepWidth - t * CONFIG.sweepSpeed)), CONFIG.sharpness.sweep);
      var dx = dot.x - originX, dy = dot.y - originY;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var ripple = Math.pow(Math.max(0, Math.sin(distance * CONFIG.rippleSpacing - t * CONFIG.rippleSpeed)), CONFIG.sharpness.ripple);
      var twinkle = Math.pow(Math.sin(t * dot.speed + dot.phase), CONFIG.sharpness.twinkle) * CONFIG.twinkleAmount;
      var brightness = Math.max(sweep, ripple * CONFIG.rippleContribution) * (dot.land ? CONFIG.land.brightnessScale : CONFIG.ocean.brightnessScale) +
        twinkle * (dot.land ? CONFIG.land.twinkleScale : CONFIG.ocean.twinkleScale);
      if (brightness > 1) brightness = 1;
      if (brightness < 0) brightness = 0;
      var alphaBoost = dot.land ? CONFIG.land.alphaBoost : CONFIG.ocean.alphaBoost;
      var alpha = dot.baseAlpha + brightness * alphaBoost;
      var radius = dot.baseRadius + (dot.land ? brightness * CONFIG.land.radiusBoost : 0);
      if (dot.land && brightness > CONFIG.haloThreshold) {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + color + ',' + (brightness * CONFIG.haloAlpha) + ')';
        ctx.arc(dot.x, dot.y, CONFIG.haloRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + color + ',' + alpha + ')';
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
    if (slowFrames >= CONFIG.adaptiveAfterFrames && spacing < 28) {
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
      visible = !!entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.01 });
    intersectionObserver.observe(section);
  }
  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
    if (pageVisible) start(); else stop();
  });
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', updateMotionPreference);
  else if (motionQuery && motionQuery.addListener) motionQuery.addListener(updateMotionPreference);
}());
