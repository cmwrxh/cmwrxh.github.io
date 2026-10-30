(function () {
  'use strict';

  const root = document.getElementById('rum-beta-workflow');
  if (!root) return;

  const $ = (id) => document.getElementById(id);
  const form = $('rum-beta-site-form');
  const sitesNode = $('rum-beta-sites');
  const snippetNode = $('rum-beta-snippet');
  const snippetCode = snippetNode.querySelector('code');
  const createButton = $('rum-beta-create');
  const copyButton = $('rum-beta-copy');
  const deleteButton = $('rum-beta-delete');
  const rangeSelect = $('rum-beta-range');
  const formMessage = $('rum-beta-form-message');
  const actionMessage = $('rum-beta-action-message');
  const dataStatus = $('rum-beta-data-status');
  const breakdownsNode = $('rum-beta-breakdowns');

  let session = null;
  let sites = [];
  let selectedSite = null;
  let snippet = '';

  function message(node, text, isError) {
    node.textContent = text || '';
    node.dataset.state = isError ? 'error' : 'ok';
  }

  async function request(path, options) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options && options.headers ? options.headers : {}),
        Authorization: 'Bearer ' + session.access_token,
        ...(options && options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = '/login.html';
      throw new Error('Your session expired. Please sign in again.');
    }
    if (!response.ok) throw new Error(payload.error || 'The RUM request failed.');
    return payload;
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderSites() {
    sitesNode.replaceChildren();
    if (!sites.length) {
      sitesNode.appendChild(make('p', 'rum-beta-muted', 'No RUM sites yet. Add your first website above.'));
      return;
    }
    for (const site of sites) {
      const row = make('div', 'rum-beta-site-row');
      const details = make('div');
      details.append(make('strong', '', site.site_name), make('small', '', (site.allowed_domains || []).join(', ')));
      const select = make('button', 'rum-beta-select', selectedSite && selectedSite.id === site.id ? 'Selected' : 'View data');
      select.type = 'button';
      select.disabled = Boolean(selectedSite && selectedSite.id === site.id);
      select.addEventListener('click', () => selectSite(site));
      row.append(details, select);
      sitesNode.appendChild(row);
    }
  }

  function renderSnippet(site) {
    snippet = '<script async src="https://africalatency.dev/rum.js" data-key="' + site.public_key + '"><' + '/script>';
    snippetCode.textContent = snippet;
    snippetNode.hidden = false;
    copyButton.disabled = false;
    deleteButton.disabled = false;
    $('rum-beta-install-help').textContent = 'Add this snippet before the closing </body> tag on ' + (site.allowed_domains || []).join(', ') + '. It starts collecting after installation and the next eligible page visit.';
  }

  function renderMetricTable(title, rows) {
    const section = make('section', 'rum-beta-breakdown');
    section.appendChild(make('h4', '', title));
    if (!rows.length) {
      section.appendChild(make('p', 'rum-beta-muted', 'No segment has reached the 30-sample privacy threshold yet.'));
      return section;
    }
    const table = make('table', 'rum-beta-table');
    const head = make('thead');
    const header = make('tr');
    ['Segment', 'Metric', 'P75', 'Samples'].forEach((label) => header.appendChild(make('th', '', label)));
    head.appendChild(header);
    table.appendChild(head);
    const body = make('tbody');
    for (const row of rows) {
      const tr = make('tr');
      const metric = String(row.metric || '');
      const unit = metric === 'CLS' ? '' : ' ms';
      const value = row.p75 == null ? '—' : Number(row.p75).toFixed(metric === 'CLS' ? 3 : 0) + unit;
      [row.dimension_value || 'Unknown', metric, value, Number(row.sample_count || 0).toLocaleString()].forEach((valueText) => {
        tr.appendChild(make('td', '', String(valueText)));
      });
      body.appendChild(tr);
    }
    table.appendChild(body);
    section.appendChild(table);
    return section;
  }

  async function loadDashboard() {
    if (!selectedSite) return;
    dataStatus.textContent = 'Loading verified RUM aggregates…';
    breakdownsNode.replaceChildren();
    const params = new URLSearchParams({ site_id: selectedSite.id, range: rangeSelect.value });
    const result = await request('/api/rum-dashboard?' + params.toString(), { method: 'GET' });
    $('rum-beta-results-title').textContent = 'RUM data · ' + result.site.name;
    if (result.status === 'waiting_for_first_data') {
      dataStatus.textContent = 'Snippet configured. Waiting for the first eligible browser events. This is not proof that the snippet has been installed.';
      return;
    }
    dataStatus.textContent = Number(result.total_samples || 0).toLocaleString() + ' metric events received in this period. Segments are shown only when they contain at least ' + result.suppression_threshold + ' samples.';
    const breakdowns = result.breakdowns || {};
    breakdownsNode.append(
      renderMetricTable('Overall', breakdowns.overall || []),
      renderMetricTable('By country', breakdowns.country || []),
      renderMetricTable('By network operator', breakdowns.operator || []),
      renderMetricTable('By connection type', breakdowns.connection_type || [])
    );
  }

  async function selectSite(site) {
    selectedSite = site;
    renderSites();
    renderSnippet(site);
    message(actionMessage, '');
    try { await loadDashboard(); }
    catch (error) { message(dataStatus, error.message, true); }
  }

  async function loadSites() {
    const result = await request('/api/rum-sites', { method: 'GET' });
    sites = Array.isArray(result.sites) ? result.sites : [];
    renderSites();
    if (sites.length) await selectSite(sites[0]);
    else {
      selectedSite = null;
      dataStatus.textContent = 'Create a RUM site to begin. Your existing scanner reports are unaffected.';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    createButton.disabled = true;
    message(formMessage, 'Creating your RUM site…');
    try {
      const payload = {
        site_name: $('rum-beta-site-name').value.trim(),
        domain: $('rum-beta-domain').value.trim()
      };
      const result = await request('/api/rum-sites', { method: 'POST', body: JSON.stringify(payload) });
      sites.unshift(result.site);
      renderSites();
      await selectSite(result.site);
      message(formMessage, 'Site created. Install the snippet to begin receiving browser measurements.');
      form.reset();
    } catch (error) {
      message(formMessage, error.message, true);
    } finally {
      createButton.disabled = false;
    }
  });

  copyButton.addEventListener('click', async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      message(actionMessage, 'Installation snippet copied.');
    } catch (_) {
      message(actionMessage, 'Clipboard access was blocked. Select and copy the snippet above.');
    }
  });

  deleteButton.addEventListener('click', async () => {
    if (!selectedSite || !window.confirm('Delete this RUM site and all associated RUM events? This cannot be undone.')) return;
    deleteButton.disabled = true;
    try {
      await request('/api/rum-sites?site_id=' + encodeURIComponent(selectedSite.id), { method: 'DELETE' });
      sites = sites.filter((site) => site.id !== selectedSite.id);
      selectedSite = null;
      snippet = '';
      snippetNode.hidden = true;
      snippetCode.textContent = '';
      copyButton.disabled = true;
      deleteButton.disabled = true;
      message(actionMessage, 'Site and associated RUM data deleted.');
      await loadSites();
    } catch (error) {
      message(actionMessage, error.message, true);
      deleteButton.disabled = false;
    }
  });

  rangeSelect.addEventListener('change', () => {
    loadDashboard().catch((error) => message(dataStatus, error.message, true));
  });

  (async function init() {
    try {
      const result = await client.auth.getSession();
      session = result.data && result.data.session;
      if (result.error || !session) {
        window.location.href = '/login.html';
        return;
      }
      await loadSites();
    } catch (error) {
      sitesNode.textContent = error.message || 'Unable to load RUM sites.';
    }
  })();
})();
