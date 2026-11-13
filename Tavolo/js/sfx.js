// Tiny synthesised sound effects (Web Audio): no audio files to download.
import { settings } from './store.js';

const TUNES = {
  card: [[330, 0.05]],
  take: [[440, 0.06], [660, 0.09]],
  sweep: [[523, 0.08], [659, 0.08], [784, 0.16]],
  win: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.28]],
  lose: [[392, 0.15], [330, 0.15], [262, 0.3]]
};
let ctx = null;

export function sfx(name) {
  if (!settings.sound) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    let at = ctx.currentTime;
    for (const [freq, len] of TUNES[name]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.1, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at); osc.stop(at + len + 0.02);
      at += len;
    }
  } catch { /* audio not available */ }
}
