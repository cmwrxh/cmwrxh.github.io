# Scan V2 API

## Create a scan

`POST /api/v1/lighthouse`

JSON body:
```json
{ "url": "https://example.com", "device": "mobile" }
```

- `device` may be `mobile` (default, simulated slow 4G) or `desktop`.
- Anonymous requests require a valid Turnstile token in `turnstileToken`.
- Paid API clients may send `x-api-key: al_live_...`.
- Response: `jobId`, `reportId`, `queuePosition`, `cacheHit`.

## Poll a scan

`GET /api/scan/{jobId}`

Send `x-api-key` for a paid API-key job or `Authorization: Bearer <Supabase access token>` for an account-owned report. Public report IDs can be used in the same endpoint. The free summary remains public; authenticated report owners and API-key owners receive `fullReport`.

## API keys

The migration creates `scan_api_keys` and stores only SHA-256 key hashes. Key issuance is intentionally not exposed as a public endpoint. Provision keys through a reviewed, server-side administrative workflow; do not store plaintext keys in SQL or the repository.
