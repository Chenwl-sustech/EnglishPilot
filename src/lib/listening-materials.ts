import {
  listeningImportSchema,
  listeningMaterialSchema,
  type ListeningImport,
  type ListeningMaterial,
} from "./listening-material-model";
import { db, mutateWithListeningAudios, type Recording } from "./db";
import type { State } from "./model";
import { recordAttempt, today } from "./engine";

export type PreparedListeningImport = {
  material: ListeningMaterial;
  audio: Recording;
};
export function audioMime(bytes: Uint8Array): string {
  const ascii = (start: number, length: number) =>
    new TextDecoder().decode(bytes.slice(start, start + length));
  if (bytes.length >= 44 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE")
    return "audio/wav";
  if (
    bytes.length >= 4 &&
    (ascii(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224))
  )
    return "audio/mpeg";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp") return "audio/mp4";
  if (
    bytes[0] === 26 &&
    bytes[1] === 69 &&
    bytes[2] === 223 &&
    bytes[3] === 163
  )
    return "audio/webm";
  throw new Error(
    "无法识别音频格式，请选择有效的 MP3、WAV、OGG、M4A、FLAC 或 WEBM",
  );
}
export async function prepareListeningImport(
  raw: unknown,
  file: Blob,
  official?: {
    id: string;
    publisher: string;
    pageUrl: string;
    termsUrl: string;
    exam: "ielts" | "toefl";
    version: string;
  },
  now = new Date(),
): Promise<PreparedListeningImport> {
  if (!file.size || file.size > 128 * 1024 * 1024)
    throw new Error("音频必须为1字节到128 MB");
  const mime = audioMime(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  const data = listeningImportSchema.parse(raw);
  const audioId = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const material = listeningMaterialSchema.parse({
    ...data,
    ...(official
      ? {
          publisher: official.publisher,
          sourceUrl: official.pageUrl,
          licenseUrl: official.termsUrl,
          exam: official.exam,
          version: official.version,
        }
      : {}),
    id: `listening:${audioId}:${official?.exam ?? data.exam}`,
    audioId,
    audioBytes: file.size,
    mime,
    origin: official ? "official-sample" : "personal",
    catalogId: official?.id ?? null,
    importedAt: now.toISOString(),
    revision: 0,
  });
  return {
    material,
    audio: {
      id: audioId,
      blob: file.slice(0, file.size, mime),
      date: today(now),
      title: data.title,
    },
  };
}
export async function importListeningMaterial(
  prepared: PreparedListeningImport,
): Promise<State> {
  return (await importListeningMaterials([prepared])).state;
}
async function validatePrepared(prepared: PreparedListeningImport) {
  const material = listeningMaterialSchema.parse(prepared.material);
  const actual = await crypto.subtle.digest(
    "SHA-256",
    await prepared.audio.blob.arrayBuffer(),
  );
  const hash = [...new Uint8Array(actual)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (
    hash !== material.audioId ||
    material.id !== `listening:${material.audioId}:${material.exam}` ||
    prepared.audio.id !== material.audioId ||
    prepared.audio.blob.size !== material.audioBytes
  )
    throw new Error("音频校验失败，未修改素材");
  return { ...prepared, material };
}
export async function importListeningMaterials(
  prepared: PreparedListeningImport[],
) {
  if (!prepared.length || prepared.length > 20)
    throw new Error("一次导入应包含1–20个素材");
  const items = await Promise.all(prepared.map(validatePrepared));
  if (new Set(items.map((p) => p.material.id)).size !== items.length)
    throw new Error("素材包包含重复素材");
  const audio = [...new Map(items.map((p) => [p.audio.id, p.audio])).values()];
  let added = 0;
  const state = await mutateWithListeningAudios(audio, (s) => {
    const existing = new Set(s.extension.listeningMaterials.map((m) => m.id));
    const fresh = items
      .map((p) => p.material)
      .filter((m) => !existing.has(m.id));
    added = fresh.length;
    return fresh.length
      ? {
          ...s,
          extension: {
            ...s.extension,
            listeningMaterials: [...s.extension.listeningMaterials, ...fresh],
          },
        }
      : s;
  });
  return { state, added, retained: items.length - added };
}
export function updateListeningMaterial(
  s: State,
  id: string,
  revision: number,
  patch: Pick<ListeningImport, "transcript" | "segments" | "questions">,
): State {
  const old = s.extension.listeningMaterials.find((m) => m.id === id);
  if (!old || old.revision !== revision)
    throw new Error("素材已在其他页面更新，请重新打开后再编辑");
  const material = listeningMaterialSchema.parse({
    ...old,
    ...patch,
    revision: revision + 1,
    timelineDraft: null,
    timelineProvenance: patch.segments.length
      ? { method: "manual", model: null, confirmedAt: new Date().toISOString() }
      : null,
  });
  return {
    ...s,
    extension: {
      ...s.extension,
      listeningMaterials: s.extension.listeningMaterials.map((m) =>
        m.id === id ? material : m,
      ),
    },
  };
}
const normalized = (text: string) =>
  text
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/[.!?]+$/u, "");
export function submitListeningMaterial(
  s: State,
  id: string,
  attemptId: string,
  responses: Record<string, string>,
  seconds: number,
  now = new Date(),
  expectedRevision?: number,
): State {
  if (s.attempts.some((a) => a.id === attemptId)) return s;
  const material = s.extension.listeningMaterials.find((m) => m.id === id);
  if (!material) throw new Error("素材不存在");
  if (expectedRevision !== undefined && material.revision !== expectedRevision)
    throw new Error("素材已在其他页面更新，请重新打开后再作答");
  if (
    Object.values(responses).some(
      (answer) => typeof answer !== "string" || answer.length > 3000,
    )
  )
    throw new Error("单题作答上限为3000字符");
  if (JSON.stringify(responses).length > 90000)
    throw new Error("作答总内容超过90000字符，请精简后保存");
  if (material.questions.some((q) => !responses[q.id]?.trim()))
    throw new Error("请回答全部题目后提交");
  if (
    Object.keys(responses).some(
      (id) => !material.questions.some((q) => q.id === id),
    )
  )
    throw new Error("回答包含不属于当前素材的题目");
  const used = new Map<string, Set<string>>();
  const wrong = material.questions.filter((q) => {
    const answer = normalized(responses[q.id]);
    const answerIndex = q.answers.findIndex((a) => normalized(a) === answer);
    if (answerIndex < 0) return true;
    if (!q.distinctGroup) return false;
    const seen = used.get(q.distinctGroup) ?? new Set<string>();
    used.set(q.distinctGroup, seen);
    const key = normalized(q.answerKeys[answerIndex] ?? q.answers[answerIndex]);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  return recordAttempt(s, {
    id: attemptId,
    skill: "listening",
    contentId: id,
    date: today(now),
    createdAt: now.toISOString(),
    seconds,
    score: material.questions.length
      ? 1 - wrong.length / material.questions.length
      : null,
    answer: JSON.stringify({
      exam: material.exam,
      revision: material.revision,
      responses,
    }),
    errors: wrong.map(
      (q) =>
        `原句：${q.prompt}\n你的答案：${responses[q.id]}\n正确答案：${q.answers.join(" / ")}\n解析：${q.explanation}`,
    ),
  });
}
/** A bounded local read; metadata remains useful even when legacy backups omit audio. */
export async function listeningAudio(id: string) {
  return db.listeningAudio.get(id);
}
