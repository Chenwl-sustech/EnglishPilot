import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
const options = { outdir: "dist", bundle: true, format: "esm", platform: "node", target: "es2022", sourcemap: false };
await build({ ...options, entryPoints: { "free-service": "cloud/service.ts", "redis": "cloud/redis.ts", "state-transfer": "cloud/state-transfer.ts" } });
await build({ ...options, entryPoints: { "vercel-handler": "api/index.js" } });
console.log("Built stateless Vercel/Upstash backend; no runtime secrets injected");
