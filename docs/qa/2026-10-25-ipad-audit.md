# iPad functional audit — v0.1.3

Audit started 2026-10-25; continued 2026-10-26 (Asia/Shanghai).
Baseline: v0.1.1 (`ecc8f51`). Device: 11-inch iPad Pro, iPadOS 27.2.

## Scope and data protection

Original application data was copied locally before testing. First-run, scored
practice, microphone denial, imports and restore cases used a separately signed
QA installation with synthetic records. Private device identifiers, personal
signing profiles, credentials, screenshots and recordings are not published.

## Confirmed defects and fixes

1. Vocabulary pronunciation could fail on first use because WebKit initially
   returns an empty voice list. Wait up to two seconds for local English voices,
   cancel pending discovery on stop/replacement and never silently use online speech.
2. A delayed pronunciation could survive closing the word collector or leaving a
   route. Both lifecycle boundaries now cancel pending and active pronunciation.
3. Native screens offered actions for unavailable desktop services: WAV synthesis,
   local Whisper model/transcription and automatic remote listening imports. Native
   controls now describe supported recording, file import and manual text review.
   Restored desktop WAV preferences fall back to device speech on native builds.
   Windows voice-pack controls were already hidden by the released web flag; the
   native flag now independently enforces that distinction. The follow-up also
   removes the AI teacher's desktop WAV/Whisper probes and misleading model-management
   link, while retaining its device voice catalog and desktop behavior.
4. Opening reading/grammar lessons from a scrolled list hid the heading and timing
   controls. Lesson entry now resets the viewport to the top.
5. An untouched, empty writing draft could remain labeled as saving. Empty drafts
   now compare correctly with the absent stored value.
6. Denied microphone access showed a raw English platform error. All four recording
   entry points now explain permission recovery in Chinese without changing saved audio.
7. The calendar marked days before enrollment as missed. Historical missing status
   now begins at the learning start date. Unsupported native calendar fetch actions
   and its automatic check are disabled; stored and manually imported calendars remain.

## User-flow evidence

| Area | Physical iPad evidence | Companion browser evidence |
| --- | --- | --- |
| Onboarding | New QA profile, assessment 3/4, entered home; state survived a QA update | New synthetic profile; assessment skip |
| Vocabulary | 25,861 headwords / 3,816 learnable cards; reveal and device speech investigation | Search, empty result, case-insensitive spelling, FSRS; valid one-word import and invalid JSON rejection |
| Grammar / reading | Unit/lesson rendering; 2-question reading submitted 1/2; explanation, timings and mistake review | Materials rendered in completed mini-test |
| Listening | Local Samantha voice discovered; sentence playback started | Transcript aid, listening questions in mini-test |
| Speaking | Microphone denial, Settings permission recovery, 48-second recording, playback and save | — |
| Writing | Native page/layout | Typed draft, autosave, version submission and reload persistence |
| Tests / review | Mock exam saved first answer, next-question progress, early-section confirmation and transition; mistake added to FSRS and rated | Entire 8-question mini-test completed 8/8 with per-skill results |
| Calendar / plan / analytics | Navigation/layout | Daily cap/note saved, plan rendered, analytics reflects actual attempts without inventing official scores |
| Settings / backup | Full backup exported through Save to Files to On My iPad; same file selected, SHA-256 validation preview showed 1 recording, restored successfully | Unconfigured AI controls, vocabulary validation, damaged-backup rejection without changing records; dark-theme persistence |
| Layout | Portrait and landscape inspected | Browser console had no errors during exercised flows |

The restored QA recording has the identical SHA-256 content hash. WebKit retained
two backing blob files containing the same bytes after its database transaction;
this is not evidence of two user-visible recordings. The restored UI showed one.

## Automated verification

- Baseline: 17 app, 9 backend and 8 release tests passed.
- Current: 35 app, 9 backend and 8 release tests passed (52 total); TypeScript check passed.
- New regressions were observed failing before implementation: asynchronous voice
  discovery/cancellation, native control capabilities, enrollment calendar boundary,
  microphone error translation and leaving a pronunciation scope.
- Native build synchronized 144 bundled resources; unsigned iOS simulator build passed.
- Independent review found one important lifecycle issue (item 2); fixed with a
  failing-then-passing regression. No other important or minor findings were reported.

## Limits

This is a representative functional audit, not an exhaustive proof for every input.
Full-length exam timing, every question in every pack, iOS 15 hardware, and HarmonyOS
installation were not exercised. No acoustic pronunciation score or on-device
Whisper transcription is claimed. Long-running network outages and every third-party
file provider remain outside this run. Browser checks supplement, rather than
replace, the native microphone, sharing and signed-upgrade checks.

## Signed upgrade and cloud smoke check

The original installation was upgraded in place to 0.1.2, iOS build 6, keeping its
bundle/signing identity. No uninstall occurred. All three original IndexedDB audio
payloads have identical before/after SHA-256 hashes. The upgraded app launched and
its original home profile and learning start day were visible. Personal signed IPA
creation and signed payload checks passed; it remains local and is not a public
Release asset. Its existing development profile expires 2026-10-30 04:38:23 UTC.

The deployed backend's authenticated configuration reported `deepseek-flash`.
One synthetic writing request returned an `ai-estimate`, suggestions and a revision
with the correct attempt ID. This was a direct cloud smoke check, not a claim of a
post-upgrade end-to-end iPad AI submission. No real recording was uploaded.

## Follow-up after Mac unlock — 2026-10-26

The prior three pending native checks were completed after input was restored:

- The existing 14-second recording played to its end on the upgraded installation.
- Wi-Fi was disabled in iPad Settings. Vocabulary, definitions and a grammar unit
  loaded; terminating and relaunching the app still opened the original local home
  profile. Wi-Fi was then re-enabled, with the original network and VPN connected.
- A synthetic QA answer was submitted from the installed AI teacher. A real reply
  and suggestions appeared, the daily allowance changed from 19 to 18, and a
  separate end-of-conversation review returned successfully. No original recording
  or private transcript was submitted.

The AI teacher still showed a desktop WAV error alongside an available Samantha
voice and linked to unsupported model management. v0.1.3 corrects these native
probes and messages. Its added regression failed before the fix and passed after;
an independent review reported no Critical, Important or Minor findings.

The original app was then upgraded in place to 0.1.3 (build 7). All three original
audio payload hashes remained identical. The new setup page showed device speech
and manual text instructions without the desktop error or model-management link.
The real AI reply and end review were still visible after this upgrade and relaunch.
Personal signed IPA creation and payload verification also passed; that IPA stays
local. These follow-up results replace the earlier Mac-control test limitation.

## Public artifact checks

The staged Git index and decompressed native project archive passed both the public-file policy scan and exact checks for the real
session credentials and device/signing identifiers. The native project ZIP contains
bundled pages and unsigned source projects, with no personal provisioning profile
or signed IPA. Its inventory and bundled-resource hashes passed validation.
