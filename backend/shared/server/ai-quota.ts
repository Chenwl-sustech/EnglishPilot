import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { hostedSameOrigin, isHostedWebDeployment } from "./deployment.ts";
import {
  CloudStateStore,
  getCloudStateStore,
  usesCloudState,
} from "./cloud-state.ts";

export const aiQuotaLimitsSchema = z
  .object({
    dailyCalls: z.number().int().min(0).max(10000),
    dailyTokens: z.number().int().min(0).max(100000000),
    maxOutputTokens: z.number().int().min(1).max(32768),
  })
  .strict();
export type AiQuotaLimits = z.infer<typeof aiQuotaLimitsSchema>;
const defaults: AiQuotaLimits = {
  dailyCalls: 20,
  dailyTokens: 200000,
  maxOutputTokens: 4096,
};
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const heldSchema = z.object({ tokens: count, maxOutputTokens: count }).strict();
const daySchema = z
  .object({
    calls: count,
    usedTokens: count,
    reservations: z.record(z.string().uuid(), heldSchema),
  })
  .strict();
export const ledgerSchema = z
  .object({
    version: z.literal(1),
    limits: aiQuotaLimitsSchema,
    days: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), daySchema),
  })
  .strict();
type Ledger = z.infer<typeof ledgerSchema>;
type Day = z.infer<typeof daySchema>;
export type AiQuotaSnapshot = {
  day: string;
  timezone: "Asia/Shanghai";
  limits: AiQuotaLimits;
  calls: { used: number; remaining: number };
  tokens: { used: number; reserved: number; remaining: number };
};
export type AiReservation = {
  id: string;
  day: string;
  tokens: number;
  maxOutputTokens: number;
  body: string;
};
export class QuotaExceededError extends Error {
  constructor() {
    super(
      "今日 AI 调用次数或 token 预算不足（含失败和未确认用量的预留）。请等待北京时间次日，或在设置中调整额度；作文与录音已保留。",
    );
    this.name = "QuotaExceededError";
  }
}
export class QuotaStorageError extends Error {
  constructor() {
    super(
      "AI 额度记录不可用或已损坏，已停止发送 AI 请求。请稍后重试，或联系管理员检查额度存储；不会自动清零额度。",
    );
    this.name = "QuotaStorageError";
  }
}
const isCode = (error: unknown, code: string) =>
  (error as NodeJS.ErrnoException)?.code === code;
const emptyDay = (): Day => ({ calls: 0, usedTokens: 0, reservations: {} });
const reserved = (day: Day) =>
  Object.values(day.reservations).reduce((n, item) => n + item.tokens, 0);
