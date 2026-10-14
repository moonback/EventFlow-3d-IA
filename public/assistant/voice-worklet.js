/**
 * AudioWorklet de lecture de la voix d'Eric : file d'échantillons jouée sur le thread audio, donc
 * insensible aux ralentissements du thread principal (scène 3D). Chaque arrêt (file vide ou
 * interruption) se fait par un fondu sortant et chaque reprise par un fondu entrant : plus de
 * discontinuité brutale du signal, donc plus de « bips ». Après un arrêt, la lecture ne reprend
 * qu'une fois un petit tampon reconstitué (ou après un court délai), pour absorber la gigue réseau.
 */
const QUANTUM = 128;

class VoicePlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.readOffset = 0;
    this.buffered = 0;
    this.playing = false;
    this.fadeIn = false;
    this.flushing = false;
    this.waited = 0;
    this.prebuffer = Math.round(sampleRate * 0.12);
    this.maxWait = Math.round(sampleRate * 0.15);
    this.port.onmessage = (e) => {
      if (e.data === "flush") this.flush();
      else {
        this.chunks.push(e.data);
        this.buffered += e.data.length;
      }
    };
  }

  flush() {
    // Le quantum suivant fond le son restant vers le silence, puis la file est vidée
    this.flushing = true;
  }

  setPlaying(playing) {
    if (this.playing === playing) return;
    this.playing = playing;
    this.port.postMessage(playing);
  }

  read(out, count) {
    let written = 0;
    while (written < count && this.chunks.length > 0) {
      const chunk = this.chunks[0];
      const n = Math.min(count - written, chunk.length - this.readOffset);
      out.set(chunk.subarray(this.readOffset, this.readOffset + n), written);
      written += n;
      this.readOffset += n;
      if (this.readOffset === chunk.length) {
        this.chunks.shift();
        this.readOffset = 0;
      }
    }
    this.buffered -= written;
    return written;
  }

  clear() {
    this.chunks = [];
    this.readOffset = 0;
    this.buffered = 0;
    this.waited = 0;
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;

    if (!this.playing) {
      if (this.flushing) {
        this.flushing = false;
        this.clear();
      }
      if (this.buffered === 0) return true;
      this.waited += out.length;
      if (this.buffered < this.prebuffer && this.waited < this.maxWait) return true;
      this.waited = 0;
      this.fadeIn = true;
      this.setPlaying(true);
    }

    // Fin imminente (file presque vide) ou interruption : dernier quantum joué en fondu sortant
    const stopping = this.flushing || this.buffered < 2 * QUANTUM;
    const n = this.read(out, out.length);
    if (this.fadeIn) {
      for (let i = 0; i < n; i++) out[i] *= i / n;
      this.fadeIn = false;
    }
    if (stopping) {
      for (let i = 0; i < n; i++) out[i] *= 1 - (i + 1) / n;
      // Le reliquat éventuel (< 1 quantum, ~5 ms) est abandonné en cas d'interruption seulement
      if (this.flushing) {
        this.flushing = false;
        this.clear();
      }
      this.setPlaying(false);
    }
    return true;
  }
}

registerProcessor("voice-playback", VoicePlaybackProcessor);
