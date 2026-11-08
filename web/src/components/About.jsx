import React from "react";

export default function About({ info }) {
  return (
    <section data-testid="about-page">
      <h1>About Field Notes</h1>
      <p className="lede">A library of pages about our apps and what we learned. Each page is a Markdown file with a small front-matter block; any <code>.md</code> file in the folder becomes a page with no code change. See the page <a href="#/page/how-to-add-a-page">How to add a page</a>.</p>
      <div className="card-grid">
        <div className="card">
          <h3 className="card__title">Mock</h3>
          <p>The sanitized pages shipped in this repo&apos;s <code>pages/</code> folder. Hosts are <code>.example</code> or <code>.invalid</code>, namespaces and ids are placeholders.</p>
        </div>
        <div className="card card--neutral">
          <h3 className="card__title">Real</h3>
          <p>Your full, unsanitized notes in the local folder named by <code>FIELD_NOTES_DIR</code> in <code>~/Development/.env</code>. Read-only, loopback only, refused inside this repo and in the Docker image.</p>
          <p className="muted" data-testid="about-real">{info?.realAvailable ? "Real is configured on this machine." : "Real is not configured on this machine."}</p>
        </div>
        <div className="card card--neutral">
          <h3 className="card__title">Safe rendering</h3>
          <p>Raw HTML in a page is shown as text, never run. Only http, https and relative links become links; images are not loaded. A page is capped at 512 KB and 20,000 lines. Nothing leaves this machine.</p>
        </div>
      </div>
    </section>
  );
}
