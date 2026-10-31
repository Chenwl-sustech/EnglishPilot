import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { connect, hdc } from "./device.mjs";

await mkdir(".local/harmony-qa", { recursive: true });
const { browser, page } = await connect();
const result = { name: "system Back returns to the previous learning page", passed: false };
try {
  await page.goto("https://englishpilot.local/today/");
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "写作练习", exact: true }).click();
  await page.waitForURL("**/writing/**");
  hdc("shell", "uitest", "uiInput", "keyEvent", "Back");
  await page.waitForURL("**/today/**", { timeout: 5000 });
  assert.equal(new URL(page.url()).pathname, "/today/");
  result.passed = true;
} catch (error) { result.error = error.message; }
finally {
  await browser.close();
  await writeFile(".local/harmony-qa/system-back-result.json", JSON.stringify(result, null, 2) + "\n");
}
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
