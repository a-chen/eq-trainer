import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateSpectrum, SpectrumVisualizer } from "../src/visualizer.ts";

const bandFor = (hz: number, count = 90) =>
  Math.floor((Math.log(hz / 20) / Math.log(1000)) * count);

test("flat FFT levels retain their actual dBFS without band-energy inflation", () => {
  const bins = new Float32Array(2048).fill(-42);
  const output = new Float32Array(90);
  assert.equal(aggregateSpectrum(bins, 48000, 4096, output), output);
  for (const db of output) assert.ok(Math.abs(db + 42) < 1e-5);
  bins.fill(3);
  assert.ok(
    aggregateSpectrum(bins, 48000, 4096, output).every((db) => db === 0),
  );
  bins.fill(-120);
  assert.ok(
    aggregateSpectrum(bins, 48000, 4096, output).every((db) => db === -100),
  );
});

test("silence and invalid input clear reused output to baseline", () => {
  const output = new Float32Array(90).fill(-12);
  for (const value of [-Infinity, NaN, Infinity]) {
    const bins = new Float32Array(1024).fill(value);
    assert.ok(
      aggregateSpectrum(bins, 48000, 2048, output).every((db) => db === -100),
    );
  }
  for (const [rate, size] of [
    [0, 2048],
    [NaN, 2048],
    [48000, 0],
  ]) {
    output.fill(-12);
    assert.ok(
      aggregateSpectrum(new Float32Array(1024), rate, size, output).every(
        (db) => db === -100,
      ),
    );
  }
  assert.ok(
    aggregateSpectrum(new Float32Array(), 48000, 2048, output).every(
      (db) => db === -100,
    ),
  );
});

test("FFT peaks land in logarithmic frequency bands at different sample rates", () => {
  for (const sampleRate of [32000, 48000, 96000]) {
    const fftSize = 8192;
    const bins = new Float32Array(fftSize / 2).fill(-Infinity);
    for (const hz of [1000, 4000, 12000]) {
      bins.fill(-Infinity);
      const bin = Math.round((hz * fftSize) / sampleRate);
      bins[bin] = -18;
      const output = aggregateSpectrum(
        bins,
        sampleRate,
        fftSize,
        new Float32Array(90),
      );
      const expected = bandFor((bin * sampleRate) / fftSize);
      assert.equal(output[expected], -18);
      assert.equal(output.filter((db) => db > -100).length, 1);
    }
  }
});

test("sub-bin low frequencies interpolate power without fabricating a silence floor", () => {
  const bins = new Float32Array(1024).fill(-Infinity);
  bins[1] = -20;
  const output = aggregateSpectrum(bins, 48000, 2048, new Float32Array(90));
  const center = 20 * 1000 ** (0.5 / output.length);
  const expected = 10 * Math.log10((0.01 * center) / (48000 / 2048));
  assert.ok(Math.abs(output[0] - expected) < 1e-5);
  bins.fill(-Infinity);
  aggregateSpectrum(bins, 48000, 2048, output);
  assert.equal(output[0], -100);
});

test("frequencies beyond available bins/Nyquist stay empty", () => {
  const output = aggregateSpectrum(
    new Float32Array(512).fill(-30),
    16000,
    1024,
    new Float32Array(90),
  );
  for (let i = bandFor(9000); i < output.length; i++)
    assert.equal(output[i], -100);
});

test("renderer has one RAF loop, scales backing pixels, and clears on stop/null", (t) => {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const previousRaf = Object.getOwnPropertyDescriptor(
    globalThis,
    "requestAnimationFrame",
  );
  const previousCancel = Object.getOwnPropertyDescriptor(
    globalThis,
    "cancelAnimationFrame",
  );
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callbacks.set(++nextId, callback);
      return nextId;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (id: number) => {
      callbacks.delete(id);
    },
  });
  t.after(() => {
    if (previousRaf)
      Object.defineProperty(globalThis, "requestAnimationFrame", previousRaf);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    if (previousCancel)
      Object.defineProperty(globalThis, "cancelAnimationFrame", previousCancel);
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  });
  const previousDpr = Object.getOwnPropertyDescriptor(
    globalThis,
    "devicePixelRatio",
  );
  Object.defineProperty(globalThis, "devicePixelRatio", {
    configurable: true,
    value: 2,
  });
  t.after(() => {
    if (previousDpr)
      Object.defineProperty(globalThis, "devicePixelRatio", previousDpr);
    else Reflect.deleteProperty(globalThis, "devicePixelRatio");
  });
  let spectrumRects = 0;
  const ctx = {
    fillStyle: "",
    fillRect() {
      if (this.fillStyle === "#789969") spectrumRects++;
    },
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillText() {},
  };
  const canvas = {
    style: {},
    clientWidth: 480,
    clientHeight: 160,
    width: 0,
    height: 0,
    getContext: () => ctx,
  };
  let reads = 0;
  let silent = false;
  const visualizer = new SpectrumVisualizer(
    canvas as unknown as HTMLCanvasElement,
    () => {
      reads++;
      return silent
        ? null
        : {
            bins: new Float32Array(1024).fill(-30),
            sampleRate: 48000,
            fftSize: 2048,
          };
    },
  );
  const step = () => {
    const [id, callback] = callbacks.entries().next().value!;
    callbacks.delete(id);
    callback(0);
  };
  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 320);
  assert.equal(spectrumRects, 0);
  visualizer.start();
  visualizer.start();
  assert.equal(callbacks.size, 1);
  step();
  assert.ok(spectrumRects > 0 && spectrumRects <= 90);
  assert.equal(callbacks.size, 1);
  spectrumRects = 0;
  silent = true;
  step();
  assert.equal(spectrumRects, 0);
  canvas.clientWidth = 0;
  const previousReads = reads;
  step();
  assert.equal(reads, previousReads);
  assert.equal(canvas.width, 1);
  canvas.clientWidth = 320;
  visualizer.stop();
  visualizer.stop();
  assert.equal(canvas.width, 640);
  assert.equal(spectrumRects, 0);
  assert.equal(callbacks.size, 0);
  visualizer.start();
  assert.equal(callbacks.size, 1);
  visualizer.stop();
  assert.equal(callbacks.size, 0);
});
