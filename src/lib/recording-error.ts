import { nativeBuild } from "./native/runtime";

export function recordingError(error: unknown, native = nativeBuild): Error {
  if (
    error instanceof Error &&
    ["NotAllowedError", "SecurityError"].includes(error.name)
  ) {
    return new Error(
      native
        ? "麦克风权限未开启。请在系统设置的麦克风权限中允许 EnglishPilot，返回应用后重试。已有录音未更改。"
        : "麦克风权限未开启。请在浏览器的网站权限中允许麦克风，返回页面后重试。已有录音未更改。",
    );
  }
  return error instanceof Error
    ? error
    : new Error("无法开始录音，请检查麦克风后重试。");
}
