# Account Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在手机与 iPad 上提供隔离账号、离线学习及不会静默覆盖的云同步。

**Architecture:** Supabase 官方 Auth 客户端管理会话，私有 Storage 保存 4 MiB 音频块，Postgres CAS RPC 保存版本化学习文档。Dexie 为每个账号提供独立数据库；三方合并与本地事务保护并发编辑。

**Tech Stack:** TypeScript、React、Dexie、Zod、supabase-js、PostgreSQL、iOS Keychain。

**Spec:** docs/superpowers/specs/2026-10-26-account-sync-design.md

## Global Constraints

- Node 22+，iOS 15+；客户端绝不包含 service_role、密码或已有私人 AI 令牌。
- 旧 EnglishPilot 数据库保持本机空间；账号按项目 URL 与 uid 隔离。
- 启用之前必须说明上传的学习文字、个人设置、词库和录音；无默认上传。
- 4 MiB 分块；单份同步数据沿用现有备份 512 MiB 上限。
- 先准备代码及合成数据测试；实际云验证完成前不声称上线。

## Review Focus

- 账号切换或退出时仍在途的下载不得应用到另一账号。
- 录音保存期间的同步不得使音频清单和实际 Blob 不一致。
- 网络成功但本地应用前的新编辑不得被抹除或标为已上传。
- 并发删除与修改、同一复习卡及有序消息不得被不正确合并。
- 云端损坏数据、超额和服务暂停必须保留本地学习能力。

### Task 1: Sync document and safe merge

**Files:** Create `src/lib/sync/document.ts`, `src/lib/sync/merge.ts`, `tests/account-sync-document.test.ts`.

**Interfaces:** `SyncDocument {version:1,state:State,recordings:MediaEntry[],listeningAudio:MediaEntry[]}`; `makeDocument(snapshot)` yields document + hash-addressed Blob chunks; `materialize(document,readChunk)` validates all downloaded bytes. `mergeDocuments(base,local,remote)` returns document or conflict paths.

- [ ] Write tests: independent attempts survive; concurrent draft/FSRS edits conflict; deletion versus edit conflicts; disjoint settings with invalid combined allocations conflict; chunk reconstruction matches original bytes and damaged chunk rejects.
- [ ] Run `npx vitest run tests/account-sync-document.test.ts`; observe missing functionality fail.
- [ ] Implement schema, 4 MiB hashing, limits and conservative three-way merge. State schema validates final output.
- [ ] Run tests; commit `feat: add validated sync documents and conflict detection`.

### Task 2: Account local spaces and transactional sync storage

**Files:** Modify `src/lib/db.ts`; create `src/lib/sync/local.ts`, `tests/account-sync-local.test.ts`.

**Interfaces:** exported `PilotDB(name?)` adds `syncMeta` table; `readSnapshot(db)` returns consistent state/media; `applySnapshot(db,expected,next,meta)` returns boolean, only applies if current snapshot still matches expected. `prepareAccountSpace(project,uid,importGuest)` clones guest once, stores account ownership, retains guest; activation reloads.

- [ ] Write real fake-indexeddb tests for guest preservation, A/B isolation, failed compare-and-apply, audio changes during network work and account owner mismatch.
- [ ] Run tests RED, implement local APIs and database version 5; active space lookup fails safe to guest.
- [ ] Run suite GREEN; commit `feat: isolate local learning data by cloud account`.

### Task 3: Auth, cloud transport and sync engine

**Files:** Create `src/lib/sync/client.ts`, `src/lib/sync/engine.ts`, `src/lib/sync/session-storage.ts`, `supabase/migrations/202610260001_account_sync.sql`, tests; modify lockfile and iOS `SceneDelegate.swift`.

**Interfaces:** `CloudStore.readHead()`, `putChunk(hash,blob)`, `getChunk(hash)`, `commit(expectedRevision,document)`; `syncOnce(local,cloud,guard)` returns synced/conflict with latest revision. Supabase client has async secure storage on iOS and standard localStorage on web.

- [ ] Write tests with real local DB and deterministic fake external cloud: CAS race, offline failure, session guard cancellation, local editing during commit, corrupt cloud file, first empty account download.
- [ ] Run RED; add official SDK pinned dependency, secure session adapter, cloud validation, immutable chunks, bounded CAS retries and safe local rebase. Implement private bucket/RLS/RPC migration and rollback-safe SQL checks.
- [ ] Run GREEN; commit `feat: add authenticated cloud sync transport and concurrency control`.

### Task 4: Account settings and automatic sync

**Files:** Create `src/components/account-sync.tsx`, `src/components/sync-provider.tsx`; modify `settings.tsx`, `study-context.tsx`, documentation and env example.

**Interfaces:** account UI sign-in/sign-up/recovery, explicit activation/import choice, sync status, manual trigger, logout, cloud/local backup export and guarded conflict resolution. Provider schedules foreground/reconnect/debounced changes and stops work on account/session change.

- [ ] Add tests for service URL/public key validation, lifecycle scheduling and conflicts remaining paused until explicit choice.
- [ ] Run RED; implement UI using existing panels/buttons, label upload scope, preserve guest, mark unsupported native secure storage clearly rather than fall back silently.
- [ ] Run tests and browser walkthrough of login/configuration/offline/failure UI; commit `feat: expose account sync and recovery controls`.

### Task 5: Deployment preparation and end-to-end verification

**Files:** `docs/account-sync.md`, `.env.example`, license notices and QA report.

- [ ] Document free plan, SMTP limitations, actual environment config, SQL deployment, personal account provisioning and phone installation.
- [ ] Run all app/backend/release tests, typecheck, native build and iOS simulator compile. Scan changes/artifacts for private credentials.
- [ ] Fresh whole-branch review; fix any material findings with reproducing tests.
- [ ] Configure real cloud only once available; test two synthetic accounts for isolation and CAS, then two devices. Keep real-data activation explicit.
- [ ] Publish reviewed code to GitHub under the existing authorization; report any cloud/account/device step still pending without claiming completion.

### Task 6: Standalone mobile web and authenticated AI gateway

**Files:** `web-cloud/api/{evaluate,teacher,configuration,ai-usage}.js`, `web-cloud/server/proxy.mjs`, `web-cloud/vercel.json`, `scripts/build-account-web.mjs`, `src/lib/sync/web-session.ts`, `src/lib/native/api.ts`, `tests/account-web-*.test.ts`.

**Interfaces:** `accountWebResponse(request,env,fetcher) -> Promise<Response>` verifies Supabase's `/auth/v1/user`, applies `ENGLISHPILOT_ALLOWED_USERS`, and proxies only `/api/evaluate`, `/api/teacher`, `/api/configuration`, `/api/ai-usage` to a fixed server origin. `createApiFetch` accepts optional async account-token supplier for the separate web build; native transport keeps precedence. `buildAccountWeb` stages static sources, strips all private environment variables from the build and assembles public assets separately from server code.

- [ ] Write RED tests for denied auth/config/uid, fixed upstream identity boundary, route/body restrictions, HTML/error handling, web session header binding, private build-env exclusion and output separation.
- [ ] Implement the minimum gateway and build package; run full suite and typecheck GREEN.
- [ ] Independent security review, then build/scan and deploy to a new Vercel Free project with runtime secrets outside static assets.
- [ ] Verify anonymous web access cannot call AI, authorized owner can log in and use the same existing quota ledger; test cloud sync on installed and web clients without claiming untested device behavior.
