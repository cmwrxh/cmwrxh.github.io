import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.SITE_BASE_URL || 'http://127.0.0.1:4173';
const reportFixtureRoute='/reports/123e4567-e89b-12d3-a456-426614174000';
const reportFixture={jobId:'fixture-job',reportId:'123e4567-e89b-12d3-a456-426614174000',url:'https://example.com/',device:'mobile',status:'completed',stage:'completed',progress:100,createdAt:'2026-10-25T08:00:00.000Z',completedAt:'2026-10-25T08:00:02.000Z',lighthouseVersion:'12.8.2',chromeVersion:'138',summary:{grade:'B',performance:82,structure:86,metrics:{fcpMs:1700,lcpMs:2400,cls:0.08,tbtMs:180,ttfbMs:700,speedIndexMs:3200},auditList:[],opportunities:[]},fullReport:{metrics:{speedIndexMs:3200},auditList:[],opportunities:[],resourceDetails:[]},screenshotUrl:'https://fixture.invalid/screenshot.jpg',filmstrip:Array.from({length:3},(_,i)=>({timing_ms:i*500,url:'https://fixture.invalid/frame-'+i+'.jpg'})),africaLatency:[],locked:true};
const pages = ['/', '/pricing', '/scan', '/tools', '/services', '/sample-report', '/about', '/contact', '/compare', '/methodology', '/docs', '/blog', '/cases', '/login', '/signup', '/locations', '/locations/egypt', '/locations/morocco', '/locations/nigeria', '/locations/ghana', '/locations/senegal', '/locations/kenya', '/locations/tanzania', '/locations/uganda', '/locations/south-africa', '/audit-checkout', '/sitespeed-checkout', '/why-africa-latency', reportFixtureRoute];
const widths = [1280, 820, 720, 390, 320];
const routeChecks = ['/performance-index','/data-centers','/data-centers.html','/kenya','/kenya.html','/locations/egypt','/locations/morocco','/locations/nigeria','/locations/ghana','/locations/senegal','/locations/kenya','/locations/tanzania','/locations/uganda','/locations/south-africa','/audit-checkout','/sitespeed-checkout'];
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
    page.on('console', msg => { if (msg.type() === 'error') { const value='console: '+msg.text(); if ((route==='/login'||route==='/signup') && (/GSI_LOGGER|status of 403/.test(value))) environmentWarnings.push(value); else if(route===reportFixtureRoute&&(/fixture\.invalid|Failed to load resource|net::ERR_FAILED/.test(value))) environmentWarnings.push(value); else errors.push(value); } });
    let status = 0;
    try {
      if(route===reportFixtureRoute){await page.route('**/api/scan/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reportFixture)}));await page.route('https://fixture.invalid/**',route=>route.abort('failed'));await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',route=>route.fulfill({status:200,contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'}));}
      const response = await page.goto(base+route, { waitUntil: 'networkidle', timeout: 45000 });
      if(route===reportFixtureRoute){await page.waitForSelector('#rd-app:not([hidden])',{timeout:10000});await page.evaluate(()=>{const banner=document.createElement('div');banner.textContent='VISUAL QA FIXTURE · MOCKED SCAN DATA';banner.dataset.qaFixture='true';banner.style.cssText='background:#273244;color:#ffffff;border-bottom:1px solid #52627a;padding:8px 14px;font:700 12px/1.4 sans-serif;letter-spacing:.06em;text-align:center';document.body.prepend(banner);});await page.locator('#rd-filmstrip img').evaluateAll(imgs=>imgs.forEach(img=>{img.loading='eager';}));await page.waitForFunction(()=>[...document.querySelectorAll('[data-filmstrip-empty]')].some(el=>el.textContent.includes('No filmstrip frames were returned for this scan.')),null,{timeout:8000}).catch(()=>{});}
      status = response?.status() ?? 0;
      await page.screenshot({ path: path.join(outDir, route === '/' ? 'home' : route.slice(1), `${width}.png`), fullPage: true }).catch(async () => {
        const dir=path.join(outDir, route === '/' ? 'home' : route.slice(1)); fs.mkdirSync(dir,{recursive:true});
        await page.screenshot({path:path.join(dir,`${width}.png`),fullPage:true});
      });
      const metrics = await page.evaluate(({isHome, routePath}) => {
        const whiteSurfaces = [...document.querySelectorAll('body *')].filter(el => {
          const r=el.getBoundingClientRect(), s=getComputedStyle(el);
          if(r.width<200||r.height<60||s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false;
          const bg=s.backgroundColor.match(/[\d.]+/g);
          return bg && bg.length>=3 && bg.slice(0,3).map(Number).every(v=>v>=245) && (bg.length<4 || Number(bg[3])>=0.8) && s.backgroundImage==='none';
        }).map(el=>({tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className:'',width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height)}));
        const headers = document.querySelectorAll('[data-site-header], header.al-site-header').length;
        const reportDashboard = routePath.startsWith('/reports/');
        const reportLoaded = !reportDashboard || (!document.querySelector('#rd-app')?.hidden && document.querySelectorAll('[data-panel]').length>0);
        const reportEmptyFallback = !reportDashboard || [...document.querySelectorAll('[data-filmstrip-empty]')].some(el=>el.textContent.includes('No filmstrip frames were returned for this scan.'));
        const reportReturnPathValid = !reportDashboard || document.querySelector('#rd-video a[href]')?.getAttribute('href') === '/login?next=%2Freports%2F123e4567-e89b-12d3-a456-426614174000';
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const effectiveBg = bodyBg === 'rgba(0, 0, 0, 0)' ? '#ffffff' : bodyBg;
        const bgChannels = effectiveBg.match(/[\d.]+/g);
        const whiteSurface = !['/compare','/cases'].includes(routePath) || !Boolean(bgChannels && bgChannels.slice(0,3).map(Number).every(v => v >= 200));
        const toggles = document.querySelectorAll('.al-menu-toggle,.al-mobile-toggle').length;
        const horizontal = document.documentElement.scrollWidth > window.innerWidth + 1;
        const overflowNodes = horizontal ? [...document.querySelectorAll('body *')].map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {tag:el.tagName.toLowerCase(),id:el.id||'',className:typeof el.className==='string'?el.className:'',left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),position:s.position,overflowX:s.overflowX};}).filter(x=>x.right>window.innerWidth+1||x.left< -1).filter(x=>x.tag!=='script'&&x.tag!=='style').sort((a,b)=>b.right-a.right).slice(0,12):[];
        const cookie = document.querySelector('.al-cookie-banner');
        const cookieBounds = cookie ? (()=>{const r=cookie.getBoundingClientRect();return r.left>=-1&&r.right<=window.innerWidth+1&&r.width<=window.innerWidth-22;})() : true;
        const preOverflow = [...document.querySelectorAll('pre')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.right>window.innerWidth+1 || (el.scrollWidth>el.clientWidth+1 && !['auto','scroll'].includes(s.overflowX));}).map(el=>({text:(el.innerText||'').slice(0,60),right:el.getBoundingClientRect().right,overflowX:getComputedStyle(el).overflowX}));
        const sampleCards = [...document.querySelectorAll('.sample-card')].map(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopColor,fg:s.color,labels:[...el.querySelectorAll('small,strong,p')].map(n=>getComputedStyle(n).color)};});
        const sampleCardIssues = sampleCards.filter(c=>c.background!=='rgb(17, 19, 24)' || !['rgb(255, 255, 255)','rgb(194, 207, 222)'].includes(c.fg) || c.labels.some(v=>!['rgb(255, 255, 255)','rgb(194, 207, 222)'].includes(v)));
        const dot = document.querySelector('.al-sitewide-dot-canvas');
        const dotCanvasIssues = dot ? (()=>{const s=getComputedStyle(dot),issues=[];if(s.zIndex!=='-1')issues.push('z-index');if(s.pointerEvents!=='none')issues.push('pointer-events');if(!isHome&&Math.abs(Number(s.opacity)-.35)>.02)issues.push('content opacity');return issues;})() : [];
        const textCoveredByDot = dot ? [...document.querySelectorAll('h1,h2,h3,p')].some(el=>{const r=el.getBoundingClientRect();if(r.width<1||r.height<1||r.bottom<0||r.top>window.innerHeight)return false;return document.elementFromPoint(Math.min(window.innerWidth-1,Math.max(0,r.left+r.width/2)),Math.min(window.innerHeight-1,Math.max(0,r.top+r.height/2)))===dot;}) : false;
        const buttons = [...document.querySelectorAll('a,button,[role="button"]')].filter(el => {
          const r=el.getBoundingClientRect(), s=getComputedStyle(el);
          return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none';
        }).map(el => {
          const s=getComputedStyle(el), own=s.backgroundColor;
          const rgba=(value)=>{const v=value.match(/[\d.]+/g);return v&&v.length>=3?{r:Number(v[0]),g:Number(v[1]),b:Number(v[2]),a:v.length>3?Number(v[3]):1}:null;};
          const blend=(front,back)=>{const a=front.a+(back.a||1)*(1-front.a);return {r:Math.round((front.r*front.a+back.r*(back.a||1)*(1-front.a))/a),g:Math.round((front.g*front.a+back.g*(back.a||1)*(1-front.a))/a),b:Math.round((front.b*front.a+back.b*(back.a||1)*(1-front.a))/a),a};};
          const ownRgb=rgba(own);
          if(!ownRgb || ownRgb.a===0) return null;
          let composite=ownRgb, ancestor=el.parentElement;
          while(composite.a<.999&&ancestor){const ab=rgba(getComputedStyle(ancestor).backgroundColor);if(ab&&ab.a>0)composite=blend(composite,ab);ancestor=ancestor.parentElement;}
          if(composite.a<.999)composite=blend(composite,{r:255,g:255,b:255,a:1});
          const bg='rgb('+composite.r+', '+composite.g+', '+composite.b+')';
          return {tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className:'',text:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,60),fg:s.color,bg};
        }).filter(Boolean);
        const links = [...document.querySelectorAll('[data-site-header] a[href], [data-site-footer] a[href]')].map(a=>a.href);
        return {headers,whiteSurfaces,toggles,horizontal,overflowNodes,cookieBounds,preOverflow,sampleCards,sampleCardIssues,dotCanvasIssues,textCoveredByDot,buttons,links,whiteSurface,reportLoaded,reportEmptyFallback,reportReturnPathValid};
      }, { isHome: route === '/', routePath: route });
      const linkResults = await Promise.all([...new Set(metrics.links)].map(url => {
        if (!linkStatusCache.has(url)) {
          linkStatusCache.set(url, (async () => {
            if (url.startsWith('mailto:')) { const result={url,status:'mailto',ok:/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(url)};allLinkResults.set(url,result);return result; }
            if (!url.startsWith('http://') && !url.startsWith('https://')) { const result={url,status:'invalid-scheme',ok:false};allLinkResults.set(url,result);return result; }
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
      const contrastIssues = metrics.buttons.filter(b => {const ratio=contrastRatio(b.fg,b.bg);return ratio!==null&&ratio<4.5;}).map(b=>({...b,ratio:Number(contrastRatio(b.fg,b.bg).toFixed(2))}));
      const row = {page:route,width,status,headerCount:metrics.headers,reportLoaded:metrics.reportLoaded,reportEmptyFallback:metrics.reportEmptyFallback,reportReturnPathValid:metrics.reportReturnPathValid,hamburgerCount:metrics.toggles,horizontalScroll:metrics.horizontal,overflowNodes:metrics.overflowNodes,cookieBounds:metrics.cookieBounds,preOverflow:metrics.preOverflow,sampleCardIssues:metrics.sampleCardIssues,dotCanvasIssues:metrics.dotCanvasIssues,textCoveredByDot:metrics.textCoveredByDot,whiteSurface:metrics.whiteSurface,whiteSurfaces:metrics.whiteSurfaces,consoleErrors:errors,environmentWarnings,linkFailures:linkResults.filter(x=>!x.ok),contrastTargets:metrics.buttons.length,contrastIssues};
      row.ok = status>=200&&status<400&&(route.startsWith('/reports/')?(row.reportLoaded&&row.reportEmptyFallback):row.headerCount===1&&row.hamburgerCount===1)&&!row.horizontalScroll&&row.cookieBounds&&!row.preOverflow.length&&!row.sampleCardIssues.length&&!row.dotCanvasIssues.length&&!row.textCoveredByDot&&row.whiteSurface&&!row.whiteSurfaces.length&&!errors.length&&!row.linkFailures.length&&row.contrastTargets>0&&!row.contrastIssues.length;
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
fs.writeFileSync(path.join(outDir,'links.md'),['| URL | Status | Result / note |','|---|---:|---|',...[...allLinkResults.values()].map(r=>'| '+r.url+' | '+r.status+' | '+(r.warning|| (r.ok?'OK':'ISSUE'))+' |')].join('\n'));
const markdown = ['| Page | Width | HTTP | Headers | Hamburgers | Horizontal scroll | Cookie bounds | Pre overflow | Sample cards | Dot canvas issues | Text covered | White surface | Large white surfaces | Console errors | Link failures | Contrast targets | Contrast failures | Result |','|---|---:|---:|---:|---|---|---:|---:|---:|---|---:|---|---:|---:|---:|---:|---:|---|',...results.map(r => '| '+r.page+' | '+r.width+' | '+(r.status??0)+' | '+(r.headerCount??'-')+' | '+(r.hamburgerCount??'-')+' | '+(r.horizontalScroll?'FAIL':'OK')+' | '+(r.cookieBounds===false?'FAIL':'OK')+' | '+(r.preOverflow?.length??'-')+' | '+(r.sampleCardIssues?.length??'-')+' | '+(r.dotCanvasIssues?.length??'-')+' | '+(r.textCoveredByDot?'FAIL':'OK')+' | '+(r.whiteSurface?'PASS':'FAIL')+' | '+(r.whiteSurfaces?.length??'-')+' | '+(r.consoleErrors?.length??(r.error?1:0))+' | '+(r.linkFailures?.length??'-')+' | '+(r.contrastTargets??'-')+' | '+(r.contrastIssues?.length??'-')+' | '+(r.ok?'OK':'ISSUE')+' |')];
console.log(markdown.join('\n'));
const contrastDetails = ['| Page | Width | Visible links/buttons with non-transparent backgrounds | Failures below 4.5:1 | Details |','|---|---:|---:|---:|---|',...results.map(r => '| '+r.page+' | '+r.width+' | '+(r.contrastTargets??'-')+' | '+(r.contrastIssues?.length??'-')+' | '+((r.contrastIssues||[]).map(x=>String(x.ratio)+':1 '+x.tag+'.'+String(x.className||'').trim().replace(/\\s+/g,'.')+' "'+x.text+'"').join('; ')||'None')+' |')];
fs.writeFileSync(path.join(outDir,'contrast.md'),contrastDetails.join('\n'));
const contrastRoutes = new Set(['/','/pricing','/why-africa-latency','/locations','/compare','/cases','/about','/tools']);
const contrastWidths = new Set([1280,720,390]);
const contrastRows = results.filter(r => contrastRoutes.has(r.page) && contrastWidths.has(r.width));
const contrastMarkdown = [
  '| Route | Viewport | Visible buttons/links checked | Failures below 4.5:1 | Result |',
  '|---|---:|---:|---:|---|',
  ...contrastRows.map(r => '| '+(r.page)+' | '+r.width+'px | '+(r.contrastTargets??'-')+' | '+(r.contrastIssues?.length??'-')+' | '+(r.contrastIssues?.length===0?'PASS':'FAIL')+' |')
];
fs.writeFileSync(path.join(outDir,'all-buttons-contrast.md'),contrastMarkdown.join('\n'));
console.log('Requested all-buttons contrast matrix:');
console.log(contrastMarkdown.join('\\n'));
if (contrastRows.length !== 24 || contrastRows.some(r => !r.contrastIssues || r.contrastIssues.length > 0)) {
  console.error('All-buttons contrast check failed or did not cover all 24 requested route/viewport combinations.');
  process.exitCode = 1;
}

console.log('Contrast matrix written to artifacts/site-shell/contrast.md');
const routeResults=[];
for(const route of routeChecks){try{const response=await fetch(base+route,{redirect:'manual'});routeResults.push({route,status:response.status,location:response.headers.get('location'),ok:response.status>=200&&response.status<400});}catch(e){routeResults.push({route,status:0,error:e.message,ok:false});}}
fs.writeFileSync(path.join(outDir,'routes.json'),JSON.stringify(routeResults,null,2));
fs.writeFileSync(path.join(outDir,'routes.md'),['| Route | HTTP | Redirect | Result |','|---|---:|---|---|',...routeResults.map(r=>`| ${r.route} | ${r.status} | ${r.location||'—'} | ${r.ok?'OK':'ISSUE'} |`)].join('\n'));
console.log('Route checks:',JSON.stringify(routeResults));
const reportRows=results.filter(r=>r.page===reportFixtureRoute);
if(reportRows.length!==5||reportRows.some(r=>!r.ok||r.horizontalScroll||!r.reportLoaded||!r.reportEmptyFallback||r.whiteSurfaces?.length||r.contrastIssues?.length)) {console.error('Fixture report visual QA failed: expected 5 widths with no horizontal overflow, contrast failures, white surfaces, and with filmstrip fallback.');process.exitCode=1;}
if(results.some(r=>!r.ok)||routeResults.some(r=>!r.ok)) process.exit(1);
