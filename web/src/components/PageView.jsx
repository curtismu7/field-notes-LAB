import React from "react";
import { getJson, pageUrl, rawUrl } from "../api";
import { parseMarkdown, plainText } from "../lib/markdown";
import Markdown, { PageSlug, pageHref, scrollToId } from "./Markdown.jsx";

// One page: metadata, an on-page contents list, the rendered Markdown and the raw file. Reloads when the mode switches (epoch).
export default function PageView({ slug, anchor, epoch, source }) {
  const [state, setState] = React.useState({ loading: true });
  React.useEffect(() => {
    let alive = true;
    setState({ loading: true });
    getJson(pageUrl(slug)).then((d) => alive && setState({ page: d.page }), (e) => alive && setState({ error: e.status === 404 ? "missing" : e.message }));
    return () => { alive = false; };
  }, [slug, epoch]);

  const tree = React.useMemo(() => {
    if (!state.page) return null;
    const t = parseMarkdown(state.page.markdown);
    // The page title is the h1; drop a leading Markdown h1 that repeats it.
    const first = t.blocks[0];
    if (first?.type === "heading" && first.level === 1 && plainText(first.inlines).trim() === state.page.title.trim()) t.blocks = t.blocks.slice(1);
    return t;
  }, [state.page]);
  // Opened at #/page/<slug>#<id> (a copied or new-tab section link): scroll to that heading once the page is shown.
  React.useEffect(() => { if (tree && anchor) scrollToId(anchor.startsWith("sec-") ? anchor : `sec-${anchor}`); }, [tree, anchor]);

  if (state.loading) return <p className="muted" role="status">Loading the page...</p>;
  if (state.error === "missing") {
    return (
      <section data-testid="page-missing">
        <h1>No such page</h1>
        <p className="notice">There is no page called <code>{slug}</code> in {source === "real" ? "your Real folder" : "the Mock pages"}. It may exist only in the other mode.</p>
        <p><a href="#/">Back to all pages</a></p>
      </section>
    );
  }
  if (state.error) return <p className="field-error" role="alert">Could not load the page: {state.error}</p>;

  const p = state.page;
  // The contents list: the page's top two heading levels (after the title).
  const top = Math.min(...tree.blocks.filter((b) => b.type === "heading").map((b) => b.level), 7);
  const toc = tree.headings.filter((h) => h.level === top || h.level === top + 1);
  return (
    <article data-testid="page-view">
      <p className="crumb"><a href="#/">All pages</a></p>
      <h1 data-testid="page-title">{p.title}</h1>
      <p className="lede">{p.summary}</p>
      <dl className="kv">
        <div className="kv__row"><dt>Date</dt><dd>{p.date || "no date"}</dd></div>
        <div className="kv__row"><dt>Apps</dt><dd>{p.apps.join(", ") || "none"}</dd></div>
        <div className="kv__row"><dt>Tags</dt><dd>{p.tags.join(", ") || "none"}</dd></div>
        {p.source && <div className="kv__row"><dt>Source</dt><dd>{p.source}</dd></div>}
        <div className="kv__row"><dt>File</dt><dd className="mono">{p.slug}.md ({p.bytes.toLocaleString("en-US")} bytes)</dd></div>
      </dl>
      <div className="row">
        <a className="btn" href={rawUrl(p.slug)} target="_blank" rel="noopener noreferrer" data-testid="raw">Open raw Markdown</a>
        <a className="btn" href={rawUrl(p.slug, true)} download={`${p.slug}.md`} data-testid="download">Download .md</a>
      </div>
      {tree.truncated && <p className="notice" data-testid="truncated">This page is longer than the viewer shows (line, length or table-row cap). Open the raw Markdown for all of it.</p>}
      <div className="page-layout">
        {toc.length > 0 && (
          <nav className="toc" aria-label="On this page" data-testid="toc">
            <p className="section-label">On this page</p>
            <ol>
              {toc.map((h) => <li key={h.id} className={h.level === top ? "toc__top" : "toc__sub"}><a href={pageHref(p.slug, h.id)} onClick={(e) => { e.preventDefault(); scrollToId(h.id); }}>{h.text}</a></li>)}
            </ol>
          </nav>
        )}
        <PageSlug.Provider value={p.slug}><Markdown tree={tree} /></PageSlug.Provider>
      </div>
    </article>
  );
}
