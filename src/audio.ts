export type AudioSource = "pink" | "groove" | "upload";
export type ListenMode = "original" | "eq";

const FADE = 0.035;
const OUTPUT_LEVEL = 0.09; // Headroom for +15 dB EQ, including full-scale uploads.
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
const finite = (n: number, fallback: number) =>
  Number.isFinite(n) ? n : fallback;

function randomGenerator() {
  let state = 0x12345678;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x80000000 - 1;
  };
}

function normalize(data: Float32Array): Float32Array {
  let mean = 0;
  for (const sample of data) mean += sample;
  mean /= data.length;
  let peak = 0;
  let energy = 0;
  for (let i = 0; i < data.length; i++) {
    data[i] -= mean;
    peak = Math.max(peak, Math.abs(data[i]));
    energy += data[i] * data[i];
  }
  const scale = Math.min(
    0.16 / (Math.sqrt(energy / data.length) || 1),
    0.6 / (peak || 1),
  );
  for (let i = 0; i < data.length; i++) data[i] *= scale;
  return data;
}

function checkSampleRate(sampleRate: number) {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < 1000 ||
    sampleRate > 384000
  ) {
    throw new RangeError("Sample rate must be between 1000 and 384000 Hz.");
  }
}

/** Deterministic pink noise, with a crossfaded wrap and settled filter state. */
export function createPinkNoise(
  sampleRate: number,
  duration = 4,
): Float32Array {
  checkSampleRate(sampleRate);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 60) {
    throw new RangeError(
      "Duration must be greater than zero and at most 60 seconds.",
    );
  }
  const length = Math.max(2, Math.round(sampleRate * duration));
  const overlap = Math.min(
    Math.round(sampleRate * 0.05),
    Math.floor(length / 2),
  );
  const raw = new Float32Array(length + overlap);
  const random = randomGenerator();
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = -Math.round(sampleRate); i < raw.length; i++) {
    const white = random();
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    if (i >= 0) raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
  }
  // The end flows into the extra tail; gradually splice that tail into the head.
  for (let i = 0; i < overlap; i++) {
    const mix = i / overlap;
    raw[i] = raw[length + i] * (1 - mix) + raw[i] * mix;
  }
  return normalize(raw.slice(0, length));
}

/** Four bars at 120 BPM. Event tails wrap around, including across the loop seam. */
export function createGroove(sampleRate: number): Float32Array {
  checkSampleRate(sampleRate);
  const data = new Float32Array(Math.round(sampleRate * 8));
  const random = randomGenerator();
  const event = (
    beat: number,
    duration: number,
    sound: (t: number) => number,
  ) => {
    const start = Math.round(beat * 0.5 * sampleRate);
    const count = Math.round(duration * sampleRate);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      // A short attack and release remove discontinuities without dulling transients.
      const envelope = Math.min(1, t / 0.002, (duration - t) / 0.008);
      data[(start + i) % data.length] += sound(t) * envelope;
    }
  };
  const roots = [55, 65.4064, 49, 73.4162];
  for (let bar = 0; bar < 4; bar++) {
    const base = bar * 4;
    for (const beat of [0, 1.5, 2, 3.5]) {
      event(
        base + beat,
        0.38,
        (t) =>
          0.85 *
          Math.sin(
            2 * Math.PI * (48 * t + 1.875 * (1 - Math.exp(-t / 0.025))),
          ) *
          Math.exp(-t * 13),
      );
    }
    for (const beat of [1, 3]) {
      let previous = 0;
      event(base + beat, 0.22, (t) => {
        const noise = random();
        const high = noise - previous * 0.75;
        previous = noise;
        return (
          (high * 0.3 + Math.sin(2 * Math.PI * 180 * t) * 0.18) *
          Math.exp(-t * 23)
        );
      });
    }
    for (let step = 0; step < 8; step++) {
      let previous = 0;
      event(base + step * 0.5, 0.1, (t) => {
        const noise = random();
        const high = noise - previous;
        previous = noise;
        return high * (step % 2 ? 0.12 : 0.08) * Math.exp(-t * 65);
      });
    }
    for (const [index, beat] of [0, 0.75, 1.5, 2.5, 3.25].entries()) {
      const hz = roots[bar] * (index === 3 ? 2 : 1);
      event(base + beat, 0.29, (t) => {
        const phase = 2 * Math.PI * hz * t;
        return (
          0.38 *
          (Math.sin(phase) +
            0.25 * Math.sin(phase * 2) +
            0.12 * Math.sin(phase * 3)) *
          Math.exp(-t * 7)
        );
      });
    }
  }
  // Gentle synth saturation keeps drum transients from dwarfing the bass/noise level.
  for (let i = 0; i < data.length; i++) data[i] = Math.tanh(data[i] * 2);
  return normalize(data);
}

