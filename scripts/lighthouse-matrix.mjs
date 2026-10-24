import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const roots = {
  base: process.env.BASE_URL || 'http://127.0.0.1:4174',
  pr: process.env.PR_URL || 'http://127.0.0.1:4173'
};
const routes = [
  { name: 'homepage', path: '/' },
  { name: 'scan', path: '/scan' },
  { name: 'pricing', path: '/pricing' },
  { name: 'about', path: '/about' },
  { name: 'sample-report', path: '/sample-report' },
  { name: 'dashboard', path: '/dashboard' }
];
const viewports = [
  { width: 1280, height: 900 },
  { width: 820, height: 1100 },
  { width: 390, height: 844 }
];
const chromePath = chromium.executablePath();
const artifacts = resolve('artifacts');
const scores = [];
const states = [];

await mkdir(resolve(artifacts, 'screenshots'), { recursive: true });
await mkdir(resolve(artifacts, 'lighthouse'), { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function inspectTypography(page) {
  return page.evaluate(() => {
    const heading = document.querySelector('h1, h2, h3');
    const bodyFontFamily = getComputedStyle(document.body).fontFamily;
    const headingFontFamily = heading ? getComputedStyle(heading).fontFamily : null;
    const regularLoaded = document.fonts.check('400 16px "Plus Jakarta Sans"');
    const boldLoaded = document.fonts.check('700 24px "Plus Jakarta Sans"');
    const fontResources = performance.getEntriesByType('resource')
      .filter(resource => resource.name.includes('plus-jakarta-sans') && resource.name.endsWith('.woff2'))
      .map(resource => new URL(resource.name).pathname);
    const fontVerified = bodyFontFamily.includes('Plus Jakarta Sans')
      && Boolean(headingFontFamily && headingFontFamily.includes('Plus Jakarta Sans'))
      && regularLoaded
      && boldLoaded
      && fontResources.length > 0;

    const root = getComputedStyle(document.documentElement);
    const parseColor = value => {
      const text = String(value || '').trim();
      const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        const raw = hex[1].length === 3 ? [...hex[1]].map(ch => ch + ch).join('') : hex[1];
        return [0, 2, 4].map(index => parseInt(raw.slice(index, index + 2), 16));
      }
      const rgb = text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
    };
    const luminance = rgb => {
      if (!rgb) return null;
      const channels = rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrast = (foreground, background) => {
      const a = luminance(parseColor(foreground));
      const b = luminance(parseColor(background));
      return a === null || b === null ? null : Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
    };
    const resolveCssColor = (property, kind) => {
      const probe = document.createElement('span');
      probe.style[kind] = `var(${property})`;
      document.body.append(probe);
      const resolved = getComputedStyle(probe)[kind];
      probe.remove();
      return resolved;
    };
    const dimColor = resolveCssColor('--text-dim', 'color');
    const pageBackground = resolveCssColor('--bg', 'backgroundColor');
    let cardBackground = resolveCssColor('--bg-card', 'backgroundColor');
    if (!cardBackground || /rgba?\\(\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,\\s*0\\s*\\)/i.test(cardBackground)) {
      cardBackground = getComputedStyle(document.body).backgroundColor;
    }
    const describeSelector = element => {
      const parts = [];
      let current = element;
      while (current && current !== document.body && parts.length < 6) {
        let part = current.tagName.toLowerCase();
        if (current.id) {
          part += `#${current.id}`;
        } else if (current.classList && current.classList.length) {
          part += '.' + [...current.classList].slice(0, 3).join('.');
        } else if (current.parentElement) {
          const sameTag = [...current.parentElement.children].filter(sibling => sibling.tagName === current.tagName);
          if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    };
    const textLeaves = [...document.querySelectorAll('body *')].filter(element =>
      element.children.length === 0
      && (element.innerText || element.textContent || '').trim()
      && element.getClientRects().length > 0
    );
    const textBelow12 = textLeaves.filter(element => parseFloat(getComputedStyle(element).fontSize) < 12)
      .map(element => ({ selector: describeSelector(element), tag: element.tagName.toLowerCase(), className: String(element.className || '').slice(0, 120), text: (element.innerText || element.textContent || '').trim().slice(0, 100), fontSize: getComputedStyle(element).fontSize }));
    const negativeTracking = textLeaves.filter(element => {
      const style = getComputedStyle(element);
      const size = parseFloat(style.fontSize);
      return (element.tagName.toLowerCase() === 'p' || size < 24)
        && parseFloat(style.letterSpacing) < 0;
    }).map(element => ({ selector: describeSelector(element), tag: element.tagName.toLowerCase(), className: String(element.className || '').slice(0, 120), text: (element.innerText || element.textContent || '').trim().slice(0, 100), fontSize: getComputedStyle(element).fontSize, letterSpacing: getComputedStyle(element).letterSpacing })).slice(0, 20);
    const bodyStyle = getComputedStyle(document.body);
    const bodyLineHeightRatio = Number((parseFloat(bodyStyle.lineHeight) / parseFloat(bodyStyle.fontSize)).toFixed(2));
    const headingLineHeights = [...document.querySelectorAll('h1, h2, h3, h4')].map(element => {
      const style = getComputedStyle(element);
      return { selector: describeSelector(element), tag: element.tagName.toLowerCase(), className: String(element.className || '').slice(0, 120), ratio: Number((parseFloat(style.lineHeight) / parseFloat(style.fontSize)).toFixed(2)), fontSize: style.fontSize, lineHeight: style.lineHeight };
    });
    const dimPageContrast = contrast(dimColor, pageBackground);
    const dimCardContrast = contrast(dimColor, cardBackground);
    const designGuardrails = {
      dimColor,
      dimPageContrast,
      dimCardContrast,
      contrastPassed: dimPageContrast !== null && dimCardContrast !== null && dimPageContrast >= 4.5 && dimCardContrast >= 4.5,
      bodyLineHeightRatio,
      bodyLineHeightPassed: bodyLineHeightRatio >= 1.6 && bodyLineHeightRatio <= 1.7,
      headingLineHeights,
      headingLineHeightsPassed: headingLineHeights.length > 0 && headingLineHeights.every(item => item.ratio >= 1.2 && item.ratio <= 1.3),
      textBelow12,
      negativeTracking,
      textSizePassed: textBelow12.length === 0,
      trackingPassed: negativeTracking.length === 0
    };
    return { bodyFontFamily, headingFontFamily, regularLoaded, boldLoaded, fontResources, fontVerified, designGuardrails };
  });
}

try {
  for (const [version, base] of Object.entries(roots)) {
    for (const route of routes) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const requestedUrl = base + route.path;
        let finalUrl = requestedUrl;
        try {
          await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]); });
          await page.waitForTimeout(150);
          finalUrl = page.url();
          const typography = await inspectTypography(page);
          await page.screenshot({
            path: resolve(artifacts, 'screenshots', `${version}-${route.name}-${viewport.width}.png`),
            fullPage: true,
            animations: 'disabled'
          });
          states.push({
            version,
            page: route.name,
            viewport: viewport.width,
            requestedPath: route.path,
            finalUrl,
            state: route.name === 'dashboard'
              ? 'logged-out state; no authenticated session in static preview'
              : 'static preview',
            typography
          });
        } finally {
          await page.close();
        }
      }

      for (const mode of ['mobile', 'desktop']) {
        const out = resolve(artifacts, 'lighthouse', version, `${route.name}-${mode}`);
        await mkdir(resolve(artifacts, 'lighthouse', version), { recursive: true });
        const args = [
          'lighthouse',
          base + route.path,
          '--chrome-path=' + chromePath,
          '--chrome-flags=--headless --no-sandbox',
          '--output=json',
          '--output=html',
          '--output-path=' + out,
          '--quiet'
        ];
        if (mode === 'desktop') args.push('--preset=desktop');
        execFileSync('npx', args, { stdio: 'inherit' });
        const report = JSON.parse(await readFile(out + '.report.json', 'utf8'));
        scores.push({
          version,
          page: route.name,
          mode,
          requestedPath: route.path,
          finalUrl: report.finalDisplayedUrl || report.requestedUrl,
          state: route.name === 'dashboard'
            ? 'logged-out state; no authenticated session in static preview'
            : 'static preview',
          accessibility: Math.round((report.categories.accessibility?.score ?? 0) * 100),
          bestPractices: Math.round((report.categories['best-practices']?.score ?? 0) * 100)
        });
        if (version === 'pr' && route.name === 'homepage') {
          await copyFile(out + '.report.json', resolve(artifacts, 'lighthouse', `${mode}.report.json`));
        }
      }
    }
  }

  // The normal /dashboard route above remains a logged-out test. This extra capture
  // disables JavaScript only to inspect dashboard.html's own typography before its auth redirect.
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport, javaScriptEnabled: false });
    let finalUrl = roots.pr + '/dashboard.html';
    try {
      await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]); });
      const typography = await inspectTypography(page);
      await page.screenshot({
        path: resolve(artifacts, 'screenshots', `pr-dashboard-document-font-check-${viewport.width}.png`),
        fullPage: true,
        animations: 'disabled'
      });
      finalUrl = page.url();
      states.push({
        version: 'pr',
        page: 'dashboard-document-font-check',
        viewport: viewport.width,
        requestedPath: '/dashboard.html',
        finalUrl,
        state: 'dashboard HTML rendered with JavaScript disabled only for font verification; normal /dashboard route remains logged-out',
        typography
      });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const by = new Map(scores.map(score => [score.page + '|' + score.mode + '|' + score.version, score]));
