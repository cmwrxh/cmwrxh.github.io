/* Static hero-only dot matrix for secondary routes; never overlays the full page. */
(function () {
  'use strict';
  if (!document.body || document.querySelector('[data-africa-dot-canvas]')) return;
  var hero = document.querySelector('[data-africa-dot-hero], .hero-wave, .hero-africa-dot-hero, .hero-section');
  if (!hero) return;
  var canvas = document.createElement('canvas');
  canvas.id = 'al-sitewide-dot-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  hero.prepend(canvas);
  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  function draw() {
    var rect = hero.getBoundingClientRect();
    var width = Math.max(1, rect.width);
    var height = Math.max(1, rect.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    var spacing = window.innerWidth < 700 ? 20 : 18;
    for (var y = spacing / 2; y < height; y += spacing) {
      for (var x = spacing / 2; x < width; x += spacing) {
        if (Math.random() > 0.12) continue;
        var roll = Math.random();
        ctx.fillStyle = roll < .1 ? 'rgba(255,255,255,.7)' :
          (roll < .2 ? 'rgba(236,105,180,.7)' : 'rgba(59,155,224,.7)');
        ctx.beginPath();
        ctx.arc(x, y, 1 + Math.random() * .5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  draw();
  if ('ResizeObserver' in window) new ResizeObserver(draw).observe(hero);
  else window.addEventListener('resize', draw, { passive: true });
}());
