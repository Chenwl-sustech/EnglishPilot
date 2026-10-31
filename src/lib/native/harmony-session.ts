import {
  createHarmonyRpc,
  harmonyBridge,
  type HarmonyRpc,
} from "./harmony-rpc";
import {
  createSessionStorage,
  type SecureSessionTransport,
  type SessionStorage,
} from "../sync/session-storage";

export function createHarmonySessionTransport(
  rpc: Pick<HarmonyRpc, "call">,
): SecureSessionTransport {
  return {
    async get({ key }) {
      const value = await rpc.call("session:get", [key]);
      if (value !== null && typeof value !== "string")
        throw new Error("账号安全存储响应无效");
      return { value };
    },
    async set({ key, value }) {
      if ((await rpc.call("session:set", [key, value])) !== true)
        throw new Error("账号会话未能安全保存");
    },
    async remove({ key }) {
      if ((await rpc.call("session:remove", [key])) !== true)
        throw new Error("账号会话未能安全清除");
    },
  };
}

let storage: SessionStorage | undefined;
export function harmonySessionStorage(): SessionStorage {
  const bridge = harmonyBridge();
  if (!bridge) throw new Error("鸿蒙账号安全接口未就绪，请重启应用后重试");
  storage ??= createSessionStorage(
    createHarmonySessionTransport(createHarmonyRpc(bridge, window, 30000)),
  );
  return storage;
}
