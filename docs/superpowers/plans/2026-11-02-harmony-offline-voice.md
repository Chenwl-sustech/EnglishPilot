# Bundled Harmony offline English fallback

User requested continued development without intermediate questions. System Core Speech Kit download is reproducibly blocked in the emulator's model service: HTTP 200 followed by OTA `response analyze error` (11500100), exposed as 1002300008. Do not patch vendor system files or claim a successful download.

Design: retain Core Speech Kit Laura as preferred voice, add a bundled open-source Flite English voice via N-API as explicit basic offline fallback. Keep all text on-device. Render bounded PCM/WAV asynchronously; preserve pause/rate/cancellation through the existing player. Include upstream source/license and pin provenance. Do not upload text to a substitute online service.

Plan:
- Verify upstream runtime/voice license and pin source; build native fallback with the installed Harmony NDK.
- Add bounded async synthesis and cancellation; test malformed input, queue pressure, valid WAV duration/bytes and cleanup.
- Integrate availability and clear voice labeling into settings, pronunciation, listening and teacher.
- Verify real emulator generation/playback with system voice unavailable, pause/resume/rate/cancel, full regression/build.
- Update QA, GitHub branch/PR and a new clearly labeled unsigned preview; real account and physical-device limits remain explicit.
