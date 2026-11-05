# Regional Go probe agent

Runs DNS, TCP, TLS and TTFB measurements from a regional host. It rejects private/reserved DNS answers and pins the outbound connection to the resolved public IP set, disables redirects, bounds request time and response bytes, and never stores raw IPs or target hostnames.

## Required environment

- `AGENT_ID`: stable non-secret node label
- `AGENT_COUNTRY_CODE`: two-letter country code
- `PROBE_AGENT_TOKEN`: generated shared bearer token
- `AGENT_RECEIVER_URL`: app origin; leave empty to queue locally without sending
- `AGENT_QUEUE_DB`: persistent SQLite path (default `/var/lib/probe-agent/queue.sqlite`)

Generate the token on a trusted operator workstation with `openssl rand -hex 32`; configure it in the agent and app environment without committing or printing it.

## Endpoints

- `GET /healthz`
- `POST /v1/measure` with JSON `{"host":"example.com"}` and bearer authentication

Results are persisted in SQLite and sent in batches of up to 50 over HTTPS (HTTP/2 where supported). Failed sends remain queued for retry. The receiving `/api/probe-agent` endpoint is disabled unless `PROBE_AGENT_ENABLED=true`.

## Manual regional installation

The agent is not installed automatically by this repository change. On each authorized regional host (Cape Town and Ashburn), build or pull the reviewed image, create a persistent queue directory, generate one token on a trusted operator workstation, then configure the same token in the app receiver and the agent without pasting it into shell history or chat.

Example command sequence (replace image, receiver URL, agent label and country code with the deployment values; inject the generated token through a protected environment file):

```sh
openssl rand -hex 32
sudo install -d -m 0700 /var/lib/probe-agent
sudo docker run -d --name probe-agent --restart unless-stopped \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -p 127.0.0.1:3300:3300 \
  -v /var/lib/probe-agent:/var/lib/probe-agent \
  --env-file /etc/probe-agent/probe-agent.env \
  africalatency/probe-agent:latest
```

The protected env file contains `AGENT_ID`, `AGENT_COUNTRY_CODE`, `PROBE_AGENT_TOKEN`, and `AGENT_RECEIVER_URL`. Do not expose port 3300 publicly; put it behind the existing private network/Tailscale access. Configure the identical token in the app's protected environment and set `PROBE_AGENT_ENABLED=true` only after the additive migration is applied and the receiver is verified. Keep the queue volume persistent.
