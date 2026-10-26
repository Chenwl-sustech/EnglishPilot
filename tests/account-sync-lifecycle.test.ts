import { afterEach, expect, test, vi } from "vitest";
import {
  createSyncScheduler,
  pendingAfterLocalChange,
} from "../src/lib/sync/lifecycle";
afterEach(() => vi.useRealTimers());
test("new edits immediately invalidate a synced label but do not clear conflicts or errors", () => {
  expect(pendingAfterLocalChange("synced")).toBe("pending");
  expect(pendingAfterLocalChange("conflict")).toBe("conflict");
  expect(pendingAfterLocalChange("error")).toBe("error");
  expect(pendingAfterLocalChange("syncing")).toBe("syncing");
});
test("changes debounce, hidden pages wait, and disposed accounts never schedule again", async () => {
  vi.useFakeTimers();
  let visible = true,
    count = 0;
  const scheduler = createSyncScheduler(
    async () => {
      count++;
    },
    () => visible,
  );
  scheduler.changed();
  await vi.advanceTimersByTimeAsync(9000);
  scheduler.changed();
  await vi.advanceTimersByTimeAsync(9000);
  expect(count).toBe(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(count).toBe(1);
  visible = false;
  scheduler.changed();
  await vi.advanceTimersByTimeAsync(70000);
  expect(count).toBe(1);
  visible = true;
  scheduler.resume();
  expect(count).toBe(2);
  scheduler.changed();
  scheduler.dispose();
  await vi.advanceTimersByTimeAsync(120000);
  scheduler.resume();
  scheduler.changed();
  expect(count).toBe(2);
});
