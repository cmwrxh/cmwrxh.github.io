/* Homepage-only motion and interactions. No scan backend behavior is duplicated here. */
(function () {
  'use strict';

  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduceMotion = !!(motionQuery && motionQuery.matches);

  /* DotField: reference lattice, clustered value noise and slow per-dot twinkle. */
  (function initDotField() {
    var canvas = document.querySelector('[data-dot-field]');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    var GAP = 12, R_MIN = 0.8, R_MAX = 1.6;
    var COLOR = [56, 152, 220], HOT = [156, 203, 255];
    var width = 0, height = 0, dpr = 1, cols = 0, rows = 0;
    var phases, frequencies, highlights, running = !document.hidden, inView = true, lastDraw = 0;
    var raf = 0, observer = null;

    function hash2(x, y) {
      var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    }
    function smoothstep(t) { return t * t * (3 - 2 * t); }
    function noise(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = smoothstep(x - xi), yf = smoothstep(y - yi);
      var a = hash2(xi, yi), b = hash2(xi + 1, yi);
      var c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    }
    function fbm(x, y) {
      return noise(x, y) * .6 +
        noise(x * 2.1 + 7.3, y * 2.1 + 1.7) * .3 +
        noise(x * 4.3 + 3.1, y * 4.3 + 9.4) * .1;
    }
    function draw(now) {
      var time = now / 1000;
      ctx.clearRect(0, 0, width, height);
      var cx = width * .5, cy = height * .58, rx = width * .66, ry = height * .62;
      var driftX = time * .018, driftY = time * .006;
      for (var row = 0; row < rows; row++) {
        var y = row * GAP + GAP * .5;
        for (var col = 0; col < cols; col++) {
          var x = col * GAP + GAP * .5;
          var ex = (x - cx) / rx, ey = (y - cy) / ry;
          var envelope = 1 - Math.sqrt(ex * ex + ey * ey);
          if (envelope <= 0) continue;
          var cluster = Math.max(0, (fbm(x * .011 + driftX, y * .014 + driftY) - .38) / .30);
          if (cluster <= 0) continue;
          var index = row * cols + col;
          var twinkle = .5 + .5 * Math.sin(time * 6.283 * frequencies[index] + phases[index]);
          var alpha = Math.min(1, Math.pow(envelope, .8) * cluster) * (.22 + .78 * twinkle) * .9;
          if (alpha < .03) continue;
          var radius = R_MIN + (R_MAX - R_MIN) * Math.min(1, cluster * envelope * 1.4);
          var color = highlights[index] ? HOT : COLOR;
          ctx.fillStyle = 'rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',' + alpha.toFixed(3) + ')';
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
      }
    }
    function loop(now) {
      if (!running || !inView || reduceMotion) { raf = 0; return; }
      if (now - lastDraw >= 1000 / 30) { draw(now); lastDraw = now; }
      raf = window.requestAnimationFrame(loop);
    }
    function syncLoop() {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      if (running && inView && !reduceMotion) raf = window.requestAnimationFrame(loop);
    }
    if ('IntersectionObserver' in window) {
      var hero = canvas.closest('.al-hero') || canvas;
      observer = new IntersectionObserver(function (entries) {
        inView = !!(entries[0] && entries[0].isIntersecting);
        syncLoop();
      }, { rootMargin: '80px 0px' });
      observer.observe(hero);
    }
    function resize() {
      var rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / GAP) + 1;
      rows = Math.ceil(height / GAP) + 1;
      var count = cols * rows;
      phases = new Float32Array(count);
      frequencies = new Float32Array(count);
      highlights = new Uint8Array(count);
      for (var i = 0; i < count; i++) {
        phases[i] = Math.random() * 6.283;
        frequencies[i] = 1 / (3 + Math.random() * 4);
        highlights[i] = Math.random() < .06 ? 1 : 0;
      }
      draw(window.performance && performance.now ? performance.now() : Date.now());
    }
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      syncLoop();
    });
    if ('ResizeObserver' in window) {
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
    } else {
      window.addEventListener('resize', resize, { passive: true });
    }
    resize();
    if (!reduceMotion && running && inView) syncLoop();
  }());

  /* Eight confirmed words, reference interval and fade timing. */
  (function initRotatingWord() {
    var element = document.querySelector('[data-rotating-word]');
    if (!element) return;
    var words = ['AI-Built', 'WordPress', 'e-commerce', 'fintech', 'mobile-first', 'SaaS', 'agency', 'Next.js'];
    var index = 0, timer = 0, transition = 0;
    function stop() {
      if (timer) window.clearInterval(timer);
      if (transition) window.clearTimeout(transition);
      timer = 0;
      transition = 0;
    }
    function start() {
      stop();
      if (reduceMotion || document.hidden) return;
      timer = window.setInterval(function () {
        element.classList.add('al-is-out');
        transition = window.setTimeout(function () {
          index = (index + 1) % words.length;
          element.textContent = words[index];
          element.setAttribute('aria-label', words[index]);
          element.classList.remove('al-is-out');
          transition = 0;
        }, 450);
      }, 2600);
    }
    document.addEventListener('visibilitychange', start);
    start();
  }());

  /* Keep the scan link contract intact: /scan?url=...; device selection remains on /scan. */
  (function initUrlForm() {
    var form = document.querySelector('[data-url-form]');
    var input = document.getElementById('homepage-url');
    var help = document.querySelector('[data-form-help]');
    var button = form && form.querySelector('button[type="submit"]');
    if (!form || !input || !button) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var raw = input.value.trim();
      if (!raw) {
        input.setCustomValidity('Enter a website or API URL.');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      var candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(raw) ? raw : 'https://' + raw;
      var parsed;
      try { parsed = new URL(candidate); } catch (_) {
        input.setCustomValidity('Enter a valid public URL, such as example.com.');
        input.reportValidity();
        return;
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.hostname.indexOf('.') === -1) {
        input.setCustomValidity('Enter a valid public website or API URL.');
        input.reportValidity();
        return;
      }
      if (parsed.username || parsed.password) {
        input.setCustomValidity('URLs containing a username or password are not supported.');
        input.reportValidity();
        return;
      }
      if (help) help.textContent = 'Opening the scan page…';
      button.disabled = true;
      button.textContent = 'Opening…';
      window.location.assign('/scan?url=' + encodeURIComponent(parsed.href));
    });
    input.addEventListener('input', function () { input.setCustomValidity(''); });
  }());

  /* Tabs use native buttons, ARIA state, and arrow-key navigation. */
  (function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"][aria-controls]'));
    if (!tabs.length) return;
    function activate(tab, focus) {
      tabs.forEach(function (item) {
        var selected = item === tab;
        item.classList.toggle('al-is-active', selected);
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
        var panel = document.getElementById(item.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { activate(tab, false); });
      tab.addEventListener('keydown', function (event) {
        var next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        activate(tabs[next], true);
      });
    });
  }());

  /* Small, self-contained mobile menu; no legacy homepage header scripts are needed. */
  (function initMenu() {
    var button = document.querySelector('.al-menu-toggle');
    var menu = document.getElementById('mobile-menu');
    if (!button || !menu) return;
    button.addEventListener('click', function () {
      var open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.hidden = !open;
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !menu.hidden) {
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', 'Open menu');
        button.focus();
      }
    });
    document.addEventListener('click', function (event) {
      if (menu.hidden || menu.contains(event.target) || button.contains(event.target)) return;
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Open menu');
    });
  }());
}());
