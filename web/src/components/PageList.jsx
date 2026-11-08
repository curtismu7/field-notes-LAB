import React from "react";
import { getJson, pagesUrl } from "../api";

// The page list: search, app and tag filters, and a card per page. Reloads when the mode switches (epoch).
export default function PageList({ epoch }) {
  const [q, setQ] = React.useState("");
  const [app, setApp] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => { setApp(""); setTag(""); }, [epoch]);
  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      getJson(pagesUrl({ q: q.slice(0, 200), app, tag })).then((d) => { if (alive) { setData(d); setError(""); } }, (e) => { if (alive) setError(e.message); });
    }, q ? 150 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, app, tag, epoch]);

  const facets = data?.facets || { apps: [], tags: [] };
  const filtered = q || app || tag;
  return (
    <section data-testid="list-page">
      <h1>Field notes</h1>
      <p className="lede">Pages about our apps and what we learned: findings, how-tos and investigations. Each page is one Markdown file; a new file in the folder is a new page.</p>
      <div className="filters" role="search">
        <label className="field">Search
          <input type="search" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} placeholder="Words in the title, summary or text" data-testid="search" />
        </label>
        <label className="field">App
          <select value={app} onChange={(e) => setApp(e.target.value)} data-testid="filter-app">
            <option value="">All apps</option>
            {facets.apps.map((a) => <option key={a.name} value={a.name}>{a.name} ({a.count})</option>)}
          </select>
        </label>
        <label className="field">Tag
          <select value={tag} onChange={(e) => setTag(e.target.value)} data-testid="filter-tag">
            <option value="">All tags</option>
            {facets.tags.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}
          </select>
        </label>
        {filtered && <button type="button" onClick={() => { setQ(""); setApp(""); setTag(""); }} data-testid="clear">Clear</button>}
      </div>
      {error && <p className="field-error" role="alert">Could not load the pages: {error}</p>}
      {data && <p className="muted" data-testid="count" aria-live="polite">{data.pages.length} of {data.total} page{data.total === 1 ? "" : "s"}{filtered ? " match" : ""}</p>}
      {data?.skipped?.length > 0 && (
        <p className="notice" data-testid="skipped">{data.skipped.length} file{data.skipped.length === 1 ? " was" : "s were"} not shown: {data.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}</p>
      )}
      {data && data.pages.length === 0 && <p className="notice" data-testid="empty">{data.total ? "No page matches. Clear the search or the filters." : "This folder has no pages yet. Add a .md file to it."}</p>}
      <div className="card-grid">
        {data?.pages.map((p) => (
          <article key={p.slug} className={`card${p.problems.length ? " card--warn" : ""}`} data-testid={`card-${p.slug}`}>
            <h3 className="card__title"><a href={`#/page/${p.slug}`}>{p.title}</a></h3>
            <p className="muted">{p.date || "no date"}{p.source ? ` · ${p.source}` : ""}</p>
            <p>{p.summary}</p>
            <div className="chips">
              {p.apps.map((a) => <button type="button" key={`a-${a}`} className="chip chip--info" onClick={() => setApp(a)} title={`Show only pages about ${a}`}>{a}</button>)}
              {p.tags.map((t) => <button type="button" key={`t-${t}`} className="chip" onClick={() => setTag(t)} title={`Show only pages tagged ${t}`}>#{t}</button>)}
            </div>
            {p.problems.length > 0 && <p className="chip chip--warn">front matter: {p.problems.join(", ")}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
