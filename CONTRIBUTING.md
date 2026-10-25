# Contributing

Use Node 22+ for the client and Node 24 for the independent backend. Install dependencies from the lockfiles with `npm ci` in the appropriate directory.

```sh
npm test
npm run test:release
npm run typecheck
npm run native:build
cd backend
npm ci
npm run build
npm test
```

After installing client and backend dependencies, run `npm run licenses:collect` when updating dependencies. It retains root and nested bundled notices, including LICENSE / LICENCE spellings, under a guarded generated directory. Review the generated catalog before distribution.

Keep personal study data, credentials and signing files outside the repository. Before a release, run `node scripts/verify-public-release.mjs` against the actual Git index and scan the generated archives using `--source-archive` or `--native-archive`. The check is a safeguard, not a substitute for reviewing changed files and content rights.

New external vocabulary or exercise content requires an explicit redistribution license and attribution. Preserve stable vocabulary IDs and review histories; do not treat publisher links as a license to mirror an exam bank. Do not weaken the native HTTPS origin pinning, redirect rejection, cloud authentication, atomic quota handling or uncertain-request receipts.

Open a focused issue or pull request describing the observed problem, intended behavior and relevant validation. Never attach real API keys, full learner backups, recordings or personal provisioning profiles to a public issue.
