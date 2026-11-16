# AfricaLatency AI crawler log ingestion

Endpoint: POST https://africalatency.dev/api/v1/ingest/crawler-logs
Authentication: Authorization: Bearer clg_live_<secret>
Content-Type: application/json

Send 1–100 events per batch (maximum request body 256 KiB). Each event requires host, timestamp, user_agent, source_ip, http_status and path. Optional fields: response_time_ms, bytes_served, country_edge_code.

Example payload:
{
  "events": [{
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

Never send query strings, cookies, authorization headers, request bodies, full URLs, or end-user identifiers. Source IP is used transiently for verification and is not stored. The event host must match the registered project domain or a subdomain.

## Cloudflare Worker

Bind the origin as an environment service binding named ORIGIN. Store the key as a Worker secret named AFRICALATENCY_CRAWLER_KEY. The example observes the response and schedules ingestion with waitUntil, so the client response is not delayed by AfricaLatency.

    export default {
      async fetch(request, env, ctx) {
        const started = Date.now();
        const response = await env.ORIGIN.fetch(request);
        const ua = request.headers.get('user-agent') || '';
        if (/GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot|Googlebot/i.test(ua)) {
          const event = {
            host: new URL(request.url).hostname,
            timestamp: new Date().toISOString(),
            user_agent: ua,
            source_ip: request.headers.get('cf-connecting-ip'),
            http_status: response.status,
            path: new URL(request.url).pathname,
            response_time_ms: Date.now() - started,
            bytes_served: Number(response.headers.get('content-length') || 0) || null,
            country_edge_code: request.cf?.country || null
          };
          ctx.waitUntil(fetch('https://africalatency.dev/api/v1/ingest/crawler-logs', {
            method: 'POST',
            headers: { authorization: 'Bearer ' + env.AFRICALATENCY_CRAWLER_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({ events: [event] })
          }).catch(() => {}));
        }
        return response;
      }
    };

Cloudflare Logpush does not execute a Worker waitUntil callback. Configure Logpush to a customer-owned queue or collector, then map ClientIP, ClientRequestUserAgent, EdgeResponseStatus, ClientRequestPath, EdgeResponseBytes and EdgeStartTimestamp into the event schema. Batch 25–100 records before forwarding.

## Next.js middleware

In Next.js Edge middleware, use the NextFetchEvent waitUntil contract. The key must be a server-side environment variable. Adapt source IP and country fields to the trusted platform headers available in your deployment.

    import { NextResponse } from 'next/server';

    export function middleware(request, event) {
      const response = NextResponse.next();
      const ua = request.headers.get('user-agent') || '';
      if (/GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot|Googlebot/i.test(ua)) {
        const eventData = {
          host: request.nextUrl.hostname,
          timestamp: new Date().toISOString(),
          user_agent: ua,
          source_ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
          http_status: response.status,
          path: request.nextUrl.pathname,
          response_time_ms: null,
          bytes_served: null,
          country_edge_code: request.headers.get('cf-ipcountry') || null
        };
        event.waitUntil(fetch('https://africalatency.dev/api/v1/ingest/crawler-logs', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + process.env.AFRICALATENCY_CRAWLER_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ events: [eventData] })
        }).catch(() => {}));
      }
      return response;
    }

For Next.js Node runtimes, use next/server after() or a bounded durable queue. Do not await ingestion on the request path. Do not trust arbitrary forwarded IP headers; configure the hosting proxy to overwrite them.

## Express / Node

Install after trusted proxy configuration. It sends after the response finishes and never awaits the ingestion request. Configure the actual trusted proxy count; do not blindly trust arbitrary X-Forwarded-For values.

    app.set('trust proxy', 1);
    app.use((req, res, next) => {
      const started = process.hrtime.bigint();
      res.once('finish', () => {
        const ua = String(req.headers['user-agent'] || '');
        if (!/GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot|Googlebot/i.test(ua)) return;
        const event = {
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
        void fetch('https://africalatency.dev/api/v1/ingest/crawler-logs', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + process.env.AFRICALATENCY_CRAWLER_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ events: [event] })
        }).catch(() => {});
      });
      next();
    });

This fire-and-forget approach can lose an event if the process exits immediately after responding. At higher volume, replace it with a bounded queue or durable queue, batch up to 100 events and retry with capped exponential backoff. Never use unbounded promises.

## Nginx / Caddy

Nginx example (configure real_ip only for trusted proxy CIDRs; otherwise remote_addr may be your CDN):

    log_format crawler_json escape=json
      '{ "host":"$host","timestamp":"$time_iso8601","user_agent":"$http_user_agent",'
      '"source_ip":"$remote_addr","http_status":$status,"path":"$uri",'
      '"response_time_ms":"$request_time","bytes_served":$body_bytes_sent,'
      '"country_edge_code":"$http_cf_ipcountry" }';
    access_log /var/log/nginx/crawler-access.json crawler_json;

Caddy example:

    example.com {
      log {
        output file /var/log/caddy/access.json
        format json
      }
    }

Use Vector or Fluent Bit to tail structured logs, filter supported bot user agents, map the fields to the event schema, strip query strings, convert Nginx request_time seconds to integer milliseconds, and batch 25–100 events. Retry with capped exponential backoff and cap the disk buffer. Do not run shell commands or synchronous HTTP calls from the request path.

## Verification limits

- GPTBot and OAI-SearchBot: OpenAI official IP feeds.
- ClaudeBot: Anthropic's official crawler IP feed.
- PerplexityBot: Perplexity's published IP feed.
- Googlebot: Google's published crawler IP ranges, with forward-confirmed reverse DNS fallback.
- Google-Extended is a robots.txt control token, not a distinct HTTP crawler identity. It cannot be counted as a separate visit in access logs.
- ChatGPT-User is a user-triggered fetcher, not an automatic crawler; it is intentionally excluded from crawler totals.

A published-range match establishes that the source address is in the operator's published crawler network. It is not a cryptographic signature. Feed data is cached for six hours. Claimed bots with authoritative feeds that do not match are marked spoofed_bot. When no authoritative source can establish identity, events remain unverified.
