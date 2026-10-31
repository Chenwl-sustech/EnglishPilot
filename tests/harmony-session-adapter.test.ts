import { expect, test } from "vitest";
import { createHarmonySessionTransport } from "../src/lib/native/harmony-session";
import { createSessionStorage } from "../src/lib/sync/session-storage";

test("Harmony account storage uses the native secure session protocol and preserves null", async () => {
  const stored = new Map<string, string>();
  const operations: string[] = [];
  const storage = createSessionStorage(
    createHarmonySessionTransport({
      call: async (method, args) => {
        operations.push(method);
        if (method === "session:set") {
          stored.set(args[0] as string, args[1] as string);
          return true;
        }
        if (method === "session:remove") {
          stored.delete(args[0] as string);
          return true;
        }
        return stored.get(args[0] as string) ?? null;
      },
    }),
  );
  expect(await storage.getItem("englishpilot-auth-test")).toBeNull();
  await storage.setItem("englishpilot-auth-test", "synthetic session");
  expect(await storage.getItem("englishpilot-auth-test")).toBe(
    "synthetic session",
  );
  await storage.removeItem("englishpilot-auth-test");
  expect(await storage.getItem("englishpilot-auth-test")).toBeNull();
  expect(operations).toEqual([
    "session:get",
    "session:set",
    "session:get",
    "session:remove",
    "session:get",
  ]);
});

test("Harmony account storage fails closed on platform errors and unsuccessful writes", async () => {
  const denied = createSessionStorage(
    createHarmonySessionTransport({
      call: async () => {
        throw new Error("device locked");
      },
    }),
  );
  await expect(
    denied.setItem("englishpilot-auth-test", "secret"),
  ).rejects.toThrow("device locked");
  const invalid = createSessionStorage(
    createHarmonySessionTransport({ call: async () => false }),
  );
  await expect(invalid.getItem("englishpilot-auth-test")).rejects.toThrow(
    /无效/,
  );
  await expect(
    invalid.setItem("englishpilot-auth-test", "secret"),
  ).rejects.toThrow(/保存/);
});
