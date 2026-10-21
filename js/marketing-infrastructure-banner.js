/* Public marketing header cleanup: keep conversion actions inside the hamburger drawer. */
(function () {
  'use strict';
  function cleanHeader() {
    if (document.body.classList.contains('dashboard-page')) return;
    document.querySelectorAll('.infra-status-banner, .infra-header-actions, .infra-header-cta, .infra-header-login')
      .forEach(function (element) { element.remove(); });
    document.querySelectorAll('.site-menu').forEach(function (menu) {
      menu.querySelectorAll('.menu-column a[href="/login"], .menu-column a[href="/login.html"]')
        .forEach(function (link) { link.remove(); });
      var footer = menu.querySelector('.menu-footer');
      if (!footer) return;
      footer.innerHTML = '<a class="btn btn-secondary" href="/login">Log In</a><a class="btn btn-primary" href="/scan">Try for FREE</a>';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cleanHeader, { once: true });
  else cleanHeader();
}());
