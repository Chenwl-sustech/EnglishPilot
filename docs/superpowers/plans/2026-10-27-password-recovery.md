# Web Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let the owner reset the existing learning password using email and privately submit the new password.

**Architecture:** A standalone static recovery page uses a dedicated official Supabase PKCE client. Persist only expiring verifiers; keep recovery sessions out of the learning session and IndexedDB.

**Tech Stack:** Next 16 static export, React, Supabase JS, Vitest.

**Spec:** docs/superpowers/specs/2026-10-27-password-recovery-design.md

## Global Constraints

- Public project key only; no administrator credentials or password logs.
- Eight-character password minimum, exact confirmation, ten-minute verified recovery grant.
- Preserve existing account/data, public signup state and native session behavior.
- User performs new credential entry and submission.

## Review Focus

- Wrong browser/expired code fails without allowing password update.
- Callback query/hash removed before any exchange; no bearer URL handling.
- Only recovery exchange authorizes update, never a pre-existing normal session.
- PKCE state survives a new tab; access/refresh sessions never persist to disk.
- Sending mail does not claim delivery; default service remains member-only/rate limited.

### Task 1: Isolated recovery flow and deployed entry

**Files:** Create src/lib/sync/password-recovery.ts, src/app/reset-password/page.tsx, src/components/password-recovery.tsx, tests/account-password-recovery.test.ts. Modify src/components/account-sync.tsx, scripts/build-account-web.mjs, tests/account-web-build.test.ts and docs/account-sync.md.

**Interfaces:** `createPasswordRecovery(config, storage, fetcher?, now?)` returns request(email, origin), consume(url, clearUrl), finish(password, confirmation), with only the verified recovery result enabling finish. Page creates it once in a client effect. Login UI links to `/reset-password/` for explicit `link` build mode.

- [x] Write tests using the real SDK and synthetic fetch/storage: reject unverified updates; request emits PKCE challenge and exact callback; callback cleanup precedes fetch; verify actual update after recovery only; reject wrong browser/type/expired grant/mismatched passwords; no persisted bearer session. Add build link-mode propagation test.
- [x] Run `npx vitest run tests/account-password-recovery.test.ts tests/account-web-build.test.ts` and confirm missing implementation/link mode fails.
- [x] Implement the flow, static form and gated navigation; no learning provider/database access on the reset page. Add no-referrer and no-store recovery page headers.
- [x] Run `npm test`, `npm run typecheck`, static cloud build, credential scans; independently review this delta. Expected: all pass, callback page deployed with recovery form, private gateway stays protected.
- [x] Configure exact Supabase callback and deploy; request one recovery email from the page, then hand off new password submission to the owner. Update GitHub and document actual evidence without claiming the password was reset before owner submission.
