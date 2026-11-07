# Harmony physical-device cloud relay implementation plan

> Execute inline using superpowers:executing-plans. The user requested continuous adaptation without intermediate design questions.

**Goal:** Complete signed Mate 60 installation and enable real account login/sync when direct Supabase TLS is reset on the phone network.

**Architecture / design:** Preserve the Supabase project URL as account/database identity. An explicit native build setting routes allowlisted Supabase requests through the existing Netlify site at `/api/sync/<project-ref>/...`. The server accepts only its configured project and publishable key, forwards the user's own authorization, and retains Supabase RLS. No admin key, arbitrary upstream URL, redirect, cookies or credentials in logs. TLS validation stays enabled. The same TLS failure was later observed on iPad; a shared optional mapping and exact iOS CORS origin support that peer. Web retains its existing transport.

**Tech stack:** existing TypeScript native fetch/RPC, Netlify web Request/Response functions, Vitest, Hvigor, HDC.

**Spec:** User's request to finish Harmony adaptation; real-device evidence: Netlify anonymous AI GET returns 401; Supabase settings GET fails with RCP 1007900035 / TLS reset before sending HTTP headers. Signed HAP has already installed and launched on HUAWEI Mate 60 / API 26.

## Global constraints

- Preserve all real local/cloud study data. Use distinct labeled QA additions only.
- Public relay is optional at build time and limited to the existing Netlify origin.
- Forward at most 4 MiB + 64 KiB per request/response; existing audio chunks are at most 4 MiB. This stays under Netlify binary payload limits.
- Keep private signing files/profile and real account session out of Git and public artifacts.
- Require personal learning-account login; never transfer another device's session.

## Review focus

- Project/ref substitution or encoded paths must not reach another upstream/project.
- Preserve binary multipart uploads and non-2xx status/content-type without caching tokens.
- Oversize streams, redirects, fetch aborts and malformed headers must fail closed.
- A changed runtime Supabase project must not silently send credentials to a mismatched relay.
- Physical sync verification must distinguish read-only checks from synthetic cloud writes.

## Tasks

### 1. Relay and native transport regression

Files: `web-cloud/server/sync-proxy.mjs`, `web-cloud/netlify-functions/sync.mjs`, `src/lib/native/harmony-{policy,http}.ts`, `scripts/build-native.mjs`, `tests/{harmony-network,account-sync-relay,account-netlify,account-web-build}.test.ts`.

- [x] Write and run failing tests for configured-project requests, auth failures, binary preservation, redirects/size/error handling and opt-in native mapping.
- [x] Implement bounded fixed-upstream relay and optional native URL rewrite. Keep account identity and default direct transport unchanged.
- [x] Run targeted tests, whole unit suite, typecheck and release checks.
- [x] Diagnose 4 MiB real-device download timeout; implement checked 256 KiB Range assembly with a 180-second whole-download deadline, preserving existing storage/hash format.
- [x] Fix iPad account AI authorization after personal rebuild exposed the old template pairing origin. Add missing-session and cancellation regressions; independently review and compile the Swift bridge.

### 2. Deployment and physical acceptance

- [x] Assemble and deploy existing Netlify site under prior user authorization; verify phone native GET auth settings through relay.
- [x] Build full native payload with explicit public relay config; sign from local private config; overwrite-install without uninstalling on Mate 60 and iPad.
- [x] Real personal login, receive existing cloud data, phone audio upload/playback and real AI reply. Phone QA conversation received on iPad.
- [x] iPad reverse draft / AI / new audio playback verification after local screens are unlocked. Both physical devices received the peer's QA content; iPad actual AI reply reached Mate 60; new 3-second phone audio reached playback end on iPad.

### 3. Delivery

- [x] Independent review of relay, range, iOS CORS and account AI diffs; no outstanding actionable findings.
- [x] Record exact physical results and limitations, preserve local signed HAP, publish code/docs to the existing GitHub branch/PR. Public release remains unsigned; final acceptance notes supplement the existing preview.
