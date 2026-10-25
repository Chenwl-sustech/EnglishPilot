import { words } from "./content";
import type { State } from "./model";
import type { UserWord } from "./adaptive-model";
import { curriculumVocabulary, type CurriculumLevel } from "./curriculum";
import { openVocabularyEntries } from "./open-vocabulary";
export type VocabularyEntry = UserWord & {
  word: string;
  example: string;
  category: string;
  level: CurriculumLevel;
};
function bundledVocabulary(): VocabularyEntry[] {
  const originals: VocabularyEntry[] = words.map((w) => ({
    ...w,
    headword: w.word,
    examples: [w.example],
    collocations: [],
    synonyms: [],
    family: [],
    cefr: null,
    sources: ["englishpilot-original"],
    contexts: [],
    level:
      w.category === "科研英语"
        ? "advanced"
        : w.category === "日常交流"
          ? "foundation"
          : "intermediate",
    fieldSources: {
      headword: "EnglishPilot 原创整理",
      ipa: "EnglishPilot 人工音标整理",
      meaning: "EnglishPilot 原创",
      definition: "EnglishPilot 原创",
      examples: "EnglishPilot 原创",
      tts: "实际可用的设备或系统语音",
    },
  }));
  const added: VocabularyEntry[] = curriculumVocabulary.map((w) => ({
    id: w.id,
    word: w.word,
    headword: w.word,
    ipa: w.phonetic ?? "",
    definition: w.definition,
    meaning: w.meaning,
    pos: w.partOfSpeech,
    examples: [w.example],
    example: w.example,
    category: "分级词库",
    level: w.level,
    collocations: w.collocations,
    synonyms: w.synonyms,
    family: w.family,
    cefr: null,
    sources: [w.sourceId],
    contexts: [],
    fieldSources: {
      headword: w.sourceId,
      definition: w.sourceId,
      meaning: w.sourceId,
      examples: w.sourceId,
      collocations: w.sourceId,
      family: w.sourceId,
      synonyms: w.sourceId,
      level: "EnglishPilot 教学分级，非CEFR认证",
      ipa: w.phonetic ? w.sourceId : "未提供可靠音标",
      tts: "实际可用的设备或系统语音",
    },
  }));
  const byWord = new Map(
    [...originals, ...added].map((w) => [w.headword.toLowerCase(), w]),
  );
  for (const word of openVocabularyEntries) {
    const previous = byWord.get(word.headword.toLowerCase());
    byWord.set(word.headword.toLowerCase(), previous ? {
      ...word, ...previous,
      definition: previous.definition || word.definition,
      pos: previous.pos || word.pos,
      family: [...new Set([...previous.family, ...word.family])],
      sources: [...new Set([...previous.sources, ...word.sources])],
      fieldSources: { ...word.fieldSources, ...previous.fieldSources },
    } : word);
  }
  return [...byWord.values()];
}
const bundled = bundledVocabulary();

export function vocabularyEntries(state: State): VocabularyEntry[] {
  const byWord = new Map(bundled.map((word) => [word.headword.toLowerCase(), word]));
  for (const w of Object.values(state.extension.userWords)) {
    const original = byWord.get(w.headword.toLowerCase());
    byWord.set(w.headword.toLowerCase(), {
      ...original,
      ...w,
      definition: w.definition || original?.definition || "",
      meaning: w.meaning || original?.meaning || "",
      word: w.headword,
      example: w.examples[0] ?? original?.example ?? "",
      category: original?.category ?? "个人生词",
      level: original?.level ?? "foundation",
      sources: [...new Set([...(original?.sources ?? []), ...w.sources])],
      fieldSources: { ...original?.fieldSources, ...w.fieldSources },
    });
  }
  return [...byWord.values()];
}
