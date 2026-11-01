import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

export const target = process.env.HARMONY_TARGET ?? "127.0.0.1:5555";
export const bundle = "com.example.englishpilot";
const port = Number(process.env.HARMONY_CDP_PORT ?? 9227);
const tool =
  process.env.HDC_PATH ??
  (existsSync(
    "/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc",
  )
    ? "/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc"
    : "hdc");
if (
  !/^127\.0\.0\.1:\d+$/.test(target) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw new Error(
    "Acceptance defaults to a local phone emulator; configure a valid loopback target/port.",
  );

export function hdc(...args) {
  const output = execFileSync(tool, ["-t", target, ...args], {
    encoding: "utf8",
    timeout: 20000,
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
  // Some HDC failures still exit zero. Never read a stale UI dump after a
  // disconnected emulator or a failed file transfer.
  if (/\[Fail\]|\[Error\]/i.test(output)) throw new Error(output);
  return output;
}
export function restart() {
  hdc("shell", "aa", "force-stop", bundle);
  const result = hdc(
    "shell",
    "aa",
    "start",
    "-a",
    "EntryAbility",
    "-b",
    bundle,
  );
  if (!result.includes("start ability successfully")) throw new Error(result);
}
export async function connect() {
  let socket = "";
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const line = hdc("shell", "ps", "-ef")
      .split(/\r?\n/)
      .find((line) => line.trim().endsWith(" " + bundle));
    const pid = line?.trim().split(/\s+/)[1];
    const name = pid ? `webview_devtools_remote_${pid}` : "";
    if (name && hdc("shell", "cat", "/proc/net/unix").includes("@" + name)) {
      socket = "localabstract:" + name;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!socket)
    throw new Error("Debug ArkWeb socket not found for the acceptance app.");
  const existing = hdc("fport", "ls")
    .split(/\r?\n/)
    .find((line) => line.includes(`tcp:${port} `));
  if (existing) {
    const fields = existing.trim().split(/\s+/);
    if (fields[0] !== target)
      throw new Error("The test CDP port belongs to another device.");
    if (fields[2] !== socket) hdc("fport", "rm", `tcp:${port}`, fields[2]);
  }
  if (!existing || !existing.includes(socket))
    hdc("fport", `tcp:${port}`, socket);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((page) => page.url().startsWith("https://englishpilot.local/"));
  if (!page) {
    await browser.close();
    throw new Error("Local application page not found.");
  }
  await page.waitForLoadState("domcontentloaded");
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);
  // ArkWeb handles these with native UI. Playwright's default auto-dismiss
  // would cancel application confirmations before UITest can answer them.
  page.on("dialog", () => {});
  return { browser, page };
}

/** Runs the real native RPC boundary; never reads another device's session. */
export async function nativeCall(page, method, args, timeout = 90000) {
  return page.evaluate(
    ({ method, args, timeout }) =>
      new Promise((resolve, reject) => {
        if (location.origin !== "https://englishpilot.local") {
          reject(new Error("Wrong application origin"));
          return;
        }
        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
          window.removeEventListener("englishpilot-native-reply", reply);
          reject(new Error("Native test timed out"));
        }, timeout);
        const reply = (event) => {
          if (event.detail?.id !== id) return;
          clearTimeout(timer);
          window.removeEventListener("englishpilot-native-reply", reply);
          if (event.detail.error) reject(new Error(event.detail.error));
          else resolve(event.detail.result);
        };
        window.addEventListener("englishpilot-native-reply", reply);
        window.EnglishPilotBridge.postMessage(
          JSON.stringify({ id, method, args }),
        );
      }),
    { method, args, timeout },
  );
}
