// Shared site interactions

document.addEventListener('DOMContentLoaded', () => {
  const brandStyles = document.createElement('link');
  brandStyles.rel = 'stylesheet';
  brandStyles.href = '/css/brand.css';
  document.head.appendChild(brandStyles);

  const menuStyle = document.createElement('style');
  menuStyle.textContent = `
    .site-menu { position: fixed !important; inset: 0 !important; z-index: 99999 !important; display: flex !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; background: #050609 !important; transition: opacity .2s ease, visibility .2s ease !important; }
    .site-menu.open { display: flex !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }
    .site-menu-inner { position: absolute !important; inset: 0 !important; display: flex !important; flex-direction: column !important; max-width: 100% !important; }
    .menu-grid { flex: 1 !important; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; gap: 8px !important; min-height: 0 !important; overflow-y: auto !important; }
    .menu-column { width: min(760px, 100%); text-align: center; }
    .menu-column > a { text-align: center; }
    .menu-group { width: 100%; padding: 0 0 1.3rem; }
    .menu-group-title, .menu-item { display: block; width: 100%; color: #fff; font: 500 1.18rem/1.25 Inter, sans-serif; letter-spacing: 0; text-decoration: none; }
    .menu-group-title { padding: 0; }
    .menu-subitems { display: flex; flex-direction: column; align-items: center; gap: .55rem; margin-top: .55rem; padding-left: 1.5rem; }
    .menu-subitems > a { display: block; width: 100%; color: #fff; font: 400 1rem/1.3 Inter, sans-serif; letter-spacing: 0; text-decoration: none; text-align: center; }
    .menu-item { padding: 0 0 1.3rem; }
    .menu-item:last-child { padding-bottom: 0; }
    .legacy-menu-grid { justify-content: center !important; }
    .legacy-menu-links { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 0 !important; }
    .legacy-menu-links > a { width: 100%; padding: 0 0 1.3rem !important; color: #fff !important; font: 500 1.18rem/1.25 Inter, sans-serif !important; letter-spacing: 0 !important; }
    .legacy-menu-links > a:last-child { padding-bottom: 0 !important; }
    .legacy-menu-bottom { margin-top: 18px; text-align: center; }
    .site-menu .social-icons { margin-top: 8px; }
    .site-menu .menu-footer { flex-shrink: 0; }
    .site-menu .menu-footer .btn-primary { order: 1; }
    .site-menu .menu-footer .btn-secondary { order: 2; }
    body.menu-open { overflow: hidden !important; }
    .nav-links { display: none; }
    .nav-cta { display: none; }
    nav .nav-inner { transition: padding .22s ease, min-height .22s ease; }
    body.nav-scrolled nav .nav-inner { padding-top: 8px; padding-bottom: 8px; }

    /* Tier 4 desktop navigation: compact hierarchy instead of a flat sitemap. */
    @media (min-width: 900px) {
      .nav-inner { gap: 24px; }
      .nav-links { display: flex !important; align-items: center; gap: 18px; list-style: none; margin: 0; padding: 0; }
      nav .nav-links > li:nth-child(n) { display: list-item !important; }
      .nav-links li { position: relative; display: list-item !important; margin: 0; padding: 0; }
      .nav-links li a,
      .nav-links .nav-dropdown-trigger { display: inline-flex; align-items: center; white-space: nowrap; }
      .nav-links .nav-dropdown-trigger { appearance: none; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; padding: 0; }
      .nav-links .nav-dropdown-trigger::after { content: ''; width: 6px; height: 6px; margin: -3px 0 0 7px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(45deg); opacity: .65; }
      .nav-dropdown-menu { position: absolute; top: calc(100% + 12px); left: -14px; display: none; min-width: 205px; padding: 9px; border: 1px solid rgba(255,255,255,.10); border-radius: 12px; background: #111114; box-shadow: 0 18px 45px rgba(0,0,0,.35); }
      .nav-dropdown-menu::before { content: ''; position: absolute; top: -8px; left: 20px; width: 14px; height: 14px; background: #111114; border-left: 1px solid rgba(255,255,255,.10); border-top: 1px solid rgba(255,255,255,.10); transform: rotate(45deg); }
      .nav-dropdown-menu a { position: relative; z-index: 1; display: flex !important; width: 100%; padding: 9px 10px; border-radius: 7px; color: #c8ccd4; text-decoration: none; font-size: .86rem; }
      .nav-dropdown-menu a:hover,
      .nav-dropdown-menu a:focus-visible { background: rgba(255,255,255,.06); color: #fff; outline: none; }
      .nav-dropdown:hover .nav-dropdown-menu,
      .nav-dropdown:focus-within .nav-dropdown-menu { display: block; }
      .nav-links .nav-dropdown-menu.nav-services { min-width: 225px; }
      .nav-links .nav-dropdown-menu.nav-resources { min-width: 210px; left: -10px; }
      .nav-links .nav-dropdown-menu.nav-resources::before { left: 22px; }
      .nav-cta { display: inline-flex; align-items: center; white-space: nowrap; }
      .nav-actions { margin-left: auto; }
      .menu-toggle { display: none !important; }
      .site-menu { display: flex !important; }
    }

    @media (min-width: 900px) and (max-width: 1150px) {
      .nav-inner { gap: 16px; }
      .nav-links { gap: 14px; }
      .nav-links a, .nav-links .nav-dropdown-trigger { font-size: .88rem; }
      .nav-cta { font-size: .8rem; padding-left: 13px; padding-right: 13px; }
    }
  `;
  document.head.appendChild(menuStyle);

  const updateNavScrollState = () => document.body.classList.toggle('nav-scrolled', window.scrollY > 100);
  updateNavScrollState();
  window.addEventListener('scroll', updateNavScrollState, { passive: true });

  if (!document.querySelector('script[src="/africalatency.js"]')) {
    const rum = document.createElement('script');
    rum.defer = true;
    rum.src = '/africalatency.js';
    rum.setAttribute('data-al-key', 'test-site-001');
    document.head.appendChild(rum);
  }

  document.querySelectorAll('.nav-brand').forEach((brand) => {
    brand.classList.add('brand-lockup');
    brand.setAttribute('aria-label', 'AfricaLatency.dev');
    brand.innerHTML = `
      <img class="brand-icon" src="/images/logo-icon-v4.png" alt="" aria-hidden="true">
      <span class="brand-name"><span class="brand-name-white">Africa</span><span class="brand-name-green">Latency</span><span class="brand-name-white">.dev</span></span>`;
  });

  const serviceLinks = [
    ['/scan.html', 'Free Scan'],
    ['/sitespeed.html', 'Website Speed Check'],
    ['/methodology.html', 'Methodology']
  ];
  const resourceLinks = [
    ['/data-centers.html', 'Data centers'],
    ['/kenya.html', 'Kenya'],
    ['/nigeria.html', 'Nigeria'],
    ['/cases.html', 'Cases'],
    ['/blog.html', 'Blog'],
    ['/help-centre.html', 'Help centre']
  ];
  const topLinks = [
    ['/about.html', 'About'],
    ['/contact.html', 'Contact'],
    ['/login.html', 'Login']
  ];

  const nav = document.querySelector('nav');
  if (nav) {
    let navLinks = nav.querySelector('.nav-links');
    if (!navLinks) {
      navLinks = document.createElement('ul'); navLinks.className = 'nav-links';
      const navInner = nav.querySelector('.nav-inner');
      if (navInner) {
        const actions = navInner.querySelector('.nav-actions') || document.createElement('div');
        actions.className = 'nav-actions'; navInner.appendChild(actions); navInner.insertBefore(navLinks, actions);
      }
    }
    const renderDropdown = (label, items, extraClass) => `<li class="nav-dropdown"><button class="nav-dropdown-trigger" type="button" aria-haspopup="true">${label}</button><div class="nav-dropdown-menu ${extraClass}">${items.map(([href, text]) => `<a href="${href}">${text}</a>`).join('')}</div></li>`;
    navLinks.innerHTML = [
      renderDropdown('Services', serviceLinks, 'nav-services'),
      renderDropdown('Resources', resourceLinks, 'nav-resources'),
      ...topLinks.map(([href, text]) => `<li><a href="${href}">${text}</a></li>`)
    ].join('');
    let navCta = nav.querySelector('.nav-cta');
    if (!navCta) {
      navCta = document.createElement('a'); navCta.className = 'nav-cta btn btn-primary'; navCta.href = '/scan.html'; navCta.textContent = 'Run a free scan';
      const navInner = nav.querySelector('.nav-inner'); const actions = navInner?.querySelector('.nav-actions'); if (actions) actions.appendChild(navCta);
    }
  }

  function buildMobileMenu(menu) {
    const grid = menu.querySelector('.menu-grid'); if (!grid) return;
    const existingSocialIcons = grid.querySelector('.social-icons');
    const socialIcons = existingSocialIcons ? existingSocialIcons.cloneNode(true) : null;
    grid.innerHTML = `
      <div class="menu-column">
        <div class="menu-group"><a href="/services.html" class="menu-group-title">Services</a><div class="menu-subitems"><a href="/scan.html">Free Scan</a><a href="/sitespeed.html">Website Speed Check</a><a href="/methodology.html">Methodology</a></div></div>
        <a href="/about.html" class="menu-item">About</a>
        <div class="menu-group"><div class="menu-label menu-group-title">Resources</div><div class="menu-subitems"><a href="/data-centers.html">Data centers</a><a href="/kenya.html">Kenya</a><a href="/nigeria.html">Nigeria</a><a href="/blog.html">Blog</a><a href="/cases.html">Cases</a><a href="/help-centre.html">Help centre</a></div></div>
        <a href="/contact.html" class="menu-item">Contact</a><a href="/login.html" class="menu-item">Login</a>
      </div><div class="legacy-menu-bottom"><div class="menu-label">Follow</div></div>`;
    if (socialIcons) grid.querySelector('.legacy-menu-bottom').appendChild(socialIcons);
  }

  if (!document.getElementById('site-menu')) {
    const navLinks = nav?.querySelector('.nav-links');
    if (nav && navLinks) {
      const toggle = document.createElement('button'); toggle.id = 'menu-toggle'; toggle.className = 'menu-toggle'; toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Open menu'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'site-menu'); toggle.innerHTML = '<span></span><span></span><span></span>';
      const actions = nav.querySelector('.nav-actions') || document.createElement('div'); actions.className = 'nav-actions'; actions.appendChild(toggle); nav.querySelector('.nav-inner').appendChild(actions);
      const menu = document.createElement('div'); menu.className = 'site-menu legacy-menu'; menu.id = 'site-menu'; menu.setAttribute('aria-hidden', 'true');
      menu.innerHTML = `<div class="site-menu-inner"><div class="menu-head"><span class="label">AfricaLatency</span><button id="menu-close" class="menu-close" type="button" aria-label="Close menu">×</button></div><div class="menu-grid legacy-menu-grid"><div class="menu-column legacy-menu-links"></div><div class="legacy-menu-bottom"><div class="menu-label">Follow</div><div class="social-icons"><a href="https://www.linkedin.com/in/charles-mwaura-bb7814140/" target="_blank" rel="noopener" aria-label="LinkedIn">in</a><a href="https://github.com/cmwrxh/cmwrxh.github.io" target="_blank" rel="noopener" aria-label="GitHub">⌘</a><a href="mailto:support@africalatency.dev" aria-label="Email">✉</a></div></div></div><div class="menu-footer"><a class="btn btn-primary" href="/scan.html">Run a free scan</a><a class="btn btn-secondary" href="/contact.html">Contact</a></div></div>`;
      const linkContainer = menu.querySelector('.legacy-menu-links');
      [...serviceLinks, ...topLinks, ...resourceLinks].forEach(([href, text]) => { const a = document.createElement('a'); a.href = href; a.textContent = text; linkContainer.appendChild(a); });
      document.body.appendChild(menu); buildMobileMenu(menu); wireMenu(menu, toggle);
    }
  } else {
    const menu = document.getElementById('site-menu'); const toggle = document.getElementById('menu-toggle'); if (menu && toggle) { buildMobileMenu(menu); wireMenu(menu, toggle); }
  }

  function wireMenu(menu, toggle) {
    if (toggle.dataset.menuWired) return; const close = menu.querySelector('#menu-close'); if (!close) return; toggle.dataset.menuWired = 'true';
    let isOpen = menu.classList.contains('open');
    const setMenu = (next) => { isOpen = Boolean(next); menu.classList.toggle('open', isOpen); menu.setAttribute('aria-hidden', String(!isOpen)); toggle.setAttribute('aria-expanded', String(isOpen)); toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu'); document.body.classList.toggle('menu-open', isOpen); };
    toggle.addEventListener('click', (event) => { event.preventDefault(); setMenu(!isOpen); }); close.addEventListener('click', () => setMenu(false));
    menu.addEventListener('click', (event) => { if (event.target === menu) setMenu(false); }); menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setTimeout(() => setMenu(false), 0)));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenu(false); });
  }

  function normalizeFooter() {
    const footer = document.querySelector('footer');
    if (!footer || footer.dataset.unifiedFooter) return;
    footer.dataset.unifiedFooter = 'true';
    footer.classList.add('homepage-footer');
    footer.innerHTML = `
      <div class="footer-inner tier4-footer-grid">
        <div class="tier4-footer-col footer-intro">
          <div class="label">AfricaLatency.dev</div>
          <h3>Better performance. Better digital experiences.</h3>
          <p>Helping businesses understand, improve, and monitor digital performance across Africa.</p>
          <p class="footer-address">1 Parklands Ave, Nairobi 00623, Kenya</p>
          <p class="footer-copy">© 2026 AfricaLatency.dev</p>
        </div>
        <div class="tier4-footer-col">
          <h4>Company</h4>
          <div class="tier4-footer-links">
            <a href="/about.html">About</a>
            <a href="/contact.html">Contact</a>
            <a href="/cases.html">Cases</a>
          </div>
        </div>
        <div class="tier4-footer-col">
          <h4>Legal</h4>
          <div class="tier4-footer-links">
            <a href="/terms-of-service.html">Terms of Service</a>
            <a href="/privacy-policy.html">Privacy Policy</a>
            <a href="/service-level-agreement.html">Service Level Agreement</a>
            <a href="/acceptable-use-policy.html">Acceptable Use</a>
            <a href="/refund-policy.html">Refund Policy</a>
          </div>
        </div>
        <div class="tier4-footer-col">
          <h4>Resources</h4>
          <div class="tier4-footer-links">
            <a href="/scan.html">Free Scan</a>
            <a href="/sitespeed.html">Website Speed Check</a>
            <a href="/methodology.html">Methodology</a>
            <a href="/data-centers.html">Data centers</a>
            <a href="/kenya.html">Kenya</a>
            <a href="/nigeria.html">Nigeria</a>
            <a href="/blog.html">Blog</a>
            <a href="/help-centre.html">Help centre</a>
          </div>
        </div>
        <div class="tier4-footer-col">
          <h4>Connect</h4>
          <div class="tier4-footer-links">
            <a href="mailto:support@africalatency.dev">support@africalatency.dev</a>
            <a href="https://github.com/cmwrxh/cmwrxh.github.io" target="_blank" rel="noopener">GitHub</a>
          </div>
          <p style="margin-top:16px;color:rgba(255,255,255,.55);font-size:.72rem">Africa Latency Ltd<br>1 Parklands Ave, Nairobi 00623, Kenya</p>
        </div>
      </div>`;
  }

  normalizeFooter();

  const calcForm = document.getElementById('impact-calculator-form');
  if (calcForm) {
    calcForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const domain = document.getElementById('calc-domain').value; const latency = parseFloat(document.getElementById('calc-latency').value);
      const traffic = parseInt(document.getElementById('calc-traffic').value); const aov = parseFloat(document.getElementById('calc-aov').value);
      const baseConversion = parseFloat(document.getElementById('calc-conversion').value) / 100; const latencyPenaltyMs = Math.max(0, latency - 150);
      const penaltyFactor = (latencyPenaltyMs / 100) * 0.035; const normalTransactions = traffic * baseConversion;
      const degradedConversion = Math.max(0, baseConversion * (1 - penaltyFactor)); const actualTransactions = traffic * degradedConversion;
      const lostTransactions = normalTransactions - actualTransactions; const estimatedMonthlyLoss = lostTransactions * aov;
      document.getElementById('res-domain').textContent = domain; document.getElementById('loss-output').textContent = `$${estimatedMonthlyLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} lost / month`;
      document.getElementById('breakdown-text').innerHTML = `With <span class="command">${latency}ms</span> latency from Nairobi, conversion suffers a <span class="command">${(penaltyFactor * 100).toFixed(1)}%</span> friction penalty (~${Math.round(lostTransactions)} dropped orders/mo).`;
      document.getElementById('calculator-results').style.display = 'block';
    });
  }

  if (document.querySelector('.hero-highlight') && !document.querySelector('script[src="/js/dogfood-geo.js"]')) { const geoDogfood = document.createElement('script'); geoDogfood.src = '/js/dogfood-geo.js'; document.head.appendChild(geoDogfood); }
  if (!document.querySelector('script[src="/js/compliance.js"]')) { const compliance = document.createElement('script'); compliance.defer = true; compliance.src = '/js/compliance.js'; document.head.appendChild(compliance); }
  if (!document.querySelector('script[src="/js/ux.js"]')) { const ux = document.createElement('script'); ux.defer = true; ux.src = '/js/ux.js'; document.head.appendChild(ux); }
});