import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AudioEngine,
  createGroove,
  createPinkNoise,
  peakingResponse,
} from "../src/audio.ts";

function stats(data: Float32Array) {
  let sum = 0,
    energy = 0,
    peak = 0,
    differenceEnergy = 0;
  for (let i = 0; i < data.length; i++) {
    assert.ok(Number.isFinite(data[i]));
    sum += data[i];
    energy += data[i] ** 2;
    peak = Math.max(peak, Math.abs(data[i]));
    if (i) differenceEnergy += (data[i] - data[i - 1]) ** 2;
  }
  return {
    mean: sum / data.length,
    rms: Math.sqrt(energy / data.length),
    peak,
    differenceRms: Math.sqrt(differenceEnergy / (data.length - 1)),
  };
}

test("generated loops are deterministic, DC-free, and have comparable safe levels", () => {
  const pink = createPinkNoise(12000);
  const groove = createGroove(12000);
  assert.equal(pink.length, 48000);
  assert.equal(groove.length, 96000);
  assert.deepEqual(pink, createPinkNoise(12000));
  assert.deepEqual(groove, createGroove(12000));
  const levels = [stats(pink), stats(groove)];
  for (const level of levels) {
    assert.ok(Math.abs(level.mean) < 1e-7);
    assert.ok(level.peak <= 0.600001);
    assert.ok(level.rms > 0.08 && level.rms <= 0.160001);
  }
  assert.ok(levels[0].rms / levels[1].rms < 1.6);
  assert.ok(levels[1].rms / levels[0].rms < 1.6);
});

test("loop boundaries have no outsized discontinuity", () => {
  for (const make of [createPinkNoise, createGroove]) {
    const loop = make(16000);
    const level = stats(loop);
    assert.ok(
      Math.abs(loop[0] - loop[loop.length - 1]) < level.differenceRms * 4,
    );
  }
});

test("pink noise has substantially more low-frequency than high-frequency energy", () => {
  const data = createPinkNoise(16000);
  let low = 0,
    lowEnergy = 0,
    highEnergy = 0;
  // Simple one-pole split: this is a broad spectral sanity check, not a PSD estimator.
  const coefficient = 1 - Math.exp((-2 * Math.PI * 500) / 16000);
  for (const sample of data) {
    low += coefficient * (sample - low);
    lowEnergy += low * low;
    highEnergy += (sample - low) ** 2;
  }
  assert.ok(lowEnergy > highEnergy * 1.5);
});

test("peaking response is flat at zero gain and reaches the requested center gain", () => {
  const frequencies = new Float32Array([0, 100, 1000, 5000, 24000]);
  for (const db of peakingResponse(frequencies, 48000, 1000, 0, 1)) {
    assert.ok(Math.abs(db) < 1e-6);
  }
  for (const gain of [-15, -9, 9, 15]) {
    const response = peakingResponse(frequencies, 48000, 1000, gain, 1);
    assert.ok(Math.abs(response[2] - gain) < 1e-5);
    assert.ok(Math.abs(response[0]) < 1e-5);
    assert.ok(Math.abs(response[4]) < 1e-5);
    assert.ok(Math.abs(response[1]) < Math.abs(gain));
  }
});

test("higher Q narrows the peak, and cut and boost responses are reciprocal", () => {
  const frequencies = new Float32Array([500, 1000, 2000]);
  const wide = peakingResponse(frequencies, 48000, 1000, 9, 0.5);
  const narrow = peakingResponse(frequencies, 48000, 1000, 9, 4);
  const cut = peakingResponse(frequencies, 48000, 1000, -9, 4);
  assert.ok(narrow[0] < wide[0]);
  assert.ok(narrow[2] < wide[2]);
  for (let i = 0; i < frequencies.length; i++)
    assert.ok(Math.abs(narrow[i] + cut[i]) < 1e-5);
  const invalid = peakingResponse(
    new Float32Array([-1, 24001, NaN]),
    48000,
    1000,
    9,
    1,
  );
  assert.ok([...invalid].every(Number.isNaN));
});

test("engine supports ±15 dB and clamps gain beyond the learning range", () => {
  const engine = new AudioEngine();
  const center = new Float32Array([1000]);
  for (const [requested, expected] of [
    [15, 15],
    [-15, -15],
    [30, 15],
    [-30, -15],
  ]) {
    engine.setEQ(1000, requested, 1.4);
    assert.ok(Math.abs(engine.getResponse(center)[0] - expected) < 1e-5);
  }
  engine.dispose();
});

test("invalid synthesis parameters fail rather than allocating unbounded buffers", () => {
  for (const rate of [0, NaN, Infinity, 999, 400000]) {
    assert.throws(() => createPinkNoise(rate), RangeError);
    assert.throws(() => createGroove(rate), RangeError);
  }
  for (const duration of [0, -1, Infinity, NaN, 61]) {
    assert.throws(() => createPinkNoise(8000, duration), RangeError);
  }
});

test("engine previews EQ without initializing audio, exposes no FFT until started, and disposes idempotently", async () => {
  const engine = new AudioEngine();
  engine.setEQ(1000, 9, 1);
  engine.setMode("original");
  engine.setVolume(0.4);
  engine.setSource("groove");
  engine.pause();
  assert.deepEqual(
    engine.getResponse(new Float32Array([100, 1000])),
    peakingResponse(new Float32Array([100, 1000]), 48000, 1000, 9, 1),
  );
  assert.equal(engine.readSpectrum(), null);
  engine.dispose();
  assert.equal(engine.readSpectrum(), null);
  assert.deepEqual(
    engine.getResponse(new Float32Array([100, 1000])),
    new Float32Array(2),
  );
  engine.dispose();
  engine.pause();
  await assert.rejects(engine.start(), /disposed/);
});
