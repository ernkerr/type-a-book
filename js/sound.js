// Typewriter sounds, made in the browser with the Web Audio API, so there
// are no recordings to license or download: the strike of a key, the space
// bar, the bell near the end of a line, the carriage return, a jammed key,
// and a sheet of paper going in.

let ctx = null;
let out = null;
let noise = null;
let on = true;

export function setOn(value) {
  on = value;
  if (out) out.gain.value = on ? 0.9 : 0;
}

// Browsers only allow sound after a key press or click.
export function wake() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    out = ctx.createGain();
    out.gain.value = on ? 0.9 : 0;
    out.connect(ctx.destination);
    const length = ctx.sampleRate;
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume();
}

const ready = () => ctx && on;
const vary = (n, by) => n * (1 + (Math.random() * 2 - 1) * by);

function hiss({ at = 0, dur, freq, q = 1, gain, type = "bandpass" }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

function tone({ at = 0, dur, freq, gain, type = "sine" }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// The typebar hitting the platen: a sharp click over a dull thump.
export function key() {
  if (!ready()) return;
  hiss({ dur: 0.03, freq: vary(2800, 0.15), q: 0.8, gain: 0.5 });
  hiss({ at: 0.006, dur: 0.018, freq: vary(5200, 0.1), q: 4, gain: 0.18 });
  tone({ dur: 0.05, freq: vary(150, 0.12), gain: 0.32, type: "triangle" });
}

export function space() {
  if (!ready()) return;
  hiss({ dur: 0.04, freq: vary(1400, 0.1), q: 0.7, gain: 0.32 });
  tone({ dur: 0.06, freq: vary(110, 0.08), gain: 0.25, type: "triangle" });
}

export function bell() {
  if (!ready()) return;
  tone({ dur: 1.3, freq: 2093, gain: 0.12 });
  tone({ dur: 0.9, freq: 3140, gain: 0.05 });
  tone({ dur: 0.5, freq: 4400, gain: 0.025 });
}

// The ratchet of the carriage sliding back, then the clunk at the margin.
export function carriage() {
  if (!ready()) return;
  for (let i = 0; i < 9; i++) {
    hiss({ at: i * 0.024, dur: 0.012, freq: vary(3600, 0.1), q: 5, gain: 0.16 });
  }
  hiss({ dur: 0.26, freq: 900, q: 0.4, gain: 0.08, type: "lowpass" });
  tone({ at: 0.24, dur: 0.08, freq: 95, gain: 0.35, type: "triangle" });
  hiss({ at: 0.24, dur: 0.04, freq: 2200, q: 1, gain: 0.25 });
}

// A wrong key: the bars jam a little.
export function miss() {
  if (!ready()) return;
  tone({ dur: 0.07, freq: 70, gain: 0.3, type: "square" });
  hiss({ dur: 0.05, freq: 600, q: 0.6, gain: 0.2, type: "lowpass" });
}

export function paper() {
  if (!ready()) return;
  hiss({ dur: 0.5, freq: 1800, q: 0.3, gain: 0.12 });
  hiss({ at: 0.15, dur: 0.35, freq: 900, q: 0.3, gain: 0.1, type: "lowpass" });
}
