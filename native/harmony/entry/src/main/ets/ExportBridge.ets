import { common } from '@kit.AbilityKit';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { webview } from '@kit.ArkWeb';

interface ExportSession { path: string; name: string; expected: number; written: number; }
interface BridgeRequest { id: string; method: string; args: Array<string | number>; }
interface BridgeReply { id: string; result: string | boolean; error?: string; }

export class ExportBridge {
  private sessions: Map<string, ExportSession> = new Map();
  private controller: webview.WebviewController;
  private context: () => common.UIAbilityContext;

  constructor(controller: webview.WebviewController, context: () => common.UIAbilityContext) {
    this.controller = controller;
    this.context = context;
  }

  postMessage(raw: string): void {
    if (raw.length > 300000 || !this.controller.getUrl().startsWith('https://englishpilot.local/')) return;
    let request: BridgeRequest;
    try { request = JSON.parse(raw) as BridgeRequest; } catch { return; }
    if (!request || typeof request.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(request.id) || !Array.isArray(request.args)) return;
    this.execute(request).then((result: string | boolean) => {
      this.reply({ id: request.id, result });
    }).catch(() => {
      this.reply({ id: request.id, result: false, error: '设备文件操作失败，请检查可用空间并重新导出；原数据未更改。' });
    });
  }

  private reply(reply: BridgeReply): void {
    if (!this.controller.getUrl().startsWith('https://englishpilot.local/')) return;
    const data = JSON.stringify(reply);
    this.controller.runJavaScript(`window.dispatchEvent(new CustomEvent('englishpilot-native-reply',{detail:${data}}))`).catch(() => {});
  }

  private async execute(request: BridgeRequest): Promise<string | boolean> {
    if (request.method === 'begin') {
      const name = request.args[0] as string, expected = request.args[1] as number;
      if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+\.(epbackup|json)$/.test(name) || !Number.isInteger(expected) || expected <= 0 || expected > 512 * 1024 * 1024 || this.sessions.size >= 2) throw new Error('Invalid export');
      const id = util.generateRandomUUID();
      const path = `${this.context().cacheDir}/englishpilot-${id}`;
      const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.closeSync(file);
      this.sessions.set(id, { path, name, expected, written: 0 });
      return id;
    }
    const id = request.args[0] as string;
    const session = this.sessions.get(id);
    if (!session) {
      if (request.method === 'abort') return true;
      throw new Error('Invalid session');
    }
    if (request.method === 'append') {
      const data = request.args[1] as string;
      if (typeof data !== 'string' || data.length > 262144 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(data)) throw new Error('Invalid chunk');
      const bytes = new util.Base64Helper().decodeSync(data);
      if (bytes.byteLength > 192 * 1024 || session.written + bytes.byteLength > session.expected) throw new Error('Invalid size');
      const file = fs.openSync(session.path, fs.OpenMode.WRITE_ONLY | fs.OpenMode.APPEND);
      try {
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const written = fs.writeSync(file.fd, buffer);
        if (written !== bytes.byteLength) throw new Error('Incomplete write');
        session.written += written;
      } finally { fs.closeSync(file); }
      return true;
    }
    if (request.method === 'finish') {
      if (session.written !== session.expected) throw new Error('Incomplete export');
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [session.name];
      const destinations = await new picker.DocumentViewPicker(this.context()).save(options);
      if (!destinations.length) return false;
      const source = fs.openSync(session.path, fs.OpenMode.READ_ONLY);
      const destination = fs.openSync(destinations[0], fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      try { await fs.copyFile(source.fd, destination.fd); }
      finally { fs.closeSync(source); fs.closeSync(destination); }
      return true;
    }
    if (request.method === 'abort') {
      fs.unlinkSync(session.path);
      this.sessions.delete(id);
      return true;
    }
    throw new Error('Unknown operation');
  }

  dispose(): void {
    this.sessions.forEach((session: ExportSession) => { try { fs.unlinkSync(session.path); } catch {} });
    this.sessions.clear();
  }
}
