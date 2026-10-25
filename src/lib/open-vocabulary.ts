import data from "./data/open-vocabulary.json";
import type { VocabularyEntry } from "./vocabulary";

export const openVocabularySources = data.sources;

export function isVocabularyLearnable(word: { meaning: string; definition: string }) {
  return !!(word.meaning.trim() || word.definition.trim());
}

/** Built once; new review records are created lazily when a person studies a word. */
export const openVocabularyEntries: VocabularyEntry[] = data.entries.map((entry) => ({
  id: `open:${encodeURIComponent(entry.headword)}`,
  headword: entry.headword, word: entry.headword,
  meaning: "", definition: entry.definition, pos: entry.pos, ipa: "",
  examples: [], example: "", collocations: [], synonyms: [], family: entry.family,
  cefr: null, sources: entry.sourceIds, contexts: [],
  category: entry.sourceIds.includes("ngsl-1.2") ? "NGSL 高频词" : entry.sourceIds.includes("nawl-1.2") ? "NAWL 学术词" : "BNC/COCA 参考词族",
  level: entry.sourceIds.includes("ngsl-1.2") || (entry.frequencyBand && entry.frequencyBand <= 3) ? "foundation" : entry.frequencyBand && entry.frequencyBand <= 9 ? "intermediate" : "advanced",
  fieldSources: {
    headword: entry.sourceIds.join("; "),
    definition: entry.definition ? entry.sourceIds.join("; ") : "原始词表未提供，待补充",
    pos: entry.pos ? entry.sourceIds.join("; ") : "原始词表未提供",
    family: entry.sourceIds.join("; "),
    meaning: "原始词表未提供中文释义", ipa: "原始词表未提供音标",
    level: "EnglishPilot 学习顺序分组，非 CEFR 认证", tts: "设备已安装的实际语音",
  },
}));
