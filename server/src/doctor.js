// Preflight checks shared by `npm run doctor` and GET /api/health. Never prints a setting's value, needs no network.
// Each check: { id, level: 'pass' | 'info' | 'fail', detail }.
import { assertBindAllowed, bindHost, portProblem, scanHosts, DEFAULT_PORT, UUID } from './safety.js';
import { netguardSelfTest } from './netguard.js';
import { modeFrom, realConfig } from './config.js';
import { MOCK_DIR, loadAll } from './pages.js';

export async function runChecks({ env = process.env, mockDir = MOCK_DIR } = {}) {
  const checks = [];
  const add = (id, level, detail) => checks.push({ id, level, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 20 ? 'pass' : 'fail', `v${process.versions.node} (need >= 20; Node 26 is the CI and Docker version)`);

  const cfg = realConfig(env);
  try { add('mode', 'pass', `mode=${modeFrom(env)}${cfg.ok ? ' (Real configured)' : ' (Mock only)'}`); } catch (e) { add('mode', 'fail', e.message); }
  add('real-settings', 'info', cfg.ok ? 'Real is configured: FIELD_NOTES_DIR is a readable folder outside the repo (path not shown)' : cfg.problem);

  try { add('bind', 'pass', `${assertBindAllowed(bindHost(env), env)}${env.FIELD_NOTES_BIND ? ' (FIELD_NOTES_BIND opt-in; Real is off)' : ' (loopback)'}`); } catch (e) { add('bind', 'fail', e.message); }
  const port = env.PORT === undefined || env.PORT === '' ? DEFAULT_PORT : Number(env.PORT);
  const problem = portProblem(port);
  add('port', problem ? 'fail' : 'pass', problem || `${port} is this app's one allocated port`);

  // The shipped (Mock) pages: all load, all have complete front matter, none names a real host or carries a UUID.
  try {
    const { pages, skipped } = loadAll(mockDir);
    add('mock-pages', pages.length && !skipped.length ? 'pass' : 'fail', skipped.length ? `refused: ${skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}` : `${pages.length} page(s) in pages/ load`);
    const incomplete = pages.filter((p) => p.problems.length);
    add('front-matter', incomplete.length ? 'fail' : 'pass', incomplete.length ? incomplete.map((p) => `${p.slug}: ${p.problems.join(', ')}`).join('; ') : 'every shipped page has title, date, apps, tags and summary');
    const dirty = pages.filter((p) => scanHosts(p.text).length || UUID.test(p.text));
    add('sanitized', dirty.length ? 'fail' : 'pass', dirty.length ? `real-looking host or UUID in: ${dirty.map((p) => p.slug).join(', ')}` : 'shipped pages name only .example/.invalid hosts and carry no UUID');
  } catch (e) { add('mock-pages', 'fail', `pages/ cannot be read (${e.code || e.message})`); }

  const ng = await netguardSelfTest();
  add('netguard', ng.ok ? 'pass' : 'fail', ng.ok ? `blocked fetch, socket, socket-by-IP, dns lookup, dns resolve, udp send and udp connect (${ng.blocked}/7)` : ng.detail);
  return checks;
}

export const allPassed = (checks) => checks.every((c) => c.level !== 'fail');
