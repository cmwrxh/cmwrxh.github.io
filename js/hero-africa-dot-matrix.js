/* Static Africa dot matrix, isolated to the existing hero canvas. */
(function () {
  'use strict';
  var SHARED = window.AfricaDotMatrixShared;
  if (!SHARED) return;
  var section = document.querySelector('[data-africa-dot-hero]');
  var canvas = section && section.querySelector('[data-africa-dot-canvas]');
  if (!section || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var bounds = { minLon: -20, maxLon: 55, minLat: -37, maxLat: 39 };
  var spacing = window.innerWidth >= 1200 ? 18 : 20;
  var dpr = 1;
  var dots = [];

  function buildDots() {
    var rect = section.getBoundingClientRect();
    var width = Math.max(1, rect.width);
    var height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var mapHeight = Math.min(height * 0.9, Math.max(240, width * 0.36));
    var mapWidth = mapHeight * (bounds.maxLon - bounds.minLon) / (bounds.maxLat - bounds.minLat);
    var centerX = width < 700 ? width * 0.5 : width * 0.43;
    var mapLeft = Math.max(0, Math.min(width - mapWidth, centerX - mapWidth * 0.5));
    var mapTop = (height - mapHeight) * 0.5;
    dots = [];

    for (var y = 0; y <= height; y += spacing) {
      for (var x = 0; x <= width; x += spacing) {
        var land = false;
        if (x >= mapLeft && x <= mapLeft + mapWidth && y >= mapTop && y <= mapTop + mapHeight) {
          var geo = SHARED.unproject(x, y, {
            left: mapLeft, top: mapTop, width: mapWidth, height: mapHeight
          }, bounds);
          land = SHARED.pointInPolygon(geo.lon, geo.lat);
        }
        /* Keep the African silhouette; add only a few sparse surrounding dots. */
        if (!land && Math.random() > 0.08) continue;
        var roll = Math.random();
        var color = roll < 0.1 ? 'rgba(255,255,255,.7)' :
          (roll < 0.2 ? 'rgba(236,105,180,.7)' : 'rgba(59,155,224,.7)');
        dots.push({ x: x, y: y, color: color, radius: 1 + Math.random() * 0.5 });
      }
    }
    render(width, height);
  }

  function render(width, height) {
    ctx.clearRect(0, 0, width, height);
    dots.forEach(function (dot) {
      ctx.beginPath();
      ctx.fillStyle = dot.color;
      ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  buildDots();
  if ('ResizeObserver' in window) {
    var observer = new ResizeObserver(buildDots);
    observer.observe(section);
  } else {
    window.addEventListener('resize', buildDots, { passive: true });
  }
}());
