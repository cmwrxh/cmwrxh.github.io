/* Tier 4 visual/interaction layer. Keeps the existing site structure intact while adding restrained icons, accessible mobile accordions, dogfooding telemetry, network topology, proof coverage, and color discipline. */
(function () {
  'use strict';

  const ICONS = { Network:'activity', Edge:'globe-2', Infrastructure:'server', Application:'code-2', Database:'database', 'Third parties':'boxes' };

  function loadLucide() {
    if (window.lucide) return Promise.resolve();
    if (document.querySelector('script[data-tier4-lucide]')) return Promise.resolve();
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js';
      script.async = true; script.dataset.tier4Lucide = 'true';
      script.onload = resolve; script.onerror = resolve; document.head.appendChild(script);
    });
  }

  function addStyles() {
    if (document.getElementById('tier4-styles')) return;
    const style = document.createElement('style'); style.id = 'tier4-styles';
    style.textContent = `
      .tier4-disciplined .label,.tier4-disciplined .process-card h3,.tier4-disciplined .principle span,.tier4-disciplined .faq-question .plus,.tier4-disciplined .path-diagram b{color:var(--text-muted,#9aa0ab)!important}
      .tier4-disciplined a:not(.btn):not(.nav-brand):not(.mobile-sticky-cta){color:inherit}.tier4-disciplined a:not(.btn):not(.nav-brand):not(.mobile-sticky-cta):hover{color:#fff}
      .tier4-disciplined input:focus,.tier4-disciplined select:focus,.tier4-disciplined textarea:focus{border-color:rgba(255,255,255,.35)!important;box-shadow:0 0 0 3px rgba(255,255,255,.05)!important}
      .tier4-icon{width:17px;height:17px;stroke-width:1.7;flex:0 0 17px;color:var(--text-muted,#9aa0ab)}.tier4-icon-list{list-style:none!important;padding-left:0!important}.tier4-icon-list li{display:flex;align-items:flex-start;gap:11px}.tier4-icon-list li::before{display:none!important}.process-card .tier4-process-icon{margin-bottom:14px;width:19px;height:19px;color:var(--text-muted,#9aa0ab);stroke-width:1.7}
      .menu-group-title.menu-accordion-trigger{appearance:none;border:0;background:transparent;cursor:pointer;text-align:center}.menu-group-title.menu-accordion-trigger::after{content:'+';display:inline-block;margin-left:8px;color:#7f8997;font-weight:400}.menu-group.is-open .menu-group-title.menu-accordion-trigger::after{content:'−'}.menu-subitems.menu-accordion-panel{display:none}.menu-group.is-open .menu-subitems.menu-accordion-panel{display:flex}.menu-subitems.menu-accordion-panel a{padding:4px 0}
      .dogfood-card{padding:16px 18px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:14px;background:rgba(255,255,255,.025);display:flex;align-items:center;gap:14px}.dogfood-dot{width:8px;height:8px;border-radius:50%;background:#39ff9a;flex:0 0 8px}.dogfood-copy{min-width:0}.dogfood-value{font:700 1.05rem/1.2 "Space Grotesk",sans-serif;color:#fff}.dogfood-note{margin-top:4px;color:var(--text-muted,#9aa0ab);font-size:.74rem;line-height:1.45}.dogfood-section{padding-top:0!important;padding-bottom:26px!important}
      .tier4-topology-section{padding-top:34px!important}.tier4-topology-card{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:28px;align-items:center;padding:22px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:18px;background:rgba(255,255,255,.02);overflow:hidden}.tier4-topology-card img{display:block;width:100%;height:auto;border-radius:12px}.tier4-topology-copy{padding:6px 4px}.tier4-topology-copy h3{margin:10px 0 10px}.tier4-topology-copy p{color:var(--text-muted,#9aa0ab);font-size:.88rem;line-height:1.6}.tier4-proof-card{margin-top:22px;padding:18px 20px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:14px;background:rgba(255,255,255,.025)}.tier4-proof-value{font:700 1.18rem/1.2 "Space Grotesk",sans-serif;color:#fff}.tier4-proof-note{margin-top:6px;color:var(--text-muted,#9aa0ab);font-size:.78rem;line-height:1.5}
      .tier4-home-proof{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:26px}.tier4-home-proof-card{min-width:0;padding:18px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:14px;background:rgba(255,255,255,.02)}.tier4-home-proof-label{display:block;margin-bottom:12px;color:var(--text-muted,#9aa0ab);font-size:.68rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase}.tier4-home-proof-value{display:block;color:#fff;font:700 1.45rem/1.15 "Space Grotesk",sans-serif;letter-spacing:-.025em}.tier4-home-proof-value a{color:#fff!important;text-decoration:underline;text-underline-offset:3px}.tier4-home-proof-note{display:block;margin-top:7px;color:var(--text-muted,#9aa0ab);font-size:.76rem;line-height:1.45}@media(max-width:700px){.tier4-home-proof{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.tier4-home-proof{grid-template-columns:1fr}}
      .homepage-footer .footer-inner.tier4-footer-grid{display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:34px}.tier4-footer-col{min-width:0}.tier4-footer-col h4{margin:0 0 13px;font-size:.75rem;color:#fff;text-transform:uppercase;letter-spacing:.08em}.tier4-footer-col p{margin:0 0 9px}.tier4-footer-links{display:grid;gap:8px}.tier4-footer-links a{color:rgba(255,255,255,.7)!important;font-size:.8rem;text-decoration:none}.tier4-footer-links a:hover{color:#fff!important}
      @media(max-width:900px){.tier4-topology-card{grid-template-columns:1fr}.homepage-footer .footer-inner.tier4-footer-grid{grid-template-columns:1fr 1fr}.tier4-footer-col:first-child{grid-column:1/-1}}@media(max-width:560px){.homepage-footer .footer-inner.tier4-footer-grid{grid-template-columns:1fr}.tier4-footer-col:first-child{grid-column:auto}}
    `; document.head.appendChild(style);
  }

  function enhanceAuditList() {
    document.querySelectorAll('.clean-list').forEach((list) => {
      if (list.dataset.tier4Icons) return;
      const items = Array.from(list.querySelectorAll('li strong')); if (!items.some((s) => ICONS[s.textContent.trim()])) return;
      list.dataset.tier4Icons='true'; list.classList.add('tier4-icon-list');
      list.querySelectorAll('li').forEach((li) => { const icon=ICONS[li.querySelector('strong')?.textContent.trim()]; if(!icon)return; const i=document.createElement('i'); i.className='tier4-icon'; i.dataset.lucide=icon; i.setAttribute('aria-hidden','true'); li.prepend(i); });
    });
  }

  function enhanceProcessCards() {
    const cards=document.querySelectorAll('.process-cards .process-card'); if(!cards.length)return;
    ['activity','search','list-checks','badge-check'].forEach((icon,index)=>{const card=cards[index];if(!card||card.querySelector('.tier4-process-icon'))return;const i=document.createElement('i');i.className='tier4-process-icon';i.dataset.lucide=icon;i.setAttribute('aria-hidden','true');card.prepend(i);});
  }

  function makeAccordionMenus() {
    document.querySelectorAll('.site-menu .menu-group').forEach((group)=>{
      const title=group.querySelector('.menu-group-title'),panel=group.querySelector('.menu-subitems'); if(!title||!panel||title.dataset.tier4Accordion)return;
      title.dataset.tier4Accordion='true';title.setAttribute('role','button');title.setAttribute('aria-expanded','false');title.setAttribute('tabindex','0');title.classList.add('menu-accordion-trigger');panel.classList.add('menu-accordion-panel');
      const toggle=()=>{const open=group.classList.toggle('is-open');title.setAttribute('aria-expanded',String(open));};
      title.addEventListener('click',(e)=>{e.preventDefault();toggle()});title.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
    });
  }

  function addDogfoodWidget() {
    if(!document.querySelector('.hero-highlight')||document.querySelector('.dogfood-card'))return;
    const section=document.createElement('section');section.className='section dogfood-section';section.innerHTML='<div class="container narrow"><div class="dogfood-card" aria-live="polite"><span class="dogfood-dot" aria-hidden="true"></span><div class="dogfood-copy"><div class="dogfood-value" data-dogfood-value>Measuring this page…</div><div class="dogfood-note">Your browser · current visit. This is visitor-side page-load timing, not a regional latency measurement.</div></div></div></div>';
    document.querySelector('.hero-highlight').insertAdjacentElement('afterend',section);
    requestAnimationFrame(()=>{const nav=performance.getEntriesByType('navigation')[0],value=document.querySelector('[data-dogfood-value]');if(!value)return;const ms=nav&&Number.isFinite(nav.loadEventEnd)&&nav.loadEventEnd>0?Math.round(nav.loadEventEnd):Math.round(performance.now());value.textContent=`This page loaded in ${ms} ms`;});
  }

  function addNetworkTopology() {
    if (!document.querySelector('.compact-band') || document.querySelector('.tier4-topology-section')) return;
    const section=document.createElement('section');
    section.className='section tier4-topology-section';
    section.innerHTML=`<div class="container"><div class="section-heading"><div class="label">Regional performance view</div><h2>One continent. Many paths.</h2><p class="section-lead">The topology is illustrative: node placement represents regions and network paths, not live measurements or regional averages.</p></div><div class="tier4-topology-card"><div><img src="/images/africa-network-topology.svg" alt="Illustrative Africa network topology showing Cairo, Lagos, Nairobi and Johannesburg connected by network paths" loading="lazy"></div><div class="tier4-topology-copy"><div class="label">Coverage evidence</div><h3>53 verified Kenya IP ranges</h3><div class="tier4-proof-card"><div class="tier4-proof-value">53 verified Kenya IP ranges</div><div class="tier4-proof-note">Current Kenya lookup coverage from our verified reference dataset.</div></div></div></div></div>`;
    document.querySelector('.compact-band').insertAdjacentElement('afterend',section);
  }

  function replacePlaceholderTrustProof() {
    const row=document.querySelector('.trust-row');
    if(!row||row.dataset.tier4Proof)return;
    const section=row.closest('.section');
    if(!section)return;
    row.dataset.tier4Proof='true';
    const grid=document.createElement('div');
    grid.className='tier4-home-proof';
    grid.setAttribute('aria-label','Current AfricaLatency proof and coverage statistics');
    grid.innerHTML='<div class="tier4-home-proof-card"><span class="tier4-home-proof-label">Countries in current reference dataset</span><strong class="tier4-home-proof-value">4</strong><span class="tier4-home-proof-note">Egypt, Kenya, Nigeria, South Africa</span></div><div class="tier4-home-proof-card"><span class="tier4-home-proof-label">Kenya lookup coverage</span><strong class="tier4-home-proof-value">53</strong><span class="tier4-home-proof-note">53 verified Kenya IP ranges — Current Kenya lookup coverage from our verified reference dataset</span></div><div class="tier4-home-proof-card"><span class="tier4-home-proof-label">Public source</span><strong class="tier4-home-proof-value"><a href="https://github.com/cmwrxh/cmwrxh.github.io" target="_blank" rel="noopener">GitHub repository</a></strong><span class="tier4-home-proof-note">Public site source and implementation.</span></div>';
    row.replaceWith(grid);
  }

  function restructureHomepageFooter() {
    const footer=document.querySelector('.homepage-footer .footer-inner');if(!footer||footer.dataset.tier4Footer)return;footer.dataset.tier4Footer='true';footer.classList.add('tier4-footer-grid');
    const intro=footer.querySelector('.footer-intro');if(!intro)return;
    const first=document.createElement('div');first.className='tier4-footer-col';first.innerHTML=htmlIntro(intro);
    const col=(title,items)=>{const el=document.createElement('div');el.className='tier4-footer-col';el.innerHTML=`<h4>${title}</h4><div class="tier4-footer-links">${items.map(([h,t])=>`<a href="${h}">${t}</a>`).join('')}</div>`;return el;};
    const connect=document.createElement('div');connect.className='tier4-footer-col';connect.innerHTML='<h4>Connect</h4><div class="tier4-footer-links"><a href="mailto:support@africalatency.dev">support@africalatency.dev</a><a href="https://github.com/cmwrxh/cmwrxh.github.io" target="_blank" rel="noopener">GitHub</a></div><p style="margin-top:16px;color:rgba(255,255,255,.55);font-size:.72rem">Africa Latency Ltd<br>1 Parklands Ave, Nairobi 00623, Kenya</p>';
    footer.innerHTML='';footer.appendChild(first);footer.appendChild(col('Company',[['/about.html','About'],['/contact.html','Contact']]));footer.appendChild(col('Legal',[['/terms-of-service.html','Terms of Service'],['/privacy-policy.html','Privacy Policy'],['/acceptable-use-policy.html','Acceptable Use'],['/refund-policy.html','Refund Policy']]));footer.appendChild(col('Resources',[['/scan.html','Free Scan'],['/methodology.html','Methodology'],['/data-centers.html','Data centers'],['/cases.html','Cases'],['/blog.html','Blog'],['/help-centre.html','Help centre']]));footer.appendChild(connect);
  }

  function htmlIntro(intro){return intro.innerHTML.replace(/1st Parklands Avenue, 00623 Nairobi, Kenya/g,'1 Parklands Ave, Nairobi 00623, Kenya');}
  function refreshIcons(){if(window.lucide?.createIcons)window.lucide.createIcons({attrs:{'stroke-width':1.7}});}

  async function init(){addStyles();document.body.classList.add('tier4-disciplined');enhanceAuditList();enhanceProcessCards();makeAccordionMenus();replacePlaceholderTrustProof();addNetworkTopology();addDogfoodWidget();restructureHomepageFooter();await loadLucide();refreshIcons();window.dispatchEvent(new CustomEvent('tier4:ready'));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
