import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { teacherReplySchema, type TeacherReply } from "../teacher-model";
import { type CloudStateStore } from "./cloud-state";

export class TeacherRequestError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}
const receiptSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), response: teacherReplySchema }),
  z.object({
    ok: z.literal(false),
    message: z.string().max(2000),
    status: z.number().int().min(400).max(599),
  }),
]);
/** A directory is an exclusive durable claim. An uncertain dispatch is never repeated. */
export class TeacherReceipts {
  private readonly root: string;
  private cloud?: () => CloudStateStore;
  constructor(directory: string, cloud?: () => CloudStateStore) {
    this.cloud = cloud;
    this.root = resolve(directory);
  }
  async run(
    id: string,
    fingerprint: string,
    execute: () => Promise<TeacherReply>,
  ): Promise<TeacherReply> {
    z.uuid().parse(id);
    if (this.cloud) return this.runCloud(id, fingerprint, execute);
    await mkdir(this.root, { recursive: true });
    const directory = join(this.root, id);
    let claimed = false;
    try {
      await mkdir(directory);
      claimed = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST")
        throw new TeacherRequestError("无法保存 AI 请求凭据，已停止调用", 503);
    }
    if (!claimed) {
      let stored;
      try {
        const meta = JSON.parse(
          await readFile(join(directory, "request.json"), "utf8"),
        );
        if (meta.fingerprint !== fingerprint)
          throw new TeacherRequestError(
            "同一请求编号对应的内容发生变化，请重新打开当前对话",
            409,
          );
        stored = receiptSchema.parse(
          JSON.parse(await readFile(join(directory, "result.json"), "utf8")),
        );
      } catch (e) {
        if (e instanceof TeacherRequestError) throw e;
        throw new TeacherRequestError(
          "该请求正在处理或结果尚不确定。可稍后获取已保存结果；如明确重新发送，会产生新的额度消耗。",
          409,
        );
      }
      if (!stored.ok)
        throw new TeacherRequestError(stored.message, stored.status);
      return stored.response;
    }
    try {
      await writeFile(
        join(directory, "request.json"),
        JSON.stringify({ fingerprint }),
        { flag: "wx" },
      );
    } catch {
      throw new TeacherRequestError("请求凭据保存失败，未调用 AI", 503);
    }
    let result: z.infer<typeof receiptSchema>;
    try {
      result = { ok: true, response: await execute() };
    } catch (e) {
      const error =
        e instanceof TeacherRequestError
          ? e
          : new TeacherRequestError("AI 对话处理失败，文本与录音仍保留");
      result = { ok: false, message: error.message, status: error.status };
    }
    try {
      const temp = join(directory, `result-${crypto.randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(result), { flag: "wx" });
      await rename(temp, join(directory, "result.json"));
    } catch {
      throw new TeacherRequestError(
        "AI 请求结果未能安全保存，未自动重发；请检查本机存储",
        503,
      );
    }
    if (!result.ok)
      throw new TeacherRequestError(result.message, result.status);
    return result.response;
  }
  private async runCloud(
    id: string,
    fingerprint: string,
    execute: () => Promise<TeacherReply>,
  ): Promise<TeacherReply> {
    const key = `teacher:${id}`,
      pending = { fingerprint, state: "pending" };
    let cloud: CloudStateStore, claimed: boolean;
    try {
      cloud = this.cloud!();
      claimed = await cloud.initialize(key, pending);
    } catch {
      throw new TeacherRequestError("云端请求凭据无法保存，未调用 AI", 503);
    }
    if (!claimed) {
      let saved;
      try {
        saved = z
          .object({
            fingerprint: z.string(),
            state: z.enum(["pending", "completed"]),
            result: receiptSchema.optional(),
          })
          .parse(await cloud.read(key));
      } catch {
        throw new TeacherRequestError("云端请求凭据不可读取，未自动重发", 503);
      }
      if (saved.fingerprint !== fingerprint)
        throw new TeacherRequestError("同一请求编号对应的内容发生变化", 409);
      if (saved.state !== "completed" || !saved.result)
        throw new TeacherRequestError(
          "该请求正在处理或结果尚不确定，未自动重发",
          409,
        );
      if (!saved.result.ok)
        throw new TeacherRequestError(
          saved.result.message,
          saved.result.status,
        );
      return saved.result.response;
    }
    let result: z.infer<typeof receiptSchema>;
    try {
      result = {
        ok: true,
        response: teacherReplySchema.parse(await execute()),
      };
    } catch (error) {
      const e =
        error instanceof TeacherRequestError
          ? error
          : new TeacherRequestError("AI 对话处理失败，文本与录音仍保留");
      result = { ok: false, message: e.message, status: e.status };
    }
    try {
      await cloud.completeClaim(key, pending, {
        fingerprint,
        state: "completed",
        result,
      });
    } catch {
      throw new TeacherRequestError("AI 请求结果未能安全保存，未自动重发", 503);
    }
    if (!result.ok)
      throw new TeacherRequestError(result.message, result.status);
    return result.response;
  }
}
