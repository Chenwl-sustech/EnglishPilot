import { expect, test } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { encodeBackup, decodeBackup } from "../src/lib/backup";
import { defaultState } from "../src/lib/engine";

test("full backup keeps both audio stores intact through persistence", async () => {
  const originals = [
    new Uint8Array([0, 255, 7, 64, 128]),
    new Uint8Array([99, 33, 0, 234, 56, 1]),
  ];
  const rows = originals.map((bytes, index) => ({
    id: `audio-${index}`,
    date: "2026-10-23",
    title: `Audio ${index}`,
    blob: new Blob([bytes], { type: "audio/mp4" }),
  }));
  const file = new File(
    [await encodeBackup(defaultState("2026-10-23"), [rows[0]], [rows[1]])],
    "test.epbackup",
  );
  const contents = await decodeBackup(file);
  const request = indexedDB.open("backup-audio-test", 1);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () =>
      request.result.createObjectStore("audio", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const decoded = [...contents.recordings!, ...contents.listeningAudio!];
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("audio", "readwrite");
      for (const row of decoded) transaction.objectStore("audio").put(row);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    for (const [index, row] of decoded.entries()) {
      const saved = await new Promise<(typeof rows)[number]>(
        (resolve, reject) => {
          const get = database
            .transaction("audio", "readonly")
            .objectStore("audio")
            .get(row.id);
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        },
      );
      expect(saved.blob.type).toBe(row.blob.type);
      expect(new Uint8Array(await saved.blob.arrayBuffer())).toEqual(
        originals[index],
      );
    }
  } finally {
    database.close();
    indexedDB.deleteDatabase("backup-audio-test");
  }
});

test("corrupted audio is rejected before restoration", async () => {
  const row = {
    id: "audio",
    date: "2026-10-23",
    title: "Audio",
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mp4" }),
  };
  const backup = new Uint8Array(
    await (await encodeBackup(defaultState("2026-10-23"), [row])).arrayBuffer(),
  );
  backup[backup.length - 1] ^= 0xff;
  await expect(decodeBackup(new Blob([backup]))).rejects.toThrow(
    "录音校验失败",
  );
});