/** RBJ/Web Audio peaking response in dB, independent of the A/B listening mode. */
export function peakingResponse(
  frequencies: Float32Array,
  sampleRate: number,
  frequency: number,
  gain: number,
  q: number,
): Float32Array {
  const result = new Float32Array(frequencies.length);
  const a = 10 ** (gain / 40);
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const b = [1 + alpha * a, -2 * cos, 1 - alpha * a];
  const d = [1 + alpha / a, -2 * cos, 1 - alpha / a];
  for (let i = 0; i < frequencies.length; i++) {
    const hz = frequencies[i];
    if (!Number.isFinite(hz) || hz < 0 || hz > sampleRate / 2) {
      result[i] = NaN;
      continue;
    }
    const w = (2 * Math.PI * hz) / sampleRate;
    const power = (c: number[]) =>
      (c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w)) ** 2 +
      (c[1] * Math.sin(w) + c[2] * Math.sin(2 * w)) ** 2;
    result[i] = 10 * Math.log10(power(b) / power(d));
  }
  return result;
}

function ramp(param: AudioParam, value: number, now: number, duration = FADE) {
  if (typeof param.cancelAndHoldAtTime === "function")
    param.cancelAndHoldAtTime(now);
  else {
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
  }
  param.linearRampToValueAtTime(value, now + duration);
}

function createAnalyser(context: AudioContext): AnalyserNode {
  const analyser = context.createAnalyser();
  analyser.fftSize = 16384;
  analyser.smoothingTimeConstant = 0.75;
  analyser.minDecibels = -100;
  analyser.maxDecibels = 0;
  return analyser;
}

type Voice = {
  node: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  offset: number;
};

export class AudioEngine {
  private context?: AudioContext;
  private filter?: BiquadFilterNode;
  private master?: GainNode;
  private analyser?: AnalyserNode;
  private spectrumReadyAt = Infinity;
  private spectrumData?: {
    bins: Float32Array<ArrayBuffer>;
    sampleRate: number;
    fftSize: number;
  };
  private buffers = new Map<AudioSource, AudioBuffer>();
  private uploadScale = 1;
  private voices = new Set<Voice>();
  private current?: Voice;
  private source: AudioSource = "pink";
  private mode: ListenMode = "eq";
  private volume = 0.3;
  private frequency = 1000;
  private gain = 0;
  private q = 1;
  private playing = false;
  private disposed = false;
  private revision = 0;
  private uploadRevision = 0;
  private playbackOffset = 0;

  private initialize(): AudioContext {
    if (this.disposed) throw new Error("Audio engine has been disposed.");
    if (this.context) return this.context;
    const scope = globalThis as typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Constructor = scope.AudioContext ?? scope.webkitAudioContext;
    if (!Constructor)
      throw new Error("Web Audio is not supported in this browser.");
    const context = new Constructor();
    try {
      const filter = context.createBiquadFilter();
      const master = context.createGain();
      filter.type = "peaking";
      filter.frequency.value = Math.min(
        this.frequency,
        context.sampleRate * 0.49,
      );
      filter.Q.value = this.q;
      filter.gain.value = this.mode === "eq" ? this.gain : 0;
      master.gain.value = 0;
      const analyser = createAnalyser(context);
      filter.connect(analyser);
      analyser.connect(master);
      master.connect(context.destination);
      this.analyser = analyser;
      this.spectrumReadyAt =
        context.currentTime + FADE + analyser.fftSize / context.sampleRate;
      this.spectrumData = {
        bins: new Float32Array(analyser.frequencyBinCount),
        sampleRate: context.sampleRate,
        fftSize: analyser.fftSize,
      };
      this.context = context;
      this.filter = filter;
      this.master = master;
      return context;
    } catch (error) {
      void context.close().catch(() => {});
      throw error;
    }
  }

