import { listeningMaterialSchema } from "../../src/lib/listening-material-model";

export const syntheticListeningMaterial = listeningMaterialSchema.parse({
  id: `listening:${"a".repeat(64)}:general`,
  audioId: "a".repeat(64),
  title: "Synthetic test tone",
  exam: "general",
  license: "Synthetic test fixture",
  duration: 25,
  audioBytes: 4800044,
  mime: "audio/wav",
  origin: "personal",
  catalogId: null,
  importedAt: "2026-10-27T08:00:00Z",
  revision: 1,
});
