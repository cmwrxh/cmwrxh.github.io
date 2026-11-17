(function () {
  'use strict';
  const root = document.getElementById('intelligence-crawler-setup');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const config = window.AFRICALATENCY_SUPABASE_CONFIG;
  const client = config && window.supabase?.createClient
    ? window.supabase.createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;
  let activeProject = '';
  let activeKey = '';
  let refreshTimer = null;
  let activityRequestId = 0;
  let projectsRequestId = 0;
  const say = (message, error) => { $('intelligence-crawler-message').textContent = message; $('intelligence-crawler-message').dataset.state = error ? 'error' : 'ok'; };
  const request = async (url, options = {}) => {
    if (!client) throw new Error('Account configuration is unavailable.');
    const auth = await client.auth.getSession();
    if (auth.error) throw auth.error;
    const token = auth.data?.session?.access_token;
    if (!token) { window.location.href = '/login.html'; throw new Error('Your session expired.'); }
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { window.location.href = '/login.html'; throw new Error(data.error || 'Your session expired.'); }
    if (!response.ok) throw new Error(data.error || 'Crawler request failed.');
    return data;
  };
  function showTab(name) {
    const setup = name === 'setup';
    $('intelligence-crawler-activity-view').hidden = setup;
    $('intelligence-crawler-setup-view').hidden = !setup;
    root.querySelectorAll('[data-intelligence-crawler-tab]').forEach((button) => {
      const active = button.dataset.intelligenceCrawlerTab === name;
      button.setAttribute('aria-selected', String(active));
    });
  }
  function renderMetrics(totals) {
    const container = $('intelligence-crawler-metrics');
    container.replaceChildren();
    [['Verified visits', totals.verified], ['HTTP errors (403/429/5xx)', totals.errors], ['Unverified or spoofed', Number(totals.spoofed || 0) + Number(totals.unverified || 0)]].forEach(([label, value]) => {
      const card = document.createElement('div'); card.className = 'intelligence-crawler-metric';
      const small = document.createElement('small'); small.textContent = label;
      const strong = document.createElement('strong'); strong.textContent = Number(value || 0).toLocaleString();
      card.append(small, strong); container.appendChild(card);
    });
  }
  async function loadActivity() {
    const requestId = ++activityRequestId;
    const projectId = activeProject;
    const range = $('intelligence-crawler-range').value;
    if (!projectId) {
      renderMetrics({});
      const body = $('intelligence-crawler-events');
      body.replaceChildren();
      const tr = document.createElement('tr'), td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = 'Choose a crawler project to view activity.';
      tr.appendChild(td);
      body.appendChild(tr);
      say('No crawler project selected.');
      return;
    }
    say('Loading verified crawler events…');
    try {
      const data = await request('/api/crawler-activity?project_id=' + encodeURIComponent(projectId) + '&range=' + encodeURIComponent(range));
      if (requestId !== activityRequestId || projectId !== activeProject || range !== $('intelligence-crawler-range').value) return;
      renderMetrics(data.totals || {});
      const body = $('intelligence-crawler-events');
      body.replaceChildren();
      const rows = data.recent_events || [];
      if (!rows.length) {
        const tr = document.createElement('tr'), td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = 'No verified crawler events have been received for this period.';
        tr.appendChild(td);
        body.appendChild(tr);
      }
      rows.forEach((event) => {
        const tr = document.createElement('tr');
        [new Date(event.observed_at).toLocaleString(), event.bot_name, event.verification_status, event.http_status, event.path].forEach((value) => {
          const td = document.createElement('td');
          td.textContent = String(value ?? '—');
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      say('Showing ' + rows.length + ' recent events for ' + (data.project?.domain || 'the selected domain') + '.');
    } catch (error) {
      if (requestId === activityRequestId) say(error.message, true);
    }
  }
  async function loadProjects() {
    const requestId = ++projectsRequestId;
    const selectedAtStart = activeProject;
    try {
      const data = await request('/api/crawler-projects');
      if (requestId !== projectsRequestId) return;
      const projects = data.projects || [];
      const select = $('intelligence-crawler-project');
      select.replaceChildren(new Option('Choose a project', ''));
      projects.forEach((project) => select.add(new Option(project.project_name + ' · ' + project.domain, project.id)));
      const preferredProject = activeProject !== selectedAtStart ? activeProject : selectedAtStart;
      if (preferredProject && projects.some((project) => project.id === preferredProject)) {
        activeProject = preferredProject;
        select.value = activeProject;
      } else if (projects.length) {
        activeProject = projects[0].id;
        select.value = activeProject;
      } else {
        activeProject = '';
      }
      await loadActivity();
      if (!activeProject) say('No crawler project yet. Open Setup to create one.');
    } catch (error) {
      if (requestId !== projectsRequestId) return;
      say('Crawler project services are not available on this deployment yet. The live-log foundation (PR #194) and its database migration must be merged and deployed first. ' + error.message, true);
    }
  }
  function revealKey(key) {
    activeKey = key || '';
    $('intelligence-crawler-key').textContent = activeKey;
    $('intelligence-crawler-key-panel').hidden = !activeKey;
    $('intelligence-crawler-test').disabled = !activeKey;
  }
  $('intelligence-crawler-create').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('intelligence-crawler-create-submit'); button.disabled = true;
    try {
      const data = await request('/api/crawler-projects', { method: 'POST', body: JSON.stringify({ project_name: $('intelligence-crawler-name').value, domain: $('intelligence-crawler-domain').value }) });
      activeProject = data.project.id; revealKey(data.key.secret);
      $('intelligence-crawler-create').reset();
      await loadProjects(); $('intelligence-crawler-project').value = activeProject; showTab('setup');
      say('Project created. Copy the key now. It cannot be retrieved later.');
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  });
  $('intelligence-crawler-project').addEventListener('change', (event) => { activeProject = event.target.value; loadActivity(); });
  $('intelligence-crawler-range').addEventListener('change', loadActivity);
  $('intelligence-crawler-test').addEventListener('click', async () => {
    const button = $('intelligence-crawler-test'); button.disabled = true; say('Verifying the project key…');
    try {
      const response = await fetch('/api/crawler-test-event', { method: 'POST', headers: { Authorization: 'Bearer ' + activeKey } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Test event could not be verified.');
      say('Success. Key verified for ' + data.domain + '. This dry-run was not stored as crawler activity.');
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  });
  $('intelligence-crawler-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(activeKey); say('Crawler key copied. Store it in your origin log-forwarder secret store.'); }
    catch { say('Clipboard access was blocked. Select and copy the key manually.', true); }
  });
  $('intelligence-crawler-refresh').addEventListener('click', loadProjects);
  root.querySelectorAll('[data-intelligence-crawler-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.intelligenceCrawlerTab)));
  loadProjects();
  refreshTimer = window.setInterval(() => { if (!document.hidden && !$('intelligence-crawler-activity-view').hidden) loadActivity(); }, 60000);
  window.addEventListener('pagehide', () => { if (refreshTimer) window.clearInterval(refreshTimer); }, { once: true });
}());