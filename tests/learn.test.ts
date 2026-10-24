import { test } from "node:test";
import assert from "node:assert/strict";
import { positionToFrequency, frequencyToPosition } from "../src/learn.ts";

test("graph mapping covers the audible range with logarithmic octave spacing", () => {
  assert.equal(positionToFrequency(0), 20);
  assert.equal(positionToFrequency(1), 20000);
  assert.ok(Math.abs(positionToFrequency(0.5) - Math.sqrt(20 * 20000)) < 1e-8);
  for (const frequency of [20, 40, 80, 160, 315, 1000, 12500, 20000]) {
    assert.ok(
      Math.abs(
        positionToFrequency(frequencyToPosition(frequency)) - frequency,
      ) < 1e-8,
    );
  }
  assert.ok(
    Math.abs(
      frequencyToPosition(1000) -
        frequencyToPosition(500) -
        (frequencyToPosition(200) - frequencyToPosition(100)),
    ) < 1e-10,
  );
});

test("dragging outside the graph clamps to valid frequencies", () => {
  for (const position of [-100, -0.5, NaN, Infinity])
    assert.equal(positionToFrequency(position), 20);
  assert.equal(positionToFrequency(1.5), 20000);
  assert.equal(frequencyToPosition(-50), 0);
  assert.equal(frequencyToPosition(NaN), 0);
  assert.equal(frequencyToPosition(30000), 1);
});
