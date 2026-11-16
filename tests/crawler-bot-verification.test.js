import test from 'node:test';
import assert from 'node:assert/strict';
import {cidrMatch,identifyBot} from '../lib/crawler-bot-verification.js';
test('matches IPv4 CIDR ranges',()=>{assert.equal(cidrMatch('192.0.2.44','192.0.2.0/24'),true);assert.equal(cidrMatch('192.0.3.1','192.0.2.0/24'),false);});
test('matches IPv6 CIDR ranges',()=>{assert.equal(cidrMatch('2001:db8::1','2001:db8::/32'),true);assert.equal(cidrMatch('2001:db9::1','2001:db8::/32'),false);});
test('identifies named crawler user agents without trusting them',()=>{assert.equal(identifyBot('Mozilla compatible; GPTBot/1.0'),'GPTBot');assert.equal(identifyBot('ClaudeBot'),'ClaudeBot');assert.equal(identifyBot('ordinary browser'),'');});
