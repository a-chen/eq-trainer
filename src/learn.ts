export const MIN_FREQUENCY = 20;
export const MAX_FREQUENCY = 20000;
const FREQUENCY_RATIO = MAX_FREQUENCY / MIN_FREQUENCY;

/** Logarithmic spacing gives every octave the same amount of screen space. */
export function positionToFrequency(position: number): number {
  const clamped = Number.isFinite(position)
    ? Math.min(1, Math.max(0, position))
    : 0;
  return MIN_FREQUENCY * FREQUENCY_RATIO ** clamped;
}

export function frequencyToPosition(frequency: number): number {
  const clamped = Number.isFinite(frequency)
    ? Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, frequency))
    : MIN_FREQUENCY;
  return Math.log(clamped / MIN_FREQUENCY) / Math.log(FREQUENCY_RATIO);
}
