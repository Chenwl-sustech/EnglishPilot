import { describe, it, expect, vi } from "vitest";
import { createApiFetch } from "../src/lib/native/api";

describe("native AI transport", () => {
  it("sends only allowed relative API calls through native credentials", async () => {
    const transport = vi.fn(async () => ({ status: 200, body: '{"reply":"Hello"}' }));
    const api = createApiFetch({ native: true, transport });
    const response = await api("/api/teacher", { method: "POST", headers: { Authorization: "must-not-forward" }, body: '{"text":"Hello"}' });
    expect(await response.json()).toEqual({ reply: "Hello" });
    expect(transport).toHaveBeenCalledWith({ path: "/api/teacher", method: "POST", body: '{"text":"Hello"}' });
    for (const path of ["https://example.org/api/evaluate", "/api/whisper", "/api/evaluate?url=https://evil.test"]) {
      expect((await api(path)).status).toBe(503);
    }
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("keeps native status honest when pairing is missing and rejects HTML fallback", async () => {
    const absent = createApiFetch({ native: true, transport: async () => { throw new Error("尚未配置设备连接"); } });
    const status = await (await absent("/api/evaluate")).json();
    expect(status.configured).toBe(false);
    const html = createApiFetch({ native: true, transport: async () => ({ status: 200, body: "<html>Login</html>" }) });
    expect((await html("/api/teacher", { method: "POST" })).status).toBe(502);
  });

  it("supports Request inputs and refuses an aborted request before dispatch", async () => {
    const transport = vi.fn(async () => ({ status: 429, body: '{"error":"今日额度已用完"}' }));
    const api = createApiFetch({ native: true, transport });
    const response = await api(new Request("https://local.test/api/evaluate", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503); // Absolute caller URLs are never accepted.
    const controller = new AbortController(); controller.abort();
    await expect(api("/api/evaluate", { signal: controller.signal })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect((await api("/api/ai-usage")).status).toBe(429);
  });
});
