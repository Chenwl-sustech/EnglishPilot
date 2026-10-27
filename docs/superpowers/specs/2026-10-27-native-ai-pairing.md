# Native AI device pairing

The owner requests actual iPad AI pairing and Harmony browser acceptance. The installed QA build pins the public example origin. Existing production credentials are sensitive and cannot be read back from cloud dashboards.

Add one optional `BACKEND_DEVICE_TOKEN` to the existing backend, alongside `BACKEND_ACCESS_TOKEN`. The new token is a random 32-byte value encoded as hex, accepted only when 32–4096 characters without whitespace. Keep existing authorization and Origin rejection. Both credentials use the same quota ledger and teacher receipt store; no new budget, bootstrap or migration.

Pin the canonical existing HTTPS origin only in an ignored private iOS project. Sign with the existing QA identity and overwrite the app. Transfer a private mode-600 pairing file to the app cache; the existing native code validates it, saves it in this-device-only Keychain and removes the file. Never publish credentials or read personal account sessions.

Verify credential acceptance, invalid values, browser rejection and shared quota with synthetic tests. Verify on the actual iPad: connection/model, current quota, one synthetic writing evaluation and one synthetic teacher reply, then relaunch to verify pairing persists. Harmony browser acceptance uses owner-operated real phone steps and cross-device markers; desktop emulation cannot substitute for a physical result.

The iPad could not reach the original Vercel URL directly, while Netlify was reachable. The account gateway therefore optionally accepts the native device credential only without an Origin header and forwards its existing server-side backend credential. Browser accounts still require an approved Supabase session. The gateway accepts an empty POST only for the configuration connection check, normalizing it to an empty JSON object. Netlify Free cannot apply a functions-only scope or secret flag in this project; the random native token is a server environment variable visible to account administrators and is never included in public assets. Provider credentials remain in the existing AI backend.
