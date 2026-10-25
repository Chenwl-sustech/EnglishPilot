import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeAiRequest = { path: string; method: string; body?: string };
export type NativeAiResponse = { status: number; body: string };
export type NativeAiTransport = (request: NativeAiRequest) => Promise<NativeAiResponse>;

const nativeAi = registerPlugin<{ request: NativeAiTransport }>("EnglishPilotAI");
export const requestNativeAi: NativeAiTransport = async (request) => {
  if (Capacitor.getPlatform() !== "ios")
    throw new Error("当前安装平台尚未配置在线 AI 连接。");
  return nativeAi.request(request);
};
