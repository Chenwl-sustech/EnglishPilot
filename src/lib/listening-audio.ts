/** Decode in the current browser; learner audio stays on this device. */
export async function listeningAudioDuration(
  blob: Blob,
  signal?: AbortSignal,
): Promise<number> {
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob),
    audio = new Audio();
  let timer: ReturnType<typeof setTimeout> | undefined,
    abort = () => {};
  try {
    return await new Promise<number>((resolve, reject) => {
      abort = () =>
        reject(signal?.reason ?? new DOMException("已取消导入", "AbortError"));
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(
        () => reject(new Error("音频解码超时，请转换为 MP3 或 WAV 后重试")),
        15000,
      );
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0)
          resolve(audio.duration);
        else reject(new Error("音频时长无效，请转换为 MP3 或 WAV"));
      };
      audio.onerror = () =>
        reject(new Error("浏览器无法解码此音频，请转换为 MP3 或 WAV"));
      audio.preload = "metadata";
      audio.src = url;
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    audio.onloadedmetadata = null;
    audio.onerror = null;
    audio.src = "";
    URL.revokeObjectURL(url);
  }
}
