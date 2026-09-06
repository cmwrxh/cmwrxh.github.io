/* AfricaLatency Scanner — Block 2
 * Live diagnostics via /api/run-diagnostic.
 * The browser never receives the Globalping token.
 * Results are rendered only from measurements returned by the API.
 */

const AFRICA_PROBES = [
  { city: 'Nairobi', country: 'KE', label: 'Nairobi, Kenya', flag: '🇰🇪' },
  { city: 'Lagos', country: 'NG', label: 'Lagos, Nigeria', flag: '🇳🇬' },
  { city: 'Johannesburg', country: 'ZA', label: 'Johannesburg, South Africa', flag: '🇿🇦' },
  { city: 'Cairo', country: 'EG', label: 'Cairo, Egypt', flag: '🇪🇬' }
];

const GARBAGE = new Set(['hello','test','foo','bar','baz','abc','xyz','qwerty','asdf','example','demo','sample','trial','temp','fake','mock','dummy','api','domain','website','url','link','site','page','server','localhost','127.0.0.1','0.0.0.0']);

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function setError(message) { const el = document.getElementById('err-domain'); if (!el) return; el.textContent = message || ''; el.style.display = message ? 'block' : 'none'; }
function normalizeDomain(value) { let domain = String(value || '').trim().toLowerCase(); return domain.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]; }
function validDomain(value) {
  const domain = normalizeDomain(value);
  if (!domain || GARBAGE.has(domain) || !domain.includes('.')) return false;
  if (domain.length > 253 || /^[.-]|[.-]$/.test(domain)) return false;
  return domain.split('.').every(label => label.length > 0 && label.length <= 63 && /^[a-z0-9-]+$/.test(label));
}
function fmtMs(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? `${Math.round(n)}ms` : 'n/a'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }

