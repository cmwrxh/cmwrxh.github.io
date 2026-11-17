(function () {
  'use strict';
  const root = document.getElementById('intelligence-crawler-setup');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const config = window.AFRICALATENCY_SUPABASE_CONFIG;
  const client = config && window.supabase?.createClient
    ? window.supabase.createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;
  let activeProject = null;
  let activeKey = '';
  const say = (message, error) => { $('intelligence-crawler-message').textContent = message; $('intelligence-crawler-message').dataset.state = error ? 'error' : 'ok'; };
  const request = async (url, options = {}) => {
    if (!client) throw new Error('Account configuration is unavailable.');
    const auth = await client.auth.getSession();
    const token = auth.data?.session?.access_token;
    if (!token) { window.location.href = '/login.html'; throw new Error('Your session expired.'); }
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { window.location.href = '/login.html'; throw new Error(data.error || 'Your session expired.'); }
    if (!response.ok) throw new Error(data.error || 'Crawler request failed.');
    return data;
  };
  const revealKey = (key) => {
    activeKey = key || '';
    $('intelligence-crawler-key').textContent = activeKey;
    $('intelligence-crawler-key-panel').hidden = !activeKey;
    $('intelligence-crawler-test').disabled = !activeKey;
  };
  async function loadProjects() {
    try {
      const data = await request('/api/crawler-projects');
      const select = $('intelligence-crawler-project');
      select.replaceChildren(new Option('Choose a project', ''));
      (data.projects || []).forEach((project) => select.add(new Option(project.project_name + ' · ' + project.domain, project.id)));
      if (activeProject && (data.projects || []).some((p) => p.id === activeProject)) select.value = activeProject;
      else if (data.projects?.length) { activeProject = data.projects[0].id; select.value = activeProject; }
      say(data.projects?.length ? 'Crawler projects loaded. Select a project to inspect its activity.' : 'No crawler project yet. Create one to begin log setup.');
    } catch (error) {
      say('Live crawler project APIs are not available on this deployment yet. Merge and deploy the crawler-log foundation before enabling this module. ' + error.message, true);
    }
  }
  $('intelligence-crawler-create').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('intelligence-crawler-create-submit');
    button.disabled = true;
    try {
      const data = await request('/api/crawler-projects', { method: 'POST', body: JSON.stringify({ project_name: $('intelligence-crawler-name').value, domain: $('intelligence-crawler-domain').value }) });
      activeProject = data.project.id;
      revealKey(data.key.secret);
      $('intelligence-crawler-create').reset();
      await loadProjects();
      $('intelligence-crawler-project').value = activeProject;
      say('Project created. Copy the key now. It is shown only once.');
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  });
  $('intelligence-crawler-project').addEventListener('change', (event) => { activeProject = event.target.value; });
  $('intelligence-crawler-test').addEventListener('click', async () => {
    const button = $('intelligence-crawler-test');
    button.disabled = true;
    say('Verifying the project key…');
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
  loadProjects();
}());