const dayInShanghai = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export class AiQuotaStore {
  private readonly cloud?: CloudStateStore;
  private readonly directory: string;
  private readonly now: () => Date;

  constructor(options: {
    directory: string;
    now?: () => Date;
    cloud?: CloudStateStore;
  }) {
    this.cloud = options.cloud;
    this.directory = resolve(options.directory);
    this.now = options.now ?? (() => new Date());
  }

  private async writeExclusive(path: string, value: unknown) {
    const file = await open(path, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
  }

  private exited(pid: number) {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return isCode(error, "ESRCH");
    }
  }

  private async electRecovery(candidate: string, ownerToken: string) {
    // Each failed reaper gets a new permanent election node. Reusing/deleting
    // an election filename would allow an old contender to unlink a new lock.
    for (let depth = 0; depth < 128; depth++) {
      const marker = join(this.directory, `.ai-usage-reaped-${ownerToken}`);
      try {
        await link(candidate, marker);
        return true;
      } catch (error) {
        if (!isCode(error, "EEXIST")) throw error;
      }
      const reaper = z
        .object({ token: z.string().uuid(), pid: z.number().int().positive() })
        .parse(JSON.parse(await readFile(marker, "utf8")));
      if (!this.exited(reaper.pid)) return false;
      ownerToken = reaper.token;
    }
    throw new QuotaStorageError();
  }

  private async lock(): Promise<() => Promise<void>> {
    await mkdir(this.directory, { recursive: true });
    const token = randomUUID();
    const candidate = join(this.directory, `.ai-usage-owner-${token}.tmp`);
    const path = join(this.directory, "ai-usage.lock");
    // Publish a fully written owner atomically: a crash cannot leave an empty lock.
    await this.writeExclusive(candidate, { token, pid: process.pid });
    const deadline = Date.now() + 10000;
    try {
      while (true) {
        try {
          await link(candidate, path);
          return async () => {
            await unlink(path);
          };
        } catch (error) {
          if (!isCode(error, "EEXIST")) throw error;
        }
        try {
          const ownerText = await readFile(path, "utf8").catch((error) => {
            // Windows can deny this open briefly while the current owner
            // unlinks the lock. Retry only this read within the existing deadline.
            if (
              process.platform === "win32" &&
              (isCode(error, "EPERM") || isCode(error, "EACCES"))
            )
              return null;
            throw error;
          });
          const owner =
            ownerText === null
              ? null
              : z
                  .object({
                    token: z.string().uuid(),
                    pid: z.number().int().positive(),
                  })
                  .parse(JSON.parse(ownerText));
          if (owner && this.exited(owner.pid)) {
            try {
              if (await this.electRecovery(candidate, owner.token)) {
                const current = JSON.parse(await readFile(path, "utf8"));
                if (current.token === owner.token) await unlink(path);
              }
            } catch (error) {
              if (!isCode(error, "ENOENT")) throw error;
            }
          }
        } catch (error) {
          if (!isCode(error, "ENOENT")) throw error;
        }
        if (Date.now() >= deadline) throw new QuotaStorageError();
        await delay(10 + Math.floor(Math.random() * 20));
      }
    } finally {
      await unlink(candidate).catch(() => {});
    }
  }

  private async load(): Promise<Ledger> {
    try {
      const ledger = ledgerSchema.parse(
        JSON.parse(
          await readFile(join(this.directory, "ai-usage.json"), "utf8"),
        ),
      );
      for (const day of Object.values(ledger.days)) {
        if (
          day.calls < Object.keys(day.reservations).length ||
          !Number.isSafeInteger(day.usedTokens + reserved(day))
        )
          throw new QuotaStorageError();
      }
      return ledger;
    } catch (error) {
      if (isCode(error, "ENOENT"))
        return { version: 1, limits: { ...defaults }, days: {} };
      throw new QuotaStorageError();
    }
  }

  private async save(ledger: Ledger) {
    if (this.cloud) return; // The surrounding cloud transaction commits the mutated ledger atomically.
    const temporary = join(this.directory, `.ai-usage-${randomUUID()}.tmp`);
    try {
      await this.writeExclusive(temporary, ledger);
      await rename(temporary, join(this.directory, "ai-usage.json"));
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  private async transaction<T>(
    operation: (ledger: Ledger) => Promise<T>,
  ): Promise<T> {
    try {
      if (this.cloud)
        return await this.cloud.update(
          "ai-usage",
          (raw) => {
            const ledger = ledgerSchema.parse(raw);
            for (const day of Object.values(ledger.days))
              if (
                day.calls < Object.keys(day.reservations).length ||
                !Number.isSafeInteger(day.usedTokens + reserved(day))
              )
                throw new QuotaStorageError();
            return ledger;
          },
          operation,
        );
      const release = await this.lock();
      try {
        return await operation(await this.load());
      } finally {
        await release();
      }
    } catch (error) {
      if (
        error instanceof QuotaExceededError ||
        error instanceof QuotaStorageError
      )
        throw error;
      throw new QuotaStorageError();
    }
  }

  private view(ledger: Ledger): AiQuotaSnapshot {
    const day = dayInShanghai(this.now());
    const usage = ledger.days[day] ?? emptyDay();
    const held = reserved(usage);
    return {
      day,
      timezone: "Asia/Shanghai",
      limits: ledger.limits,
      calls: {
        used: usage.calls,
        remaining: Math.max(0, ledger.limits.dailyCalls - usage.calls),
      },
      tokens: {
        used: usage.usedTokens,
        reserved: held,
        remaining: Math.max(
          0,
          ledger.limits.dailyTokens - usage.usedTokens - held,
        ),
      },
    };
  }

  async snapshot() {
    return this.transaction(async (ledger) => this.view(ledger));
  }

  async configure(raw: unknown) {
    const limits = aiQuotaLimitsSchema.parse(raw);
    return this.transaction(async (ledger) => {
      ledger.limits = limits;
      await this.save(ledger);
      return this.view(ledger);
    });
  }

  async reserve(
    buildBody: (maxOutputTokens: number) => string,
  ): Promise<AiReservation> {
    return this.transaction(async (ledger) => {
      const body = buildBody(ledger.limits.maxOutputTokens);
      // This is a conservative byte-based reservation, not exact tokenization or pricing.
      const tokens =
        Buffer.byteLength(body, "utf8") + ledger.limits.maxOutputTokens;
      if (Buffer.byteLength(body, "utf8") > 200000)
        throw new QuotaExceededError();
      const snapshot = this.view(ledger);
      if (!snapshot.calls.remaining || tokens > snapshot.tokens.remaining)
        throw new QuotaExceededError();
      const id = randomUUID();
      const usage = (ledger.days[snapshot.day] ??= emptyDay());
      usage.calls++;
      usage.reservations[id] = {
        tokens,
        maxOutputTokens: ledger.limits.maxOutputTokens,
      };
      await this.save(ledger);
      return {
        id,
        day: snapshot.day,
        tokens,
        maxOutputTokens: ledger.limits.maxOutputTokens,
        body,
      };
    });
  }

  async reconcile(reservation: AiReservation, raw: unknown) {
    const parsed = z
      .object({
        input_tokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        output_tokens: count,
        total_tokens: count,
      })
      .safeParse(raw);
    if (!parsed.success) return;
    const usage = parsed.data;
    if (usage.input_tokens + usage.output_tokens !== usage.total_tokens) return;
    await this.transaction(async (ledger) => {
      const day = ledger.days[reservation.day];
      const held = day?.reservations[reservation.id];
      if (
        !held ||
        usage.output_tokens > held.maxOutputTokens ||
        !Number.isSafeInteger(day.usedTokens + usage.total_tokens)
      )
        return;
      day.usedTokens += usage.total_tokens;
      delete day.reservations[reservation.id];
      await this.save(ledger);
    });
  }
}

export function getAiQuotaStore() {
  return new AiQuotaStore({
    ...(usesCloudState() ? { cloud: getCloudStateStore() } : {}),
    directory:
      process.env.ENGLISHPILOT_DATA_DIR || join(process.cwd(), ".local"),
  });
}

export class AiRequestError extends Error {
  readonly status: 400 | 413;
  constructor(status: 400 | 413) {
    super(status === 413 ? "请求过大" : "请求 JSON 格式无效");
    this.status = status;
  }
}

export function aiSameOrigin(request: Request) {
  if (isHostedWebDeployment()) return hostedSameOrigin(request);
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  try {
    const actual = new URL(request.url);
    const host = request.headers.get("host") ?? actual.host;
    const endpoint = new URL(`${actual.protocol}//${host}`);
    // This app serves local APIs only. Do not trust an arbitrary Host merely
    // because a rebinding browser sends a matching Origin and fetch metadata.
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname) ||
      endpoint.port !== actual.port ||
      endpoint.host !== host.toLowerCase()
    )
      return false;
    if (!origin) return true;
    const supplied = new URL(origin);
    return (
      ["http:", "https:"].includes(supplied.protocol) &&
      supplied.protocol === actual.protocol &&
      supplied.host === endpoint.host
    );
  } catch {
    return false;
  }
}

export async function readAiRequest(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new AiRequestError(413);
  const reader = request.body?.getReader();
  if (!reader) throw new AiRequestError(400);
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new AiRequestError(413);
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof AiRequestError) throw error;
    throw new AiRequestError(400);
  } finally {
    reader.releaseLock();
  }
}
