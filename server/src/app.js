// One Express app. /api = health, shelf, info, the Mock/Real toggle (rule 19), the page list (search + filters), one page, raw Markdown.
// Loopback Host check and same-origin writes on everything. Pages are read from disk per request: Mock = the repo's pages/ folder,
// Real = FIELD_NOTES_DIR (read-only). Serves web/dist when it exists. Nothing here makes an outbound call.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { hostCheck, sameOriginWrites } from './safety.js';
import { createHealth } from './health.js';
import { modeFrom, realConfig } from './config.js';
import { LIMITS, MOCK_DIR, PageError, isSlug, loadAll, loadOne, search } from './pages.js';
import { mountShelfRoute } from './shelfLink.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST || path.resolve(HERE, '../../web/dist');
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function createApp({ health = createHealth(), env = process.env, useSettingsFile = true, mockDir = MOCK_DIR } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(hostCheck);
  app.use(sameOriginWrites);
  app.use((_req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP }); next(); });

  const settingsOpts = { file: useSettingsFile };
  const cfg = () => realConfig(env, settingsOpts); // read on every call: editing the settings file shows up without a restart
  let mode = modeFrom(env, settingsOpts);
  health.setRuntime?.(() => (mode === 'real' ? 'live' : 'offline'));
  // The folder for the current mode. Real that has become unusable (folder removed) falls back to Mock rather than serving nothing.
  const current = () => {
    if (mode === 'real') { const c = cfg(); if (c.ok) return { source: 'real', dir: c.dir }; mode = 'mock'; }
    return { source: 'mock', dir: mockDir };
  };

  const api = express.Router();
  api.use(express.json({ limit: '4kb' }));
  api.use('/health', health.router);
  mountShelfRoute(api, { env });
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  api.get('/info', (_req, res) => {
    const c = cfg(); const cur = current();
    let count = 0; let skipped = 0;
    try { const all = loadAll(cur.dir); count = all.pages.length; skipped = all.skipped.length; } catch { /* reported by /pages */ }
    res.json({
      source: cur.source, mode: cur.source, simulated: cur.source === 'mock', realAvailable: c.ok, realHint: c.ok ? null : c.problem,
      pageCount: count, skippedCount: skipped, limits: LIMITS,
      contentLabel: cur.source === 'real' ? 'full notes from your local folder (FIELD_NOTES_DIR), read-only, loopback only' : 'the sanitized pages shipped in this repo (pages/)',
    });
  });

  // Rule 19: exactly { source: "mock"|"real" }; 409 when Real is not configured.
  api.post('/mode', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !['mock', 'real'].includes(body.source)) {
      return res.status(400).json({ error: 'bad_source', detail: 'body must be exactly { source: "mock" | "real" }' });
    }
    const c = cfg();
    if (body.source === 'real' && !c.ok) return res.status(409).json({ error: 'real_not_configured', detail: c.problem });
    mode = body.source;
    return res.json({ source: mode });
  });

  const str = (v) => (typeof v === 'string' ? v : '');
  api.get('/pages', (req, res) => {
    const cur = current();
    let all;
    try { all = loadAll(cur.dir); } catch { return res.status(503).json({ error: 'folder_unreadable', source: cur.source, detail: 'the pages folder cannot be read' }); }
    const q = str(req.query.q); const appName = str(req.query.app); const tag = str(req.query.tag);
    if (q.length > LIMITS.maxQuery || appName.length > 200 || tag.length > 200) return res.status(400).json({ error: 'query_too_long' });
    const result = search(all.pages, { q, app: appName, tag });
    res.json({ source: cur.source, total: all.pages.length, ...result, skipped: all.skipped });
  });

  const pageOr404 = (req, res) => {
    const { slug } = req.params;
    if (!isSlug(slug)) { res.status(400).json({ error: 'bad_slug' }); return null; }
    const cur = current();
    let p;
    try { p = loadOne(cur.dir, slug); } catch (e) { if (e instanceof PageError) { res.status(400).json({ error: 'bad_slug' }); return null; } throw e; }
    if (!p) { res.status(404).json({ error: 'not_found', source: cur.source }); return null; }
    return { p, cur };
  };
  api.get('/pages/:slug', (req, res) => {
    const hit = pageOr404(req, res); if (!hit) return;
    const { p, cur } = hit;
    res.json({ source: cur.source, page: { slug: p.slug, title: p.title, date: p.date, apps: p.apps, tags: p.tags, summary: p.summary, source: p.source, bytes: p.bytes, lines: p.lines, problems: p.problems, markdown: p.body } });
  });
  // The file as it is on disk (front matter included), as plain text the browser will not run: sandboxed, nosniff, no scripts.
  api.get('/pages/:slug/raw', (req, res) => {
    const hit = pageOr404(req, res); if (!hit) return;
    const download = req.query.download === '1';
    res.set({ 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${hit.p.slug}.md"` });
    res.send(hit.p.text);
  });

  api.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use('/api', api);
  // Errors become short JSON; Express's default handler would send an HTML stack trace with absolute file paths.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = Number(err?.status || err?.statusCode);
    if (status === 413) return res.status(413).json({ error: 'payload_too_large' });
    if (status >= 400 && status < 500) return res.status(status).json({ error: 'bad_request' });
    return res.status(500).json({ error: 'internal_error' });
  });

  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    app.use(express.static(WEB_DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }
  return app;
}

export function startHttpServer({ port, host, app = createApp() } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}/` }));
    server.once('error', reject);
  });
}
