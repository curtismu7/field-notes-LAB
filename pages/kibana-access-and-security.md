---
title: "Opening and securing Kibana"
date: 2026-11-08
apps: [Kibana, Elasticsearch, observability-LAB]
tags: [kibana, elasticsearch, security, how-to]
summary: "How to open our Kibana (port-forwards on loopback), why Elasticsearch anonymous access is now off, what the shared Kibana viewer can do, and what the Basic license cannot."
source: "owner findings, sanitized"
---

# Opening and securing Kibana

Written by the owner, 2026-11-08. Sanitized copy: the namespace is `<es-namespace>`, the pod is `<es-pod>`.

## Open it

Kibana has no ingress. Two launchd agents on the owner's Mac keep port-forwards up:

| Agent | URL |
| --- | --- |
| `kibana-port-forward` | <http://127.0.0.1:5601/> |
| `elasticsearch-port-forward` | `http://127.0.0.1:9200` (API only, needs a key) |

Useful pages: Discover (`/app/discover`), Dashboards (`/app/dashboards`), the Privilege overview and Ping logs dashboards. The default data view is `ping-logs`.

**"No data" in Discover** is almost always the time picker. Set it to the last 7 or 30 days, and pick the right data view (`ping-logs`, `privilege-logs`).

## Who can do what

| Path | Access |
| --- | --- |
| Elasticsearch directly | Anonymous access is **off** (2026-11-08): the three `xpack.security.authc.anonymous.*` settings were removed from the Elasticsearch statefulset. Every call needs a user or an API key. The Privilege exporter uses its own user and was not affected. |
| Kibana | Kibana keeps its own anonymous provider, signed in as the shared user `kibana_proxy_shared`. Roles: `kibana_shared`, `viewer`, and `kibana_security_editor`, which the owner added so the viewer can use Security rules (Security solution all, write on the alerts and lists indices). It still cannot make API keys. |
| Admin work | Inside the pod only: `kubectl exec` into `<es-pod>` and `curl -u elastic:$ELASTIC_PASSWORD` against localhost. The password never leaves the pod. |

Because Kibana is reachable only through a loopback port-forward, "anonymous Kibana" means "anyone on the owner's Mac". Do not add an ingress without turning that provider off.

## License limits (Basic)

- No URL drilldowns on dashboard panels. Links out of Kibana go through a runtime field with a URL format instead (see "From a Kibana record to the requirement 9 map").

## Traps

- zsh does not word-split variables. Wrap repeated `kubectl exec … curl` calls in a function, or use a bash heredoc.
- Kibana API sign-in tests need `POST /internal/security/login` with the header `x-elastic-internal-origin: Kibana`.
- Snapshot saved objects (export NDJSON) before editing a dashboard; re-import restores it.
