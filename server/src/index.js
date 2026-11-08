import { installNetguard } from './netguard.js';
import { startHttpServer, createApp } from './app.js';
import { allPassed, runChecks } from './doctor.js';
import { assertBindAllowed, bindHost, resolvePort } from './safety.js';
import { modeFrom, realConfig } from './config.js';

installNetguard(); // before anything else can open a socket

const checks = await runChecks();
if (!allPassed(checks)) {
  for (const c of checks.filter((x) => x.level === 'fail')) console.error(`[field-notes] refusing to start: ${c.id}: ${c.detail}`);
  process.exit(1);
}
console.log(`[field-notes] starting in ${modeFrom()} mode`);
const host = assertBindAllowed(bindHost(), process.env);
const { url } = await startHttpServer({ port: resolvePort(), host, app: createApp() });
console.log(`[field-notes] at ${url} (${realConfig().ok ? 'Real available: your local notes folder, loopback only' : 'Mock only: the sanitized pages in pages/'}; no outbound network)`);
console.log(`[field-notes] health: ${url}api/health`);
