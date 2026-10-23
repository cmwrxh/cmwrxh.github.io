import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.PREVIEW_BASE || 'http://127.0.0.1:4173';
const outDir = 'artifacts/nav-responsive';
const pages = [
  ['pricing', '/pricing.html'],
  ['tools', '/tools.html'],
  ['scan', '/scan.html'],
  ['services', '/services.html'],
  ['about', '/about.html'],
  ['docs', '/docs.html'],
  ['monitoring', '/monitoring.html'],
  ['methodology', '/methodology.html'],
  ['sample-report', '/sample-report.html'],
  ['signup', '/signup.html'],
];
const widths = [390, 820, 1280];
const failures = [];
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, route] of pages) {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      page.on('pageerror', error => failures.push(`${name} @ ${width}px page error: ${error.message}`));
      const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
      if (!response || response.status() >= 400) {
        failures.push(`${name} @ ${width}px failed to load (${response?.status() ?? 'no response'})`);
        await page.close();
        continue;
      }
      await page.waitForTimeout(400);
      const metrics = await page.evaluate(() => {
        const toggles = [...document.querySelectorAll('button.menu-toggle, #menu-toggle')];
        const mobileMenu = document.querySelector('#site-menu, .site-menu, #mobile-menu, .al-mobile-menu');
        const pricingLink = [...document.querySelectorAll('a')].find(a => /pricing/i.test(a.textContent || '') && /pricing/i.test(a.getAttribute('href') || ''));
        return {
          toggleCount: new Set(toggles).size,
          mobileMenuFound: Boolean(mobileMenu),
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          pricingLinkFound: Boolean(pricingLink),
          navText: document.querySelector('nav')?.innerText || ''
        };
      });
      if (metrics.toggleCount > 1) failures.push(`${name} @ ${width}px has ${metrics.toggleCount} hamburger buttons`);
      if (width < 900 && metrics.documentWidth > metrics.viewportWidth + 2) failures.push(`${name} @ ${width}px horizontal overflow: ${metrics.documentWidth}px document vs ${metrics.viewportWidth}px viewport`);
      if (!metrics.pricingLinkFound) failures.push(`${name} @ ${width}px no Pricing link found`);
      if (width < 700 && metrics.toggleCount === 1) {
        await page.locator('button.menu-toggle, #menu-toggle').first().click().catch(() => failures.push(`${name} mobile hamburger was not clickable`));
        await page.waitForTimeout(150);
        const menuVisible = await page.locator('#site-menu, .site-menu, #mobile-menu, .al-mobile-menu').first().isVisible().catch(() => false);
        if (metrics.mobileMenuFound && !menuVisible) failures.push(`${name} @ ${width}px mobile menu did not become visible after click`);
      }
      if (width >= 900) {
        const trigger = page.locator('.nav-dropdown-trigger').first();
        if (await trigger.count()) {
          await trigger.click().catch(() => failures.push(`${name} desktop dropdown trigger could not be clicked`));
          const expanded = await trigger.getAttribute('aria-expanded').catch(() => null);
          if (expanded !== 'true') failures.push(`${name} @ ${width}px dropdown did not set aria-expanded=true`);
        }
      }
      await page.screenshot({ path: path.join(outDir, `${name}-${width}.png`), fullPage: true });
      console.log(JSON.stringify({ page: name, width, status: response.status(), ...metrics }));
      await page.close();
    }
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error('\nResponsive navigation failures:\n' + failures.map(x => '- ' + x).join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nResponsive navigation smoke tests passed for all 10 pages at 390px, 820px, and 1280px.');
}
