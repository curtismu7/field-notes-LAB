import React from "react";
import { getJson, setMode } from "./api";
import { THEMES, applyTheme, savedTheme } from "./theme";
import ShelfLink from "./components/ShelfLink.jsx";
import PageList from "./components/PageList.jsx";
import PageView from "./components/PageView.jsx";
import About from "./components/About.jsx";

// Hash routes: #/ (the page list), #/page/<slug> (optionally #/page/<slug>#<heading id>), #/about.
export function parseRoute(hash) {
  const h = String(hash || "").replace(/^#\/?/, "");
  const m = /^page\/([A-Za-z0-9][A-Za-z0-9._-]{0,119})(?:#([A-Za-z0-9_-]{1,80}))?$/.exec(h);
  if (m) return m[2] ? { name: "page", slug: m[1], anchor: m[2] } : { name: "page", slug: m[1] };
  if (h === "about") return { name: "about" };
  return { name: "list" };
}

export const BANNER = {
  mock: "Mock: showing the sanitized pages shipped in this repo (pages/). Hosts, namespaces and ids in them are placeholders. Nothing is fetched from the network.",
  real: "Real: showing your full, unsanitized notes from FIELD_NOTES_DIR (read-only, loopback only). They can name real hosts and tenants, so do not share this screen with a customer.",
  unknown: "Mode unknown: the server did not answer. Nothing is shown until it does.",
};

export default function App() {
  const [route, setRoute] = React.useState(() => parseRoute(window.location.hash));
  const [info, setInfo] = React.useState(undefined); // undefined = loading, null = failed
  const [epoch, setEpoch] = React.useState(0); // bumped on every mode switch: every page reloads its data
  const [switchError, setSwitchError] = React.useState("");
  const [theme, setTheme] = React.useState(savedTheme);

  React.useEffect(() => { applyTheme(theme); }, [theme]);
  React.useEffect(() => {
    const on = () => { setRoute(parseRoute(window.location.hash)); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const loadInfo = React.useCallback(() => getJson("/api/info").then(setInfo, () => setInfo(null)), []);
  React.useEffect(() => { loadInfo(); }, [loadInfo, epoch]);

  const real = info?.source === "real";
  async function switchTo(source) {
    setSwitchError("");
    const r = await setMode(source);
    if (!r.ok) setSwitchError(r.body?.detail || `Could not switch (HTTP ${r.status}).`);
    setEpoch((e) => e + 1);
  }

  const realHint = info && !info.realAvailable ? info.realHint || "Real is not configured. Mock keeps working." : "";
  const banner = info === undefined ? "Loading..." : info === null ? BANNER.unknown : real ? BANNER.real : BANNER.mock;
  const nav = [["list", "#/", "Pages"], ["about", "#/about", "About"]];
  const current = route.name === "page" ? "list" : route.name;

  return (
    <div className="app">
      <a className="skip-link" href="#main" data-testid="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="shell-bar">
        <span className="shell-brand"><span className="shell-logo" aria-hidden="true">FN</span> Field Notes <span className="shell-badge" data-testid="mode">{info ? (real ? "Real" : "Mock") : "..."}</span></span>
        <nav className="shell-nav" aria-label="Sections">
          {nav.map(([id, href, label]) => <a key={id} href={href} data-testid={`nav-${id}`} aria-current={current === id ? "page" : undefined}>{label}</a>)}
        </nav>
        <span className="shell-right">
          {info && (
            <span className="seg" role="group" aria-label="Content source">
              <button type="button" aria-pressed={!real} data-testid="mode-mock" onClick={() => switchTo("mock")} title="Show the sanitized pages shipped in this repo">Mock</button>
              <button type="button" aria-pressed={real} data-testid="mode-real" disabled={!info.realAvailable && !real} aria-describedby={realHint ? "real-hint" : undefined}
                title={info.realAvailable ? "Show your full notes from FIELD_NOTES_DIR (read-only, loopback only)" : realHint}
                onClick={() => switchTo("real")}>Real</button>
            </span>
          )}
          <ShelfLink />
          <label className="shell-theme">Theme
            <select value={theme} onChange={(e) => setTheme(e.target.value)} data-testid="theme">
              {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </span>
      </header>
      <main className="page" id="main" tabIndex={-1}>
        <div className="banner" role="note" data-testid="banner" data-state={real ? "live" : undefined}>{banner}</div>
        {realHint && <p className="muted" id="real-hint" data-testid="real-hint">Real is unavailable: {realHint}</p>}
        {switchError && <p className="field-error" role="alert" data-testid="switch-error">{switchError}</p>}
        {info === null ? null : route.name === "page" ? <PageView slug={route.slug} anchor={route.anchor} epoch={epoch} source={info?.source} />
          : route.name === "about" ? <About info={info} /> : <PageList epoch={epoch} source={info?.source} />}
      </main>
    </div>
  );
}
