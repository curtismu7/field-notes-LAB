import { describe, expect, it } from "vitest";
import { MD_LIMITS, linkTarget, parseInline, parseMarkdown, plainText, splitRow } from "./lib/markdown";

const types = (src) => parseMarkdown(src).blocks.map((b) => b.type);

describe("block parsing", () => {
  it("headings with ids (deduplicated), paragraphs, rules, quotes and fenced code", () => {
    const t = parseMarkdown("# Title\n\n## Same\n\ntext\nmore\n\n## Same ##\n\n---\n\n> quoted\n> line\n\n```yaml\nkey: <b>v</b>\n```\n");
    expect(t.blocks.map((b) => b.type)).toEqual(["heading", "heading", "paragraph", "heading", "hr", "quote", "code"]);
    expect(t.headings.map((h) => [h.level, h.id, h.text])).toEqual([[1, "sec-title", "Title"], [2, "sec-same", "Same"], [2, "sec-same-2", "Same"]]);
    expect(plainText(t.blocks[2].inlines)).toBe("text more");
    expect(t.blocks[6]).toEqual({ type: "code", lang: "yaml", text: "key: <b>v</b>" });
  });

  it("GitHub tables: header, alignment, escaped pipes and pipes inside code spans", () => {
    const t = parseMarkdown("| A | B | C |\n| :--- | :-: | --: |\n| `a|b` | x \\| y | z |\n| one |\n");
    const tbl = t.blocks[0];
    expect(tbl.type).toBe("table");
    expect(tbl.align).toEqual(["left", "center", "right"]);
    expect(tbl.header.map(plainText)).toEqual(["A", "B", "C"]);
    expect(tbl.rows[0].map(plainText)).toEqual(["a|b", "x | y", "z"]);
    expect(tbl.rows[1].map(plainText)).toEqual(["one"]);
    expect(splitRow("|a|b|").length).toBe(2);
  });

  it("lists: bullets, ordered with start, nesting, tasks, and blank lines between items", () => {
    const t = parseMarkdown("- one\n- two\n  - inner\n\n- three\n\n3. c\n4. d\n\n- [ ] todo\n- [x] done\n");
    const [ul, ol, tasks] = t.blocks;
    expect(ul.type).toBe("list");
    expect(ul.items.length).toBe(3);
    expect(ul.items[1].blocks.map((b) => b.type)).toEqual(["paragraph", "list"]);
    expect(ol.ordered).toBe(true);
    expect(ol.start).toBe(3);
    expect(tasks.items.map((i) => i.task)).toEqual([false, true]);
    expect(plainText(tasks.items[1].blocks[0].inlines)).toBe("done");
  });

  it("the shipped audit-trail page parses into its sections and tables", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const text = fs.readFileSync(path.resolve(process.cwd(), "../pages/privilege-mcp-audit-trail.md"), "utf8");
    const t = parseMarkdown(text.split("\n---\n").slice(1).join("\n---\n"));
    const h2 = t.headings.filter((h) => h.level === 2).map((h) => h.text);
    expect(h2).toContain("What Privilege does not log today");
    expect(h2).toContain("Full Privilege test matrix");
    expect(t.blocks.filter((b) => b.type === "table").length).toBeGreaterThanOrEqual(8);
    expect(t.truncated).toBe(false);
  });
});

describe("inline parsing", () => {
  it("code, bold, italic, strikethrough, links, autolinks and images", () => {
    const n = parseInline("a `x*y*` **b** *c* ~~d~~ [e](https://docs.example/x) <https://a.example/> https://b.example/p. ![alt](https://img.example/i.png)");
    expect(n.map((x) => x.t)).toEqual(["text", "code", "text", "strong", "text", "em", "text", "del", "text", "link", "text", "link", "text", "link", "text", "image"]);
    expect(n.find((x) => x.t === "code").v).toBe("x*y*");
    expect(n.filter((x) => x.t === "link").map((x) => x.href)).toEqual(["https://docs.example/x", "https://a.example/", "https://b.example/p"]);
    expect(parseInline('<iframe src="https://evil.example/">').map((x) => x.t)).toEqual(["text"]);
  });
  it("a link destination may hold balanced parentheses; an unbalanced one still ends at the first ')'", () => {
    const n = parseInline("[wiki](https://en.wikipedia.invalid/wiki/Foo_(bar)) end.");
    expect(n.map((x) => x.t)).toEqual(["link", "text"]);
    expect(n[0].href).toBe("https://en.wikipedia.invalid/wiki/Foo_(bar)");
    expect(plainText(n)).toBe("wiki end.");
    const bad = parseInline("[bad](javascript:alert(1))");
    expect(bad.map((x) => x.t)).toEqual(["link"]);
    expect(bad[0].href).toBe("javascript:alert(1)");
    expect(linkTarget(bad[0].href)).toBeNull();
    expect(parseInline('[t](https://a.example/x "title (y)") z')[0].href).toBe("https://a.example/x");
    expect(parseInline("[u](https://a.example/(x) tail")[0].href).toBe("https://a.example/(x");
  });
  it("underscores inside words are not emphasis (policy_decision_log), escapes are literal", () => {
    expect(parseInline("privilege_event_kind and _yes_").map((x) => x.t)).toEqual(["text", "em"]);
    expect(plainText(parseInline("\\*not em\\*"))).toBe("*not em*");
  });
  it("raw HTML stays text", () => {
    const n = parseInline("<script>alert(1)</script> <img src=x onerror=alert(1)>");
    expect(n).toEqual([{ t: "text", v: "<script>alert(1)</script> <img src=x onerror=alert(1)>" }]);
  });
});

