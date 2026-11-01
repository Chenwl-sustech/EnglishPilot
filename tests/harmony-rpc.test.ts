import { expect, test, vi } from "vitest";
import {
  createHarmonyRpc,
  type HarmonyBridge,
} from "../src/lib/native/harmony-rpc";

function fixture(timeout = 1000) {
  const events = new EventTarget();
  const sent: { id: string; method: string; args: (string | number)[] }[] = [];
  const bridge: HarmonyBridge = {
    postMessage: (raw) => {
      sent.push(JSON.parse(raw));
    },
  };
  const rpc = createHarmonyRpc(bridge, events, timeout);
  const reply = (id: string, fields: object) =>
    events.dispatchEvent(
      new CustomEvent("englishpilot-native-reply", {
        detail: { id, ...fields },
      }),
    );
  return { rpc, sent, reply };
}

test("Harmony RPC correlates out-of-order native replies and propagates native errors", async () => {
  const f = fixture();
  const first = f.rpc.call("session:get", ["key"]);
  const second = f.rpc.call("begin", ["backup.epbackup", 12]);
  f.reply("unrelated", { result: "ignored" });
  f.reply(f.sent[1].id, { result: "export-id" });
  f.reply(f.sent[0].id, { error: "设备已锁定" });
  await expect(first).rejects.toThrow("设备已锁定");
  expect(await second).toBe("export-id");
  f.rpc.dispose();
});

test("Harmony RPC rejects malformed correlated replies instead of reporting successful file writes", async () => {
  const f = fixture();
  const pending = f.rpc.call("append", ["id", "YQ=="]);
  f.reply(f.sent[0].id, { result: { success: true } });
  await expect(pending).rejects.toThrow(/无效/);
  f.rpc.dispose();
});

test("Harmony RPC abort cancels native HTTP and rejects before dispatch when already aborted", async () => {
  const f = fixture();
  const control = new AbortController();
  const pending = f.rpc.call("http", ["{}"], control.signal);
  const id = f.sent[0].id;
  control.abort();
  await expect(pending).rejects.toThrow();
  expect(f.sent[1].method).toBe("http:cancel");
  expect(f.sent[1].args).toEqual([id]);
  await expect(f.rpc.call("http", ["{}"], control.signal)).rejects.toThrow();
  expect(f.sent).toHaveLength(2);
  f.reply(id, { result: "late result" });
  f.rpc.dispose();
});

test("Harmony RPC timeouts and disposal release pending calls and prevent reuse", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(50);
    const timed = f.rpc.call("http", ["{}"]);
    const rejected = expect(timed).rejects.toThrow(/超时/);
    await vi.advanceTimersByTimeAsync(51);
    await rejected;
    expect(f.sent[1].method).toBe("http:cancel");
    const waiting = f.rpc.call("session:get", ["key"]);
    const closed = expect(waiting).rejects.toThrow(/关闭/);
    f.rpc.dispose();
    await closed;
    await expect(f.rpc.call("begin", [])).rejects.toThrow(/关闭/);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("stopping Harmony synthesis cancels the native job and discards late audio", async () => {
  const f = fixture();
  const control = new AbortController();
  const pending = f.rpc.call(
    "speech:render",
    ["hello", "harmony:8"],
    control.signal,
  );
  const id = f.sent[0].id;
  control.abort();
  await expect(pending).rejects.toThrow();
  expect(f.sent[1]).toMatchObject({ method: "speech:cancel", args: [id] });
  f.reply(id, { result: "late audio" });
  f.rpc.dispose();
});
