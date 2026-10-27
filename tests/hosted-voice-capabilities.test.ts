import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { defaultState } from "../src/lib/engine";
import { SpeakingTeacher } from "../src/components/speaking-teacher";
import { WhisperPanel } from "../src/components/whisper-panel";

vi.mock("../src/lib/native/runtime", () => ({ nativeBuild: false }));
vi.mock("../src/lib/deployment", () => ({ isHostedWebClient: true }));
vi.mock("../src/components/study-context", () => ({
  useStudy: () => ({
    state: defaultState("2026-10-27"),
    update: vi.fn(),
    notify: vi.fn(),
    fail: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

test("hosted AI teacher offers device speech and manual text without desktop model management", () => {
  const html = renderToStaticMarkup(createElement(SpeakingTeacher));
  expect(html).toContain("手工填写");
  expect(html).toContain("设备本地");
  expect(html).not.toContain("管理本地模型");
  expect(html).not.toContain("正在检查本地 Whisper");
});

test("hosted recording review offers saved audio and manual notes without unavailable desktop controls", () => {
  const html = renderToStaticMarkup(createElement(WhisperPanel));
  expect(html).toContain("已保存录音");
  expect(html).toContain("核对转写或手工自评");
  expect(html).not.toContain("刷新本地模型状态");
  expect(html).not.toContain("本地转写所选录音");
  expect(html).not.toContain("127.0.0.1:8765");
});
