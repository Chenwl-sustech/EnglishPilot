import { z } from "zod";
import { officialListeningCatalog } from "./data/official-listening";
export const importRunSchema = z
  .uuid()
  .transform((value) => value.toLowerCase());
const expected = new Set(
  officialListeningCatalog.map((s) => `listening:${s.sha256}:${s.exam}`),
);
export const listeningImportReceiptInput = z
  .object({
    run: importRunSchema,
    materialIds: z.array(z.string().max(100)).length(expected.size),
    added: z.number().int().min(0).max(expected.size),
    retained: z.number().int().min(0).max(expected.size),
    questionCount: z
      .number()
      .int()
      .min(0)
      .max(expected.size * 100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.materialIds).size !== expected.size ||
      value.materialIds.some((id) => !expected.has(id)) ||
      value.added + value.retained !== expected.size
    )
      ctx.addIssue({
        code: "custom",
        message: "导入回执必须包含完整首批官方素材，且新增与保留数量一致",
      });
  });
export type ListeningImportReceiptInput = z.infer<
  typeof listeningImportReceiptInput
>;
export const listeningImportReceiptSchema = z.object({
  input: listeningImportReceiptInput,
  completedAt: z.iso.datetime(),
});
