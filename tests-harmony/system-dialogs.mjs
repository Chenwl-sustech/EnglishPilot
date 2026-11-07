import { readFile, mkdir } from "node:fs/promises";
import { hdc } from "./device.mjs";

export async function systemNodes() {
  await mkdir(".local/harmony-qa", { recursive: true });
  hdc(
    "shell",
    "uitest",
    "dumpLayout",
    "-p",
    "/data/local/tmp/englishpilot-qa-layout.json",
  );
  hdc(
    "file",
    "recv",
    "/data/local/tmp/englishpilot-qa-layout.json",
    ".local/harmony-qa/current-system-layout.json",
  );
  const root = JSON.parse(
    await readFile(".local/harmony-qa/current-system-layout.json", "utf8"),
  );
  const nodes = [];
  function walk(node) {
    if (node.attributes) nodes.push(node.attributes);
    for (const child of node.children ?? []) walk(child);
  }
  walk(root);
  return nodes;
}

/** System dialogs are exercised by HarmonyOS's official UI testing tool. */
export async function tapSystemText(text, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const nodes = await systemNodes();
    const node = nodes.find(
      (node) => node.text === text && node.enabled !== "false",
    );
    const coordinates = node?.bounds?.match(/-?\d+/g)?.map(Number);
    if (coordinates?.length === 4) {
      const [left, top, right, bottom] = coordinates;
      hdc(
        "shell",
        "uitest",
        "uiInput",
        "click",
        String(Math.floor((left + right) / 2)),
        String(Math.floor((top + bottom) / 2)),
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`System test control not found: ${text}`);
}
