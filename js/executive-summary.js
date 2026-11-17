(function () {
  'use strict';
  const button = document.getElementById('rd-executive-summary');
  const dialog = document.getElementById('rd-executive-dialog');
  if (!button || !dialog) return;
  const output = dialog.querySelector('[data-executive-summary]');
  const close = dialog.querySelector('[data-executive-close]');
  const copy = dialog.querySelector('[data-executive-copy]');
  function metricText(id) {
    const node = document.getElementById(id);
    return node ? node.textContent.trim().replace(/\s+/g, ' ') : '';
  }
  function buildSummary() {
    const url = metricText('rd-url') || 'the scanned website';
    const scoreNodes = [...document.querySelectorAll('#rd-scores [class*="score"], #rd-scores [data-score]')];
    const scores = scoreNodes.map((node) => node.textContent.trim()).filter(Boolean).slice(0, 4);
    const vitals = metricText('rd-vitals');
    const issues = metricText('rd-issues');
    const crawlerEvents = [...document.querySelectorAll('[data-crawler-http-status]')].map((node) => Number(node.dataset.crawlerHttpStatus));
    const blocked = crawlerEvents.filter((status) => status === 403 || status === 429).length;
    const serverErrors = crawlerEvents.filter((status) => status >= 500 && status <= 599).length;
    const lines = ['Executive summary', 'Website: ' + url, '', 'What the scan tells us:'];
    if (scores.length) lines.push('• Reported performance scores: ' + scores.join(' | '));
    else lines.push('• Performance scores are not available in the report payload.');
    if (vitals && !/not available|no data/i.test(vitals)) lines.push('• Core Web Vitals: ' + vitals.slice(0, 700));
    if (issues && !/not available|no data/i.test(issues)) lines.push('• Priority findings: ' + issues.slice(0, 700));
    if (blocked || serverErrors) {
      lines.push('', 'Crawler access risk:');
      if (blocked) lines.push('• ' + blocked + ' observed 403/429 response(s): access controls or rate limits may be preventing AI search crawlers from retrieving pages.');
      if (serverErrors) lines.push('• ' + serverErrors + ' observed 5xx response(s): firewall, application or origin-server errors may be interrupting crawler access.');
    } else {
      lines.push('', 'Crawler access:');
      lines.push('• This point-in-time scan does not include verified live crawler log events. robots.txt permission alone cannot confirm that a crawler has reached the origin.');
    }
    lines.push('', 'Business interpretation: Use these findings to prioritise technical fixes and validate changes with repeat measurements. This report does not predict search rankings or guarantee AI citations.');
    return lines.join('\n');
  }
  function open() {
    output.textContent = buildSummary();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  button.addEventListener('click', open);
  close?.addEventListener('click', () => dialog.close ? dialog.close() : dialog.removeAttribute('open'));
  copy?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.textContent); copy.textContent = 'Copied'; }
    catch { copy.textContent = 'Select text to copy'; }
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}());