// Shared site interactions

document.addEventListener('DOMContentLoaded', () => {
  const brandStyles = document.createElement('link');
  brandStyles.rel = 'stylesheet';
  brandStyles.href = '/css/brand.css';
  document.head.appendChild(brandStyles);

  const menuStyle = document.createElement('style');
  menuStyle.textContent = `
    .site-menu { position: fixed !important; inset: 0 !important; z-index: 99999 !important; display: block !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; background: #050609 !important; }
    .site-menu.open { opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }
    .site-menu-inner { position: absolute !important; inset: 0 !important; display: flex !important; flex-direction: column !important; max-width: 100% !important; }
    .menu-grid { flex: 1 !important; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; gap: 8px !important; min-height: 0 !important; overflow-y: auto !important; }
    .menu-column { width: min(760px, 100%); text-align: center; }
    .menu-column > a { text-align: center; }
    .legacy-menu-grid { justify-content: center !important; }
    .legacy-menu-links { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 0 !important; }
    .legacy-menu-links > a { width: 100%; padding: 0 0 1.3rem !important; color: #fff !important; font: 500 1.18rem/1.25 Inter, sans-serif !important; letter-spacing: 0 !important; }
    .legacy-menu-links > a:last-child { padding-bottom: 0 !important; }
    .legacy-menu-links > a strong { font: inherit !important; font-weight: 500 !important; }
    .legacy-menu-bottom { margin-top: 18px; text-align: center; }
    .legacy-menu-bottom .menu-label { margin-top: 0; }
    .site-menu .social-icons { margin-top: 8px; }
    .site-menu .menu-footer { flex-shrink: 0; }
    .site-menu .menu-footer .btn-primary { order: 1; }
    .site-menu .menu-footer .btn-secondary { order: 2; }
    body.menu-open { overflow: hidden !important; }
    .nav-links { display: none; }
    .nav-cta { display: none; }
    @media (min-width: 900px) {
      .nav-inner { gap: 24px; }
      .nav-links { display: flex; align-items: center; gap: 20px; list-style: none; margin: 0; padding: 0; }
      .nav-links li { margin: 0; padding: 0; }
      .nav-links li a { display: inline-flex; align-items: center; white-space: nowrap; }
      .nav-cta { display: inline-flex; align-items: center; white-space: nowrap; }
      .nav-actions { margin-left: auto; }
      .menu-toggle { display: none !important; }
      .site-menu { display: none !important; }
    }
  `;
  document.head.appendChild(menuStyle);

  // Shared brand lockup: icon image + real HTML/CSS brand text.
  document.querySelectorAll('.nav-brand').forEach((brand) => {
    brand.innerHTML = '';
    const lockup = document.createElement('a');
    lockup.className = 'brand-lockup';
    lockup.href = '/';
    lockup.setAttribute('aria-label', 'Africa Latency Ltd');
    lockup.innerHTML = `
      <img class="brand-icon" src="/images/logo-icon-v4.png" alt="" aria-hidden="true">
      <span class="brand-name">
        <span class="brand-name-white">Africa</span>
        <span class="brand-name-green">Latency</span>
        <span class="brand-name-white">Ltd</span>
      </span>`;
    brand.appendChild(lockup);
  });

  const links = [
    ['/services', 'Services'],
    ['/scan', 'Free Scan'],
    ['/methodology', 'Methodology'],
    ['/cases', 'Cases'],
    ['/about', 'About us'],
    ['/blog', 'Blog'],
    ['/help-centre', 'Help centre'],
    ['/contact', 'Contact Us'],
    ['/login', 'Login']
  ];

  const nav = document.querySelector('nav');
  if (nav) {
    let navLinks = nav.querySelector('.nav-links');
    if (!navLinks) {
      navLinks = document.createElement('ul');
      navLinks.className = 'nav-links';
      const navInner = nav.querySelector('.nav-inner');
      if (navInner) {
        const actions = navInner.querySelector('.nav-actions') || document.createElement('div');
        actions.className = 'nav-actions';
        navInner.appendChild(actions);
        navInner.insertBefore(navLinks, actions);
      }
    }

    navLinks.innerHTML = links.map(([href, text]) => `<li><a href="${href}">${text}</a></li>`).join('');

    let navCta = nav.querySelector('.nav-cta');
    if (!navCta) {
      navCta = document.createElement('a');
      navCta.className = 'nav-cta btn btn-primary';
      navCta.href = '/scan';
      navCta.textContent = 'Run a free scan';
      const navInner = nav.querySelector('.nav-inner');
      const actions = navInner?.querySelector('.nav-actions');
      if (actions) actions.appendChild(navCta);
    }
  }

  // Legacy pages have an inline nav-links list but no menu button. Keep that
  // horizontal navigation for desktop and convert it into the same full-screen
  // overlay used by the homepage for mobile.
  if (!document.getElementById('site-menu')) {
    const navLinks = nav?.querySelector('.nav-links');

    if (nav && navLinks) {
      const toggle = document.createElement('button');
      toggle.id = 'menu-toggle';
      toggle.className = 'menu-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Open menu');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'site-menu');
      toggle.innerHTML = '<span></span><span></span><span></span>';

      const actions = nav.querySelector('.nav-actions') || document.createElement('div');
      actions.className = 'nav-actions';
      actions.appendChild(toggle);
      nav.querySelector('.nav-inner').appendChild(actions);

      const menu = document.createElement('div');
      menu.className = 'site-menu legacy-menu';
      menu.id = 'site-menu';
      menu.setAttribute('aria-hidden', 'true');
      menu.innerHTML = `
        <div class="site-menu-inner">
          <div class="menu-head">
            <span class="label">AfricaLatency</span>
            <button id="menu-close" class="menu-close" type="button" aria-label="Close menu">×</button>
          </div>
          <div class="menu-grid legacy-menu-grid">
            <div class="menu-column legacy-menu-links"></div>
            <div class="legacy-menu-bottom">
              <div class="menu-label">Follow</div>
              <div class="social-icons">
                <a href="https://www.linkedin.com/in/charles-mwaura-bb7814140/" target="_blank" rel="noopener" aria-label="LinkedIn">in</a>
                <a href="https://github.com/cmwrxh/cmwrxh.github.io" target="_blank" rel="noopener" aria-label="GitHub">⌘</a>
                <a href="mailto:support@africalatency.dev" aria-label="Email">✉</a>
              </div>
            </div>
          </div>
          <div class="menu-footer">
            <a class="btn btn-primary" href="/scan">Run a free scan</a>
            <a class="btn btn-secondary" href="/contact">Contact Us</a>
          </div>
        </div>`;

      const linkContainer = menu.querySelector('.legacy-menu-links');
      links.forEach(([href, text]) => {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = text;
        linkContainer.appendChild(a);
      });

      document.body.appendChild(menu);
      wireMenu(menu, toggle);
    }
  }

  function wireMenu(menu, toggle) {
    if (toggle.dataset.menuWired) return;
    toggle.dataset.menuWired = 'true';
    const close = menu.querySelector('#menu-close');
    if (!close) return;

    let isOpen = false;
    const setMenu = (next) => {
      isOpen = Boolean(next);
      menu.classList.toggle('open', isOpen);
      menu.setAttribute('aria-hidden', String(!isOpen));
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('menu-open', isOpen);
    };

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      setMenu(!isOpen);
    });
    close.addEventListener('click', () => setMenu(false));
    menu.addEventListener('click', (event) => {
      if (event.target === menu) setMenu(false);
    });
    menu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        setTimeout(() => setMenu(false), 0);
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setMenu(false);
    });
  }

  const calcForm = document.getElementById('impact-calculator-form');
  if (calcForm) {
    calcForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const domain = document.getElementById('calc-domain').value;
      const latency = parseFloat(document.getElementById('calc-latency').value);
      const traffic = parseInt(document.getElementById('calc-traffic').value);
      const aov = parseFloat(document.getElementById('calc-aov').value);
      const baseConversion = parseFloat(document.getElementById('calc-conversion').value) / 100;
      const latencyPenaltyMs = Math.max(0, latency - 150);
      const penaltyFactor = (latencyPenaltyMs / 100) * 0.035;
      const normalTransactions = traffic * baseConversion;
      const degradedConversion = Math.max(0, baseConversion * (1 - penaltyFactor));
      const actualTransactions = traffic * degradedConversion;
      const lostTransactions = normalTransactions - actualTransactions;
      const estimatedMonthlyLoss = lostTransactions * aov;
      document.getElementById('res-domain').textContent = domain;
      document.getElementById('loss-output').textContent = `$${estimatedMonthlyLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} lost / month`;
      document.getElementById('breakdown-text').innerHTML = `With <span class="command">${latency}ms</span> latency from Nairobi, conversion suffers a <span class="command">${(penaltyFactor * 100).toFixed(1)}%</span> friction penalty (~${Math.round(lostTransactions)} dropped orders/mo).`;
      document.getElementById('calculator-results').style.display = 'block';
    });
  }
});
