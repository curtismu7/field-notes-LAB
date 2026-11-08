---
title: "Privilege MCP audit trail: what it logs (findings so far)"
date: 2026-11-08
apps: [privilege-logging-LAB, PingOne Privilege]
tags: [logging, siem, elasticsearch, audit, requirement-9]
summary: "What PingOne Privilege logs for an MCP tool call, scored against requirement 9 (user, agent, tool, decision): the gaps, the fixes on our side, the questions for Ping and every test result so far."
source: "owner findings, sanitized"
---

# Privilege MCP audit trail: what it logs (findings so far)

Written by the owner, 2026-11-07. Sanitized copy: hosts, namespaces, ids and the gateway's internal product names are placeholders.

## Requirement and bottom line

Privilege does not yet show us one log record that names the user, the agent, the tool and the policy decision for an MCP tool call. Only the PingGateway audit header carries all four, and it is not stored anywhere.

The customer requirement (item 9): the gateway gives an end-to-end audit trail for all MCP interactions, and each record clearly shows:

- a. the user on whose behalf the MCP tool call was made
- b. the agent identity acting for that user
- c. which tool was called
- d. the authorization policy decision

Status: the hosted gateway log meets a, c and part of d for an allowed call, with weak evidence for b. It records user, tool name, arguments and an app-level permission, but no explicit per-tool allow or deny line, and no agent identity beyond the OAuth client ID. A denied `tools/call` is still untested.

## What Privilege does not log today

Privilege records a per-call decision with user, agent, tool and verdict only when a policy matches the call, and it does not export that record to our Elasticsearch. Measured 2026-11-07 and 2026-11-08 on our tenant and the hosted gateway.

| Gap | What we saw | Effect on requirement 9 |
| --- | --- | --- |
| Allowed calls write no decision record | Six allowed `hostile-mcp` calls (19:44, 19:51, 21:39, 22:55, 23:01 on 11-07, 00:42 on 11-08) have no `policy-decision-log` entry. Only calls a HITL or deny policy matched have one (5 records in a week). | (d) decision is missing for every ordinary allowed call. |
| Decision, guardrail and approval records are not exported | The SIEM export sent only `audit-log` (console) and `proxy-audit-log` (gateway HTTP) records. `policy-decision-log`, `aiguard-log` and `agent-approval-log` never left Privilege's hosted Elasticsearch. | The one record with all four fields never reaches our SIEM. |
| Runtime events were rejected by our index | All 204 runtime events sent since 2026-10-21 were refused: the index had mapped `Data` as text from the first console event. Index stats showed 0 failures. | Fixed 2026-11-08 (next section). |
| Gateway HTTP records lack tool and decision | `proxy-audit-log` names the user and app path; the tool only when the client sends an `Mcp-Name` header; no decision. | (c) and (d) missing for the most common runtime record. |
| Rejected calls (401) name no one | The gateway log has app, method, path and caller address only. | (a), (b), (c) missing for refused credentials. |
| No shared request id | `RequestID` does not join the indices. `TraceID` matches the `traceparent` header in some records, not all. | A call cannot be followed reliably across records. |
| Keys stored in plain text | `aiguard-log` stores full virtual keys (`VirtualKeyID`); a console save of an agent key stores the provider key (`RealKey`) in `audit-log`. Our old SIEM index held 49 such keys, 15 distinct. | A security exposure, not a gap in coverage. |
| Only one gateway pod's file is visible | The hosted gateway has several nodes (gateway-1, -2, -3). Each writes its own `<gateway-proxy>.log`; our sidecar reads one. | Pod-log evidence is partial by design. |

## What real runtime logging needs

Full runtime logging needs three things: our Elasticsearch accepting runtime events (done), the unexported Privilege records copied in (our bridge, running), and decision records for allowed calls (only Ping can add).

