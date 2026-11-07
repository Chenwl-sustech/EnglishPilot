import { expect, test } from "vitest";
import {
  ChunkedSessionStorage,
  type SecretStore,
  type SessionCodec,
} from "../src/lib/native/harmony-session-chunks";

class PlatformStore implements SecretStore {
  values = new Map<string, { bytes: Uint8Array; label: string }>();
  failAfter = Infinity;
  async get(alias: string) {
    return this.values.get(alias)?.bytes.slice() ?? null;
  }
  async put(alias: string, bytes: Uint8Array, label: string) {
    if (--this.failAfter === 0) throw new Error("device locked");
    if (bytes.byteLength > 1024 || !bytes.byteLength)
      throw new Error("platform secret limit");
    this.values.set(alias, { bytes: bytes.slice(), label });
  }
  async remove(alias: string) {
    this.values.delete(alias);
  }
  async list(label: string) {
    return [...this.values]
      .filter(([, value]) => value.label === label)
      .map(([alias]) => alias);
  }
}
const codec: SessionCodec = {
  encode: (value) => new TextEncoder().encode(value),
  decode: (value) => new TextDecoder("utf-8", { fatal: true }).decode(value),
  generation: () => crypto.randomUUID(),
};
const key = "englishpilot-auth-test-project";

test("Harmony session storage round-trips long UTF-8 sessions within platform secret limits", async () => {
  const platform = new PlatformStore(),
    vault = new ChunkedSessionStorage(platform, codec);
  const session = JSON.stringify({
    refresh_token: "synthetic".repeat(600),
    user: { name: "测试学习者".repeat(300) },
  });
  await vault.set(key, session);
  expect(await vault.get(key)).toBe(session);
  expect(
    [...platform.values.values()].every((x) => x.bytes.byteLength <= 1024),
  ).toBe(true);
  await vault.set(key, "");
  expect(await vault.get(key)).toBe("");
});

test("Harmony session storage keeps the committed session when an encrypted chunk write fails", async () => {
  const platform = new PlatformStore(),
    vault = new ChunkedSessionStorage(platform, codec);
  await vault.set(key, "previous valid session");
  platform.failAfter = 2;
  await expect(vault.set(key, "new session ".repeat(1000))).rejects.toThrow(
    "device locked",
  );
  expect(await vault.get(key)).toBe("previous valid session");
  expect(platform.values.size).toBe(2);
});

test("Harmony session overwrite and removal clean old generations without touching another project", async () => {
  const platform = new PlatformStore(),
    vault = new ChunkedSessionStorage(platform, codec);
  await vault.set(key, "a".repeat(4000));
  await vault.set(key + "-other", "another account project");
  await Promise.all([
    vault.set(key, "latest"),
    vault.get(key).then((value) => expect(value).toBe("latest")),
  ]);
  expect(platform.values.size).toBe(4);
  await vault.remove(key);
  expect(await vault.get(key)).toBeNull();
  expect(await vault.get(key + "-other")).toBe("another account project");
  expect(platform.values.size).toBe(2);
});

test("Harmony session storage rejects malformed metadata, missing chunks and oversized values", async () => {
  const platform = new PlatformStore(),
    vault = new ChunkedSessionStorage(platform, codec);
  await expect(vault.set("unrelated-credential", "secret")).rejects.toThrow(
    /账号/,
  );
  await expect(vault.set(key, "x".repeat(65537))).rejects.toThrow(/上限/);
  await vault.set(key, "synthetic");
  const chunk = [...platform.values.keys()].find((x) => x.includes(":g:"))!;
  platform.values.delete(chunk);
  await expect(vault.get(key)).rejects.toThrow(/不完整/);
  await vault.remove(key);
  expect(await vault.get(key)).toBeNull();
});
