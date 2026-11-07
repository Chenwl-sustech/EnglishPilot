import assert from "node:assert/strict";
import { connect, hdc } from "./device.mjs";
import { systemNodes } from "./system-dialogs.mjs";
const { browser, page } = await connect();
try {
  await page.goto("https://englishpilot.local/speaking/");
  await page.getByRole("button", { name: "开始录音", exact: true }).waitFor();
  assert.match(await page.locator(".profile-chip").innerText(), /Harmony QA/);
  const before = await page.locator(".recording-row").count();
  await page.goto("https://englishpilot.local/settings/");
  await page
    .getByRole("button", { name: "导出完整备份（含录音）", exact: true })
    .click();
  let found = false;
  for (let i = 0; i < 20; i++) {
    if ((await systemNodes()).some((n) => n.text?.includes("将文件保存至"))) {
      found = true;
      break;
    }
    await page.waitForTimeout(250);
  }
  assert.ok(found, "Native save picker must open");
  hdc("shell", "uitest", "uiInput", "keyEvent", "Back");
  await page
    .getByText("已取消导出，原学习记录与录音未更改", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "选择备份文件", exact: true }).click();
  for (let i = 0; i < 20; i++) {
    if ((await systemNodes()).some((n) => n.text === "浏览")) break;
    await page.waitForTimeout(250);
  }
  hdc("shell", "uitest", "uiInput", "keyEvent", "Back");
  assert.equal(
    await page
      .getByRole("button", { name: "确认替换并恢复", exact: true })
      .count(),
    0,
  );
  await page.goto("https://englishpilot.local/speaking/");
  await page.getByRole("button", { name: "开始录音", exact: true }).waitFor();
  assert.equal(await page.locator(".recording-row").count(), before);
  console.log(
    "PASS: native export/import cancellation preserves existing recordings",
  );
} finally {
  await browser.close();
}
