"use client";
import { curriculumLevels } from "@/lib/curriculum";
import { useStudy } from "./study-context";
export function StudyLevel() {
  const { state, update, fail } = useStudy();
  return (
    <label className="prompt-select">
      训练级别
      <select
        aria-label="训练级别"
        value={state.extension.studyLevel}
        onChange={(e) => {
          const level = e.target.value as typeof state.extension.studyLevel;
          void update((s) => ({
            ...s,
            extension: { ...s.extension, studyLevel: level },
          })).catch(fail);
        }}
      >
        <option value="all">全部级别（计划按阶段选择）</option>
        {curriculumLevels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      <span className="small muted">
        教学分级，非CEFR认证。到期词汇复习优先保留；已生成的试卷不随设置改变。
      </span>
      <span className="small muted">
        分级内容：EnglishPilot 原创学习库 v2，含AI辅助编写。
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
        。题目未经官方审定或分数校准。
      </span>
    </label>
  );
}
