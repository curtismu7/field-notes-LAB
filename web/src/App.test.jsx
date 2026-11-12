import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import App, { BANNER, parseRoute } from "./App";
import { startLab } from "./testServer";

let lab; let dirs = [];
afterEach(async () => { cleanup(); await lab?.close(); lab = null; window.location.hash = ""; for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); dirs = []; });
beforeEach(() => { window.location.hash = ""; });

const go = async (hash) => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent("hashchange")); };
const realFolder = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "field-notes-web-"));
  for (const [n, t] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), t);
  dirs.push(dir);
  return { STANDALONE_ENV: "/nonexistent/settings.env", FIELD_NOTES_DIR: dir };
};
const HOSTILE = [
  "---", 'title: "<img src=x onerror=alert(1)> hostile"', "date: 2026-11-08", "apps: [\"<script>x</script>\"]", "tags: [hostile]", "summary: \"<b>bold?</b>\"", "---", "",
  "# <script>alert('h1')</script>", "", "<script>alert(2)</script>", "", "<iframe src=\"https://evil.example/\"></iframe>", "",
  "[click](javascript:alert(3)) [data](data:text/html,x) [proto](//evil.example/) [ok](https://docs.example/a)", "",
  "![tracker](https://evil.example/pixel.png)", "", "| <b>h</b> |", "| --- |", "| <img src=x onerror=alert(4)> |", "",
  `${">".repeat(3000)} deep`, "",
].join("\n");

describe("routes", () => {
  it("parses list, page and about, and refuses an unsafe slug", () => {
    expect(parseRoute("#/page/how-to-add-a-page")).toEqual({ name: "page", slug: "how-to-add-a-page" });
    expect(parseRoute("#/about")).toEqual({ name: "about" });
    expect(parseRoute("#/page/../x")).toEqual({ name: "list" });
    expect(parseRoute("#/page/how-to-add-a-page#sec-front-matter")).toEqual({ name: "page", slug: "how-to-add-a-page", anchor: "sec-front-matter" });
    expect(parseRoute("#/page/x#bad anchor")).toEqual({ name: "list" });
    expect(parseRoute("")).toEqual({ name: "list" });
  });
});

