/* Tier 4 visual/interaction layer. Keeps the existing site structure intact while adding restrained icons, accessible mobile accordions, dogfooding telemetry, network topology, proof coverage, color discipline, and reusable visual polish. */
(function () {
  'use strict';
  const ICONS = { Network:'activity', Edge:'globe-2', Infrastructure:'server', Application:'code-2', Database:'database', 'Third parties':'boxes', DNS:'globe', 'Connection and TLS':'shield-check', 'HTTP response':'activity', 'Network path':'route', 'Location comparison':'map-pin', 'Prioritized next steps':'list-checks' };
  function loadLucide() { if (window.lucide) return Promise.resolve(); if (document.querySelector('script[data-tier4-lucide]')) return Promise.resolve(); return new Promise((resolve) => { const script=document.createElement('script'); script.src='https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js'; script.async=true; script.dataset.tier4Lucide='true'; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); }); }
  function addStyles() {
    if (document.getElementById('tier4-styles')) return;
    const style = document.createElement('style');
    style.id = 'tier4-styles';
    style.textContent = `
      .tier4-icon{width:17px;height:17px;stroke-width:1.8;flex:0 0 17px;color:#1769AA}
      .tier4-icon-list{list-style:none!important;padding-left:0!important}
      .tier4-icon-list li{display:flex;align-items:flex-start;gap:10px}
      .tier4-icon-list li::before{display:none!important}
      .process-card .tier4-process-icon{margin-bottom:14px;width:20px;height:20px;color:#1769AA;stroke-width:1.8}
      .menu-group-title.menu-accordion-trigger{appearance:none;border:0;background:transparent;cursor:pointer;text-align:center}
      .menu-group-title.menu-accordion-trigger::after{content:'+';display:inline-block;margin-left:8px;color:#CBD5E1;font-weight:400}
      .menu-group.is-open .menu-group-title.menu-accordion-trigger::after{content:'−'}
      .menu-subitems.menu-accordion-panel{display:none}
      .menu-group.is-open .menu-subitems.menu-accordion-panel{display:flex}
      .menu-subitems.menu-accordion-panel a{padding:6px 0}
      .homepage-footer .footer-inner.tier4-footer-grid{display:grid;grid-template-columns:minmax(0,1.3fr) repeat(4,minmax(0,1fr));gap:28px}
      .tier4-footer-col{min-width:0}
      .tier4-footer-col h4{margin:0 0 13px;font-size:12px;color:#FFFFFF;text-transform:uppercase;letter-spacing:.08em}
      .tier4-footer-col p{margin:0 0 9px}
      .tier4-footer-links{display:grid;gap:8px}
      .tier4-footer-links a{color:#D8E3ED!important;font-size:14px;text-decoration:none}
      .tier4-footer-links a:hover{color:#FFFFFF!important}
      @media(max-width:900px){.homepage-footer .footer-inner.tier4-footer-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tier4-footer-col:first-child{grid-column:1/-1}}
      @media(max-width:560px){.homepage-footer .footer-inner.tier4-footer-grid{grid-template-columns:1fr}.tier4-footer-col:first-child{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }
  function enhanceAuditList(){document.querySelectorAll('.clean-list').forEach((list)=>{if(list.dataset.tier4Icons)return;const items=Array.from(list.querySelectorAll('li strong'));if(!items.some((s)=>ICONS[s.textContent.trim()]))return;list.dataset.tier4Icons='true';list.classList.add('tier4-icon-list');list.querySelectorAll('li').forEach((li)=>{const icon=ICONS[li.querySelector('strong')?.textContent.trim()];if(!icon)return;const i=document.createElement('i');i.className='tier4-icon';i.dataset.lucide=icon;i.setAttribute('aria-hidden','true');li.prepend(i);});});}
  function enhanceProcessCards(){const cards=document.querySelectorAll('.process-cards .process-card');if(!cards.length)return;['activity','search','list-checks','badge-check'].forEach((icon,index)=>{const card=cards[index];if(!card||card.querySelector('.tier4-process-icon'))return;const i=document.createElement('i');i.className='tier4-process-icon';i.dataset.lucide=icon;i.setAttribute('aria-hidden','true');card.prepend(i);});}
  function makeAccordionMenus(){document.querySelectorAll('.site-menu .menu-group').forEach((group)=>{const title=group.querySelector('.menu-group-title'),panel=group.querySelector('.menu-subitems');if(!title||!panel||title.dataset.tier4Accordion)return;title.dataset.tier4Accordion='true';title.setAttribute('role','button');title.setAttribute('aria-expanded','false');title.setAttribute('tabindex','0');title.classList.add('menu-accordion-trigger');panel.classList.add('menu-accordion-panel');const toggle=()=>{const open=group.classList.toggle('is-open');title.setAttribute('aria-expanded',String(open));};title.addEventListener('click',(e)=>{e.preventDefault();toggle()});title.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});});}
  function restructureHomepageFooter(){const footer=document.querySelector('.homepage-footer .footer-inner');if(!footer||footer.dataset.tier4Footer)return;footer.dataset.tier4Footer='true';footer.classList.add('tier4-footer-grid');const intro=footer.querySelector('.footer-intro');if(!intro)return;const first=document.createElement('div');first.className='tier4-footer-col';first.innerHTML=htmlIntro(intro);const col=(title,items)=>{const el=document.createElement('div');el.className='tier4-footer-col';el.innerHTML=`<h4>${title}</h4><div class="tier4-footer-links">${items.map(([h,t])=>`<a href="${h}">${t}</a>`).join('')}</div>`;return el;};const connect=document.createElement('div');connect.className='tier4-footer-col';connect.innerHTML='<h4>Connect</h4><div class="tier4-footer-links"><a href="mailto:support@africalatency.dev">support@africalatency.dev</a><a href="https://github.com/cmwrxh/cmwrxh.github.io" target="_blank" rel="noopener">GitHub</a></div><p style="margin-top:16px;color:rgba(255,255,255,.55);font-size:.72rem">Africa Latency Ltd<br>1 Parklands Ave, Nairobi 00623, Kenya</p>';footer.innerHTML='';footer.appendChild(first);footer.appendChild(col('Company',[['/about','About'],['/contact','Contact']]));footer.appendChild(col('Legal',[['/terms-of-service.html','Terms of Service'],['/privacy-policy','Privacy Policy'],['/acceptable-use-policy.html','Acceptable Use'],['/refund-policy.html','Refund Policy']]));footer.appendChild(col('Resources',[['/tools','Tools'],['/sample-report','Sample report'],['/compare','Compare'],['/performance-index','Performance Index'],['/methodology','Methodology'],['/security','Security'],['/docs','Docs'],['/changelog','Changelog'],['/blog','Blog'],['/cases','Case studies']]));footer.appendChild(connect);}
  function htmlIntro(intro){return intro.innerHTML.replace(/1st Parklands Avenue, 00623 Nairobi, Kenya/g,'1 Parklands Ave, Nairobi 00623, Kenya');}
  function refreshIcons(){if(window.lucide?.createIcons)window.lucide.createIcons({attrs:{'stroke-width':1.7}});}
  async function init(){addStyles();document.body.classList.add('tier4-disciplined');enhanceAuditList();enhanceProcessCards();makeAccordionMenus();restructureHomepageFooter();await loadLucide();refreshIcons();window.dispatchEvent(new CustomEvent('tier4:ready'));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();