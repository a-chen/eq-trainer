export type SpectrumFrame = {
  bins: Float32Array;
  sampleRate: number;
  fftSize: number;
};

const FLOOR = -100;
const FREQUENCIES = [20, 100, 1000, 10000, 20000];
const DB_LINES = [0, -20, -40, -60, -80, -100];

/** Peak dBFS in each log band (20 Hz–20 kHz), not summed band energy.
 * Sub-bin bands interpolate linear power; -Infinity is genuine zero power.
 * Reuses output, whose length determines the number of display bands.
 */
export function aggregateSpectrum(
  bins: Float32Array,
  sampleRate: number,
  fftSize: number,
  output: Float32Array,
): Float32Array {
  output.fill(FLOOR);
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(fftSize) ||
    fftSize < 2 ||
    !bins.length
  )
    return output;
  const spacing = sampleRate / fftSize;
  const last = Math.min(bins.length - 1, Math.floor(fftSize / 2) - 1);
  const power = (index: number) =>
    Number.isFinite(bins[index]) ? 10 ** (Math.min(0, bins[index]) / 10) : 0;
  for (let bar = 0; bar < output.length; bar++) {
    const low = 20 * 1000 ** (bar / output.length);
    const high = 20 * 1000 ** ((bar + 1) / output.length);
    const first = Math.ceil(low / spacing);
    const end = Math.min(last, Math.ceil(high / spacing) - 1);
    let db = FLOOR;
    if (first <= end) {
      for (let bin = first; bin <= end; bin++) {
        if (Number.isFinite(bins[bin])) db = Math.max(db, bins[bin]);
      }
    } else {
      const position = Math.sqrt(low * high) / spacing;
      const left = Math.floor(position);
      if (left >= 0 && position <= last) {
        const fraction = position - left;
        const value =
          power(left) * (1 - fraction) +
          power(Math.min(last, left + 1)) * fraction;
        db = Math.max(FLOOR, 10 * Math.log10(value));
      }
    }
    output[bar] = Math.min(0, db);
  }
  return output;
}

export class SpectrumVisualizer {
  private canvas: HTMLCanvasElement;
  private read: () => SpectrumFrame | null;
  private context: CanvasRenderingContext2D | null;
  private bars = new Float32Array(0);
  private running = false;
  private raf: number | null = null;

  constructor(canvas: HTMLCanvasElement, read: () => SpectrumFrame | null) {
    this.canvas = canvas;
    this.read = read;
    this.context = canvas.getContext("2d");
    canvas.style.display = "block";
    canvas.style.width ||= "100%";
    this.draw(null);
  }

  start(): void {
    if (this.running || !this.context) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.draw(null);
  }

  private tick = (): void => {
    this.raf = null;
    if (!this.running) return;
    const frame = this.canvas.clientWidth > 0 ? this.read() : null;
    // A reader may stop the visualizer synchronously.
    if (!this.running) return;
    this.draw(frame);
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(frame: SpectrumFrame | null): void {
    const ctx = this.context;
    if (!ctx) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
    const pixelsX = Math.max(1, Math.round(width * ratio));
    const pixelsY = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width !== pixelsX) this.canvas.width = pixelsX;
    if (this.canvas.height !== pixelsY) this.canvas.height = pixelsY;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#141813";
    ctx.fillRect(0, 0, pixelsX / ratio, pixelsY / ratio);
    if (width < 80 || height < 50) return;
    const left = 39,
      top = 12,
      plotWidth = width - left - 15,
      bottom = height - 23;
    const plotHeight = bottom - top;
    const count = Math.min(90, Math.max(1, Math.floor(plotWidth / 5)));
    if (this.bars.length !== count) this.bars = new Float32Array(count);
    this.bars.fill(FLOOR);
    if (frame)
      aggregateSpectrum(frame.bins, frame.sampleRate, frame.fftSize, this.bars);
    ctx.fillStyle = "#789969";
    for (let i = 0; i < count; i++) {
      const barHeight = ((this.bars[i] - FLOOR) / -FLOOR) * plotHeight;
      if (barHeight > 0)
        ctx.fillRect(
          left + (i * plotWidth) / count,
          bottom - barHeight,
          Math.max(1, plotWidth / count - 1),
          barHeight,
        );
    }
    ctx.font = "9px monospace";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#303c2b";
    ctx.fillStyle = "#879b76";
    ctx.textAlign = "right";
    for (const db of DB_LINES) {
      const y = top + (-db / 100) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotWidth, y);
      ctx.stroke();
      ctx.fillText(String(db), left - 6, y + 3);
    }
    ctx.textAlign = "left";
    ctx.fillText("dBFS", 3, height - 7);
    ctx.textAlign = "center";
    for (const hz of FREQUENCIES) {
      const x = left + (Math.log(hz / 20) / Math.log(1000)) * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.fillText(hz >= 1000 ? `${hz / 1000}k` : String(hz), x, height - 7);
    }
  }
}
