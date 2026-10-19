/* AfricaLatency Scanner — Block 2
 * Live diagnostics via /api/run-diagnostic.
 * The scanner is intentionally a point-in-time snapshot: it does not
 * claim P50/P95 from a single observation and never invents missing data.
 */

const AFRICA_PROBE_CITIES = [
  { city: 'Nairobi', country: 'KE', label: 'Kenya', flag: '🇰🇪' },
  { city: 'Lagos', country: 'NG', label: 'Nigeria', flag: '🇳🇬' },
  { city: 'Johannesburg', country: 'ZA', label: 'South Africa', flag: '🇿🇦' },
  { city: 'Cairo', country: 'EG', label: 'Egypt', flag: '🇪🇬' },
  { city: 'Casablanca', country: 'MA', label: 'Morocco', flag: '🇲🇦' },
  { city: 'Accra', country: 'GH', label: 'Ghana', flag: '🇬🇭' },
  { city: 'Kigali', country: 'RW', label: 'Rwanda', flag: '🇷🇼' },
  { city: 'Port Louis', country: 'MU', label: 'Mauritius', flag: '🇲🇺' },
  { city: 'Tunis', country: 'TN', label: 'Tunisia', flag: '🇹🇳' },
  { city: 'Gaborone', country: 'BW', label: 'Botswana', flag: '🇧🇼' },
  { city: 'Dakar', country: 'SN', label: 'Senegal', flag: '🇸🇳' },
  { city: 'Abidjan', country: 'CI', label: 'Côte d’Ivoire', flag: '🇨🇮' },
  { city: 'Dar es Salaam', country: 'TZ', label: 'Tanzania', flag: '🇹🇿' },
  { city: 'Kampala', country: 'UG', label: 'Uganda', flag: '🇺🇬' },
  { city: 'Addis Ababa', country: 'ET', label: 'Ethiopia', flag: '🇪🇹' },
  { city: 'Algiers', country: 'DZ', label: 'Algeria', flag: '🇩🇿' },
  { city: 'Windhoek', country: 'NA', label: 'Namibia', flag: '🇳🇦' },
  { city: 'Lusaka', country: 'ZM', label: 'Zambia', flag: '🇿🇲' },
  { city: 'Maputo', country: 'MZ', label: 'Mozambique', flag: '🇲🇿' },
  { city: 'Luanda', country: 'AO', label: 'Angola', flag: '🇦🇴' },
  { city: 'Douala', country: 'CM', label: 'Cameroon', flag: '🇨🇲' },
  { city: 'Libreville', country: 'GA', label: 'Gabon', flag: '🇬🇦' },
  { city: 'Djibouti', country: 'DJ', label: 'Djibouti', flag: '🇩🇯' },
  { city: 'Victoria', country: 'SC', label: 'Seychelles', flag: '🇸🇨' },
  { city: 'Praia', country: 'CV', label: 'Cabo Verde', flag: '🇨🇻' },
  { city: 'Mbabane', country: 'SZ', label: 'Eswatini', flag: '🇸🇿' },
  { city: 'Antananarivo', country: 'MG', label: 'Madagascar', flag: '🇲🇬' },
  { city: 'Harare', country: 'ZW', label: 'Zimbabwe', flag: '🇿🇼' },
  { city: 'Lilongwe', country: 'MW', label: 'Malawi', flag: '🇲🇼' },
  { city: 'Cotonou', country: 'BJ', label: 'Benin', flag: '🇧🇯' },
  { city: 'Lomé', country: 'TG', label: 'Togo', flag: '🇹🇬' }
];

const VERDICT_SEVERITY = { CRITICAL: 3, WARNING: 2, GOOD: 1, UNKNOWN: 0 };

