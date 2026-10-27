# Native AI Pairing Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; the owner has opted out of routine approval questions.

**Goal:** Pair the installed iPad QA app with the independent cloud AI and finish available Harmony phone acceptance.

**Architecture:** Add one optional independent device credential to the existing backend. Preserve its primary credential, quota and receipt stores. Use an ignored private iOS project for the real origin and signing.

**Tech Stack:** TypeScript, Node 24, Vercel, Netlify, Swift/Capacitor, Supabase.

**Spec:** ../specs/2026-10-27-native-ai-pairing.md

## Global Constraints

- No provider/database credentials in client builds, pairing files, Git or output.
- Preserve existing credentials, quota ledger, study spaces and app signing identity.
- Phone results require the actual owner-operated Harmony browser.

## Review Focus

- Existing gateway access remains valid alongside new device access.
- Short, whitespace-containing, oversized or absent optional credentials are rejected.
- Browser Origin requests remain rejected even with a valid credential.
- Requests with either credential consume the same quota.
- Native pairing is consumed into Keychain and survives relaunch; data survives the overlay update.

### Task 1: Optional device authorization

**Files:** backend/worker/backend.ts; backend/tests/free-service.test.mjs; matching private deployment sources.

**Interfaces:** accessResponse(Request, env) returns null for either valid credential, otherwise the existing refusal response. No API/data schema changes.

- [x] Add two synthetic regression tests and observe 401 instead of expected 200.
- [x] Add validated optional device credential and retain constant-time comparisons and Origin refusal.
- [x] Build and run both public/private backend tests; review authorization delta.

### Task 2: Deploy and pair

**Files:** backend/.env.example; docs/cloud-backend.md; ignored private iOS project and pairing file.

- [x] Generate private random device credential; add to the backend sensitive environment and Netlify server environment without modifying existing secrets. Netlify Free does not permit the restricted secret scope.
- [x] Publish verified private backend and check configuration, quota and unauthorized/Origin refusal.
- [x] Verify QA signature, overlay install, transfer pairing file to stopped app and launch.
- [x] Verify actual iPad model/connection, writing evaluation, teacher reply and relaunch; remove private local pairing file after verification.

### Task 3: Harmony acceptance and evidence

- [x] Owner phone receives the baseline and uploads a unique marker; verify it in Mac.
- [x] Return a marker to phone; owner verifies audio playback. Browser recording/save behavior remains unverified.
- [ ] Record actual results and remaining physical limitations; scan public changes, commit and update PR.
