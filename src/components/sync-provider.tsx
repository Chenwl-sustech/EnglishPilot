"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { readSyncConfig, type SyncConfig } from "@/lib/sync/config";
import {
  activeSpace,
  activeSpaceKey,
  accountDatabaseName,
} from "@/lib/sync/space";
import { syncClient, supabaseCloud, offlineIdentity } from "@/lib/sync/client";
import {
  syncOnce,
  resolveConflict,
  recheckConflict,
  type SyncResult,
} from "@/lib/sync/engine";
import type { SyncMeta } from "@/lib/sync/local";
import {
  createSyncScheduler,
  pendingAfterLocalChange,
} from "@/lib/sync/lifecycle";

type SyncContext = {
  config: SyncConfig | null;
  client: SupabaseClient | null;
  user: User | null;
  status: "local" | "syncing" | "error" | SyncResult["status"];
  error: string;
  meta: SyncMeta | null;
  busy: boolean;
  ready: boolean;
  offlineOwner: string | null;
  run: (choice?: "local" | "cloud" | "recheck") => Promise<void>;
  invalidate: () => void;
};
const Context = createContext<SyncContext | null>(null);
export const useAccountSync = () => {
  const value = useContext(Context);
  if (!value) throw new Error("账号同步尚未就绪");
  return value;
};
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<SyncConfig | null>(null),
    [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null),
    [status, setStatus] = useState<SyncContext["status"]>("local");
  const [error, setError] = useState(""),
    [meta, setMeta] = useState<SyncMeta | null>(null),
    [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [offlineOwner, setOfflineOwner] = useState<string | null>(null);
  const generation = useRef(0),
    userId = useRef<string | null>(null),
    running = useRef(false),
    mounted = useRef(true);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    let live = true,
      identityVersion = 0,
      refreshing = false;
    const config = readSyncConfig();
    setConfig(config);
    if (!config) {
      setReady(true);
      return () => {
        mounted.current = false;
        generation.current++;
      };
    }
    let instance: SupabaseClient;
    try {
      instance = syncClient(config);
      setClient(instance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "账号服务初始化失败");
      setReady(true);
      return;
    }
    const recoverLocalIdentity = async () => {
      const version = ++identityVersion;
      try {
        const identity = await offlineIdentity(config);
        if (live && version === identityVersion && !userId.current) {
          setOfflineOwner(identity?.id ?? null);
          setReady(true);
        }
      } catch (e) {
        if (live && version === identityVersion) {
          setOfflineOwner(null);
          setReady(true);
          setError(e instanceof Error ? e.message : "无法读取本机账号会话");
        }
      }
    };
    const accept = (next: User | null, signedOut = false) => {
      if (!live) return;
      if (userId.current !== (next?.id ?? null)) generation.current++;
      userId.current = next?.id ?? null;
      setUser(next);
      setReady(true);
      if (next || signedOut) {
        identityVersion++;
        setOfflineOwner(null);
      } else void recoverLocalIdentity();
      if (!next) setStatus("local");
    };
    const {
      data: { subscription },
    } = instance.auth.onAuthStateChange((event, session) => {
      accept(session?.user ?? null, event === "SIGNED_OUT");
    });
    void recoverLocalIdentity();
    void instance.auth
      .getSession()
      .then(({ error }) => {
        if (error) throw error;
        // onAuthStateChange delivers INITIAL_SESSION. Do not let a delayed
        // getSession result undo a more recent sign-in or sign-out event.
        if (live) setReady(true);
      })
      .catch((e) => {
        if (live) {
          setError(e instanceof Error ? e.message : "账号会话读取失败");
          void recoverLocalIdentity();
        }
      });
    const resumeSession = async () => {
      if (
        !live ||
        refreshing ||
        userId.current ||
        navigator.onLine === false ||
        document.visibilityState !== "visible"
      )
        return;
      refreshing = true;
      try {
        const { error } = await instance.auth.getSession();
        if (error) throw error;
      } catch {
        if (live) void recoverLocalIdentity();
      } finally {
        refreshing = false;
      }
    };
    window.addEventListener("online", resumeSession);
    document.addEventListener("visibilitychange", resumeSession);
    return () => {
      live = false;
      identityVersion++;
      mounted.current = false;
      generation.current++;
      subscription.unsubscribe();
      window.removeEventListener("online", resumeSession);
      document.removeEventListener("visibilitychange", resumeSession);
    };
  }, []);
  const run = useCallback(
    async (choice?: "local" | "cloud" | "recheck") => {
      if (running.current) return;
      const space = activeSpace();
      if (
        !client ||
        !config ||
        !user ||
        !space ||
        space.project !== config.url ||
        space.uid !== user.id ||
        db.name !== accountDatabaseName(space.project, space.uid)
      )
        return;
      const currentGeneration = generation.current;
      const guard = () =>
        mounted.current &&
        generation.current === currentGeneration &&
        userId.current === space.uid &&
        activeSpace()?.uid === space.uid &&
        activeSpace()?.project === space.project;
      running.current = true;
      setBusy(true);
      setError("");
      setStatus("syncing");
      try {
        // Validate the identity on the service before sending learning content.
        const { data, error } = await client.auth.getUser();
        if (error || data.user?.id !== space.uid)
          throw error ?? new Error("请重新登录当前学习账号");
        if (!guard()) return;
        const cloud = supabaseCloud(client, config.url, user.id);
        if (choice === "recheck") await recheckConflict(db);
        const result =
          choice === "local" || choice === "cloud"
            ? await resolveConflict(db, cloud, choice, guard)
            : await syncOnce(db, cloud, guard);
        if (guard()) {
          setStatus(result.status);
          setMeta((await db.syncMeta.get("main")) ?? null);
        }
      } catch (e) {
        if (guard()) {
          setError(
            e instanceof Error ? e.message : "云同步失败，本机数据仍保留",
          );
          setStatus("error");
        }
      } finally {
        running.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [client, config, user],
  );
  useEffect(() => {
    const space = activeSpace();
    if (
      !space ||
      !user ||
      space.uid !== user.id ||
      space.project !== config?.url
    )
      return;
    void db.syncMeta.get("main").then((value) => {
      if (mounted.current) setMeta(value ?? null);
    });
    const scheduler = createSyncScheduler(
      () => run(),
      () => document.visibilityState === "visible",
    );
    const changed = () => {
        setStatus(pendingAfterLocalChange);
        scheduler.changed();
      },
      resume = () => scheduler.resume();
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("englishpilot")
        : null;
    channel?.addEventListener("message", changed);
    window.addEventListener("pilot-updated", changed);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    scheduler.resume();
    return () => {
      scheduler.dispose();
      channel?.close();
      window.removeEventListener("pilot-updated", changed);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [run, user, config]);
  useEffect(() => {
    // Another tab selecting an account cannot keep an old account UI writable.
    const changed = (event: StorageEvent) => {
      if (event.key === activeSpaceKey) {
        generation.current++;
        window.location.reload();
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  return (
    <Context.Provider
      value={{
        config,
        client,
        user,
        status,
        error,
        meta,
        busy,
        ready,
        offlineOwner,
        run,
        invalidate,
      }}
    >
      {children}
    </Context.Provider>
  );
}
