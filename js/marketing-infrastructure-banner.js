/* Adds the common public marketing infrastructure strip and clear desktop actions. */
(function(){
  'use strict';
  function mount(){
    if(document.body.classList.contains('dashboard-page')) return;
    var nav=document.querySelector('nav');
    if(!nav || document.querySelector('.infra-status-banner')) return;
    var banner=document.createElement('div');
    banner.className='infra-status-banner';
    banner.setAttribute('role','note');
    banner.innerHTML='<span class="infra-status-label">African network peering</span><div class="infra-status-peers" aria-label="Peering networks"><span class="infra-status-peer">Safaricom IXP</span><span class="infra-status-peer">MainOne</span><span class="infra-status-peer">KIXP</span><span class="infra-status-peer">JINX</span></div>';
    nav.parentNode.insertBefore(banner,nav);
    var pricingLinks=nav.querySelector('.pricing-nav-links');
    if(pricingLinks){
      if(!pricingLinks.querySelector('.infra-header-cta')){
        var cta=document.createElement('a'); cta.className='infra-header-cta'; cta.href='/scan'; cta.textContent='Try for FREE'; pricingLinks.appendChild(cta);
      }
      return;
    }
    var actions=nav.querySelector('.nav-actions');
    if(actions && !actions.querySelector('.infra-header-actions')){
      var group=document.createElement('div'); group.className='infra-header-actions';
      var login=document.createElement('a'); login.className='infra-header-login'; login.href='/login'; login.textContent='Log In';
      var cta=document.createElement('a'); cta.className='infra-header-cta'; cta.href='/scan'; cta.textContent='Try for FREE';
      group.append(login,cta);
      actions.insertBefore(group,actions.firstChild);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
}());
