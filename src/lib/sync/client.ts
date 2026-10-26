import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { nativeBuild } from "../native/runtime";
import { documentSchema, sha256, type SyncDocument } from "./document";
import { parseSyncConfig, type SyncConfig } from "./config";
import {
  createSessionStorage,
  type SecureSessionTransport,
} from "./session-storage";
import type { CloudStore, CloudHead } from "./engine";
let cached: { signature: string; client: SupabaseClient } | undefined;
const secure = registerPlugin<SecureSessionTransport>(
  "EnglishPilotAccountSession",
);
async function boundedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController(),
    source = init?.signal;
  const abort = () => controller.abort(source?.reason);
  if (source?.aborted) abort();
  else source?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("云同步连接超时，请检查网络后重试")),
    45000,
  );
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      redirect: "error",
    });
  } finally {
    clearTimeout(timer);
    source?.removeEventListener("abort", abort);
  }
}
export function syncClient(raw: SyncConfig): SupabaseClient {
  const config = parseSyncConfig(raw),
    signature = JSON.stringify(config);
  if (cached?.signature === signature) return cached.client;
  if (cached) throw new Error("云服务配置已变化，请重新加载页面");
  if (
    nativeBuild &&
    (Capacitor.getPlatform() !== "ios" ||
      !Capacitor.isPluginAvailable("EnglishPilotAccountSession"))
  )
    throw new Error(
      "此安装版尚未提供账号安全存储，请更新 iOS 安装版，或使用手机浏览器登录",
    );
  const client = createClient(config.url, config.key, {
    auth: {
      storageKey: `englishpilot-auth-${new URL(config.url).hostname.split(".")[0]}`,
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      ...(nativeBuild ? { storage: createSessionStorage(secure) } : {}),
    },
    global: { fetch: boundedFetch },
  });
  cached = { signature, client };
  return client;
}
function failure(error: { message: string }) {
  return new Error(`账号云服务：${error.message}`);
}
export function supabaseCloud(
  client: SupabaseClient,
  project: string,
  owner: string,
): CloudStore {
  const bucket = client.storage.from("englishpilot-sync");
  const path = (hash: string) => {
    if (!/^[a-f0-9]{64}$/.test(hash) || !/^[a-f0-9-]{36}$/.test(owner))
      throw new Error("云端音频路径无效");
    return `${owner}/chunks/${hash}`;
  };
  return {
    owner,
    project,
    async readHead(): Promise<CloudHead | null> {
      const { data, error } = await client
        .from("englishpilot_sync_heads")
        .select("revision,document")
        .eq("user_id", owner)
        .maybeSingle();
      if (error) throw failure(error);
      if (!data) return null;
      const revision = Number(data.revision);
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw new Error("云端同步版本无效");
      return { revision, document: documentSchema.parse(data.document) };
    },
    async putChunk(hash, blob) {
      if (blob.size > 4194304 || (await sha256(blob)) !== hash)
        throw new Error("上传音频校验失败");
      const { error } = await bucket.upload(path(hash), blob, {
        contentType: "application/octet-stream",
        upsert: false,
      });
      if (error) {
        // An interrupted previous upload may already have created this object.
        // Verify bytes instead of trusting a duplicate HTTP status.
        const { data, error: readError } = await bucket.download(path(hash));
        if (
          readError ||
          !data ||
          data.size !== blob.size ||
          (await sha256(data)) !== hash
        )
          throw failure(error);
      }
    },
    async getChunk(hash) {
      const { data, error } = await bucket.download(path(hash));
      if (error) throw failure(error);
      if (!data || data.size > 4194304) throw new Error("云端音频超过分块上限");
      return data;
    },
    async commit(expectedRevision: number, document: SyncDocument) {
      const { data, error } = await client.rpc("englishpilot_sync_commit", {
        expected_revision: expectedRevision,
        p_document: documentSchema.parse(document),
      });
      if (error) throw failure(error);
      if (data === null) return null;
      const revision = Number(data);
      if (!Number.isSafeInteger(revision) || revision !== expectedRevision + 1)
        throw new Error("云端同步版本响应无效");
      return revision;
    },
  };
}
