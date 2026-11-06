import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(async (_wire: unknown) => ({ status: 200, body: "{}" })),
  token: vi.fn<() => Promise<string | null>>(),
  space: vi.fn<() => { project: string; uid: string } | null>(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "ios" },
  registerPlugin: () => ({ request: mocks.request }),
}));
vi.mock("../src/lib/native/harmony-rpc", () => ({ harmonyBridge: () => null }));
vi.mock("../src/lib/sync/web-session", () => ({
  webSessionToken: mocks.token,
}));
vi.mock("../src/lib/sync/space", () => ({ activeSpace: mocks.space }));
import { requestNativeAi } from "../src/lib/native/ai";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.space.mockReturnValue({
    project: "https://test.supabase.co",
    uid: "owner",
  });
  mocks.token.mockResolvedValue("synthetic-account-jwt");
});

test("iPad authorizes its native AI request with the current matching learning session", async () => {
  expect(
    await requestNativeAi({ path: "/api/teacher", method: "POST", body: "{}" }),
  ).toEqual({ status: 200, body: "{}" });
  expect(mocks.request).toHaveBeenCalledWith({
    path: "/api/teacher",
    method: "POST",
    body: "{}",
    accountToken: "synthetic-account-jwt",
  });
});

test("iPad does not use another device identity when the open account has no matching session", async () => {
  mocks.token.mockResolvedValue(null);
  await expect(
    requestNativeAi({ path: "/api/evaluate", method: "GET" }),
  ).rejects.toThrow("登录学习账号");
  expect(mocks.request).not.toHaveBeenCalled();
});

test("a guest without an account keeps explicitly paired native AI access", async () => {
  mocks.space.mockReturnValue(null);
  mocks.token.mockResolvedValue(null);
  await requestNativeAi({ path: "/api/configuration", method: "GET" });
  expect(mocks.request).toHaveBeenCalledWith({
    path: "/api/configuration",
    method: "GET",
  });
});

test("cancellation while the session is loading prevents native dispatch", async () => {
  const controller = new AbortController();
  mocks.token.mockImplementationOnce(async () => {
    controller.abort();
    return "synthetic-account-jwt";
  });
  await expect(
    requestNativeAi({
      path: "/api/teacher",
      method: "POST",
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(mocks.request).not.toHaveBeenCalled();
});
