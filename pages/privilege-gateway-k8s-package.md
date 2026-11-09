---
title: "Privilege AI Gateway on Kubernetes: the customer package (Helm, Terraform, guide)"
date: 2026-11-08
apps: [PingOne Privilege, privilege-mcpgw-terraform, Kubernetes, Helm]
tags: [kubernetes, helm, terraform, deployment, customer, how-to]
summary: "What we built for a customer to run the PingOne Privilege agentless MCP gateway on Kubernetes: an early Helm chart kit, the Terraform package that replaced it, the 18-page deployment guide and checklist, and the deployment path in order."
source: "owner findings, sanitized"
---

# Privilege AI Gateway on Kubernetes: the customer package

Written by the owner, 2026-11-08. Sanitized copy: the gateway host is `mcpgw.example.invalid`, namespaces and issuers are placeholders, and the customer is not named. The guide itself is marked Ping confidential; this page summarizes it and does not copy it.

## What exists

Two generations. Use the second.

| | Kit (2026-11-05) | Terraform package (2026-11-07, current) |
| --- | --- | --- |
| Where | the owner's Documents folder, `privilege-mcpgw-kit` (not in git) | private repo `privilege-mcpgw-terraform` (local copy in the same folder) |
| Chart | Our own wrapper chart `agent-privilege` 0.1.0 (gateway, ingress, certificate, PVC, OIDC secret, homepage, HAProxy load balancer) plus `INSTALL.md` | Ping's `agentless-mcpgw` chart, **not vendored**: the customer points `chart_repository` at their own copy |
| Infra as code | early `tf/` | `main.tf` etc: namespaces, image pull secret, shared Redis (Bitnami), `MCPGW_REDIS_URL` secrets, one Helm release per gateway node, integrated load balancer on the primary node, ingress-nginx on GKE |
| Docs | Deployment guide PDF + its builder script and fonts | Same guide (18 pages), `CHECKLIST.md` (one-page go-live), README |
| Scripts | none | `preflight.sh` (read-only cluster checks), `validate.sh` (init/fmt/validate, no cluster), `smoke.sh` (per node: rolled out, enrolled, Redis connected), `selftest.sh` (scripts against stubs) |

The guide is built from `docs/source/build_guide.py` (ReportLab, with Montserrat and IBM Plex Mono under the SIL Open Font License, see `FONTS.md`). Edit the script, rebuild the PDF, commit both.

## The architecture in one picture

```text
MCP client or agent
   |  https://mcpgw.example.invalid/<AppName>/mcp
Ingress (TLS, public host)
   |
mcpgw-lb :8623 (integrated LB, 2 replicas)
   |  pins client address + application path to one node
Gateway node 1 -- node 2 -- node N   (one mesh cluster)
   |
MCP backends: sidecars on localhost, or cluster services
```

Why pinning: each node keeps its issued tokens in memory. A token from node 1 is refused by node 2, so round-robin does not work. Registrations live in shared Redis and survive failover; tokens do not, so a failover costs the client one automatic re-authentication (under about 30 seconds with SSO).

## Guide sections

1. Introduction and audience
2. Architecture overview
3. Prerequisites
4. OIDC application (PingFederate or PingOne)
5. Deploying the first gateway (enrollment token)
6. Shared Redis
7. Integrated load balancer
8. Adding a second node
9. Registering MCP servers as applications
10. Verification
11. Operational considerations
12. Troubleshooting

Appendix A: resource summary.

## Deployment path, in order

1. **Prerequisites.** Kubernetes 1.25+ with 2+ workers, Helm 3.12+, Terraform 1.6+, an nginx ingress controller (the chart's annotations need it: 3600 s timeouts, buffering off, HTTPS backends), cert-manager with a Ready issuer, public DNS. Run `scripts/preflight.sh`.
2. **OIDC application** in PingFederate or PingOne: Client Secret Basic, redirect `https://<host>/callback`, Authorization Code (plus Token Exchange for delegation), scopes `openid profile email`.
3. **Enrollment token** from the Privilege console: Gateways, Add New, AI GW, with a Cluster ID and the node's in-cluster Service name as Host IP. Single use, about 2 hours, no leading or trailing whitespace.
4. **Deploy.** Copy `terraform.tfvars.example`, put secrets in `TF_VAR_*`, `scripts/validate.sh`, `terraform plan`, `terraform apply`. Point DNS at the `ingress_controller_external_ip` output.
5. **Register backends** as applications in the console, on `/mcp`.
6. **Verify.** `scripts/smoke.sh <namespace> <release>` per node; an MCP client signs in and a tool call works (register 201, authorize 302, callback 302, token 200, mcp 200); `X-Served-By` stays the same node for one client and app; a failover test re-authenticates once.
7. **Second node.** Same Cluster ID, new entry in `gateway_nodes` with `ingress_enabled = false`, `terraform apply`. Same sidecars and secrets in its namespace.

## Rules for the repo

- `apply` is owner-run; agents stop at `plan`.
- Never vendor Ping's chart or its values.
- Only example hosts and ids; never commit a real `terraform.tfvars`.

See also "Privilege AI Gateway on Kubernetes: operations and troubleshooting".
