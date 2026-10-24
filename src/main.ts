import "./style.css";
import { AudioEngine } from "./audio.ts";
import type { AudioSource, ListenMode } from "./audio.ts";
import {
  EMPTY_STATS,
  LEVELS,
  createRound,
  nearestBand,
  evaluateGuess,
  recordResult,
  formatFrequency,
  frequencyRegion,
  loadStats,
} from "./game.ts";
import type { Difficulty, ChangeType, Result, Stats } from "./game.ts";
import {
  frequencyToPosition,
  positionToFrequency,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
} from "./learn.ts";
import { SpectrumVisualizer } from "./visualizer.ts";
import {
  initParameterHelp,
  parameterHelpAttributes,
  parameterHelpMarkup,
  parameterValue,
} from "./parameter-help.ts";

const difficultyDescriptions: Record<Difficulty, string> = {
  beginner: "A strong, broad EQ change. Start here to learn the sound.",
  intermediate: "A gentler, narrower change across more target bands.",
  advanced: "A subtle, focused change with the widest range of target bands.",
};

const changeOptions: Record<
  ChangeType,
  { label: string; title: string; description: string }
> = {
  boost: {
    label: "Boost",
    title: "Boost — make a band louder",
    description:
      "Listen for extra bass, body, or brightness. A good place to start.",
  },
  cut: {
    label: "Cut",
    title: "Cut — make a band quieter",
    description:
      "Listen for something missing: less warmth, body, or brightness.",
  },
  mixed: {
    label: "Mixed",
    title: "Mixed — boosts and cuts",
    description:
      "Each round randomly makes a band louder or quieter. Listen for either kind of change.",
  },
};

