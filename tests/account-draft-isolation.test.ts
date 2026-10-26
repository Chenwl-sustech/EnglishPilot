import { expect, test } from "vitest";
import { teacherDraftCacheKey } from "../src/lib/teacher-draft-cache";
test("guest and copied account sessions retain separate recovery text", () => {
  const cache = new Map<string, string>();
  const guest = teacherDraftCacheKey(
    "EnglishPilot",
    "same-session",
    "same-draft",
  );
  const a = teacherDraftCacheKey(
    "EnglishPilot-account-project-user-a",
    "same-session",
    "same-draft",
  );
  const b = teacherDraftCacheKey(
    "EnglishPilot-account-project-user-b",
    "same-session",
    "same-draft",
  );
  cache.set("teacher-draft:same-session:same-draft", "Legacy guest answer");
  cache.set(a, "A's answer not yet in IndexedDB");
  expect(cache.get(guest)).toBe("Legacy guest answer");
  expect(cache.get(b)).toBeUndefined();
  cache.set(b, "B's answer");
  cache.delete(a);
  expect(cache.get(guest)).toBe("Legacy guest answer");
  expect(cache.get(b)).toBe("B's answer");
  expect(cache.get(a)).toBeUndefined();
});
