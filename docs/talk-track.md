# Talk track — Field Notes LAB

Three minutes, Mock mode (the sanitized pages shipped in the repo). Say first: "Mock mode shows the sanitized pages in this repo — hosts, namespaces and ids in them are placeholders. Real mode shows my actual notes and can name real hosts and tenants, so do not share a Real-mode screen with a customer."

1. **The idea.** "This is a library of pages about our apps and what we learned — findings, how-tos and investigations. Each page is one Markdown file; dropping a new file into `pages/` adds it, no code, no restart."
2. **The list.** "Newest first, each card carries its apps and tags. The app filter, tag chips and the search box all narrow the list live — try searching a product name."
3. **The flagship page.** Open `Privilege MCP audit trail`. "This is the write-up of Privilege MCP logging scored against our audit requirement — what the gateway records, what it does not, and the gaps we found."
4. **Follow the trail.** Open `Kibana to req9 map` while that is fresh. "Every Kibana record deep-links straight into the audit-trail diagram by Request ID — click one and the same request lights up over there."
5. **The ops pages.** `Privilege logs into Elasticsearch` (the SIEM export fix), `Observability saved searches` (21 searches plus the Pipeline tab), and the two gateway K8s pages — the customer package and the operations do/don't tables.
6. **A lesson.** Open `Lesson: rotating a leaked webhook credential`. "Not everything here is a product claim — some pages are lessons we paid for."
7. **Safety posture.** Point at the banner. "Safe rendering: raw HTML shows as text, images never load, sizes are capped, and the app makes no outbound network calls. Owner findings, sanitized."
8. **Adding a page.** Open `How to add a page`. "Front matter, Markdown, done — that is the whole workflow."

## Notes for the presenter

- The in-app talk-track dialog lists each page title with its card summary; this doc is the full script.
- Pages marked "findings so far" / "not yet seen" are owner findings, not verified product claims — say so if asked.
- Real mode is host-run only (it reads `FIELD_NOTES_DIR` from `~/Development/.env`) and is refused in Docker.