async function runDiagnostic(type, target, probe) {
  const attempts = [[{ city: probe.city, limit: 1 }], [{ country: probe.country, limit: 1 }]];
  for (const locations of attempts) {
    try {
      const response = await fetch('/api/run-diagnostic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, target, locations }) });
      if (response.ok) return await response.json();
      if (response.status !== 400 && response.status !== 422) return null;
    } catch (_) { return null; }
  }
  return null;
}

function getResult(measurement) { return measurement?.results?.find(item => item?.result?.status === 'finished') || null; }
function verdict(total) {
  const n = Number(total);
  if (!Number.isFinite(n)) return { label: 'N/A', className: 'muted' };
  if (n <= 500) return { label: 'GOOD', className: 'good' };
  if (n <= 1000) return { label: 'ATTENTION', className: 'attention' };
  return { label: 'SLOW', className: 'slow' };
}

async function scanProbe(probe, target) {
  const [httpMeasurement, traceMeasurement] = await Promise.all([runDiagnostic('http', target, probe), runDiagnostic('traceroute', target, probe)]);
  const http = getResult(httpMeasurement);
  const trace = getResult(traceMeasurement);
  if (!http) return { ...probe, available: false, reason: 'No completed HTTP measurement was returned.' };

  const result = http.result || {};
  const timings = result.timings || {};
  const probeInfo = http.probe || {};
  const traceResult = trace?.result || {};
  const hops = Array.isArray(traceResult.hops) ? traceResult.hops : [];

  return {
    ...probe,
    available: true,
    probeLocation: [probeInfo.city, probeInfo.country].filter(Boolean).join(', ') || probe.label,
    network: probeInfo.network || 'n/a',
    address: result.resolvedAddress || 'n/a',
    statusCode: result.statusCode ?? 'n/a',
    timings,
    tls: result.tls?.protocol || result.tls?.version || 'n/a',
    hopCount: hops.length || null,
    path: hops.map(h => h.resolvedHostname || h.resolvedAddress).filter(Boolean),
    verdict: verdict(timings.total),
    raw: { http: httpMeasurement, traceroute: traceMeasurement }
  };
}

function statRow(label, value) { return `<div style="display:flex;justify-content:space-between;gap:1rem;padding:.65rem 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">${escapeHtml(label)}</span><span class="highlight">${escapeHtml(value)}</span></div>`; }
function cityCard(item) {
  if (!item.available) return `<article style="border:1px solid var(--border);border-radius:8px;padding:1.2rem;opacity:.72;"><div style="font-weight:600;">${item.flag} ${escapeHtml(item.label)}</div><p style="color:var(--text-muted);font-size:.85rem;margin:.6rem 0 0;">No completed measurement was returned for this vantage point.</p></article>`;
  const t = item.timings || {};
  return `<article style="border:1px solid var(--border);border-radius:8px;padding:1.2rem;background:var(--bg-elevated);">
    <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:.8rem;"><div><div style="font-weight:600;">${item.flag} ${escapeHtml(item.label)}</div><div style="color:var(--text-muted);font-size:.76rem;margin-top:.25rem;">Probe: ${escapeHtml(item.probeLocation)}</div></div><span style="font-size:.72rem;font-weight:700;">${item.verdict.label}</span></div>
    ${statRow('HTTP total', fmtMs(t.total))}${statRow('TTFB', fmtMs(t.firstByte))}${statRow('DNS', fmtMs(t.dns))}${statRow('TLS', fmtMs(t.tls))}${statRow('Status', String(item.statusCode))}${statRow('Network', item.network)}${statRow('Route hops', item.hopCount ? String(item.hopCount) : 'n/a')}
    <details style="margin-top:.8rem;font-size:.76rem;color:var(--text-muted);"><summary style="cursor:pointer;">Measurement details</summary><div style="margin-top:.6rem;line-height:1.7;">TLS: ${escapeHtml(item.tls)}<br>Resolved address: ${escapeHtml(item.address)}${item.path?.length ? `<br>Path: ${escapeHtml(item.path.slice(0,3).join(' → '))}${item.path.length > 3 ? ' → …' : ''}` : ''}</div></details>
  </article>`;
}

function renderResults(target, results, startedAt) {
  const output = document.getElementById('scan-output');
  const available = results.filter(r => r.available);
  const slowest = available.slice().sort((a,b) => Number(b.timings?.total || -1) - Number(a.timings?.total || -1))[0];
  const fastest = available.slice().sort((a,b) => Number(a.timings?.total || Infinity) - Number(b.timings?.total || Infinity))[0];
  const measuredAt = new Date().toISOString();

  output.innerHTML = `<div style="border-top:1px solid var(--border);padding-top:2rem;">
    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:flex-end;"><div><div class="label">Live scan result</div><h2 style="margin:.4rem 0;">${escapeHtml(target)}</h2><div style="color:var(--text-muted);font-size:.8rem;">Measured ${escapeHtml(measuredAt.replace('T',' ').replace('Z',' UTC'))}</div></div><div style="color:var(--text-muted);font-size:.78rem;">${available.length}/${results.length} African vantage points returned data</div></div>
    ${available.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:1rem;margin:1.5rem 0;"><div style="border:1px solid var(--border);border-radius:8px;padding:1rem;"><div style="color:var(--text-muted);font-size:.76rem;">Fastest observed</div><strong style="font-size:1.3rem;">${fmtMs(fastest.timings.total)}</strong><div style="font-size:.76rem;color:var(--text-muted);">${escapeHtml(fastest.label)}</div></div><div style="border:1px solid var(--border);border-radius:8px;padding:1rem;"><div style="color:var(--text-muted);font-size:.76rem;">Slowest observed</div><strong style="font-size:1.3rem;">${fmtMs(slowest.timings.total)}</strong><div style="font-size:.76rem;color:var(--text-muted);">${escapeHtml(slowest.label)}</div></div><div style="border:1px solid var(--border);border-radius:8px;padding:1rem;"><div style="color:var(--text-muted);font-size:.76rem;">Observed spread</div><strong style="font-size:1.3rem;">${fmtMs(Number(slowest.timings.total) - Number(fastest.timings.total))}</strong><div style="font-size:.76rem;color:var(--text-muted);">fastest → slowest</div></div></div>` : ''}
    <h3 style="margin:2rem 0 1rem;">Market observations</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;">${results.map(cityCard).join('')}</div>
    <div style="margin-top:2rem;padding:1.3rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-elevated);"><div class="label">Performance summary</div>${available.length ? `<p style="margin:.5rem 0 0;">This snapshot observed <strong>${fmtMs(fastest.timings.total)}</strong> to <strong>${fmtMs(slowest.timings.total)}</strong> HTTP response time across the returned African vantage points. That difference is a signal worth investigating; it is not, by itself, proof of the root cause.</p>` : '<p style="margin:.5rem 0 0;">No completed measurements were returned. Try again later or verify that the target is publicly reachable.</p>'}</div>
    <div style="margin-top:1.5rem;padding:1.5rem;border:1px solid var(--border);border-radius:8px;"><h3 style="margin-bottom:.5rem;">Want to know why?</h3><p style="color:var(--text-muted);">The free scanner shows the observed performance snapshot. An <strong>Africa Latency Audit™</strong> investigates routing, network conditions, CDN/edge behavior, infrastructure, application/API timing and dependencies to identify actionable bottlenecks.</p><a href="contact.html" class="btn btn-primary">Request an Africa Latency Audit™</a></div>
    <div style="margin-top:1rem;color:var(--text-muted);font-size:.76rem;line-height:1.7;">Method: live HTTP + traceroute diagnostics through AfricaLatency's server-side measurement proxy. The free scan uses one selected probe per requested city/country and is a point-in-time snapshot; it does not claim P50/P95 performance. Missing metrics are shown as n/a rather than estimated.</div>
  </div>`;
  output.style.display = 'block';
  window.__africaLatencyLastScan = { target, results, startedAt, measuredAt };
}

async function handleSubmit(event) {
  event.preventDefault();
  setError('');
  const input = document.getElementById('scan-domain');
  const button = document.getElementById('scan-btn');
  const output = document.getElementById('scan-output');
  const status = document.getElementById('scan-status');
  const domain = normalizeDomain(input.value);
  if (!validDomain(domain)) { setError('Enter a valid public domain, for example api.yourcompany.com'); return; }

  button.disabled = true; button.textContent = 'Scanning…'; output.style.display = 'none'; status.style.display = 'block';
  status.innerHTML = `<div style="border:1px solid var(--border);border-radius:8px;padding:1rem;color:var(--text-muted);">Running live diagnostics for <strong>${escapeHtml(domain)}</strong> from ${AFRICA_PROBES.map(p => p.city).join(', ')}. This can take a little while because the measurements are real.</div>`;

  const startedAt = Date.now();
  const results = [];
  for (const probe of AFRICA_PROBES) {
    status.innerHTML = `<div style="border:1px solid var(--border);border-radius:8px;padding:1rem;color:var(--text-muted);">Measuring <strong>${escapeHtml(probe.city)}</strong>… Live HTTP and route diagnostics are being collected.</div>`;
    results.push(await scanProbe(probe, domain));
    await sleep(150);
  }

  status.style.display = 'none'; renderResults(domain, results, startedAt); button.disabled = false; button.textContent = 'Run Again';
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('scan-form');
  const input = document.getElementById('scan-domain');
  if (form) form.addEventListener('submit', handleSubmit);
  if (input) input.addEventListener('input', () => setError(''));
});
