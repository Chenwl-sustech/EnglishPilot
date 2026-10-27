const areas: [string, string][] = [
  ["state.extension.writingTimers", "写作计时"],
  ["state.extension.teacherSessions", "AI 教师对话"],
  ["state.extension.fsrsReviews", "词汇复习进度"],
  ["state.extension.listeningMaterials", "听力素材与标注"],
  ["state.drafts", "练习草稿"],
  ["state.profile", "学习目标"],
  ["state.settings", "学习设置"],
  ["state.scheduleHistory", "计划变更记录"],
  ["state.lastReviewDate", "学习评估日期"],
  ["state.attempts", "练习记录"],
  ["state.tasks", "学习任务"],
  ["state.reviews", "词汇复习进度"],
  ["state.weekly", "每周回顾"],
  ["state.assessments", "测评记录"],
  ["state.favorites", "收藏"],
  ["recordings", "口语录音"],
  ["listeningAudio", "听力音频"],
];

export function conflictAreas(paths: string[]): string[] {
  return [
    ...new Set(
      paths.map(
        (path) =>
          areas.find(
            ([prefix]) =>
              path === prefix ||
              path.startsWith(`${prefix}.`) ||
              path.startsWith(`${prefix}[`),
          )?.[1] ?? "其他学习内容",
      ),
    ),
  ];
}
