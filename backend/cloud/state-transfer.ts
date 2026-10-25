import { z } from "zod";
import { ledgerSchema } from "../shared/server/ai-quota";
import { teacherReplySchema } from "../shared/teacher-model";
import { FREE_LIMITS, freeLimitsSchema } from "./service";

const result = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), response: teacherReplySchema }).strict(),
  z.object({ ok: z.literal(false), message: z.string().max(2000), status: z.number().int().min(400).max(599) }).strict(),
]);
const receipt = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), state: z.enum(["pending", "completed"]), result: result.optional() }).strict().refine(v => v.state !== "completed" || v.result !== undefined);
const envelope = z.object({ format: z.literal("englishpilot-backend-state-v1"), records: z.array(z.object({ key: z.string(), value: z.unknown() }).strict()).min(1).max(10001) }).strict();
export type StateBundle = z.infer<typeof envelope>;

export function parseStateBundle(raw: string): StateBundle {
  if (Buffer.byteLength(raw, "utf8") > 4 * 1024 * 1024) throw new Error("迁移文件超过4MB，未发送或导入。");
  const bundle = envelope.parse(JSON.parse(raw));
  const keys = new Set<string>();
  for (const record of bundle.records) {
    if (keys.has(record.key)) throw new Error("迁移文件包含重复记录。");
    keys.add(record.key);
    if (record.key === "ai-usage") {
      const ledger = ledgerSchema.parse(record.value);
      freeLimitsSchema.parse(ledger.limits);
      for (const day of Object.values(ledger.days)) {
        const reserved = Object.values(day.reservations).reduce((n, value) => n + value.tokens, 0);
        if (day.calls < Object.keys(day.reservations).length || !Number.isSafeInteger(day.usedTokens + reserved)) throw new Error("额度账本不一致，未导入。");
      }
      record.value = ledger;
    } else if (/^teacher:[a-f0-9-]{36}$/.test(record.key)) {
      z.uuid().parse(record.key.slice(8)); record.value = receipt.parse(record.value);
    } else throw new Error("迁移文件包含不支持的记录编号。");
  }
  if (!keys.has("ai-usage")) throw new Error("迁移文件缺少额度账本。");
  return bundle;
}

export function emptyStateBundle(): StateBundle {
  return { format: "englishpilot-backend-state-v1", records: [{ key: "ai-usage", value: { version: 1, limits: { ...FREE_LIMITS }, days: {} } }] };
}

// Every conflict is checked before any key is written; the entire EVAL is atomic.
export const importScript = `for i,key in ipairs(KEYS) do
local current=redis.call('GET',key)
if current and current~=ARGV[i] then return -1 end
end
local added=0
for i,key in ipairs(KEYS) do
if redis.call('SET',key,ARGV[i],'NX') then added=added+1 end
end
return added`;

export async function importStateBundle(bundle: StateBundle, command: (args: (string | number)[]) => Promise<unknown>, prefix = "englishpilot:free:v1") {
  if (!/^[\w:.-]{1,100}$/.test(prefix)) throw new Error("迁移命名空间无效。");
  const checked = parseStateBundle(JSON.stringify(bundle));
  const records = [...checked.records].sort((a, b) => a.key.localeCompare(b.key));
  const result = await command(["EVAL", importScript, records.length, ...records.map(r => prefix + ":" + r.key), ...records.map(r => JSON.stringify(r.value))]);
  if (result === -1) throw new Error("云端已有状态发生变化或存在冲突，未覆盖任何记录。");
  if (!Number.isInteger(result) || Number(result) < 0 || Number(result) > records.length) throw new Error("迁移结果不确定；请核对云端数据，未自动重试。");
  return result as number;
}