const garbageWords = [
  'hello','test','foo','bar','baz','abc','xyz','qwerty','asdf',
  'example','demo','sample','trial','temp','fake','mock','dummy',
  'api','domain','website','url','link','site','page','server',
  'localhost','127.0.0.1','0.0.0.0','192.168','10.0.0'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showDomainError(msg) {
  const el = document.getElementById('err-domain');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function hideDomainError() {
  const el = document.getElementById('err-domain');
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

function looksLikeDomain(value) {
  if (!value.includes('.') || /^[.-]|[.-]$/.test(value)) return false;
  const labels = value.split('.');
  return labels.every(label =>
    label && label.length <= 63 && /^[a-zA-Z0-9-]+$/.test(label)
  ) && labels[labels.length - 1].length >= 2;
}

function validateDomainInput(value) {
  const raw = value.trim().toLowerCase();
  if (!raw) return { ok: false, msg: 'Enter a public domain, e.g. api.yourcompany.com' };

  let domain = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

  if (garbageWords.includes(domain)) {
    return { ok: false, msg: `"${domain}" is not a valid target. Enter your actual public domain.` };
  }

  if (!looksLikeDomain(domain)) {
    return { ok: false, msg: 'Enter a valid public domain like api.yourcompany.co.ke or yourapp.com' };
  }

  return { ok: true, domain };
}

async function gpRunCity(type, target, cityConfig) {
  // Country-level requests can use any available probe in the country.
  try {
    const response = await fetch('/api/run-diagnostic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target, locations: [{ country: cityConfig.country, limit: 1 }] })
    });
    if (response.ok) return await response.json();
    const payload = await response.json().catch(() => ({}));
    if (response.status === 400 || response.status === 422) {
      return { _unavailableReason: 'No matching live probe returned for this country.' };
    }
    if (response.status === 429) {
      return { _requestError: 'The diagnostic service rate-limited this request. Please try again later.' };
    }
    return { _requestError: payload.error || `Diagnostic request failed (HTTP ${response.status}).` };
  } catch (_) {
    return { _requestError: 'Could not reach the diagnostic service; no live result was returned.' };
  }
}

function validNumber(value) {
  return value !== undefined && value !== null && value !== -1 && Number.isFinite(Number(value));
}

function fmtMs(value) {
  return validNumber(value) ? `${Math.round(Number(value))}ms` : 'n/a';
}

function metricVerdict(value, goodMax, warningMax) {
  if (!validNumber(value)) return { label: 'N/A', color: 'warning', symbol: '⚪' };
  const n = Number(value);
  if (n <= goodMax) return { label: 'GOOD', color: 'highlight', symbol: '🟢' };
  if (n <= warningMax) return { label: 'NEEDS ATTENTION', color: 'warning', symbol: '🟡' };
  return { label: 'POOR', color: 'error', symbol: '🔴' };
}

function overallVerdict(metrics) {
  const measured = metrics.filter(m => m && m.label !== 'N/A');
  if (!measured.length) return { label: 'UNKNOWN', color: 'warning', symbol: '⚪' };
  if (measured.some(m => m.label === 'POOR')) return { label: 'CRITICAL', color: 'error', symbol: '🔴' };
  if (measured.some(m => m.label === 'NEEDS ATTENTION')) return { label: 'WARNING', color: 'warning', symbol: '🟡' };
  return { label: 'GOOD', color: 'highlight', symbol: '🟢' };
}

function pickWorstCity(results) {
  const available = results.filter(r => r.available);
  if (!available.length) return null;
  return available.reduce((worst, current) => {
    const a = VERDICT_SEVERITY[worst.overall.label] || 0;
    const b = VERDICT_SEVERITY[current.overall.label] || 0;
    if (b > a) return current;
    if (b === a && Number(current.timings.total || 0) > Number(worst.timings.total || 0)) return current;
    return worst;
  });
}

function metricDisplay(verdict, value) {
  return `<span style="color:var(--${verdict.color});font-weight:600;">${verdict.symbol}</span> <span class="highlight">${fmtMs(value)}</span> <span style="color:var(--${verdict.color});font-size:.72rem;">${verdict.label}</span>`;
}

async function runCityDiagnostic(cityConfig, domain) {
  const httpMeasurement = await gpRunCity('http', domain, cityConfig);
  if (!httpMeasurement || httpMeasurement._unavailableReason || httpMeasurement._requestError) {
    return {
      city: cityConfig, label: cityConfig.label, flag: cityConfig.flag, available: false,
      reason: (httpMeasurement && (httpMeasurement._unavailableReason || httpMeasurement._requestError)) || 'No live result returned.'
    };
  }

  const httpResult = httpMeasurement.results && httpMeasurement.results[0];
  if (!httpResult || !httpResult.result || httpResult.result.status !== 'finished') {
    return { city: cityConfig, label: cityConfig.label, flag: cityConfig.flag, available: false, reason: 'No completed HTTP measurement was returned.' };
  }

  // Traceroute is secondary: HTTP results remain valid if route diagnostics fail.
  const traceMeasurement = await gpRunCity('traceroute', domain, cityConfig);
  const probe = httpResult.probe || {};
  const result = httpResult.result;
  const timings = result.timings || {};
  const traceResult = traceMeasurement && traceMeasurement.results && traceMeasurement.results[0];
  const hops = traceResult && traceResult.result && traceResult.result.hops;
  const hopCount = Array.isArray(hops) && hops.length ? hops.length : null;

  const pathNames = Array.isArray(hops)
    ? hops.map(h => h.resolvedHostname || h.resolvedAddress).filter(Boolean)
    : [];

  const pathSummary = pathNames.length
    ? `${pathNames[0]} → … → ${pathNames[pathNames.length - 1]}`
    : null;

  const dnsVerdict = metricVerdict(timings.dns, 50, 150);
  const tlsVerdict = metricVerdict(timings.tls, 100, 250);
  const ttfbVerdict = metricVerdict(timings.firstByte, 150, 300);
  const totalVerdict = metricVerdict(timings.total, 500, 1000);

  return {
    city: cityConfig,
    label: cityConfig.label,
    flag: cityConfig.flag,
    available: true,
    probeLocation: [probe.city, probe.country].filter(Boolean).join(', ') || cityConfig.label,
    probeNetwork: probe.network || null,
    resolvedAddress: result.resolvedAddress || null,
    statusCode: result.statusCode || null,
    tlsProtocol: (result.tls && (result.tls.protocol || result.tls.version)) || null,
    timings,
    hopCount,
    pathSummary,
    dnsVerdict,
    tlsVerdict,
    ttfbVerdict,
    totalVerdict,
    overall: overallVerdict([dnsVerdict, tlsVerdict, ttfbVerdict, totalVerdict]),
    httpMeasurement,
    traceMeasurement
  };
}

function renderCityBlock(c) {
  if (!c.available) {
    return `<div class="scan-country scan-country-unavailable">
      <span class="scan-country-name">${c.flag} ${c.label}</span>
      <span class="scan-country-state">Unavailable</span>
    </div>`;
  }

  return `<article class="scan-country">
    <div class="scan-country-main">
      <div class="scan-country-name">${c.flag} ${c.label}</div>
      <div class="scan-country-metrics">
        <div><span>Total response</span><strong>${fmtMs(c.timings.total)}</strong></div>
        <div><span>Time to first byte</span><strong>${fmtMs(c.timings.firstByte)}</strong></div>
        <div><span>HTTP status</span><strong>${c.statusCode || 'n/a'}</strong></div>
      </div>
    </div>
    <details class="scan-country-details">
      <summary>More details</summary>
      <div class="scan-detail-grid">
        <div><span>DNS</span><strong>${fmtMs(c.timings.dns)}</strong></div>
        <div><span>TLS</span><strong>${fmtMs(c.timings.tls)}</strong></div>
        <div><span>Probe location</span><strong>${c.probeLocation || c.label}</strong></div>
        ${c.probeNetwork ? `<div><span>Network</span><strong>${c.probeNetwork}</strong></div>` : ''}
        ${c.hopCount ? `<div><span>Route hops</span><strong>${c.hopCount}</strong></div>` : ''}
        ${c.pathSummary ? `<div class="scan-detail-path"><span>Observed route</span><strong>${c.pathSummary}</strong></div>` : ''}
      </div>
    </details>
  </article>`;
}

function appendRawToggle(body, label, raw) {
  if (!raw) return;
  const details = document.createElement('details');
  details.style.cssText = 'margin-top:1rem;font-size:.78rem;color:var(--text-muted);';
  const summary = document.createElement('summary');
  summary.textContent = `View raw ${label} response`;
  summary.style.cursor = 'pointer';
  const pre = document.createElement('pre');
  pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;margin-top:.5rem;';
  pre.textContent = JSON.stringify(raw, null, 2);
  details.append(summary, pre);
  body.appendChild(details);
}

function appendResultLine(body, text) {
  const div = document.createElement('div');
  div.className = 'output';
  div.textContent = `  → ${text}`;
  body.appendChild(div);
}

function appendLine(body, text) {
  const div = document.createElement('div');
  div.innerHTML = `<span class="prompt">$</span> <span class="command">${text}</span>`;
  body.appendChild(div);
}

async function saveScanHistory(domain, results, verdict, startedAt, completedAt) {
  const client = window.africaLatencySupabase;
  if (!client) return { saved: false, reason: 'Sign-in is not available on this page.' };
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) return { saved: false, reason: 'Sign in to save this scan to your dashboard.' };
  const compactResults = results.map(result => ({
    label: result.label, available: result.available === true,
    probeLocation: result.probeLocation || null, probeNetwork: result.probeNetwork || null,
    statusCode: result.statusCode || null, timings: result.timings || null,
    hopCount: result.hopCount || null, pathSummary: result.pathSummary || null,
    overall: result.overall || { label: 'UNKNOWN' }
  }));
  try {
    const response = await fetch('/api/scan-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ domain, verdict: verdict.label, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), results: compactResults })
    });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); return { saved: false, reason: payload.error || 'Unable to save scan history.' }; }
    return { saved: true };
  } catch (_) { return { saved: false, reason: 'Scan completed, but saving its history failed.' }; }
}
function buildSummary(results, timestamp) {
  const available = results.filter(r => r.available);
  const totals = available.map(r => Number(r.timings.total)).filter(Number.isFinite);
  const ttfbs = available.map(r => Number(r.timings.firstByte)).filter(Number.isFinite);
  const fastest = totals.length ? available.find(r => Number(r.timings.total) === Math.min(...totals)) : null;
  const slowest = totals.length ? available.find(r => Number(r.timings.total) === Math.max(...totals)) : null;

  return `<div style="padding:1.25rem;border:1px solid var(--border);border-radius:6px;margin-bottom:1rem;background:var(--bg-elevated);">
    <div style="font-weight:600;margin-bottom:.5rem;">Performance Summary</div>
    <div style="font-size:.85rem;color:var(--text-muted);line-height:1.7;">
      ${fastest ? `Fastest observed total: <strong>${fastest.label}</strong> at <strong>${fmtMs(fastest.timings.total)}</strong>.<br>` : ''}
      ${slowest ? `Slowest observed total: <strong>${slowest.label}</strong> at <strong>${fmtMs(slowest.timings.total)}</strong>.<br>` : ''}
      ${totals.length > 1 ? `Observed spread: <strong>${fmtMs(Math.max(...totals) - Math.min(...totals))}</strong> between the fastest and slowest available locations.<br>` : ''}
      ${ttfbs.length ? `Observed TTFB range: <strong>${fmtMs(Math.min(...ttfbs))}</strong>–<strong>${fmtMs(Math.max(...ttfbs))}</strong>.<br>` : ''}
      <span>These are single-scan observations, not P50/P95 benchmarks.</span>
    </div>
  </div>`;
}

