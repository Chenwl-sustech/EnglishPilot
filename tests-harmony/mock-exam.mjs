import assert from "node:assert/strict";
import { connect } from "./device.mjs";
import { tapSystemText } from "./system-dialogs.mjs";
const { browser, page } = await connect();
try {
  await page.goto("https://englishpilot.local/exams/");
  await page.locator(".profile-chip").waitFor({ state: "attached" });
  assert.match(await page.locator(".profile-chip").innerText(), /Harmony QA/);
  await page
    .getByRole("button", { name: /^(开始完整四项模考|继续未完成模考)$/ })
    .click();
  await page.getByText("第 1/4 节", { exact: false }).waitFor();
  const early = page.getByRole("button", {
    name: "提前结束本节（保留未答）",
    exact: true,
  });
  let click = early.click();
  await tapSystemText("取消");
  await click;
  assert.match(await page.locator("body").innerText(), /第 1\/4 节/);
  await page.reload();
  await page
    .getByRole("button", { name: "继续未完成模考", exact: true })
    .click();
  for (let section = 1; section <= 4; section++) {
    await page.getByText(`第 ${section}/4 节`, { exact: false }).waitFor();
    click = early.click();
    await tapSystemText("确认");
    await click;
  }
  await page
    .getByRole("heading", { name: "本次模考记录", exact: true })
    .waitFor();
  assert.match(await page.locator("body").innerText(), /已答 0\/85 题/);
  await page.reload();
  await page
    .getByText(/已完成 · 已交 4\/4 节|已交卷 · 已交 4\/4 节/)
    .first()
    .waitFor();
  console.log(
    "PASS: mock resume, native cancellation, four sections and persisted unfilled results",
  );
} finally {
  await browser.close();
}
