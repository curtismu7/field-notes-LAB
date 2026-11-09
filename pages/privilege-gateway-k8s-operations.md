---
title: "Privilege AI Gateway on Kubernetes: operations and troubleshooting"
date: 2026-11-08
apps: [PingOne Privilege, privilege-mcpgw-terraform, Kubernetes, Helm]
tags: [kubernetes, helm, operations, troubleshooting, lesson]
summary: "What bites when running the Privilege agentless MCP gateway on Kubernetes: restart discipline, Redis, the load balancer's rise window, chart hygiene, enrollment, and a symptom-to-fix table."
source: "owner findings, sanitized"
---

# Privilege AI Gateway on Kubernetes: operations and troubleshooting

Written by the owner, 2026-11-08. Sanitized copy: namespaces and releases are placeholders. Learned on our own clusters and written up for the customer package ("Privilege AI Gateway on Kubernetes: the customer package").

## Do not

- **Restart a gateway while Redis is down.** It gives up after six connection attempts and crash-loops until Redis is back.
- **Restart gateways because of `503 node=<NOSRV>`** right after a rollout. The load balancer holds a node out for about 10 minutes of health-check rise. Wait.
- **Register a backend on `/sse`.** Use `/mcp`. The entry path is fixed at registration.
- **Change an application's Mesh Cluster** in the console to "copy" it. That moves it.
- **Replace the integrated load balancer** with a round-robin Service. Tokens are per node.
- **Delete a gateway's SSL PVC** casually. It holds the node's enrollment certificate, issued once per registration. Losing it means deleting the node in the console and enrolling again with a new token.

## Always

- Restart the gateway pods after any OIDC change: `kubectl -n <ns> rollout restart deploy/<release>`.
- Upgrade a running release with `--reuse-values` and the same overlay files. A bare upgrade resets sidecars, Redis settings and routing.
- If you change chart templates, run `helm package` in the same change. A stale package silently drops template additions (sidecars, pull secrets). Render a dry run and look for the sidecars before an upgrade.
- Restate whole lists in a values file instead of `--set list[2].name=…`.
- Give every node the same sidecars and secrets.

## On first deploy

The gateway can sit in `CrashLoopBackOff` for 5 to 10 minutes while Privilege provisions the new node. It heals once the proxy certificate is issued. Do not reinstall during that window. Check for `TLS mode` in the gateway log: it must start in TLS mode for tool discovery.

With the older wrapper chart: register all MCP servers before the gateway starts, or restart it after adding one; if the console shows "No Tools Discovered", restart after confirming the registrations. Do not append `/mcp` to the client URL there (discovery hung).

## Symptom to fix

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Console: "Gateway Unreachable … Unauthorized" | Backend on `/sse`, wrong host, or an expired policy | Read the gateway's "Error discovering MCP server" line; re-register on `/mcp` |
| "Unknown client" at `/authorize` | Registration lost: Redis down or not configured | Restore Redis, register again, check `MCPGW_REDIS_URL` (not `REDIS_URL`) |
| 401 on `/<App>/mcp` right after sign-in | Token from one node, call to another | Enter through the load balancer, never a node Service |
| 500 on `/<App>/mcp`, sign-in works | That node lacks the sidecar the backend runs on | Same sidecar values and secrets on every node |
| `503 node=<NOSRV>` | All nodes in the rise window | Wait up to about 10 minutes |
| Crash loop, `crypto/ecdsa: verification error` at enrollment | Whitespace in the enrollment token | New token, strip whitespace, delete the old SSL PVC, enroll again |
| Authorize redirect with empty `client_id` | Pod still on the old OIDC config | Restart the gateway pod |
| App stops after a console edit | Its Mesh Cluster changed | Set it back |
| Fatal "unreachable after 6 attempts" | Redis was down at restart | Restore Redis; the gateway reconnects |

## Reading the gateway log

```sh
kubectl -n <ns> exec deploy/<release> -c log-tailer -- tail -200 /var/log/procyon/cyonproxy.log
```

The client sees only a bare 403 on a policy denial; the log names the user and the reason (user not synced into Privilege, or no policy covers them). Always confirm there. The gateway writes to this file, not to stdout.

## Capacity

- The gateway container idles very low; the default 1 CPU request can drop to about 250m on a small cluster (keep the limits).
- Each sidecar adds a container to the pod: eight sidecars make a nine-container pod.
- Redis with a 1Gi volume and 64 MB maxmemory is enough for registrations.

## Security

- Enrollment tokens, OIDC secrets and generated values files stay out of git; delete token files after use; rotate anything that showed up in a screenshot or chat.
- Put authentication on the load balancer statistics page, or turn it off.
- Redis is password-protected in the cluster; front it with TLS if policy requires.
