import { expect, test } from "vitest";
import { PcmWave } from "../src/lib/native/harmony-pcm";

test("Harmony PCM assembles reordered packets into an interoperable mono WAV", () => {
  const pcm = new PcmWave();
  pcm.add(1, new Uint8Array([3, 4]).buffer);
  pcm.add(0, new Uint8Array([1, 2]).buffer);
  const wav = pcm.finish(16000, 16, 1);
  const view = new DataView(wav);
  expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
  expect(view.getUint32(4, true)).toBe(40);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint16(32, true)).toBe(2);
  expect(view.getUint32(40, true)).toBe(4);
  expect([...new Uint8Array(wav.slice(44))]).toEqual([1, 2, 3, 4]);
});

test("Harmony PCM rejects gaps, duplicates, invalid format and oversized synthesis", () => {
  const pcm = new PcmWave(4);
  pcm.add(1, new Uint8Array([1, 2]).buffer);
  expect(() => pcm.finish(16000, 16, 1)).toThrow();
  expect(() => pcm.add(1, new Uint8Array([1, 2]).buffer)).toThrow();
  expect(() => pcm.add(2, new Uint8Array(4).buffer)).toThrow();
  pcm.add(0, new Uint8Array([3, 4]).buffer);
  expect(() => pcm.finish(0, 16, 1)).toThrow();
  expect(() => pcm.finish(16000, 8, 1)).toThrow();
  expect(() => new PcmWave().finish(16000, 16, 1)).toThrow();
});
