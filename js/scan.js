const scanSteps = [
  { text: "Resolving DNS from Nairobi (Safaricom 4G)...", delay: 800 },
  { text: "Testing TLS handshake (TLS 1.2 vs 1.3)...", delay: 600 },
  { text: "Measuring TTFB (Time to First Byte)...", delay: 700 },
  { text: "Analyzing BGP path (traceroute)...", delay: 900 },
  { text: "Checking CDN edge placement...", delay: 500 },
  { text: "Compiling diagnostic report...", delay: 600 }
];

const diagnoses = {
  slow: {
    dns: "120ms",
    tls: "180ms",
    ttfb: "380ms",
    hops: "18",
    path: "SEACOM → London IX → AWS us-east-1",
    verdict: "CRITICAL",
    color: "error",
    message: "Your API is in the 90th percentile for African latency. You are likely losing 30-40% of mobile users at checkout."
  },
  medium: {
    dns: "45ms",
    tls: "90ms",
    ttfb: "180ms",
    hops: "12",
    path: "WIOCC → Frankfurt → AWS eu-west-1",
    verdict: "WARNING",
    color: "warning",
    message: "Moderate latency issues. DNS is optimized but TLS and routing still add unnecessary overhead."
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runScan() {
  const domain = document.getElementById('scan-domain').value.trim();
  if (!domain) return;

  const output = document.getElementById('scan-output');
  const btn = document.getElementById('scan-btn');

  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  output.style.display = 'block';
  output.innerHTML = `<div class="terminal-header">
    <div class="terminal-dot red"></div>
    <div class="terminal-dot yellow"></div>
    <div class="terminal-dot green"></div>
    <div class="terminal-title">africalatency-scan ~ ${domain}</div>
  </div><div class="terminal-body" id="scan-body"></div>`;

  const body = document.getElementById('scan-body');

  for (const step of scanSteps) {
    const line = document.createElement('div');
    line.innerHTML = `<span class="prompt">$</span> <span class="command">${step.text}</span>`;
    body.appendChild(line);
    await sleep(step.delay);
  }

  const hash = domain.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const result = hash % 3 === 0 ? diagnoses.medium : diagnoses.slow;

  await sleep(400);

  const report = document.createElement('div');
  report.style.marginTop = '1.5rem';
  report.style.paddingTop = '1.5rem';
  report.style.borderTop = '1px solid var(--border)';
  report.innerHTML = `
    <div style="margin-bottom:1rem;">
      <span style="color:var(--${result.color});font-weight:600;font-size:1.1rem;">
        ${result.verdict}
      </span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
      <div>DNS Resolution: <span class="highlight">${result.dns}</span></div>
      <div>TLS Handshake: <span class="highlight">${result.tls}</span></div>
      <div>TTFB: <span class="highlight">${result.ttfb}</span></div>
      <div>BGP Hops: <span class="highlight">${result.hops}</span></div>
    </div>
    <div style="color:var(--text-muted);margin-bottom:1rem;">
      Path: ${result.path}
    </div>
    <div style="color:var(--${result.color});margin-bottom:1.5rem;">
      ${result.message}
    </div>
    <div style="padding:1rem;background:var(--bg);border-radius:6px;border:1px solid var(--border);">
      <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">
        This is a simulated analysis based on typical African network patterns.
      </div>
      <a href="/contact.html" class="btn btn-primary" style="margin-top:0.5rem;">
        Book a $2,500 audit →
      </a>
    </div>
  `;

  body.appendChild(report);
  btn.disabled = false;
  btn.textContent = 'Analyze Another Domain';
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('scan-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      runScan();
    });
  }
});
