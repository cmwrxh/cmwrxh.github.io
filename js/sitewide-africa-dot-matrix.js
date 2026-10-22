/* Shared Africa dot-matrix wave background for secondary routes. */
(function () {
  'use strict';
  if (document.getElementById('al-sitewide-dot-canvas') || !document.body) return;
  var canvas = document.createElement('canvas');
  canvas.id = 'al-sitewide-dot-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  document.body.prepend(canvas);

  /* Preserve the dashboard account dropdown and explicit logout control. */
  if (/^\/dashboard(?:\.html)?\/?$/.test(window.location.pathname)) {
    var header = document.querySelector('header .header-inner');
    var headerRight = header && header.querySelector('.header-right');
    var email = document.getElementById('user-email');
    var logout = document.getElementById('logout-button');
    if (header && headerRight && email && logout) {
      headerRight.innerHTML = '';
      headerRight.style.position = 'relative';
      headerRight.style.gap = '0';
      var toggle = document.createElement('button');
      toggle.type = 'button'; toggle.id = 'dashboard-account-toggle';
      toggle.setAttribute('aria-haspopup', 'true'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'dashboard-account-menu');
      toggle.style.cssText = 'display:flex;align-items:center;gap:12px;border:1px solid rgba(74,161,255,.22);border-radius:10px;background:#0D1726;color:#fff;padding:9px 12px;cursor:pointer;text-align:left;font:inherit;';
      var identity = document.createElement('span'); identity.style.cssText = 'display:grid;gap:2px;';
      var business = document.createElement('strong'); business.id = 'dashboard-account-name'; business.textContent = document.documentElement.dataset.accountDisplayName || 'Account'; business.style.cssText = 'font-size:13px;line-height:1.3;';
      var accountType = document.createElement('span'); accountType.textContent = 'Personal Account (Basic)'; accountType.style.cssText = 'font-size:11px;color:#A0AEC0;line-height:1.3;';
      identity.append(business, accountType);
      var chevron = document.createElement('span'); chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '⌄'; chevron.style.cssText = 'font-size:18px;color:#A0AEC0;';
      toggle.append(identity, chevron);
      var menu = document.createElement('div'); menu.id = 'dashboard-account-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
      menu.style.cssText = 'position:absolute;right:0;top:calc(100% + 10px);z-index:1000;width:min(320px,calc(100vw - 28px));padding:8px;background:#0D1726;border:1px solid rgba(74,161,255,.22);border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.42);color:#fff;';
      var profile = document.createElement('div'); profile.style.cssText = 'padding:12px;border-bottom:1px solid rgba(255,255,255,.1);display:grid;gap:5px;';
      var profileName = document.createElement('strong'); profileName.id = 'dashboard-account-profile-name'; profileName.textContent = document.documentElement.dataset.accountDisplayName || 'Account'; profileName.style.cssText = 'font-size:14px;';
      email.style.cssText = 'display:block!important;color:#A0AEC0;font-size:12px;overflow-wrap:anywhere;';
      profile.append(profileName, email);
      window.africaLatencySetAccountName = function (name) {
        var safeName = String(name || '').trim() || 'Account';
        document.documentElement.dataset.accountDisplayName = safeName;
        business.textContent = safeName; profileName.textContent = safeName;
      };
      var tier = document.createElement('div'); tier.textContent = 'Personal Account (Basic)'; tier.style.cssText = 'padding:10px 12px 8px;color:#A0AEC0;font-size:12px;';
      var accountLink = document.createElement('a'); accountLink.href = '/dashboard.html'; accountLink.textContent = 'Account'; accountLink.setAttribute('role', 'menuitem');
      accountLink.style.cssText = 'display:block;padding:10px 12px;border-radius:7px;color:#fff;text-decoration:none;font-size:14px;';
      accountLink.addEventListener('mouseenter', function () { accountLink.style.background = 'rgba(0,123,255,.12)'; });
      accountLink.addEventListener('mouseleave', function () { accountLink.style.background = 'transparent'; });
      logout.textContent = 'Log Out';
      logout.style.cssText = 'display:block;width:100%;text-align:left;margin-top:2px;padding:10px 12px;border:0;border-top:1px solid rgba(255,255,255,.1);border-radius:0;background:transparent;color:#fff;font-size:14px;cursor:pointer;';
      menu.append(profile, tier, accountLink, logout); headerRight.append(toggle, menu);
      function setOpen(open) { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); }
      toggle.addEventListener('click', function () { setOpen(menu.hidden); });
      document.addEventListener('click', function (event) { if (!headerRight.contains(event.target)) setOpen(false); });
      document.addEventListener('keydown', function (event) { if (event.key === 'Escape') { setOpen(false); toggle.focus(); } });
    }
  }

  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  var dots = [], width = 0, height = 0, dpr = 1, raf = 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    var spacing = width < 700 ? 19 : 14;
    for (var y = spacing / 2; y < height + spacing; y += spacing) {
      for (var x = spacing / 2; x < width + spacing; x += spacing) {
        dots.push({ x: x, y: y, phase: Math.random() * Math.PI * 2, land: false });
      }
    }
    draw(0);
  }
  function draw(ms) {
    var t = ms * 0.001;
    ctx.fillStyle = '#EAF5FF'; ctx.fillRect(0, 0, width, height);
    var glow = ctx.createRadialGradient(width * .5, height * .43, 0, width * .5, height * .43, Math.max(width, height) * .78);
    glow.addColorStop(0, 'rgba(50,146,224,.17)');
    glow.addColorStop(.52, 'rgba(50,146,224,.10)');
    glow.addColorStop(1, 'rgba(234,245,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    dots.forEach(function (d) {
      /* Edge-to-edge traveling blueprint wave, with brighter crests and restrained ambient dots. */
      var diagonal = d.x * .012 + d.y * .018;
      var crest = Math.pow(Math.max(0, Math.sin(diagonal - t * 1.15)), 5);
      var ripple = Math.pow(Math.max(0, Math.sin(Math.hypot(d.x - width * .48, d.y - height * .42) * .018 - t * .85)), 8);
      var shimmer = (Math.sin(d.phase + t * .6) + 1) * .5;
      var alpha = .045 + crest * .26 + ripple * .13 + shimmer * .025;
      var radius = .75 + crest * .65 + ripple * .3;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(50,146,224,' + Math.min(.48, alpha) + ')';
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (crest > .82) {
        ctx.beginPath(); ctx.fillStyle = 'rgba(50,146,224,' + (crest * .16) + ')';
        ctx.arc(d.x, d.y, radius * 2.8, 0, Math.PI * 2); ctx.fill();
      }
    });
    /* Soft vignette retains contrast for text and panels while keeping the wave full-bleed. */
    var vignette = ctx.createRadialGradient(width * .5, height * .45, Math.min(width, height) * .12, width * .5, height * .45, Math.max(width, height) * .76);
    vignette.addColorStop(0, 'rgba(234,245,255,0)');
    vignette.addColorStop(1, 'rgba(234,245,255,.08)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  }
  function animate(ms) {
    draw(ms);
    if (!reduced && !document.hidden) raf = requestAnimationFrame(animate);
    else raf = 0;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
    else if (!reduced && !raf) raf = requestAnimationFrame(animate);
  });
  if (!reduced) raf = requestAnimationFrame(animate);
}());
