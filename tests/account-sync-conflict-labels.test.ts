import { expect, test } from "vitest";
import { conflictAreas } from "../src/lib/sync/conflict-labels";

test("real concurrent draft conflicts identify learning areas without internal keys", () => {
  expect(
    conflictAreas([
      "state.extension.writingTimers.writing-0.seconds",
      "state.drafts.writing-0",
      "state.drafts.private-topic-id",
      "recordings[private-recording-id]",
      "listeningAudio[private-audio-id]",
    ]),
  ).toEqual(["写作计时", "练习草稿", "口语录音", "听力音频"]);
});

test("unknown or misleading paths stay generic and do not expose identifiers", () => {
  expect(
    conflictAreas([
      "state.draftsElsewhere.private-id",
      "state.extension.unknown.private-id",
      "unrecognized.private-id",
      "",
    ]),
  ).toEqual(["其他学习内容"]);
});
