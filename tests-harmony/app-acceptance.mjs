import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { connect } from "./device.mjs";

await mkdir(".local/harmony-qa/screenshots", { recursive: true });
const { browser, page } = await connect();
const results = [], errors = [];
page.on("pageerror", error => errors.push(error.message));
async function visit(route) {
  await page.goto(`https://englishpilot.local/${route}/`);
  await page.locator("h1").first().waitFor();
}
async function check(name, run) {
  const before = errors.length, start = Date.now();
  try {
    await run();
    assert.deepEqual(errors.slice(before), [], "application JavaScript error");
    results.push({ name, passed: true, ms: Date.now() - start });
  } catch (error) { results.push({ name, passed: false, error: error.message }); }
  console.log(results.at(-1).passed ? "PASS" : "FAIL", name);
  await writeFile(".local/harmony-qa/app-acceptance-results.json", JSON.stringify({ results, errors }, null, 2) + "\n");
}
try {
  await visit("today");
  // This script modifies only the explicitly seeded synthetic emulator profile.
  assert.match(await page.locator(".profile-chip").innerText(), /Harmony QA/);
  for (const route of ["today", "dashboard", "vocabulary", "resources", "grammar", "listening", "reading", "speaking", "writing", "exams", "mistakes", "teacher", "analytics", "plan", "settings", "assessment", "calendar", "mini-test"]) {
    await check(`offline page ${route}`, async () => {
      await visit(route);
      const text = await page.locator("body").innerText();
      assert.ok(text.length > 200);
      assert.ok(!text.includes("内置学习资源不完整"));
      assert.ok(!text.includes("This page could not be found"));
      const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(width.document <= width.viewport + 2, `horizontal overflow: ${JSON.stringify(width)}`);
      await page.screenshot({ path: `.local/harmony-qa/screenshots/${route}.png` });
    });
  }
  await check("phone navigation opens and closes after choosing a page", async () => {
    await visit("today");
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
    await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "写作练习", exact: true }).click();
    await page.waitForURL("**/writing/**");
    assert.equal(await page.locator(".sidebar.is-open").count(), 0);
  });
  await check("theme selection persists after reloading the installed application", async () => {
    const initial = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.getByRole("button", { name: "切换深浅色主题" }).click();
    await page.waitForFunction(theme => document.documentElement.dataset.theme !== theme, initial);
    const next = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.reload();
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, next);
    await page.getByRole("button", { name: "切换深浅色主题" }).click();
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, initial);
  });
  await check("vocabulary reveal and FSRS review persist", async () => {
    await visit("vocabulary");
    const stat = page.locator(".vocab-stat").filter({ hasText: "已建立复习记录" }).locator("strong");
    const before = Number(await stat.innerText());
    await page.getByRole("button", { name: "显示释义" }).click();
    await page.getByRole("button", { name: /Good · 记住了/ }).click();
    await page.waitForFunction(count => Number([...document.querySelectorAll(".vocab-stat")].find(x => x.textContent.includes("已建立复习记录")).querySelector("strong").textContent) === count, before + 1);
    await page.reload(); await stat.waitFor();
    assert.equal(Number(await stat.innerText()), before + 1);
  });
  await check("writing autosave and a submitted version survive reload", async () => {
    await visit("writing");
    await page.getByLabel("选择写作任务").selectOption({ label: "基础写作 · A learning journal" });
    const text = `Harmony acceptance ${Date.now()}. Today I practised reading and learned several useful words. I wrote this synthetic paragraph to verify that my learning journal is saved correctly and can be reopened after the application reloads.`;
    await page.getByRole("textbox", { name: "英文作文" }).fill(text);
    await page.getByText(/草稿已自动保存/).waitFor();
    await page.reload();
    await page.getByRole("textbox", { name: "英文作文" }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "英文作文" }).inputValue(), text);
    await page.getByRole("button", { name: "提交并保存版本" }).click();
    await page.locator("details.version").first().locator("summary").click();
    await page.getByText(text, { exact: true }).last().waitFor();
    await page.reload();
    await page.locator("details.version").first().locator("summary").click();
    await page.getByText(text, { exact: true }).last().waitFor();
  });
  await check("native account login form is configured without manual deployment keys", async () => {
    await visit("settings");
    const account = page.locator("#account-sync");
    assert.ok(await account.getByRole("button", { name: "登录学习账号", exact: true }).isVisible());
    assert.equal(await account.getByText("请先配置账号云服务", { exact: true }).count(), 0);
    assert.equal(await account.getByText(/尚未提供账号安全存储/).count(), 0);
  });
} finally {
  await browser.close();
  await writeFile(".local/harmony-qa/app-acceptance-results.json", JSON.stringify({ results, errors }, null, 2) + "\n");
}
console.log(`${results.filter(result => result.passed).length}/${results.length} application checks passed.`);
if (results.some(result => !result.passed)) process.exitCode = 1;
