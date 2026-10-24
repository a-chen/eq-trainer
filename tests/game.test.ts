import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  EMPTY_STATS,
  createRound,
  nearestBand,
  evaluateGuess,
  recordResult,
  formatFrequency,
  frequencyRegion,
  loadStats,
} from "../src/game.ts";
import type { Difficulty } from "../src/game.ts";

test("rounds use difficulty-specific bands, gain, and Q without immediate repetition", () => {
  for (const difficulty of Object.keys(LEVELS) as Difficulty[]) {
    const level = LEVELS[difficulty];
    const a = createRound(difficulty, "boost", undefined, () => 0);
    const b = createRound(difficulty, "boost", a.frequency, () => 0);
    assert.equal(a.frequency, level.frequencies[0]);
    assert.notEqual(a.frequency, b.frequency);
    assert.ok((level.frequencies as readonly number[]).includes(b.frequency));
    assert.equal(a.gain, level.gain);
    assert.equal(a.q, level.q);
    assert.equal(createRound(difficulty, "cut").gain, -level.gain);
    assert.equal(
      createRound(difficulty, "mixed", undefined, () => 0).gain,
      -level.gain,
    );
    assert.equal(
      createRound(difficulty, "mixed", undefined, () => 0.99).gain,
      level.gain,
    );
  }
});

test("Train selection uses exactly the target bands and logarithmic snapping", () => {
  for (const difficulty of Object.keys(LEVELS) as Difficulty[]) {
    const bands = LEVELS[difficulty].frequencies;
    assert.equal(nearestBand(difficulty, 20), bands[0]);
    assert.equal(nearestBand(difficulty, 20000), bands.at(-1));
    for (const band of bands) assert.equal(nearestBand(difficulty, band), band);
    for (let i = 1; i < bands.length; i++) {
      const boundary = Math.sqrt(bands[i - 1] * bands[i]);
      assert.equal(nearestBand(difficulty, boundary * 0.999), bands[i - 1]);
      assert.equal(nearestBand(difficulty, boundary * 1.001), bands[i]);
    }
  }
});

test("random boundaries still select a valid band", () => {
  for (const n of [0, 0.1, 0.5, 0.999999, 1]) {
    assert.ok(
      LEVELS.beginner.frequencies.includes(
        createRound("beginner", "boost", undefined, () => n).frequency as 80,
      ),
    );
  }
});

test("exact guesses get 100 points; partial credit is symmetric in octaves", () => {
  const round = { frequency: 1000, gain: 6, q: 2 };
  assert.deepEqual(evaluateGuess(round, 1000), {
    target: 1000,
    guess: 1000,
    correct: true,
    points: 100,
  });
  assert.equal(
    evaluateGuess(round, 500).points,
    evaluateGuess(round, 2000).points,
  );
  assert.ok(
    evaluateGuess(round, 800).points > evaluateGuess(round, 500).points,
  );
  assert.equal(evaluateGuess(round, 1000.001).correct, true);
  for (const direction of [-1, 1]) {
    assert.equal(
      evaluateGuess(round, 1000 * 2 ** ((direction * 2) / 12)).correct,
      true,
    );
    assert.equal(
      evaluateGuess(round, 1000 * 2 ** ((direction * 2.01) / 12)).correct,
      false,
    );
  }
  for (const invalid of [NaN, Infinity, -Infinity, -1]) {
    assert.equal(evaluateGuess(round, invalid).points, 0);
    assert.equal(evaluateGuess(round, invalid).correct, false);
  }
  assert.equal(evaluateGuess(round, null).points, 0);
  assert.equal(evaluateGuess(round, 0).points, 0);
});

test("stats accumulate immutably; an incorrect answer resets only the current streak", () => {
  const round = { frequency: 1000, gain: 6, q: 2 };
  const correct = evaluateGuess(round, 1000);
  let stats = recordResult(EMPTY_STATS, correct);
  stats = recordResult(stats, correct);
  assert.equal(stats.streak, 2);
  assert.equal(stats.bestStreak, 2);
  stats = recordResult(stats, evaluateGuess(round, 500));
  assert.equal(stats.attempts, 3);
  assert.equal(stats.correct, 2);
  assert.equal(stats.streak, 0);
  assert.equal(stats.bestStreak, 2);
  assert.equal(stats.points, 214);
  assert.equal(EMPTY_STATS.attempts, 0);
});

test("saved stats tolerate unavailable, corrupt, missing, or inconsistent storage", () => {
  for (const value of [
    null,
    "",
    "{",
    "{}",
    "[]",
    "null",
    "3",
    JSON.stringify({ ...EMPTY_STATS, attempts: -1 }),
    JSON.stringify({ ...EMPTY_STATS, correct: 3 }),
    JSON.stringify({ ...EMPTY_STATS, points: 101 }),
    JSON.stringify({ ...EMPTY_STATS, attempts: 1.1 }),
    JSON.stringify({
      ...EMPTY_STATS,
      attempts: 2,
      correct: 1,
      streak: 1,
      bestStreak: 0,
    }),
  ]) {
    assert.deepEqual(loadStats({ getItem: () => value }), EMPTY_STATS);
  }
  assert.deepEqual(
    loadStats({
      getItem: () => {
        throw new Error("Blocked");
      },
    }),
    EMPTY_STATS,
  );
  const valid = {
    attempts: 10,
    correct: 4,
    points: 500,
    streak: 1,
    bestStreak: 3,
  };
  assert.deepEqual(loadStats({ getItem: () => JSON.stringify(valid) }), valid);
});

test("frequency labels and listening regions are human readable", () => {
  assert.equal(formatFrequency(80), "80 Hz");
  assert.equal(formatFrequency(1250), "1.25 kHz");
  assert.equal(formatFrequency(12500), "12.5 kHz");
  assert.equal(frequencyRegion(80).name, "Sub & low bass");
  assert.equal(frequencyRegion(160).name, "Bass");
  assert.equal(frequencyRegion(315).name, "Low mids");
  assert.equal(frequencyRegion(1000).name, "Midrange");
  assert.equal(frequencyRegion(4000).name, "Upper mids");
  assert.equal(frequencyRegion(8000).name, "Highs & air");
});
