(function () {
  'use strict';
  const button = document.getElementById('rd-executive-summary');
  const dialog = document.getElementById('rd-executive-dialog');
  if (!button || !dialog) return;
  const output = dialog.querySelector('[data-executive-summary]');
  const close = dialog.querySelector('[data-executive-close]');
  const copy = dialog.querySelector('[data-executive-copy]');
  const SUPABASE_URL = 'https://uzihwtxffklisczqvurf.supabase.co';
  const SUPABASE_PUBLIC_KEY = 'sb_publishable_dGaR1jgofny7tGVWh0TK2w_haSVNyWv';
  function metricText(id) {
    const node = document.getElementById(id);
    return node ? node.textContent.trim().replace(/\s+/g, ' ') : '';
  }
  async function loadCrawlerTelemetry() {
    try {
      if (!window.supabase?.createClient) return null;
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const auth = await client.auth.getSession();
      const token = auth.data?.session?.access_token;
      if (!token) return null;
      const headers = { Authorization: 'Bearer ' + token };
      const projectResponse = await fetch('/api/crawler-projects', { headers });
      if (!projectResponse.ok) return null;
      const projectData = await projectResponse.json();
      const reportUrl = metricText('rd-url');
      const hostname = new URL(reportUrl).hostname.toLowerCase().replace(/\.$/, '');
      const project = (projectData.projects || []).find((item) => {
        const domain = String(item.domain || '').toLowerCase();
        return hostname === domain || hostname.endsWith('.' + domain);
      });
      if (!project) return null;
      const activityResponse = await fetch('/api/crawler-activity?project_id=' + encodeURIComponent(project.id) + '&range=7d', { headers });
      if (!activityResponse.ok) return null;
      const activity = await activityResponse.json();
      const events = activity.recent_events || [];
      const statuses = events.map((event) => Number(event.http_status));
      return {
        project,
        totals: activity.totals || {},
        verifiedEvents: events.filter((event) => event.verification_status === 'verified_bot').length,
        forbidden: statuses.filter((status) => status === 403).length,
        rateLimited: statuses.filter((status) => status === 429).length,
        serverErrors: statuses.filter((status) => status >= 500 && status <= 599).length
      };
    } catch (_) { return null; }
  }
  function buildSummary(crawler) {
    const url = metricText('rd-url') || 'the scanned website';
    const scores = [...document.querySelectorAll('#rd-scores .rd-score')].map((node) => node.textContent.trim().replace(/\s+/g, ' '));
    const vitals = metricText('rd-vitals');
    const issues = metricText('rd-issues');
    const lines = ['Executive summary', 'Website: ' + url, '', 'What the scan tells us:'];
    if (scores.length) scores.forEach((score) => lines.push('• ' + score));
    else lines.push('• Performance scores are not available in the report payload.');
    if (vitals && !/not available|no data/i.test(vitals)) lines.push('• Core Web Vitals: ' + vitals.slice(0, 700));
    if (issues && !/not available|no data/i.test(issues)) lines.push('• Priority findings: ' + issues.slice(0, 700));
    lines.push('', 'AI crawler access:');
    if (crawler) {
      const totalVerified = Number(crawler.totals.verified || 0);
      lines.push('• ' + totalVerified.toLocaleString() + ' verified crawler event(s) were recorded in the selected seven-day window.');
      if (crawler.forbidden) lines.push('• ' + crawler.forbidden + ' HTTP 403 response(s): firewall rules or access controls may be blocking AI search crawlers from retrieving pages.');
      if (crawler.rateLimited) lines.push('• ' + crawler.rateLimited + ' HTTP 429 response(s): rate limits may be restricting crawler requests.');
      if (crawler.serverErrors) lines.push('• ' + crawler.serverErrors + ' HTTP 5xx response(s): firewall, application or origin-server errors may be interrupting crawler access and preventing pages from being fetched for search or AI retrieval.');
      if (!crawler.forbidden && !crawler.rateLimited && !crawler.serverErrors) lines.push('• No 403, 429 or 5xx responses appeared in the recent event sample. This does not prove every URL is accessible.');
      if (!crawler.verifiedEvents) lines.push('• No verified crawler requests appeared in the recent event sample.');
    } else {
      lines.push('• No matching crawler project and verified live-log telemetry could be loaded for this report. A robots.txt permission check alone does not confirm that a crawler reached the origin.');
    }
    lines.push('', 'Business interpretation: Use these findings to prioritise technical fixes and validate changes with repeat measurements. This report does not predict search rankings or guarantee AI citations.');
    return lines.join('\n');
  }
  async function open() {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    output.textContent = 'Preparing the executive summary…';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const crawler = await loadCrawlerTelemetry();
    output.textContent = buildSummary(crawler);
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
  button.addEventListener('click', open);
  close?.addEventListener('click', () => dialog.close ? dialog.close() : dialog.removeAttribute('open'));
  copy?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.textContent); copy.textContent = 'Copied'; }
    catch { copy.textContent = 'Select text to copy'; }
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}());