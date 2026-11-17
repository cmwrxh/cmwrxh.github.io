(() => {
  'use strict';

  const reportMatch = window.location.pathname.match(/^\/reports\/([0-9a-f-]{36})\/?$/i);
  const reportId = reportMatch ? reportMatch[1] : new URLSearchParams(window.location.search).get('id');
  const gate = document.getElementById('rd-full-report-gate');
  const fullReport = document.getElementById('rd-full-report-content');
  const upsell = document.getElementById('rd-report-upsell');
  const form = document.getElementById('rd-full-report-form');
  const status = document.getElementById('rd-full-report-status');
  const submit = document.getElementById('rd-lead-submit');
  const storageKey = reportId ? 'africalatency:report-unlocked:' + reportId : '';
  const botNames = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot'];

  if (!gate || !fullReport || !form || !reportId) return;

  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };

  function storageHasUnlock(storage) {
    try { return storage.getItem(storageKey) === '1'; } catch { return false; }
  }

  function isUnlocked() {
    return storageHasUnlock(window.localStorage) || storageHasUnlock(window.sessionStorage);
  }

  function saveUnlock() {
    try { window.localStorage.setItem(storageKey, '1'); } catch {}
    try { window.sessionStorage.setItem(storageKey, '1'); } catch {}
  }

  function showUnlocked() {
    gate.hidden = true;
    fullReport.hidden = false;
    if (upsell) upsell.hidden = false;
    document.querySelectorAll('[data-gated-action]').forEach((node) => { node.hidden = false; });
  }

  function formatProbe(row) {
    const value = Number(row.rttMs);
    const country = String(row.country || row.countryCode || 'Probe');
    return country + ' · ' + (Number.isInteger(value) ? value : value.toFixed(1)) + ' ms';
  }

  function renderProbeSummary(rows) {
    const measured = (Array.isArray(rows) ? rows : []).filter((row) =>
      row && row.status === 'measured' && row.rttMs != null &&
      Number.isFinite(Number(row.rttMs)) && Number(row.rttMs) >= 0
    );
    measured.sort((a, b) => Number(a.rttMs) - Number(b.rttMs));
    setText('rd-fastest-country', measured.length ? formatProbe(measured[0]) : 'No measured result returned');
    setText('rd-slowest-country', measured.length ? formatProbe(measured[measured.length - 1]) : 'No measured result returned');
  }

  function renderBotRows(bots, available, robotsStatus) {
    const list = document.getElementById('rd-ai-access-list');
    const tableBody = document.getElementById('rd-ai-bot-audit-rows');
    const entries = botNames.map((name) => {
      const bot = bots && bots[name];
      const allowed = available && bot && typeof bot.allowed === 'boolean' ? bot.allowed : null;
      return { name, allowed };
    });

    if (list) {
      list.replaceChildren();
      entries.filter((entry) => entry.name !== 'OAI-SearchBot').forEach((entry) => {
        const item = document.createElement('li');
        item.textContent = entry.name + ': ' + (entry.allowed === null ? 'Not verified' : entry.allowed ? 'Allowed' : 'Blocked');
        item.className = entry.allowed === null ? 'is-unknown' : entry.allowed ? 'is-allowed' : 'is-blocked';
        list.appendChild(item);
      });
    }

    if (tableBody) {
      tableBody.replaceChildren();
      entries.forEach((entry) => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('th');
        const statusCell = document.createElement('td');
        const evidenceCell = document.createElement('td');
        nameCell.scope = 'row';
        nameCell.textContent = entry.name;
        statusCell.textContent = entry.allowed === null ? 'Not verified' : entry.allowed ? 'Allowed' : 'Blocked';
        statusCell.className = entry.allowed === null ? 'is-unknown' : entry.allowed ? 'is-allowed' : 'is-blocked';
        evidenceCell.textContent = entry.allowed === null ? 'robots.txt could not be checked' : 'robots.txt rule evaluation';
        row.append(nameCell, statusCell, evidenceCell);
        tableBody.appendChild(row);
      });
    }

    if (!available) {
      setText('rd-ai-access-status', 'Not verified');
      setText('rd-ai-access-note', 'robots.txt could not be checked. No access status is assumed.');
      setText('rd-ai-bot-audit-note', 'The check did not return a usable robots.txt response. No crawler permission is inferred.');
    } else if (robotsStatus === 404 || robotsStatus === 410) {
      setText('rd-ai-access-status', 'No robots.txt restriction found');
      setText('rd-ai-access-note', 'No robots.txt file was published; this is not proof of crawler visits.');
      setText('rd-ai-bot-audit-note', 'HTTP ' + robotsStatus + ': no robots.txt file was found. No robots.txt restriction was detected for the listed crawlers.');
    } else {
      const allowedCount = entries.filter((entry) => entry.allowed === true).length;
      setText('rd-ai-access-status', allowedCount + ' of ' + entries.length + ' crawlers allowed');
      setText('rd-ai-access-note', 'Permission rules only. Actual crawler requests are not verified by this check.');
      setText('rd-ai-bot-audit-note', 'robots.txt returned HTTP ' + robotsStatus + '. These results describe permission rules, not observed crawler traffic.');
    }
  }

  async function checkRobots(url) {
    if (!url) {
      renderBotRows({}, false, 0);
      return;
    }
    try {
      const response = await fetch('/api/robots-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const payload = await response.json().catch(() => ({}));
      renderBotRows(payload.bots || {}, response.ok && payload.available === true, payload.robots_status || 0);
    } catch {
      renderBotRows({}, false, 0);
    }
  }

  function handleReportReady(detail) {
    if (!detail || String(detail.reportId || '') !== String(reportId)) return;
    const scanInput = document.getElementById('rd-gate-scan-id');
    const urlInput = document.getElementById('rd-gate-scanned-url');
    if (scanInput) scanInput.value = reportId;
    if (urlInput) urlInput.value = detail.scannedUrl || '';
    renderProbeSummary(detail.africaLatency);
    void checkRobots(detail.scannedUrl || '');
    if (isUnlocked()) showUnlocked();
    else {
      gate.hidden = false;
      fullReport.hidden = true;
      if (upsell) upsell.hidden = true;
      document.querySelectorAll('[data-gated-action]').forEach((node) => { node.hidden = true; });
    }
  }

  window.addEventListener('africalatency:report-ready', (event) => handleReportReady(event.detail));
  if (window.__AL_REPORT_READY) handleReportReady(window.__AL_REPORT_READY);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailInput = form.elements.namedItem('email');
    const websiteInput = form.elements.namedItem('website');
    const email = String(emailInput?.value || '').trim();
    const scannedUrl = String(form.elements.namedItem('scanned_url')?.value || '').trim();
    if (!email || !emailInput.checkValidity()) {
      emailInput?.reportValidity();
      return;
    }
    if (websiteInput?.value) return;

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Unlocking…';
    }
    if (status) status.textContent = 'Saving your report access…';

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_type: 'full_report',
          email,
          scan_id: reportId,
          scanned_url: scannedUrl,
          source: 'free-scan-report',
          website: ''
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'We could not unlock the report. Please try again.');
      }
      saveUnlock();
      if (status) status.textContent = 'Your full report is unlocked.';
      showUnlocked();
    } catch (error) {
      if (status) status.textContent = error?.message || 'We could not unlock the report. Please try again.';
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Unlock full report';
      }
    }
  });
})();
