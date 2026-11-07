import { expect, test, vi } from "vitest";
import { webSessionToken } from "../src/lib/sync/web-session";
import { activeSpace } from "../src/lib/sync/space";
const project = "https://test.supabase.co";
vi.mock("../src/lib/sync/space", () => ({ activeSpace: vi.fn() }));
vi.mock("../src/lib/sync/config", () => ({
  readSyncConfig: () => ({ url: "https://test.supabase.co" }),
}));
vi.mock("../src/lib/sync/client", () => ({
  syncClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: { user: { id: "owner" }, access_token: "test-token" },
        },
      }),
    },
  }),
}));
test("AI uses a matching account and refuses a mismatched or switched study space", async () => {
  const read = vi.mocked(activeSpace);
  read.mockReturnValue({ project, uid: "owner" });
  expect(await webSessionToken()).toBe("test-token");
  read.mockReturnValue({ project, uid: "different" });
  expect(await webSessionToken()).toBeNull();
  read.mockReturnValueOnce({ project, uid: "owner" }).mockReturnValue(null);
  expect(await webSessionToken()).toBeNull();
  read.mockReturnValue({ project: "https://other.supabase.co", uid: "owner" });
  expect(await webSessionToken()).toBeNull();
});
