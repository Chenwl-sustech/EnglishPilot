import assert from "node:assert/strict";
import { connect, nativeCall } from "./device.mjs";
const { browser, page } = await connect();
try {
  await page.goto("https://englishpilot.local/settings/");
  const status = JSON.parse(await nativeCall(page, "speech:status", []));
  assert.equal(
    status.ready,
    false,
    "Use the QA emulator without the optional Laura model",
  );
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.qaVoiceAudio = this;
      return play.call(this);
    };
  });
  await page.getByRole("button", { name: "试听内置英语声音" }).click();
  await page.waitForFunction(() => window.qaVoiceAudio?.currentTime > 0.1);
  const duration = await page.evaluate(() => window.qaVoiceAudio.duration);
  assert.ok(duration > 1);
  // The player disposes its element when playback ends.
  await page.waitForFunction(
    () => window.qaVoiceAudio?.getAttribute("src") === "",
  );
  const sentence =
    "We can listen to an English sentence without downloading a voice. ";
  const wave = Buffer.from(
    await nativeCall(page, "speech:render", [
      sentence.repeat(5),
      "harmony:flite-slt",
    ]),
    "base64",
  );
  assert.equal(wave.toString("ascii", 0, 4), "RIFF");
  assert.equal(wave.readUInt32LE(24), 16000);
  assert.equal(wave.readUInt32LE(40), wave.length - 44);
  assert.ok(wave.length > duration * 32000);
  await assert.rejects(
    nativeCall(page, "speech:render", ["x".repeat(10001), "harmony:flite-slt"]),
  );
  const cancellation = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timeout = setTimeout(() => {
          window.removeEventListener("englishpilot-native-reply", reply);
          reject(new Error("cancel timed out"));
        }, 10000);
        function reply(event) {
          if (event.detail.id !== id) return;
          clearTimeout(timeout);
          window.removeEventListener("englishpilot-native-reply", reply);
          resolve(Boolean(event.detail.error));
        }
        window.addEventListener("englishpilot-native-reply", reply);
        const send = (id, method, args) =>
          window.EnglishPilotBridge.postMessage(
            JSON.stringify({ id, method, args }),
          );
        send(id, "speech:render", [
          "This is a long cancellable request. ".repeat(150),
          "harmony:flite-slt",
        ]);
        send(crypto.randomUUID(), "speech:cancel", [id]);
      }),
  );
  assert.equal(cancellation, true);
  const replacement = await nativeCall(page, "speech:render", [
    "Try again.",
    "harmony:flite-slt",
  ]);
  assert.ok(Buffer.from(replacement, "base64").length > 44);
  console.log(
    JSON.stringify({
      systemVoiceInstalled: status.ready,
      settingsPlaybackSeconds: duration,
      longTextSeconds: (wave.length - 44) / 32000,
    }),
  );
} finally {
  await browser.close();
}