| Step | Owner | Status | What it gives |
| --- | --- | --- | --- |
| Accept runtime events in Elasticsearch | Us | Done 2026-11-08 02:00 UTC | Writes to `ping-siem-events` now go through a pipeline into `ping-siem-events-v2`. Console and runtime events both store, each labelled `privilege_event_kind`, credential headers dropped, keys masked. First runtime event stored 02:02 UTC. No console change. |
| Copy decision, guardrail and approval records in | Us (bridge) | Running since 2026-11-08 02:18 UTC (30-day backfill: 37 decision and 531 AI Guard records copied) | A small poller reads `policy-decision-log`, `aiguard-log` and `agent-approval-log` through the console API every minute and writes them into `ping-siem-events-v2` under their own ids. Runs on the owner's Mac, because it needs the local PingOne Privilege console and no cloud API credential is available. It catches up after the console is down. |
| Decision records for allowed calls | Ping | Asked (next section) | Without it, an ordinary allowed call never has an explicit decision anywhere. |
| Export the decision, guardrail and approval indices | Ping | Asked | Removes the need for the bridge and the dependency on one Mac. |
| One request id across all records | Ping | Asked | Lets one MCP call be followed from HTTP request to decision to guardrail verdict. |
| Stop storing keys in plain text | Ping | Asked | Our side now masks keys on the way in; Privilege's own indices still hold them. |

To tell console from runtime events in `ping-siem-events-v2`, filter on `privilege_event_kind`. Console events come from `audit-log` and `event-log`; everything else is runtime.

## Questions for Ping

These six answers decide whether Privilege alone can meet requirement 9, or whether we keep the bridge.

1. Can allowed MCP calls write a `policy-decision-log` record (Decision `allow`, with User, AgentKey, Target and PolicyIDs), or is there a setting for it? Today only calls a HITL or deny policy matches get one.
2. Can the SIEM export include `policy-decision-log`, `aiguard-log` and `agent-approval-log`? The export config has one index field and no stream choice; we saw only `audit-log` and `proxy-audit-log` sent.
3. Why do `audit-log` and `aiguard-log` store keys in plain text (the provider `RealKey` on an agent save, the full `VirtualKeyID` on guardrail events), and can they be masked at source?
4. Is there one id that joins a call across `proxy-audit-log`, `policy-decision-log` and `aiguard-log`? `RequestID` does not, and `TraceID` matches only some records.
5. Can the SIEM export report delivery errors? Every runtime event was refused by our index for 18 days and the console showed no status.
6. Is there a cloud API credential (not the 60-minute browser cookie) a service can use to read `elasticlog`, so the bridge can run in Kubernetes instead of on one person's Mac?

## Corrections to earlier findings in this doc

Three statements further down were wrong; the sections above supersede them.

- "Elasticsearch holds no MCP events." Wrong for Privilege itself: its hosted Elasticsearch has a `policy-decision-log` with user, agent key, tool, decision, reason and policy for every call a policy matched. Our in-cluster SIEM index lacked runtime events only because it rejected them.
- "The OpenSearch shipper has not delivered since 2026-10-26." We had read a second, unused OpenSearch instance. The one the sidecar writes to (namespace `<sidecar-namespace>`) is live: 1,953 documents, newest 2026-11-08.
- "The SIEM index holds console changes only." True of what was stored, but runtime events were being sent and refused, not left out by Privilege.

## How we tested

We read every place Privilege could write an audit record, then tried to drive real MCP traffic through it and capture the result.

1. Read the Privilege console on the local desktop app: Activity Logs (Audit, Event, Proxy Audit, Proxy Event) and Agent Insights (AI Guard).
2. Queried the SIEM feed in Elasticsearch (`ping-siem-events`) and the OpenSearch index `gateway-events`.
3. Tailed the hosted gateway log (`<gateway-deployment>`, container `log-tailer`, `/var/log/<gateway>/<gateway-proxy>.log`) from 15:42 UTC on 2026-11-07, with bearer tokens and keys masked.
4. Used our demo app, switched to PingOne Privilege and signed in, to send traffic through the gateway.
5. Looked for the PingGateway `mcpAudit` record (the `X-Gw-Audit-Trail` response header, also seen in gateway logs on 403 denials).

