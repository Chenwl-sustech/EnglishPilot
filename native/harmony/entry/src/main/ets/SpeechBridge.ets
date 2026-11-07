import { textToSpeech } from '@kit.CoreSpeechKit';
import { util, taskpool } from '@kit.ArkTS';
import { pcm } from 'libenglishvoice.so';
import { PcmWave } from './PcmWave';
import { hilog } from '@kit.PerformanceAnalysisKit';

@Concurrent
function synthesizeSegment(text: string): ArrayBuffer {
  return pcm(text);
}

interface VoiceStatus { ready: boolean; downloadable: boolean; downloading: boolean; message: string; }
interface SpeechJob { cancel: () => void; }

/** Offline Core Speech Kit only. Text is never sent to a speech server. */
export class SpeechBridge {
  private jobs: Map<string, SpeechJob> = new Map();
  private downloading = false;
  private downloadMessage = '';
  private download: textToSpeech.DownloadResponse | null = null;
  private closed = false;

  async status(): Promise<string> {
    if (this.downloading) return JSON.stringify({ ready: false, downloadable: false, downloading: true, message: this.downloadMessage } as VoiceStatus);
    let ready = false, downloadable = false;
    let probeEngine = true;
    if (typeof textToSpeech.listVoices === 'function') {
      try {
        const voices = await textToSpeech.listVoices({ requestId: util.generateRandomUUID().replace(/-/g, ''), online: 1 });
        const english = voices.find((voice: textToSpeech.VoiceInfo) => voice.person === 8);
        probeEngine = english?.status === 'INSTALLED';
        downloadable = english?.status === 'GA' && typeof textToSpeech.downloadVoice === 'function';
      } catch {}
    }
    if (probeEngine) {
      try {
        const engine = await textToSpeech.createEngine({ language: 'en-US', person: 8, online: 1 });
        engine.shutdown();
        ready = true;
      } catch {}
    }
    const result: VoiceStatus = { ready, downloadable, downloading: this.downloading,
      message: ready ? '鸿蒙本地英语声音已就绪' : this.downloadMessage || '尚未检测到鸿蒙本地英语声音。请下载系统英语声音后刷新；朗读文本留在本机。' };
    return JSON.stringify(result);
  }

  async install(): Promise<boolean> {
    if (this.closed || this.downloading) return false;
    const status = JSON.parse(await this.status()) as VoiceStatus;
    if (this.closed || this.downloading) return false;
    if (status.ready) return true;
    if (!status.downloadable) throw new Error('English voice unavailable');
    this.downloading = true; this.downloadMessage = '正在下载鸿蒙系统英语声音…';
    try { textToSpeech.downloadVoice({ requestId: util.generateRandomUUID().replace(/-/g, ''), language: 'en-US', person: 8, style: 'interaction-broadcast' }, (error, response) => {
      if (error || this.closed) { if (error) hilog.error(0x0001, 'EnglishPilotSpeech', 'Voice download setup error %{public}d', error.code); this.downloading = false; this.downloadMessage = '系统声音下载未完成，请检查网络后重试。'; return; }
      this.download = response;
      const cleanup = (): void => {
        response.off('complete'); response.off('error'); response.off('cancel');
        this.download = null; this.downloading = false;
      };
      response.on('complete', () => { cleanup(); this.downloadMessage = ''; });
      response.on('error', (error) => { hilog.error(0x0001, 'EnglishPilotSpeech', 'Voice download error %{public}d', error.code); cleanup(); this.downloadMessage = '系统声音下载失败，请检查网络后重试。'; });
      response.on('cancel', () => { cleanup(); this.downloadMessage = '系统声音下载已取消，可重新下载。'; });
    }); } catch { this.downloading = false; this.downloadMessage = '系统声音下载未启动，请刷新后重试。'; throw new Error('Voice download not started'); }
    return true;
  }

