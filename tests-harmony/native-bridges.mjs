import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { connect, restart, nativeCall } from "./device.mjs";

await mkdir(".local/harmony-qa", { recursive: true });
const results = [];
let connection = await connect();
const key = "englishpilot-auth-harmony-qa";
const synthetic = JSON.stringify({
  refresh_token: "synthetic-only-".repeat(600),
  user: { name: "测试学习者".repeat(300) },
});
async function check(name, run) {
  const start = Date.now();
  try {
    await run();
    results.push({ name, passed: true, ms: Date.now() - start });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}
try {
  await check("long encrypted session round trip", async () => {
    assert.equal(
      await nativeCall(connection.page, "session:set", [key, synthetic]),
      true,
    );
    assert.equal(
      await nativeCall(connection.page, "session:get", [key]),
      synthetic,
    );
  });
  await check("encrypted session survives process restart", async () => {
    await connection.browser.close();
    restart();
    connection = await connect();
    assert.equal(
      await nativeCall(connection.page, "session:get", [key]),
      synthetic,
    );
  });
  await check("encrypted session overwrite and removal", async () => {
    assert.equal(
      await nativeCall(connection.page, "session:set", [
        key,
        "replacement-synthetic-session",
      ]),
      true,
    );
    assert.equal(
      await nativeCall(connection.page, "session:get", [key]),
      "replacement-synthetic-session",
    );
    assert.equal(
      await nativeCall(connection.page, "session:remove", [key]),
      true,
    );
    assert.equal(await nativeCall(connection.page, "session:get", [key]), null);
  });
  await check(
    "native HTTPS reaches the configured backend without anonymous AI authorization",
    async () => {
      const raw = await nativeCall(connection.page, "http", [
        JSON.stringify({
          url: "https://englishpilot-chenwl-sync.netlify.app/api/evaluate",
          method: "GET",
          headers: { accept: "application/json" },
        }),
      ]);
      const response = JSON.parse(raw);
      assert.equal(response.status, 401);
      assert.match(response.headers["content-type"], /application\/json/);
      assert.ok(
        JSON.parse(Buffer.from(response.bodyBase64, "base64").toString("utf8"))
          .error,
      );
    },
  );
  await check("native bridge refuses another origin destination", async () => {
    await assert.rejects(
      nativeCall(connection.page, "http", [
        JSON.stringify({
          url: "https://example.org/",
          method: "GET",
          headers: {},
        }),
      ]),
    );
  });
} finally {
  try {
    await nativeCall(connection.page, "session:remove", [key]);
  } catch {}
  await connection.browser.close();
  await writeFile(
    ".local/harmony-qa/native-bridge-results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
}
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
