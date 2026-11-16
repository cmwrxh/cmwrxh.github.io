# AfricaLatency AI crawler log ingestion

Endpoint: POST https://africalatency.dev/api/v1/ingest/crawler-logs
Authentication: Authorization: Bearer clg_live_<secret>
Content-Type: application/json

Send 1–100 events per batch (maximum request body 256 KiB). Each event requires a host, timestamp, user_agent, source_ip, http_status and path. Optional fields: response_time_ms, bytes_served, country_edge_code.

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

Never send query strings, cookies, authorization headers, request bodies, full URLs, or end-user identifiers. Source IP is used transiently for verification and is not stored. Project domain/subdomains are checked against the registered project.

## Cloudflare Worker

The following is a Worker wrapper pattern. Bind the origin as an environment service binding named ORIGIN and store the key as a Worker secret named AFRICALATENCY_CRAWLER_KEY.

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

Cloudflare Logpush does not execute a Worker waitUntil callback. Configure Logpush to a customer-owned queue or collector, then map ClientIP, ClientRequestUserAgent, EdgeResponseStatus, ClientRequestPath, EdgeResponseBytes and EdgeStartTimestamp into the same schema. Batch 25–100 records before forwarding.

## Next.js middleware

In Next.js Edge middleware, use the platform execution context's waitUntil. The key must be a server-side environment variable.

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
          response_time_ms: 0,
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

For Next.js Node runtimes, use next/server after() or a bounded durable queue. Do not await ingestion on the request path.

## Express / Node

Place a middleware after response status and byte count are known. Capture only bot-like requests and enqueue a compact event into a bounded queue (for example, 1000 entries). A background worker flushes batches of up to 100 and retries with capped exponential backoff. Drop oldest records once the queue is full rather than delaying the origin response. Do not use unbounded promises.

## Nginx / Caddy

Prefer a local Fluent Bit or Vector tailer over shelling out from the request path. Emit structured JSON access logs with timestamp, host, request path without query string, status, request time, body bytes sent, user agent and the real client IP as established by trusted proxy configuration. Tailer batches 25–100 records, retries with capped exponential backoff and caps its disk buffer. For Caddy, use structured JSON access logs and a Vector/Fluent Bit transform.

## Verification

- GPTBot and OAI-SearchBot: OpenAI official IP feeds.
- ClaudeBot: Anthropic's official crawler IP feed.
- PerplexityBot: Perplexity's published IP feed.
- Googlebot: Google's published crawler IP ranges, with forward-confirmed reverse DNS fallback.
- Google-Extended is a robots.txt control token, not a distinct HTTP crawler identity; it cannot be counted as a separate visit in access logs.

A published-range match establishes that the source address is in the operator's published crawler network. It is not a cryptographic signature. Feed data is cached for six hours. Events from claimed bots that have an authoritative feed but do not match are marked spoofed_bot. If no authoritative source can establish identity, they remain unverified.
