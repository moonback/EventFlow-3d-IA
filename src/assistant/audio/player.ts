import { SPEAKER_SAMPLE_RATE } from "@/features/assistant/protocol";
import { pcm16BytesToFloat } from "./pcm";

/** Avance de planification : absorbe la gigue réseau sans retarder perceptiblement la voix */
const LEAD_SECONDS = 0.05;

/**
 * Lecture de la voix d'Eric (PCM 16 bits 24 kHz) : les fragments sont planifiés bout à bout pour
 * éviter les « clics », `flush()` coupe net (l'utilisateur a pris la parole) et `level()` fournit
 * l'amplitude courante pour animer l'avatar.
 */
export class VoicePlayer {
  private readonly ctx: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly samples: Float32Array<ArrayBuffer>;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;

  constructor() {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.ctx.destination);
    this.samples = new Float32Array(this.analyser.fftSize);
  }

  /** À appeler depuis un geste utilisateur (politique d'autoplay des navigateurs). */
  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  enqueue(bytes: ArrayBuffer) {
    const data = pcm16BytesToFloat(bytes);
    if (data.length === 0) return;
    const buffer = this.ctx.createBuffer(1, data.length, SPEAKER_SAMPLE_RATE);
    buffer.copyToChannel(data, 0);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);
    const startAt = Math.max(this.nextTime, this.ctx.currentTime + LEAD_SECONDS);
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  /** Coupe immédiatement toute la voix en file d'attente. */
  flush() {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // déjà arrêtée
      }
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  /** Eric est-il en train de parler (audio en cours ou planifié) ? */
  get speaking() {
    return this.sources.size > 0 && this.ctx.currentTime < this.nextTime;
  }

  /** Amplitude RMS 0..1 de la voix en cours de lecture. */
  level() {
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const s of this.samples) sum += s * s;
    return Math.sqrt(sum / this.samples.length);
  }

  close() {
    this.flush();
    void this.ctx.close();
  }
}