Caveat: the log tail is still running and holds masked copies of gateway logs in a scratch folder. Stop it and delete the folder when testing ends.

## The four required fields, scored

On the hosted gateway, user and app-level decision are logged, agent is weak, and tool-call evidence is missing so far. The local device proxy is worse.

| Field | What we saw | Status |
| --- | --- | --- |
| a. User | Hosted gateway logs a decoded principal UUID (`Principal {User …@@@default@@@<uuid>} has permission for {Application …}`) and the user UUID on denials. The email is blank. The local proxy names the enrolled device user whoever the caller is. | Partial |
| b. Agent | The request payload is logged, so `clientInfo.name` appears, but the client sets that itself. Denials show only `(agent=false)`. Each request also logs the OAuth client ID next to the user UUID, which may identify the agent. | Weak |
| c. Tool | Tool names appear when the gateway removes unauthorized tools from a list response (`Removing unauthorized tool … from MCP response`). For an allowed `tools/call` the log also says "MCP call detected for method tools with target: \<tool>" and records the arguments. | Met for allowed calls |
| d. Decision | App-level allow lines and denials (`[mcpgw] policy denied <uuid> access to <app>`) exist. No allow or deny line for an individual tool call; it has to be inferred from the app-level permission line and the granted-tool list. | Partial |

The one record with all four fields is the PingGateway `mcpAudit` block (event PING-GATEWAY-MCP: user and agent subject, MCP method and tool, decision, filter chain). It reaches the caller only as the `X-Gw-Audit-Trail` response header and is not persisted. Requests rejected at token authentication (401) get no audit header at all.

## Tool-call test results

Two allowed `tools/call` requests on the `hostile-mcp` app were captured in the hosted gateway log: `get_weather` at 19:20:15 UTC and `read_ticket` at 19:21:06 UTC. Both returned HTTP 200 for the signed-in demo user. A denied `tools/call` was not tested.

For each call the gateway wrote these lines:

- `MCP call detected for method tools with target: get_weather`, which names the tool.
- The full request body, including arguments (`"name":"read_ticket","arguments":{"ticket_id":"audit-T02"}`).
- `Access token found for user: <uuid>, client: <oauth client id>`, which names the user and the OAuth client.
- `Principal {User …} has permission for {Application … hostile-mcp}` and `has policy based capabilities`, plus the list of granted tools in the `X-<Gateway>-Mcp-Cap` header.
- A structured JSON record (`Received HTTP request`) with `User`, `Device`, `Tenant`, host, method and path, but no tool name.
- The full tool response, including text returned by the tool.

What is missing: no line says "allow" or "deny" for the tool itself. The decision has to be inferred from the app-level permission line and the granted-tool list. Elasticsearch received no new events for either call (0 events since 19:15 UTC).

## What each log location contains

No store we checked holds a confirmed MCP tool-call audit record with all four fields.

| Location | Contents | Meets item 9? |
| --- | --- | --- |
| Hosted gateway log (`<gateway-proxy>.log` in the `log-tailer` container) | Full JSON-RPC request payloads, user principal UUID, app-level allow and deny lines, list-filter removals by tool name. It rotates at about 50 MB. | Partly, and a tools/call line is unconfirmed |
| Console Activity Logs, local proxy rows | Attributed to the device user, with no tool, decision or agent. | No |
| Console Agent Insights (AI Guard) | Guardrail verdicts on LLM routes, tagged with OWASP, MITRE and NIST. | No, it covers LLM traffic |
| SIEM feed, Elasticsearch `ping-siem-events` | Console REST API request audit only (1,397 events, none for MCP tool calls; see the Elasticsearch section). The SIEM config has no event or source filter. | No |
| OpenSearch `gateway-events` (`<cluster-namespace>`) | The shipper forwards only LLM requests, AI Guard events and A2A events. Stale since 2026-10-26. | No |
| PingGateway `X-Gw-Audit-Trail` header | All four fields. Returned to the caller only; not stored. | Yes in content, but not persisted |

