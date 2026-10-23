/* Static sparse blue dots, stronger around the URL input and masked above the headline. */
(function () {
  'use strict';

  var section = document.querySelector('[data-africa-dot-hero]');
  var canvas = section && section.querySelector('[data-africa-dot-canvas]');
  if (!section || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  var spacing = 30;

  function hash(x, y) {
    var n = Math.imul(x + 17, 374761393) + Math.imul(y + 29, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function draw() {
    var rect = section.getBoundingClientRect();
    var width = Math.max(1, rect.width);
    var height = Math.max(1, rect.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var cols = Math.ceil(width / spacing);
    var rows = Math.ceil(height / spacing);
    for (var row = 0; row <= rows; row++) {
      for (var col = 0; col <= cols; col++) {
        var x = col * spacing + 8;
        var y = row * spacing + 8;
        var nx = x / width;
        var ny = y / height;
        var nearInput = nx > 0.18 && nx < 0.82 && ny > 0.48 && ny < 0.78;
        var threshold = nearInput ? 0.34 : 0.12;
        if (hash(col, row) > threshold) continue;

        var radius = 1.1 + hash(col + 101, row + 73) * 0.4;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(59,155,224,.6)';
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  draw();
  if ('ResizeObserver' in window) {
    var observer = new ResizeObserver(draw);
    observer.observe(section);
  } else {
    window.addEventListener('resize', draw, { passive: true });
  }
}());
