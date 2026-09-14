/* Tier 3 UX: shared mobile CTA, inline form validation and confirmation routing. */
(function () {
  'use strict';

  function addError(field, message) {
    if (!field) return;
    field.classList.add('ux-field-error');
    field.setAttribute('aria-invalid', 'true');
    let error = field.parentElement && field.parentElement.querySelector('.ux-field-message');
    if (!error) {
      error = document.createElement('div');
      error.className = 'ux-field-message';
      error.setAttribute('role', 'alert');
      field.insertAdjacentElement('afterend', error);
    }
    error.textContent = message;
  }

  function clearError(field) {
    if (!field) return;
    field.classList.remove('ux-field-error');
    field.removeAttribute('aria-invalid');
    const error = field.parentElement && field.parentElement.querySelector('.ux-field-message');
    if (error) error.remove();
  }

  function validateField(field) {
    if (!field || field.disabled || field.type === 'hidden') return true;
    const value = (field.value || '').trim();
    if (field.required && !value) {
      addError(field, 'This field is required.');
      return false;
    }
    if (field.type === 'email' && value && !field.validity.valid) {
      addError(field, 'Please enter a valid email address.');
      return false;
    }
    clearError(field);
    return true;
  }

  function validateForm(form) {
    let valid = true;
    form.querySelectorAll('input, select, textarea').forEach((field) => {
      if (!validateField(field)) valid = false;
    });
    if (!valid) form.querySelector('.ux-field-error')?.focus({ preventScroll: false });
    return valid;
  }

  function installFormValidation() {
    document.querySelectorAll('form').forEach((form) => {
      if (form.dataset.uxValidation) return;
      form.dataset.uxValidation = 'true';
      form.addEventListener('input', (event) => {
        const field = event.target.closest('input, select, textarea');
        if (field) validateField(field);
      });
      form.addEventListener('change', (event) => {
        const field = event.target.closest('input, select, textarea');
        if (field) validateField(field);
      });
      form.addEventListener('submit', (event) => {
        if (!validateForm(form)) event.preventDefault();
      }, true);
    });
  }

  function watchAuditConfirmation() {
    const status = document.getElementById('form-status');
    if (!status || !document.getElementById('audit-intake-form')) return;
    const observer = new MutationObserver(() => {
      const text = status.textContent || '';
      if (/^Request received\./i.test(text)) {
        observer.disconnect();
        window.location.assign('/thank-you.html');
      }
    });
    observer.observe(status, { childList: true, characterData: true, subtree: true });
  }

  function addMobileCta() {
    if (document.body.classList.contains('no-mobile-cta') || document.querySelector('.mobile-sticky-cta')) return;
    const cta = document.createElement('a');
    cta.className = 'mobile-sticky-cta';
    cta.href = '/scan.html';
    cta.textContent = 'Run a free latency scan →';
    cta.setAttribute('aria-label', 'Run a free latency scan');
    document.body.appendChild(cta);
  }

  function addStyles() {
    if (document.getElementById('tier3-ux-styles')) return;
    const style = document.createElement('style');
    style.id = 'tier3-ux-styles';
    style.textContent = `
      .ux-field-message { margin-top: .4rem; color: var(--error, #ff6b6b); font-size: .8rem; line-height: 1.4; }
      .ux-field-error { outline: 2px solid var(--error, #ff6b6b) !important; outline-offset: 1px; }
      .mobile-sticky-cta { display: none; }
      @media (max-width: 899px) {
        .mobile-sticky-cta { position: fixed; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); z-index: 9998; display: flex; min-height: 48px; align-items: center; justify-content: center; padding: 10px 16px; border-radius: 8px; text-decoration: none; font: 700 .9rem/1.2 Inter, sans-serif; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
        body { padding-bottom: 76px; }
        .site-menu.open ~ .mobile-sticky-cta { display: none; }
      }
      @media (min-width: 900px) { .mobile-sticky-cta { display: none !important; } }
    `;
    document.head.appendChild(style);
  }

  function init() {
    addStyles();
    installFormValidation();
    watchAuditConfirmation();
    addMobileCta();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