describe("link safety", () => {
  it.each([
    ["javascript:alert(1)", null], ["JaVaScRiPt:alert(1)", null], ["java\tscript:alert(1)", null], [" javascript:alert(1)", null],
    ["data:text/html,<b>x</b>", null], ["vbscript:msgbox", null], ["//evil.example/x", null], ["\\\\evil.example", null],
    ["file:///etc/passwd", null], ["mailto:a@b.example", null],
    ["/\\evil.example/x", null], ["/\\/evil.example/", null], ["/\\\\evil.example", null], ["\\/evil.example", null], ["\\evil.example", null], ["java&#58;script:x", { kind: "relative", href: "java&#58;script:x" }],
  ])("%s is refused or inert", (href, want) => { expect(linkTarget(href)).toEqual(want); });
  it("http(s), page links, anchors and relative paths are allowed", () => {
    expect(linkTarget("https://a.example/x?y=1").kind).toBe("external");
    expect(linkTarget("HTTP://A.EXAMPLE/").href).toBe("http://a.example/");
    expect(linkTarget("./how-to-add-a-page.md")).toEqual({ kind: "page", slug: "how-to-add-a-page", anchor: "" });
    expect(linkTarget("other.md#front-matter")).toEqual({ kind: "page", slug: "other", anchor: "front-matter" });
    expect(linkTarget("#front-matter")).toEqual({ kind: "anchor", id: "front-matter" });
    expect(linkTarget("../docs/x.png").kind).toBe("relative");
    expect(linkTarget("/api/pages/x/raw")).toEqual({ kind: "relative", href: "/api/pages/x/raw" });
  });
  it("every relative link a browser would resolve stays on this origin", () => {
    const base = "http://127.0.0.1:7804/";
    for (const h of ["/\\evil.example/x", "/\\/evil.example/", "\\\\evil.example", "//evil.example", "/x/../y", "./a\\b", "../docs/x.png", "#/about"]) {
      const t = linkTarget(h);
      if (t && t.kind === "relative") expect(new URL(t.href, base).origin).toBe("http://127.0.0.1:7804");
    }
  });
  it("the app's own route form is a page link (with an optional heading anchor), not an on-page anchor", () => {
    expect(linkTarget("#/page/beta-real")).toEqual({ kind: "page", slug: "beta-real", anchor: "" });
    expect(linkTarget("#/page/beta-real#sec-x")).toEqual({ kind: "page", slug: "beta-real", anchor: "sec-x" });
    expect(linkTarget("#/page/../x")).toEqual({ kind: "relative", href: "#/page/../x" });
  });
});

describe("hostile input is bounded", () => {
  it("deep quote and list nesting stops at the depth cap", () => {
    let depth = 0;
    let b = parseMarkdown(`${">".repeat(5000)} deep`).blocks[0];
    while (b && b.type === "quote") { depth++; b = b.blocks[0]; }
    expect(depth).toBeLessThanOrEqual(MD_LIMITS.maxDepth);
    const list = Array.from({ length: 300 }, (_, i) => `${"  ".repeat(i)}- x`).join("\n");
    expect(() => parseMarkdown(list)).not.toThrow();
  });
  it("table rows are capped and the cut is reported", () => {
    const t = parseMarkdown(`| a | b |\n|---|---|\n${"| x | y |\n".repeat(MD_LIMITS.maxTableRows + 50)}after`);
    expect(t.blocks[0].type).toBe("table");
    expect(t.blocks[0].rows.length).toBe(MD_LIMITS.maxTableRows);
    expect(t.truncated).toBe(true);
    expect(t.blocks.map((b) => b.type)).toEqual(["table", "paragraph"]);
    expect(parseMarkdown("| a |\n|---|\n| x |\n").truncated).toBe(false);
  });
  it("line count and line length are capped and reported", () => {
    const t = parseMarkdown("x\n".repeat(MD_LIMITS.maxLines + 10));
    expect(t.truncated).toBe(true);
    const long = parseMarkdown("y".repeat(MD_LIMITS.maxLineLength + 5));
    expect(long.truncated).toBe(true);
    expect(plainText(long.blocks[0].inlines).length).toBe(MD_LIMITS.maxLineLength);
  });
  it("pathological delimiters finish quickly (no quadratic or exponential scan)", () => {
    const cases = ["[".repeat(200_000), "`".repeat(5_000) + "a", "*a ".repeat(60_000), "_".repeat(200_000), "[a](".repeat(50_000), "<".repeat(200_000), "**".repeat(100_000), "~~x ".repeat(50_000)];
    const started = Date.now();
    for (const c of cases) parseInline(c);
    parseMarkdown(`${"- a\n\n".repeat(20_000)}`);
    parseMarkdown(`- a\n${"\n".repeat(19_000)}  b`);
    parseMarkdown(`| a |\n|---|\n${"| x |\n".repeat(19_000)}`);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
