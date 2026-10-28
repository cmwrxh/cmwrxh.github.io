import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.SITE_BASE_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true});
const cases=[
 {name:'queued',body:{status:'queued',stage:'queued',queuePosition:4},expect:'You are #4 in the queue'},
 {name:'running',body:{status:'running',stage:'lighthouse',progress:45},expect:'Analyzing with Lighthouse',progress:'45% complete'},
 {name:'partial',body:{status:'running',stage:'africa',progress:75,partial:true},expect:'Partial results available'},
 {name:'failed',body:{status:'failed',stage:'failed',error:'Fixture target blocked'},expect:'Scan failed',error:'Fixture target blocked'},
 {name:'lighthouse-timeout',body:{status:'failed',stage:'failed',error:'Lighthouse timed out after its maximum run duration.'},expect:'Scan failed',error:'Lighthouse timed out'},
 {name:'unavailable',status:503,body:{error:'Worker unavailable fixture'},expect:'Service temporarily unavailable',error:'HTTP 503'},
 {name:'timeout',body:{status:'queued',stage:'queued',queuePosition:2},expect:'Scan timed out',error:'taking longer than expected'},
 {name:'private-blocked',postStatus:400,postBody:{error:'URL resolves to a private or reserved IP address.'},url:'http://127.0.0.1',expect:'Scan paused',error:'private or reserved IP'},
 {name:'queue-full',postStatus:429,postBody:{error:'Scan queue is full. Try again shortly.'},expect:'Scan queue is full',error:'queue is full'},
 {name:'rate-limited',postStatus:429,postBody:{error:'Rate limit exceeded. Try again later.'},expect:'Scan rate limit reached',error:'Rate limit exceeded'},
 {name:'turnstile-failure',turnstileFailure:true,expect:'Scan paused',error:'Complete the bot verification'}
];
try{
 for(const item of cases){const page=await browser.newPage();await page.addInitScript(()=>{localStorage.setItem('africalatency_analytics_consent_v1','rejected');localStorage.setItem('africalatency-analytics-consent','rejected')});let pollCount=0;
 await page.route('https://challenges.cloudflare.com/**',route=>route.abort());await page.route(url=>url.pathname.startsWith('/api/scan'),async route=>{const req=route.request(),u=new URL(req.url());if(u.pathname==='/api/scan'&&u.searchParams.get('config')==='1')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({turnstileSiteKey:item.turnstileFailure?'qa-site-key':''})});if(u.pathname==='/api/scan'&&req.method()==='POST'){if(item.postStatus)return route.fulfill({status:item.postStatus,contentType:'application/json',body:JSON.stringify(item.postBody||{})});return route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({jobId:'job-qa',reportId:'123e4567-e89b-12d3-a456-426614174000',queuePosition:4})});}if(u.pathname==='/api/scan/job-qa'){pollCount++;return route.fulfill({status:item.status||200,contentType:'application/json',body:JSON.stringify(item.body)});}return route.continue();});
 await page.goto(base+'/scan?scan-test=1'+(item.turnstileFailure?'&turnstile-fail=1':''),{waitUntil:'domcontentloaded'});await page.locator('#scan-url').fill(item.url||'https://example.com/');if(item.turnstileFailure)await page.waitForFunction(()=>!document.getElementById('scan-turnstile').hidden,{timeout:4000});await page.locator('#scan-run').click();
 await page.waitForFunction(({expected,selector})=>document.querySelector(selector)?.textContent.includes(expected),{expected:item.expect,selector:item.name==='queued'?'#scan-queue-count':'#scan-stage'},{timeout:4000}).catch(async()=>{const text=await page.locator('#scan-stage').textContent();assert.ok(text?.includes(item.expect),item.name+' expected stage '+item.expect+', got '+text);});
 if(item.progress)assert.ok((await page.locator('#scan-queue-count').textContent()).includes(item.progress),item.name+' progress visible');
 if(item.error)await page.waitForFunction(expected=>document.querySelector('#scan-error')?.textContent.includes(expected),item.error,{timeout:4000});
 if(['failed','lighthouse-timeout','unavailable','timeout','private-blocked','queue-full','rate-limited','turnstile-failure'].includes(item.name))assert.equal(await page.locator('#scan-run').isDisabled(),false,item.name+' leaves retry enabled');
 console.log('PASS scan state: '+item.name+' ('+pollCount+' status request(s))');await page.close();}
 const page=await browser.newPage();await page.addInitScript(()=>{localStorage.setItem('africalatency_analytics_consent_v1','rejected')});await page.goto(base+'/scan?scan-test=1',{waitUntil:'domcontentloaded'});await page.locator('#scan-url').evaluate(el=>{el.type='text'});await page.locator('#scan-url').fill('not a url');await page.locator('#scan-run').click();assert.ok((await page.locator('#scan-error').textContent()).includes('valid website URL'));console.log('PASS scan state: invalid URL');await page.close();
}finally{await browser.close();}
