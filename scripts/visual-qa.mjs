import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.SITE_BASE_URL || 'http://127.0.0.1:4173';
const pages = ['/', '/pricing', '/scan', '/tools', '/services', '/sample-report', '/about', '/contact', '/compare', '/methodology', '/docs', '/blog', '/cases', '/login', '/signup'];
const widths = [1280, 820, 390];
const results = [];
const browser = await chromium.launch({ headless: true });
const outDir = 'artifacts/site-shell';
fs.mkdirSync(outDir, { recursive: true });
const contrastRatio = (fg, bg) => {
  const rgb = (s) => { const m = s.match(/[\d.]+/g); if (!m || m.length < 3) return null; return m.slice(0,3).map(Number).map(v => {v/=255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}); };
  const luminance = (s) => { const c=rgb(s); return c ? .2126*c[0]+.7152*c[1]+.0722*c[2] : null; };
  const a=luminance(fg), b=luminance(bg); if(a===null||b===null)return null;
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
};
for (const route of pages) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: '+e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push('console: '+msg.text()); });
    let status = 0;
    try {
      const response = await page.goto(base+route, { waitUntil: 'networkidle', timeout: 45000 });
      status = response?.status() ?? 0;
      await page.screenshot({ path: path.join(outDir, route === '/' ? 'home' : route.slice(1), `${width}.png`), fullPage: true }).catch(async () => {
        const dir=path.join(outDir, route === '/' ? 'home' : route.slice(1)); fs.mkdirSync(dir,{recursive:true});
        await page.screenshot({path:path.join(dir,`${width}.png`),fullPage:true});
      });
      const metrics = await page.evaluate(() => {
        const headers = document.querySelectorAll('[data-site-header], header.al-site-header').length;
        const toggles = document.querySelectorAll('.al-menu-toggle').length;
        const horizontal = document.documentElement.scrollWidth > window.innerWidth + 1;
        const buttons = [...document.querySelectorAll('button,a.al-try,a.al-login,.btn,.btn-primary,.plan-cta')].filter(el => {
          const r=el.getBoundingClientRect(), s=getComputedStyle(el);
          return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none';
        }).map(el => {const s=getComputedStyle(el);return {text:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,60),fg:s.color,bg:s.backgroundColor};});
        const links = [...document.querySelectorAll('[data-site-header] a[href], [data-site-footer] a[href]')].map(a=>a.href);
        return {headers,toggles,horizontal,buttons,links};
      });
      const links = [...new Set(metrics.links)].map(async url => {
        try { const res = await page.request.get(url, { timeout: 15000, maxRedirects: 5 }); return {url,status:res.status(),ok:res.status()>=200&&res.status()<400}; }
        catch(e) { return {url,status:0,ok:false,error:e.message}; }
      });
      const linkResults = await Promise.all(links);
      const contrastIssues = metrics.buttons.filter(b => {const ratio=contrastRatio(b.fg,b.bg);return ratio!==null&&ratio<4.5;}).map(b=>({...b,ratio:contrastRatio(b.fg,b.bg)}));
      const row = {page:route,width,status,headerCount:metrics.headers,hamburgerCount:metrics.toggles,horizontalScroll:metrics.horizontal,consoleErrors:errors,linkFailures:linkResults.filter(x=>!x.ok),contrastIssues};
      row.ok = status>=200&&status<400&&row.headerCount===1&&row.hamburgerCount===1&&!row.horizontalScroll&&!errors.length&&!row.linkFailures.length&&!row.contrastIssues.length;
      results.push(row);
      await page.close();
    } catch(e) {
      results.push({page:route,width,status,error:e.message,ok:false});
      await page.close();
    }
  }
}
await browser.close();
fs.writeFileSync(path.join(outDir,'results.json'),JSON.stringify(results,null,2));
const markdown = ['| Page | Width | HTTP | Headers | Hamburgers | Horizontal scroll | Console errors | Link failures | Contrast failures | Result |','|---|---:|---:|---:|---:|---|---:|---:|---:|---|',...results.map(r=>`| ${r.page} | ${r.width} | ${r.status??0} | ${r.headerCount??'-'} | ${r.hamburgerCount??'-'} | ${r.horizontalScroll?'FAIL':'OK'} | ${r.consoleErrors?.length??(r.error?1:0)} | ${r.linkFailures?.length??'-'} | ${r.contrastIssues?.length??'-'} | ${r.ok?'OK':'ISSUE'} |`)];
fs.writeFileSync(path.join(outDir,'results.md'),markdown.join('\n'));
console.log(markdown.join('\n'));
if(results.some(r=>!r.ok)) process.exit(1);
