import { expect, test } from "vitest";
import { accountAccess } from "../src/lib/sync/access";
test("account learning UI remains closed during startup, logout, wrong user and wrong cloud project", () => {
  const space = { project: "https://a.supabase.co", uid: "user-a" };
  expect(accountAccess(null, false, null, null)).toBe("open");
  expect(accountAccess(space, false, null, null)).toBe("loading");
  expect(accountAccess(space, true, null, space.project)).toBe("login");
  expect(accountAccess(space, true, "user-b", space.project)).toBe("login");
  expect(accountAccess(space, true, "user-a", "https://b.supabase.co")).toBe(
    "login",
  );
  expect(accountAccess(space, true, "user-a", space.project)).toBe("open");
});