const icons = {
  wave: '<path d="M2 12h4l3-8 6 16 3-8h4"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  volume:
    '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
};
function icon(name: keyof typeof icons, extra = "") {
  return `<svg ${extra} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

el("app").innerHTML = `
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="./" aria-label="Frequency home"><span class="brand-mark">${icon("wave")}</span>frequency<span class="brand-dot">.</span></a>
      <button class="text-button" id="help-button" aria-keyshortcuts="?"><kbd>?</kbd> Help</button>
    </header>
    <main>
      <div class="workspace">
        <section class="trainer panel" aria-labelledby="trainer-title">
          <div class="trainer-toolbar"><div class="practice-switch" role="group" aria-label="Practice mode" aria-keyshortcuts="T" title="Toggle Train / Learn (T)"><button id="train-mode" class="active" aria-pressed="true">Train</button><button id="learn-mode" aria-pressed="false">Learn</button><kbd class="toggle-key" aria-hidden="true">T</kbd></div><h1 id="trainer-title">Find the frequency.</h1><span class="round-badge" id="round-label">ROUND 01</span></div>
          <div class="settings-row" id="training-settings">
            <div class="setting" id="difficulty-setting"><span id="difficulty-label">Difficulty</span><button id="difficulty" class="difficulty-trigger" popovertarget="difficulty-menu" aria-haspopup="dialog" aria-expanded="false" aria-controls="difficulty-menu" aria-labelledby="difficulty-label difficulty-value"><span id="difficulty-value">Beginner</span><kbd class="toggle-key" aria-hidden="true">J/K</kbd><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
              <div id="difficulty-menu" class="difficulty-menu" popover="auto" role="dialog" aria-labelledby="difficulty-heading" aria-describedby="difficulty-intro difficulty-footnote"><h2 id="difficulty-heading">Choose difficulty</h2><p id="difficulty-intro">Higher levels use smaller dB changes, higher Q (narrower EQ), and more possible target bands.</p><div class="difficulty-options">${(Object.entries(LEVELS) as [Difficulty, (typeof LEVELS)[Difficulty]][]).map(([value, level]) => `<button class="difficulty-option" data-difficulty="${value}" ${value === "beginner" ? "autofocus" : ""} aria-pressed="${value === "beginner"}" aria-labelledby="${value}-title" aria-describedby="${value}-description ${value}-settings"><strong id="${value}-title">${level.label}</strong>${icon("check")}<span id="${value}-description" class="difficulty-description">${difficultyDescriptions[value]}</span><span id="${value}-settings" class="difficulty-metrics">${parameterValue("gain", `+${level.gain} dB`, `data-difficulty-gain="${value}"`, false)}${parameterValue("q", `Q ${level.q}`, "", false)}<span>${level.frequencies.length} target bands</span></span></button>`).join("")}</div><p id="difficulty-footnote">Gain follows Boost / Cut / Mixed. A new level starts a fresh challenge; saved stats stay unchanged.</p></div>
            </div>
            <div class="setting" id="change-setting"><span id="change-label">EQ change</span><button id="change-type" class="difficulty-trigger" popovertarget="change-menu" aria-haspopup="dialog" aria-expanded="false" aria-controls="change-menu" aria-labelledby="change-label change-value"><span id="change-value">Boost</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
              <div id="change-menu" class="difficulty-menu" popover="auto" role="dialog" aria-labelledby="change-heading" aria-describedby="change-intro change-footnote"><h2 id="change-heading">Choose EQ change</h2><p id="change-intro">EQ changes the level of one frequency band — one part of the sound.</p><div class="difficulty-options">${(Object.entries(changeOptions) as [ChangeType, (typeof changeOptions)[ChangeType]][]).map(([value, option]) => `<button class="difficulty-option" data-change="${value}" ${value === "boost" ? "autofocus" : ""} aria-pressed="${value === "boost"}" aria-labelledby="${value}-title" aria-describedby="${value}-description"><strong id="${value}-title">${option.title}</strong>${icon("check")}<span id="${value}-description" class="difficulty-description">${option.description}</span></button>`).join("")}</div><p id="change-footnote">Starts a fresh challenge. Your saved stats stay unchanged.</p></div>
            </div>
            <div class="eq-detail">${parameterValue("gain", "+15 dB", 'id="gain-label"')}${parameterValue("q", "Q 1.4", 'id="q-label"')}</div>
          </div>
          <div class="spectrum" id="spectrum">
            <div class="spectrum-top"><span class="signal-label" id="graph-status"><span class="status-dot"></span> LISTEN FIRST</span><span class="graph-unit parameter-hint" ${parameterHelpAttributes("gain")} tabindex="0">EQ RESPONSE / dB</span></div>
            <svg id="eq-graph" viewBox="0 0 720 190" role="slider" tabindex="0" aria-label="Choose EQ frequency" aria-valuemin="20" aria-valuemax="20000" aria-valuenow="1000" aria-valuetext="1 kHz" aria-orientation="horizontal" aria-describedby="guess-instructions" aria-disabled="true" preserveAspectRatio="none"></svg>
            <div class="blind-message" id="blind-message"><span class="blind-wave">${icon("wave")}</span><span id="blind-message-text">Press play, then click a frequency.</span><small>One click locks in your answer.</small></div>
            <div class="graph-axis"><span style="left:0%">20 Hz</span><span style="left:23.3%">100</span><span style="left:46.6%">500</span><span style="left:56.6%">1k</span><span style="left:79.9%">5k</span><span style="left:100%">20k</span></div>
          </div>
          <section class="live-analysis" id="live-analysis" aria-labelledby="analysis-title" hidden><div class="analysis-heading"><h3 id="analysis-title">Live spectrum</h3><span id="analysis-status">Press play to see the sound</span></div><canvas id="spectrum-canvas" role="img" aria-label="Live frequency spectrum of the audio after EQ, before the volume control"></canvas></section>
          <section class="learn-controls" id="learn-controls" aria-label="Explore EQ" hidden>
            <div class="learn-parameters"><label for="learn-frequency">Frequency <output id="learn-frequency-value" for="learn-frequency">1 kHz</output><input id="learn-frequency" type="range" min="0" max="1000" step="1" value="566" aria-label="Frequency" aria-valuetext="1 kHz"></label><label for="learn-gain"><span class="parameter-hint" ${parameterHelpAttributes("gain")}>EQ gain</span><kbd class="toggle-key" title="J / ↓: lower gain; K / ↑: raise gain">J/K · ↓/↑</kbd> <output class="parameter-hint" ${parameterHelpAttributes("gain")} tabindex="0" id="learn-gain-value" for="learn-gain">+9 dB</output><input id="learn-gain" ${parameterHelpAttributes("gain")} type="range" min="-15" max="15" step="1" value="9"><span>Cut <span>Boost</span></span></label><label for="learn-q"><span class="parameter-hint" ${parameterHelpAttributes("q")}>Bandwidth (Q)</span> <output class="parameter-hint" ${parameterHelpAttributes("q")} tabindex="0" id="learn-q-value" for="learn-q">1.4</output><input id="learn-q" ${parameterHelpAttributes("q")} type="range" min="0.4" max="6" step="0.1" value="1.4"><span>Wide <span>Narrow</span></span></label></div>
            <div class="learn-presets" role="group" aria-label="Explore frequency bands">${[80, 160, 315, 630, 1250, 2500, 5000, 10000].map((f) => `<button data-learn-frequency="${f}">${formatFrequency(f)}</button>`).join("")}</div>
          </section>
          <div class="audio-controls">
            <div class="source-row"><div class="source-select" id="source-setting"><span class="field-caption">SOUND SOURCE</span><button id="source" class="difficulty-trigger" popovertarget="source-menu" aria-haspopup="dialog" aria-expanded="false" aria-controls="source-menu" aria-label="Sound source: Pink noise"><span id="source-value">Pink noise</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><div id="source-menu" class="difficulty-menu" popover="auto" role="dialog" aria-labelledby="source-heading" aria-describedby="source-intro source-footnote"><h2 id="source-heading">Choose sound source</h2><p id="source-intro">This is the sound you listen to while practicing EQ.</p><div class="difficulty-options"><button class="difficulty-option" data-source="pink" autofocus aria-pressed="true" aria-labelledby="pink-title" aria-describedby="pink-description"><strong id="pink-title">Pink noise — a steady practice sound</strong>${icon("check")}<span id="pink-description" class="difficulty-description">A constant, soft rushing sound. Start here: without changing notes or rhythms, EQ changes are easier to notice.</span></button><button class="difficulty-option" data-source="groove" aria-pressed="false" aria-labelledby="groove-title" aria-describedby="groove-description"><strong id="groove-title">Studio groove — practice with music</strong>${icon("check")}<span id="groove-description" class="difficulty-description">A repeating musical loop with drums and bass. Try this to hear how EQ changes instruments in a mix.</span></button><button class="difficulty-option" data-source="upload" hidden aria-pressed="false" aria-labelledby="upload-title" aria-describedby="upload-description"><strong id="upload-title">Your audio</strong>${icon("check")}<span id="upload-description" class="difficulty-description">Your chosen file plays on repeat. Familiar music can help you notice what EQ adds or takes away.</span></button></div><p id="source-footnote">Use “Use your audio” to choose a file from your device. Files stay on your device. Switching sounds keeps your current challenge and stats.</p></div></div><input type="file" id="audio-file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" hidden><button class="text-button upload-button" id="upload-button">${icon("upload")}<span id="upload-label">Use your audio</span></button></div>
            <div class="transport"><button class="play-button" id="play-button" aria-label="Play audio">${icon("play")}</button><div class="ab-switch" role="group" aria-label="Compare original and equalized audio" aria-keyshortcuts="E" title="Toggle Original / With EQ (E)"><button id="original-button" aria-pressed="false">Original</button><button id="eq-button" class="active" aria-pressed="true">With EQ</button><kbd class="toggle-key" aria-hidden="true">E</kbd></div><label class="volume-control">${icon("volume")}<span class="sr-only">Volume</span><input id="volume" type="range" min="0" max="100" value="30" aria-label="Volume"><output id="volume-output">30%</output></label></div>
          </div>
          <div id="training-controls">
          <div class="round-footer"><div id="feedback" class="feedback" role="status" aria-live="polite"><span class="feedback-dot"></span><p>Press play. Compare Original and With EQ. Click your frequency.</p></div><button class="primary-button" id="next-button" hidden>Next round ${icon("arrow")}</button></div>
          <div class="trainer-bottom"><span id="round-hint">An EQ boost is hiding in one frequency band.</span><button class="text-button" id="skip-button" disabled>Reveal answer</button></div></div>
        </section>
        <aside class="sidebar panel" aria-labelledby="guide-title">
          <h2 id="guide-title">Listening guide</h2>
          <div class="learn-listening-note" id="learn-listening-note" hidden><h3 id="learn-region">1 kHz · Midrange</h3><p id="learn-description"></p><p class="guide-eq-state" id="guide-eq-state"><span id="guide-bypassed" hidden>Original signal — EQ is bypassed.</span><span id="guide-active">${parameterValue("gain", "+9 dB", 'id="guide-gain"')} · ${parameterValue("q", "Q 1.4", 'id="guide-q"')} · EQ active</span></p></div>
          <div id="train-listening-note"><h3 id="train-region">Compare Original and With EQ</h3><p id="train-description">Listen for a change in warmth, body, bite, or brightness. The answer stays hidden until you guess.</p></div>
          <p class="sweep-instructions" id="sweep-instructions" hidden>Click or drag across the graph to listen. Sweep slowly and notice how the sound changes.</p>
          <p class="graph-answer-guide" id="guess-instructions">Click to answer. Selection snaps to this difficulty’s target bands.</p>
          <p class="analysis-explanation" id="analysis-explanation" hidden>Live spectrum: lows on the left, highs on the right. Height is signal level (dBFS) before volume, not the EQ curve.</p>
          <nav class="key-hints" aria-label="Keyboard shortcuts"><h3>Controls</h3><span><kbd>space</kbd> play / pause</span><span><kbd>e</kbd> toggle original / EQ</span><span><kbd>←</kbd> <kbd>→</kbd> / H L: frequency</span><span><kbd>↓</kbd> <kbd>↑</kbd> / J K: Train difficulty / Learn dB</span><span><kbd>shift</kbd> + direction: Learn octave</span><span><kbd>enter</kbd> guess / next</span><span><kbd>t</kbd> toggle train / learn</span><span><kbd>g</kbd> focus graph</span><span><kbd>?</kbd> help</span></nav>
        </aside>
      </div>
    </main>
  </div>
  <dialog id="help-dialog" aria-labelledby="help-title"><button class="dialog-close text-button" id="close-help" aria-label="Close help">✕</button><h2 id="help-title">Listening tips & shortcuts</h2><ul><li>Start at a comfortable volume. Compare Original and With EQ often; listen for extra or missing warmth, body, bite, or brightness.</li><li>Learn is unscored, and returning to Train restores your challenge. In Train, one click submits your answer; nearby bands earn partial credit. Reveal answer earns no points.</li><li>Your audio stays on your device. Practice history is saved only in this browser.</li></ul><div class="keyboard-guide"><kbd>Space</kbd> Play / pause <kbd>E</kbd> Toggle Original / EQ <kbd>Enter</kbd> Guess / next <kbd>T</kbd> Toggle Train / Learn <kbd>G</kbd> Focus graph <kbd>← / H</kbd> Lower frequency <kbd>→ / L</kbd> Higher frequency <kbd>↓ / J</kbd> Subtler Train / lower Learn dB <kbd>↑ / K</kbd> Stronger Train / higher Learn dB <kbd>Shift + direction</kbd> Octave in Learn <kbd>Home / End</kbd> Frequency limits <kbd>Esc / ?</kbd> Close help</div><details id="stats-details"><summary>Practice history</summary><section class="session" aria-label="Saved practice stats"><div class="accuracy-block"><div class="accuracy-ring" id="accuracy-ring"><div><strong id="accuracy-value">—</strong><span>ACCURACY</span></div></div><p id="accuracy-caption">No rounds yet.</p></div><div class="stat-grid"><div><span class="stat-label">TOTAL POINTS</span><strong id="points-value">0</strong></div><div><span class="stat-label">CURRENT STREAK</span><strong id="streak-value">0 <small>in a row</small></strong></div></div><div class="history-heading"><h3>Recent rounds</h3><span id="attempts-label">0 played</span></div><ol class="history-list" id="history-list"></ol><button id="reset-button" class="text-button reset-button">${icon("reset")} Reset stats</button><p class="saved-note" id="saved-note">Stats saved on this device.</p></section></details></dialog>
  <dialog id="reset-dialog"><h2>A fresh start?</h2><p>This clears your saved practice stats and recent rounds. It can't be undone.</p><div class="dialog-actions"><button class="text-button" id="cancel-reset">Keep practicing</button><button class="primary-button" id="confirm-reset">Reset stats</button></div></dialog>
  <div id="error-message" class="error-toast" role="alert" hidden></div>
  ${parameterHelpMarkup()}
`;

const dismissParameterHelp = initParameterHelp();

const audio = new AudioEngine();
let practiceMode: "train" | "learn" = "train";
const learnEQ = { frequency: 1000, gain: 9, q: 1.4 };
let sweepPointer: number | null = null;
let aimFrequency = 1000;
let aimVisible = false;
let difficulty: Difficulty = "beginner";
let change: ChangeType = "boost";
let round = createRound(difficulty, change);
let selected: number | null = null;
let revealed = false;
let playing = false;
let starting = false;
let listened = false;
let mode: ListenMode = "eq";
let roundNumber = 1;
let history: Result[] = [];
let stats: Stats;
let persistentStorage = true;
try {
  stats = loadStats(localStorage);
} catch {
  persistentStorage = false;
  stats = { ...EMPTY_STATS };
}
let errorTimer: ReturnType<typeof setTimeout> | undefined;
let uploadGeneration = 0;
let sourceIntent = 0;
let playbackGeneration = 0;

function showError(message: string) {
  clearTimeout(errorTimer);
  el("error-message").textContent = message;
  el("error-message").hidden = false;
  errorTimer = setTimeout(() => {
    el("error-message").hidden = true;
  }, 7000);
}
function saveStats() {
  if (!persistentStorage) return;
  try {
    localStorage.setItem("frequency-stats-v1", JSON.stringify(stats));
  } catch {
    persistentStorage = false;
  }
}
function mutateStats(update: (current: Stats) => Stats) {
  const apply = () => {
    let current = stats;
    if (persistentStorage) {
      try {
        current = loadStats(localStorage);
      } catch {
        persistentStorage = false;
      }
    }
    stats = update(current);
    saveStats();
    updateStats();
  };
  // Serialize read-modify-write across tabs where Web Locks is available.
  if (navigator.locks)
    void navigator.locks.request("frequency-stats-v1", apply).catch(apply);
  else apply();
}
window.addEventListener("storage", (event) => {
  if (
    !persistentStorage ||
    (event.key !== null && event.key !== "frequency-stats-v1")
  )
    return;
  try {
    stats = loadStats(localStorage);
    updateStats();
  } catch {
    /* Storage may have been disabled. */
  }
});
function updateStats() {
  const accuracy = stats.attempts
    ? Math.round((stats.correct / stats.attempts) * 100)
    : 0;
  el("accuracy-value").textContent = stats.attempts ? `${accuracy}%` : "—";
  el("accuracy-ring").style.setProperty("--accuracy", `${accuracy}%`);
  el("accuracy-caption").textContent = stats.attempts
    ? `${stats.correct} on target out of ${stats.attempts}`
    : "No rounds yet.";
  el("points-value").textContent = stats.points.toLocaleString();
  el("streak-value").innerHTML = `${stats.streak} <small>in a row</small>`;
  el("attempts-label").textContent = `${stats.attempts} played`;
  el("saved-note").textContent = persistentStorage
    ? "Stats saved on this device."
    : "Storage unavailable. Stats kept for this visit.";
  el("history-list").innerHTML = history.length
    ? history
        .slice(0, 4)
        .map(
          (result) =>
            `<li><span class="history-icon ${result.correct ? "correct" : ""}">${result.correct ? icon("check") : "↗"}</span><span><strong>${formatFrequency(result.target)}</strong><small>${result.guess === null ? "Revealed" : result.correct ? "On target" : `You chose ${formatFrequency(result.guess)}`}</small></span><span class="history-points">+${result.points}</span></li>`,
        )
        .join("")
    : '<li class="history-empty">No recent rounds.</li>';
}
function setMode(next: ListenMode) {
  mode = next;
  audio.setMode(mode);
  for (const [id, active] of [
    ["original-button", mode === "original"],
    ["eq-button", mode === "eq"],
  ] as const) {
    el(id).classList.toggle("active", active);
    el(id).setAttribute("aria-pressed", String(active));
  }
  drawGraph();
  updateTransport();
}
function updateTransport() {
  const button = el<HTMLButtonElement>("play-button");
  button.innerHTML = icon(playing ? "pause" : "play");
  button.setAttribute("aria-label", playing ? "Pause audio" : "Play audio");
  button.classList.toggle("is-playing", playing);
  button.disabled = starting;
  el("spectrum").classList.toggle("is-playing", playing);
  el("graph-status").innerHTML =
    `<span class="status-dot"></span> ${practiceMode === "learn" ? (mode === "original" ? "ORIGINAL / EQ BYPASSED" : playing ? "LIVE EXPLORATION" : "CLICK TO LISTEN") : revealed ? "ANSWER REVEALED" : playing ? "BLIND LISTENING" : listened ? "AUDIO PAUSED" : "LISTEN FIRST"}`;
  el("analysis-status").textContent = playing
    ? `LIVE · ${mode === "eq" ? "WITH EQ" : "ORIGINAL"}`
    : "Audio paused — press play";
  if (practiceMode === "learn" && playing) visualizer.start();
  else visualizer.stop();
}
function stopPlayback() {
  ++playbackGeneration;
  audio.pause();
  playing = false;
  starting = false;
  updateTransport();
}
async function togglePlayback() {
  if (starting) return;
  if (playing) {
    stopPlayback();
    return;
  }
  const generation = ++playbackGeneration;
  starting = true;
  updateTransport();
  try {
    await audio.start();
    if (generation !== playbackGeneration) return;
    if (document.hidden) {
      stopPlayback();
      return;
    }
    playing = true;
    if (practiceMode === "train") listened = true;
    else {
      updateLearnEQ();
      audio.resetSpectrum();
    }
    el<HTMLButtonElement>("skip-button").disabled = revealed;
    updateGraphControl();
    updateAction();
    drawGraph();
  } catch (error) {
    if (generation === playbackGeneration)
      showError(
        error instanceof Error
          ? error.message
          : "Audio could not start. Try another browser.",
      );
  } finally {
    if (generation === playbackGeneration) {
      starting = false;
      updateTransport();
    }
  }
}
function updateGraphControl() {
  const graph = document.getElementById("eq-graph")!;
  const exploring = practiceMode === "learn";
  const bands = LEVELS[difficulty].frequencies;
  graph.setAttribute(
    "aria-valuemin",
    String(exploring ? MIN_FREQUENCY : bands[0]),
  );
  graph.setAttribute(
    "aria-valuemax",
    String(exploring ? audio.maxFrequency : bands[bands.length - 1]),
  );
  graph.setAttribute(
    "aria-disabled",
    String(!exploring && (!listened || revealed)),
  );
  graph.setAttribute(
    "aria-valuenow",
    String(exploring ? learnEQ.frequency : aimFrequency),
  );
  graph.setAttribute(
    "aria-valuetext",
    formatFrequency(exploring ? learnEQ.frequency : aimFrequency),
  );
  el("spectrum").classList.toggle(
    "can-guess",
    !exploring && listened && !revealed,
  );
  el("blind-message-text").textContent = listened
    ? "Click the graph to make your call."
    : "Press play, then click a frequency.";
}
function updateAction() {
  el("next-button").hidden = !revealed;
}
function updateListeningGuide() {
  const learning = practiceMode === "learn";
  el("train-listening-note").hidden = learning;
  el("sweep-instructions").hidden = !learning;
  el("guess-instructions").hidden = learning;
  el("analysis-explanation").hidden = !learning;
  if (learning) {
    el("guide-bypassed").hidden = mode !== "original";
    el("guide-active").hidden = mode === "original";
    el("guide-gain").textContent =
      `${learnEQ.gain > 0 ? "+" : learnEQ.gain < 0 ? "−" : ""}${Math.abs(learnEQ.gain)} dB`;
    el("guide-q").textContent = `Q ${learnEQ.q}`;
  } else {
    const region = revealed ? frequencyRegion(round.frequency) : null;
    el("train-region").textContent = region
      ? `${formatFrequency(round.frequency)} · ${region.name}`
      : "Compare Original and With EQ";
    el("train-description").textContent =
      region?.description ??
      "Listen for a change in warmth, body, bite, or brightness. The answer stays hidden until you guess.";
  }
}
function drawGraph() {
  updateListeningGuide();
  const svg = document.getElementById("eq-graph")!;
  const width = 720,
    height = 190;
  const x = (f: number) => (Math.log(f / 20) / Math.log(1000)) * width;
  const dbRange = 18;
  const y = (db: number) => height / 2 - (db / dbRange) * (height / 2 - 18);
  let markup = [12, 0, -12]
    .map(
      (db) =>
        `<line x1="0" y1="${y(db)}" x2="720" y2="${y(db)}" class="graph-grid${db === 0 ? " zero" : ""}"/><text x="8" y="${y(db) - 7}" class="db-label">${db > 0 ? "+" : ""}${db}</text>`,
    )
    .join("");
  markup += [100, 500, 1000, 5000]
    .map(
      (f) =>
        `<line x1="${x(f)}" y1="0" x2="${x(f)}" y2="190" class="graph-grid vertical"/>`,
    )
    .join("");
  const exploring = practiceMode === "learn";
  if (!exploring) {
    markup += LEVELS[difficulty].frequencies
      .map(
        (frequency) =>
          `<line x1="${x(frequency)}" x2="${x(frequency)}" y1="174" y2="190" class="graph-grid target-band" data-train-band="${frequency}"><title>${formatFrequency(frequency)}</title></line>`,
      )
      .join("");
  }
  const visibleEQ = exploring ? learnEQ : round;
  if (revealed || exploring) {
    const frequencies = new Float32Array(
      Array.from({ length: 360 }, (_, i) => 20 * 1000 ** (i / 359)),
    );
    const response = audio.getResponse(frequencies);
    // Samples beyond the device's Nyquist frequency have no valid response.
    const valid = Array.from(response, (db, i) => ({
      db,
      frequency: frequencies[i],
    })).filter((point) => Number.isFinite(point.db));
    const points = valid.map(
      ({ db, frequency }) => `${x(frequency).toFixed(2)},${y(db).toFixed(2)}`,
    );
    const endX = x(valid.at(-1)?.frequency ?? 20);
    if (points.length)
      markup += `<path d="M0,${y(0)} L${points.join(" L")} L${endX},${y(0)} Z" class="response-fill"/><path d="M${points.join(" L")}" class="response-line${mode === "original" ? " bypassed" : ""}"/>`;
    markup += `<line x1="${x(visibleEQ.frequency)}" y1="14" x2="${x(visibleEQ.frequency)}" y2="180" class="answer-marker"/><text x="${Math.min(650, Math.max(50, x(visibleEQ.frequency)))}" y="18" text-anchor="middle" class="answer-label">${formatFrequency(visibleEQ.frequency)}</text>`;
    if (exploring)
      markup += `<circle cx="${x(learnEQ.frequency)}" cy="${y(learnEQ.gain)}" r="6" class="sweep-handle"/>`;
    if (!exploring && selected && selected !== round.frequency)
      markup += `<line x1="${x(selected)}" y1="25" x2="${x(selected)}" y2="180" class="guess-marker"/>`;
  }
  if (!exploring && !revealed && listened && aimVisible) {
    markup += `<line x1="${x(aimFrequency)}" y1="14" x2="${x(aimFrequency)}" y2="180" class="aim-marker"/><text x="${Math.min(650, Math.max(50, x(aimFrequency)))}" y="18" text-anchor="middle" class="answer-label">${formatFrequency(aimFrequency)}</text>`;
  }
  svg.innerHTML = markup;
  svg.setAttribute(
    "aria-label",
    exploring
      ? "Sweep EQ frequency"
      : revealed
        ? `Answer: ${formatFrequency(round.frequency)}, ${round.gain > 0 ? "boost" : "cut"} of ${Math.abs(round.gain)} decibels. The curve shows the applied EQ; original bypasses it.`
        : "Choose EQ frequency",
  );
  el("blind-message").hidden = revealed || exploring;
}
function newRound(advance = false) {
  dismissParameterHelp();
  updateDifficultyPicker();
  if (advance) roundNumber++;
  round = createRound(difficulty, change, round.frequency);
  selected = null;
  aimVisible = false;
  aimFrequency = nearestBand(difficulty, 1000);
  revealed = false;
  listened = playing;
  if (practiceMode === "train") {
    audio.setEQ(round.frequency, round.gain, round.q);
    setMode("eq");
  }
  el("round-label").textContent =
    practiceMode === "learn"
      ? "FREE EXPLORATION"
      : `ROUND ${String(roundNumber).padStart(2, "0")}`;
  // Mixed mode intentionally does not disclose the sign until the answer.
  el("gain-label").textContent =
    `${change === "mixed" ? "±" : change === "cut" ? "−" : "+"}${Math.abs(round.gain)} dB`;
  el("q-label").textContent = `Q ${round.q}`;
  el("round-hint").textContent =
    `An EQ ${change === "mixed" ? "change" : change} is hiding in one frequency band.`;
  el("feedback").className = "feedback";
  el("feedback").innerHTML =
    '<span class="feedback-dot"></span><p>Press play. Compare Original and With EQ. Click your frequency.</p>';
  el<HTMLButtonElement>("skip-button").disabled = !listened;
  updateGraphControl();
  updateAction();
  updateTransport();
}
function reveal(skip = false) {
  if (
    practiceMode !== "train" ||
    revealed ||
    !listened ||
    (!skip && selected === null)
  )
    return;
  if (skip) selected = null;
  revealed = true;
  const result = evaluateGuess(round, selected);
  history.unshift(result);
  history = history.slice(0, 4);
  mutateStats((current) => recordResult(current, result));
  const region = frequencyRegion(round.frequency);
  el("feedback").className =
    `feedback result ${result.correct ? "success" : "learning"}`;
  el("feedback").innerHTML =
    `<span class="result-symbol">${result.correct ? icon("check") : icon("wave")}</span><div><strong>${result.correct ? "On target." : skip ? "Meet this frequency." : "One to listen for."} <span>+${result.points} pts</span></strong><p>Answer: ${formatFrequency(round.frequency)} · ${parameterValue("gain", `${round.gain > 0 ? "+" : "−"}${Math.abs(round.gain)} dB`)} · ${region.name}</p><small>${selected !== null ? `You picked ${formatFrequency(selected)}. ` : ""}${region.description}</small></div>`;
  el<HTMLButtonElement>("skip-button").disabled = true;
  el("round-hint").textContent =
    "Listen again with the answer in mind, or move on.";
  el("gain-label").textContent =
    `${round.gain > 0 ? "+" : "−"}${Math.abs(round.gain)} dB`;
  updateStats();
  updateGraphControl();
  updateAction();
  updateTransport();
  drawGraph();
}

const graph = document.querySelector<SVGSVGElement>("#eq-graph")!;
const visualizer = new SpectrumVisualizer(
  el<HTMLCanvasElement>("spectrum-canvas"),
  () => audio.readSpectrum(),
);
function updateLearnEQ() {
  learnEQ.frequency = Math.min(learnEQ.frequency, audio.maxFrequency);
  el<HTMLInputElement>("learn-frequency").max = String(
    Math.ceil(frequencyToPosition(audio.maxFrequency) * 1000),
  );
  graph.setAttribute("aria-valuemax", String(audio.maxFrequency));
  el("sweep-instructions").textContent =
    "Click or drag across the graph to listen. Sweep slowly and notice how the sound changes." +
    (audio.maxFrequency < MAX_FREQUENCY
      ? ` This device's EQ range ends at ${formatFrequency(audio.maxFrequency)}.`
      : "");
  audio.setEQ(learnEQ.frequency, learnEQ.gain, learnEQ.q);
  const frequencyLabel = formatFrequency(learnEQ.frequency);
  el<HTMLInputElement>("learn-frequency").value = String(
    frequencyToPosition(learnEQ.frequency) * 1000,
  );
  el("learn-frequency-value").textContent = frequencyLabel;
  el("learn-frequency").setAttribute("aria-valuetext", frequencyLabel);
  el<HTMLInputElement>("learn-gain").value = String(learnEQ.gain);
  el("learn-gain-value").textContent =
    `${learnEQ.gain > 0 ? "+" : learnEQ.gain < 0 ? "−" : ""}${Math.abs(learnEQ.gain)} dB`;
  el("learn-q-value").textContent = String(learnEQ.q);
  const region = frequencyRegion(learnEQ.frequency);
  el("learn-region").textContent = `${frequencyLabel} · ${region.name}`;
  el("learn-description").textContent = region.description;
  graph.setAttribute("aria-valuenow", String(learnEQ.frequency));
  graph.setAttribute("aria-valuetext", `${frequencyLabel}, ${region.name}`);
  for (const button of el("learn-controls").querySelectorAll<HTMLButtonElement>(
    "[data-learn-frequency]",
  )) {
    const active = Number(button.dataset.learnFrequency) === learnEQ.frequency;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  drawGraph();
}
function setPracticeMode(next: "train" | "learn") {
  if (next === practiceMode) return;
  dismissParameterHelp();
  difficultyMenu.hidePopover();
  el("change-menu").hidePopover();
  if (sweepPointer !== null && graph.hasPointerCapture(sweepPointer))
    graph.releasePointerCapture(sweepPointer);
  sweepPointer = null;
  practiceMode = next;
  const learning = next === "learn";
  document
    .querySelector(".workspace")!
    .classList.toggle("is-learning-mode", learning);
  for (const id of ["training-settings", "training-controls"])
    el(id).hidden = learning;
  for (const id of ["learn-controls", "learn-listening-note", "live-analysis"])
    el(id).hidden = !learning;
  for (const [id, active] of [
    ["train-mode", !learning],
    ["learn-mode", learning],
  ] as const) {
    el(id).classList.toggle("active", active);
    el(id).setAttribute("aria-pressed", String(active));
  }
  el("trainer-title").textContent = learning
    ? "Explore the sound."
    : "Find the frequency.";
  el("round-label").textContent = learning
    ? "FREE EXPLORATION"
    : `ROUND ${String(roundNumber).padStart(2, "0")}`;
  el("spectrum").classList.toggle("is-learning", learning);
  graph.setAttribute("role", "slider");
  if (learning) {
    graph.setAttribute("tabindex", "0");
    graph.setAttribute("aria-valuemin", String(MIN_FREQUENCY));
    graph.setAttribute("aria-valuemax", String(MAX_FREQUENCY));
    graph.setAttribute("aria-orientation", "horizontal");
    graph.setAttribute("aria-describedby", "sweep-instructions");
    updateLearnEQ();
    audio.resetSpectrum();
  } else {
    graph.setAttribute("aria-describedby", "guess-instructions");
    audio.setEQ(round.frequency, round.gain, round.q);
    if (playing) listened = true;
    updateGraphControl();
    updateAction();
    el<HTMLButtonElement>("skip-button").disabled = !listened || revealed;
  }
  updateGraphControl();
  setMode("eq");
}
function setLearnFrequency(frequency: number) {
  if (practiceMode !== "learn") return;
  learnEQ.frequency = Math.round(
    Math.max(MIN_FREQUENCY, Math.min(audio.maxFrequency, frequency)),
  );
  updateLearnEQ();
}
function frequencyAt(clientX: number) {
  const bounds = graph.getBoundingClientRect();
  return bounds.width > 0
    ? Math.round(positionToFrequency((clientX - bounds.left) / bounds.width))
    : 1000;
}
function sweepAt(clientX: number) {
  setLearnFrequency(frequencyAt(clientX));
}
el("train-mode").addEventListener("click", () => setPracticeMode("train"));
el("learn-mode").addEventListener("click", () => setPracticeMode("learn"));
graph.addEventListener("pointerdown", (event) => {
  if (practiceMode !== "learn" || event.button !== 0 || !event.isPrimary)
    return;
  event.preventDefault();
  sweepPointer = event.pointerId;
  graph.setPointerCapture(event.pointerId);
  graph.focus({ preventScroll: true });
  sweepAt(event.clientX);
  if (!playing && !starting) void togglePlayback();
});
graph.addEventListener("pointermove", (event) => {
  if (event.pointerId === sweepPointer && practiceMode === "learn")
    sweepAt(event.clientX);
  else if (
    practiceMode === "train" &&
    listened &&
    !revealed &&
    event.pointerType === "mouse"
  ) {
    aimFrequency = nearestBand(difficulty, frequencyAt(event.clientX));
    aimVisible = true;
    updateGraphControl();
    drawGraph();
  }
});
graph.addEventListener("pointerleave", () => {
  if (practiceMode === "train") {
    aimVisible = false;
    drawGraph();
  }
});
graph.addEventListener("click", (event) => {
  if (practiceMode !== "train" || !listened || revealed) return;
  selected = nearestBand(difficulty, frequencyAt(event.clientX));
  aimFrequency = selected;
  reveal();
});
for (const eventName of [
  "pointerup",
  "pointercancel",
  "lostpointercapture",
] as const) {
  graph.addEventListener(eventName, (event) => {
    if (event.pointerId !== sweepPointer) return;
    sweepPointer = null;
    if (graph.hasPointerCapture(event.pointerId))
      graph.releasePointerCapture(event.pointerId);
  });
}
function setGraphFrequency(frequency: number) {
  if (practiceMode === "learn") setLearnFrequency(frequency);
  else if (listened && !revealed) {
    aimFrequency = nearestBand(difficulty, frequency);
    aimVisible = true;
    updateGraphControl();
    drawGraph();
  }
}
function stepGraphFrequency(direction: number, octave: boolean) {
  if (practiceMode === "train") {
    const bands = LEVELS[difficulty].frequencies;
    const index = bands.findIndex((frequency) => frequency === aimFrequency);
    setGraphFrequency(
      bands[Math.max(0, Math.min(bands.length - 1, index + direction))],
    );
  } else {
    const step = octave ? 2 : 2 ** (1 / 12);
    setGraphFrequency(learnEQ.frequency * step ** direction);
  }
}
function stepGain(direction: number) {
  if (practiceMode === "learn") {
    learnEQ.gain = Math.max(-15, Math.min(15, learnEQ.gain + direction));
    updateLearnEQ();
  } else {
    // Up / K means more pronounced EQ; down / J means subtler EQ.
    const levels: Difficulty[] = ["advanced", "intermediate", "beginner"];
    const index = levels.indexOf(difficulty);
    const next =
      levels[Math.max(0, Math.min(levels.length - 1, index + direction))];
    if (next !== difficulty) {
      difficulty = next;
      newRound();
    }
  }
}
graph.addEventListener("keydown", (event) => {
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  if (practiceMode === "train" && event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (revealed) newRound(true);
    else if (listened) {
      selected = aimFrequency;
      reveal();
    }
    return;
  }
  const key = event.key.toLowerCase();
  if (["j", "k", "arrowup", "arrowdown"].includes(key)) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat || practiceMode === "learn")
      stepGain(key === "k" || key === "arrowup" ? 1 : -1);
    return;
  }
  if (practiceMode === "train" && (!listened || revealed)) return;
  const higher = key === "arrowright" || key === "l";
  const lower = key === "arrowleft" || key === "h";
  if (!higher && !lower && key !== "home" && key !== "end") return;
  event.preventDefault();
  event.stopPropagation();
  if (higher || lower) stepGraphFrequency(higher ? 1 : -1, event.shiftKey);
  else setGraphFrequency(key === "home" ? MIN_FREQUENCY : MAX_FREQUENCY);
});
el("learn-frequency").addEventListener("input", () =>
  setLearnFrequency(
    positionToFrequency(
      Number(el<HTMLInputElement>("learn-frequency").value) / 1000,
    ),
  ),
);
for (const [id, property] of [
  ["learn-gain", "gain"],
  ["learn-q", "q"],
] as const) {
  el(id).addEventListener("input", () => {
    if (practiceMode !== "learn") return;
    learnEQ[property] = Number(el<HTMLInputElement>(id).value);
    updateLearnEQ();
  });
}
el("learn-controls").addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    "[data-learn-frequency]",
  );
  if (button && practiceMode === "learn") {
    setLearnFrequency(Number(button.dataset.learnFrequency));
    if (!playing && !starting) void togglePlayback();
  }
});

