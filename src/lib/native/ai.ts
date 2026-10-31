import { Capacitor, registerPlugin } from "@capacitor/core";
import { harmonyBridge } from "./harmony-rpc";
import { harmonyFetch } from "./harmony-http";
import { HARMONY_AI_ORIGIN, harmonyRequestAllowed } from "./harmony-policy";

export type NativeAiRequest = {
  path: string;
  method: string;
  body?: string;
  signal?: AbortSignal;
};
export type NativeAiResponse = { status: number; body: string };
export type NativeAiTransport = (
  request: NativeAiRequest,
) => Promise<NativeAiResponse>;

const nativeAi = registerPlugin<{ request: NativeAiTransport }>(
  "EnglishPilotAI",
);
export const requestNativeAi: NativeAiTransport = async (request) => {
  const { signal, ...wire } = request;
  if (harmonyBridge()) {
    const url = HARMONY_AI_ORIGIN + wire.path;
    if (
      !harmonyRequestAllowed(url, wire.method) ||
      (wire.body !== undefined &&
        (wire.method !== "POST" || wire.body.length > 200000))
    )
      throw new Error("不接受此 AI 接口请求");
    const { webSessionToken } = await import("../sync/web-session");
    const token = await webSessionToken();
    signal?.throwIfAborted();
    if (!token) throw new Error("请先登录学习账号以使用在线 AI");
    const response = await harmonyFetch(url, {
      method: wire.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(wire.body === undefined ? {} : { body: wire.body }),
      signal,
    });
    return { status: response.status, body: await response.text() };
  }
  if (Capacitor.getPlatform() !== "ios")
    throw new Error("当前安装平台尚未配置在线 AI 连接。");
  return nativeAi.request(wire);
};