const comparisons = [];
for (const route of routes) {
  for (const mode of ['mobile', 'desktop']) {
    const before = by.get(route.name + '|' + mode + '|base');
    const after = by.get(route.name + '|' + mode + '|pr');
    comparisons.push({
      page: route.name,
      mode,
      baseAccessibility: before?.accessibility ?? null,
      prAccessibility: after?.accessibility ?? null,
      accessibilityDelta: before && after ? after.accessibility - before.accessibility : null,
      baseBestPractices: before?.bestPractices ?? null,
      prBestPractices: after?.bestPractices ?? null,
      bestPracticesDelta: before && after ? after.bestPractices - before.bestPractices : null,
      state: route.name === 'dashboard'
        ? 'logged-out state; no authenticated session in static preview'
        : 'static preview'
    });
  }
}

const typographyChecks = states.map(state => ({
  version: state.version,
  page: state.page,
  viewport: state.viewport,
  requestedPath: state.requestedPath,
  finalUrl: state.finalUrl,
  state: state.state,
  ...state.typography
}));
await writeFile(resolve(artifacts, 'lighthouse', 'summary.json'), JSON.stringify({ scores, comparisons }, null, 2) + '\n');
const typographyFailures = typographyChecks.filter(check => check.version === 'pr' && !check.fontVerified);
const designFailures = typographyChecks.filter(check => {
  if (check.version !== 'pr') return false;
  const guardrails = check.designGuardrails;
  return !guardrails
    || !guardrails.contrastPassed
    || !guardrails.bodyLineHeightPassed
    || !guardrails.headingLineHeightsPassed
    || !guardrails.textSizePassed
    || !guardrails.trackingPassed;
});
await writeFile(
  resolve(artifacts, 'lighthouse', 'typography-checks.json'),
  JSON.stringify({ checks: typographyChecks, failures: typographyFailures, designFailures }, null, 2) + '\n'
);
await writeFile(
  resolve(artifacts, 'lighthouse', 'run-metadata.json'),
  JSON.stringify({
    baseline: 'PR base branch checkout and PR head served on same GitHub Actions runner',
    pages: routes,
    screenshotWidths: viewports.map(viewport => viewport.width),
    modes: ['mobile', 'desktop'],
    lighthouseCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    comparedCategories: ['accessibility', 'best-practices'],
    dashboard: 'Logged-out state only for the six-page matrix; extra dashboard-document screenshots disable JavaScript only to inspect its own font styles without changing the normal logged-out test.',
    screenshots: states
  }, null, 2) + '\n'
);
if (typographyFailures.length) {
  console.error('Plus Jakarta Sans verification failures:', JSON.stringify(typographyFailures.map(check => ({ page: check.page, viewport: check.viewport, finalUrl: check.finalUrl, bodyFontFamily: check.bodyFontFamily, headingFontFamily: check.headingFontFamily, fontResources: check.fontResources }))));
} else {
  console.log('Plus Jakarta Sans verified for every post-migration screenshot check.');
}
if (designFailures.length) {
  console.error('Typography design guardrail failures:');
  for (const check of designFailures) {
    const g = check.designGuardrails;
    const context = `${check.page} @ ${check.viewport}px`;
    if (!g.contrastPassed) {
      console.error(`- ${context}: dim text contrast failed (color ${g.dimColor}, page ${g.dimPageContrast}, card ${g.dimCardContrast})`);
    }
    if (!g.bodyLineHeightPassed) {
      console.error(`- ${context}: body line-height ratio ${g.bodyLineHeightRatio}; expected 1.60–1.70`);
    }
    for (const item of g.headingLineHeights.filter(item => item.ratio < 1.2 || item.ratio > 1.3)) {
      console.error(`- ${context}: ${item.selector} line-height ${item.lineHeight} / font-size ${item.fontSize} = ${item.ratio}; expected 1.20–1.30`);
    }
    for (const item of g.textBelow12) {
      console.error(`- ${context}: ${item.selector} font-size ${item.fontSize}; text="${item.text.replace(/\\s+/g, ' ').slice(0, 70)}"`);
    }
    for (const item of g.negativeTracking) {
      console.error(`- ${context}: ${item.selector} letter-spacing ${item.letterSpacing}; text="${item.text.replace(/\\s+/g, ' ').slice(0, 70)}"`);
    }
  }
  process.exitCode = 1;
} else {
  console.log('Typography size, tracking, line-height and contrast guardrails passed for every post-migration screenshot check.');
}
console.log('Wrote raw Lighthouse JSON/HTML, screenshots, score comparisons, typography verification and metadata.');
