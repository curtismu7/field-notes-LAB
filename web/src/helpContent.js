// What the Help dialog says. Plain, and as hedged as the rest of the lab (rule 2): what was measured, what is simulated, what is UNVERIFIED.
export const HELP_SECTIONS = [
  {
    heading: "What this lab is",
    body: [
      "A library of pages about our apps and what we learned: findings, how-tos and investigations. Each page is one Markdown file with a small front-matter block (title, date, apps, tags, summary). Any .md file dropped into the folder becomes a page — no code change, no restart.",
      "It is a reading room, not a search engine over live systems: everything here was written down by a person at some earlier time."
    ]
  },
  {
    heading: "Measured, simulated, UNVERIFIED",
    body: [
      "Mock: the sanitized pages shipped in this repo's pages/ folder. Hosts are .example or .invalid, namespaces and ids are placeholders, people are \"the owner\". Nothing is fetched from the network.",
      "Real: your full, unsanitized notes from FIELD_NOTES_DIR, read-only, loopback only. They can name real hosts and tenants, so do not share this screen with a customer.",
      "Every page is one person's finding at one time — treat dates and \"as of\" notes as part of the claim. Nothing on a page is re-verified by this lab when you read it."
    ]
  },
  {
    heading: "How to use the page",
    body: [
      "The Pages link goes to the page list; About is the lab's own page. On the list, search and filter by app or tag; cards show title, date, apps, tags and the summary. Open a page to read it with an on-page contents list.",
      "The top menu holds the Mock/Real mode picker, theme, font size, Talk track, Help. Each page also has a Raw markdown view served as plain text (never run), with a download option.",
      "Talk track builds its steps from the pages library itself: one step per page, in list order, using each page's summary as the thing to say. It is a walk through your notes, not a scripted demo track.",
      "To add a page: drop a .md file with the front-matter block into the folder — see the \"How to add a page\" page in Mock for the exact fields. Sanitized pages go in the repo's pages/; full unsanitized notes go only in your Real folder."
    ]
  },
  {
    heading: "What renders",
    body: "Headings (with a contents list), tables, fenced code, task lists, block quotes, links and inline code. Raw HTML in a page is shown as text, never run; only http, https and relative links become links. A page is capped at 512 KB and 20,000 lines."
  }
];