Not yet checked: console Session Logs, HITL Requests and Access Requests pages.

## Gaps and questions for Ping

1. Does the gateway log one line per `tools/call` that names the tool and the policy decision? We have not seen one.
2. Can the PingGateway `mcpAudit` record be written to a log or sent to the SIEM, instead of only returned as a response header?
3. Can the SIEM feed include gateway MCP events? Today it carries console API requests only.
4. Why is the user email blank in the gateway identity line, and can the line carry the email?
5. Can denials name the agent identity (they show `agent=false`), and can the agent field come from the key or workload identity instead of the client-supplied `clientInfo`?
6. Why does the `gateway-events` shipper forward only LLM, AI Guard and A2A events, and why has it been stale since 2026-10-26?
7. Does the local device proxy have a way to attribute calls to the real caller instead of the enrolled device user?

## Still to test

Done: two allowed `tools/call` requests (19:20 and 19:21 UTC) were captured and scored above. Still open: a denied `tools/call`, an agent-key call, and the console Activity Log for the allowed calls.

Second run, 19:17 UTC: the client sent only a connection handshake and list calls (`server/discover`, `initialize`, `tools/list`, `prompts/list`, `resources/list`), plus one policy denial on `opensearch`. The demo app log shows the page called `/api/privilege-mcp/tools/list`, so the client never issued a `tools/call`. The gateway log also shows an OAuth client ID beside the user UUID on each request (`Access token found for user: <uuid>, client: <id>`). That is a better candidate for the agent field than the self-reported client name, and it has not been tested against the four agent keys.

- [ ] Allowed `tools/call` on a granted app, with a distinctive argument such as `audit-T01`, then read the gateway log, console Activity Log and response headers for it
- [ ] `tools/call` on a tool or app the user is not granted (expect a policy denial line)
- [ ] `tools/call` through an agent-key door, to see whether the agent field is populated
- [ ] Console Session Logs, HITL Requests and Access Requests pages
- [ ] Guardrail, human-approval and rate-limit events (tests C1 to C4)
- [ ] A2A calls, an aggregate MCP door, and logs from every gateway pod (tests D1 to D3)
- [ ] 15:51 UTC traffic from client "PingOne Privilege MCP Client" (hostile-mcp and opensearch) confirmed by the owner as their own test; it held only discover, initialize and list calls, no tools/call

## Elasticsearch logging: what the SIEM index holds

Elasticsearch holds 1,397 console audit events and none of them is an MCP tool call, so it cannot satisfy item 9. Queried read-only on 2026-11-07 at 19:09 UTC, index `ping-siem-events`.

| Check | Result |
| --- | --- |
| Event count | 1,397 (was 219 on 2026-10-03) |
| Date range | 2026-09-15 to 2026-11-07 15:21 UTC |
| Events since our tests began (15:40 UTC) | 0 |
| Module `apigw` | 1,391 events, each a call to the console REST API (`HTTP PUT Request console.example.invalid/api/<tenant>/v1/…`) |
| Other modules | `secret-access` 2, `cloudagent-access` 1, `gcp-secrets-update` 1 |
| Messages containing `/mcp` | 8, all console edits to MCP app definitions (`mcpdemo`, `mcp-grafana`, `mcp-brave-search`), 2026-10-04 to 2026-10-11 |
| `tools/call` events | 0 |

What a record carries: timestamp, module, a message naming the HTTP method and console path, the device, a `Data` object holding the changed config object, and an `Index` value of `audit-log`. It answers who changed a policy or key. It does not say who called which tool or what was decided.

Two things follow. First, our MCP test traffic created no new events, which confirms the gateway data path is not wired to this feed. Second, the SIEM configuration has no event or source filter, so the fix is on the Privilege side: gateway MCP events would need to be added to the feed.

The shipper design in the repo (`GATEWAY-LOGGING-WITH-ELASTICSEARCH.md`) is the alternative: ship `<gateway-proxy>.log` to Elasticsearch ourselves. That would capture the hosted gateway lines described above, but only what the gateway writes, so it inherits the same gaps for agent, tool and decision.

