# HarmonyOS adaptation implementation plan

> **For agentic workers:** Execute inline using superpowers:executing-plans. The user explicitly requested continuous implementation without intermediate questions.

**Goal:** Build an EnglishPilot HAP and verify the existing iPad learning experience on a HarmonyOS phone emulator, with working secure account synchronization and account-authorized AI.

**Architecture:** Keep the shared offline Next.js export inside ArkWeb. Adapt the ArkTS host to DevEco 26 while retaining API 12 compatibility where the APIs permit. Native RPC provides bounded, allowlisted HTTPS using Remote Communication Kit with redirects disabled, and secure session storage using Asset Store Kit. No server credentials or real learning backups enter source control or artifacts.

**Tech Stack:** Next.js/React, TypeScript/Vitest, ArkTS/ArkWeb, Remote Communication Kit, Asset Store Kit, Hvigor, HDC, emulator integration tests.

**Spec:** Existing `docs/windows-harmony-codex-prompt.zh-CN.md`, repository code, and the user's instruction to continue HarmonyOS adaptation through completion. Implementation choices here are the agent's decisions under that authorization.

## Global constraints

- Reuse `feature/account-sync` baseline, preserve real local and cloud learning records.
- Use synthetic emulator data and distinct test accounts for acceptance; do not copy private credentials from other devices.
- Keep local-origin resource and navigation restrictions; never expose arbitrary native HTTP or filesystem access.
- Session credentials must remain in system encrypted storage; fail closed when unavailable.
- Label unsigned emulator builds honestly and report all untested physical-device behavior.

## Review focus

- Reject lookalike origins, traversal, redirects, disallowed methods and oversize HTTP payloads.
- Preserve bytes and content type for 4 MB audio chunks and multipart upload bodies.
- Session writes must survive failures without replacing the committed session with incomplete data.
- Abort/navigation must clean pending native RPC and HTTP work.
- Offline drafts, microphone recovery and backup cancellation must retain existing data.

## Tasks

### 1. Compile the actual application

- [x] Reproduce `00303313` and compare with the official SDK 26 template.
- [ ] Remove the incompatible compile SDK override; align build model and resolve compiler-reported ArkTS incompatibilities.
- [ ] Build bundled pages, synchronize resources, compile a debug HAP and install on the emulator.
- [ ] Enable ArkWeb remote debugging only for debuggable applications to support actual application integration tests.

### 2. Secure Harmony transport and account integration

Files: `src/lib/native/harmony-{rpc,http,session,policy}.ts`, `native/harmony/entry/src/main/ets/{ExportBridge,NetworkBridge,SessionVault}.ets`, existing sync/AI adapters, native sync script.

- [ ] Write failing tests for RPC correlation, malformed replies, disposal/abort and timeouts.
- [ ] Write failing tests for URL/method/header/body limits and real Request/FormData/binary response conversion.
- [ ] Implement a reusable RPC port; keep existing export method compatibility.
- [ ] Implement the same tested network policy in the native host, with redirects disabled and bounded streaming responses.
- [ ] Implement system-encrypted session chunks with an atomic manifest and cleanup; test round trip, overwrite, remove, long sessions and interrupted writes on the emulator.
- [ ] Route Supabase and account AI through the Harmony bridge while retaining the iOS path.

### 3. Functional acceptance and corrections

- [ ] Run the real HAP in the phone emulator and record local application screenshots and machine-readable results from application integration tests.
- [ ] Verify onboarding, navigation, vocabulary/library, reading/listening/speaking/writing, mock exams, mistakes, analytics/calendar/settings and persistence.
- [ ] Verify microphone denial/retry, recording/playback, file selection, complete backup export/preview/restore using synthetic data.
- [ ] Verify secure login lifecycle, offline access, two-client synchronization and conflicts with test data; verify actual AI feedback through the existing server where credentials are available.
- [ ] Fix reproducible issues with focused regression tests; record platform limitations explicitly.

### 4. Delivery

- [ ] Run unit/release checks, typecheck, a real Harmony debug build and applicable native integration tests.
- [ ] Review the complete diff and artifact for credentials and unintended changes.
- [ ] Save the HAP, checksums, build instructions, acceptance report and any outstanding real-device requirements.
- [ ] Commit and publish the Harmony branch/update to the user's GitHub under the existing publication authorization.
