(() => {
  'use strict';

  const tabs = document.getElementById('industry-category-tabs');
  const body = document.getElementById('industry-leaderboard-body');
  const status = document.getElementById('industry-leaderboard-status');
  if (!tabs || !body || !status) return;

  let categories = [];
  let activeCategory = '';
  let sortKey = 'company';
  let sortDirection = 1;

  function finiteNumber(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function metricCell(value, unit, divisor) {
    const cell = document.createElement('td');
    if (!finiteNumber(value)) {
      const badge = document.createElement('span');
      badge.className = 'placeholder-badge';
      badge.textContent = 'Awaiting verified scan';
      cell.appendChild(badge);
      return cell;
    }
    const number = Number(value) / (divisor || 1);
    cell.textContent = (divisor ? number.toFixed(2) : Math.round(number)) + ' ' + unit;
    return cell;
  }

  function crawlerCell(entry) {
    const cell = document.createElement('td');
    const list = document.createElement('div');
    list.className = 'ai-status-list';
    ['GPTBot', 'ClaudeBot', 'PerplexityBot'].forEach((name) => {
      const chip = document.createElement('span');
      const value = entry.ai_crawler_access && entry.ai_crawler_access[name];
      chip.className = 'ai-status' + (value === true ? ' allowed' : value === false ? ' blocked' : '');
      chip.textContent = name + ': ' + (value === true ? 'Allowed' : value === false ? 'Blocked' : 'Not checked');
      list.appendChild(chip);
    });
    cell.appendChild(list);
    return cell;
  }

  function compareValues(a, b, key) {
    const left = a[key];
    const right = b[key];
    const leftValid = finiteNumber(left);
    const rightValid = finiteNumber(right);
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    if (!leftValid) return String(a.company || '').localeCompare(String(b.company || ''));
    return (Number(left) - Number(right)) * sortDirection;
  }

  function getEntries() {
    const category = categories.find((item) => item.id === activeCategory);
    const entries = category && Array.isArray(category.entries) ? category.entries.slice() : [];
    if (sortKey === 'company') {
      entries.sort((a, b) => String(a.company || '').localeCompare(String(b.company || '')) * sortDirection);
    } else {
      entries.sort((a, b) => compareValues(a, b, sortKey));
    }
    return entries;
  }

  function render() {
    const entries = getEntries();
    body.replaceChildren();
    if (!entries.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'No entries have been added to this category yet.';
      row.appendChild(cell);
      body.appendChild(row);
      status.textContent = 'No benchmark entries are available for this category.';
      return;
    }

    let verifiedCount = 0;
    entries.forEach((entry) => {
      const row = document.createElement('tr');
      const isVerified = entry.status === 'verified';
      if (isVerified) verifiedCount += 1;

      const rank = document.createElement('td');
      rank.textContent = isVerified && finiteNumber(entry.rank) ? String(entry.rank) : '—';
      row.appendChild(rank);

      const companyCell = document.createElement('td');
      const company = document.createElement('span');
      company.className = 'industry-company';
      company.textContent = entry.company || 'Unlabelled entry';
      const domain = document.createElement('span');
      domain.className = 'industry-domain';
      domain.textContent = entry.domain || 'Domain not supplied';
      companyCell.append(company, domain);
      if (!isVerified) {
        const badge = document.createElement('span');
        badge.className = 'placeholder-badge';
        badge.textContent = 'Placeholder';
        companyCell.appendChild(badge);
      }
      row.appendChild(companyCell);

      row.appendChild(metricCell(entry.nairobi_mobile_lcp_ms, 's', 1000));
      row.appendChild(metricCell(entry.regional_avg_ttfb_ms, 'ms', 1));
      row.appendChild(crawlerCell(entry));

      const actionCell = document.createElement('td');
      const action = document.createElement('a');
      action.className = 'industry-action';
      action.href = isVerified && entry.domain
        ? '/scan?url=' + encodeURIComponent('https://' + entry.domain)
        : (entry.run_scan_url || '/scan');
      action.textContent = 'Run Live Scan';
      action.setAttribute('aria-label', isVerified
        ? 'Run a live scan for ' + (entry.domain || entry.company)
        : 'Run a live scan of your own website');
      actionCell.appendChild(action);
      row.appendChild(actionCell);
      body.appendChild(row);
    });

    const placeholderCount = entries.length - verifiedCount;
    status.textContent = verifiedCount
      ? 'Showing ' + verifiedCount + ' verified entr' + (verifiedCount === 1 ? 'y' : 'ies') + ' and ' + placeholderCount + ' placeholder entr' + (placeholderCount === 1 ? 'y' : 'ies') + '. Values are point-in-time measurements, not country-wide averages.'
      : 'No verified industry scans have been published yet. All displayed rows are placeholders; no performance values or ranks have been fabricated.';
  }

  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategory = button.dataset.category;
    tabs.querySelectorAll('[data-category]').forEach((tab) => {
      tab.setAttribute('aria-selected', tab === button ? 'true' : 'false');
    });
    render();
  });

  document.querySelectorAll('[data-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextKey = button.dataset.sort;
      if (!nextKey) return;
      if (sortKey === nextKey) sortDirection *= -1;
      else {
        sortKey = nextKey;
        sortDirection = 1;
      }
      document.querySelectorAll('[data-sort]').forEach((control) => {
        control.setAttribute('aria-label', 'Sort by ' + control.textContent.trim() + (control === button ? (sortDirection === 1 ? ' ascending' : ' descending') : ''));
      });
      render();
    });
  });

  fetch('/data/benchmarks.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('Benchmark data could not be loaded.');
      return response.json();
    })
    .then((data) => {
      const leaderboard = data.industry_leaderboard;
      categories = leaderboard && Array.isArray(leaderboard.categories) ? leaderboard.categories : [];
      if (!categories.length) throw new Error('Industry leaderboard data is not configured.');
      activeCategory = categories[0].id;
      categories.forEach((category) => {
        let button = Array.from(tabs.querySelectorAll('[data-category]')).find((tab) => tab.dataset.category === category.id);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.role = 'tab';
          button.dataset.category = category.id;
          tabs.appendChild(button);
        }
        button.setAttribute('aria-selected', category.id === activeCategory ? 'true' : 'false');
        button.textContent = category.label;
      });
      render();
    })
    .catch(() => {
      body.replaceChildren();
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'Benchmark data is temporarily unavailable. No scores are shown.';
      row.appendChild(cell);
      body.appendChild(row);
      status.textContent = 'The industry benchmark dataset could not be loaded.';
    });
})();
