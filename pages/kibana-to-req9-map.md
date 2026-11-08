---
title: "From a Kibana record to the requirement 9 map"
date: 2026-11-08
apps: [privilege-logging-LAB, Kibana, PingOne Privilege]
tags: [kibana, requirement-9, audit, diagrams, how-to]
summary: "Click a Privilege decision in Kibana and land on a diagram that shows user, agent, tool and decision for that one call. How the link works on a Basic license, how to pick a call, and what the map cannot show yet."
source: "owner findings, sanitized"
---

# From a Kibana record to the requirement 9 map

Written by the owner, 2026-11-08.

## The map

privilege-logging-LAB has a **Requirement 9** tab (<http://127.0.0.1:7801/#req9>). It draws one MCP call as a diagram: the user (a), the agent (b), the tool (c) and the policy decision (d), with the real values from the record. A picker lists the calls; a deep link opens one:

```text
http://127.0.0.1:7801/#req9/<RequestID>
```

The server side is `GET /api/req9[?rid=<RequestID>]`. When the read fails, the tab still lists the four questions so the page explains itself.

## The link out of Kibana

The Basic license has no URL drilldowns, so the link is a **runtime field** with a URL format:

| Data view | Field | Emits |
| --- | --- | --- |
| `privilege-logs` | `privilege.req9_map` | `Data.RequestID`, only when `Index` is `policy-decision-log` |
| `ping-logs` | `ping.req9_map` | the same |

Format: URL template `http://127.0.0.1:7801/#req9/{{value}}`, label `open map {{value}}`, custom label "Requirement 9 map". Add the column in Discover, or open a document, and click it. A Markdown panel "req9-map" on the Privilege overview and Ping logs dashboards explains this and links to the tab.

## What the records show (2026-11-08)

37 decision records, 28 distinct request ids.

| Part | Present |
| --- | --- |
| a. user | 37 of 37 |
| b. agent key | 14 of 37 |
| c. tool | 37 of 37 |
| d. decision | 37 of 37: 11 deny, 22 hold for approval, 4 released |

## Limits

- **Only calls a policy matched have a record.** A plain allowed call writes no decision, so it has no map. That is the open question for Ping.
- The agent key is missing on 23 of 37 records (saved search "Decisions missing the agent key").
- The tab's Real view reads the local PingOne Privilege console. When that console is down, the tab shows the recorded sample (Mock) and an error for Real.
