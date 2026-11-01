export type HarmonyBridge = { postMessage(payload: string): void };
export interface HarmonyRpc {
  call(
    method: string,
    args: (string | number)[],
    signal?: AbortSignal | null,
  ): Promise<unknown>;
  dispose(): void;
}

export function harmonyBridge(): HarmonyBridge | null {
  const bridge = (
    globalThis as typeof globalThis & { EnglishPilotBridge?: HarmonyBridge }
  ).EnglishPilotBridge;
  return bridge && typeof bridge.postMessage === "function" ? bridge : null;
}

/** ArkWeb proxies return through correlated events, including cancellation. */
export function createHarmonyRpc(
  bridge: HarmonyBridge,
  events: EventTarget = window,
  timeout = 90000,
): HarmonyRpc {
  const pending = new Map<
    string,
    {
      finish(
        error: Error | null,
        value?: unknown,
        cancelNative?: boolean,
      ): void;
    }
  >();
  let closed = false;
  const reply = (event: Event) => {
    const value: unknown = (event as CustomEvent).detail;
    if (!value || typeof value !== "object") return;
    const detail = value as { id?: unknown; result?: unknown; error?: unknown };
    if (typeof detail.id !== "string") return;
    const item = pending.get(detail.id);
    if (!item) return;
    if (typeof detail.error === "string") item.finish(new Error(detail.error));
    else if (
      detail.result === null ||
      typeof detail.result === "boolean" ||
      (typeof detail.result === "string" &&
        detail.result.length <= 12 * 1024 * 1024)
    )
      item.finish(null, detail.result);
    else item.finish(new Error("设备返回了无效响应，请重试"));
  };
  events.addEventListener("englishpilot-native-reply", reply);
  return {
    async call(method, args, signal) {
      if (closed) throw new Error("设备接口已关闭");
      signal?.throwIfAborted();
      if (pending.size >= 32)
        throw new Error("设备正在处理过多请求，请稍后重试");
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        let sent = false;
        const abort = () =>
          finish(new DOMException("请求已取消", "AbortError"), undefined, true);
        const timer = setTimeout(
          () =>
            finish(
              new Error("设备操作超时，请重试；已保存内容仍保留"),
              undefined,
              true,
            ),
          timeout,
        );
        const finish = (
          error: Error | null,
          value?: unknown,
          cancelNative = false,
        ) => {
          if (!pending.delete(id)) return;
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          if (
            cancelNative &&
            sent &&
            (method === "http" || method === "speech:render")
          ) {
            try {
              bridge.postMessage(
                JSON.stringify({
                  id: crypto.randomUUID(),
                  method: method === "http" ? "http:cancel" : "speech:cancel",
                  args: [id],
                }),
              );
            } catch {
              /* Request already stopped. */
            }
          }
          if (error) reject(error);
          else resolve(value);
        };
        pending.set(id, { finish });
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) {
          abort();
          return;
        }
        try {
          sent = true;
          bridge.postMessage(JSON.stringify({ id, method, args }));
        } catch (error) {
          finish(error instanceof Error ? error : new Error("设备接口未就绪"));
        }
      });
    },
    dispose() {
      if (closed) return;
      closed = true;
      events.removeEventListener("englishpilot-native-reply", reply);
      for (const item of pending.values())
        item.finish(new Error("设备接口已关闭"), undefined, true);
    },
  };
}
