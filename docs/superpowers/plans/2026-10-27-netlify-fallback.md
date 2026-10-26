# Netlify Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the existing account web app to a phone-reachable free alternative without replacing accounts or data.

**Architecture:** Repackage the existing isolated static build with a Netlify Request/Response adapter around the shared private AI proxy. Existing Vercel and Supabase deployments remain available.

**Tech Stack:** Node 24, Next static export, Netlify Functions, Vitest.

**Spec:** docs/superpowers/specs/2026-10-27-netlify-fallback-design.md

## Global Constraints

- Free account only; owner handles account terms/authentication consent.
- Preserve original app, Supabase account and cloud data; no automatic personal-data upload.
- Only five server-side runtime values, never copied into static files.
- Four exact API paths, no new privilege, 55-second network deadline, no AI retries.

## Review Focus

- Published assets must exclude server source and private environment files.
- Guarded rebuild must not overwrite arbitrary folders or follow symlinks.
- Function receives the original exact API path and preserves bearer validation.
- Deadline must return a JSON failure before the platform kills the process.
- Actual platform routes/headers and phone access require live checks after authorization.

### Task 1: Safe alternate deployment package

**Files:** scripts/build-account-netlify.mjs; web-cloud/netlify-functions/ai.mjs; web-cloud/netlify.toml; package.json; tests/account-netlify.test.ts; docs/account-sync.md.

**Interfaces:** `assembleAccountNetlify(publicSource,destination)` copies validated static assets and known server/templates; CLI `npm run cloud:web:netlify` calls the existing static builder before assembly. Netlify default function calls the existing `accountWebResponse` with one shared deadline signal.

- [ ] Write behavior tests for isolated assembly, no environment/server publication, guarded overwrite, symlink rejection, function routes/authentication, and a hanging external request returning a JSON timeout.
- [ ] Run focused test and verify missing package/entry behavior fails.
- [ ] Implement the assembly, adapter and Netlify headers; document finite free credits and exact callback configuration.
- [ ] Run full tests/typecheck, assemble from the validated static export, scan private values, and independently review this delta; locally bundle functions with official CLI before requesting account authorization.
- [ ] After owner account setup, configure server secrets and exact Supabase callback, publish, verify live endpoints and request phone reset/login verification. Until then mark deployment and acceptance pending.
