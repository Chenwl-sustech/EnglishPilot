import type { NativeExportPort } from "./files";

export type HarmonyBridge = { postMessage(payload: string): void };
type Pending = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

/** ArkWeb asynchronous proxies do not return values. Use correlated replies. */
export function createHarmonyFilePort(
  bridge: HarmonyBridge,
  events: EventTarget = window,
  timeout = 300000,
): NativeExportPort & { dispose(): void } {
  const pending = new Map<string, Pending>();
  const reply = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || typeof detail.id !== "string") return;
    const item = pending.get(detail.id);
    if (!item) return;
    pending.delete(detail.id);
    clearTimeout(item.timer);
    if (typeof detail.error === "string") item.reject(new Error(detail.error));
    else item.resolve(detail.result);
  };
  events.addEventListener("englishpilot-native-reply", reply);
  const request = (
    method: string,
    args: (string | number)[],
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("设备文件操作超时，请重新导出；原数据未更改"));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      try {
        bridge.postMessage(JSON.stringify({ id, method, args }));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  return {
    async begin(filename, bytes) {
      const result = await request("begin", [filename, bytes]);
      if (typeof result !== "string" || !/^[\w-]{1,100}$/.test(result))
        throw Error("设备导出会话无效");
      return result;
    },
    async append(id, base64) {
      await request("append", [id, base64]);
    },
    async finish(id) {
      return (await request("finish", [id])) === true;
    },
    async abort(id) {
      await request("abort", [id]);
    },
    dispose() {
      events.removeEventListener("englishpilot-native-reply", reply);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(Error("设备文件接口已关闭"));
      }
      pending.clear();
    },
  };
}