  async start(): Promise<void> {
    const revision = ++this.revision;
    this.playing = true;
    try {
      // Creation and resume happen before the first await, inside the user gesture.
      const context = this.initialize();
      await context.resume();
      if (this.disposed || revision !== this.revision || !this.playing) return;
      if (context.state !== "running")
        throw new Error("Audio could not start. Try pressing Play again.");
      if (!this.current) this.switchVoice();
      ramp(this.master!.gain, this.volume * OUTPUT_LEVEL, context.currentTime);
    } catch (error) {
      if (revision === this.revision) this.pause();
      throw error;
    }
  }

  pause(): void {
    this.playing = false;
    ++this.revision;
    if (!this.context || this.disposed) return;
    const now = this.context.currentTime;
    if (this.current) {
      this.playbackOffset =
        (this.current.offset + Math.max(0, now - this.current.startedAt)) %
        this.current.node.buffer!.duration;
    }
    ramp(this.master!.gain, 0, now);
    this.retireCurrent(now);
  }

  setMode(mode: ListenMode): void {
    this.mode = mode;
    if (this.context && !this.disposed) {
      ramp(
        this.filter!.gain,
        mode === "eq" ? this.gain : 0,
        this.context.currentTime,
      );
    }
  }

  setEQ(frequency: number, gain: number, q: number): void {
    this.frequency = clamp(finite(frequency, 1000), 20, 20000);
    this.gain = clamp(finite(gain, 0), -15, 15);
    this.q = clamp(finite(q, 1), 0.1, 18);
    if (this.context && !this.disposed) {
      const now = this.context.currentTime;
      ramp(
        this.filter!.frequency,
        Math.min(this.frequency, this.context.sampleRate * 0.49),
        now,
      );
      ramp(this.filter!.Q, this.q, now);
      ramp(this.filter!.gain, this.mode === "eq" ? this.gain : 0, now);
    }
  }

  setVolume(value: number): void {
    this.volume = clamp(finite(value, 0), 0, 1);
    if (this.context && this.playing && !this.disposed) {
      ramp(
        this.master!.gain,
        this.volume * OUTPUT_LEVEL,
        this.context.currentTime,
      );
    }
  }

  setSource(source: AudioSource): void {
    if (this.disposed) return;
    if (source === "upload" && !this.buffers.has("upload")) return;
    const replacedUpload =
      source === "upload" &&
      this.current &&
      this.current.node.buffer !== this.buffers.get("upload");
    if (source === this.source && !replacedUpload) return;
    this.source = source;
    this.playbackOffset = 0;
    if (this.playing && this.context?.state === "running") this.switchVoice();
  }

