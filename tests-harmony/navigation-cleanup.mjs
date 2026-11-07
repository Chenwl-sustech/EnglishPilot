import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { connect, hdc, nativeCall, bundle } from "./device.mjs";
const { browser, page } = await connect();
try {
  const pid = hdc("shell", "ps", "-ef")
    .split(/\r?\n/)
    .find((l) => l.trim().endsWith(" " + bundle))
    .trim()
    .split(/\s+/)[1];
  const logs = () =>
    hdc("shell", "hilog", "-x", "-P", pid, "-T", "EnglishPilotLifecycle");
  const before = logs();
  // Deliberately bypass the JS RPC pagehide handler: the host must clean up
  // even if a departing/crashed document cannot deliver its cancellation.
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++)
      window.EnglishPilotBridge.postMessage(
        JSON.stringify({
          id: crypto.randomUUID(),
          method: "http",
          args: [
            JSON.stringify({
              url: "https://englishpilot-chenwl-sync.netlify.app/api/evaluate",
              method: "GET",
              headers: { accept: "application/json" },
            }),
          ],
        }),
      );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const newLogs = logs().replace(before, "");
  assert.match(
    newLogs,
    /Document cleanup: cancelled [1-8] HTTP requests/,
    "native document change must cancel actual pending HTTP work",
  );
  const result = JSON.parse(
    await nativeCall(page, "http", [
      JSON.stringify({
        url: "https://englishpilot-chenwl-sync.netlify.app/api/evaluate",
        method: "GET",
        headers: { accept: "application/json" },
      }),
    ]),
  );
  assert.equal(
    result.status,
    401,
    "new document receives a fresh usable native transport",
  );
  await mkdir(".local/harmony-qa", { recursive: true });
  await writeFile(
    ".local/harmony-qa/navigation-cleanup.json",
    JSON.stringify(
      {
        passed: true,
        newDocumentStatus: result.status,
        cleanup: newLogs.trim(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS: native reload cancels old requests and accepts new requests",
  );
} finally {
  await browser.close();
}
