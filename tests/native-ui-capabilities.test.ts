import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { defaultState } from "../src/lib/engine";
import { ServiceSettings } from "../src/components/service-settings";
import { WhisperPanel } from "../src/components/whisper-panel";
import { ListeningImportPanel } from "../src/components/listening-import";
import { ListeningBatchImport } from "../src/components/listening-batch-import";
import { ListeningLab } from "../src/components/listening-lab";
import { SpeakingTeacher } from "../src/components/speaking-teacher";
import { CalendarPage } from "../src/components/calendar-page";

vi.mock("../src/lib/native/runtime", () => ({ nativeBuild: true }));
vi.mock("../src/components/study-context", () => ({
  useStudy: () => ({
    state: defaultState("2026-10-25"),
    update: vi.fn(),
    notify: vi.fn(),
    fail: vi.fn(),
  }),
  StudyProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const render = (component: React.ComponentType<any>, props = {}) =>
  renderToStaticMarkup(createElement(component, props));

test("native settings show device speech without Windows installation or desktop WAV controls", () => {
  const html = render(ServiceSettings);
  expect(html).not.toContain("Windows Update");
  expect(html).not.toContain("刷新语音包与声音");
  expect(html).toContain("设备本地声音");
});

test("native recording review keeps manual notes without offering a nonexistent Whisper service", () => {
  const html = render(WhisperPanel);
  expect(html).toContain("核对转写或手工自评");
  expect(html).toContain("已保存录音");
  expect(html).not.toContain("刷新本地模型状态");
  expect(html).not.toContain("本地转写所选录音");
  expect(html).not.toContain("127.0.0.1:8765");
});

test("native listening import keeps personal audio and source links without a blocked automatic download action", () => {
  const html = render(ListeningImportPanel, { onImported: vi.fn() });
  expect(html).toContain("官方来源");
  expect(html).toContain('type="file"');
  expect(html).not.toContain("批量导入首批官方素材");
  expect(html).not.toContain("预览并下载原音");
});

test("native batch-import deep links explain the supported local-file flow", () => {
  const html = render(ListeningBatchImport);
  expect(html).not.toContain("开始导入首批官方素材");
  expect(html).toContain("个人音频");
});

test("native listening offers device speech without a desktop WAV option", () => {
  const html = render(ListeningLab);
  expect(html).toContain("浏览器设备语音");
  expect(html).not.toContain("WAV 缓存");
});

test("native calendar uses its stored schedule without offering an unsupported online check", () => {
  const html = render(CalendarPage);
  expect(html).not.toContain("检查年度官方安排");
  expect(html).toContain("已核实的官方日历与来源");
});

test("calendar does not mark days before the learning start date as missed", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T10:00:00+08:00"));
  try {
    const html = render(CalendarPage);
    expect(html).not.toContain("<i>未完成</i>");
  } finally {
    vi.useRealTimers();
  }
});

test("native AI teacher describes manual text and device speech without desktop model management", () => {
  const html = render(SpeakingTeacher);
  expect(html).not.toContain("管理本地模型");
  expect(html).not.toContain("正在检查本地 Whisper");
  expect(html).toContain("手工填写");
  expect(html).toContain("设备本地");
});
