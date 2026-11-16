import { lookup, reverse } from 'node:dns/promises';
import { isIP } from 'node:net';
const FEEDS = [
  { bot:'GPTBot',url:'https://openai.com/gptbot.json',fields:['ipv4Prefix','ipv6Prefix'] },
  { bot:'OAI-SearchBot',url:'https://openai.com/searchbot.json',fields:['ipv4Prefix','ipv6Prefix'] },
  { bot:'PerplexityBot',url:'https://www.perplexity.ai/perplexitybot.json',fields:['ipv4Prefix','ipv6Prefix'] },
  { bot:'ClaudeBot',url:'https://claude.com/crawling/bots.json',fields:['ipv4Prefix','ipv6Prefix'] },
  { bot:'Googlebot',url:'https://developers.google.com/crawling/ipranges/googlebot.json',fields:['ipv4Prefix','ipv6Prefix'] },
  { bot:'GoogleOther',url:'https://developers.google.com/crawling/ipranges/special-crawlers.json',fields:['ipv4Prefix','ipv6Prefix'] },
];
const TTL_MS=6*60*60*1000;
const FAILURE_RETRY_MS=5*60*1000;
const feedCache=new Map();
let refreshPromise;
function parseIPv4(ip){if(isIP(ip)!==4)return null;return ip.split('.').reduce((n,o)=>(n<<8n)|BigInt(Number(o)),0n);}
function parseIPv6(ip){
  if(isIP(ip)!==6)return null;
  let normalized=ip.toLowerCase();
  if(normalized.includes('.')){const lastColon=normalized.lastIndexOf(':'),v4=normalized.slice(lastColon+1);if(isIP(v4)===4){const n=parseIPv4(v4);normalized=normalized.slice(0,lastColon+1)+(n>>16n).toString(16)+':'+(n&65535n).toString(16);}}
  const halves=normalized.split('::');if(halves.length>2)return null;
  const side=s=>s?s.split(':').filter(Boolean).map(x=>BigInt('0x'+x)):[];
  const left=side(halves[0]),right=side(halves[1]||''),fill=8-left.length-right.length;
  if(fill<0||(halves.length===1&&fill!==0))return null;
  return [...left,...Array(fill).fill(0n),...right].reduce((n,w)=>(n<<16n)|w,0n);
}
export function cidrMatch(ip,cidr){
  const [network,bitsRaw]=String(cidr).split('/'),family=isIP(ip);
  if(!family||family!==isIP(network))return false;
  const width=family===4?32:128,bits=Number(bitsRaw??width);
  if(!Number.isInteger(bits)||bits<0||bits>width)return false;
  const a=family===4?parseIPv4(ip):parseIPv6(ip),b=family===4?parseIPv4(network):parseIPv6(network);
  return a!==null&&b!==null&&(a>>BigInt(width-bits))===(b>>BigInt(width-bits));
}
async function refreshRanges(){
  await Promise.all(FEEDS.map(async feed=>{
    const cached=feedCache.get(feed.bot);
    if(cached&&cached.expiresAt>Date.now())return;
    try{
      const response=await fetch(feed.url,{signal:AbortSignal.timeout(3500),headers:{accept:'application/json'}});
      if(!response.ok)throw new Error('feed unavailable');
      const data=await response.json();
      const prefixes=(Array.isArray(data.prefixes)?data.prefixes:[]).flatMap(entry=>feed.fields.map(field=>entry[field]).filter(value=>typeof value==='string'));
      if(!prefixes.length)throw new Error('feed has no prefixes');
      feedCache.set(feed.bot,{ranges:prefixes,available:true,expiresAt:Date.now()+TTL_MS});
    }catch{
      feedCache.set(feed.bot,{ranges:cached?.ranges||[],available:Boolean(cached?.available),expiresAt:Date.now()+FAILURE_RETRY_MS});
    }
  }));
}
async function getFeedCache(){
  const stale=FEEDS.some(feed=>!feedCache.has(feed.bot)||feedCache.get(feed.bot).expiresAt<=Date.now());
  if(stale){if(!refreshPromise)refreshPromise=refreshRanges().finally(()=>{refreshPromise=null;});await refreshPromise;}
  return feedCache;
}
export function identifyBot(userAgent){
  const ua=String(userAgent||'');
  const patterns=[['GPTBot',/\bGPTBot\b/i],['OAI-SearchBot',/\bOAI-SearchBot\b/i],['PerplexityBot',/\bPerplexityBot\b/i],['ClaudeBot',/\bClaudeBot\b/i],['Googlebot',/\bGooglebot\b/i],['GoogleOther',/\bGoogleOther\b/i]];
  return patterns.find(([,re])=>re.test(ua))?.[0]||null;
}
function suffixMatch(host,suffix){const value=String(host||'').toLowerCase().replace(/\.$/,'');return value===suffix||value.endsWith('.'+suffix);}
async function fcrdns(ip,suffixes){
  try{for(const host of await reverse(ip)){if(!suffixes.some(s=>suffixMatch(host,s)))continue;const records=await lookup(host,{all:true,verbatim:true});if(records.some(r=>r.address===ip))return true;}}catch{/* no PTR or forward confirmation */}
  return false;
}
export async function verifyCrawler({userAgent,sourceIp}){
  const bot=identifyBot(userAgent);if(!bot)return{botName:'other',status:'unverified'};
  const normalizedIp=String(sourceIp||'').toLowerCase().startsWith('::ffff:')?String(sourceIp).slice(7):sourceIp;
  if(!normalizedIp||!isIP(normalizedIp))return{botName:bot,status:'unverified'};
  const feeds=await getFeedCache(),feed=feeds.get(bot);
  if(feed?.ranges.some(cidr=>cidrMatch(normalizedIp,cidr)))return{botName:bot,status:'verified_bot',method:'published_ip_range'};
  if(bot==='Googlebot'&&await fcrdns(normalizedIp,['googlebot.com','google.com']))return{botName:bot,status:'verified_bot',method:'fcrdns'};
  return{botName:bot,status:feed?.available?'spoofed_bot':'unverified'};
}
