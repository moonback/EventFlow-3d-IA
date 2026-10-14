/** Conversions audio pures (testées unitairement) entre Web Audio (Float32) et PCM 16 bits. */

/**
 * Sous-échantillonne un signal mono vers `toRate` en moyennant les échantillons de chaque
 * intervalle (filtre passe-bas rudimentaire, suffisant pour la voix).
 */
export function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate === fromRate) return input;
  if (toRate > fromRate) throw new Error("Le suréchantillonnage n'est pas pris en charge");
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** Float32 [-1, 1] → PCM 16 bits signé (valeurs écrêtées). */
export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** PCM 16 bits little-endian (octets bruts) → Float32 [-1, 1]. */
export function pcm16BytesToFloat(bytes: ArrayBuffer): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes);
  const out = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

/** Int16Array → octets little-endian (indépendant de l'architecture). */
export function pcm16ToBytes(samples: Int16Array): ArrayBuffer {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i]!, true);
  return buf;
}

/** Niveau RMS 0..1 d'un bloc d'échantillons. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}
