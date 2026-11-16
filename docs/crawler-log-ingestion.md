# AfricaLatency AI crawler log ingestion

Endpoint: `POST https://africalatency.dev/api/v1/ingest/crawler-logs`  
Authentication: `Authorization: Bearer clg_live_<secret>`  
Content type: `application/json`

Send 1–100 events per batch (maximum request body 256 KiB). Every event must include `host`, `timestamp` (ISO-8601), `user_agent`, `source_ip`, integer `http_status` (100–599), `path` (absolute path only, no query or fragment), and a stable `idempotency_key` (8–128 safe characters). Optional fields: `response_time_ms`, `bytes_served`, `country_edge_code`.

The idempotency key must remain unchanged when retrying the same log event. Generate it once when the event is first captured (prefer a durable log offset/event ID or UUID) and persist it in the queue. Events are unique per project and duplicate retries are acknowledged without incrementing visit totals.

Example event:

```json
{
  "events": [{
    "idempotency_key": "cf-evt-01JCP8H3T6F7W8X9Y0Z1",
    "host": "example.com",
    "timestamp": "2026-11-17T00:00:00.000Z",
    "user_agent": "Mozilla/5.0 compatible; GPTBot/1.0",
    "source_ip": "203.0.113.10",
    "http_status": 200,
    "path": "/pricing",
    "response_time_ms": 83,
    "bytes_served": 18420,
    "country_edge_code": "KE"
  }]
}
```

Never send query strings, cookies, authorization headers, request bodies, full URLs, or end-user identifiers. Source IP is used transiently for verification and is not stored. The event host must match the registered project domain or a subdomain. Invalid required fields reject the whole batch with HTTP 400. HTTP 429 means the per-key or account-wide hourly cap was reached; HTTP 503 means a temporary service/storage problem. Retry 429 after the next rate-limit window; retry 503/network failures with capped exponential backoff and jitter, retaining the original idempotency keys.

Each account can register at most 10 crawler projects. The account-wide ingestion ceiling is 1,200 requests and 120,000 events per hour, regardless of how many projects or keys are created.

## Cloudflare Worker and Queue

Bind the origin as a service binding named `ORIGIN`, configure a Queue binding named `CRAWLER_EVENTS`, and store the key as a Worker secret named `AFRICALATENCY_CRAWLER_KEY`. The request handler enqueues asynchronously; the queue consumer batches and retries failed deliveries. Each event receives its idempotency key before enqueueing, so queue retries are safe.

```js
export default {
  async fetch(request, env, ctx) {
    const started = Date.now();
    const response = await env.ORIGIN.fetch(request);
    const ua = request.headers.get('user-agent') || '';
    if (/GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot|Googlebot/i.test(ua)) {
      const url = new URL(request.url);
      const event = {
        idempotency_key: crypto.randomUUID(),
        host: url.hostname,
        timestamp: new Date().toISOString(),
        user_agent: ua,
        source_ip: request.headers.get('cf-connecting-ip') || '',
        http_status: response.status,
        path: url.pathname,
        response_time_ms: Date.now() - started,
        bytes_served: Number(response.headers.get('content-length') || 0) || null,
        country_edge_code: request.cf?.country || null
      };
      ctx.waitUntil(env.CRAWLER_EVENTS.send(event));
    }
    return response;
  },
  async queue(batch, env) {
    const events = batch.messages.slice(0, 100).map(message => message.body);
    const response = await fetch('https://africalatency.dev/api/v1/ingest/crawler-logs', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.AFRICALATENCY_CRAWLER_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ events })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error('AfricaLatency ingestion failed (' + response.status + '): ' + detail.slice(0, 300));
    }
  }
};
```

Configure a Queue consumer batch size of 100 and a short maximum wait. Throwing on non-2xx responses allows Cloudflare Queue retry/dead-letter policies to handle the batch. Monitor queue retries and dead letters. Cloudflare Logpush does not execute Worker `waitUntil`; configure Logpush to a customer-owned queue or collector, then map ClientIP, ClientRequestUserAgent, EdgeResponseStatus, ClientRequestPath, EdgeResponseBytes and EdgeStartTimestamp into the schema. Use a stable Logpush record ID as the idempotency key and batch 25–100 records.

## Next.js

Next.js middleware receives the continuation response, not the final downstream route response status. Do not submit `NextResponse.next().status` as the origin status. For accurate status and response timing, instrument the Route Handler that creates the response or forward trusted CDN/access logs.

Example Route Handler pattern using `after()` from `next/server`:

```js
import { after } from 'next/server';

export async function GET(request) {
  const started = Date.now();
  const response = await buildActualResponse(request);
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';
  if (/GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot|Googlebot/i.test(ua)) {
    const event = {
      idempotency_key: crypto.randomUUID(),
      host: url.hostname,
      timestamp: new Date().toISOString(),
      user_agent: ua,
      source_ip: trustedClientIp(request),
      http_status: response.status,
      path: url.pathname,
      response_time_ms: Date.now() - started,
      bytes_served: Number(response.headers.get('content-length') || 0) || null,
      country_edge_code: request.headers.get('cf-ipcountry') || null
    };
    after(async () => {
      const result = await fetch('https://africalatency.dev/api/v1/ingest/crawler-logs', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + process.env.AFRICALATENCY_CRAWLER_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ events: [event] })
      });
      if (!result.ok) console.error('AfricaLatency crawler ingestion failed:', result.status, await result.text());
    });
  }
  return response;
}
```

Implement `buildActualResponse` and `trustedClientIp` using your application and hosting provider. Only trust IP headers overwritten by your trusted proxy. For higher traffic, enqueue into a durable queue and batch; do not await AfricaLatency on the user request path. Use bounded retries for 429/503 and retain the original idempotency key.

