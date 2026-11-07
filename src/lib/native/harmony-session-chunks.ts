export interface SecretStore {
  get(alias: string): Promise<Uint8Array | null>;
  put(alias: string, bytes: Uint8Array, label: string): Promise<void>;
  remove(alias: string): Promise<void>;
  list(label: string): Promise<string[]>;
}
export interface SessionCodec {
  encode(value: string): Uint8Array;
  decode(value: Uint8Array): string;
  generation(): string;
}
interface SessionManifest {
  version: number;
  generation: string;
  chunks: number;
  bytes: number;
}

/** Asset Store encrypts each secret (at most 1024 bytes); commit the head last. */
export class ChunkedSessionStorage {
  private queues: Map<string, Promise<void>> = new Map();
  private store: SecretStore;
  private codec: SessionCodec;
  constructor(store: SecretStore, codec: SessionCodec) {
    this.store = store;
    this.codec = codec;
  }

  private label(key: string): string {
    if (
      typeof key !== "string" ||
      !/^englishpilot-auth-[a-z0-9-]{1,120}$/.test(key)
    )
      throw new Error("不接受此账号存储项");
    return `ep.session:${key}`;
  }

  private schedule(
    key: string,
    action: () => Promise<string | null>,
  ): Promise<string | null> {
    this.label(key);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const operation = previous.then(action);
    const tail = operation
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        if (this.queues.get(key) === tail) this.queues.delete(key);
      });
    this.queues.set(key, tail);
    return operation;
  }

  get(key: string): Promise<string | null> {
    return this.schedule(key, async () => {
      const label = this.label(key);
      const head = await this.store.get(label + ":head");
      if (head === null) return null;
      let manifest: SessionManifest;
      try {
        manifest = JSON.parse(this.codec.decode(head)) as SessionManifest;
      } catch {
        throw new Error("账号安全存储不完整，请重新登录");
      }
      if (
        !manifest ||
        manifest.version !== 1 ||
        typeof manifest.generation !== "string" ||
        !/^[a-f0-9-]{36}$/.test(manifest.generation) ||
        !Number.isInteger(manifest.bytes) ||
        manifest.bytes < 0 ||
        manifest.bytes > 65536 ||
        manifest.chunks !== Math.ceil(manifest.bytes / 768)
      )
        throw new Error("账号安全存储不完整，请重新登录");
      const data = new Uint8Array(manifest.bytes);
      for (let i = 0; i < manifest.chunks; i++) {
        const part = await this.store.get(
          `${label}:g:${manifest.generation}:${i}`,
        );
        if (
          part === null ||
          part.byteLength !== Math.min(768, manifest.bytes - i * 768)
        )
          throw new Error("账号安全存储不完整，请重新登录");
        data.set(part, i * 768);
      }
      return this.codec.decode(data);
    });
  }

  async set(key: string, value: string): Promise<void> {
    await this.schedule(key, async () => {
      if (typeof value !== "string") throw new Error("账号会话格式无效");
      const data = this.codec.encode(value);
      if (data.byteLength > 65536) throw new Error("账号会话超过安全存储上限");
      const label = this.label(key),
        generation = this.codec.generation();
      if (!/^[a-f0-9-]{36}$/.test(generation))
        throw new Error("无法创建安全存储代次");
      const current = `${label}:g:${generation}:`;
      const written: string[] = [];
      try {
        for (let offset = 0; offset < data.byteLength; offset += 768) {
          const alias = current + Math.floor(offset / 768);
          await this.store.put(alias, data.slice(offset, offset + 768), label);
          written.push(alias);
        }
        const manifest: SessionManifest = {
          version: 1,
          generation,
          chunks: Math.ceil(data.byteLength / 768),
          bytes: data.byteLength,
        };
        await this.store.put(
          label + ":head",
          this.codec.encode(JSON.stringify(manifest)),
          label,
        );
      } catch (error) {
        for (const alias of written) {
          try {
            await this.store.remove(alias);
          } catch {
            /* Preserve the original failure. */
          }
        }
        throw error as Error;
      }
      // A killed refresh can leave uncommitted chunks; reclaim them after commit.
      try {
        for (const alias of await this.store.list(label)) {
          if (alias.startsWith(label + ":g:") && !alias.startsWith(current))
            await this.store.remove(alias);
        }
      } catch {
        /* The committed session remains readable; retry cleanup on the next write. */
      }
      return null;
    });
  }

  async remove(key: string): Promise<void> {
    await this.schedule(key, async () => {
      const label = this.label(key);
      await this.store.remove(label + ":head");
      for (const alias of await this.store.list(label)) {
        if (alias.startsWith(label + ":g:")) await this.store.remove(alias);
      }
      return null;
    });
  }
}