describe("Mock", () => {
  it("banner first on every page, Real disabled with a how-to tooltip, cards, filters and search", async () => {
    lab = await startLab();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("card-privilege-mcp-audit-trail");
    expect(screen.getByTestId("banner").textContent).toBe(BANNER.mock);
    expect(screen.getByTestId("banner")).not.toHaveAttribute("data-state");
    const mode = screen.getByTestId("mode-select");
    expect(mode).toHaveValue("mock");
    const real = mode.querySelector('option[value="real"]');
    expect(real).toBeDisabled();
    expect(real.getAttribute("title")).toMatch(/FIELD_NOTES_DIR/);
    expect(screen.getByTestId("real-hint").textContent).toMatch(/FIELD_NOTES_DIR/);
    const card = screen.getByTestId("card-privilege-mcp-audit-trail");
    expect(card.textContent).toMatch(/2026-11-08/);
    expect(within(card).getByText("PingOne Privilege")).toBeInTheDocument();
    expect(within(card).getByText("#requirement-9")).toBeInTheDocument();
    expect(screen.getByTestId("count").textContent).toBe("11 of 11 pages");

    await user.selectOptions(screen.getByTestId("filter-tag"), "siem");
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2 of 11 pages match"));
    expect(screen.queryByTestId("card-how-to-add-a-page")).toBeNull();
    await user.click(screen.getByTestId("clear"));
    await user.click(within(await screen.findByTestId("card-how-to-add-a-page")).getByText("field-notes-LAB"));
    await waitFor(() => expect(screen.queryByTestId("card-privilege-mcp-audit-trail")).toBeNull());
    await user.click(screen.getByTestId("clear"));
    await user.type(screen.getByTestId("search"), "nebula");
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1 of 11 pages match"));
    expect(screen.getByTestId("card-privilege-mcp-audit-trail")).toBeInTheDocument();

    for (const tab of ["about", "list"]) {
      await user.click(screen.getByTestId(`nav-${tab}`));
      expect(document.querySelector("main").firstElementChild).toBe(screen.getByTestId("banner"));
      expect(screen.getByTestId("banner").textContent).toBe(BANNER.mock);
    }
  });

  it("page view: contents list, tables, code, task lists, links, raw and download", async () => {
    lab = await startLab();
    render(<App />);
    await go("#/page/privilege-mcp-audit-trail");
    await screen.findByTestId("page-view");
    expect(document.querySelector("main").firstElementChild).toBe(screen.getByTestId("banner"));
    expect(screen.getByTestId("page-title").textContent).toBe("Privilege MCP audit trail: what it logs (findings so far)");
    expect(document.querySelectorAll("h1").length).toBe(1);
    const toc = screen.getByTestId("toc");
    expect(within(toc).getByText("What Privilege does not log today")).toBeInTheDocument();
    expect(within(toc).getByText("Questions for Ping")).toBeInTheDocument();
    const md = screen.getByTestId("markdown");
    expect(md.querySelector("#sec-what-privilege-does-not-log-today").tagName).toBe("H2");
    expect(md.querySelectorAll("h1").length).toBe(0);
    expect(md.querySelectorAll("table").length).toBeGreaterThanOrEqual(8);
    expect([...md.querySelectorAll("th")].map((th) => th.textContent)).toContain("Effect on requirement 9");
    expect(md.querySelectorAll("li.md-task input[type=checkbox]").length).toBe(7);
    expect(md.textContent).toMatch(/gateway\.example\.invalid/);
    expect(screen.getByTestId("raw")).toHaveAttribute("href", "/api/pages/privilege-mcp-audit-trail/raw");
    expect(screen.getByTestId("raw")).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByTestId("download")).toHaveAttribute("href", "/api/pages/privilege-mcp-audit-trail/raw?download=1");

    await go("#/page/how-to-add-a-page");
    await waitFor(() => expect(screen.getByTestId("page-title").textContent).toBe("How to add a page"));
    const md2 = screen.getByTestId("markdown");
    expect(md2.querySelector("pre.code[data-lang=yaml]").textContent).toMatch(/^---\ntitle:/);
    const inner = within(md2).getByText("the Privilege audit trail findings");
    expect(inner.closest("a")).toHaveAttribute("href", "#/page/privilege-mcp-audit-trail");
    expect([...md2.querySelectorAll("li.md-task")].map((li) => li.dataset.done)).toEqual(["true", "true", "false"]);
  });

  it("a missing page says so and offers the way back", async () => {
    lab = await startLab();
    render(<App />);
    await go("#/page/no-such-page");
    expect((await screen.findByTestId("page-missing")).textContent).toMatch(/no page called no-such-page in the Mock pages/);
  });
});

