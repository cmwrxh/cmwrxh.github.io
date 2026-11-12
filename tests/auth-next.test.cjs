const test=require('node:test');const assert=require('node:assert/strict');const {getSafeNext,buildAuthTabHref}=require('../js/auth-next.js');const id='123e4567-e89b-12d3-a456-426614174000';const accepted=[['/dashboard','/dashboard'],['/dashboard.html','/dashboard.html'],['/reports/'+id,'/reports/'+id],['/report?id='+id,'/report?id='+id],['/report.html?id='+id,'/report.html?id='+id],['/scan','/scan'],['/scan?url=example.com','/scan?url=example.com'],['/scan?url=https%3A%2F%2Fexample.com%2Fpath','/scan?url=https%3A%2F%2Fexample.com%2Fpath'],['/scan?url=https%3A%2F%2Fevil.com','/scan?url=https%3A%2F%2Fevil.com'],['/pricing','/pricing']];for(const [input,expected] of accepted)test('accepts '+input,()=>assert.equal(getSafeNext(input),expected));const rejected=['//evil.com','https://evil.com','javascript:alert(1)','/\\\\evil.com','/%2Fevil.com','/%5cevil.com','/scan?url=%2F%2Fevil.com','/scan?url=%5C%5Cevil.com','/dashboard%00','/dashboard%0A','/reports/not-a-uuid','/reports/'+id+'?x=1','/report?id=bad','/report.html?id='+id+'&next=//evil.com','/pricing?x=1','/dashboard/extra','/scan?url=javascript%3Aalert(1)','/scan?url=foo&next=//evil.com','/scan?url=%0d%0aHeader'];for(const input of rejected)test('rejects '+input,()=>assert.equal(getSafeNext(input),'/dashboard'));test('rejects raw controls',()=>assert.equal(getSafeNext('/scan?url=foo\nbar'),'/dashboard'));
test('auth tabs preserve an allowed next path in both directions',()=>{const next='/reports/123e4567-e89b-12d3-a456-426614174000';assert.equal(buildAuthTabHref('/login',next),'/login?next=%2Freports%2F123e4567-e89b-12d3-a456-426614174000');assert.equal(buildAuthTabHref('/signup',next),'/signup?next=%2Freports%2F123e4567-e89b-12d3-a456-426614174000')});
test('auth tab helper sanitizes unsafe next paths',()=>assert.equal(buildAuthTabHref('/login','//evil.com'),'/login?next=%2Fdashboard'));

const fs=require('node:fs');
const path=require('node:path');
const loginHtml=fs.readFileSync(path.join(__dirname,'..','login.html'),'utf8');
const signupHtml=fs.readFileSync(path.join(__dirname,'..','signup.html'),'utf8');
test('login and signup use the app host as the canonical auth origin',()=>{
  for(const html of [loginHtml,signupHtml]){
    assert.match(html,/https:\/\/app\.africalatency\.dev/);
    assert.match(html,/africalatency\.dev.*www\.africalatency\.dev/s);
  }
});
test('Google login uses Supabase OAuth redirect rather than a client-side ID-token exchange',()=>{
  for(const html of [loginHtml,signupHtml]){
    assert.match(html,/signInWithOAuth\(\{\s*provider:\s*'google'/);
    assert.match(html,/redirectTo:\s*(?:window\.)?location\.origin\s*\+\s*'\/login'/);
    assert.doesNotMatch(html,/signInWithIdToken|accounts\.google\.com\/gsi\/client/);
  }
});
