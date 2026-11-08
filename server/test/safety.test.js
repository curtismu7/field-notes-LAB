import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBindAllowed, bindHost, cleanText, isLoopbackHost, portProblem, resolvePort, scanHosts } from '../src/safety.js';
import { allPassed, runChecks } from '../src/doctor.js';
import { NOENV, page, rm, tempDir } from './helpers.js';

test('loopback names and the bind rule', () => {
  for (const h of ['localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) assert.ok(isLoopbackHost(h), h);
  for (const h of ['0.0.0.0', '10.0.0.1', 'localhost.example', '128.0.0.1']) assert.ok(!isLoopbackHost(h), h);
  assert.equal(bindHost({}), '127.0.0.1');
  assert.throws(() => assertBindAllowed('0.0.0.0', {}), /loopback only/);
  assert.equal(assertBindAllowed('0.0.0.0', { FIELD_NOTES_BIND: '0.0.0.0' }), '0.0.0.0');
});

test('the one port is 7804', () => {
  assert.equal(resolvePort({}), 7804);
  assert.equal(portProblem(7804), null);
  for (const p of [7801, 7802, 7803, 7810, 8080, 5173]) assert.ok(portProblem(p), String(p));
  assert.throws(() => resolvePort({ PORT: '7801' }), /allocated port 7804/);
});

test('scanHosts finds real hosts and emails, ignores reserved and loopback', () => {
  assert.deepEqual(scanHosts('see https://gateway.example.invalid/x and http://127.0.0.1:7804/ and a@b.example'), []);
  assert.deepEqual(scanHosts('see https://real-host.test/x and ops@corp.test'), ['corp.test', 'real-host.test']);
});

test('cleanText strips control and bidi characters and caps length', () => {
  assert.equal(cleanText('a\u0007b⁦c', 10), 'a b c');
  assert.equal(cleanText('x'.repeat(50), 5), 'xxxxx');
});

test('doctor: passes on the shipped pages; fails when a shipped page names a real host, carries a UUID or lacks front matter', async () => {
  assert.equal(allPassed(await runChecks({ env: NOENV })), true);
  const dir = tempDir({ 'leak.md': page({ body: 'call https://prod.corp.test/api and 123e4567-e89b-12d3-a456-426614174000' }), 'bare.md': '# no front matter' });
  try {
    const checks = await runChecks({ env: NOENV, mockDir: dir });
    const by = Object.fromEntries(checks.map((c) => [c.id, c]));
    assert.equal(by.sanitized.level, 'fail');
    assert.match(by.sanitized.detail, /leak/);
    assert.equal(by['front-matter'].level, 'fail');
    assert.match(by['front-matter'].detail, /bare: no title/);
    assert.equal(by.netguard.level, 'pass');
  } finally { rm(dir); }
});
