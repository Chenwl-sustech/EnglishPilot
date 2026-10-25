# EnglishPilot AI backend

Standalone authenticated Vercel / Upstash service for the native EnglishPilot app.

```sh
npm ci
npm run build
npm test
```

Node 24 is required. Follow [deployment and migration instructions](../docs/cloud-backend.md). All actual keys belong in server-side Secret environment variables; `.env.example` contains names only. Provider usage is billed by the provider independently of free hosting quotas.
