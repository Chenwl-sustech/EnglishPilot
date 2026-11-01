import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { bundle, connect, restart, hdc } from "./device.mjs";
import { tapSystemText } from "./system-dialogs.mjs";

await mkdir(".local/harmony-qa", { recursive: true });
const results = [];
let connection = await connect();
await connection.page.goto("https://englishpilot.local/speaking/");
assert.match(
  await connection.page.locator(".profile-chip").innerText(),
  /Harmony QA/,
);
await connection.browser.close();
// Permission controls are restricted by HDC to this debuggable synthetic app.
const permissionAlreadyGranted = process.env.HARMONY_RECORDING_GRANTED === "1";
if (!permissionAlreadyGranted) hdc("shell", "atm", "perm", "-r", "-b", bundle);
restart();
connection = await connect();
try {
  await connection.page.goto("https://englishpilot.local/speaking/");
  await connection.page
    .getByRole("button", { name: "开始录音", exact: true })
    .waitFor();
  const before = await connection.page.locator(".recording-row").count();
  if (!permissionAlreadyGranted) {
    await connection.page
      .getByRole("button", { name: "开始录音", exact: true })
      .click();
    await tapSystemText("不允许");
    await connection.page.locator(".toast-error").waitFor();
    assert.match(
      await connection.page.locator(".toast-error").innerText(),
      /麦克风权限未开启/,
    );
    assert.equal(
      await connection.page.locator(".recording-row").count(),
      before,
    );
    results.push({
      name: "system microphone denial reports a recoverable error and preserves recordings",
      passed: true,
    });

    const token = JSON.parse(
      hdc("shell", "atm", "dump", "-t", "-b", bundle),
    ).tokenID;
    assert.ok(Number.isInteger(token));
    hdc(
      "shell",
      "atm",
      "perm",
      "-g",
      "-i",
      String(token),
      "-p",
      "ohos.permission.MICROPHONE",
    );
    await connection.page.reload();
  }
  await connection.page
    .getByRole("button", { name: "开始录音", exact: true })
    .click();
  await connection.page
    .getByText("● 正在录音，结束后可回放并保存", { exact: true })
    .waitFor({ timeout: 10000 });
  results.push({
    name: "microphone recovers after OS permission is restored and page reloads",
    passed: true,
    permissionRestoration: permissionAlreadyGranted
      ? "permission previously restored in emulator Settings UI"
      : "official debug ATM tool; physical Settings UI not tested",
  });
  await connection.page.waitForTimeout(5200);
  await connection.page
    .getByRole("button", { name: "结束录音", exact: true })
    .click();
  await connection.page.locator(".pending-audio audio").waitFor();
  const playback = await connection.page
    .locator(".pending-audio audio")
    .evaluate(
      (audio) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Recorded audio did not finish playback")),
            15000,
          );
          audio.onended = () => {
            clearTimeout(timer);
            resolve({
              ended: audio.ended,
              time: audio.currentTime,
              error: audio.error?.code ?? null,
            });
          };
          audio.onerror = () => {
            clearTimeout(timer);
            reject(new Error("Recorded audio decoding failed"));
          };
          audio.play().catch(reject);
        }),
    );
  assert.equal(playback.ended, true);
  assert.equal(playback.error, null);
  assert.ok(playback.time > 1);
  await connection.page
    .getByRole("button", { name: "保存本次口语练习", exact: true })
    .click();
  await connection.page.waitForFunction(
    (count) => document.querySelectorAll(".recording-row").length === count,
    before + 1,
  );
  await connection.page.reload();
  await connection.page.waitForFunction(
    (count) => document.querySelectorAll(".recording-row").length === count,
    before + 1,
  );
  results.push({
    name: "emulator microphone recording plays to completion and survives save/reload",
    passed: true,
    playback,
    audibility: "not assessed by a human",
  });
} catch (error) {
  results.push({
    name: "recording acceptance",
    passed: false,
    error: error.message,
  });
} finally {
  await connection.browser.close();
  await writeFile(
    ".local/harmony-qa/recording-results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
}
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