async function runScan() {
  const input = document.getElementById('scan-domain');
  const validation = validateDomainInput(input.value);
  hideDomainError();
  if (!validation.ok) return showDomainError(validation.msg);

  const domain = validation.domain;
  const output = document.getElementById('scan-output');
  const status = document.getElementById('scan-status');
  const button = document.getElementById('scan-btn');
  const startedAt = new Date();
  let completedLocations = 0;

  button.disabled = true;
  button.textContent = 'Scanning…';
  status.style.display = 'block';
  status.className = 'scan-live-status';
  status.textContent = `Checking ${domain} from available African network locations…`;

  output.style.display = 'block';
  output.className = 'scan-results-shell';
  output.innerHTML = `
    <div class="scan-progress-card" role="status" aria-live="polite">
      <div class="scan-loader" aria-hidden="true"></div>
      <div class="scan-progress-copy">
        <strong>Measuring your endpoint</strong>
        <p id="scan-progress-label">Checking available network locations…</p>
      </div>
      <div class="scan-progress-count" id="scan-progress-count">0 / ${AFRICA_PROBE_CITIES.length}</div>
      <div class="scan-progress-track"><span id="scan-progress-bar"></span></div>
      <p class="scan-progress-footnote">Only completed live measurements are included in your results.</p>
    </div>`;

  const results = await Promise.all(AFRICA_PROBE_CITIES.map(async city => {
    const result = await runCityDiagnostic(city, domain);
    completedLocations += 1;
    const count = document.getElementById('scan-progress-count');
    const label = document.getElementById('scan-progress-label');
    const bar = document.getElementById('scan-progress-bar');
    if (count) count.textContent = `${completedLocations} / ${AFRICA_PROBE_CITIES.length}`;
    if (label) label.textContent = completedLocations === AFRICA_PROBE_CITIES.length
      ? 'Preparing your results…'
      : `Checking locations · ${completedLocations} of ${AFRICA_PROBE_CITIES.length} complete`;
    if (bar) bar.style.width = `${Math.round(completedLocations / AFRICA_PROBE_CITIES.length * 100)}%`;
    return result;
  }));

  const completedAt = new Date();
  const worst = pickWorstCity(results);
  const available = results.filter(r => r.available);
  const availableCount = available.length;
  const unavailable = results.filter(r => !r.available);
  const verdict = worst ? worst.overall : { label: 'UNKNOWN', color: 'warning', symbol: '⚪' };
  const totals = available.map(r => Number(r.timings.total)).filter(Number.isFinite);
  const fastest = totals.length
    ? available.find(r => Number(r.timings.total) === Math.min(...totals))
    : null;

  const unavailableDetails = unavailable.length ? `
    <details class="scan-unavailable-list">
      <summary>${unavailable.length} locations returned no completed result</summary>
      <p>These locations are not counted as slow or healthy. A result was not available for this scan.</p>
      <div class="scan-unavailable-grid">${unavailable.map(c => `
        <div class="scan-unavailable-item"><span>${c.flag} ${c.label}</span><span>Unavailable</span></div>
      `).join('')}</div>
    </details>` : '';

  output.innerHTML = `
    <section class="scan-report">
      <div class="scan-report-heading">
        <div>
          <span class="scan-report-eyebrow">SCAN COMPLETE</span>
          <h2>Results for <span>${domain}</span></h2>
          <p>Live measurements returned for ${availableCount} of ${AFRICA_PROBE_CITIES.length} requested locations.</p>
        </div>
        <span class="scan-complete-mark" aria-label="Scan complete">✓</span>
      </div>

      <div class="scan-summary-grid">
        <div class="scan-summary-card scan-summary-primary">
          <span>Locations measured</span>
          <strong>${availableCount}<small> / ${AFRICA_PROBE_CITIES.length}</small></strong>
        </div>
        <div class="scan-summary-card">
          <span>Fastest observed response</span>
          <strong>${fastest ? fmtMs(fastest.timings.total) : 'n/a'}</strong>
          <small>${fastest ? `${fastest.flag} ${fastest.label}` : 'No completed timing available'}</small>
        </div>
      </div>

      <div class="scan-results-heading">
        <div><h3>Measured locations</h3><p>Sorted in the order checked. Expand a location for technical details.</p></div>
        <span class="scan-live-pill"><i></i> Live results</span>
      </div>
      ${available.length ? `<div class="scan-country-list">${available.map(renderCityBlock).join('')}</div>` : `
        <div class="scan-empty-state"><strong>No completed measurements this time</strong><p>We couldn't obtain a live result from the requested locations. Try again later.</p></div>`}
      ${unavailableDetails}

      <p class="scan-measurement-note">This is a point-in-time snapshot, not a long-term benchmark. Unavailable locations are excluded from performance comparisons.</p>

      <details class="scan-save-details" id="scan-save-details" hidden>
        <summary>Scan history</summary>
        <p id="scan-save-message"></p>
      </details>

      <div class="scan-audit-cta">
        <div><span class="scan-report-eyebrow">NEED A CLEAR ACTION PLAN?</span><h3>Turn these measurements into next steps.</h3><p>The Africa Latency Audit organizes the available evidence into a structured report with comparisons and prioritized recommendations.</p></div>
        <a class="btn btn-primary" href="/audit-checkout.html">Get Full Audit · KES 3,500 →</a>
      </div>
    </section>`;

  const saveResult = await saveScanHistory(domain, results, verdict, startedAt, completedAt);
  if (saveResult.saved) {
    const saveDetails = document.getElementById('scan-save-details');
    const saveMessage = document.getElementById('scan-save-message');
    if (saveDetails && saveMessage) {
      saveDetails.hidden = false;
      saveMessage.textContent = 'This scan has been saved to your Performance Dashboard.';
    }
  }

  status.textContent = `Scan complete. ${availableCount} of ${AFRICA_PROBE_CITIES.length} requested locations returned live results.`;
  button.disabled = false;
  button.textContent = 'Analyze Another Domain';
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('scan-form');
  if (form) form.addEventListener('submit', event => { event.preventDefault(); runScan(); });
});