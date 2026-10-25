import { describe, expect, it } from "vitest";
import { defaultState } from "../src/lib/engine";
import { words } from "../src/lib/content";
import { vocabularyEntries } from "../src/lib/vocabulary";
import { openVocabularySources, isVocabularyLearnable } from "../src/lib/open-vocabulary";
import { upsertPersonalWord } from "../src/lib/fsrs";

describe("bundled open vocabulary", () => {
  it("enriches an existing word without changing its original review ID or Chinese meaning", () => {
    const state = defaultState("2026-10-24");
    const word = vocabularyEntries(state).find((w) => w.headword === "adapt")!;
    expect(word.id).toBe(words.find((w) => w.word === "adapt")!.id);
    expect(word.meaning).toBe("适应；调整");
    expect(word.sources).toContain("ngsl-1.2");
    expect(openVocabularySources.find((s) => s.id === "ngsl-1.2")?.licenseUrl).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
  });

  it("makes an external word searchable offline while preserving a later personal annotation", () => {
    const initial = defaultState("2026-10-24");
    const original = vocabularyEntries(initial).find((w) => w.headword === "algorithm")!;
    expect(original.definition.length).toBeGreaterThan(0);
    expect(original.sources).toContain("nawl-1.2");
    const edited = upsertPersonalWord(initial, { headword: "ALGORITHM", meaning: "我补充的中文释义" });
    const result = vocabularyEntries(edited).find((w) => w.headword === "algorithm")!;
    expect(result.id).toBe(original.id);
    expect(result.meaning).toBe("我补充的中文释义");
    expect(result.definition).toBe(original.definition);
    expect(result.sources).toContain("nawl-1.2");
  });

  it("does not turn a headword without meaning or definition into a blank recall card", () => {
    expect(isVocabularyLearnable({ meaning: "", definition: "" })).toBe(false);
    expect(isVocabularyLearnable({ meaning: "  ", definition: "  " })).toBe(false);
    expect(isVocabularyLearnable({ meaning: "", definition: "A clear English definition" })).toBe(true);
    expect(isVocabularyLearnable({ meaning: "中文释义", definition: "" })).toBe(true);
  });
});
