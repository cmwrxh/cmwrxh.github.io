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
    return { bodyFontFamily, headingFontFamily, regularLoaded, boldLoaded, fontResources, fontVerified };
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
          await page.evaluate(async () => { await document.fonts.ready; });
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
      await page.evaluate(async () => { await document.fonts.ready; });
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
await writeFile(
  resolve(artifacts, 'lighthouse', 'typography-checks.json'),
  JSON.stringify({ checks: typographyChecks, failures: typographyFailures }, null, 2) + '\n'
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
console.log('Wrote raw Lighthouse JSON/HTML, screenshots, score comparisons, typography verification and metadata.');
