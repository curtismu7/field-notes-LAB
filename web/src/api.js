// Same-origin JSON calls. Errors carry the HTTP status so a page can say "not found" rather than "failed".
export async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) { const e = new Error(body?.detail || body?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return body;
}

// POST /api/mode: the rule 19 Mock/Real toggle. 409 when Real is not configured.
export async function setMode(source) {
  const r = await fetch("/api/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) });
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
}

export const pagesUrl = ({ q = "", app = "", tag = "" } = {}) => {
  const p = new URLSearchParams();
  if (q) p.set("q", q); if (app) p.set("app", app); if (tag) p.set("tag", tag);
  const s = p.toString();
  return `/api/pages${s ? `?${s}` : ""}`;
};
export const pageUrl = (slug) => `/api/pages/${encodeURIComponent(slug)}`;
export const rawUrl = (slug, download = false) => `${pageUrl(slug)}/raw${download ? "?download=1" : ""}`;
