/* AfricaLatency legal/compliance layer
 * Loads privacy-first analytics only after the visitor explicitly accepts analytics.
 * Also normalizes SEO/social metadata, favicons, and image accessibility metadata site-wide.
 */
(function () {
  'use strict';

  var CONSENT_KEY = 'africalatency_analytics_consent_v1';
  var PLAUSIBLE_SCRIPT = 'https://plausible.io/js/script.js';
  var DOMAIN = 'africalatency.dev';

  var PAGE_SEO = {
    '/': ['AfricaLatency | Performance Intelligence for Africa', 'Measure website, API and infrastructure performance across African networks. Find latency causes, prioritize fixes, and validate improvements with AfricaLatency.'],
    '/index.html': ['AfricaLatency | Performance Intelligence for Africa', 'Measure website, API and infrastructure performance across African networks. Find latency causes, prioritize fixes, and validate improvements with AfricaLatency.'],
    '/about.html': ['About AfricaLatency | Digital Performance in Africa', 'Learn how AfricaLatency helps businesses understand, improve, and monitor digital performance for customers across African markets and networks today.'],
    '/acceptable-use-policy.html': ['Acceptable Use Policy | AfricaLatency', 'Read the AfricaLatency Acceptable Use Policy covering permitted use, prohibited activity, authorized testing, security, and responsible use of our services.'],
    '/audit-intake.html': ['Request an Africa Latency Audit | AfricaLatency', 'Request an Africa Latency Audit to measure your application across African locations, identify performance bottlenecks, and get a prioritized remediation plan.'],
    '/audit-report.html': ['Audit Report | AfricaLatency', 'Review an AfricaLatency performance audit report with measured findings, bottlenecks, evidence, and recommended remediation actions for African users.'],
    '/blog.html': ['AfricaLatency Blog | Performance Engineering in Africa', 'Practical insights on latency, networks, cloud regions, CDNs, APIs, infrastructure, and digital performance across African markets and networks today.'],
    '/cases.html': ['Case Studies | AfricaLatency Performance Intelligence', 'Explore AfricaLatency case studies and performance investigations showing how measured evidence can uncover latency and infrastructure problems across Africa.'],
    '/contact.html': ['Contact AfricaLatency | Performance & Latency Experts', 'Contact AfricaLatency about website performance, API latency, infrastructure diagnostics, audits, validation, or improving digital experiences across Africa.'],
    '/dashboard.html': ['AfricaLatency Dashboard | Performance Intelligence', 'Access the AfricaLatency dashboard to review performance measurements, regional results, reports, and infrastructure intelligence for monitored services.'],
    '/help-centre.html': ['Help Centre | AfricaLatency', 'Find answers about AfricaLatency scans, latency audits, diagnostics, performance measurements, reports, and how to get technical support for your service.'],
    '/labs.html': ['AfricaLatency Labs | Performance Research & Experiments', 'Explore AfricaLatency Labs, where we investigate tools, measurements, network behavior, and new approaches to digital performance across African markets.'],
    '/login.html': ['Log In | AfricaLatency', 'Log in to your AfricaLatency account to access performance data, reports, scans, and available infrastructure intelligence for your monitored services.'],
    '/methodology.html': ['Methodology | How AfricaLatency Measures Performance', 'See how AfricaLatency measures latency and digital performance across African locations, networks, routing paths, infrastructure, applications, and dependencies.'],
    '/privacy-policy.html': ['Privacy Policy | AfricaLatency', 'Read the AfricaLatency Privacy Policy covering data collection, diagnostic data, analytics, cookies, third-party services, user rights, retention, and privacy.'],
    '/refund-policy.html': ['Refund Policy | AfricaLatency', 'Read the AfricaLatency Refund Policy covering eligibility, service fees, cancellations, refunds, and how to contact support about a billing issue or request.'],
    '/scan.html': ['Free Latency Scan | AfricaLatency', 'Run a free AfricaLatency scan to measure website or API response performance and see how your service performs from key African locations and networks.'],
    '/service-level-agreement.html': ['Service Level Agreement | AfricaLatency', 'Review the AfricaLatency Service Level Agreement covering service availability, support commitments, measurement scope, exclusions, and service remedies.'],
    '/services.html': ['Africa Latency Audit | Performance Diagnosis', 'Get an evidence-based diagnosis of why your application, API, or infrastructure is slow for African users, with prioritized recommendations to fix it.'],
    '/sitespeed.html': ['Website Speed Check | AfricaLatency', 'Check website speed and response performance from African locations. Identify latency signals and see where your digital experience may be slowing down.'],
    '/terms-of-service.html': ['Terms of Service | AfricaLatency', 'Read the AfricaLatency Terms of Service covering diagnostic scans, acceptable use, intellectual property, liability, third-party systems, and Kenyan law.'],
    '/work.html': ['Work With AfricaLatency | Performance Engineering', 'See how AfricaLatency works with teams to measure digital performance, diagnose latency, prioritize fixes, and validate improvements across African markets.']
  };

  var NOINDEX = {
    '/dashboard.html': true,
    '/login.html': true,
    '/audit-report.html': true,
    '/dashboard': true,
    '/login': true,
    '/audit-report': true
  };

  var IMAGE_ALT = {
    '/images/hero-team-review.jpeg': 'Team reviewing digital performance together on a laptop',
    '/images/about-team-lead.jpeg': 'AfricaLatency team lead reviewing digital performance',
    '/images/about-team-secondary.jpeg': 'AfricaLatency team member working on digital performance analysis',
    '/images/contact-support-rep.jpeg': 'Support representative assisting with a digital performance issue',
    '/images/services-analyst-laptop.jpeg': 'Analyst reviewing website and infrastructure performance on a laptop',
    '/images/favicon-source.png': 'SourceForge badge',
    '/images/logo-icon-v4.png': ''
  };

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

  function upsertMeta(name, content) {
    if (!content) return;
    var el = document.head.querySelector('meta[name="' + name + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.name = name;
      document.head.appendChild(el);
    }
    el.content = content;
  }

  function upsertProperty(property, content) {
    if (!content) return;
    var el = document.head.querySelector('meta[property="' + property + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', property);
      document.head.appendChild(el);
    }
    el.content = content;
  }

  function upsertLink(rel, href, attrs) {
    var el = document.head.querySelector('link[rel="' + rel + '"]');
    if (!el) {
      el = document.createElement('link');
      el.rel = rel;
      document.head.appendChild(el);
    }
    el.href = href;
    Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, attrs[key]); });
  }

  function initSEO() {
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    var data = PAGE_SEO[path] || PAGE_SEO[path + '.html'];
    var canonicalPath = path === '/index.html' ? '/' : path;
    var canonical = 'https://africalatency.dev' + canonicalPath;
    var ogImage = 'https://africalatency.dev/images/og-image.svg';

    upsertLink('icon', '/images/favicon.ico', { type: 'image/x-icon' });
    upsertLink('icon', '/images/favicon-32x32.png', { type: 'image/png', sizes: '32x32' });
    upsertLink('icon', '/images/favicon-16x16.png', { type: 'image/png', sizes: '16x16' });
    upsertLink('apple-touch-icon', '/images/apple-touch-icon.png', { sizes: '180x180' });

    if (!data) return;

    document.title = data[0];
    upsertMeta('description', data[1]);
    upsertMeta('robots', NOINDEX[path] ? 'noindex, nofollow' : 'index, follow');
    upsertLink('canonical', canonical);

    upsertProperty('og:type', 'website');
    upsertProperty('og:site_name', 'AfricaLatency');
    upsertProperty('og:title', data[0]);
    upsertProperty('og:description', data[1]);
    upsertProperty('og:url', canonical);
    upsertProperty('og:image', ogImage);
    upsertProperty('og:image:width', '1200');
    upsertProperty('og:image:height', '630');
    upsertProperty('og:image:alt', 'AfricaLatency infrastructure performance and latency intelligence');
    upsertMeta('twitter:card', 'summary_large_image');
    upsertMeta('twitter:title', data[0]);
    upsertMeta('twitter:description', data[1]);
    upsertMeta('twitter:image', ogImage);
  }

  function initImageAltText() {
    document.querySelectorAll('img').forEach(function (img) {
      if (img.hasAttribute('alt')) return;
      var src = (img.getAttribute('src') || '').split('?')[0];
      if (Object.prototype.hasOwnProperty.call(IMAGE_ALT, src)) {
        img.alt = IMAGE_ALT[src];
      } else {
        img.alt = '';
      }
    });
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
      footer.querySelectorAll('.footer-address').forEach(function (address) {
        address.innerHTML = 'Africa Latency Ltd<br>1 Parklands Ave, Nairobi 00623, Kenya<br><a href="mailto:support@africalatency.dev">support@africalatency.dev</a>';
      });
      var inner = footer.querySelector('.footer-inner') || footer;
      if (!inner.querySelector('.al-footer-contact') && !footer.querySelector('.footer-address')) {
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
    initSEO();
    initImageAltText();
    addStyles();
    addFooterCompliance();
    var consent = getConsent();
    if (consent === 'accepted') loadAnalytics();
    else if (consent !== 'rejected') showBanner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