  async render(id: string, text: string, voice: string): Promise<string> {
    if (this.closed || this.jobs.size || typeof text !== 'string' || !text.trim() || text.length > 10000) throw new Error('Invalid speech request');
    if (voice === 'harmony:flite-slt') return this.renderBundled(id, text);
    if (voice !== 'harmony:8') throw new Error('Unknown voice');
    return new Promise<string>((resolve, reject) => {
      let engine: textToSpeech.TextToSpeechEngine | null = null;
      let ended = false, sampleRate = 16000, sampleBit = 16, channels = 1;
      const pcm = new PcmWave();
      const finish = (error: boolean): void => {
        if (ended) return;
        ended = true; clearTimeout(timer); this.jobs.delete(id);
        if (engine) { try { engine.stop(); engine.shutdown(); } catch {} }
        if (error) { reject(new Error('Offline synthesis failed')); return; }
        try { resolve(new util.Base64Helper().encodeToStringSync(new Uint8Array(pcm.finish(sampleRate, sampleBit, channels)))); }
        catch { hilog.error(0x0001, 'EnglishPilotSpeech', 'Incomplete PCM stream'); reject(new Error('Incomplete speech')); }
      };
      const timer = setTimeout(() => finish(true), 75000);
      this.jobs.set(id, { cancel: () => finish(true) });
      textToSpeech.createEngine({ language: 'en-US', person: 8, online: 1 }).then((created: textToSpeech.TextToSpeechEngine) => {
        if (ended) { created.shutdown(); return; }
        engine = created;
        const requestId = id.replace(/-/g, '');
        created.setListener({
          onStart: (rid: string, info: textToSpeech.StartResponse): void => {
            if (rid !== requestId || ended) return;
            sampleRate = info.sampleRate; sampleBit = info.sampleBit; channels = info.audioChannel;
            if (info.audioType !== 'pcm') finish(true);
          },
          onData: (rid: string, data: ArrayBuffer, info: textToSpeech.SynthesisResponse): void => {
            if (rid !== requestId || ended) return;
            try { if (info.audioType !== 'pcm') throw new Error('Invalid format'); pcm.add(info.sequence, data); }
            catch { hilog.error(0x0001, 'EnglishPilotSpeech', 'Invalid PCM packet %{public}d bytes %{public}d', info.sequence, data.byteLength); finish(true); }
          },
          onComplete: (rid: string, info: textToSpeech.CompleteResponse): void => {
            if (rid === requestId && info.type === 0) finish(false);
          },
          onStop: (rid: string): void => { if (rid === requestId) finish(true); },
          onError: (rid: string, code: number): void => { if (rid === requestId) { hilog.error(0x0001, 'EnglishPilotSpeech', 'Synthesis error %{public}d', code); finish(true); } }
        });
        created.speak(text, { requestId, extraParams: { playType: 0, soundChannel: 1, audioType: 'pcm', speed: 1, volume: 1, pitch: 1, queueMode: 0, languageContext: 'en-US' } });
      }).catch(() => finish(true));
    });
  }

  private async renderBundled(id: string, text: string): Promise<string> {
    let canceled = false;
    const deadline = Date.now() + 75000;
    const wave = new PcmWave();
    this.jobs.set(id, { cancel: () => { canceled = true; } });
    try {
      let remaining = text.trim();
      let sequence = 0;
      while (remaining.length > 0) {
        if (canceled || Date.now() >= deadline) throw new Error('Speech canceled');
        let end = Math.min(remaining.length, 240);
        if (end < remaining.length) {
          const boundary = remaining.slice(0, end).lastIndexOf(' ');
          if (boundary > 0) end = boundary;
        }
        const part = remaining.slice(0, end);
        remaining = remaining.slice(end).trimStart();
        const samples = await taskpool.execute(synthesizeSegment, part) as ArrayBuffer;
        if (canceled || Date.now() >= deadline) throw new Error('Speech canceled');
        wave.add(sequence++, samples);
      }
      return new util.Base64Helper().encodeToStringSync(new Uint8Array(wave.finish(16000, 16, 1)));
    } finally {
      this.jobs.delete(id);
    }
  }

  cancel(id: string): void { this.jobs.get(id)?.cancel(); }
  dispose(): void {
    this.closed = true;
    this.jobs.forEach((job: SpeechJob) => job.cancel());
    if (this.download) { this.download.off('complete'); this.download.off('error'); this.download.off('cancel'); this.download = null; }
  }
}
