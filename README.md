# Field Notes LAB

Tier: Tool.
Repo: https://github.com/curtismu7/field-notes-LAB

A library of pages about our apps and what we learned: findings, how-tos and investigations. Each page is one Markdown file in `pages/` with a small front-matter block. Any `.md` file dropped into the folder becomes a page, with no code change and no restart.

Open it: <http://127.0.0.1:7804/>

## Two modes (header toggle on every page)

| | Mock | Real (owner-run) |
| --- | --- | --- |
| What it shows | The **sanitized** pages shipped in this repo's `pages/` folder. Hosts are `.example`/`.invalid`, namespaces and ids are placeholders, people are "the owner". | Your **full, unsanitized** notes in the local folder named by `FIELD_NOTES_DIR` in `~/Development/.env` (or the environment). |
| Where | Host or Docker. | Host only (`./scripts/run.sh`), loopback only. Refused in the Docker image (its bind is not loopback and nothing is mounted), and refused when the folder sits inside this repo, so the full notes are never committed. |
| Access | Read-only. | Read-only. Only `*.md` files directly in that folder; a symlink is followed only to a file in the same folder; no traversal. |
| Network | None. | None. |

The toggle follows rule 19: `POST /api/mode` with exactly `{ "source": "mock" | "real" }`; `GET /api/info` returns `source` and `realAvailable`. Real not configured: the button is disabled with a how-to tooltip and the server answers 409. Default: Real if configured, else Mock; `MODE=mock` forces Mock (the Docker image sets it). Switching reloads the page list and the open page without a restart.

## Pages

1. **Pages** (`#/`): a card per page (title, date, apps, tags, summary), newest first. Filter by app and by tag (or click a chip on a card), and full-text search over title, summary, apps, tags and body (a plain substring, never a regex).
2. **Page view** (`#/page/<slug>`): the metadata, an "On this page" contents list, the rendered Markdown (headings, GitHub tables, fenced code, task lists, block quotes, links), **Open raw Markdown** and **Download .md**.
3. **About** (`#/about`): what Mock and Real show and how rendering stays safe.

The simulation banner is the first thing on every page and says which content is shown.

## Adding a page

Create `pages/<slug>.md` (letters, digits, `.`, `_`, `-`):

```yaml
---
title: "What we learned about X"
date: 2026-11-08
apps: [privilege-logging-LAB, PingOne Privilege]
tags: [logging, how-to]
summary: "One or two sentences for the card."
source: "owner findings, sanitized"
---
```

`title`, `date`, `apps`, `tags` and `summary` are required for a shipped page (the doctor and the tests fail without them). Only sanitized pages go in `pages/`; the tests reject a real-looking host, a UUID or an @mention. Full notes go in your Real folder. The page "How to add a page" says the same inside the app.

## Safe rendering

- Markdown is parsed into a tree and rendered as React elements: raw HTML in a page is shown as text and never runs. No `innerHTML` anywhere.
- Links: only `http`, `https` and relative links become links (external ones open with `rel="noopener noreferrer"`). `javascript:`, `data:`, `vbscript:`, `//host` and anything with control characters render as plain text. Images are never loaded; they show as `[image: alt]`.
- Bounded input: a page is refused above 512 KB or 20,000 lines; the viewer caps line length and nesting depth; every scan is linear (a hostile-page test checks it).
- Raw Markdown is served as `text/markdown` with `Content-Security-Policy: default-src 'none'; sandbox` and `nosniff`.

## Run from a clone

Prerequisites: Node 26 or newer. Docker (OrbStack) only if you use the Docker form. Mock needs no setup.

```sh
git clone https://github.com/curtismu7/field-notes-LAB.git
cd field-notes-LAB
npm ci
npm run build
npm run doctor
npm start
```

Open http://127.0.0.1:7804/ (the server serves the built page). `GET /api/health` answers `demo-health/1`. Or with Docker: `HOST_PORT=7804 docker compose up --build -d` from the same folder (Mock only).

## Ports, and what to do if the port is taken

```
Ports: field-notes-LAB listens on 7804 only. Docker publishes it on 127.0.0.1:7804 only.

If the port is taken:
1. Find what is using it:
   lsof -iTCP:7804 -sTCP:LISTEN -n -P
2. If it is an old copy of this lab (npm start), stop that process: kill <PID>.
   If it is this lab's container: docker compose down (from this folder).
3. If it is something else, stop it. The lab refuses any other port on purpose
   (one port per app; npm run doctor says so), so free 7804 rather than moving the lab.
4. Then start again: npm start, or docker compose up -d.
```

## Run

```sh
./scripts/run.sh                                  # host: install, build, doctor, start on http://127.0.0.1:7804/
HOST_PORT=7804 docker compose up --build -d       # OrbStack (never Docker Desktop): Mock only, published on 127.0.0.1
npm test                                          # server (node:test), web (vitest against the real server), repo scans
npm run doctor                                    # preflight, including the netguard self-test
```

Safety: loopback-only bind, Host check (loopback or `LAB_ALLOWED_HOSTS`), same-origin writes, CSP with `frame-ancestors 'none'`, a netguard that refuses every outbound socket, DNS lookup, fetch and UDP send (with a self-test and a test that asserts zero attempts). See `docs/safety.md`.

Structure follows `privilege-logging-LAB` (npm workspaces `server/` + `web/`, Express, React + Vite, safety, netguard and doctor helpers); none of its identity, data or tests are carried over. The first page is a sanitized copy of the owner's Privilege MCP audit-trail findings.
