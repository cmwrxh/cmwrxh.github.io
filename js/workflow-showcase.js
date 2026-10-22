/* Accessible, dependency-free workflow tabs */
(function () {
  var root = document.querySelector('.workflow-showcase');
  if (!root) return;
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-workflow-tab]'));
  var panel = root.querySelector('#workflow-panel');
  var eyebrow = root.querySelector('[data-workflow-eyebrow]');
  var heading = root.querySelector('[data-workflow-heading]');
  var subheading = root.querySelector('[data-workflow-subheading]');
  var bullets = root.querySelector('[data-workflow-bullets]');
  var reportKicker = root.querySelector('[data-report-kicker]');
  var content = {
    measure: {
      number: '01 / MEASURE',
      heading: "Gain complete visibility into your site's real African performance",
      subheading: 'Go beyond single global scores. Pinpoint localized latency, IXP bottlenecks, and regional network delays.',
      report: 'PERFORMANCE AUDIT PREVIEW',
      bullets: [
        ['Synthetic & live probe scans:', ' Review DNS, TCP, TLS, HTTP and TTFB timings where supported and returned by available probes.'],
        ['Regional context:', ' Compare returned measurements from available locations, including Nairobi, Johannesburg, Lagos and other supported probe locations.'],
        ['Real user monitoring:', ' The RUM beta can test connection telemetry on your own device; broad audience and ISP-level collection remain under validation.'],
        ['Browser diagnostics:', ' Request-by-request waterfall and packet-trace views are not part of the current public scan and remain planned work.'],
        ['Alerts:', ' Continuous monitoring and automated webhook, Slack or email alerts are in development.']
      ]
    },
    monitor: {
      number: '02 / MONITOR',
      heading: 'Move from one-off checks toward ongoing performance visibility',
      subheading: 'Know what continuous monitoring is intended to deliver while pilot scope and alert delivery are being built.',
      report: 'MONITORING CONCEPT PREVIEW',
      bullets: [
        ['Recurring checks:', ' Scheduled endpoint checks are planned for the Continuous Monitoring release and are not represented as active here.'],
        ['Latency thresholds:', ' Threshold-based spike detection and availability policies are in development.'],
        ['Webhook, Slack and email:', ' Alert integrations are planned; this preview does not send notifications.'],
        ['History and trends:', ' Historical charts require a connected monitoring data pipeline and are not generated from placeholder values.'],
        ['Pilot access:', ' Join the waitlist to discuss the scope as the monitoring service is validated.']
      ]
    },
    diagnose: {
      number: '03 / DIAGNOSE',
      heading: 'Compare regions and investigate the evidence behind slow responses',
      subheading: 'Separate measured differences from assumptions about ISPs, routes, hosting regions and edge configuration.',
      report: 'REGIONAL COMPARISON PREVIEW',
      bullets: [
        ['Side-by-side comparison:', ' Compare only probes that returned measurements for the same scan target.'],
        ['Connection phases:', ' Review DNS, connection, TLS and HTTP timings where each probe reports those fields.'],
        ['Network path clues:', ' Route and hop details appear only where supported by the measurement source.'],
        ['Waterfall and packet traces:', ' Browser request waterfall and packet-level diagnostics are not currently included in the public scan.'],
        ['Evidence-led next steps:', ' Use observations to guide further investigation; a correlation alone does not prove the root cause.']
      ]
    },
    reports: {
      number: '04 / REPORT',
      heading: 'Turn returned measurements into reports and repeatable workflows',
      subheading: 'Use a clear performance baseline to guide technical conversations and plan deeper investigation.',
      report: 'REPORT & API CONCEPT PREVIEW',
      bullets: [
        ['Scan reports:', ' Review available measurement output and its limitations rather than relying on fabricated scores.'],
        ['API integration:', ' Explore the programmatic scanning documentation for supported endpoints and current API behavior.'],
        ['Team handoff:', ' Share observed timings, unavailable probe locations and investigation notes with engineering teams.'],
        ['Automated exports:', ' Scheduled report delivery and richer export workflows depend on future monitoring capabilities.'],
        ['Custom deep dive:', ' Scope private systems, application internals and third-party dependencies separately with authorization.']
      ]
    }
  };
  function renderBullets(items) {
    while (bullets.firstChild) bullets.removeChild(bullets.firstChild);
    items.forEach(function (item) {
      var li = document.createElement('li');
      var strong = document.createElement('strong');
      strong.textContent = item[0];
      li.appendChild(strong);
      li.appendChild(document.createTextNode(item[1]));
      bullets.appendChild(li);
    });
  }
  function activate(tab, moveFocus) {
    var key = tab.getAttribute('data-workflow-tab');
    var data = content[key];
    if (!data) return;
    tabs.forEach(function (item) {
      var active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      item.setAttribute('tabindex', active ? '0' : '-1');
    });
    panel.setAttribute('aria-labelledby', tab.id);
    eyebrow.textContent = data.number;
    heading.textContent = data.heading;
    subheading.textContent = data.subheading;
    reportKicker.textContent = data.report;
    renderBullets(data.bullets);
    if (moveFocus) tab.focus();
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { activate(tab, false); });
    tab.addEventListener('keydown', function (event) {
      var next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(tabs[next], true);
    });
  });
  activate(tabs[0], false);
}());
