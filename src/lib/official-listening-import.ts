import { apiFetch } from "./native/api";
import {
  officialListeningCatalog,
  type OfficialListeningSource,
} from "./data/official-listening";
import { listeningAudioDuration } from "./listening-audio";
import {
  prepareListeningImport,
  importListeningMaterials,
  type PreparedListeningImport,
} from "./listening-materials";
import { db } from "./db";
import {
  listeningImportReceiptInput,
  type ListeningImportReceiptInput,
} from "./listening-import-receipt-model";

export async function prepareOfficialListeningSource(
  source: OfficialListeningSource,
  signal?: AbortSignal,
  requirePairedAnnotations = false,
): Promise<PreparedListeningImport> {
  const bounded = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
    : AbortSignal.timeout(90000);
  const metadataResponse = await apiFetch(
    `/api/listening-sources?id=${encodeURIComponent(source.id)}`,
    { signal: bounded },
  );
  const body = await metadataResponse.json();
  if (!metadataResponse.ok)
    throw new Error(body.error ?? "配套原文与题目读取失败");
  if (
    requirePairedAnnotations &&
    (body.pairedAnnotations !== true ||
      typeof body.metadata?.transcript !== "string" ||
      !body.metadata.transcript.trim() ||
      !Array.isArray(body.metadata.questions) ||
      body.metadata.questions.length !== source.questionCount)
  )
    throw new Error(`${source.title}：配套原文或题目不完整，整批素材尚未导入`);
  const response = await apiFetch("/api/listening-sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: source.id }),
    signal: bounded,
  });
  if (!response.ok)
    throw new Error((await response.json()).error ?? "音频读取失败");
  const audio = await response.blob(),
    duration = await listeningAudioDuration(audio, bounded);
  const prepared = await prepareListeningImport(
    { ...body.metadata, duration },
    audio,
    source,
  );
  if (prepared.material.audioId !== source.sha256)
    throw new Error("官方音频校验失败，未导入");
  bounded.throwIfAborted();
  return prepared;
}
export async function importFirstOfficialListeningPack(
  run: string,
  options: {
    signal?: AbortSignal;
    progress?: (count: number, title: string) => void;
  } = {},
): Promise<ListeningImportReceiptInput> {
  const prepared: PreparedListeningImport[] = [];
  for (const source of officialListeningCatalog) {
    options.signal?.throwIfAborted();
    options.progress?.(prepared.length, source.title);
    prepared.push(
      await prepareOfficialListeningSource(source, options.signal, true),
    );
  }
  options.signal?.throwIfAborted();
  options.progress?.(prepared.length, "正在统一保存并核对素材");
  const result = await importListeningMaterials(prepared);
  // Read the committed records back before reporting success to the local server.
  const stored = (await db.state.get("main"))?.value;
  const ids = new Set(prepared.map((p) => p.material.id));
  const materials =
    stored?.extension.listeningMaterials.filter((m) => ids.has(m.id)) ?? [];
  if (materials.length !== prepared.length)
    throw new Error("素材记录尚未完整保存，请重试核对");
  for (const material of materials) {
    const audio = await db.listeningAudio.get(material.audioId);
    if (!audio || audio.blob.size !== material.audioBytes)
      throw new Error("原音未完整保存，请重试核对");
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", await audio.blob.arrayBuffer()),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== material.audioId)
      throw new Error("保存后的原音校验失败，请重试");
  }
  const receipt = listeningImportReceiptInput.parse({
    run,
    materialIds: materials.map((m) => m.id),
    added: result.added,
    retained: result.retained,
    questionCount: materials.reduce((n, m) => n + m.questions.length, 0),
  });
  const response = await apiFetch("/api/listening-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(receipt),
    signal: options.signal,
  });
  if (!response.ok)
    throw new Error(
      (await response.json()).error ?? "素材已保存，但结果确认失败，请重试核对",
    );
  return receipt;
}
