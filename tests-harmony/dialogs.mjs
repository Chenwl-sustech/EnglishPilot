import assert from "node:assert/strict";
import { connect } from "./device.mjs";
import { tapSystemText, systemNodes } from "./system-dialogs.mjs";
const { browser, page } = await connect();
try {
  for (const [button, expected] of [
    ["取消", false],
    ["确认", true],
  ]) {
    const result = page.evaluate(() =>
      window.confirm("Harmony QA：确认弹窗验收"),
    );
    await tapSystemText(button, 5000);
    assert.equal(await result, expected);
  }
  const prompt = page.evaluate(() =>
    window.prompt("Harmony QA：输入弹窗验收", "QA default"),
  );
  await tapSystemText("确认", 5000);
  assert.equal(await prompt, "QA default");
  const cancel = page.evaluate(() =>
    window.prompt("Harmony QA：取消输入", "QA default"),
  );
  await tapSystemText("取消", 5000);
  assert.equal(await cancel, null);
  console.log("PASS: native confirm accept/cancel and prompt default/cancel");
} finally {
  await browser.close();
}
