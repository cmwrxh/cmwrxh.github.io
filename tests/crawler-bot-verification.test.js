import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cidrMatch,identifyBot,normalizeIp} from '../lib/crawler-bot-verification.js';
test('matches IPv4 CIDR ranges',()=>{assert.equal(cidrMatch('192.0.2.44','192.0.2.0/24'),true);assert.equal(cidrMatch('192.0.3.1','192.0.2.0/24'),false);});
test('matches IPv6 CIDR ranges',()=>{assert.equal(cidrMatch('2001:db8::1','2001:db8::/32'),true);assert.equal(cidrMatch('2001:db9::1','2001:db8::/32'),false);});
test('identifies named crawler user agents without trusting them',()=>{assert.equal(identifyBot('Mozilla compatible; GPTBot/1.0'),'GPTBot');assert.equal(identifyBot('ClaudeBot'),'ClaudeBot');assert.equal(identifyBot('ordinary browser'),null);assert.equal(identifyBot('Google-Extended'),null);assert.equal(identifyBot('ChatGPT-User'),null);});

test('normalizes equivalent IPv6 spellings before FCrDNS comparison',()=>{
  assert.equal(normalizeIp('2001:0db8:0000:0000:0000:0000:0000:0001'),normalizeIp('2001:db8::1'));
  assert.equal(normalizeIp('::ffff:192.0.2.1'),normalizeIp('192.0.2.1'));
  assert.equal(normalizeIp('::ffff:c000:201'),normalizeIp('192.0.2.1'));
});

import {validateCrawlerEvent} from '../api/crawler-log-ingest.js';
const validCrawlerEvent={
  idempotency_key:'event-12345678',host:'example.com',timestamp:new Date(Date.now()-1000).toISOString(),
  user_agent:'GPTBot/1.0',source_ip:'192.0.2.1',http_status:200,path:'/pricing'
};
test('requires timestamp, HTTP status, path and stable idempotency key',()=>{
  assert.equal(validateCrawlerEvent(validCrawlerEvent),null);
  for(const field of ['timestamp','http_status','path','idempotency_key']){
    const event={...validCrawlerEvent};delete event[field];
    assert.match(validateCrawlerEvent(event),/requires/);
  }
});
test('rejects invalid HTTP status and query-bearing paths',()=>{
  assert.match(validateCrawlerEvent({...validCrawlerEvent,http_status:99}),/http_status/);
  assert.match(validateCrawlerEvent({...validCrawlerEvent,path:'/pricing?token=secret'}),/path/);
});

test('versioned crawler ingestion route resolves on Express and Vercel',()=>{
  const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.ok(vercel.rewrites.some(rule=>rule.source==='/api/v1/ingest/crawler-logs'&&rule.destination==='/api/crawler-log-ingest'));
  assert.ok(server.includes("app.all('/api/v1/ingest/crawler-logs'"));
});
