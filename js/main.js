// Shared site interactions

document.addEventListener('DOMContentLoaded', () => {
  // Legacy pages have an inline nav-links list but no menu button. Convert that
  // navigation into the same full-screen overlay used by the homepage.
  if (!document.getElementById('site-menu')) {
    const nav = document.querySelector('nav');
    const navLinks = nav?.querySelector('.nav-links');

    if (nav && navLinks) {
      const links = Array.from(navLinks.querySelectorAll('a')).map((a) => ({
        href: a.getAttribute('href'),
        text: a.textContent.trim()
      }));

      const toggle = document.createElement('button');
      toggle.id = 'menu-toggle';
      toggle.className = 'menu-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Open menu');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'site-menu');
      toggle.innerHTML = '<span></span><span></span><span></span>';

      navLinks.remove();
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
            <a class="btn btn-secondary" href="/login">Log in</a>
            <a class="btn btn-primary" href="/contact">Contact us</a>
          </div>
        </div>`;

      const linkContainer = menu.querySelector('.legacy-menu-links');
      links.forEach(({ href, text }) => {
        const a = document.createElement('a');
        a.href = href;
        a.innerHTML = `<strong>${text}</strong>`;
        linkContainer.appendChild(a);
      });

      document.body.appendChild(menu);

      const close = menu.querySelector('#menu-close');
      const setMenu = (open) => {
        menu.classList.toggle('open', open);
        menu.setAttribute('aria-hidden', String(!open));
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.classList.toggle('menu-open', open);
      };

      toggle.addEventListener('click', () => setMenu(true));
      close.addEventListener('click', () => setMenu(false));
      menu.addEventListener('click', (event) => {
        if (event.target === menu) setMenu(false);
      });
      menu.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', () => setMenu(false));
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setMenu(false);
      });
    }
  }

  // Business-Impact Calculator Logic
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