## Full Privilege test matrix

Every case is read in six places: hosted gateway log, console Activity Log, Agent Insights, Elasticsearch `ping-siem-events`, OpenSearch `gateway-events`, and the response header. Each is then scored on user, agent, tool and decision. Inventory read from the local console on 2026-11-07: 17 agent keys, 7 federated identities (`NonHumanIdentity`), 29 apps.

| ID | Identity | Surface | Case | Status |
| --- | --- | --- | --- | --- |
| U1 | Signed-in user | MCP | Allowed `tools/call` (`get_weather`, `read_ticket`) | Done: user and tool logged, no decision line |
| U2 | Signed-in user | MCP | `tools/list` filtered to granted tools | Done: removed tools logged by name |
| U3 | Signed-in user | MCP | App not granted (`opensearch`) | Done: `policy denied`, `agent=false` |
| U4 | Signed-in user | MCP | Denied `tools/call` on a granted app | Needs a script |
| U5 | Signed-in user | MCP | Human approval (`opensearch-hitl`) | Needs the user in the console |
| U6 | Signed-in user | A2A | `hostile-a2a`, `langchain-midagent` | Not run |
| N01 | None | MCP | No bearer on `hostile-mcp` | Done: 401, logged as `auth rejected: missing/invalid bearer`, no body or tool |
| N02 | Unknown key | MCP | Made-up bearer | Done: 401, logged as `reason=token_not_found` |
| N03 | Malformed token | MCP | Unsigned JWT | Done: 401, same `token_not_found` line as N02 |
| K1 | Agent key | MCP | Allowed call (`meridian-agent`, no guardrail) | Needs a test key |
| K2 | Agent key | MCP | Key without `mcp` scope (`langchain-caller`, a2a only) | Needs a test key |
| K3 | Agent key | MCP | Revoked key (`google`) | Needs a test key |
| K4 | Agent key | MCP | Expired key (`local`, `tmp-pf-route-c-key`) | Needs a test key |
| K5 | Agent key | MCP | App not in the key's grant | Needs a test key |
| K6 | Agent key | LLM | Rate limit and budget (429) | Needs a test key |
| K7 | Agent key | LLM | Guardrail block and sanitize | Needs a test key |
| F1 | Federated identity | MCP | Valid token (`PFtoken`, `MeridianAgent`) | Needs a token |
| F2 | Federated identity | MCP | Wrong audience, wrong issuer, expired, too long-lived | Needs a token |
| F3 | Federated identity | MCP | Kubernetes and Docker sensor identities | Needs a token |
| G1 | Any | MCP, A2A | Guardrail verdicts and HITL events in Agent Insights | Not run |

What the no-credential cases (N01 to N03) show: rejected requests are logged at warning level with the app, method, path and caller IP, but not the tool, the arguments or any identity. Requirement 9 asks for an audit trail of all MCP interactions, so these rejections have no user, agent or tool to report.

## Agent key test results (key `audit-test`, 19:44 UTC)

With an agent key the gateway log names the user, the agent and the tool on an allowed call. It still has no explicit allow or deny line for a tool, and a denied call loses the tool name. Eight calls went to the hosted gateway at `gateway.example.invalid`.

| Call | Result | What the gateway logged |
| --- | --- | --- |
| A1 `initialize` | 200 | User UUID, `client: audit-test`, app permission lines |
| A2 `tools/list` | 400 `content_blocked` | AI Guard event `mcp_response_blocked`: user, client `audit-test`, category `malicious_content`, detector findings, OWASP LLM01, MITRE AML.T0051, NIST MAP-2.3, request ID. The tool descriptions contain injected instructions. |
| A3 `get_weather` | 200 | `MCP call detected … target: get_weather`, user, `client: audit-test`, arguments in the request body |
| A4 `read_ticket` | 200 | Same lines with `target: read_ticket`. This call was meant to be denied. |
| A5 `no_such_tool` | 403 | `policy denied <user> access to hostile-mcp (agent=true)`. No tool name, no "MCP call detected" line. |
| A6 `tools/list` on `opensearch` | 403 | `policy denied <user> access to opensearch (agent=true)` |
| A7 A2A call to `hostile-a2a` | 500 | App permission found, then `connection refused`: the backend is down |

