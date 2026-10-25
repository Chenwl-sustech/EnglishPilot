# EnglishPilot Open Source Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session.

**Goal:** Produce the owner's local signed iPad package and publish a clean MIT source release to GitHub.

**Architecture:** Work in a new release copy; preserve the installed app and live backend. Root contains client and native hosts; backend/ contains the standalone cloud service. Private signed artifacts stay outside the repository and outside the public Release.

**Tech Stack:** Next.js/React/TypeScript, Capacitor/Swift, Node 24, Vercel/Upstash, Git/GitHub CLI.

**Spec:** ../specs/2026-10-25-open-source-release.md

## Global Constraints

- MIT applies to owner-authored code; CC BY-SA-4.0 vocabulary retains attribution and change history.
- No API/device/database tokens, personal signing profiles, recordings, backups or production addresses in public artifacts.
- Personal Team IPA remains local and restricted to its provisioned devices and profile lifetime.
- Do not modify the currently installed app or production deployment during release preparation.

## Review Focus

- History or archive leaks despite .gitignore: inspect actual tracked files and decompressed archives.
- Runtime packaging gaps: build from the clean copy and verify native-resource manifests.
- Third-party licensing omissions: retain source-specific attribution and license copies.
- Misleading installation claims: clearly distinguish source project and locally signed IPA.
- Public endpoint coupling: no personal deployment URLs or signing team identifiers in the copy.

## Task 1 — Clean and document the public source

- [x] Copy allowed source/config/test files, retain no private runtime directories.
- [x] Set example signing and AI endpoint values; add README, LICENSE, notices and deployment/signing guides.
- [x] Verify type checking, meaningful tests, client/native resource build and backend's deployment-entry tests.

## Task 2 — Build and inspect artifacts

- [x] Produce local IPA from the already signed application; validate signature after extraction and compare signed bundle bytes.
- [ ] Build public source/native project archives with licenses and SHA-256 sums.
- [x] Scan actual source and decompressed artifacts for known secrets, private metadata and unwanted file types.
- [x] Request one fresh final review; fix findings and rerun affected verification.

## Task 3 — Publish and verify

- [x] Authenticate official gh with user-confirmed device authorization; verify account matches owner.
- [ ] Initialize a new Git history, create the public EnglishPilot repository, push the reviewed snapshot.
- [ ] Create a versioned Release with the selected public artifacts and verify repository visibility, license, tag and download assets.
- [ ] Deliver public URLs plus the local restricted IPA and its actual expiry.
