---
title: "Getting Privilege logs into Elasticsearch"
date: 2026-11-08
apps: [privilege-logging-LAB, PingOne Privilege, Elasticsearch]
tags: [logging, siem, elasticsearch, how-to, requirement-9]
summary: "Why the Privilege SIEM export stored only console events, how one ingest pipeline fixed it without touching the console, and how a small bridge copies the decision records Privilege never exports."
source: "owner findings, sanitized"
---

# Getting Privilege logs into Elasticsearch

Written by the owner, 2026-11-08. Sanitized copy: the Elasticsearch host is `siem.example.invalid`, the namespace is `<es-namespace>`.

## Bottom line

All Privilege logging now lands in one index, `ping-siem-events-v2`, with console and runtime records told apart by `privilege_event_kind`. Two paths feed it:

1. **Privilege's own SIEM export** (console Settings, type Elastic) writes console records (`audit-log`) and gateway HTTP records (`proxy-audit-log`).
2. **Our bridge** copies the three record kinds Privilege does not export: `policy-decision-log`, `aiguard-log` and `agent-approval-log`.

## What was wrong

| Symptom | Cause |
| --- | --- |
| Only console events in the index | The index had no template. The first console event mapped `Data` as text; every runtime event sends `Data` as an object, so Elasticsearch refused it with a 400. |
| Index stats showed 0 failures | A refused bulk item never reaches the index, so nothing counts it. 204 runtime events were refused between 2026-10-21 and 2026-11-08. |
| Keys stored in plain text | `aiguard-log` carries full virtual keys; a console save of an agent key writes the provider key into `audit-log`. The old index held 49 such keys, 15 distinct. |

## The fix (no console change)

The console returns its SIEM password empty, so editing the export config risked breaking it. Everything was done on the Elasticsearch side:

| Object | What it does |
| --- | --- |
| Pipeline `privilege-siem-normalize` | String `Data` goes to `DataText`, an object `Data` is kept (mapped `flattened`). Adds `privilege_event_kind` (`console` for `audit-log`/`event-log`, else `runtime`). Drops Authorization, Cookie and X-Api-Key headers. Masks `sk-` keys to the first 8 and last 4 characters, also in `Status` and `Message`. |
| Template + index `ping-siem-events-v2` | The new home. Default pipeline = normalize. The 1,432 old documents were copied in, masked. |
| Pipeline `privilege-siem-route-v2` | Set as the default pipeline of the OLD index name, so every export write to `ping-siem-events` is normalized and redirected into v2. |
| Stub index `ping-siem-events` + template `ping-siem-events-stub` (priority 400) | The old index (with the plain-text keys) was deleted after every id was found in v2, and recreated empty with the route pipeline. The stub template re-applies the route if the index is ever auto-created. It stays at 0 documents. |

Verified: the first real runtime record stored at 02:02 UTC on 2026-11-08, and an export write through the stub landed in v2.

Undo the redirect: `PUT ping-siem-events/_settings {"index":{"default_pipeline":null}}`.

## The bridge

`npm run bridge` in privilege-logging-LAB reads `policy-decision-log`, `aiguard-log` and `agent-approval-log` through the local console API every 60 seconds and writes them into v2 under their own ids, with a write-only API key (`privilege-logs-bridge`). It runs as a launchd agent on the owner's Mac because it needs the local PingOne Privilege console. It catches up after the console has been down. First run backfilled 30 days: 37 decision and 531 AI Guard records.

```sh
launchctl bootout gui/$(id -u)/com.curtismu7.privilege-logs-bridge   # stop
tail -f ~/Library/Logs/privilege-logs-bridge.log                       # watch
```

## What is still missing (Ping)

- Allowed calls write **no** `policy-decision-log` record. Only calls a deny or approval policy matched have one.
- Privilege does not export decision, guardrail or approval records itself; without the bridge they stay in Privilege.
- The 15 leaked keys are not rotated yet (owner's choice, deferred).

## How to read it

Data view `privilege-logs` in Kibana, or query `ping-siem-events-v2` and filter `privilege_event_kind : "runtime"` or `"console"`. The runtime fields `privilege.user`, `privilege.agent_key`, `privilege.tool`, `privilege.app` and `privilege.decision` are Kibana runtime fields over `Data`.
