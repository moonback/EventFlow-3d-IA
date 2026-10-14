import { SPEAKER_SAMPLE_RATE } from "@/features/assistant/protocol";
import { pcm16BytesToFloat } from "./pcm";

/**
 * Lecture de la voix d'Eric (PCM 16 bits 24 kHz) via un AudioWorklet (`voice-worklet.js`) : la file
 * est consommée sur le thread audio avec tampon anti-gigue et fondus à chaque arrêt/reprise, ce qui
 * supprime les « bips » des sous-remplissages. `flush()` coupe (en fondu très court) quand
 * l'utilisateur prend la parole et `level()` fournit l'amplitude courante pour animer l'avatar.
 */
export class VoicePlayer {
  // Contexte à 24 kHz : pas de rééchantillonnage côté page, le navigateur adapte à la sortie
  private readonly ctx = new AudioContext({ sampleRate: SPEAKER_SAMPLE_RATE });
  private readonly analyser: AnalyserNode;
  private readonly samples: Float32Array<ArrayBuffer>;
  private node: AudioWorkletNode | null = null;
  private ready: Promise<void> | null = null;
  /** Fragments reçus avant le chargement du worklet */
  private pending: Float32Array[] = [];
  /** Octet orphelin d'un fragment de longueur impaire, recollé au suivant */
  private carry: number | null = null;
  private playing = false;

  constructor() {
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.ctx.destination);
    this.samples = new Float32Array(this.analyser.fftSize);
  }

  /** À appeler depuis un geste utilisateur (politique d'autoplay des navigateurs). */
  async resume() {
    const resumed = this.ctx.state === "suspended" ? this.ctx.resume() : Promise.resolve();
    this.ready ??= this.ctx.audioWorklet.addModule("/assistant/voice-worklet.js").then(() => {
      if (this.ctx.state === "closed") return;
      const node = new AudioWorkletNode(this.ctx, "voice-playback", { numberOfInputs: 0, outputChannelCount: [1] });
      node.port.onmessage = (e: MessageEvent<boolean>) => {
        this.playing = e.data;
      };
      node.connect(this.analyser);
      this.node = node;
      for (const data of this.pending) this.post(data);
      this.pending = [];
    });
    await Promise.all([resumed, this.ready]);
  }

  enqueue(bytes: ArrayBuffer) {
    let input = new Uint8Array(bytes);
    if (this.carry !== null) {
      const joined = new Uint8Array(input.length + 1);
      joined[0] = this.carry;
      joined.set(input, 1);
      input = joined;
      this.carry = null;
    }
    if (input.length % 2 === 1) {
      this.carry = input[input.length - 1]!;
      input = input.subarray(0, input.length - 1);
    }
    const data = pcm16BytesToFloat(input.slice().buffer);
    if (data.length === 0) return;
    if (this.node) this.post(data);
    else this.pending.push(data);
  }

  private post(data: Float32Array) {
    this.node?.port.postMessage(data, [data.buffer]);
  }

  /** Coupe la voix en file d'attente (fondu de quelques millisecondes pour éviter le clic). */
  flush() {
    this.pending = [];
    this.carry = null;
    this.node?.port.postMessage("flush");
  }

  /** Eric est-il en train de parler (audio en cours de lecture) ? */
  get speaking() {
    return this.playing;
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
    this.node?.disconnect();
    void this.ctx.close();
  }
}
