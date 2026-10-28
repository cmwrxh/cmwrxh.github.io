import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.VISUAL_REVIEW_BASE_URL || 'http://127.0.0.1:4173';
const mainBase = process.env.VISUAL_REVIEW_MAIN_URL || 'http://127.0.0.1:4174';
const output = resolve('artifacts/visual-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const sizes = [
  { label: '1280', width: 1280, height: 900 },
  { label: '820', width: 820, height: 1000 },
  { label: '720', width: 720, height: 900 },
  { label: '390', width: 390, height: 844 }
];

try {
  for (const size of sizes) {
    const capture = async (url, filename) => {
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
      await page.addInitScript(() => { if (location.origin === 'http://127.0.0.1:4173') { localStorage.setItem('africalatency_analytics_consent_v1', 'rejected'); localStorage.setItem('africalatency-analytics-consent', 'rejected'); } });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await page.evaluate(() => document.fonts ? document.fonts.ready.then(() => true) : true);
      await page.waitForTimeout(350);
      const word = await page.$('[data-rotating-word]');
      if (word) await word.evaluate(el => { el.textContent = 'AI-Built'; el.setAttribute('aria-label', 'AI-Built'); });
      const buffer = await page.screenshot({ fullPage: true, animations: 'disabled' });
      const viewportBuffer = await page.screenshot({ fullPage: false, animations: 'disabled' });
      await page.close();
      await import('node:fs/promises').then(fs => Promise.all([
        fs.writeFile(resolve(output, filename), buffer),
        fs.writeFile(resolve(output, filename.replace('.png', '-viewport.png')), viewportBuffer)
      ]));
      return buffer;
    };
    const reference = await capture(base + '/docs/visual-review/reference.html', 'reference-' + size.label + '.png');
    const homepage = await capture(base + '/', 'homepage-' + size.label + '.png');
    if (['1280','820','720','390'].includes(size.label)) {
      const area=async(url,selector,name)=>{const p=await browser.newPage({viewport:{width:size.width,height:size.height},deviceScaleFactor:1});await p.addInitScript(()=>{localStorage.setItem('africalatency_analytics_consent_v1','rejected');localStorage.setItem('africalatency-analytics-consent','rejected')});await p.goto(url,{waitUntil:'networkidle',timeout:45000});const el=p.locator(selector).first();if(!await el.count())throw Error('Missing visual proof area '+selector);const b=await el.screenshot({animations:'disabled'});await import('node:fs/promises').then(fs=>fs.writeFile(resolve(output,name+'-'+size.label+'.png'),b));await p.close()};
      await area(mainBase+'/', '.al-hero', 'before-hero-dotfield');await area(base+'/', '.al-hero', 'after-hero-dotfield');await area(mainBase+'/', '.tabs-sec', 'before-four-tabs');await area(base+'/', '.al-capabilities-section', 'after-four-tabs');await area(mainBase+'/', '.regional-performance-section', 'before-africa-section');await area(base+'/', '.al-africa-map-section', 'after-africa-map');
    }
    if (size.label === '390' || size.label === '1280') {const d=await browser.newPage({viewport:{width:size.width,height:size.label==='390'?844:900},deviceScaleFactor:1});await d.goto(base+'/?dotfield-test=1',{waitUntil:'networkidle',timeout:45000});await d.waitForTimeout(1000);for(let i=1;i<=6;i++){await d.screenshot({path:resolve(output,'dotfield-drift-'+size.label+'-'+i+'.png'),animations:'disabled'});if(i<6)await d.waitForTimeout(1000)}await d.close()}
    const comparison = await browser.newPage({
      viewport: { width: size.width * 2, height: size.height },
      deviceScaleFactor: 1
    });
    await comparison.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;background:#161619;color:#fff;font:14px system-ui}.pair{display:grid;grid-template-columns:${size.width}px ${size.width}px;align-items:start;gap:0}.item{min-width:0}.label{height:32px;padding:8px 10px;background:#222;color:#fff;font-weight:600}img{display:block;width:${size.width}px;height:auto}</style></head><body><div class="pair"><div class="item"><div class="label">REFERENCE · ${size.width}px</div><img src="data:image/png;base64,${reference.toString('base64')}" alt="Reference"></div><div class="item"><div class="label">AFRICALATENCY · ${size.width}px</div><img src="data:image/png;base64,${homepage.toString('base64')}" alt="AfricaLatency"></div></div></body></html>`);
    await comparison.screenshot({ path: resolve(output, 'comparison-' + size.label + '.png'), fullPage: true, animations: 'disabled' });
    await comparison.close();

    // Compare every restored legacy section directly with main at desktop and mobile widths.
    if (size.label === '1280' || size.label === '820' || size.label === '720' || size.label === '390') {
      const sectionSelectors = [
        ['workflow-showcase', '.visibility-feature-section'],
        ['audit-baseline', '.section-band-audit'],
        ['trust', '.infrastructure-trust-section'],
        ['audience', '.section-band-audience'],
        ['faq', '.faq-section'],
        ['get-started-banner', '.get-started-banner-section']
      ];
      const branchPage = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
      const mainPage = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
      await Promise.all([
        branchPage.addInitScript(() => { localStorage.setItem('africalatency_analytics_consent_v1', 'rejected'); localStorage.setItem('africalatency-analytics-consent', 'rejected'); }),
        mainPage.addInitScript(() => { localStorage.setItem('africalatency_analytics_consent_v1', 'rejected'); localStorage.setItem('africalatency-analytics-consent', 'rejected'); })
      ]);
      await Promise.all([
        branchPage.goto(base + '/', { waitUntil: 'networkidle', timeout: 45000 }),
        mainPage.goto(mainBase + '/', { waitUntil: 'networkidle', timeout: 45000 })
      ]);
      for (const [name, selector] of sectionSelectors) {
        const branchSection = branchPage.locator(selector).first();
        const mainSection = mainPage.locator(selector).first();
        if (await branchSection.count() === 0 || await mainSection.count() === 0) {
          throw new Error('Missing restored section for baseline comparison: ' + name + ' (' + selector + ')');
        }
        const branchShot = await branchSection.screenshot({ animations: 'disabled' });
        const mainShot = await mainSection.screenshot({ animations: 'disabled' });
        await import('node:fs/promises').then(fs => Promise.all([
          fs.writeFile(resolve(output, 'branch-' + name + '-' + size.label + '.png'), branchShot),
          fs.writeFile(resolve(output, 'main-' + name + '-' + size.label + '.png'), mainShot)
        ]));
        const pair = await browser.newPage({ viewport: { width: size.width * 2, height: size.height }, deviceScaleFactor: 1 });
        await pair.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;background:#161619;color:#fff;font:14px system-ui}.pair{display:grid;grid-template-columns:${size.width}px ${size.width}px;align-items:start;gap:0}.label{padding:8px 10px;background:#222;font-weight:600}img{display:block;width:${size.width}px;height:auto}</style></head><body><div class="pair"><div><div class="label">MAIN · ${name} · ${size.width}px</div><img src="data:image/png;base64,${mainShot.toString('base64')}"></div><div><div class="label">BRANCH · ${name} · ${size.width}px</div><img src="data:image/png;base64,${branchShot.toString('base64')}"></div></div></body></html>`);
        await pair.screenshot({ path: resolve(output, 'main-vs-branch-' + name + '-' + size.label + '.png'), fullPage: true, animations: 'disabled' });
        await pair.close();
      }
      await Promise.all([branchPage.evaluate(() => window.scrollTo(0, 0)), mainPage.evaluate(() => window.scrollTo(0, 0))]);
      const topHeight = Math.max(
        await branchPage.locator('main > .al-features').evaluate(el => Math.ceil(el.getBoundingClientRect().bottom + window.scrollY)),
        await mainPage.locator('main > .al-features').evaluate(el => Math.ceil(el.getBoundingClientRect().bottom + window.scrollY))
      );
      await Promise.all([mainPage.setViewportSize({ width: size.width, height: topHeight }), branchPage.setViewportSize({ width: size.width, height: topHeight })]);
      const [mainTop, branchTop] = await Promise.all([
        mainPage.screenshot({ animations: 'disabled' }),
        branchPage.screenshot({ animations: 'disabled' })
      ]);
      const [mainFooter, branchFooter] = await Promise.all([
        mainPage.locator('.al-site-footer').screenshot({ animations: 'disabled' }),
        branchPage.locator('.al-site-footer').screenshot({ animations: 'disabled' })
      ]);
      await import('node:fs/promises').then(fs => Promise.all([
        fs.writeFile(resolve(output, 'main-home-top-' + size.label + '.png'), mainTop),
        fs.writeFile(resolve(output, 'branch-home-top-' + size.label + '.png'), branchTop),
        fs.writeFile(resolve(output, 'main-footer-' + size.label + '.png'), mainFooter),
        fs.writeFile(resolve(output, 'branch-footer-' + size.label + '.png'), branchFooter)
      ]));
      const savePair = async (name, leftLabel, leftImage, rightLabel, rightImage) => {
        const pair = await browser.newPage({ viewport: { width: size.width * 2, height: size.height }, deviceScaleFactor: 1 });
        await pair.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;background:#161619;color:#fff;font:14px system-ui}.pair{display:grid;grid-template-columns:${size.width}px ${size.width}px;align-items:start;gap:0}.label{padding:8px 10px;background:#222;font-weight:600}img{display:block;width:${size.width}px;height:auto}</style></head><body><div class="pair"><div><div class="label">${leftLabel} · ${size.width}px</div><img src="data:image/png;base64,${leftImage.toString('base64')}"></div><div><div class="label">${rightLabel} · ${size.width}px</div><img src="data:image/png;base64,${rightImage.toString('base64')}"></div></div></body></html>`);
        await pair.screenshot({ path: resolve(output, name + '-' + size.label + '.png'), fullPage: true, animations: 'disabled' });
        await pair.close();
      };
      await savePair('main-vs-branch-home-top', 'MAIN · Header, hero + first section', mainTop, 'PR · Header, hero + first section', branchTop);
      await savePair('main-vs-branch-footer', 'MAIN · Footer', mainFooter, 'PR · Footer', branchFooter);
      await branchPage.close();
      await mainPage.close();
    }
  }
} finally {
  await browser.close();
}
// Both the legacy and current consent keys are rejected for a clean visual comparison.
console.log('Captured viewport/full-page screenshots at 1280px, 820px, 720px and 390px, area before/after screenshots, unchanged-section comparisons, and six one-second DotField frames at 390px and 1280px.');
