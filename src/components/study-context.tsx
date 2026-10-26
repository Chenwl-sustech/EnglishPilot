"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { State } from "@/lib/model";
import { db, loadState, mutateState } from "@/lib/db";
import { today } from "@/lib/engine";
import { ZodError } from "zod";
import { SyncProvider } from "./sync-provider";
import { AccountSpaceGate } from "./account-space-gate";
type Study = {
  state: State;
  update: (
    fn: (s: State) => State,
    options?: { silent?: boolean },
  ) => Promise<void>;
  notify: (message: string) => void;
  fail: (e: unknown) => void;
};
const Context = createContext<Study | null>(null);
export function useStudy() {
  const c = useContext(Context);
  if (!c) throw new Error("学习状态尚未加载");
  return c;
}
export function StudyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const fail = useCallback(
    (e: unknown) =>
      setError(
        e instanceof ZodError
          ? e.issues.map((i) => i.message).join("；")
          : e instanceof Error
            ? e.message
            : "保存失败，请重试。",
      ),
    [],
  );
  const notify = useCallback((m: string) => {
    setError("");
    setMessage(m);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      loadState()
        .then((s) => {
          if (active) setState(s);
        })
        .catch(fail);
    void refresh();
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("englishpilot")
        : null;
    channel?.addEventListener("message", refresh);
    window.addEventListener("pilot-updated", refresh);
    let date = today();
    const interval = setInterval(() => {
      if (date !== today()) {
        date = today();
        void refresh();
      }
    }, 30000);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener("pilot-updated", refresh);
      clearInterval(interval);
    };
  }, [fail]);
  useEffect(() => {
    if (state) document.documentElement.dataset.theme = state.settings.theme;
  }, [state]);
  const update = useCallback(
    async (fn: (s: State) => State, options?: { silent?: boolean }) => {
      try {
        await mutateState(fn);
        const saved = await db.state.get("main");
        if (saved) setState(await loadState());
        if (!options?.silent) setError("");
      } catch (e) {
        if (!options?.silent) fail(e);
        throw e;
      }
    },
    [fail],
  );
  if (!state)
    return (
      <div className="loading-screen">
        <div className="brand-mark">E</div>
        <h2>EnglishPilot</h2>
        <p>{error || "正在读取你的本地学习空间…"}</p>
        {error && <button onClick={() => location.reload()}>重新加载</button>}
      </div>
    );
  return (
    <Context.Provider value={{ state, update, notify, fail }}>
      <SyncProvider>
        <AccountSpaceGate>{children}</AccountSpaceGate>
        {(message || error) && (
          <div
            className={`toast ${error ? "toast-error" : ""}`}
            role={error ? "alert" : "status"}
          >
            <span>{error || message}</span>
            <button
              aria-label="关闭提示"
              onClick={() => {
                setError("");
                setMessage("");
              }}
            >
              ×
            </button>
          </div>
        )}
      </SyncProvider>
    </Context.Provider>
  );
}
