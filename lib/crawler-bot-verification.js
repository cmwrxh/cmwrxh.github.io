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
let cache={expiresAt:0,ranges:[]},refreshPromise;
function parseIPv4(ip){if(isIP(ip)!==4)return null;return ip.split('.').reduce((n,o)=>(n<<8n)|BigInt(Number(o)),0n);}
function parseIPv6(ip){
  if(isIP(ip)!==6)return null;
  let normalized=ip.toLowerCase();\n  if(normalized.includes('.') ){ const lastColon=normalized.lastIndexOf(':'); const v4=normalized.slice(lastColon+1); if(isIP(v4)===4){const n=parseIPv4(v4); normalized=normalized.slice(0,lastColon+1)+((n>>16n).toString(16))+':'+(n&65535n).toString(16);}}\n  const halves=normalized.split('::'); if(halves.length>2)return null;
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
  const ranges=[];
  await Promise.all(FEEDS.map(async feed=>{
    try{
      const response=await fetch(feed.url,{signal:AbortSignal.timeout(3500),headers:{accept:'application/json'}});
      if(!response.ok)return;
      const data=await response.json();
      for(const entry of Array.isArray(data.prefixes)?data.prefixes:[])for(const field of feed.fields)if(typeof entry[field]==='string')ranges.push({bot:feed.bot,cidr:entry[field]});
    }catch{/* preserve last good cache */}
  }));
  if(ranges.length)cache={ranges,expiresAt:Date.now()+TTL_MS};
  else if(!cache.ranges.length)cache.expiresAt=Date.now()+300000;
  return cache.ranges;
}
async function getRanges(){if(cache.expiresAt>Date.now())return cache.ranges;if(!refreshPromise)refreshPromise=refreshRanges().finally(()=>{refreshPromise=null;});return refreshPromise;}
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
  if(!sourceIp||!isIP(sourceIp))return{botName:bot,status:'unverified'};
  const ranges=await getRanges();
  if(ranges.some(item=>item.bot===bot&&cidrMatch(sourceIp,item.cidr)))return{botName:bot,status:'verified_bot',method:'published_ip_range'};
  if(bot==='Googlebot'&&await fcrdns(sourceIp,['googlebot.com','google.com']))return{botName:bot,status:'verified_bot',method:'fcrdns'};
  if(bot==='ClaudeBot'&&await fcrdns(sourceIp,['anthropic.com','claude.com']))return{botName:bot,status:'verified_bot',method:'fcrdns'};
  const hasFeed=FEEDS.some(feed=>feed.bot===bot);
  return{botName:bot,status:hasFeed?'spoofed_bot':'unverified'};
}
