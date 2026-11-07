import assert from "node:assert/strict";
import { connect } from "./device.mjs";
const { browser, page } = await connect();
const prefix = "qa-ai-history-" + Date.now();
let seeded = false;
try {
  await page.goto("https://englishpilot.local/writing/");
  await page
    .getByLabel("选择写作任务")
    .selectOption({ label: "基础写作 · A learning journal" });
  assert.match(await page.locator(".profile-chip").innerText(), /Harmony QA/);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("englishpilot-active-account-v1"),
    ),
    null,
  );
  await page.evaluate(
    (prefix) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("EnglishPilot");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("state", "readwrite");
          const table = tx.objectStore("state"),
            request = table.get("main");
          request.onsuccess = () => {
            const row = request.result;
            if (row?.value.profile.name !== "Harmony QA") {
              tx.abort();
              return;
            }
            const attempt = row.value.attempts
              .filter((a) => a.contentId === "writing-0")
              .at(-1);
            if (!attempt) {
              tx.abort();
              return;
            }
            const evaluation = (id, createdAt) => ({
              id: prefix + id,
              createdAt,
              attemptId: attempt.id,
              inputText: attempt.answer,
              skill: "writing",
              exam: "ielts",
              taskType: "基础写作",
              kind: "ai-estimate",
              model: "QA synthetic feedback",
              rubric: "QA synthetic feedback",
              dimensions: [],
              normalized: null,
              suggestions: [id],
              revised: "",
              exemplar: "",
              comparison: "",
              limitations: ["Synthetic UI fixture"],
              errors: [],
              disputed: id === "older",
            });
            // Deliberately store newest first; visual history must not depend on array order.
            row.value.extension.evaluations.push(
              evaluation("newer", "2026-11-03T10:00:00Z"),
              evaluation("older", "2026-11-03T09:00:00Z"),
            );
            row.value.extension.disputes.push({
              id: prefix + "dispute",
              targetId: prefix + "older",
              kind: "evaluation",
              reason: "QA dispute synchronized from the other device",
              createdAt: "2026-11-03T09:30:00Z",
            });
            table.put(row);
          };
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onabort = () => {
            db.close();
            reject(new Error("QA profile or writing attempt unavailable"));
          };
        };
      }),
    prefix,
  );
  seeded = true;
  await page.reload();
  const history = page.getByLabel("反馈历史");
  await history.waitFor();
  assert.equal(await history.inputValue(), prefix + "newer");
  await history.selectOption(prefix + "older");
  await page
    .getByText("QA dispute synchronized from the other device", {
      exact: false,
    })
    .waitFor();
  await page.reload();
  await history.selectOption(prefix + "older");
  await page
    .getByText("QA dispute synchronized from the other device", {
      exact: false,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "重新检查 AI 连接", exact: true })
    .click();
  await page
    .getByRole("button", { name: "重新检查 AI 连接", exact: true })
    .waitFor();
  console.log(
    "PASS: AI history is ordered by time, prior dispute survives reload, and signed-out AI retry remains usable",
  );
} finally {
  if (seeded)
    await page.evaluate(
      (prefix) =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("EnglishPilot");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result,
              tx = db.transaction("state", "readwrite"),
              table = tx.objectStore("state");
            const req = table.get("main");
            req.onsuccess = () => {
              const row = req.result;
              if (row?.value.profile.name !== "Harmony QA") {
                tx.abort();
                return;
              }
              for (const name of ["evaluations", "disputes"])
                row.value.extension[name] = row.value.extension[name].filter(
                  (item) => !item.id.startsWith(prefix),
                );
              table.put(row);
            };
            tx.oncomplete = () => {
              db.close();
              resolve(true);
            };
            tx.onabort = () => {
              db.close();
              reject(new Error("QA cleanup failed"));
            };
          };
        }),
      prefix,
    );
  await browser.close();
}
