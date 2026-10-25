import { nativeBuild } from "./runtime";
import { createHarmonyFilePort, type HarmonyBridge } from "./harmony-files";

export interface NativeExportPort {
  begin(filename: string, bytes: number): Promise<string>;
  append(id: string, base64: string): Promise<void>;
  finish(id: string): Promise<boolean>;
  abort(id: string): Promise<void>;
}
type ExportResult = "shared" | "canceled" | "downloaded";

/** The bridge never needs to allocate a 512 MB backup as one base64 string. */
export async function exportInChunks(
  blob: Blob,
  filename: string,
  port: NativeExportPort,
): Promise<ExportResult> {
  if (!/^[a-zA-Z0-9_-]+\.(?:epbackup|json)$/.test(filename))
    throw Error("导出文件名无效");
  if (!blob.size || blob.size > 512 * 1024 * 1024)
    throw Error("备份文件为空或超过 512 MB");
  const id = await port.begin(filename, blob.size);
  try {
    for (let offset = 0; offset < blob.size; offset += 192 * 1024) {
      const bytes = new Uint8Array(
        await blob.slice(offset, offset + 192 * 1024).arrayBuffer(),
      );
      let binary = "";
      for (let index = 0; index < bytes.length; index += 8192)
        binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      await port.append(id, btoa(binary));
    }
    return (await port.finish(id)) ? "shared" : "canceled";
  } finally {
    // Cleanup must not hide the original write/share failure.
    await port.abort(id).catch(() => {});
  }
}

async function iosExportPort(): Promise<NativeExportPort> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const paths = new Map<string, string>();
  const file = (id: string) => {
    const path = paths.get(id);
    if (!path) throw Error("导出会话已失效");
    return path;
  };
  return {
    async begin(filename) {
      const id = crypto.randomUUID(),
        path = `englishpilot-exports/${id}/${filename}`;
      await Filesystem.writeFile({
        path,
        data: "",
        directory: Directory.Cache,
        recursive: true,
      });
      paths.set(id, path);
      return id;
    },
    async append(id, data) {
      await Filesystem.appendFile({
        path: file(id),
        data,
        directory: Directory.Cache,
      });
    },
    async finish(id) {
      const { uri } = await Filesystem.getUri({
        path: file(id),
        directory: Directory.Cache,
      });
      try {
        await Share.share({
          files: [uri],
          title: "EnglishPilot 完整备份",
          dialogTitle: "保存或分享备份",
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Share canceled")
          return false;
        throw error;
      }
      return true;
    },
    async abort(id) {
      const path = paths.get(id);
      paths.delete(id);
      if (path)
        await Filesystem.rmdir({
          path: path.slice(0, path.lastIndexOf("/")),
          directory: Directory.Cache,
          recursive: true,
        });
    },
  };
}

export async function saveExport(
  blob: Blob,
  filename: string,
): Promise<ExportResult> {
  if (nativeBuild) {
    const bridge = (
      globalThis as typeof globalThis & { EnglishPilotBridge?: HarmonyBridge }
    ).EnglishPilotBridge;
    if (bridge) {
      const port = createHarmonyFilePort(bridge);
      try {
        return await exportInChunks(blob, filename, port);
      } finally {
        port.dispose();
      }
    }
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() === "ios")
      return exportInChunks(blob, filename, await iosExportPort());
    // Allows the standalone payload to be verified in a browser; native hosts
    // must register their device bridge before exposing the application.
    if (Capacitor.isNativePlatform())
      throw Error("设备文件接口未就绪，请重启应用后重试");
  }
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "downloaded";
}
