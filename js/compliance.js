/* AfricaLatency legal/compliance layer
 * Loads privacy-first analytics only after the visitor explicitly accepts analytics.
 */
(function () {
  'use strict';

  var CONSENT_KEY = 'africalatency_analytics_consent_v1';
  var PLAUSIBLE_SCRIPT = 'https://plausible.io/js/script.js';
  var DOMAIN = 'africalatency.dev';

  function loadAnalytics() {
    if (window.__africaLatencyAnalyticsLoaded) return;
    window.__africaLatencyAnalyticsLoaded = true;

    var script = document.createElement('script');
    script.defer = true;
    script.dataset.domain = DOMAIN;
    script.src = PLAUSIBLE_SCRIPT;
    document.head.appendChild(script);
  }

  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }

  function setConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
  }

  function addStyles() {
    if (document.getElementById('africalatency-compliance-styles')) return;
    var style = document.createElement('style');
    style.id = 'africalatency-compliance-styles';
    style.textContent = `
      .al-cookie-banner { position: fixed; left: 20px; right: 20px; bottom: 20px; z-index: 100000; max-width: 760px; margin: 0 auto; padding: 18px 20px; background: var(--bg-card, #111114); color: var(--text, #fff); border: 1px solid var(--border-strong, rgba(255,255,255,.16)); border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.35); }
      .al-cookie-banner p { margin: 0 0 12px; color: var(--text-muted, #9aa0ab); font-size: .86rem; line-height: 1.55; }
      .al-cookie-banner a { color: var(--accent, #39ff9a); }
      .al-cookie-actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .al-cookie-actions button { border: 0; cursor: pointer; }
      .al-cookie-banner.al-hidden { display: none; }
      .al-footer-contact { margin-top: 10px; color: inherit; font-size: .82rem; line-height: 1.6; }
      .al-footer-contact a { color: inherit; }
      .al-cookie-settings { background: none; border: 0; color: inherit; padding: 0; margin-left: 12px; text-decoration: underline; cursor: pointer; font: inherit; }
      @media (max-width: 640px) { .al-cookie-banner { left: 12px; right: 12px; bottom: 12px; padding: 15px; } }
    `;
    document.head.appendChild(style);
  }

  function showBanner() {
    if (document.getElementById('al-cookie-banner')) return;
    var banner = document.createElement('aside');
    banner.id = 'al-cookie-banner';
    banner.className = 'al-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Analytics consent');
    banner.innerHTML = `
      <p>We use privacy-friendly analytics to understand how visitors use AfricaLatency.dev. Analytics is optional and will only load after you choose <strong>Accept analytics</strong>. Read our <a href="/privacy-policy.html">Privacy Policy</a>.</p>
      <div class="al-cookie-actions">
        <button type="button" class="btn btn-primary" id="al-consent-accept">Accept analytics</button>
        <button type="button" class="btn btn-secondary" id="al-consent-reject">Reject analytics</button>
      </div>`;
    document.body.appendChild(banner);

    document.getElementById('al-consent-accept').addEventListener('click', function () {
      setConsent('accepted');
      loadAnalytics();
      banner.remove();
    });

    document.getElementById('al-consent-reject').addEventListener('click', function () {
      setConsent('rejected');
      banner.remove();
    });
  }

  function addFooterCompliance() {
    document.querySelectorAll('footer').forEach(function (footer) {
      var links = footer.querySelector('.footer-links');
      if (links && !links.querySelector('a[href="/privacy-policy.html"]')) {
        var privacy = document.createElement('a');
        privacy.href = '/privacy-policy.html';
        privacy.textContent = 'Privacy Policy';
        links.appendChild(privacy);
      }

      var inner = footer.querySelector('.footer-inner') || footer;
      if (!inner.querySelector('.al-footer-contact')) {
        var contact = document.createElement('div');
        contact.className = 'al-footer-contact';
        contact.innerHTML = 'Africa Latency Ltd · 1 Parklands Ave, Nairobi 00623, Kenya · <a href="mailto:support@africalatency.dev">support@africalatency.dev</a>';
        inner.appendChild(contact);
      }

      if (!footer.querySelector('.al-cookie-settings')) {
        var settings = document.createElement('button');
        settings.type = 'button';
        settings.className = 'al-cookie-settings';
        settings.textContent = 'Cookie settings';
        settings.addEventListener('click', function () {
          try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
          var existing = document.getElementById('al-cookie-banner');
          if (existing) existing.remove();
          showBanner();
        });
        var target = footer.querySelector('.footer-follow') || footer.querySelector('.footer-links') || inner;
        target.appendChild(settings);
      }
    });
  }

  function init() {
    addStyles();
    addFooterCompliance();

    var consent = getConsent();
    if (consent === 'accepted') {
      loadAnalytics();
    } else if (consent !== 'rejected') {
      showBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
