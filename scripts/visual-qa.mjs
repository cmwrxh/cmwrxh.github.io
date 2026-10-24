import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.SITE_BASE_URL || 'http://127.0.0.1:4173';
const pages = ['/', '/pricing', '/scan', '/tools', '/services', '/sample-report', '/about', '/contact', '/compare', '/methodology', '/docs', '/blog', '/cases', '/login', '/signup'];
const widths = [1280, 820, 390];
const routeChecks = ['/performance-index','/data-centers','/data-centers.html','/kenya','/kenya.html'];
const results = [];
const linkStatusCache = new Map();
const allLinkResults = new Map();
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
    const environmentWarnings = [];
    page.on('pageerror', e => errors.push('pageerror: '+e.message));
    page.on('console', msg => { if (msg.type() === 'error') { const value='console: '+msg.text(); if ((route==='/login'||route==='/signup') && (/GSI_LOGGER|status of 403/.test(value))) environmentWarnings.push(value); else errors.push(value); } });
    let status = 0;
    try {
      const response = await page.goto(base+route, { waitUntil: 'networkidle', timeout: 45000 });
      status = response?.status() ?? 0;
      await page.screenshot({ path: path.join(outDir, route === '/' ? 'home' : route.slice(1), `${width}.png`), fullPage: true }).catch(async () => {
        const dir=path.join(outDir, route === '/' ? 'home' : route.slice(1)); fs.mkdirSync(dir,{recursive:true});
        await page.screenshot({path:path.join(dir,`${width}.png`),fullPage:true});
      });
      const metrics = await page.evaluate((isHome) => {
        const headers = document.querySelectorAll('[data-site-header], header.al-site-header').length;
        const toggles = document.querySelectorAll('.al-menu-toggle').length;
        const horizontal = document.documentElement.scrollWidth > window.innerWidth + 1;
        const cookie = document.querySelector('.al-cookie-banner');
        const cookieBounds = cookie ? (()=>{const r=cookie.getBoundingClientRect();return r.left>=-1&&r.right<=window.innerWidth+1&&r.width<=window.innerWidth-22;})() : true;
        const preOverflow = [...document.querySelectorAll('pre')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.right>window.innerWidth+1 || (el.scrollWidth>el.clientWidth+1 && !['auto','scroll'].includes(s.overflowX));}).map(el=>({text:(el.innerText||'').slice(0,60),right:el.getBoundingClientRect().right,overflowX:getComputedStyle(el).overflowX}));
        const sampleCards = [...document.querySelectorAll('.sample-card')].map(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopColor,fg:s.color,labels:[...el.querySelectorAll('small,strong,p')].map(n=>getComputedStyle(n).color)};});
        const sampleCardIssues = sampleCards.filter(c=>c.background!=='rgb(17, 19, 24)' || !['rgb(255, 255, 255)','rgb(194, 207, 222)'].includes(c.fg) || c.labels.some(v=>!['rgb(255, 255, 255)','rgb(194, 207, 222)'].includes(v)));
        const dot = document.querySelector('.al-sitewide-dot-canvas');
        const dotCanvasIssues = dot ? (()=>{const s=getComputedStyle(dot),issues=[];if(s.zIndex!=='-1')issues.push('z-index');if(s.pointerEvents!=='none')issues.push('pointer-events');if(!isHome&&Math.abs(Number(s.opacity)-.35)>.02)issues.push('content opacity');return issues;})() : [];
        const textCoveredByDot = dot ? [...document.querySelectorAll('h1,h2,h3,p')].some(el=>{const r=el.getBoundingClientRect();if(r.width<1||r.height<1||r.bottom<0||r.top>window.innerHeight)return false;return document.elementFromPoint(Math.min(window.innerWidth-1,Math.max(0,r.left+r.width/2)),Math.min(window.innerHeight-1,Math.max(0,r.top+r.height/2)))===dot;}) : false;
        const buttons = [...document.querySelectorAll('button,a.al-try,a.al-login,.btn,.btn-primary,.plan-cta')].filter(el => {
          const r=el.getBoundingClientRect(), s=getComputedStyle(el);
          return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none';
        }).map(el => {const s=getComputedStyle(el);let node=el,bg=s.backgroundColor;while((bg==='rgba(0, 0, 0, 0)'||bg==='transparent')&&node.parentElement){node=node.parentElement;bg=getComputedStyle(node).backgroundColor;}if(bg==='rgba(0, 0, 0, 0)'||bg==='transparent')bg=getComputedStyle(document.body).backgroundColor;if(bg==='rgba(0, 0, 0, 0)'||bg==='transparent')bg='#ffffff';return {text:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,60),fg:s.color,bg};});
        const links = [...document.querySelectorAll('[data-site-header] a[href], [data-site-footer] a[href]')].map(a=>a.href);
        return {headers,toggles,horizontal,cookieBounds,preOverflow,sampleCards,sampleCardIssues,dotCanvasIssues,textCoveredByDot,buttons,links};
      }, route === '/');
      const linkResults = await Promise.all([...new Set(metrics.links)].map(url => {
        if (!linkStatusCache.has(url)) {
          linkStatusCache.set(url, (async () => {
            if (url.startsWith('mailto:')) return {url,status:'mailto',ok:/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(url)};
            if (!url.startsWith('http://') && !url.startsWith('https://')) return {url,status:'invalid-scheme',ok:false};
            let checkUrl=url;
            try { const parsed=new URL(url); if (['africalatency.dev','www.africalatency.dev'].includes(parsed.hostname)) checkUrl=base+parsed.pathname+parsed.search; } catch {}
            try {
              const res = await page.request.get(checkUrl, { timeout: 15000, maxRedirects: 5 });
              const blockedLinkedIn = res.status()===999 && new URL(url).hostname.endsWith('linkedin.com');
              const result={url,status:res.status(),ok:(res.status()>=200&&res.status()<400)||blockedLinkedIn};
              if(blockedLinkedIn)result.warning='LinkedIn returned HTTP 999 to automated QA; URL is not confirmed broken, but status could not be independently verified.';
              allLinkResults.set(url,result); return result;
            } catch(e) { const result={url,status:0,ok:false,error:e.message};allLinkResults.set(url,result);return result; }
          })());
        }
        return linkStatusCache.get(url);
      }));
      const contrastIssues = metrics.buttons.filter(b => {const ratio=contrastRatio(b.fg,b.bg);return ratio!==null&&ratio<4.5;}).map(b=>({...b,ratio:contrastRatio(b.fg,b.bg)}));
      const row = {page:route,width,status,headerCount:metrics.headers,hamburgerCount:metrics.toggles,horizontalScroll:metrics.horizontal,cookieBounds:metrics.cookieBounds,preOverflow:metrics.preOverflow,sampleCardIssues:metrics.sampleCardIssues,dotCanvasIssues:metrics.dotCanvasIssues,textCoveredByDot:metrics.textCoveredByDot,consoleErrors:errors,environmentWarnings,linkFailures:linkResults.filter(x=>!x.ok),contrastIssues};
      row.ok = status>=200&&status<400&&row.headerCount===1&&row.hamburgerCount===1&&!row.horizontalScroll&&row.cookieBounds&&!row.preOverflow.length&&!row.sampleCardIssues.length&&!row.dotCanvasIssues.length&&!row.textCoveredByDot&&!errors.length&&!row.linkFailures.length&&!row.contrastIssues.length;
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
fs.writeFileSync(path.join(outDir,'links.json'),JSON.stringify([...allLinkResults.values()],null,2));
const markdown = ['| Page | Width | HTTP | Headers | Hamburgers | Horizontal scroll | Cookie bounds | Pre overflow | Sample cards | Dot canvas issues | Text covered | Console errors | Link failures | Contrast failures | Result |','|---|---:|---:|---:|---:|---|---|---:|---:|---:|---|---:|---:|---:|---|',...results.map(r => '| '+r.page+' | '+r.width+' | '+(r.status??0)+' | '+(r.headerCount??'-')+' | '+(r.hamburgerCount??'-')+' | '+(r.horizontalScroll?'FAIL':'OK')+' | '+(r.cookieBounds===false?'FAIL':'OK')+' | '+(r.preOverflow?.length??'-')+' | '+(r.sampleCardIssues?.length??'-')+' | '+(r.dotCanvasIssues?.length??'-')+' | '+(r.textCoveredByDot?'FAIL':'OK')+' | '+(r.consoleErrors?.length??(r.error?1:0))+' | '+(r.linkFailures?.length??'-')+' | '+(r.contrastIssues?.length??'-')+' | '+(r.ok?'OK':'ISSUE')+' |')];
fs.writeFileSync(path.join(outDir,'results.md'),markdown.join('\n'));
console.log(markdown.join('\n'));
const routeResults=[];
for(const route of routeChecks){try{const response=await fetch(base+route,{redirect:'manual'});routeResults.push({route,status:response.status,location:response.headers.get('location'),ok:response.status>=200&&response.status<400});}catch(e){routeResults.push({route,status:0,error:e.message,ok:false});}}
fs.writeFileSync(path.join(outDir,'routes.json'),JSON.stringify(routeResults,null,2));
fs.writeFileSync(path.join(outDir,'routes.md'),['| Route | HTTP | Redirect | Result |','|---|---:|---|---|',...routeResults.map(r=>`| ${r.route} | ${r.status} | ${r.location||'—'} | ${r.ok?'OK':'ISSUE'} |`)].join('\n'));
console.log('Route checks:',JSON.stringify(routeResults));
if(results.some(r=>!r.ok)||routeResults.some(r=>!r.ok)) process.exit(1);
