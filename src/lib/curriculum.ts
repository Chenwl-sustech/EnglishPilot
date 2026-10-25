import { vocabularyRows } from "./data/curriculum-vocabulary";
import { materialData } from "./data/curriculum-materials";

export type CurriculumLevel = "foundation" | "intermediate" | "advanced";
export type CurriculumExam = "shared" | "ielts" | "toefl";
export type CurriculumSkill = "foundation" | "reading" | "listening";
export type CurriculumQuestionType = "detail" | "inference" | "main-idea" | "matching-heading" | "true-false-not-given" | "vocabulary" | "grammar" | "purpose" | "sequence" | "attitude";
export interface CurriculumVocabulary {
  id: string; word: string; headword: string; level: CurriculumLevel; exam: CurriculumExam;
  definition: string; meaning: string; partOfSpeech: string; example: string;
  phonetic?: string; collocations: string[]; family: string[]; synonyms: string[]; sourceId: string;
}
export interface CurriculumQuestion {
  id: string; prompt: string; options: string[]; correct: number; explanation: string;
  questionType: CurriculumQuestionType; difficulty: 1 | 2 | 3;
  /** Exact excerpt from the material. Supports answer review; it is not a semantic proof. */
  evidence: string;
}
export interface CurriculumMaterial {
  id: string; title: string; level: CurriculumLevel; exam: CurriculumExam;
  skill: CurriculumSkill; text: string; questions: CurriculumQuestion[]; sourceId: string;
}
export const curriculumLevels = [
  { id: "foundation", label: "基础巩固", description: "日常事务、核心句法与直接信息定位" },
  { id: "intermediate", label: "进阶应用", description: "校园与公共议题、段落关系和有依据的推断" },
  { id: "advanced", label: "学术拓展", description: "论证、研究限制与复杂学术材料" },
] as const;
export const curriculumSources = [{
  id: "englishpilot-original-v2", title: "EnglishPilot 原创分级学习库 v2",
  license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "EnglishPilot original curriculum, v2 (2026)",
  note: "原创教学材料，含 AI 辅助编写；不是考试真题、官方模考或经校准题库。分级为教学安排，不是 CEFR 认证。",
}] as const;
export const curriculumVocabulary: CurriculumVocabulary[] = vocabularyRows.map((row) => ({
  id: `vocab-v2-${row.word.replace(/[^a-z0-9]+/g, "-")}`,
  headword: row.word, exam: "shared", sourceId: "englishpilot-original-v2", ...row,
}));
export const curriculumMaterials: CurriculumMaterial[] = materialData;

/** Returns actionable structural errors; content meaning still requires editorial review. */
export function validateCurriculum(input: {
  vocabulary?: CurriculumVocabulary[]; materials?: CurriculumMaterial[];
} = {}): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const headwords = new Set<string>();
  const sourceIds = new Set<string>(curriculumSources.map((source) => source.id));
  const levels = new Set<string>(curriculumLevels.map((level) => level.id));
  const register = (id: string) => {
    if (!id?.trim()) errors.push("Missing id");
    else if (ids.has(id)) errors.push(`Duplicate id: ${id}`);
    ids.add(id);
  };
  for (const word of input.vocabulary ?? curriculumVocabulary) {
    register(word.id);
    if (!levels.has(word.level)) errors.push(`${word.id}: unknown level`);
    if (!sourceIds.has(word.sourceId)) errors.push(`${word.id}: unknown source`);
    const normalized = word.word.trim().toLowerCase();
    if (!normalized || headwords.has(normalized)) errors.push(`${word.id}: duplicate or empty headword`);
    headwords.add(normalized);
    if (![word.definition, word.meaning, word.partOfSpeech, word.example].every((value) => value?.trim())) errors.push(`${word.id}: incomplete vocabulary`);
    if (!word.collocations.length || word.collocations.some((value) => !value.trim())) errors.push(`${word.id}: missing collocations`);
  }
  for (const material of input.materials ?? curriculumMaterials) {
    register(material.id);
    if (!levels.has(material.level)) errors.push(`${material.id}: unknown level`);
    if (!sourceIds.has(material.sourceId)) errors.push(`${material.id}: unknown source`);
    if (!material.title.trim() || !material.text.trim() || !material.questions.length) errors.push(`${material.id}: empty material`);
    for (const question of material.questions) {
      register(question.id);
      if (!Number.isInteger(question.correct) || question.correct < 0 || question.correct >= question.options.length) errors.push(`${question.id}: answer out of range`);
      const options = question.options.map((option) => option.trim().toLowerCase());
      if (options.length < 3 || options.some((option) => !option) || new Set(options).size !== options.length) errors.push(`${question.id}: invalid options`);
      if (!question.prompt.trim() || !question.explanation.trim()) errors.push(`${question.id}: missing prompt or explanation`);
      if (!question.evidence.trim() || !material.text.includes(question.evidence)) errors.push(`${question.id}: evidence is absent from context`);
      if (![1, 2, 3].includes(question.difficulty)) errors.push(`${question.id}: invalid difficulty`);
    }
  }
  return errors;
}
