---
title: "The log collector for PingFederate, PingGateway and the Privilege gateway"
date: 2026-11-08
apps: [ping-log-collector, PingFederate, PingGateway, PingOne Privilege, Elasticsearch]
tags: [logging, elasticsearch, vector, how-to, secrets]
summary: "A local Vector collector that ships three Ping products into ping-logs-<product>: what it reads, how it masks secrets (including a leak we fixed), how it is configured and how to check it."
source: "owner findings, sanitized"
---

# The log collector for PingFederate, PingGateway and the Privilege gateway

Written by the owner, 2026-11-08. Sanitized copy: container names are `<pf-container>`, `<gateway-container>`, `<privilege-gw-container>`; the Elasticsearch pod and namespace are `<es-pod>` and `<es-namespace>`.

## What it is

`AI-DEMO-Standalone/shared/ping-log-collector`: one Vector 0.50.0 container on OrbStack, read-only root filesystem, no published ports. It writes to Elasticsearch indexes `ping-logs-<ping_product>`.

| Source | `ping_product` | `ping_component` |
| --- | --- | --- |
| PingFederate stdout (the image tails its log files as `<path>:  <line>`), multi-line joined | `pingfederate` | `server`, `audit`, `admin`, `admin-api` |
| PingGateway stdout (logback, plus JSON audit lines) | `pinggateway` | `server`, `access-audit`, `mcp-audit` |
| Privilege gateway `cyonproxy.log`, from its log volume mounted read-only | `privilege-gateway` | `gateway` |

Every event gets `@timestamp`, `ping_product`, `ping_component`, `event_kind`, `environment`, `host`, `message`, and where it parses, `level`, `logger`, `thread`, `route`, `request_id`. The document id is a hash of container, line time and raw line, so restarts do not duplicate.

## Secret masking, and the leak we fixed

Before any parsing it masks Authorization, Proxy-Authorization, Cookie, Set-Cookie and X-Api-Key values, Bearer and Basic credentials, `sk-` keys, JWTs and PingFederate `Cookie{...}` dumps, and the values of `client_secret`, `password`, `client_assertion`, `refresh_token`, `access_token`, `id_token`, `subject_token`, `actor_token`, `assertion`, `code_verifier` and `code`.

**The leak:** PingFederate prints request parameters as a multi-line dump, with the name on one line and the value on the next indented line. The first config masked only same-line `name=value`, so values on the following line went through. Fix: PingFederate got its own source with `multiline` joining (a line that starts with PF's timestamp starts an event), and the masking also covers "name, then value on the next indented line". The leaked documents were deleted.

## Configuration

Container names live in a `.env` beside the compose file (names only, no secret):

```sh
PING_PF_CONTAINER=<pf-container>
PING_GATEWAY_CONTAINER=<gateway-container>
PING_PRIVILEGE_GW_CONTAINER=<privilege-gw-container>
PING_PRIVILEGE_GW_LOG_VOLUME=<privilege-gw-log-volume>
```

The Elasticsearch URL and API key come from `~/Development/.env` (`PING_LOGS_ES_URL`, `PING_LOGS_ES_APIKEY`), never from the repo. The key needs `create_doc` on `ping-logs-*`.

## Start, restart, check

```sh
kubectl --context <context> -n <es-namespace> port-forward pod/<es-pod> 9200:9200   # kept up by a launchd agent on the owner's Mac
set -a; eval "$(grep -E '^PING_LOGS_ES_(URL|APIKEY)=' ~/Development/.env)"; set +a
docker --context orbstack compose up -d --force-recreate vector
docker --context orbstack compose logs -f vector     # look for errors
```

`eval "$(grep …)"` matters: macOS bash 3.2 loads nothing from `. <(grep …)`.

Check it works by content, not by a running container: count new documents per `ping_product` in the last few minutes. Verified 2026-11-08: all three products arriving, 0 write errors.

## Traps

- Only PingFederate `server.log` reaches stdout by default. `audit.log`, `admin.log` and `admin-api.log` need the image's tail list changed (AI-DEMO2 did that), or they never arrive.
- PingFederate replays the last lines of those files with new Docker times at start, so their document id leaves the time out.
- PingFederate `server.log` debug lines are dropped on purpose.
- The Privilege gateway writes its log to a file, nothing to stdout, so a stdout-only shipper sees none of it.
