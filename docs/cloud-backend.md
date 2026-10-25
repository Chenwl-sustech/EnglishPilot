# Deploy your own AI backend

The independent service is in `backend/`. It does not depend on keeping a Mac on. The public repository has no shared AI access credential.

1. Use your own Vercel Hobby account for personal, non-commercial use and an account-owned Upstash Redis Free database. Existing Free databases may be reused with a separate stable key prefix. Avoid anonymous databases that expire before being claimed.
2. Install Node 24, enter `backend/`, run `npm ci`, `npm run build`, and `npm test`.
3. Link a separate Vercel project with the official Vercel CLI, then configure production environment variables listed in `.env.example`.

Required secrets: `DEEPSEEK_API_KEY`, `BACKEND_ACCESS_TOKEN` (at least 32 random characters), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Optional stable prefix: `ENGLISHPILOT_CLOUD_PREFIX`, default `englishpilot:free:v1`. Keep all secrets server-side. Use the official DeepSeek model `deepseek-flash`; model availability remains the provider's responsibility.

Initialize the database explicitly with `node scripts/manage-state.mjs init` only for a genuinely new service. Provide the Redis credentials through a protected process environment. Ordinary API requests do not create/reset the quota ledger. For an existing compatible service, pause new requests, drain in-flight requests, export the existing SQLite snapshot and import it with the provided migration script. Do not use `init` instead of preserving prior usage. Do not restart a stale local ledger after new cloud calls.

Run `vercel deploy --prod` from `backend/`. `vercel.json` uses Node 24, the Singapore function region, a 120-second duration and a public output directory. The runtime entry imports the emitted JavaScript bundle; TypeScript sources are not used as unresolved runtime modules.

Verify `GET /api/health` (runtime only), unauthorized 401, authenticated quota 200, model configuration check, then a synthetic teacher/evaluation request. The deployed API requires the device Bearer credential and rejects browser Origin requests. Verify both the device-to-service and service-to-provider networks before pairing the app. Use the stable production origin in the native allowlist.

The application quota defaults to 20 calls and 200000 token per Beijing day, with at most 4096 output token per request. A request may consume multiple Redis commands. Uncertain provider usage remains reserved; repeated teacher request IDs retrieve stored receipts rather than automatically sending another paid request. Database failures stop AI safely.

Vercel/Upstash hosting may be free within their free plan limits; **DeepSeek calls are billed separately**. This is not a promise of free permanent hosting. Vercel Hobby is for personal non-commercial use. Upstash Free may be archived after extended inactivity; restore/check the existing ledger rather than creating an empty one. Check current limits and terms before deployment:

- https://vercel.com/docs/plans/hobby
- https://upstash.com/pricing/redis
- https://upstash.com/docs/redis/help/faq

For local Web development, copy the root `.env.example` to an untracked `.env.local` and configure the local Next.js server. These local routes and the independent native backend are alternative deployments; never ship provider secrets into browser bundles.
