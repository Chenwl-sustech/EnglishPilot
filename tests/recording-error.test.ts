import { expect, test } from "vitest";
import { recordingError } from "../src/lib/recording-error";

test("denied iPad microphone permission gives actionable recovery instructions", () => {
  const error = recordingError(
    new DOMException("The request is not allowed", "NotAllowedError"),
    true,
  );
  expect(error.message).toContain("麦克风");
  expect(error.message).toContain("系统设置");
  expect(error.message).toContain("EnglishPilot");
  expect(error.message).toContain("重试");
});

test("browser denial explains browser permissions instead of device-only controls", () => {
  const error = recordingError(
    new DOMException("Permission denied", "NotAllowedError"),
    false,
  );
  expect(error.message).toContain("浏览器");
  expect(error.message).toContain("麦克风");
});

test("unknown recording failures retain their useful original detail", () => {
  const original = new Error("Recorder could not start");
  expect(recordingError(original, true)).toBe(original);
});
