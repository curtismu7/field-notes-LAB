---
title: "PingOne webhooks into Kibana, split by service"
date: 2026-11-08
apps: [pingone-events-LAB, PingOne, Elasticsearch, observability-LAB]
tags: [logging, pingone, webhooks, elasticsearch, kibana, how-to]
summary: "One PingOne webhook subscription with every event type, forwarded by pingone-events-LAB into ping-logs-pingone, where a pipeline labels each event SSO, MFA, DaVinci, Authorize, Protect, Verify and so on."
source: "owner findings, sanitized"
---

# PingOne webhooks into Kibana, split by service

Written by the owner, 2026-11-08. Sanitized copy: hosts are `events.example.invalid` and `siem.example.invalid`, the namespaces are `<app-namespace>` and `<es-namespace>`, the subscription id is `<subscription-id>`.

## Why webhooks

DaVinci, PingOne Authorize, MFA, SSO and the other PingOne services all report through the same PingOne event stream. One webhook subscription covers them all; the service is read from the event's `action.type`.

## The path

| Step | What |
| --- | --- |
| PingOne subscription `PINGONE-EVENTS-LAB` (`<subscription-id>`) | All 515 action types PingOne accepts. `SUBSCRIPTION.QUEUE_CLEARED` is refused by the API, so it is the one left out. Sends an `Authorization: Basic` custom header. |
| pingone-events-LAB on the cluster | Receives `POST https://events.example.invalid/webhook/pingone-events`. PingOne's cloud cannot reach a laptop, so this one app runs hosted (owner exception). |
| Forwarder | Bulk-writes each event to `ping-logs-pingone` with the event id as `_id`, so a resend is idempotent. Write-only key `pingone-events-forwarder`. |
| Template `ping-logs-pingone` (priority 350) | A plain index, not a data stream (the bulk `index` op with a fixed id needs that). Overrides the general `ping-logs` template (300). Default pipeline below. |
| Pipeline `pingone-events-normalize` | Adds `ping_product=pingone`, `ping_component`, `event_type`, `event_kind` (`admin`/`runtime`), `user`, `client_id`, `outcome`. |

## How the service is picked

An ordered prefix table on `action.type`; first match wins. 94 prefixes.

| `ping_component` | Prefixes (examples) | Measured? |
| --- | --- | --- |
| `sso` | `USER.ACCESS_`, `FLOW.`, `SESSION.`, `PASSWORD.` | yes |
| `mfa` | `AUTHENTICATION.`, `DEVICE.`, `OTP.`, `MFA`, `FIDO` | yes (first three) |
| `directory` | `USER.`, `GROUP.`, `ACCOUNT.` | yes (`USER.`) |
| `davinci` | `DAVINCI`, `DV_`, `FLOW_DEFINITION.`, `FLOW_EXECUTION.`, `CONNECTOR` | not yet seen |
| `authorize` | `AUTHORIZE`, `AUTHORIZATION`, `DECISION`, `POLICY_DECISION`, `TRUST_FRAMEWORK` | not yet seen |
| `protect` | `RISK`, `PROTECT` | not yet seen |
| `verify` | `VERIFY`, `VERIFICATION` | not yet seen |
| `credentials` | `CREDENTIAL`, `DIGITAL_WALLET` | not yet seen |
| `admin-config` | `APPLICATION`, `POPULATION`, `SIGN_ON_POLICY`, `ENVIRONMENT`, `KEY.` and similar | not yet seen |
| `other` | anything else | |

"Measured" means the prefix was seen on our store (631 events, 13 types on 2026-11-08). The DaVinci, Authorize, Protect, Verify and Credentials prefixes are a best guess until those services send an event. Note `FLOW.CREATED` is a sign-on flow (SSO), not a DaVinci flow.

`event_kind` is `admin` when the event carries the `adminIdentityEvent` tag, or when it is a `CREATED`/`UPDATED`/`DELETED` on a configuration object.

## In Kibana

Data view `ping-logs`, filter `ping_product : "pingone"`, split by `ping_component`. The Ping logs dashboard has a PingOne row and five saved searches. observability-LAB's Searches tab has a "PingOne webhooks" group with a service picker.

## Traps

- **Forwarding is an in-memory flag.** It was off after every pod restart until `FORWARD_ON_START=1` went into the app Secret. Turn it on by hand with `POST /api/sink {"enabled":true,"confirm":true}`.
- **The sink only takes https for a non-loopback Elasticsearch**, so it uses the public ingress, not the in-cluster service URL.
- After a pod restart the subscription once showed `FAILED 401` until its Authorization header was saved again. Cause unknown.
- PingOne queues events recorded after the subscription was created, even while it is disabled.
