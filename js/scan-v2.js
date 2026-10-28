(() => {
  // Anonymous scans use the configured app host (Turnstile/API environment).
  // Authenticated customers stay on their current host so Supabase's host-scoped
  // browser session survives the scan and the report redirect.
  if (['africalatency.dev', 'www.africalatency.dev'].includes(window.location.hostname) && /^\/scan\/?$/.test(window.location.pathname)) {
    let hasSession = false;
    try {
      const key = 'sb-uzihwtxffklisczqvurf-auth-token';
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        hasSession = Boolean(parsed?.access_token || parsed?.currentSession?.access_token);
      }
    } catch (_) {}
    if (!hasSession) {
      window.location.replace('https://app.africalatency.dev' + window.location.pathname + window.location.search + window.location.hash);
      return;
    }
  }
  const scanTestParams = new URLSearchParams(location.search);
  const scanTestMode = location.hostname === '127.0.0.1' && scanTestParams.has('scan-test');
  const scanTestTurnstileFailure = scanTestMode && scanTestParams.has('turnstile-fail');
  const form = document.getElementById('scan-form-v2');
  if (!form) return;
  const input = document.getElementById('scan-url');
  const requestedUrl = new URLSearchParams(window.location.search).get('url');
  if (requestedUrl && input) input.value = requestedUrl;
  const button = document.getElementById('scan-run');
  const error = document.getElementById('scan-error');
  const work = document.getElementById('scan-work');
  const stageTitle = document.getElementById('scan-stage');
  const stageCopy = document.getElementById('scan-stage-copy');
  const count = document.getElementById('scan-queue-count');
  const elapsedLabel = document.getElementById('scan-elapsed');
  let scanStartedAt = 0, elapsedTimer = null;
  function updateElapsed() {
    if (!elapsedLabel || !scanStartedAt) return;
    const seconds = Math.floor((Date.now() - scanStartedAt) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    elapsedLabel.textContent = 'Elapsed ' + mm + ':' + ss + ' · typical duration 1–3 min';
  }
  function stopElapsed() { if (elapsedTimer) clearInterval(elapsedTimer); elapsedTimer = null; }
  const segments = [...document.querySelectorAll('[data-scan-segment]')];
  const preview = document.getElementById('scan-preview');
  const tips = [
    'A fast response from one network does not guarantee the same experience on another.',
    'LCP measures when the largest visible content element appears.',
    'Mobile results use Lighthouse mobile emulation and simulated slow 4G conditions.',
    'A missing African probe is reported as unavailable, never as a slow or healthy result.',
    'Lighthouse is a controlled lab test. Real visitors can experience different results.'
  ];
  let tipIndex = 0, tipTimer = null, selectedDevice = 'mobile', turnstileWidget = null, turnstileToken = '';
  let supabaseClient = null;
  try {
    if (window.supabase) supabaseClient = window.supabase.createClient(
      'https://uzihwtxffklisczqvurf.supabase.co',
      'sb_publishable_dGaR1jgofny7tGVWh0TK2w_haSVNyWv'
    );
  } catch (_) {}
  const stageMap = {
    queued: {index:0,label:'Adding job to queue...',copy:'Securing a place in the scan queue.'},
    fetching: {index:1,label:'Fetching site...',copy:'Checking that the public page responds and preparing the browser.'},
    lighthouse: {index:2,label:'Analyzing with Lighthouse...',copy:'Running a controlled browser audit and capturing the page preview.'},
    africa: {index:3,label:'Measuring from African networks...',copy:'Requesting live ping measurements from available African probes.'},
    report: {index:4,label:'Generating report...',copy:'Combining the lab results and live network measurements.'},
    completed: {index:4,label:'Your report is ready',copy:'Your free summary and African probe results are ready.'},
    failed: {index:4,label:'The scan could not be completed',copy:'No score has been invented. Review the message below and try again.'}
  };
  function setError(message) { error.textContent = message || ''; error.style.display = message ? 'block' : 'none'; }
  function normalizeUrl(value) {
    const raw = String(value || '').trim().replace(/\s+/g, '');
    if (!raw) throw new Error('Enter the URL of a public website.');
    const normalized = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    let parsed;
    try { parsed = new URL(normalized); } catch { throw new Error('Enter a valid website URL, such as example.com.'); }
    if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.port && !['80','443'].includes(parsed.port))) {
      throw new Error('Use a public HTTP or HTTPS URL without credentials or a custom port.');
    }
    if (!parsed.hostname.includes('.') || parsed.hostname === 'localhost') throw new Error('Enter a public domain name, not a local hostname.');
    parsed.hash = '';
    return parsed.toString();
  }
  function setStage(stage, queuePosition, progress) {
    const data = stageMap[stage] || stageMap.queued;
    stageTitle.textContent = data.label;
    stageCopy.textContent = data.copy;
    segments.forEach((segment, i) => {
      segment.classList.toggle('is-done', i < data.index || stage === 'completed');
      segment.classList.toggle('is-active', i === data.index && stage !== 'completed' && stage !== 'failed');
    });
    count.textContent = stage === 'queued' && queuePosition ? 'You are #' + queuePosition + ' in the queue' : (Number.isFinite(Number(progress)) && progress !== null && progress !== '' ? (Math.max(0,Math.min(100,Math.round(Number(progress)))) + '% complete') : '');
  }
  function showScreenshot(url) {
    if (!url || !/^https:\/\//i.test(url)) return;
    const img = document.createElement('img');
    img.alt = 'Screenshot preview of the website being scanned';
    img.loading = 'eager';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    img.onerror = () => { preview.replaceChildren(); const p = document.createElement('div'); p.className='scan-preview-placeholder'; p.textContent='Page preview is unavailable for this scan.'; preview.append(p); };
    preview.replaceChildren(img);
  }
  async function getToken() {
    if (scanTestMode) return scanTestTurnstileFailure ? '' : 'qa-token';
    if (!supabaseClient) return '';
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.access_token || '';
  }
  async function poll(jobId, reportId, initialPosition) {
    let lastStage = 'queued';
    const maxAttempts = scanTestMode ? 2 : 180;
    const pollDelay = scanTestMode ? 500 : 2000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const token = await getToken();
      const response = await fetch('/api/scan/' + encodeURIComponent(jobId), { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 503) throw new Error('The scan service is temporarily unavailable (HTTP 503). No result is being claimed. Please try again shortly.');
      if (response.status === 429) throw new Error(payload.error || 'Scan rate limit reached. Wait before trying again.');
      if (!response.ok) throw new Error(payload.error || 'Unable to retrieve scan status.');
      if (payload.screenshotUrl) showScreenshot(payload.screenshotUrl);
      if (payload.stage !== lastStage) { lastStage = payload.stage; setStage(payload.stage, payload.stage === 'queued' ? (payload.queuePosition || initialPosition) : null, payload.progress); }
      else if (payload.progress !== undefined) count.textContent = Number.isFinite(Number(payload.progress)) ? (Math.max(0,Math.min(100,Math.round(Number(payload.progress)))) + '% complete') : '';
      if (payload.status === 'partial' || payload.partial === true) { stageTitle.textContent = 'Partial results available'; stageCopy.textContent = 'Some checks returned evidence while others remain unavailable. Waiting for the scan to finish; missing values are not inferred.'; }
      if (payload.status === 'failed') throw new Error('Scan failed: ' + (payload.error || 'The scan could not be completed.'));
      if (payload.status === 'completed') {
        stopElapsed();
        if (elapsedLabel) elapsedLabel.textContent = 'Completed in ' + elapsedLabel.textContent.replace(/^Elapsed /,'').replace(/ · typical duration.*$/,'');
        work.setAttribute('aria-busy','false');
        setStage('completed');
        stageCopy.textContent = 'Opening the shareable report…';
        window.location.href = '/reports/' + encodeURIComponent(reportId || payload.reportId || jobId);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, pollDelay));
    }
    throw new Error('This scan is taking longer than expected. You can reopen the report link and check its status.');
  }
  async function setupTurnstile() {
    const response = await fetch('/api/scan?config=1');
    const config = await response.json().catch(() => ({}));
    if (!config.turnstileSiteKey) return;
    const host = document.getElementById('scan-turnstile');
    host.hidden = false;
    if (window.turnstile) return renderTurnstile(config.turnstileSiteKey);
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true;
    script.onload = () => renderTurnstile(config.turnstileSiteKey);
    document.head.append(script);
  }
  function renderTurnstile(siteKey) {
    if (!window.turnstile || turnstileWidget !== null) return;
    turnstileWidget = window.turnstile.render('#scan-turnstile', {
      sitekey: siteKey,
      callback: token => { turnstileToken = token; },
      'expired-callback': () => { turnstileToken = ''; },
      'error-callback': () => { turnstileToken = ''; }
    });
  }
  document.querySelectorAll('[data-device]').forEach(control => control.addEventListener('click', () => {
    selectedDevice = control.dataset.device;
    document.querySelectorAll('[data-device]').forEach(item => item.setAttribute('aria-pressed', String(item === control)));
  }));
  document.getElementById('scan-tip').textContent = tips[0];
  tipTimer = setInterval(() => {
    tipIndex = (tipIndex + 1) % tips.length;
    document.getElementById('scan-tip').textContent = tips[tipIndex];
  }, 6500);
  setupTurnstile().catch(() => {});
  form.addEventListener('submit', async event => {
    event.preventDefault();
    setError('');
    let url;
    try { url = normalizeUrl(input.value); } catch (e) { setError(e.message); input.focus(); return; }
    button.disabled = true;
    button.textContent = 'Starting scan…';
    scanStartedAt = Date.now();
    stopElapsed();
    updateElapsed();
    elapsedTimer = setInterval(updateElapsed, 1000);
    work.setAttribute('aria-busy','true');
    work.style.display = 'block';
    work.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setStage('queued');
    try {
      const token = await getToken();
      const payload = { url, device: selectedDevice };
      if (!token) {
        if (!turnstileToken) throw new Error('Complete the bot verification before running an anonymous scan.');
        payload.turnstileToken = turnstileToken;
      }
      const response = await fetch('/api/scan', {
        method:'POST', headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer ' + token} : {})},
        body:JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 503) throw new Error('The scan service is temporarily unavailable (HTTP 503). No result is being claimed. Please try again shortly.');
      if (response.status === 429) throw new Error(data.error || 'Scan rate limit reached. Wait before trying again.');
      if (!response.ok) throw new Error(data.error || 'Could not start the scan.');
      if (data.cacheHit) stageCopy.textContent = 'A recent scan of this URL and device is available. Reusing that result.';
      setStage('queued', data.queuePosition);
      await poll(data.jobId, data.reportId, data.queuePosition);
    } catch (e) {
      stopElapsed();
      work.setAttribute('aria-busy','false');
      const message = e.message || 'The scan could not be started.';
      setError(message);
      if (/queue is full|queue full/i.test(message)) { stageTitle.textContent = 'Scan queue is full'; stageCopy.textContent = 'No scan job was accepted. Wait briefly and retry.'; }
      else if (/rate limit/i.test(message)) { stageTitle.textContent = 'Scan rate limit reached'; stageCopy.textContent = 'No additional scan was started. Wait for the limit window to reset before retrying.'; }
      else if (/temporarily unavailable|HTTP 503|worker unavailable/i.test(message)) { stageTitle.textContent = 'Service temporarily unavailable'; stageCopy.textContent = 'The scan service did not return a usable result. No score is shown. You can retry shortly.'; }
      else if (/taking longer than expected|reopen the report link/i.test(message)) { stageTitle.textContent = 'Scan timed out'; stageCopy.textContent = 'Polling has stopped. No final result is being claimed; you can retry the scan.'; }
      else if (/Scan failed:/i.test(message)) { stageTitle.textContent = 'Scan failed'; stageCopy.textContent = 'The reason is shown above. No missing measurements or scores are invented.'; }
      else { stageTitle.textContent = 'Scan paused'; stageCopy.textContent = 'Correct the issue above and try again.'; }
      button.disabled = false;
      button.textContent = 'Run free scan';
      if (window.turnstile && turnstileWidget !== null) { window.turnstile.reset(turnstileWidget); turnstileToken = ''; }
    }
  });
  window.addEventListener('pagehide', () => { if (tipTimer) clearInterval(tipTimer); stopElapsed(); });
})();
