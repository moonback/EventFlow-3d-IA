import { MIC_SAMPLE_RATE } from "@/features/assistant/protocol";
import { downsample, floatToPcm16, pcm16ToBytes, rms } from "./pcm";

export interface Microphone {
  stop(): void;
}

/**
 * Capture le micro (annulation d'écho indispensable : sinon Eric s'entend lui-même) et livre des
 * trames PCM 16 bits 16 kHz prêtes à envoyer, avec le niveau sonore pour l'indicateur.
 */
export async function startMicrophone(onFrame: (pcm: ArrayBuffer, level: number) => void): Promise<Microphone> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  try {
    await ctx.audioWorklet.addModule("/assistant/mic-worklet.js");
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "mic-capture");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const samples = downsample(e.data, ctx.sampleRate, MIC_SAMPLE_RATE);
      onFrame(pcm16ToBytes(floatToPcm16(samples)), rms(e.data));
    };
    source.connect(node);
    return {
      stop() {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        for (const track of stream.getTracks()) track.stop();
        void ctx.close();
      },
    };
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    void ctx.close();
    throw error;
  }
}
