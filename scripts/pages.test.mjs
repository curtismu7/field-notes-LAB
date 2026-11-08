// The shipped (Mock) pages are sanitized: reserved hosts only, no UUIDs, no @mentions or e-mail addresses, placeholders for namespaces.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UUID, scanHosts } from '../server/src/safety.js';
import { loadAll } from '../server/src/pages.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pages');

test('every shipped page loads with complete front matter', () => {
  const { pages, skipped } = loadAll(dir);
  assert.deepEqual(skipped, []);
  assert.ok(pages.length >= 2);
  for (const p of pages) assert.deepEqual(p.problems, [], p.slug);
});

test('every shipped page is sanitized', () => {
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const t = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.deepEqual(scanHosts(t), [], `${name}: real-looking host`);
    assert.ok(!UUID.test(t), `${name}: UUID`);
    assert.doesNotMatch(t, /(^|[\s(])@[A-Za-z][\w.-]+/m, `${name}: an @mention`);
    // bare host names (no scheme) that are not reserved: anything.<tld> with a dot-separated label and a common real TLD
    const bare = [...t.matchAll(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|cloud|dev|ai)\b/gi)].map((m) => m[0]);
    assert.deepEqual(bare, [], `${name}: bare real-looking host names`);
  }
});

test('the audit-trail page keeps the findings, with placeholders for the sanitized identifiers', () => {
  const t = fs.readFileSync(path.join(dir, 'privilege-mcp-audit-trail.md'), 'utf8');
  for (const s of ['gateway.example.invalid', 'console.example.invalid', 'local.example.invalid', '<cluster-namespace>', '<sidecar-namespace>', '<gateway-deployment>', '<uuid>', 'the owner']) assert.ok(t.includes(s), s);
  const tables = t.split('\n').filter((l) => /^\| ?-{3}/.test(l)).length;
  assert.equal(tables, 8, 'all eight tables of the source are kept');
  assert.match(t, /^source: "owner findings, sanitized"$/m);
});