  async loadFile(file: File, activate = true): Promise<void> {
    const context = this.initialize();
    const revision = ++this.uploadRevision;
    const bytes = await file.arrayBuffer();
    if (this.disposed || revision !== this.uploadRevision) return;
    const buffer = await context.decodeAudioData(bytes);
    if (this.disposed || revision !== this.uploadRevision) return;
    if (!buffer.length || !buffer.numberOfChannels)
      throw new Error("The audio file is empty.");
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      for (const sample of buffer.getChannelData(channel)) {
        if (!Number.isFinite(sample))
          throw new Error("The audio file contains invalid samples.");
        peak = Math.max(peak, Math.abs(sample));
      }
    }
    // Keep quiet recordings quiet; attenuate hot files without mutating decoded data.
    this.uploadScale = peak > 0.6 ? 0.6 / peak : 1;
    this.buffers.set("upload", buffer);
    if (this.source === "upload") this.playbackOffset = 0;
    if (activate) this.setSource("upload");
  }

  getResponse(frequencies: Float32Array): Float32Array {
    if (this.disposed) return new Float32Array(frequencies.length);
    // Preview the configured curve without opening an AudioContext. Once audio
    // starts, use the device's actual sample rate for an exact response.
    const sampleRate = this.context?.sampleRate ?? 48000;
    return peakingResponse(
      frequencies,
      sampleRate,
      Math.min(this.frequency, sampleRate * 0.49),
      this.gain,
      this.q,
    );
  }

  get maxFrequency(): number {
    return Math.min(
      20000,
      Math.floor((this.context?.sampleRate ?? 48000) * 0.49),
    );
  }

  /** Discard Train's FFT window/history; only expose a full window of fresh Learn audio. */
  resetSpectrum(): void {
    if (
      !this.context ||
      !this.filter ||
      !this.master ||
      !this.analyser ||
      this.disposed
    )
      return;
    const analyser = createAnalyser(this.context);
    this.filter.disconnect(this.analyser);
    this.analyser.disconnect();
    this.filter.connect(analyser);
    analyser.connect(this.master);
    this.analyser = analyser;
    this.spectrumData = {
      bins: new Float32Array(analyser.frequencyBinCount),
      sampleRate: this.context.sampleRate,
      fftSize: analyser.fftSize,
    };
    this.spectrumReadyAt =
      this.context.currentTime +
      FADE +
      analyser.fftSize / this.context.sampleRate;
  }

  /** Real post-EQ FFT data, before the user volume control. Never initializes audio. */
  readSpectrum(): {
    bins: Float32Array;
    sampleRate: number;
    fftSize: number;
  } | null {
    if (
      !this.analyser ||
      !this.spectrumData ||
      this.disposed ||
      !this.context ||
      this.context.currentTime < this.spectrumReadyAt
    )
      return null;
    this.analyser.getFloatFrequencyData(this.spectrumData.bins);
    return this.spectrumData;
  }

  private bufferForSource(): AudioBuffer {
    const cached = this.buffers.get(this.source);
    if (cached) return cached;
    const context = this.context!;
    const samples =
      this.source === "groove"
        ? createGroove(context.sampleRate)
        : createPinkNoise(context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    this.buffers.set(this.source, buffer);
    return buffer;
  }

  private switchVoice(): void {
    const context = this.context!;
    // Synthesis can take time: finish it before scheduling the crossfade.
    const buffer = this.bufferForSource();
    const now = context.currentTime;
    const node = context.createBufferSource();
    const gain = context.createGain();
    node.buffer = buffer;
    node.loop = true;
    gain.gain.value = 0;
    node.connect(gain);
    gain.connect(this.filter!);
    const offset = this.playbackOffset % buffer.duration;
    const voice = { node, gain, startedAt: now, offset };
    this.voices.add(voice);
    node.onended = () => {
      node.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    };
    this.retireCurrent(now);
    this.current = voice;
    node.start(now, offset);
    ramp(gain.gain, this.source === "upload" ? this.uploadScale : 1, now);
  }

  private retireCurrent(now: number): void {
    if (!this.current) return;
    ramp(this.current.gain.gain, 0, now);
    this.current.node.stop(now + FADE + 0.005);
    this.current = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    ++this.uploadRevision;
    const context = this.context;
    if (!context) return;
    // Allow the pause ramp to finish before disconnecting/closing the graph.
    const cleanup = () => {
      for (const voice of this.voices) {
        voice.node.onended = null;
        try {
          voice.node.stop();
        } catch {
          /* Already stopped. */
        }
        voice.node.disconnect();
        voice.gain.disconnect();
      }
      this.voices.clear();
      this.buffers.clear();
      this.filter?.disconnect();
      this.analyser?.disconnect();
      this.master?.disconnect();
      void context.close().catch(() => {});
    };
    if (context.state === "running") setTimeout(cleanup, (FADE + 0.02) * 1000);
    else cleanup();
  }
}
