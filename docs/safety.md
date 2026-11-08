# Safety

What Field Notes does to stay safe, and the test that pins each part.

| Risk | Defence | Test |
| --- | --- | --- |
| Reached from another machine | Binds `127.0.0.1` unless `FIELD_NOTES_BIND` is set; Docker publishes `127.0.0.1:7804` only | `server/test/safety.test.js`, `scripts/compose.test.mjs` |
| DNS rebinding | Host must be loopback or on `LAB_ALLOWED_HOSTS` | `server/test/api.test.js` (Host check) |
| Cross-site mode switch | Writes must be same-origin (`Origin`, `Sec-Fetch-Site`) | `server/test/api.test.js` |
| Full notes leaking | Real only on a loopback bind, never in Docker, refused inside the repo; read-only | `server/test/api.test.js` (Real refused ...) |
| Reading outside the folder | Only safe `*.md` names directly in the folder; symlinks only to files in the same folder; slug validation | `server/test/pages.test.js` |
| Script in a page | Markdown becomes a tree rendered as React text; no `innerHTML`; raw is `text/markdown` + `sandbox` CSP | `web/src/App.test.jsx` (hostile page), `scripts/repo.test.mjs` |
| Dangerous links | Only http, https and relative links; images never loaded | `web/src/markdown.test.js` (link safety) |
| Hostile size or nesting | 512 KB and 20,000-line caps; line-length, depth and inline-depth caps; linear scans | `server/test/pages.test.js`, `web/src/markdown.test.js` (bounded) |
| Outbound calls | Netguard refuses every non-loopback socket, DNS lookup, fetch and UDP send | `server/test/netguard.test.js`, zero-attempt tests in `api.test.js` and `App.test.jsx` |
| Unsanitized shipped page | Doctor and tests reject real hosts, UUIDs and @mentions in `pages/` | `scripts/pages.test.mjs`, `server/test/safety.test.js` |
