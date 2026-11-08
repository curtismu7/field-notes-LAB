import React from "react";
import { linkTarget } from "../lib/markdown";

// Renders the tree from lib/markdown.js as React elements. Every string goes in as a text child, so nothing in a page is ever parsed as
// HTML; nothing in this app sets inner HTML from a string. Headings are shifted so the page's top level is h2 (the title is the h1).

const Shift = React.createContext(0);
// The slug of the page being shown, so an on-page anchor link can carry the full route (#/page/<slug>#sec-x) and still work when it is
// opened in a new tab or copied.
export const PageSlug = React.createContext("");
export const pageHref = (slug, id) => `#/page/${slug}${id ? `#${id}` : ""}`;
const sectionId = (id) => (id.startsWith("sec-") ? id : `sec-${id}`);
export function headingShift(blocks) {
  const levels = blocks.filter((b) => b.type === "heading").map((b) => b.level);
  return levels.length ? 2 - Math.min(...levels) : 0;
}

export function scrollToId(id) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (el) { el.scrollIntoView?.({ behavior: "smooth", block: "start" }); el.focus?.({ preventScroll: true }); }
}

function Link({ href, children }) {
  const current = React.useContext(PageSlug);
  const t = linkTarget(href);
  if (!t) return <span className="md-badlink" title="Link not followed: only http, https and relative links are allowed">{children}</span>;
  if (t.kind === "external") return <a href={t.href} target="_blank" rel="noopener noreferrer">{children}</a>;
  if (t.kind === "page") {
    const id = t.anchor ? sectionId(t.anchor) : "";
    if (t.slug === current && id) return <a href={pageHref(t.slug, id)} onClick={(e) => { e.preventDefault(); scrollToId(id); }}>{children}</a>;
    return <a href={pageHref(t.slug, id)}>{children}</a>;
  }
  if (t.kind === "anchor") {
    const id = sectionId(t.id);
    return <a href={current ? pageHref(current, id) : `#${id}`} onClick={(e) => { e.preventDefault(); scrollToId(id); }}>{children}</a>;
  }
  return <a href={t.href} rel="noopener">{children}</a>;
}

export function Inlines({ nodes }) {
  return nodes.map((n, k) => {
    switch (n.t) {
      case "text": return <React.Fragment key={k}>{n.v}</React.Fragment>;
      case "code": return <code key={k}>{n.v}</code>;
      case "strong": return <strong key={k}><Inlines nodes={n.c} /></strong>;
      case "em": return <em key={k}><Inlines nodes={n.c} /></em>;
      case "del": return <del key={k}><Inlines nodes={n.c} /></del>;
      case "link": return <Link key={k} href={n.href}><Inlines nodes={n.c} /></Link>;
      case "image": return <span key={k} className="md-img" title="Images are not loaded (no outbound requests)">[image: {n.alt || "no description"}]</span>;
      default: return null;
    }
  });
}

function Block({ b }) {
  const shift = React.useContext(Shift);
  switch (b.type) {
    case "heading": {
      const Tag = `h${Math.min(6, Math.max(2, b.level + shift))}`;
      return <Tag id={b.id} tabIndex={-1}><Inlines nodes={b.inlines} /></Tag>;
    }
    case "paragraph": return <p><Inlines nodes={b.inlines} /></p>;
    case "code": return <pre className="code" data-lang={b.lang || undefined}><code>{b.text}</code></pre>;
    case "hr": return <hr />;
    case "quote": return <blockquote><Blocks blocks={b.blocks} /></blockquote>;
    case "table": {
      const cols = Math.max(b.header.length, ...b.rows.map((r) => r.length));
      const cell = (row, c) => row[c] || [];
      const align = (c) => (b.align[c] ? { textAlign: b.align[c] } : undefined);
      return (
        <div className="scroll" role="region" aria-label="Table" tabIndex={0}>
          <table className="tbl md-table">
            <thead><tr>{Array.from({ length: cols }, (_, c) => <th key={c} scope="col" style={align(c)}><Inlines nodes={cell(b.header, c)} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, ri) => <tr key={ri}>{Array.from({ length: cols }, (_, c) => <td key={c} style={align(c)}><Inlines nodes={cell(r, c)} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    case "list": {
      const tasks = b.items.some((it) => it.task !== null);
      const items = b.items.map((it, k) => {
        const tight = it.blocks.length === 1 && it.blocks[0].type === "paragraph";
        const body = tight ? <Inlines nodes={it.blocks[0].inlines} /> : <Blocks blocks={it.blocks} />;
        if (it.task === null) return <li key={k}>{body}</li>;
        return (
          <li key={k} className="md-task" data-done={it.task ? "true" : "false"}>
            <input type="checkbox" checked={it.task} disabled readOnly aria-label={it.task ? "done" : "not done"} />
            <span>{body}</span>
          </li>
        );
      });
      const cls = tasks ? "md-tasks" : undefined;
      return b.ordered ? <ol className={cls} start={b.start !== 1 ? b.start : undefined}>{items}</ol> : <ul className={cls}>{items}</ul>;
    }
    default: return null;
  }
}

export function Blocks({ blocks }) {
  return blocks.map((b, k) => <Block key={k} b={b} />);
}

export default function Markdown({ tree }) {
  return <Shift.Provider value={headingShift(tree.blocks)}><div className="md" data-testid="markdown"><Blocks blocks={tree.blocks} /></div></Shift.Provider>;
}
