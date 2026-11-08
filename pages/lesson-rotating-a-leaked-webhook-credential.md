---
title: "Lesson: rotating a leaked webhook credential"
date: 2026-11-08
apps: [pingone-events-LAB, PingOne]
tags: [lesson, secrets, webhooks, pingone, how-to]
summary: "A helper process printed the webhook's Basic credential into a log. How we rotated it in the right order, how a half-done run was finished, and how we proved the old value is dead."
source: "owner findings, sanitized"
---

# Lesson: rotating a leaked webhook credential

Written by the owner, 2026-11-08. Sanitized copy: the namespace is `<app-namespace>`, the subscription id is `<subscription-id>`. No credential appears here.

## What leaked

A helper process debugging the PingOne webhook printed the request's `Authorization: Basic …` header into its own log. The log stayed on the owner's Mac, but a credential that has been written anywhere outside its store counts as leaked.

## The order

The webhook credential lives in two places: the app's Kubernetes Secret (what the receiver checks) and the PingOne subscription's custom header (what PingOne sends). Change them in this order so the gap is seconds, not minutes:

1. Back up the Secret's webhook values into a backup Secret (server side, never printed) and save the subscription as it is.
2. Generate a new random password in memory.
3. Patch the Secret with it (user name unchanged).
4. Restart the receiver. From here until step 5, PingOne gets 401 and queues events.
5. `PUT` the subscription with the new Authorization header (every other field from a fresh GET).
6. Verify: subscription enabled, a 2xx delivery within 5 minutes, events stored, old credential refused.
7. Save the new header into the local "before" file, so a later rollback script matches PingOne again.
8. Turn forwarding back on (the restart reset the in-memory flag).

There is a rollback path too (R1 to R6). The script asks y/N before each step, refuses to overwrite a backup without asking, and prints no secret: values pass from command to command inside the pod or through stdin.

## What went wrong, and how it was finished

The first run patched the Secret, but the PingOne update was never made: the automation that ran it is not allowed to write secret stores, so that step was blocked. For a few minutes the receiver expected the new password while PingOne sent the old one, and events queued in PingOne (it retries; nothing was lost).

The owner re-ran the same script answering **n** to steps 1 to 4 (already done) and **y** to 5 to 8. That finished it. The backup Secret and the saved state files were deleted afterwards.

## Proof

- Old credential: 401 on the webhook.
- New credential: 200.
- The page login does not open the webhook, and the webhook credential does not open the page.
- Subscription status `SUCCESS`, event count climbing, forwarder `failed: 0`.

## Lessons

- Never print request headers in a debugging helper. Print the header **names** only.
- When a rotation spans two systems, make every step idempotent and skippable, so a half-done run can be finished rather than restarted.
- Back up before the first change, and never let a re-run overwrite the backup.
