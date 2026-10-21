/* Shared pitch-black Africa dot-matrix background for secondary routes. */
(function () {
  'use strict';
  if (document.getElementById('al-sitewide-dot-canvas') || !document.body) return;
  var canvas = document.createElement('canvas');
  canvas.id = 'al-sitewide-dot-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  document.body.prepend(canvas);
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
      toggle.style.cssText = 'display:flex;align-items:center;gap:12px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:#0D131D;color:#fff;padding:9px 12px;cursor:pointer;text-align:left;font:inherit;';
      var identity = document.createElement('span'); identity.style.cssText = 'display:grid;gap:2px;';
      var business = document.createElement('strong'); business.id = 'dashboard-account-name'; business.textContent = document.documentElement.dataset.accountDisplayName || 'Account'; business.style.cssText = 'font-size:13px;line-height:1.3;';
      var accountType = document.createElement('span'); accountType.textContent = 'Personal Account (Basic)'; accountType.style.cssText = 'font-size:11px;color:#A0AEC0;line-height:1.3;';
      identity.append(business, accountType);
      var chevron = document.createElement('span'); chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '⌄'; chevron.style.cssText = 'font-size:18px;color:#A0AEC0;';
      toggle.append(identity, chevron);
      var menu = document.createElement('div'); menu.id = 'dashboard-account-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
      menu.style.cssText = 'position:absolute;right:0;top:calc(100% + 10px);z-index:1000;width:min(320px,calc(100vw - 28px));padding:8px;background:#0D131D;border:1px solid rgba(255,255,255,.14);border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.42);color:#fff;';
      var profile = document.createElement('div'); profile.style.cssText = 'padding:12px;border-bottom:1px solid rgba(255,255,255,.1);display:grid;gap:5px;';
      var profileName = document.createElement('strong'); profileName.id = 'dashboard-account-profile-name'; profileName.textContent = document.documentElement.dataset.accountDisplayName || 'Account'; profileName.style.cssText = 'font-size:14px;';
      email.style.cssText = 'display:block!important;color:#A0AEC0;font-size:12px;overflow-wrap:anywhere;';
      profile.append(profileName, email);
      window.africaLatencySetAccountName = function (name) {
        var safeName = String(name || '').trim() || 'Account';
        document.documentElement.dataset.accountDisplayName = safeName;
        business.textContent = safeName;
        profileName.textContent = safeName;
      };
      var tier = document.createElement('div'); tier.textContent = 'Personal Account (Basic)'; tier.style.cssText = 'padding:10px 12px 8px;color:#A0AEC0;font-size:12px;';
      var accountLink = document.createElement('a'); accountLink.href = '/dashboard.html'; accountLink.textContent = 'Account'; accountLink.setAttribute('role', 'menuitem');
      accountLink.style.cssText = 'display:block;padding:10px 12px;border-radius:7px;color:#fff;text-decoration:none;font-size:14px;';
      accountLink.addEventListener('mouseenter', function () { accountLink.style.background = 'rgba(255,255,255,.07)'; });
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
  var bounds = { minLon: -20, maxLon: 55, minLat: -37, maxLat: 39 };
  var polygon = [[-17.5,14.7],[-16.8,21],[-13,27.7],[-8.7,27.3],[-5.5,35.8],[-1,35.2],[3,36],[9.5,37],[11,33],[25,31.5],[34,31],[36.8,22],[43,12.7],[51,11.5],[49,2],[42,-4.5],[40.5,-11],[35,-17],[35.8,-24.5],[32.9,-29.5],[28.5,-34.8],[25,-34.7],[19,-34.8],[16.5,-28.5],[12.5,-17],[12,-6],[8.5,4.5],[2,5.5],[-4.5,5],[-8.5,4],[-12,7],[-16.5,12]];
  var dots = [], width = 0, height = 0, dpr = 1, raf = 0, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function inside(lon, lat) {
    var hit = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var a = polygon[i], b = polygon[j];
      if (((a[1] > lat) !== (b[1] > lat)) && lon < (b[0]-a[0])*(lat-a[1])/((b[1]-a[1]) || 1e-6)+a[0]) hit = !hit;
    }
    return hit;
  }
  function resize() {
    width = window.innerWidth; height = window.innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); dots = [];
    var spacing = width < 700 ? 18 : 14, mapH = Math.min(height*.76, Math.max(260, width*.43));
    var mapW = Math.min(mapH*(bounds.maxLon-bounds.minLon)/(bounds.maxLat-bounds.minLat), width*.96);
    var left = (width-mapW)*.5, top = (height-mapH)*.5;
    for (var y=spacing/2; y<height; y+=spacing) for (var x=spacing/2; x<width; x+=spacing) {
      var lon=bounds.minLon+(x-left)/mapW*(bounds.maxLon-bounds.minLon), lat=bounds.maxLat-(y-top)/mapH*(bounds.maxLat-bounds.minLat);
      dots.push({x:x,y:y,land:x>=left && x<=left+mapW && y>=top && y<=top+mapH && inside(lon,lat),phase:Math.random()*Math.PI*2});
    }
    draw(0);
  }
  function draw(ms) {
    ctx.fillStyle='#000000'; ctx.fillRect(0,0,width,height); var t=ms*.001;
    var grad=ctx.createRadialGradient(width*.5,height*.48,Math.min(width,height)*.08,width*.5,height*.48,Math.max(width,height)*.68);
    grad.addColorStop(0,'rgba(0,0,0,0)'); grad.addColorStop(1,'rgba(0,0,0,.88)');
    dots.forEach(function(d) {
      var wave=(Math.sin(d.x*.012+d.y*.008-t*1.25)+Math.cos(Math.hypot(d.x-width*.5,d.y-height*.48)*.018-t))*.5, pulse=Math.max(0,wave);
      var alpha=d.land ? .18+pulse*.48 : .025+pulse*.07, purple=(Math.sin(t*.55+d.phase)+1)*.5;
      var rgb=purple>.72 ? '139,92,246' : (purple>.48 ? '99,102,241' : (purple>.24 ? '56,161,224' : '43,128,197'));
      ctx.beginPath(); ctx.fillStyle='rgba('+rgb+','+alpha+')'; ctx.arc(d.x,d.y,d.land ? .8+pulse*.35 : .8,0,Math.PI*2); ctx.fill();
    });
    ctx.fillStyle=grad; ctx.fillRect(0,0,width,height);
  }
  function animate(ms) { draw(ms); if (!reduced && !document.hidden) raf=requestAnimationFrame(animate); }
  resize(); window.addEventListener('resize', resize, {passive:true});
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf=0; }
    else if (!reduced && !raf) raf=requestAnimationFrame(animate);
  });
  if (!reduced) raf=requestAnimationFrame(animate);
}());