/* AfricaLatency Scanner — Block 2
 * Live diagnostics via /api/run-diagnostic.
 * The scanner is intentionally a point-in-time snapshot: it does not
 * claim P50/P95 from a single observation and never invents missing data.
 */

const AFRICA_PROBE_CITIES = [
  { city: 'Nairobi', country: 'KE', label: 'Nairobi, KE', flag: '🇰🇪' },
  { city: 'Lagos', country: 'NG', label: 'Lagos, NG', flag: '🇳🇬' },
  { city: 'Johannesburg', country: 'ZA', label: 'Johannesburg, ZA', flag: '🇿🇦' },
  { city: 'Cairo', country: 'EG', label: 'Cairo, EG', flag: '🇪🇬' }
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
  const attempts = [
    [{ city: cityConfig.city, limit: 1 }],
    [{ country: cityConfig.country, limit: 1 }]
  ];

  for (const locations of attempts) {
    try {
      const response = await fetch('/api/run-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, target, locations })
      });

      if (response.ok) return await response.json();

      // A 400/422 can mean the requested city has no suitable probe;
      // retry at country level. Other errors should not be hidden.
      if (response.status !== 400 && response.status !== 422) return null;
    } catch (_) {
      return null;
    }
  }

  return null;
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
  const [httpMeasurement, traceMeasurement] = await Promise.all([
    gpRunCity('http', domain, cityConfig),
    gpRunCity('traceroute', domain, cityConfig)
  ]);

  if (!httpMeasurement) {
    return { city: cityConfig, label: cityConfig.label, flag: cityConfig.flag, available: false, reason: 'No probe currently available' };
  }

  const httpResult = httpMeasurement.results && httpMeasurement.results[0];
  if (!httpResult || !httpResult.result || httpResult.result.status !== 'finished') {
    return { city: cityConfig, label: cityConfig.label, flag: cityConfig.flag, available: false, reason: 'Diagnostic incomplete' };
  }

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
    return `<div style="padding:1rem;border:1px solid var(--border);border-radius:6px;margin-bottom:1rem;opacity:.7;"><div style="font-weight:600;margin-bottom:.3rem;">${c.flag} ${c.label}</div><div style="color:var(--text-muted);font-size:.85rem;">⚪ ${c.reason || 'No measurement available.'}</div></div>`;
  }

  return `<div style="padding:1rem;border:1px solid var(--border);border-radius:6px;margin-bottom:1rem;">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.65rem;">
      <div style="font-weight:600;">${c.flag} ${c.label}</div>
      <div style="color:var(--${c.overall.color});font-weight:600;font-size:.9rem;">${c.overall.symbol} ${c.overall.label}</div>
    </div>
    <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.75rem;">Probe: ${c.probeLocation}${c.probeNetwork ? ` — ${c.probeNetwork}` : ''}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;font-size:.9rem;">
      <div>DNS: ${metricDisplay(c.dnsVerdict, c.timings.dns)}</div>
      <div>TLS: ${metricDisplay(c.tlsVerdict, c.timings.tls)}</div>
      <div>TTFB: ${metricDisplay(c.ttfbVerdict, c.timings.firstByte)}</div>
      <div>Total: ${metricDisplay(c.totalVerdict, c.timings.total)}</div>
      ${c.hopCount ? `<div>Route hops: <span class="highlight">${c.hopCount}</span></div>` : ''}
      ${c.statusCode ? `<div>HTTP: <span class="highlight">${c.statusCode}</span></div>` : ''}
    </div>
    ${c.pathSummary ? `<div style="margin-top:.6rem;font-size:.78rem;color:var(--text);opacity:.85;word-break:break-word;">Path: ${c.pathSummary}</div>` : ''}
  </div>`;
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

  button.disabled = true;
  button.textContent = 'Scanning...';
  status.style.display = 'block';
  status.style.margin = '1rem 0';
  status.style.color = 'var(--text-muted)';
  status.textContent = 'Running live measurements from selected African vantage points…';

  output.style.display = 'block';
  output.classList.add('terminal');
  output.innerHTML = `<div class="terminal-header"><div class="terminal-dot red"></div><div class="terminal-dot yellow"></div><div class="terminal-dot green"></div><div class="terminal-title">africalatency-scan ~ ${domain}</div></div><div class="terminal-body" id="scan-body"></div>`;

  const body = document.getElementById('scan-body');
  appendLine(body, `Starting live Africa scan for ${domain}…`);
  appendLine(body, 'HTTP response + traceroute diagnostics from 4 selected African locations.');

  const results = await Promise.all(AFRICA_PROBE_CITIES.map(city =>
    runCityDiagnostic(city, domain).then(result => {
      appendResultLine(body, `${city.flag} ${city.label}: ${result.available ? `${result.overall.symbol} ${result.overall.label}` : '⚪ unavailable'}`);
      return result;
    })
  ));

  const completedAt = new Date();
  const worst = pickWorstCity(results);
  const availableCount = results.filter(r => r.available).length;
  const verdict = worst ? worst.overall : { label: 'UNKNOWN', color: 'warning', symbol: '⚪' };

  await sleep(200);
  appendLine(body, 'Compiling measured results…');
  await sleep(200);

  const report = document.createElement('div');
  report.style.marginTop = '1.25rem';
  report.style.paddingTop = '1.25rem';
  report.style.borderTop = '1px solid var(--border)';

  report.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem;">
      <div><span style="color:var(--${verdict.color});font-weight:600;font-size:1.1rem;">${verdict.symbol} ${verdict.label}</span><div style="color:var(--text-muted);font-size:.78rem;margin-top:.25rem;">Observed worst result across ${availableCount} of ${AFRICA_PROBE_CITIES.length} available locations.</div></div>
      <div style="color:var(--text-muted);font-size:.75rem;text-align:right;">Started ${startedAt.toLocaleString()}<br>Completed ${completedAt.toLocaleString()}</div>
    </div>
    ${buildSummary(results, completedAt)}
    <div style="color:var(--text-muted);font-size:.8rem;line-height:1.6;margin-bottom:1rem;">Africa is not one network. Each result is tied to the actual probe location and network available for this scan. A country fallback may be used when the requested city has no suitable probe.</div>
    ${results.map(renderCityBlock).join('')}
    <div style="padding:1.25rem;background:var(--bg);border-radius:6px;border:1px solid var(--border);margin-top:1rem;">
      <div style="font-size:.95rem;font-weight:600;margin-bottom:.35rem;">Want to know why the results look this way?</div>
      <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:1rem;line-height:1.6;">The free scanner shows what we observed. The Africa Latency Audit™ investigates routing, CDN/edge placement, infrastructure, application/API behavior and other dependencies to identify the likely bottleneck and prioritize fixes.</div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">
        <a class="btn btn-primary" href="/audit-intake">Request Africa Latency Audit™ →</a>
        <a href="methodology.html" style="font-size:.82rem;color:var(--text-muted);">View our method</a>
      </div>
    </div>
  `;

  body.appendChild(report);

  results.forEach(result => {
    if (!result.available) return;
    appendRawToggle(body, `${result.label} HTTP`, result.httpMeasurement);
    appendRawToggle(body, `${result.label} traceroute`, result.traceMeasurement);
  });

  status.textContent = `Scan completed at ${completedAt.toLocaleTimeString()}. Measurements shown above are the observations returned by the live probes.`;
  button.disabled = false;
  button.textContent = 'Analyze Another Domain';
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('scan-form');
  if (form) form.addEventListener('submit', event => { event.preventDefault(); runScan(); });
});