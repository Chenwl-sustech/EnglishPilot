import { describe, expect, it } from "vitest";
import { defaultState } from "../src/lib/engine";
import { createFsrsReview, reviewFsrs, upsertPersonalWord } from "../src/lib/fsrs";
import { decodeBackup, encodeBackup } from "../src/lib/backup";
import { vocabularyEntries } from "../src/lib/vocabulary";
import {
  filterVocabulary,
  importVocabularyPack,
  parseVocabularyPack,
} from "../src/lib/vocabulary-import";

const now = new Date("2026-10-24T10:00:00Z");
const source = {
  id: "test-open-v1", name: "Fixture open vocabulary", url: "https://example.org/words",
  license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  attribution: "Fixture author", modification: "No translation added",
};
const raw = (entries: unknown[]) => JSON.stringify({
  format: "englishpilot-vocabulary-v1", name: "Fixture pack", sources: [source], entries,
});

describe("vocabulary pack import", () => {
  it("retains distinct case-sensitive source IDs on duplicate rows and later merges", () => {
    const rawPack = { format: "englishpilot-vocabulary-v1", name: "Two sources", sources: [{ ...source, id: "CASE" }, { ...source, id: "case" }], entries: [
      { headword: "zebratest", sourceIds: ["CASE"] }, { headword: "ZEBRATEST", sourceIds: ["case"] },
    ] };
    const first = importVocabularyPack(defaultState("2026-10-24"), parseVocabularyPack(JSON.stringify(rawPack)), now);
    expect(first.state.extension.userWords["personal:zebratest"].sources).toEqual(["CASE", "case"]);
    const again = importVocabularyPack(first.state, parseVocabularyPack(JSON.stringify(rawPack)), now);
    expect(again.state.extension.userWords["personal:zebratest"].sources).toEqual(["CASE", "case"]);
  });
  it("merges normalized duplicate headwords once and retains all source fields", () => {
    const initial = defaultState("2026-10-24");
    const result = importVocabularyPack(initial, parseVocabularyPack(raw([
      { headword: " ZEBRATEST ", definition: "An example word", sourceIds: [source.id] },
      { headword: "ｚｅｂｒａｔｅｓｔ", meaning: "示例", family: ["zebratests"], sourceIds: [source.id] },
    ])), now);
    expect(result.summary.added).toBe(1);
    expect(result.summary.duplicates).toBe(1);
    const word = result.state.extension.userWords["personal:zebratest"];
    expect(word).toMatchObject({ headword: "zebratest", definition: "An example word", meaning: "示例", family: ["zebratests"], sources: [source.id] });
    expect(result.state.extension.sources.find((s) => s.id === source.id)).toEqual(source);
    expect(initial.extension.userWords).toEqual({});
  });

  it("preserves personal definitions, IDs, existing due dates and review history on reimport", () => {
    const seeded = upsertPersonalWord(defaultState("2026-10-24"), { headword: "adapt", meaning: "我的释义", definition: "My own definition" }, now);
    const word = Object.values(seeded.extension.userWords)[0];
    const review = reviewFsrs(createFsrsReview(now), "good", now);
    seeded.extension.fsrsReviews[word.id] = review;
    const pack = parseVocabularyPack(raw([{ headword: "ADAPT", meaning: "外部释义", definition: "External definition", family: ["adapts"], sourceIds: [source.id] }]));
    const result = importVocabularyPack(seeded, pack, now);
    expect(result.summary.added).toBe(0);
    expect(result.state.extension.userWords[word.id]).toMatchObject({ id: word.id, meaning: "我的释义", definition: "My own definition" });
    expect(result.state.extension.fsrsReviews[word.id]).toEqual(review);
    const again = importVocabularyPack(result.state, pack, new Date("2026-10-25T10:00:00Z"));
    expect(again.state).toEqual(result.state);
    expect(again.summary.added).toBe(0);
  });

  it("rejects the entire file for an invalid later row or unknown source", () => {
    const initial = defaultState("2026-10-24");
    const before = structuredClone(initial);
    expect(() => importVocabularyPack(initial, parseVocabularyPack(raw([
      { headword: "zebratest", sourceIds: [source.id] }, { headword: "", sourceIds: [source.id] },
    ])), now)).toThrow();
    expect(() => parseVocabularyPack(raw([{ headword: "zebratest", sourceIds: ["missing-source"] }]))).toThrow();
    expect(initial).toEqual(before);
  });

  it("refuses source attribution conflicts and unsafe source links without overwriting existing data", () => {
    const initial = defaultState("2026-10-24");
    initial.extension.sources.push({ ...source, license: "My original license" });
    const before = structuredClone(initial);
    expect(() => importVocabularyPack(initial, parseVocabularyPack(raw([{ headword: "zebratest", sourceIds: [source.id] }])), now)).toThrow(/来源/);
    expect(initial).toEqual(before);
    expect(() => parseVocabularyPack(JSON.stringify({ format: "englishpilot-vocabulary-v1", name: "bad", sources: [{ ...source, url: "javascript:alert(1)" }], entries: [{ headword: "word" }] }))).toThrow();
  });

  it("restores imported words, source metadata and FSRS state through a full backup", async () => {
    const result = importVocabularyPack(defaultState("2026-10-24"), parseVocabularyPack(raw([
      { headword: "zebratest", definition: "An example word", sourceIds: [source.id] },
    ])), now);
    const restored = await decodeBackup(await encodeBackup(result.state, [], []));
    expect(restored.state.extension.userWords).toEqual(result.state.extension.userWords);
    expect(restored.state.extension.fsrsReviews).toEqual(result.state.extension.fsrsReviews);
    expect(restored.state.extension.sources).toEqual(result.state.extension.sources);
  });

  it("filters by query and source together, and exposes reference-only words in search", () => {
    const result = importVocabularyPack(defaultState("2026-10-24"), parseVocabularyPack(raw([
      { headword: "zebratest", definition: "An example word", sourceIds: [source.id] },
      { headword: "zzreference", sourceIds: [source.id] },
    ])), now);
    const entries = vocabularyEntries(result.state);
    expect(filterVocabulary(entries, "ＺＥＢＲＡ", source.id).map((w) => w.headword)).toEqual(["zebratest"]);
    expect(filterVocabulary(entries, "example", source.id).map((w) => w.headword)).toEqual(["zebratest"]);
    expect(filterVocabulary(entries, "zzreference", source.id)[0].definition).toBe("");
    expect(filterVocabulary(entries, "adapt", source.id)).toEqual([]);
  });
});
