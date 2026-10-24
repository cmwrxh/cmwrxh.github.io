import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.PREVIEW_BASE || 'http://127.0.0.1:4173';
const baselineBase = process.env.BASELINE_BASE || 'http://127.0.0.1:4174';
const outDir = 'artifacts/nav-responsive';
const pages = [
  ['homepage', '/', true],
  ['pricing', '/pricing.html'],
  ['tools', '/tools.html'],
  ['scan', '/scan.html'],
  ['services', '/services.html'],
  ['docs', '/docs.html'],
  ['monitoring', '/monitoring.html'],
];
const widths = [390, 820, 1280];
const failures = [];
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, route, isHomepage = false] of pages) {
    for (const width of widths) {
      for (const [version, origin] of [['before', baselineBase], ['after', base]]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
        page.on('pageerror', error => {
          if (version === 'after') failures.push(`${name} @ ${width}px page error: ${error.message}`);
        });
        const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
        if (!response || response.status() >= 400) {
          if (version === 'after') failures.push(`${name} @ ${width}px failed to load (${response?.status() ?? 'no response'})`);
          await page.close();
          continue;
        }
        await page.waitForTimeout(500);
        if (isHomepage) {
          // Capture lower sections separately without the hero; no source files are changed.
          await page.evaluate(() => {
            const hero = document.querySelector('main > section:first-child');
            if (hero) hero.setAttribute('data-review-hidden-hero', 'true');
            if (hero) hero.style.setProperty('display', 'none', 'important');
          });
          await page.screenshot({ path: path.join(outDir, `${version}-homepage-lower-${width}.png`), fullPage: true });
          await page.evaluate(() => {
            const hero = document.querySelector('[data-review-hidden-hero="true"]');
            if (hero) { hero.style.removeProperty('display'); hero.removeAttribute('data-review-hidden-hero'); }
          });
        }
        const metrics = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          toggleCount: new Set(document.querySelectorAll('button.menu-toggle, #menu-toggle')).size,
          menuCount: document.querySelectorAll('#site-menu, .site-menu').length,
          pricingLinkFound: [...document.querySelectorAll('a')].some(a => /pricing/i.test(a.textContent || '') && /pricing/i.test(a.getAttribute('href') || '')),
        }));
        if (version === 'after' && !isHomepage) {
          if (metrics.toggleCount > 1) failures.push(`${name} @ ${width}px has ${metrics.toggleCount} hamburger buttons`);
          if (width < 900 && metrics.documentWidth > metrics.viewportWidth + 2) failures.push(`${name} @ ${width}px horizontal overflow: ${metrics.documentWidth}px document vs ${metrics.viewportWidth}px viewport`);
          if (!metrics.pricingLinkFound) failures.push(`${name} @ ${width}px no Pricing link found`);
          if (width < 700 && metrics.toggleCount === 1) {
            await page.locator('button.menu-toggle, #menu-toggle').first().click().catch(() => failures.push(`${name} mobile hamburger was not clickable`));
            await page.waitForTimeout(150);
            const menuVisible = await page.locator('#site-menu, .site-menu').first().isVisible().catch(() => false);
            if (metrics.menuCount && !menuVisible) failures.push(`${name} @ ${width}px mobile menu did not become visible after click`);
            await page.locator('#menu-close').first().click().catch(() => {});
          }
          if (width >= 900) {
            const trigger = page.locator('.nav-dropdown-trigger').first();
            if (await trigger.count()) {
              await trigger.click().catch(() => failures.push(`${name} desktop dropdown trigger could not be clicked`));
              if (await trigger.getAttribute('aria-expanded').catch(() => null) !== 'true') failures.push(`${name} @ ${width}px dropdown did not set aria-expanded=true`);
              const toolsGroup = await page.locator('.nav-dropdown-menu').first().innerText().catch(() => '');
              if (!/Tools/i.test(toolsGroup)) failures.push(`${name} @ ${width}px Resources dropdown missing Tools group`);
            }
          }
        }
        await page.screenshot({ path: path.join(outDir, `${version}-${name}-${width}.png`), fullPage: true });
        console.log(JSON.stringify({ version, page: name, width, status: response.status(), ...metrics }));
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error('\nResponsive review failures:\n' + failures.map(x => '- ' + x).join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nResponsive browser review passed for homepage lower sections and six requested pages at 390px, 820px, and 1280px. Before/after screenshots saved.');
}
