---
title: How to add a page
date: 2026-11-08
apps: [field-notes-LAB]
tags: [how-to, field-notes]
summary: "Drop a Markdown file with a small front-matter block into pages/ and it becomes a page. Full, unsanitized notes go in your local Real folder, never in this repo."
source: "field-notes-LAB README"
---

# How to add a page

Every page is one Markdown file. Any `.md` file in the folder becomes a page; there is no code to change and no restart.

## Front matter

Start the file with this block (between two `---` lines):

```yaml
---
title: "What we learned about X"
date: 2026-11-08
apps: [privilege-logging-LAB, PingOne Privilege]
tags: [logging, how-to]
summary: "One or two sentences for the card on the page list."
source: "owner findings, sanitized"
---
```

| Field | Required | What it is |
| --- | --- | --- |
| `title` | yes | The page title on the card and the page |
| `date` | yes | `YYYY-MM-DD`; the list is newest first |
| `apps` | yes | The apps or products the page is about; the app filter uses it |
| `tags` | yes | Topics; the tag filter uses it |
| `summary` | yes | The text on the card |
| `source` | no | Where the content came from, for example "owner findings, sanitized" |

Lists can be inline (`[a, b]`) or one `- item` per line. The doctor fails when a page in `pages/` lacks a required field.

## Where a page goes

- [x] **Mock** shows `pages/` in this repo. Only **sanitized** pages go here: hosts are `.example` or `.invalid`, namespaces are placeholders such as `<gateway-namespace>`, ids are `<uuid>`, and people are "the owner". The repo tests and the doctor reject a real-looking host or a UUID.
- [x] **Real** shows a folder on your Mac named by `FIELD_NOTES_DIR` in `~/Development/.env`. Put the **full, unsanitized** notes there. That folder is read-only, served on loopback only, and refused when it sits inside this repo, so it can never be committed.
- [ ] Never copy a page from the Real folder into `pages/` without sanitizing it first.

## What renders

Headings (with an on-page contents list), tables, fenced code, task lists, block quotes, links and inline code. Raw HTML in a page is shown as text, never run, and only `http`, `https` and relative links become links. A page is capped at 512 KB and 20,000 lines.

Link to another page with a relative link, for example [the Privilege audit trail findings](./privilege-mcp-audit-trail.md).
