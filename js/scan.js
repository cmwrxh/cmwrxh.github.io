/* ============================================
   africalatency.dev — scan.js
   Runs REAL diagnostics via the Globalping API
   from live probes, targeting Nairobi first.

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
      msg: `“${domain}” is not a real domain. Enter your actual API endpoint.`
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

// Tries Nairobi first, then Kenya, then Africa, then worldwide.
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
   Metric scoring
   ============================================

   These are operational diagnostic thresholds,
   not universal internet standards.

   DNS:
   GOOD             <= 50ms
   NEEDS ATTENTION  <= 150ms
   POOR             > 150ms

   TLS:
   GOOD             <= 100ms
   NEEDS ATTENTION  <= 250ms
   POOR             > 250ms

   TTFB:
   GOOD             <= 150ms
   NEEDS ATTENTION  <= 300ms
   POOR             > 300ms

   TOTAL:
   GOOD             <= 500ms
   NEEDS ATTENTION  <= 1000ms
   POOR             > 1000ms
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

  let ttfb = null;
  let probeLocation = 'unknown';

  /* --------------------------------------------
     Step 1: HTTP measurement
     -------------------------------------------- */

  appendLine(
    body,
    'Running a live HTTP diagnostic from a Globalping probe in Nairobi...'
  );

  let httpMeasurement;

  try {
    httpMeasurement =
      await gpRunFromAfrica(
        'http',
        domain,
        null
      );

  } catch (e) {
    appendResultLine(
      body,
      e.message ||
        'Could not reach the Globalping API.',
      'error'
    );

    if (e.raw) {
      appendRawToggle(
        body,
        'error',
        e.raw
      );
    }

    btn.disabled = false;
    btn.textContent =
      'Analyze Another Domain';

    return;
  }

  const httpProbeResult =
    httpMeasurement.results &&
    httpMeasurement.results[0];

  if (
    !httpProbeResult ||
    !httpProbeResult.result ||
    httpProbeResult.result.status !== 'finished'
  ) {
    const reason =
      (
        httpProbeResult &&
        httpProbeResult.result &&
        (
          httpProbeResult.result.rawOutput ||
          httpProbeResult.result.status
        )
      ) ||
      'the target did not respond to the probe';

    appendResultLine(
      body,
      `Diagnostic incomplete: ${reason}`,
      'error'
    );

    appendRawToggle(
      body,
      'http',
      httpMeasurement
    );

    btn.disabled = false;
    btn.textContent =
      'Analyze Another Domain';

    return;
  }

  const probe =
    httpProbeResult.probe || {};

  const r =
    httpProbeResult.result;

  const timings =
    r.timings || {};

  probeLocation =
    [probe.city, probe.country]
      .filter(Boolean)
      .join(', ') ||
    'unknown location';

  ttfb = timings.firstByte;

  appendResultLine(
    body,
    `Live probe: ${probeLocation}${
      probe.network
        ? ' — ' + probe.network
        : ''
    }`
  );

  await sleep(300);

  appendLine(
    body,
    'Resolving DNS...'
  );

  appendResultLine(
    body,
    `${r.resolvedAddress || 'unresolved'} (${fmtMs(timings.dns)})`
  );

  await sleep(300);

  appendLine(
    body,
    'Testing TLS handshake...'
  );

  const tlsProtocol =
    (
      r.tls &&
      (
        r.tls.protocol ||
        r.tls.version
      )
    ) ||
    'n/a (not HTTPS or handshake failed)';

  appendResultLine(
    body,
    `${tlsProtocol} (${fmtMs(timings.tls)})`
  );

  await sleep(300);

  appendLine(
    body,
    'Measuring TTFB (Time to First Byte)...'
  );

  appendResultLine(
    body,
    `HTTP ${r.statusCode ?? '?'} (${fmtMs(timings.firstByte)})`
  );

  /* --------------------------------------------
     Step 2: Traceroute
     -------------------------------------------- */

  await sleep(300);

  appendLine(
    body,
    'Analyzing BGP path (traceroute)...'
  );

  let hopCount = null;
  let pathSummary = null;
  let traceMeasurement = null;

  try {
    traceMeasurement =
      await gpRunFromAfrica(
        'traceroute',
        domain,
        null
      );

    const traceProbeResult =
      traceMeasurement.results &&
      traceMeasurement.results[0];

    const hops =
      traceProbeResult &&
      traceProbeResult.result &&
      traceProbeResult.result.hops;

    if (hops && hops.length) {
      hopCount = hops.length;

      const named =
        hops
          .map(
            h =>
              h.resolvedHostname ||
              h.resolvedAddress
          )
          .filter(Boolean);

      pathSummary =
        named.length
          ? `${named[0]} → … → ${named[named.length - 1]}`
          : `${hopCount} hops (unnamed)`;

      appendResultLine(
        body,
        `${hopCount} hops — ${pathSummary}`
      );

    } else {
      appendResultLine(
        body,
        'Traceroute did not complete (target may block ICMP).',
        'warning'
      );
    }

  } catch (e) {
    appendResultLine(
      body,
      `Traceroute unavailable: ${e.message}`,
      'warning'
    );
  }

  await sleep(300);

  appendLine(
    body,
    'Compiling diagnostic report...'
  );

  await sleep(300);

  /* --------------------------------------------
     Step 3: Score individual metrics
     -------------------------------------------- */

  const dnsVerdict =
    metricVerdict(
      timings.dns,
      50,
      150
    );

  const tlsVerdict =
    metricVerdict(
      timings.tls,
      100,
      250
    );

  const ttfbVerdict =
    metricVerdict(
      timings.firstByte,
      150,
      300
    );

  const totalVerdict =
    metricVerdict(
      timings.total,
      500,
      1000
    );

  /* --------------------------------------------
     Step 4: Calculate overall verdict
     -------------------------------------------- */

  const verdict =
    overallVerdict([
      dnsVerdict,
      tlsVerdict,
      ttfbVerdict,
      totalVerdict
    ]);

  const report =
    document.createElement('div');

  report.style.marginTop = '1.5rem';
  report.style.paddingTop = '1.5rem';
  report.style.borderTop =
    '1px solid var(--border)';

  report.innerHTML = `
    <div style="margin-bottom:1rem;">
      <span style="
        color:var(--${verdict.color});
        font-weight:600;
        font-size:1.1rem;
      ">
        ${verdict.symbol} ${verdict.label}
      </span>

      <span style="
        color:var(--text-muted);
        font-size:0.8rem;
        margin-left:0.5rem;
      ">
        measured live from ${probeLocation}
      </span>
    </div>

    <div style="
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:1rem;
      margin-bottom:1rem;
    ">

      <div>
        DNS Resolution:
        ${metricDisplay(
          dnsVerdict,
          timings.dns
        )}
      </div>

      <div>
        TLS Handshake:
        ${metricDisplay(
          tlsVerdict,
          timings.tls
        )}
      </div>

      <div>
        TTFB:
        ${metricDisplay(
          ttfbVerdict,
          timings.firstByte
        )}
      </div>

      <div>
        Total:
        ${metricDisplay(
          totalVerdict,
          timings.total
        )}
      </div>

      ${
        hopCount
          ? `
            <div>
              Traceroute Hops:
              <span class="highlight">
                ${hopCount}
              </span>
            </div>
          `
          : ''
      }

    </div>

    ${
      pathSummary
        ? `
          <div style="
            color:var(--text);
            opacity:0.85;
            margin-bottom:1rem;
          ">
            Path: ${pathSummary}
          </div>
        `
        : ''
    }

    <div style="
      color:var(--${verdict.color});
      margin-bottom:1.5rem;
    ">
      ${
        verdict.label === 'CRITICAL'
          ? 'One or more measured latency components are significantly elevated and may create a poor experience for African users.'
          : verdict.label === 'WARNING'
          ? 'The endpoint is responding, but one or more latency components have meaningful room for improvement for African users.'
          : verdict.label === 'GOOD'
          ? 'The measured latency profile is currently healthy across the available diagnostic metrics.'
          : 'The diagnostic did not return enough usable measurements to determine an overall latency status.'
      }
    </div>

    <div style="
      padding:1.25rem;
      background:var(--bg);
      border-radius:6px;
      border:1px solid var(--border);
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

  appendRawToggle(
    body,
    'http',
    httpMeasurement
  );

  if (traceMeasurement) {
    appendRawToggle(
      body,
      'traceroute',
      traceMeasurement
    );
  }

  btn.disabled = false;
  btn.textContent =
    'Analyze Another Domain';

  /* --------------------------------------------
     Lead submission
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

      // ------------------------------------------
      // Frontend validation
      // ------------------------------------------

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

                // Honeypot value
                website:
                  honeypot,

                current_latency_ms:
                  ttfb != null
                    ? Math.round(ttfb)
                    : null,

                target_latency_ms:
                  65,

                monthly_requests:
                  1000000,

                estimated_monthly_loss:
                  ttfb != null
                    ? Math.round(ttfb) * 30
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