## Express / Node

Install after trusted proxy configuration. It observes completed responses and queues events in memory without delaying the response. Configure the actual trusted proxy count; do not blindly trust arbitrary `X-Forwarded-For` values. This sample batches 100 events, flushes every five seconds, caps pending events at 1,000 and caps retries at five attempts. The in-memory queue can lose records on process restart; use a durable queue when delivery guarantees matter.

```js
import { randomUUID } from 'node:crypto';

const crawlerPending = [];
let crawlerFlushRunning = false;
async function flushCrawlerEvents() {
  if (crawlerFlushRunning || !crawlerPending.length) return;
  crawlerFlushRunning = true;
  const batch = crawlerPending.splice(0, 100);
  try {
    const response = await fetch('https://africalatency.dev/api/v1/ingest/crawler-logs', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.AFRICALATENCY_CRAWLER_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ events: batch.map(item => item.event) })
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('AfricaLatency crawler ingestion failed:', response.status, detail.slice(0, 300));
      for (const item of batch) {
        if (item.attempts < 5 && crawlerPending.length < 1000) crawlerPending.push({ ...item, attempts: item.attempts + 1 });
        else console.error('Dropping crawler event after bounded retries:', item.event.idempotency_key);
      }
    }
  } catch (error) {
    console.error('AfricaLatency crawler network failure:', error.message);
    for (const item of batch) {
      if (item.attempts < 5 && crawlerPending.length < 1000) crawlerPending.push({ ...item, attempts: item.attempts + 1 });
      else console.error('Dropping crawler event after bounded retries:', item.event.idempotency_key);
    }
  } finally {
    crawlerFlushRunning = false;
  }
}
setInterval(() => { void flushCrawlerEvents(); }, 5000).unref?.();
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.once('finish', () => {
    const ua = String(req.headers['user-agent'] || '');
    if (!/GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot|Googlebot/i.test(ua)) return;
    const event = {
      idempotency_key: randomUUID(),
      host: req.hostname,
      timestamp: new Date().toISOString(),
      user_agent: ua,
      source_ip: req.ip,
      http_status: res.statusCode,
      path: req.path,
      response_time_ms: Number((process.hrtime.bigint() - started) / 1000000n),
      bytes_served: Number(res.getHeader('content-length') || 0) || null,
      country_edge_code: req.headers['cf-ipcountry'] || null
    };
    if (crawlerPending.length < 1000) crawlerPending.push({ event, attempts: 0 });
    else console.error('Crawler event queue is full; event dropped:', event.idempotency_key);
    if (crawlerPending.length >= 100) void flushCrawlerEvents();
  });
  next();
});
```

For production delivery guarantees, persist the queue and retry with capped exponential backoff. Preserve each event's idempotency key across retries. Log and alert on HTTP 429, HTTP 503, exhausted retries and queue overflow.

## Nginx / Caddy

Nginx example (configure `real_ip` only for trusted proxy CIDRs; otherwise `remote_addr` may be your CDN):

```nginx
log_format crawler_json escape=json
  '{ "host":"$host","timestamp":"$time_iso8601","user_agent":"$http_user_agent",'
  '"source_ip":"$remote_addr","http_status":$status,"path":"$uri",'
  '"response_time_ms":"$request_time","bytes_served":$body_bytes_sent,'
  '"country_edge_code":"$http_cf_ipcountry" }';
access_log /var/log/nginx/crawler-access.json crawler_json;
```

Caddy example:

```caddy
example.com {
  log {
    output file /var/log/caddy/access.json
    format json
  }
}
```

Use Vector or Fluent Bit to tail structured logs, filter supported bot user agents, map fields, strip query strings, convert Nginx request_time seconds to integer milliseconds, and batch 25–100 events. Generate a stable idempotency key from the source log record ID or file/inode/offset, not a new random value on each forwarder retry. Retry HTTP 429/503 and network failures with capped exponential backoff and jitter; log exhausted retries and dead-letter the record. Cap disk buffers. Do not run shell commands or synchronous HTTP calls from the request path.

## Retention and scheduling

Crawler events are retained for 30 days by default. The migration creates `public.cleanup_old_crawler_events(retention_days integer default 30)`, a BRIN timestamp index, and automatically schedules a daily 02:17 UTC pg_cron job named `crawler-log-retention-daily` when the `pg_cron` extension is already enabled. Verify it exists after applying the migration:

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'crawler-log-retention-daily';
```

If pg_cron is not enabled, enable it in Supabase Database Extensions and schedule the function, or invoke it daily from an approved service-role scheduled worker:

```sql
select public.cleanup_old_crawler_events(30);
```

Do not expose this cleanup function to anon/authenticated roles. The function is service-role-only.

## Verification limits

- GPTBot and OAI-SearchBot: OpenAI official IP feeds.
- ClaudeBot: Anthropic currently says it does not publish crawler IP ranges; classify these requests as unverified unless a trusted CDN/provider supplies an independent verified-bot signal.
- PerplexityBot: Perplexity's published IP feed.
- Googlebot: Google's published crawler IP ranges, with forward-confirmed reverse DNS fallback.
- Google-Extended is a robots.txt control token, not a distinct HTTP crawler identity. It cannot be counted as a separate visit in access logs.
- ChatGPT-User is a user-triggered fetcher, not an automatic crawler; it is intentionally excluded from crawler totals.

A published-range match establishes that the source address is in the operator's published crawler network. It is not a cryptographic signature. Each provider feed is cached and health-tracked independently. A failed refresh preserves last-known ranges but classifies the provider as unverified until its feed recovers; it never labels a crawler spoofed solely because its feed is unavailable. Claimed bots with a healthy authoritative feed that do not match are marked spoofed_bot.