Findings:

1. **Agent field works with a key.** The `Access token found` line shows `client: audit-test`, which is the key name, and denials now say `agent=true`. The user is the key's custodian.
2. **Requirement 9 is met for allowed calls with a key**: user, agent and tool are all in the log. The decision is still inferred, not logged.
3. **A denied call logs no tool name**, so the trail cannot say which tool was refused.
4. **The AI Guard record is the only structured decision record.** It carries user, client and a block verdict, but it records a guardrail finding on a response, not an authorization policy decision.
5. **`read_ticket` was allowed but the key was not granted `hostile-mcp`.** The key's own policy covers `a2a-mcp-tools` (all tools) and `langchain-midagent` only. `hostile-mcp` is granted by a separate policy with no key attribute. So the key reaches `hostile-mcp` and all four of its tools by some other route, most likely the custodian's own permissions. That is unverified.
6. **The intent encoder is unreachable from the hosted gateway.** The log warns `aiintent … not usable, intent signals stay unavailable`, with a failed DNS lookup of `local.example.invalid`. The Triton URL only works for gateways on this Mac.
7. **Other warnings:** the key's purpose profile "constrains nothing" and is ignored, and the log shipper reports `Error sending message to nebula: EOF`.

Not yet run with a key: revoked and expired keys, a key without `mcp` scope, LLM rate limit and guardrail cases, and the federated identities.

## Use cases run with the test key (19:51 UTC), checked against Elasticsearch

The Elasticsearch index `ping-siem-events` (in the cluster, namespace `<cluster-namespace>`) received nothing for any of these use cases: it held 1,400 events before and 1,400 after. The only new events that day were the console changes that created the `audit-test` key and its policy at 19:42:24 UTC (`POST …/agentaccesskeys` and `POST …/pacpolicys`).

| Use case | Call | Result | Gateway pod log (`<gateway-proxy>.log`) | Elasticsearch |
| --- | --- | --- | --- | --- |
| MCP tool call allowed | `get_weather` | 200 | User, `client: audit-test`, tool name, arguments | Nothing |
| MCP tool call with injected argument | `get_weather` with an injection sentence | 200, not blocked | Same lines as an allowed call | Nothing |
| MCP tool list screened by AI Guard | `tools/list` on `hostile-mcp` | 400 `content_blocked` | `mcp_response_blocked` record with user, client and findings | Nothing |
| MCP app not granted | `tools/list` on `opensearch` | 403 | `policy denied … (agent=true)`, no tool | Nothing |
| Aggregate door | `tools/list` on `aggregate`, `aggregate-limited` | 200 | Almost nothing logged | Nothing |
| Aggregate door with no tools | `tools/list` on `aggregate-none` | 400 `request refused by policy` | Almost nothing logged | Nothing |
| A2A through the gateway | `langchain-midagent` | 500 backend refused connection | Almost nothing logged | Nothing |
| LLM call allowed | `claude-haiku-4-5` | 200 | Nothing found | Nothing |
| LLM model not on allowlist | `gpt-4o-not-allowed` | 403 `not allowed for this key` | Nothing found | Nothing |
| LLM prompt injection | injection sentence | 400 `content_blocked: prompt_injection` | Nothing found | Nothing |

Only the single-app MCP routes write detailed lines to the gateway pod log. The aggregate, A2A and LLM routes returned real answers but left almost no lines in `<gateway-proxy>.log` or in any other pod in the cluster. The OpenSearch index `gateway-events`, which used to receive LLM and AI Guard events from that log, has not had a new event since 2026-10-26. The log shipper also reports `Error sending message to nebula: EOF`. The cause is not verified: these events may now go to the Privilege console instead of the pod log, and I have not yet checked the console's Activity Log or Agent Insights for these calls.
