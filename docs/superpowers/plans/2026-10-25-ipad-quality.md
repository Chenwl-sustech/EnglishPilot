# iPad Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix defects reproduced during the v0.1.1 iPad audit and publish a verified maintenance release.

**Architecture:** Preserve the current local database and native AI boundary. Wait for asynchronous device voice discovery before pronunciation, remove unsupported desktop-service actions from native screens, and reset the viewport when entering a lesson.

**Tech Stack:** React 19, TypeScript, Next.js 16, Capacitor 8, Swift, Vitest.

**Spec:** `docs/qa/2026-10-25-ipad-audit.md` and the user's request to exercise iPad features, fix bugs and update GitHub.

## Global Constraints

- Preserve existing study records, recordings, keychain credentials and backend quota.
- Use a separate test installation for destructive and synthetic learning flows.
- No provider keys or personal signing settings in public Git or Release assets.
- Support iOS 15+ and Node 22+; no new runtime dependencies.
- Distinguish iPad observations, browser checks, automated tests and untested cases.

## Review Focus

- Voice discovery can finish after stop/navigation: canceled requests must not speak later.
- Empty or online-only voice catalogs must produce a bounded, truthful error without network speech.
- Desktop-imported voice preferences must not route an iPad to an unavailable desktop WAV service.
- Native recording and manual text evaluation must remain usable when desktop controls are hidden.
- Backup restoration and signed app updates must preserve original audio bytes.

### Task 1: Reliable first pronunciation

**Files:** Modify `src/lib/pronunciation.ts`; create `src/lib/device-voices.ts`, `tests/pronunciation.test.ts`.

**Interfaces:** Voice discovery accepts `SpeechSynthesis` and cancellation; pronunciation retains its existing synchronous `speak` / `stopPronunciation` call sites.

- [x] Reproduce the cold-list error with a fake SpeechSynthesis emitting `voiceschanged` after the initial empty result.
- [x] Watch regressions fail: delayed first voice, stop-before-ready, replacing a pending request, empty-list timeout, no silent online fallback.
- [x] Implement bounded asynchronous discovery and cancellation; retain immediate playback when voices are already available.
- [x] Run pronunciation tests and the app suite.

### Task 2: Accurate native capabilities, permission guidance and lesson navigation

**Files:** Modify `src/components/service-settings.tsx`, `whisper-panel.tsx`, `teacher-composer.tsx`, `listening-import.tsx`, `listening-batch-import.tsx`, `listening-lab.tsx`, `exercises.tsx`, `reading-trainer.tsx`; create `tests/native-ui-capabilities.test.ts`; update `vitest.config.ts` for the existing source alias.

**Interfaces:** Existing native flag determines the already-enforced API capability boundary; original desktop/web behavior remains available.

- [x] Render native service, transcription and import screens in regression tests; reject Windows-install, local-WAV, local-model-download and automatic remote-import actions.
- [x] Watch tests fail before hiding those unsupported actions; preserve local recording/import and manual self-review.
- [x] Use device speech in native listening even after restoring desktop WAV preferences.
- [x] Enter reading/grammar lessons at the top of the page; check this through the actual UI.
- [x] Correct the empty writing draft's saving indicator.
- [x] Reproduce and correct native microphone denial guidance in all four recording entry points.
- [x] Stop calendar days before enrollment being marked missed; hide native-only unsupported calendar fetch controls.
- [x] Run app tests and typecheck; repeat affected iPad flows.

### Task 3: Complete audit, update and publish

**Files:** `docs/qa/2026-10-25-ipad-audit.md`, version metadata and generated public native package.

**Interfaces:** Consume verified fixes, produce v0.1.2 source and self-signing Xcode project ZIPs; personal signed IPA stays local.

- [ ] Finish navigation/settings/import/backup tests, recording tests when authorized, plus online/offline AI behavior.
- [ ] Run app, backend and release suites, typecheck, native build and iOS build.
- [ ] Obtain a fresh whole-change review; fix important findings with RED→GREEN evidence.
- [ ] Upgrade the original iPad app without uninstalling; compare recording hashes and recheck the cloud connection.
- [ ] Scan staged source and public ZIPs, commit, push and publish the maintenance Release; independently verify downloads.
