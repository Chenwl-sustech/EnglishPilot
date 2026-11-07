import { rcp } from '@kit.RemoteCommunicationKit';
import { util } from '@kit.ArkTS';
import { HARMONY_BODY_LIMIT, harmonyHeaders, harmonyRequestAllowed } from './HarmonyPolicy';

interface NetworkInput { url: string; method: string; headers: Record<string, string>; bodyBase64?: string; }
interface NetworkOutput { status: number; headers: Record<string, string>; bodyBase64: string; }

export class NetworkBridge {
  private requests: Map<string, rcp.Session> = new Map();
  private closed: boolean = false;

  async request(id: string, raw: string): Promise<string> {
    if (this.closed || this.requests.size >= 8 || typeof raw !== 'string' || raw.length > 8 * 1024 * 1024) throw new Error('网络接口繁忙或请求过大');
    const input = JSON.parse(raw) as NetworkInput;
    if (!input || !harmonyRequestAllowed(input.url, input.method) || !input.headers) throw new Error('不接受此在线接口');
    const headers = harmonyHeaders(input.headers);
    let body: ArrayBuffer | undefined = undefined;
    if (input.bodyBase64 !== undefined) {
      if (!['POST', 'PUT'].includes(input.method) || typeof input.bodyBase64 !== 'string' ||
        input.bodyBase64.length > Math.ceil(HARMONY_BODY_LIMIT / 3) * 4 || input.bodyBase64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(input.bodyBase64)) throw new Error('网络请求格式或大小无效');
      const bytes = new util.Base64Helper().decodeSync(input.bodyBase64);
      if (bytes.byteLength > HARMONY_BODY_LIMIT) throw new Error('网络请求超过上限');
      body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }
    const chunks: Uint8Array[] = [];
    let size: number = 0;
    let oversize: boolean = false;
    const session = rcp.createSession();
    this.requests.set(id, session);
    try {
      const request = new rcp.Request(input.url, input.method, headers, body);
      request.configuration = {
        transfer: {
          autoRedirect: false,
          timeout: { connectMs: 15000, transferMs: 75000 }
        },
        tracing: {
          httpEventsHandler: {
            onDataReceive: (data: ArrayBuffer): number => {
              if (size + data.byteLength > HARMONY_BODY_LIMIT) {
                oversize = true;
                session.cancel();
                return 0;
              }
              chunks.push(new Uint8Array(data));
              size += data.byteLength;
              return data.byteLength;
            }
          }
        }
      };
      const response = await session.fetch(request);
      if (response.statusCode >= 300 && response.statusCode < 400) throw new Error('在线接口发生重定向');
      if (oversize || size > HARMONY_BODY_LIMIT) throw new Error('网络响应超过上限');
      const bytes = new Uint8Array(size);
      let offset: number = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const responseHeaders: Record<string, string> = {};
      for (const name of Object.keys(response.headers)) {
        const value = response.headers[name];
        if (['content-type', 'cache-control', 'etag', 'content-range', 'last-modified'].includes(name.toLowerCase()) &&
          typeof value === 'string' && value.length <= 8192) responseHeaders[name.toLowerCase()] = value;
      }
      const result: NetworkOutput = { status: response.statusCode, headers: responseHeaders, bodyBase64: new util.Base64Helper().encodeToStringSync(bytes) };
      return JSON.stringify(result);
    } catch {
      if (oversize) throw new Error('在线响应超过 5 MB 上限，已停止接收。');
      throw new Error('在线连接失败或超时，请检查网络并重试；已保存内容仍保留。');
    } finally {
      this.requests.delete(id);
      try { session.close(); } catch {}
    }
  }

  cancel(id: string): void {
    const session = this.requests.get(id);
    if (!session) return;
    try { session.cancel(); } catch {}
  }

  dispose(): number {
    const count = this.requests.size;
    this.closed = true;
    this.requests.forEach((session: rcp.Session) => { try { session.cancel(); session.close(); } catch {} });
    this.requests.clear();
    return count;
  }
}
