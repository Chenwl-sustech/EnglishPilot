import type { State } from "./model";
const checkSeconds = (seconds: number) => {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400)
    throw new Error("写作计时应为0–86400秒");
};
export function persistWritingTime(
  s: State,
  id: string,
  epoch: number,
  seconds: number,
): State {
  checkSeconds(seconds);
  const old = s.extension.writingTimers[id] ?? { epoch: 0, seconds: 0 };
  if (old.epoch !== epoch || old.seconds >= seconds) return s;
  return {
    ...s,
    extension: {
      ...s.extension,
      writingTimers: { ...s.extension.writingTimers, [id]: { epoch, seconds } },
    },
  };
}
/** Consume one writing session atomically with the submitted version; stale tabs cannot restore it. */
export function consumeWritingTime(
  s: State,
  id: string,
  epoch: number,
  seconds: number,
) {
  checkSeconds(seconds);
  const old = s.extension.writingTimers[id] ?? { epoch: 0, seconds: 0 };
  if (old.epoch !== epoch)
    throw new Error(
      "此轮写作已在另一窗口提交，文字仍保留；请重新开始计时后再保存新版本",
    );
  return {
    seconds: Math.max(old.seconds, seconds),
    state: {
      ...s,
      extension: {
        ...s.extension,
        writingTimers: {
          ...s.extension.writingTimers,
          [id]: { epoch: epoch + 1, seconds: 0 },
        },
      },
    },
  };
}
