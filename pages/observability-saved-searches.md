---
title: "Saved searches and the Pipeline tab in observability-LAB"
date: 2026-11-08
apps: [observability-LAB, Kibana]
tags: [kibana, logging, searches, how-to]
summary: "What each of observability-LAB's 21 Kibana searches (and 3 ES|QL ones) answers, which data view it uses, and how the Pipeline tab shows where each product's logs travel."
source: "owner findings, sanitized"
---

# Saved searches and the Pipeline tab in observability-LAB

Written by the owner, 2026-11-08.

observability-LAB (<http://127.0.0.1:7800/>) has a **Searches** tab: each search is a question with a button that opens Kibana Discover with the query filled in. Some take a value (a user, a tool, a product). Data views: `privilege-logs` (P) and `ping-logs` (all products).

## Privilege (data view P)

The `privilege.*` fields are Kibana runtime fields over the record's `Data`.

| Search | Question | Query |
| --- | --- | --- |
| Everything one user did | What did this person do, through every agent and tool? | `privilege.user : <user>` |
| One agent key's calls | What did this key call, and what was decided? | `privilege.agent_key : <key>` |
| Calls to one tool | Who called this tool? | `privilege.tool : <tool>` |
| Calls to one app | What went to this app? | `privilege.app : <app>` |
| Policy denials | Which calls did policy deny? | `Index : "policy-decision-log" and privilege.decision : "deny"` |
| Approval holds | Which calls waited for a person? | `privilege.event : "policy_approval_required"` |
| Approvals released | Which held calls were approved? | `privilege.event : "policy_approval_released"` |
| AI Guard blocks | Which prompts did AI Guard deny? | `Index : "aiguard-log" and Data.Event : "llm_policy_denied"` |
| Decisions missing the agent key | Which decisions cannot be tied to a key? | `Index : "policy-decision-log" and not privilege.agent_key : *` |
| Console changes by one admin | What did this admin change? | `privilege_event_kind : "console" and User.Name : <admin>` |

## All Ping products (ping-logs)

`noise` marks known-harmless lines.

| Search | Question | Query |
| --- | --- | --- |
| One user across products | Where did this user show up? | `ping.user : <user>` |
| All real errors | What is actually failing? | `ping.is_error : true and not noise : true` |
| Errors for one product | What is failing in this product? | `ping_product : <product> and ping.is_error : true and not noise : true` |

## PingFederate, PingGateway

| Search | Query |
| --- | --- |
| Failed sign-ins | `ping_product : "pingfederate" and ping.outcome : "failure"` |
| Token requests for one client | `ping_product : "pingfederate" and client_id : <client>` |
| Admin changes | `ping_product : "pingfederate" and event_kind : "admin"` |
| Gateway errors | `ping_product : "pinggateway" and ping.is_error : true and not noise : true` |

## PingOne webhooks

| Search | Query |
| --- | --- |
| All events | `ping_product : "pingone"` |
| One service | `ping_product : "pingone" and ping_component : <service>` (sso, mfa, davinci, authorize, protect, verify, credentials, directory, governance, provisioning, admin-config, other) |
| Failures | `ping_product : "pingone" and ping.outcome : "failure"` |
| One user | `ping_product : "pingone" and ping.user : <user>` |

Three ES|QL searches cover the older PingOne index: latest events, failures, and events by type.

## Pipeline tab

The **Pipeline** tab draws where each product's logs travel: source, collector or exporter, pipeline, index, data view, dashboard. Click a box for what it is and how to check it. Use it when a search comes back empty: walk the boxes for that product left to right and find the first one that has no data.

## When a search is empty

1. Widen the Kibana time picker.
2. Check the data view (P vs ping-logs).
3. For a value search, check the exact value: KQL matches keywords exactly.
4. Walk the Pipeline tab for that product.
