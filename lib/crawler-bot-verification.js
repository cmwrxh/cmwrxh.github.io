import { lookup, reverse } from 'node:dns/promises';
import { isIP } from 'node:net';
const FEEDS = [
  { bot:'GPTBot',url:'https://openai.com/gptbot.json',fields:['ipv4Prefix','ipv6Prefix'] },
  { bot:'OAI-SearchBot',url:'https://openai.com/searchbot.json',fields:['ipv4Prefix','ipv6Prefix'] },
  { bot:'PerplexityBot',url:'https://www.perplexity.ai/perplexitybot.json',fields:['ipv4Prefix','ipv6Prefix'] },
  { bot:'Googlebot',url:'https://developers.google.com/crawling/ipranges/common-crawlers.json',fields:['ipv4Prefix','ipv6Prefix'] },
  { bot:'GoogleOther',url:'https://developers.google.com/crawling/ipranges/common-crawlers.json',fields:['ipv4Prefix','ipv6Prefix'] },
];
const TTL_MS=6*60*60*1000,FAILURE_RETRY_MS=5*60*1000,DNS_TIMEOUT_MS=1500;
const feedCache=new Map();
let refreshPromise;
function parseIPv4(ip){if(isIP(ip)!==4)return null;return ip.split('.').reduce((n,o)=>(n<<8n)|BigInt(Number(o)),0n);}
function parseIPv6(ip){
  if(isIP(ip)!==6)return null;
  let normalized=ip.toLowerCase();
  if(normalized.startsWith('::ffff:')&&isIP(normalized.slice(7))===4)return null;
  if(normalized.includes('.')){const lastColon=normalized.lastIndexOf(':'),v4=normalized.slice(lastColon+1);if(isIP(v4)===4){const n=parseIPv4(v4);normalized=normalized.slice(0,lastColon+1)+(n>>16n).toString(16)+':'+(n&65535n).toString(16);}}
  const halves=normalized.split('::');if(halves.length>2)return null;
  const side=s=>s?s.split(':').filter(Boolean).map(x=>BigInt('0x'+x)):[];
  const left=side(halves[0]),right=side(halves[1]||''),fill=8-left.length-right.length;
  if(fill<0||(halves.length===1&&fill!==0))return null;
  return [...left,...Array(fill).fill(0n),...right].reduce((n,w)=>(n<<16n)|w,0n);
}
export function normalizeIp(value){
  const ip=String(value||'').trim().toLowerCase();
  if(isIP(ip)===4)return '4:'+parseIPv4(ip).toString();
  if(isIP(ip)===6){
    if(ip.startsWith('::ffff:')&&isIP(ip.slice(7))===4)return '4:'+parseIPv4(ip.slice(7)).toString();
    const value=parseIPv6(ip);return value===null?null:'6:'+value.toString();
  }
  return null;
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
      feedCache.set(feed.bot,{ranges:prefixes,available:true,lastSuccessAt:Date.now(),expiresAt:Date.now()+TTL_MS});
    }catch{
      feedCache.set(feed.bot,{ranges:cached?.ranges||[],available:false,lastSuccessAt:cached?.lastSuccessAt||null,expiresAt:Date.now()+FAILURE_RETRY_MS});
    }
  }));
}
async function getFeedCache(){
  if(FEEDS.some(feed=>!feedCache.has(feed.bot)||feedCache.get(feed.bot).expiresAt<=Date.now())){
    if(!refreshPromise)refreshPromise=refreshRanges().finally(()=>{refreshPromise=null;});
    await refreshPromise;
  }
  return feedCache;
}
export function identifyBot(userAgent){
  const ua=String(userAgent||'');
  const patterns=[['GPTBot',/\bGPTBot\b/i],['OAI-SearchBot',/\bOAI-SearchBot\b/i],['PerplexityBot',/\bPerplexityBot\b/i],['ClaudeBot',/\bClaudeBot\b/i],['Googlebot',/\bGooglebot\b/i],['GoogleOther',/\bGoogleOther\b/i]];
  return patterns.find(([,re])=>re.test(ua))?.[0]||null;
}
function suffixMatch(host,suffix){const value=String(host||'').toLowerCase().replace(/\.$/,'');return value===suffix||value.endsWith('.'+suffix);}
function withTimeout(promise,ms){
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('DNS timeout')),ms);timer.unref?.();})]).finally(()=>clearTimeout(timer));
}
async function fcrdns(ip,suffixes){
  const check=async()=>{
    const hosts=await reverse(ip);
    for(const host of hosts){
      if(!suffixes.some(s=>suffixMatch(host,s)))continue;
      const records=await lookup(host,{all:true,verbatim:true});
      const target=normalizeIp(ip);
      if(records.some(record=>normalizeIp(record.address)===target))return true;
    }
    return false;
  };
  try{return await withTimeout(check(),DNS_TIMEOUT_MS);}
  catch{/* total reverse + forward DNS budget is strictly bounded */}
  return false;
}
export async function verifyCrawler({userAgent,sourceIp}){
  const bot=identifyBot(userAgent);if(!bot)return{botName:'other',status:'unverified'};
  const normalizedIp=String(sourceIp||'').toLowerCase().startsWith('::ffff:')?String(sourceIp).slice(7):sourceIp;
  if(!normalizedIp||!isIP(normalizedIp))return{botName:bot,status:'unverified'};
  const feeds=await getFeedCache(),feed=feeds.get(bot);
  if(feed?.available&&feed.ranges.some(cidr=>cidrMatch(normalizedIp,cidr)))return{botName:bot,status:'verified_bot',method:'published_ip_range'};
  if((bot==='Googlebot'||bot==='GoogleOther')&&await fcrdns(normalizedIp,['googlebot.com']))return{botName:bot,status:'verified_bot',method:'fcrdns'};
  return{botName:bot,status:feed?.available?'spoofed_bot':'unverified'};
}
