/** Core Speech Kit delivers PCM packets out of order across IPC. */
export class PcmWave {
  private chunks: Map<number, Uint8Array> = new Map();
  private size = 0;
  private limit: number;
  constructor(limit = 8 * 1024 * 1024) {
    this.limit = limit;
  }
  add(sequence: number, data: ArrayBuffer): void {
    if (
      !Number.isInteger(sequence) ||
      sequence < 0 ||
      sequence > 100000 ||
      this.chunks.has(sequence) ||
      data.byteLength === 0 ||
      this.size + data.byteLength > this.limit
    )
      throw new Error("Invalid speech data");
    this.chunks.set(sequence, new Uint8Array(data.slice(0)));
    this.size += data.byteLength;
  }
  finish(sampleRate: number, sampleBit: number, channels: number): ArrayBuffer {
    if (
      !this.size ||
      sampleBit !== 16 ||
      channels !== 1 ||
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 48000 ||
      this.size % 2
    )
      throw new Error("Invalid speech format");
    const wav = new ArrayBuffer(44 + this.size);
    const view = new DataView(wav);
    const bytes = new Uint8Array(wav);
    const label = (offset: number, text: string): void => {
      for (let i = 0; i < text.length; i++)
        bytes[offset + i] = text.charCodeAt(i);
    };
    label(0, "RIFF");
    view.setUint32(4, 36 + this.size, true);
    label(8, "WAVE");
    label(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, sampleBit, true);
    label(36, "data");
    view.setUint32(40, this.size, true);
    let offset = 44;
    for (let i = 0; i < this.chunks.size; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) throw new Error("Incomplete speech data");
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return wav;
  }
}
