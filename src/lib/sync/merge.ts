import { documentSchema, type SyncDocument } from "./document";

// These collections have identities independent of their visual ordering.
const collections = new Set([
  "recordings",
  "listeningAudio",
  "state.attempts",
  "state.tasks",
  "state.weekly",
  "state.assessments",
  "state.extension.tasks",
  "state.extension.mistakes",
  "state.extension.practiceSessions",
  "state.extension.teacherSessions",
  "state.extension.evaluations",
  "state.extension.speechAnalyses",
  "state.extension.listeningMaterials",
  "state.extension.sources",
]);
const missing = Symbol("missing");
const object = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (object(a) && object(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
    );
  }
  return false;
}
export function mergeDocuments(
  base: SyncDocument,
  local: SyncDocument,
  remote: SyncDocument,
): { document?: SyncDocument; conflicts: string[] } {
  const conflicts: string[] = [];
  function merge(b: unknown, l: unknown, r: unknown, path: string): unknown {
    if (equal(l, r)) return l;
    if (equal(l, b)) return r;
    if (equal(r, b)) return l;
    const atomic =
      /^(recordings|listeningAudio)\[/.test(path) ||
      /^state\.(reviews|extension\.fsrsReviews)\./.test(path);
    if (!atomic && object(l) && object(r) && (object(b) || b === missing)) {
      const old = object(b) ? b : {};
      const out: Record<string, unknown> = Object.create(null);
      for (const key of new Set([
        ...Object.keys(old),
        ...Object.keys(l),
        ...Object.keys(r),
      ])) {
        const value = merge(
          Object.hasOwn(old, key) ? old[key] : missing,
          Object.hasOwn(l, key) ? l[key] : missing,
          Object.hasOwn(r, key) ? r[key] : missing,
          path ? `${path}.${key}` : key,
        );
        if (value !== missing) out[key] = value;
      }
      return out;
    }
    if (
      collections.has(path) &&
      Array.isArray(b) &&
      Array.isArray(l) &&
      Array.isArray(r)
    ) {
      const arrays = [b, l, r];
      if (
        arrays.every(
          (a) =>
            a.every((x) => object(x) && typeof x.id === "string") &&
            new Set(a.map((x) => x.id)).size === a.length,
        )
      ) {
        const [bm, lm, rm] = arrays.map(
          (a) => new Map(a.map((x) => [x.id as string, x])),
        );
        const out = [];
        for (const id of new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])) {
          const value = merge(
            bm.has(id) ? bm.get(id) : missing,
            lm.has(id) ? lm.get(id) : missing,
            rm.has(id) ? rm.get(id) : missing,
            `${path}[${id}]`,
          );
          if (value !== missing) out.push(value);
        }
        return out;
      }
    }
    conflicts.push(path);
    return l;
  }
  const merged = merge(base, local, remote, "");
  if (conflicts.length) return { conflicts };
  const parsed = documentSchema.safeParse(merged);
  if (!parsed.success)
    return { conflicts: parsed.error.issues.map((i) => i.path.join(".")) };
  parsed.data.recordings.sort((a, b) => a.id.localeCompare(b.id));
  parsed.data.listeningAudio.sort((a, b) => a.id.localeCompare(b.id));
  return { document: parsed.data, conflicts: [] };
}