describe("Real", () => {
  it("starts in Real, switches to Mock and back without a restart, and reloads the list each time", async () => {
    lab = await startLab({ env: realFolder({ "full.md": "---\ntitle: Full notes\ndate: 2026-11-08\napps: [real-only]\ntags: [internal]\nsummary: Only in Real.\n---\n\nText.\n" }) });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("card-full");
    expect(screen.getByTestId("banner").textContent).toBe(BANNER.real);
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live");
    const mode = screen.getByTestId("mode-select");
    expect(mode).toHaveValue("real");
    expect(screen.queryByTestId("card-privilege-mcp-audit-trail")).toBeNull();
    await user.selectOptions(mode, "mock");
    await screen.findByTestId("card-privilege-mcp-audit-trail");
    expect(screen.queryByTestId("card-full")).toBeNull();
    expect(screen.getByTestId("banner").textContent).toBe(BANNER.mock);
    expect(mode.querySelector('option[value="real"]')).toBeEnabled();
    await user.selectOptions(mode, "real");
    await screen.findByTestId("card-full");
    expect(screen.getByTestId("mode")).toHaveTextContent("Real");
    expect(await lab.attempts()).toEqual([]);
  });

  it("links: backslash protocol-relative is plain text, route-form and section links carry the full route, parentheses survive, skip link", async () => {
    const links = [
      "---", "title: Links", "date: 2026-11-08", "apps: [demo-app]", "tags: [links]", "summary: Link forms.", "---", "",
      "## First part", "", "[bs](/\\evil.example/x) [bs2](/\\/evil.example/) [route](#/page/other) [sec](#first-part) [deep](other.md#second)", "",
      "[wiki](https://en.wikipedia.invalid/wiki/Foo_(bar)) end.", "",
    ].join("\n");
    lab = await startLab({ env: realFolder({ "links.md": links, "other.md": "---\ntitle: Other\n---\n\n## Second\n\nText.\n" }) });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("card-links");
    expect(screen.getByTestId("skip-link")).toHaveAttribute("href", "#main");
    expect(document.body.querySelector("a")).toBe(screen.getByTestId("skip-link"));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId("skip-link"));
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(document.getElementById("main"));

    await go("#/page/links");
    const md = await screen.findByTestId("markdown");
    expect([...md.querySelectorAll(".md-badlink")].map((x) => x.textContent)).toEqual(["bs", "bs2"]);
    const href = (text) => within(md).getByText(text).closest("a")?.getAttribute("href");
    expect(href("route")).toBe("#/page/other");
    expect(href("sec")).toBe("#/page/links#sec-first-part");
    expect(href("deep")).toBe("#/page/other#sec-second");
    expect(href("wiki")).toBe("https://en.wikipedia.invalid/wiki/Foo_(bar)");
    expect(md.textContent).toMatch(/wiki end\./);
    expect(md.textContent).not.toMatch(/wiki\)/);
    expect(within(screen.getByTestId("toc")).getByText("First part").closest("a")).toHaveAttribute("href", "#/page/links#sec-first-part");

    // A copied section link opens the page and lands on the heading.
    await go("#/page/other#sec-second");
    await waitFor(() => expect(screen.getByTestId("page-title").textContent).toBe("Other"));
    await waitFor(() => expect(document.activeElement?.id).toBe("sec-second"));
    expect(await lab.attempts()).toEqual([]);
  });

  it("a hostile page renders inert: no script, iframe, image or javascript: link; HTML shows as text; refused links are plain text", async () => {
    lab = await startLab({ env: realFolder({ "hostile.md": HOSTILE }) });
    render(<App />);
    const card = await screen.findByTestId("card-hostile");
    expect(card.querySelector("img, script")).toBeNull();
    expect(card.textContent).toMatch(/<img src=x onerror=alert\(1\)> hostile/);
    await go("#/page/hostile");
    const md = await screen.findByTestId("markdown");
    const view = screen.getByTestId("page-view");
    expect(view.querySelectorAll("script, iframe, img, object, embed").length).toBe(0);
    expect(md.textContent).toMatch(/<script>alert\(2\)<\/script>/);
    expect(md.textContent).toMatch(/\[image: tracker\]/);
    const hrefs = [...md.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://docs.example/a"]);
    expect(md.querySelector("a").getAttribute("rel")).toBe("noopener noreferrer");
    expect([...md.querySelectorAll(".md-badlink")].map((s) => s.textContent)).toEqual(["click", "data", "proto"]);
    expect([...document.querySelectorAll("[onerror], [onclick]")].length).toBe(0);
    let depth = 0; let el = md.querySelector("blockquote");
    while (el) { depth++; el = el.querySelector(":scope > blockquote"); }
    expect(depth).toBeLessThanOrEqual(6);
    expect(await lab.attempts()).toEqual([]);
  });
});
