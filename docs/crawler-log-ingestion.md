# AfricaLatency AI crawler log ingestion

Endpoint: `POST https://africalatency.dev/api/v1/ingest/crawler-logs`  
Authentication: `Authorization: Bearer clg_live_<secret>`  
Content type: `application/json`

Send 1–100 events per batch (maximum 256 KiB). Every event must include `host`, ISO-8601 `timestamp`, `user_agent`, `source_ip`, integer `http_status` (100–599), `path` (absolute path only, no query or fragment), and a stable `idempotency_key` (8–128 safe characters). Optional: `response_time_ms`, `bytes_served`, `country_edge_code`.

Keep an event's idempotency key unchanged across retries. Generate it once when the event is captured (prefer a durable log record ID or UUID) and persist it in the queue. Events are unique per project; retrying a committed event does not increase visit counts.

Example:

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

Never send query strings, cookies, authorization headers, request bodies, full URLs, or end-user identifiers. Source IP is used transiently for verification and is not stored. The host must match the registered project domain or a subdomain. Invalid required fields reject the entire batch with HTTP 400. HTTP 429 means the per-key or account-wide hourly cap was reached; the response includes `Retry-After`. HTTP 503 means temporary service/storage failure. Retain the same idempotency keys when retrying 429/503/network failures with capped backoff and jitter.

Each account can create at most 10 crawler projects. Account-wide ingestion is capped at 1,200 requests and 120,000 events per hour, regardless of project/key count.

## Cloudflare Worker and Queue

Bind the origin as a service binding named `ORIGIN`, configure a Queue binding named `CRAWLER_EVENTS`, and store the key as a Worker secret named `AFRICALATENCY_CRAWLER_KEY`. The Worker enqueues asynchronously; the queue consumer sends batches and retries failures. Idempotency keys are generated before enqueueing.

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

Configure a queue consumer batch size of 100 and a short maximum wait. Throwing on non-2xx responses lets Cloudflare retry/dead-letter the batch. Monitor retries and dead letters. Cloudflare Logpush does not execute Worker `waitUntil`; send Logpush to a customer-owned queue or collector, map ClientIP, ClientRequestUserAgent, EdgeResponseStatus, ClientRequestPath, EdgeResponseBytes and EdgeStartTimestamp, and batch 25–100 events. Use the stable Logpush record ID as the idempotency key.

## Next.js

Next.js middleware sees the continuation response, not the final downstream status. Do not log `NextResponse.next().status` as the origin status. Instrument the Route Handler that creates the response or forward trusted CDN/access logs.

Route Handler pattern using `after()` from `next/server`:

```js
import { after } from 'next/server';
import { randomUUID } from 'node:crypto';

export async function GET(request) {
  const started = Date.now();
  const response = await buildActualResponse(request);
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';
  if (/GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot|Googlebot/i.test(ua)) {
    const event = {
      idempotency_key: randomUUID(),
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
      try {
        const result = await fetch('https://africalatency.dev/api/v1/ingest/crawler-logs', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + process.env.AFRICALATENCY_CRAWLER_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ events: [event] })
        });
        if (!result.ok) console.error('AfricaLatency ingestion failed:', result.status, await result.text());
      } catch (error) {
        console.error('AfricaLatency ingestion network failure:', error);
      }
    });
  }
  return response;
}
```

Implement `buildActualResponse` and `trustedClientIp` for your application/host. Trust only client-IP headers overwritten by your trusted proxy. For high traffic, enqueue durably and batch; do not await AfricaLatency on the user request path. Keep the original idempotency key across retries.

## Express / Node

Install after trusted proxy configuration. The middleware observes completed responses and queues events without delaying them. Configure the actual trusted proxy count; do not blindly trust arbitrary `X-Forwarded-For` values. This in-memory sample batches 100 events, flushes every five seconds, caps pending events at 1,000 and retries up to five times. It can lose pending records on process restart; use a durable queue where delivery guarantees matter.

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
      console.error('AfricaLatency ingestion failed:', response.status, detail.slice(0, 300), 'retry-after:', response.headers.get('retry-after'));
      for (const item of batch) {
        if (item.attempts < 5 && crawlerPending.length < 1000) crawlerPending.push({ ...item, attempts: item.attempts + 1 });
        else console.error('Dropping event after bounded retries:', item.event.idempotency_key);
      }
    }
  } catch (error) {
    console.error('AfricaLatency network failure:', error.message);
    for (const item of batch) {
      if (item.attempts < 5 && crawlerPending.length < 1000) crawlerPending.push({ ...item, attempts: item.attempts + 1 });
      else console.error('Dropping event after bounded retries:', item.event.idempotency_key);
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
    else console.error('Crawler event queue full; dropped:', event.idempotency_key);
    if (crawlerPending.length >= 100) void flushCrawlerEvents();
  });
  next();
});
```

For durable delivery, persist the queue and retry with capped exponential backoff. Preserve idempotency keys. Log and alert on HTTP 429, HTTP 503, exhausted retries and queue overflow.

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

Use Vector or Fluent Bit to tail structured logs, filter crawler user agents, map fields, strip query strings, convert Nginx request_time seconds to integer milliseconds, and batch 25–100 events. Derive a stable idempotency key from the source log record ID or file/inode/offset, not a new random value on each forwarder retry. Retry HTTP 429/503 and network failures with capped exponential backoff and jitter; log exhausted retries and dead-letter records. Cap disk buffers. Do not run shell commands or synchronous HTTP calls from the request path.

## Retention and scheduling

Crawler events are retained for 30 days. The migration creates `public.cleanup_old_crawler_events(retention_days integer default 30)`, a BRIN timestamp index, and schedules a daily 02:17 UTC pg_cron job named `crawler-log-retention-daily` if `pg_cron` is already enabled. Verify it after applying the migration:

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'crawler-log-retention-daily';
```

If pg_cron is not enabled or the migration cannot schedule it, enable the extension in Supabase Database Extensions and schedule the function, or invoke it daily from an approved service-role scheduled worker:

```sql
select public.cleanup_old_crawler_events(30);
```

The cleanup function is service-role-only.

## Verification limits

- GPTBot and OAI-SearchBot: OpenAI official IP feeds.
- ClaudeBot: Anthropic currently says it does not publish crawler IP ranges; classify it as unverified unless a trusted CDN/provider supplies an independent verified-bot signal.
- PerplexityBot: Perplexity's published IP feed.
- Googlebot: Google's published crawler IP ranges, with forward-confirmed reverse DNS fallback.
- Google-Extended is a robots.txt control token, not a distinct HTTP crawler identity.
- ChatGPT-User is a user-triggered fetcher, not an automatic crawler; it is excluded from crawler totals.

A published-range match shows that the source address belongs to a publisher's published crawler network; it is not a cryptographic signature. Each provider feed is cached and health-tracked independently. A failed refresh preserves last-known ranges but marks that feed unavailable; requests for that bot become unverified until the feed recovers, never spoofed solely because its feed is down.
