export type Difficulty = "beginner" | "intermediate" | "advanced";
export type ChangeType = "boost" | "cut" | "mixed";

export const LEVELS = {
  beginner: {
    label: "Beginner",
    gain: 15,
    q: 1.4,
    frequencies: [80, 160, 315, 630, 1250, 2500, 5000],
  },
  intermediate: {
    label: "Intermediate",
    gain: 9,
    q: 2,
    frequencies: [63, 125, 250, 500, 1000, 2000, 3150, 4000, 6300, 8000],
  },
  advanced: {
    label: "Advanced",
    gain: 6,
    q: 3,
    frequencies: [
      40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 8000,
      10000, 12500,
    ],
  },
} as const;

/** Snap to the closest available target on the logarithmic frequency axis. */
export function nearestBand(difficulty: Difficulty, frequency: number): number {
  return LEVELS[difficulty].frequencies.reduce<number>(
    (nearest, band) =>
      Math.abs(Math.log2(frequency / band)) <
      Math.abs(Math.log2(frequency / nearest))
        ? band
        : nearest,
    LEVELS[difficulty].frequencies[0],
  );
}

export interface Round {
  frequency: number;
  gain: number;
  q: number;
}
export interface Result {
  target: number;
  guess: number | null;
  correct: boolean;
  points: number;
}
export interface Stats {
  attempts: number;
  correct: number;
  points: number;
  streak: number;
  bestStreak: number;
}
export const EMPTY_STATS: Stats = {
  attempts: 0,
  correct: 0,
  points: 0,
  streak: 0,
  bestStreak: 0,
};

export function createRound(
  difficulty: Difficulty,
  change: ChangeType,
  previous?: number,
  random = Math.random,
): Round {
  const level = LEVELS[difficulty];
  const choices = level.frequencies.filter((f) => f !== previous);
  const frequency =
    choices[
      Math.min(
        choices.length - 1,
        Math.max(0, Math.floor(random() * choices.length)),
      )
    ];
  const sign =
    change === "cut" || (change === "mixed" && random() < 0.5) ? -1 : 1;
  return { frequency, gain: level.gain * sign, q: level.q };
}

// A continuous graph guess should not require a pixel-perfect hit: ±2 semitones.
export const GUESS_TOLERANCE_OCTAVES = 2 / 12;
export function evaluateGuess(round: Round, guess: number | null): Result {
  const distance =
    guess !== null && Number.isFinite(guess) && guess > 0
      ? Math.abs(Math.log2(guess / round.frequency))
      : Infinity;
  const correct = distance <= GUESS_TOLERANCE_OCTAVES + 1e-12;
  // Other nearby guesses still earn partial credit, in logarithmic musical distance.
  const points = correct
    ? 100
    : Math.min(99, Math.round(100 * Math.exp(-2 * distance)));
  return { target: round.frequency, guess, correct, points };
}

export function recordResult(stats: Stats, result: Result): Stats {
  const streak = result.correct ? stats.streak + 1 : 0;
  return {
    attempts: stats.attempts + 1,
    correct: stats.correct + Number(result.correct),
    points: stats.points + result.points,
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
  };
}

export function formatFrequency(frequency: number): string {
  return frequency >= 1000
    ? `${Number((frequency / 1000).toFixed(2))} kHz`
    : `${frequency} Hz`;
}

export function frequencyRegion(frequency: number): {
  name: string;
  description: string;
} {
  if (frequency < 100)
    return {
      name: "Sub & low bass",
      description:
        "Listen for the deep weight and rumble underneath the sound.",
    };
  if (frequency < 250)
    return {
      name: "Bass",
      description:
        "Listen for warmth, body, and the weight of the kick and bass.",
    };
  if (frequency < 600)
    return {
      name: "Low mids",
      description:
        "Listen for thickness and boxiness in the body of the sound.",
    };
  if (frequency < 2000)
    return {
      name: "Midrange",
      description:
        "Listen for a nasal or forward quality in the center of the sound.",
    };
  if (frequency < 5000)
    return {
      name: "Upper mids",
      description:
        "Listen for bite, presence, and the sharp edge of an attack.",
    };
  return {
    name: "Highs & air",
    description:
      "Listen for brightness, sizzle, and the texture of the high end.",
  };
}

export function loadStats(storage: Pick<Storage, "getItem">): Stats {
  try {
    const value: unknown = JSON.parse(
      storage.getItem("frequency-stats-v1") ?? "null",
    );
    if (!value || typeof value !== "object") return { ...EMPTY_STATS };
    const v = value as Stats;
    if (
      !Object.keys(EMPTY_STATS).every(
        (key) =>
          Number.isSafeInteger(v[key as keyof Stats]) &&
          v[key as keyof Stats] >= 0,
      )
    )
      return { ...EMPTY_STATS };
    if (
      v.correct > v.attempts ||
      v.points > v.attempts * 100 ||
      v.streak > v.correct ||
      v.bestStreak > v.correct ||
      v.bestStreak < v.streak
    )
      return { ...EMPTY_STATS };
    return {
      attempts: v.attempts,
      correct: v.correct,
      points: v.points,
      streak: v.streak,
      bestStreak: v.bestStreak,
    };
  } catch {
    return { ...EMPTY_STATS };
  }
}
