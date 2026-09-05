/* ============================================
   africalatency.dev — scan.js
   Runs REAL diagnostics via the Globalping API
   from live probes in Nairobi, Lagos,
   Johannesburg, and Cairo.

   Lead capture:
   - Sends leads to Vercel /api/submit-lead
   - Includes invisible honeypot anti-bot field
   ============================================ */

const GP_API_BASE = 'https://api.globalping.io/v1';

// Optional Globalping token for higher rate limits.
const GP_API_TOKEN = '';

// Strict garbage words rejection list
const garbageWords = [
  'hello','test','foo','bar','baz','abc','xyz','qwerty','asdf','farah',
  'example','demo','sample','trial','temp','fake','mock','dummy',
  'api','domain','website','url','link','site','page','server',
  'localhost','127.0.0.1','0.0.0.0','192.168','10.0.0'
];

// The African cities we test from. Each has its own peering,
// IXP, and undersea cable landing situation — a result from
// one city is NOT representative of the others.
const AFRICA_PROBE_CITIES = [
  { city: 'Nairobi',      country: 'KE', label: 'Nairobi, KE',      flag: '🇰🇪' },
  { city: 'Lagos',        country: 'NG', label: 'Lagos, NG',        flag: '🇳🇬' },
  { city: 'Johannesburg', country: 'ZA', label: 'Johannesburg, ZA', flag: '🇿🇦' },
  { city: 'Cairo',        country: 'EG', label: 'Cairo, EG',        flag: '🇪🇬' }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showDomainError(msg) {
  let errEl = document.getElementById('err-domain');

  if (!errEl) {
    const input = document.getElementById('scan-domain');

    if (input && input.parentNode) {
      errEl = document.createElement('div');
      errEl.id = 'err-domain';
      errEl.className = 'calc-error';
      errEl.style.color = 'var(--error, #ef4444)';
      errEl.style.fontSize = '0.85rem';
      errEl.style.marginTop = '0.4rem';
      input.parentNode.appendChild(errEl);
    }
  }

  if (errEl) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
}

function hideDomainError() {
  const errEl = document.getElementById('err-domain');

  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
}

function looksLikeDomain(v) {
  if (!v.includes('.')) return false;
  if (/^[.-]|[.-]$/.test(v)) return false;

  const labels = v.split('.');

  for (const label of labels) {
    if (
      !label ||
      label.length > 63 ||
      !/^[a-zA-Z0-9-]+$/.test(label)
    ) {
      return false;
    }
  }

  const tld = labels[labels.length - 1];

  if (tld.length < 2) return false;

  return true;
}

function validateDomainInput(v) {
  const raw = v.trim().toLowerCase();

  if (!raw) {
    return {
      ok: false,
      msg: 'Enter a domain (e.g. api.yourfintech.co.ke)'
    };
  }

  // Strip protocol, path, and port automatically
  let domain = raw.replace(/^https?:\/\//, '');
  domain = domain.split('/')[0];
  domain = domain.split(':')[0];

  if (
    garbageWords.includes(domain) ||
    garbageWords.some(w => domain === w)
  ) {
    return {
      ok: false,
      msg: `"${domain}" is not a real domain. Enter your actual API endpoint.`
    };
  }

  if (!looksLikeDomain(domain)) {
    return {
      ok: false,
      msg: 'Enter a valid domain like api.yourcompany.co.ke or yourapp.com'
    };
  }

  return {
    ok: true,
    domain: domain
  };
}

/* ============================================
   Globalping API helpers
   ============================================ */

async function gpFetch(path, options = {}) {
  const headers = Object.assign(
    {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    options.headers || {}
  );

  if (GP_API_TOKEN) {
    headers.Authorization = `Bearer ${GP_API_TOKEN}`;
  }

  return fetch(
    GP_API_BASE + path,
    Object.assign({}, options, { headers })
  );
}

async function gpCreateMeasurement(
  type,
  target,
  locations,
  measurementOptions
) {
  const body = {
    type,
    target,
    locations
  };

  if (measurementOptions) {
    body.measurementOptions = measurementOptions;
  }

  const res = await gpFetch('/measurements', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (res.status === 202 || res.status === 200) {
    const data = await res.json();
    return data.id;
  }

  const errData = await res.json().catch(() => ({}));

  let message =
    (errData.error && errData.error.message) ||
    `Could not start measurement (HTTP ${res.status})`;

  if (errData.error && errData.error.params) {
    const detail = Object.entries(errData.error.params)
      .map(([field, msg]) => `${field}: ${msg}`)
      .join('; ');

    if (detail) {
      message += ` — ${detail}`;
    }
  }

  const err = new Error(message);
  err.status = res.status;
  err.raw = errData;

  throw err;
}

async function gpPollMeasurement(
  id,
  { timeoutMs = 25000, intervalMs = 1000 } = {}
) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const res = await gpFetch(
      `/measurements/${id}`,
      { method: 'GET' }
    );

    if (!res.ok) {
      throw new Error(
        `Could not fetch measurement result (HTTP ${res.status})`
      );
    }

    const data = await res.json();

    if (
      data.status &&
      data.status !== 'in-progress'
    ) {
      return data;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    'Timed out waiting for the probe to respond.'
  );
}

// LEGACY: single-probe fallback chain (Nairobi -> KE -> Africa -> world).
// No longer called from runScan() now that we test 4 named cities
// independently, but kept in case it's useful elsewhere / for reference.
async function gpRunFromAfrica(
  type,
  target,
  measurementOptions
) {
  const locationAttempts = [
    [{ city: 'Nairobi', limit: 1 }],
    [{ country: 'KE', limit: 1 }],
    [{ magic: 'Africa', limit: 1 }],
    [{ magic: 'world', limit: 1 }]
  ];

  let lastErr;

  for (const locations of locationAttempts) {
    try {
      const id = await gpCreateMeasurement(
        type,
        target,
        locations,
        measurementOptions
      );

      return await gpPollMeasurement(id);

    } catch (e) {
      lastErr = e;

      if (!(e.status === 400 || e.status === 422)) {
        throw e;
      }
    }
  }

  throw lastErr;
}

// Runs a measurement scoped to ONE named city. Falls back only to
// that city's country (never to "Africa" or "world" magic) so a
// result is never silently mislabeled as coming from a different
// place than the one requested.
//
// Returns the measurement object, or null if no probe was
// available at all for this city (caller must show that honestly,
// not substitute a different city's result).
async function gpRunCity(type, target, cityConfig, measurementOptions) {
  const attempts = [
    [{ city: cityConfig.city, limit: 1 }],
    [{ country: cityConfig.country, limit: 1 }]
  ];

  for (const locations of attempts) {
    try {
      const id = await gpCreateMeasurement(
        type,
        target,
        locations,
        measurementOptions
      );

      return await gpPollMeasurement(id);

    } catch (e) {
      if (!(e.status === 400 || e.status === 422)) {
        // Not a "no matching probe" error (e.g. network/timeout) —
        // no point trying the narrower fallback either.
        return null;
      }
      // else: no probe matched, try the next (broader) attempt
    }
  }

  return null;
}

/* ============================================
   Rendering helpers
   ============================================ */

function appendLine(body, text, cls) {
  const div = document.createElement('div');

  div.innerHTML =
    `<span class="prompt">$</span> ` +
    `<span class="command${cls ? ' ' + cls : ''}">${text}</span>`;

  body.appendChild(div);

  return div;
}

function appendResultLine(body, text, cls) {
  const div = document.createElement('div');

  div.className = cls || 'output';
  div.textContent = `  → ${text}`;

  body.appendChild(div);

  return div;
}

function fmtMs(v) {
  if (
    v === undefined ||
    v === null ||
    v === -1 ||
    !Number.isFinite(Number(v))
  ) {
    return 'n/a';
  }

  return `${Math.round(Number(v))}ms`;
}

/* ============================================
   Metric scoring — UNCHANGED thresholds.

   These are operational diagnostic thresholds,
   not universal internet standards.

   DNS:   GOOD <=50ms   ATTENTION <=150ms   POOR >150ms
   TLS:   GOOD <=100ms  ATTENTION <=250ms   POOR >250ms
   TTFB:  GOOD <=150ms  ATTENTION <=300ms   POOR >300ms
   TOTAL: GOOD <=500ms  ATTENTION <=1000ms  POOR >1000ms
   ============================================ */

function metricVerdict(value, goodMax, warningMax) {
  if (
    value === undefined ||
    value === null ||
    value === -1 ||
    !Number.isFinite(Number(value))
  ) {
    return {
      label: 'N/A',
      color: 'warning',
      symbol: '⚪'
    };
  }

  const numericValue = Number(value);

  if (numericValue <= goodMax) {
    return {
      label: 'GOOD',
      color: 'highlight',
      symbol: '🟢'
    };
  }

  if (numericValue <= warningMax) {
    return {
      label: 'NEEDS ATTENTION',
      color: 'warning',
      symbol: '🟡'
    };
  }

  return {
    label: 'POOR',
    color: 'error',
    symbol: '🔴'
  };
}

function overallVerdict(metrics) {
  const measured = metrics.filter(
    metric => metric && metric.label !== 'N/A'
  );

  if (!measured.length) {
    return {
      label: 'UNKNOWN',
      color: 'warning',
      symbol: '⚪'
    };
  }

  if (
    measured.some(
      metric => metric.label === 'POOR'
    )
  ) {
    return {
      label: 'CRITICAL',
      color: 'error',
      symbol: '🔴'
    };
  }

  if (
    measured.some(
      metric => metric.label === 'NEEDS ATTENTION'
    )
  ) {
    return {
      label: 'WARNING',
      color: 'warning',
      symbol: '🟡'
    };
  }

  return {
    label: 'GOOD',
    color: 'highlight',
    symbol: '🟢'
  };
}

// Severity ranking used to pick the "worst" city across the four
// tested — this drives both the page-level overall verdict and
// what gets sent to lead capture.
const VERDICT_SEVERITY = { CRITICAL: 3, WARNING: 2, GOOD: 1, UNKNOWN: 0 };

function pickWorstCity(cityResults) {
  const available = cityResults.filter(c => c.available);

  if (!available.length) return null;

  return available.reduce((worst, c) => {
    const worstSeverity = VERDICT_SEVERITY[worst.overall.label] || 0;
    const citySeverity = VERDICT_SEVERITY[c.overall.label] || 0;

    if (citySeverity > worstSeverity) return c;

    if (citySeverity === worstSeverity) {
      const worstTotal = (worst.timings && worst.timings.total) || 0;
      const cityTotal = (c.timings && c.timings.total) || 0;
      return cityTotal > worstTotal ? c : worst;
    }

    return worst;
  });
}

function metricDisplay(verdict, value) {
  return `
    <span
      style="
        color:var(--${verdict.color});
        font-weight:600;
        margin-right:0.35rem;
      "
      title="${verdict.label}"
    >
      ${verdict.symbol}
    </span>

    <span class="highlight">
      ${fmtMs(value)}
    </span>

    <span
      style="
        color:var(--${verdict.color});
        font-size:0.72rem;
        margin-left:0.35rem;
      "
    >
      ${verdict.label}
    </span>
  `;
}

function appendRawToggle(body, label, raw) {
  const details = document.createElement('details');

  details.style.marginTop = '1rem';
  details.style.fontSize = '0.78rem';
  details.style.color = 'var(--text-muted)';

  const summary = document.createElement('summary');

  summary.style.cursor = 'pointer';
  summary.textContent =
    `View raw ${label} response`;

  const pre = document.createElement('pre');

  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-all';
  pre.style.marginTop = '0.5rem';
  pre.textContent =
    JSON.stringify(raw, null, 2);

  details.appendChild(summary);
  details.appendChild(pre);

  body.appendChild(details);
}

/* ============================================
   Per-city diagnostic
   ============================================ */

async function runCityDiagnostic(cityConfig, domain) {
  let httpMeasurement = null;
  let traceMeasurement = null;

  try {
    // Run HTTP + traceroute concurrently for this city.
    [httpMeasurement, traceMeasurement] = await Promise.all([
      gpRunCity('http', domain, cityConfig, null),
      gpRunCity('traceroute', domain, cityConfig, null)
    ]);
  } catch (e) {
    return {
      city: cityConfig,
      label: cityConfig.label,
      flag: cityConfig.flag,
      available: false,
      reason: e.message || 'Diagnostic failed'
    };
  }

  if (!httpMeasurement) {
    return {
      city: cityConfig,
      label: cityConfig.label,
      flag: cityConfig.flag,
      available: false,
      reason: 'No probe currently available'
    };
  }

  const httpProbeResult =
    httpMeasurement.results && httpMeasurement.results[0];

  if (
    !httpProbeResult ||
    !httpProbeResult.result ||
    httpProbeResult.result.status !== 'finished'
  ) {
    return {
      city: cityConfig,
      label: cityConfig.label,
      flag: cityConfig.flag,
      available: false,
      reason: 'Diagnostic incomplete'
    };
  }

  const probe = httpProbeResult.probe || {};
  const r = httpProbeResult.result;
  const timings = r.timings || {};

  const probeLocation =
    [probe.city, probe.country].filter(Boolean).join(', ') ||
    cityConfig.label;

  let hopCount = null;
  let pathSummary = null;

  if (traceMeasurement) {
    const traceProbeResult =
      traceMeasurement.results && traceMeasurement.results[0];

    const hops =
      traceProbeResult &&
      traceProbeResult.result &&
      traceProbeResult.result.hops;

    if (hops && hops.length) {
      hopCount = hops.length;

      const named = hops
        .map(h => h.resolvedHostname || h.resolvedAddress)
        .filter(Boolean);

      pathSummary = named.length
        ? `${named[0]} → … → ${named[named.length - 1]}`
        : `${hopCount} hops (unnamed)`;
    }
  }

  const dnsVerdict = metricVerdict(timings.dns, 50, 150);
  const tlsVerdict = metricVerdict(timings.tls, 100, 250);
  const ttfbVerdict = metricVerdict(timings.firstByte, 150, 300);
  const totalVerdict = metricVerdict(timings.total, 500, 1000);

  const overall = overallVerdict([
    dnsVerdict,
    tlsVerdict,
    ttfbVerdict,
    totalVerdict
  ]);

  return {
    city: cityConfig,
    label: cityConfig.label,
    flag: cityConfig.flag,
    available: true,
    probeLocation,
    probeNetwork: probe.network,
    resolvedAddress: r.resolvedAddress,
    statusCode: r.statusCode,
    tlsProtocol:
      (r.tls && (r.tls.protocol || r.tls.version)) ||
      'n/a (not HTTPS or handshake failed)',
    timings,
    hopCount,
    pathSummary,
    dnsVerdict,
    tlsVerdict,
    ttfbVerdict,
    totalVerdict,
    overall,
    httpMeasurement,
    traceMeasurement
  };
}

function renderCityBlock(c) {
  if (!c.available) {
    return `
      <div style="
        padding:1rem;
        border:1px solid var(--border);
        border-radius:6px;
        margin-bottom:1rem;
        opacity:0.7;
      ">
        <div style="font-weight:600; margin-bottom:0.3rem;">
          ${c.flag} ${c.label}
        </div>
        <div style="color:var(--text-muted); font-size:0.85rem;">
          ⚪ No probe currently available for this location.
        </div>
      </div>
    `;
  }

  return `
    <div style="
      padding:1rem;
      border:1px solid var(--border);
      border-radius:6px;
      margin-bottom:1rem;
    ">
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:0.75rem;
        flex-wrap:wrap;
        gap:0.5rem;
      ">
        <div style="font-weight:600;">
          ${c.flag} ${c.label}
        </div>
        <div style="
          color:var(--${c.overall.color});
          font-weight:600;
          font-size:0.9rem;
        ">
          ${c.overall.symbol} ${c.overall.label}
        </div>
      </div>

      <div style="
        font-size:0.75rem;
        color:var(--text-muted);
        margin-bottom:0.75rem;
      ">
        Probe: ${c.probeLocation}${c.probeNetwork ? ' — ' + c.probeNetwork : ''}
      </div>

      <div style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:0.75rem;
        font-size:0.9rem;
      ">
        <div>DNS: ${metricDisplay(c.dnsVerdict, c.timings.dns)}</div>
        <div>TLS: ${metricDisplay(c.tlsVerdict, c.timings.tls)}</div>
        <div>TTFB: ${metricDisplay(c.ttfbVerdict, c.timings.firstByte)}</div>
        <div>Total: ${metricDisplay(c.totalVerdict, c.timings.total)}</div>
        ${
          c.hopCount
            ? `<div>Hops: <span class="highlight">${c.hopCount}</span></div>`
            : ''
        }
      </div>

      ${
        c.pathSummary
          ? `
            <div style="
              margin-top:0.5rem;
              font-size:0.78rem;
              color:var(--text);
              opacity:0.85;
            ">
              Path: ${c.pathSummary}
            </div>
          `
          : ''
      }
    </div>
  `;
}

/* ============================================
   Main scan flow
   ============================================ */

async function runScan() {
  const domainInput =
    document.getElementById('scan-domain');

  const rawValue = domainInput.value;

  hideDomainError();

  const validation =
    validateDomainInput(rawValue);

  if (!validation.ok) {
    showDomainError(validation.msg);
    return;
  }

  const domain = validation.domain;

  const output =
    document.getElementById('scan-output');

  const btn =
    document.getElementById('scan-btn');

  btn.disabled = true;
  btn.textContent = 'Analyzing...';

  output.style.display = 'block';
  output.classList.add('terminal');

  output.innerHTML = `
    <div class="terminal-header">
      <div class="terminal-dot red"></div>
      <div class="terminal-dot yellow"></div>
      <div class="terminal-dot green"></div>
      <div class="terminal-title">
        africalatency-scan ~ ${domain}
      </div>
    </div>

    <div class="terminal-body" id="scan-body"></div>
  `;

  const body =
    document.getElementById('scan-body');

  appendLine(
    body,
    `Running live diagnostics for ${domain} from 4 African cities via Globalping...`
  );

  /* --------------------------------------------
     Run all 4 cities. Each appends its own
     result line as soon as it finishes, so the
     terminal fills in progressively rather than
     waiting for the slowest city.
     -------------------------------------------- */

  const cityResults = await Promise.all(
    AFRICA_PROBE_CITIES.map(cityConfig =>
      runCityDiagnostic(cityConfig, domain).then(result => {
        const statusText = result.available
          ? `${result.overall.symbol} ${result.overall.label}`
          : `⚪ No probe currently available`;

        appendResultLine(
          body,
          `${cityConfig.flag} ${cityConfig.label}: ${statusText}`
        );

        return result;
      })
    )
  );

  await sleep(300);

  appendLine(
    body,
    'Compiling multi-city diagnostic report...'
  );

  await sleep(300);

  const worstCity = pickWorstCity(cityResults);

  const pageVerdict = worstCity
    ? worstCity.overall
    : { label: 'UNKNOWN', color: 'warning', symbol: '⚪' };

  const availableCount =
    cityResults.filter(c => c.available).length;

  const report =
    document.createElement('div');

  report.style.marginTop = '1.5rem';
  report.style.paddingTop = '1.5rem';
  report.style.borderTop =
    '1px solid var(--border)';

  report.innerHTML = `
    <div style="margin-bottom:0.5rem;">
      <span style="
        color:var(--${pageVerdict.color});
        font-weight:600;
        font-size:1.1rem;
      ">
        ${pageVerdict.symbol} ${pageVerdict.label}
      </span>

      <span style="
        color:var(--text-muted);
        font-size:0.8rem;
        margin-left:0.5rem;
      ">
        worst result across ${availableCount} of ${AFRICA_PROBE_CITIES.length} tested African cities
      </span>
    </div>

    <div style="
      margin-bottom:1.25rem;
      color:var(--text-muted);
      font-size:0.85rem;
    ">
      Live measurements from Nairobi, Lagos, Johannesburg, and Cairo.
      Each city has its own routing, peering, and IXP situation, so
      results can vary significantly by region — this is not a
      single-point estimate for "Africa."
    </div>

    ${cityResults.map(c => renderCityBlock(c)).join('')}

    <div style="
      padding:1.25rem;
      background:var(--bg);
      border-radius:6px;
      border:1px solid var(--border);
      margin-top:1rem;
    ">

      <div style="
        font-size:0.9rem;
        font-weight:600;
        color:var(--text);
        margin-bottom:0.3rem;
      ">
        Unlock Full Optimization Report & Remediation Plan
      </div>

      <div style="
        font-size:0.8rem;
        color:var(--text-muted);
        margin-bottom:1rem;
      ">
        Enter your details to log this scan and receive a direct infrastructure review.
      </div>

      <form
        id="lead-capture-form"
        style="
          display:flex;
          flex-direction:column;
          gap:0.75rem;
        "
      >

        <input
          type="text"
          id="lead-company"
          placeholder="Company Name"
          maxlength="150"
          required
          style="
            padding:0.6rem;
            background:var(--bg-elevated);
            border:1px solid var(--border);
            color:var(--text);
            border-radius:4px;
            font-size:0.9rem;
          "
        >

        <input
          type="email"
          id="lead-email"
          placeholder="Work Email (e.g. you@fintech.co.ke)"
          maxlength="254"
          required
          style="
            padding:0.6rem;
            background:var(--bg-elevated);
            border:1px solid var(--border);
            color:var(--text);
            border-radius:4px;
            font-size:0.9rem;
          "
        >

        <!-- Honeypot anti-spam field.
             Real visitors never see or fill this. -->
        <div
          aria-hidden="true"
          style="
            position:absolute;
            left:-9999px;
            width:1px;
            height:1px;
            overflow:hidden;
          "
        >
          <label for="lead-website">
            Website
          </label>

          <input
            type="text"
            id="lead-website"
            name="website"
            tabindex="-1"
            autocomplete="off"
          >
        </div>

        <button
          type="submit"
          class="btn btn-primary"
          id="lead-submit-btn"
          style="
            align-self:flex-start;
            margin-top:0.25rem;
          "
        >
          Save Lead & Get Audit →
        </button>

      </form>

      <div
        id="lead-feedback"
        style="
          font-size:0.85rem;
          margin-top:0.75rem;
        "
      ></div>

    </div>
  `;

  body.appendChild(report);

  cityResults.forEach(c => {
    if (c.available) {
      if (c.httpMeasurement) {
        appendRawToggle(body, `${c.label} HTTP`, c.httpMeasurement);
      }
      if (c.traceMeasurement) {
        appendRawToggle(body, `${c.label} traceroute`, c.traceMeasurement);
      }
    }
  });

  btn.disabled = false;
  btn.textContent =
    'Analyze Another Domain';

  /* --------------------------------------------
     Lead submission

     NOTE: current_latency_ms / estimated_monthly_loss
     below are still using the same placeholder logic
     as before (target_latency_ms=65, monthly_requests=
     1,000,000, loss = ttfb*30) — intentionally left
     unchanged per "keep the existing lead capture
     workflow intact." current_latency_ms now reflects
     the WORST of the 4 cities rather than only Nairobi,
     which is a real improvement, but the target/
     monthly_requests/loss fields are still placeholders,
     same as flagged previously.
     -------------------------------------------- */

  const leadForm =
    document.getElementById(
      'lead-capture-form'
    );

  leadForm.addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();

      const companyName =
        document
          .getElementById('lead-company')
          .value
          .trim();

      const contactEmail =
        document
          .getElementById('lead-email')
          .value
          .trim();

      const honeypot =
        document
          .getElementById('lead-website')
          .value
          .trim();

      const leadSubmitBtn =
        document.getElementById(
          'lead-submit-btn'
        );

      const feedback =
        document.getElementById(
          'lead-feedback'
        );

      if (companyName.length > 150) {
        feedback.style.color =
          'var(--error, #ef4444)';

        feedback.textContent =
          'Company name is too long.';

        return;
      }

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (
        !emailRegex.test(contactEmail)
      ) {
        feedback.style.color =
          'var(--error, #ef4444)';

        feedback.textContent =
          'Please enter a valid work email address.';

        return;
      }

      if (contactEmail.length > 254) {
        feedback.style.color =
          'var(--error, #ef4444)';

        feedback.textContent =
          'Email address is too long.';

        return;
      }

      leadSubmitBtn.disabled = true;
      leadSubmitBtn.textContent =
        'Submitting...';

      feedback.style.color =
        'var(--text-muted)';

      feedback.textContent =
        'Securing record to database...';

      const worstTtfb =
        worstCity && worstCity.timings
          ? worstCity.timings.firstByte
          : null;

      try {
        const response =
          await fetch(
            '/api/submit-lead',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },

              body: JSON.stringify({
                company_name:
                  companyName,

                contact_email:
                  contactEmail,

                website:
                  honeypot,

                current_latency_ms:
                  worstTtfb != null
                    ? Math.round(worstTtfb)
                    : null,

                target_latency_ms:
                  65,

                monthly_requests:
                  1000000,

                estimated_monthly_loss:
                  worstTtfb != null
                    ? Math.round(worstTtfb) * 30
                    : null
              })
            }
          );

        const data =
          await response.json();

        if (
          response.ok &&
          data.success
        ) {
          feedback.style.color =
            'var(--accent, #4ade80)';

          feedback.textContent =
            '✓ Success! Lead captured in Supabase. We will be in touch shortly.';

          leadForm.reset();

          leadSubmitBtn.textContent =
            'Submitted Successfully';

        } else {
          feedback.style.color =
            'var(--error, #ef4444)';

          feedback.textContent =
            `Error: ${
              data.error ||
              'Failed to record lead.'
            }`;

          leadSubmitBtn.disabled =
            false;

          leadSubmitBtn.textContent =
            'Retry Submission';
        }

      } catch (err) {
        console.error(err);

        feedback.style.color =
          'var(--error, #ef4444)';

        feedback.textContent =
          'Network error. Please check connection and try again.';

        leadSubmitBtn.disabled =
          false;

        leadSubmitBtn.textContent =
          'Retry Submission';
      }
    }
  );
}

/* ============================================
   Initial page setup
   ============================================ */

document.addEventListener(
  'DOMContentLoaded',
  () => {
    const form =
      document.getElementById(
        'scan-form'
      );

    if (form) {
      form.addEventListener(
        'submit',
        (e) => {
          e.preventDefault();
          runScan();
        }
      );
    }
  }
);