el("play-button").addEventListener("click", () => {
  void togglePlayback();
});
el("original-button").addEventListener("click", () => setMode("original"));
el("eq-button").addEventListener("click", () => setMode("eq"));
el("volume").addEventListener("input", () => {
  const value = Number(el<HTMLInputElement>("volume").value);
  audio.setVolume(value / 100);
  el("volume-output").textContent = `${value}%`;
});
el("next-button").addEventListener("click", () => {
  if (practiceMode === "train" && revealed) newRound(true);
});
el("skip-button").addEventListener("click", () => reveal(true));
const difficultyButton = el<HTMLButtonElement>("difficulty");
const difficultyMenu = el("difficulty-menu");
const difficultyOptions = Array.from(
  difficultyMenu.querySelectorAll<HTMLButtonElement>("[data-difficulty]"),
);
function updateDifficultyPicker() {
  el("difficulty-value").textContent = LEVELS[difficulty].label;
  for (const option of difficultyOptions) {
    const value = option.dataset.difficulty as Difficulty;
    option.setAttribute("aria-pressed", String(value === difficulty));
    option.autofocus = value === difficulty;
    option.querySelector("[data-difficulty-gain]")!.textContent =
      `${change === "mixed" ? "±" : change === "cut" ? "−" : "+"}${LEVELS[value].gain} dB`;
  }
}
// Share focus, positioning, and keyboard behavior between both settings popovers.
function initSettingsPicker(
  difficultyButton: HTMLButtonElement,
  difficultyMenu: HTMLElement,
  optionAttribute: string,
  onSelect: (value: string) => void,
) {
  const difficultyOptions = Array.from(
    difficultyMenu.querySelectorAll<HTMLButtonElement>(`[${optionAttribute}]`),
  );
  function positionDifficultyMenu() {
    const bounds = difficultyButton.getBoundingClientRect();
    const size = difficultyMenu.getBoundingClientRect();
    difficultyMenu.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - size.width - 12))}px`;
    const below = bounds.bottom + 6;
    const above = bounds.top - size.height - 6;
    difficultyMenu.style.top = `${Math.max(12, Math.min(below + size.height <= innerHeight - 12 ? below : above, innerHeight - size.height - 12))}px`;
  }
  difficultyMenu.addEventListener("toggle", () => {
    if (!difficultyMenu.matches(":popover-open")) return;
    positionDifficultyMenu();
  });
  difficultyButton.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    difficultyMenu.showPopover();
  });
  difficultyMenu.addEventListener("beforetoggle", (event) => {
    difficultyButton.setAttribute(
      "aria-expanded",
      String((event as ToggleEvent).newState === "open"),
    );
  });
  difficultyMenu.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Tab") {
      requestAnimationFrame(() => {
        if (!difficultyMenu.contains(document.activeElement))
          difficultyMenu.hidePopover();
      });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      difficultyMenu.hidePopover();
      difficultyButton.focus({ preventScroll: true });
      return;
    }
    const visibleOptions = difficultyOptions.filter((option) => !option.hidden);
    const index = visibleOptions.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const direction =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    let next = direction
      ? (index + direction + visibleOptions.length) % visibleOptions.length
      : -1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = visibleOptions.length - 1;
    if (event.key.length === 1 && /[a-z]/i.test(event.key))
      next = visibleOptions.findIndex((option) =>
        option
          .getAttribute(optionAttribute)!
          .startsWith(event.key.toLowerCase()),
      );
    if (next < 0) return;
    event.preventDefault();
    visibleOptions[next].focus({ preventScroll: true });
  });
  difficultyMenu.addEventListener("focusout", (event) => {
    // Let the native invoker toggle on click, rather than closing before activation.
    if (event.relatedTarget === difficultyButton) return;
    // Blur fires before the next option receives focus; use its destination.
    if (!difficultyMenu.contains(event.relatedTarget as Node | null))
      difficultyMenu.hidePopover();
  });
  for (const option of difficultyOptions) {
    option.addEventListener("click", () => {
      onSelect(option.getAttribute(optionAttribute)!);
      difficultyMenu.hidePopover();
      difficultyButton.focus({ preventScroll: true });
    });
  }
  window.addEventListener("resize", () => {
    if (difficultyMenu.matches(":popover-open")) positionDifficultyMenu();
  });
  document.addEventListener(
    "scroll",
    (event) => {
      if (
        difficultyMenu.matches(":popover-open") &&
        event.target !== difficultyMenu
      )
        difficultyMenu.hidePopover();
    },
    true,
  );
}
initSettingsPicker(
  difficultyButton,
  difficultyMenu,
  "data-difficulty",
  (value) => {
    if (value === difficulty) return;
    difficulty = value as Difficulty;
    newRound();
  },
);
initSettingsPicker(
  el<HTMLButtonElement>("change-type"),
  el("change-menu"),
  "data-change",
  (value) => {
    if (value === change) return;
    change = value as ChangeType;
    el("change-value").textContent = changeOptions[change].label;
    for (const option of el("change-menu").querySelectorAll<HTMLButtonElement>(
      "[data-change]",
    )) {
      const active = option.dataset.change === change;
      option.setAttribute("aria-pressed", String(active));
      option.autofocus = active;
    }
    newRound();
  },
);
let selectedSource: AudioSource = "pink";
let uploadedSourceName = "Your audio";
function updateSourcePicker() {
  const label =
    selectedSource === "upload"
      ? uploadedSourceName
      : selectedSource === "pink"
        ? "Pink noise"
        : "Studio groove";
  el("source-value").textContent = label;
  el("source").setAttribute("aria-label", `Sound source: ${label}`);
  el("source").title = label;
  for (const option of el("source-menu").querySelectorAll<HTMLButtonElement>(
    "[data-source]",
  )) {
    const active = option.dataset.source === selectedSource;
    option.setAttribute("aria-pressed", String(active));
    option.autofocus = active;
  }
}
initSettingsPicker(
  el<HTMLButtonElement>("source"),
  el("source-menu"),
  "data-source",
  (value) => {
    ++sourceIntent;
    selectedSource = value as AudioSource;
    audio.setSource(selectedSource);
    updateSourcePicker();
  },
);
el("upload-button").addEventListener("click", () =>
  el<HTMLInputElement>("audio-file").click(),
);
el("audio-file").addEventListener("change", async () => {
  const input = el<HTMLInputElement>("audio-file");
  const file = input.files?.[0];
  if (!file) return;
  input.value = "";
  if (file.size > 50 * 1024 * 1024) {
    showError(
      "Choose an audio file smaller than 50 MB. A short loop works best.",
    );
    return;
  }
  const generation = ++uploadGeneration;
  const intent = sourceIntent;
  el<HTMLButtonElement>("upload-button").disabled = true;
  el("upload-label").textContent = "Decoding…";
  try {
    await audio.loadFile(file, false);
    if (generation !== uploadGeneration) return;
    uploadedSourceName = file.name;
    el("upload-title").textContent = file.name;
    el("upload-title").closest<HTMLButtonElement>("button")!.hidden = false;
    if (intent === sourceIntent) {
      audio.setSource("upload");
      selectedSource = "upload";
    }
    updateSourcePicker();
  } catch {
    showError(
      "That file could not be decoded. Try an MP3 or WAV file. Your previous sound is unchanged.",
    );
  } finally {
    if (generation === uploadGeneration) {
      el<HTMLButtonElement>("upload-button").disabled = false;
      el("upload-label").textContent = "Use your audio";
    }
  }
});
const help = el<HTMLDialogElement>("help-dialog");
function toggleHelp() {
  if (help.open) help.close();
  else {
    dismissParameterHelp();
    help.showModal();
  }
}
el("help-button").addEventListener("click", toggleHelp);
el("close-help").addEventListener("click", () => help.close());
function outsideHelp(event: MouseEvent) {
  const bounds = help.getBoundingClientRect();
  return (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  );
}
let helpBackdropPress = false;
help.addEventListener("pointerdown", (event) => {
  helpBackdropPress = event.target === help && outsideHelp(event);
});
help.addEventListener("click", (event) => {
  if (event.target === help && helpBackdropPress && outsideHelp(event))
    help.close();
  helpBackdropPress = false;
});
const reset = el<HTMLDialogElement>("reset-dialog");
el("reset-button").addEventListener("click", () => reset.showModal());
el("cancel-reset").addEventListener("click", () => reset.close());
el("confirm-reset").addEventListener("click", () => {
  history = [];
  roundNumber = 1;
  mutateStats(() => ({ ...EMPTY_STATS }));
  newRound();
  reset.close();
});
document.addEventListener("keydown", (event) => {
  if (
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    reset.open
  )
    return;
  if (help.open) {
    if (event.key === "?") {
      event.preventDefault();
      help.close();
    }
    return;
  }
  const target = event.target as HTMLElement;
  if (
    target.closest(
      'input, select, textarea, [contenteditable="true"], #difficulty-setting, #change-setting, #source-setting, [data-parameter-help]',
    )
  )
    return;
  const key = event.key.toLowerCase();
  if (key === "?") {
    event.preventDefault();
    toggleHelp();
    return;
  }
  if (key === "t") {
    event.preventDefault();
    setPracticeMode(practiceMode === "train" ? "learn" : "train");
    graph.focus();
    return;
  }
  if (key === "g") {
    event.preventDefault();
    graph.focus();
    return;
  }
  if (["j", "k", "arrowup", "arrowdown"].includes(key)) {
    event.preventDefault();
    graph.focus();
    stepGain(key === "k" || key === "arrowup" ? 1 : -1);
    return;
  }
  if (key === "h" || key === "l") {
    event.preventDefault();
    graph.focus();
    stepGraphFrequency(key === "l" ? 1 : -1, event.shiftKey);
    return;
  }
  if (key === "e") {
    event.preventDefault();
    setMode(mode === "original" ? "eq" : "original");
    return;
  }
  if (key === "a") {
    event.preventDefault();
    setMode("original");
  }
  if (key === "b") {
    event.preventDefault();
    setMode("eq");
  }
  // Keep native Space/Enter activation for other focused buttons and links.
  const transportFocused = Boolean(target.closest("#play-button, .ab-switch"));
  if (
    event.code === "Space" &&
    (!target.closest("button, a") || transportFocused)
  ) {
    event.preventDefault();
    void togglePlayback();
  }
  if (
    practiceMode === "train" &&
    event.key === "Enter" &&
    !target.closest("button, a")
  ) {
    event.preventDefault();
    if (revealed) newRound(true);
    else reveal();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPlayback();
});
window.addEventListener("pagehide", stopPlayback);
updateStats();
newRound();
