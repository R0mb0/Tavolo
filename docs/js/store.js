// Settings and player statistics, persisted in localStorage (no backend, no cookies).
const KS = 'tavolo.settings.v1', KT = 'tavolo.stats.v1';

const load = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export const settings = Object.assign({ lang: 'auto', theme: 'auto', cb: false, zoom: 1, speed: 1, sound: true, last: {} }, load(KS));
export const saveSettings = () => save(KS, settings);

let stats = load(KT);
export const getStats = () => stats;
export const resetStats = () => { stats = {}; save(KT, stats); };

export function record(gameId, result) {
  const s = stats[gameId] || (stats[gameId] = { played: 0, won: 0, lost: 0, tied: 0, streak: 0, bestStreak: 0, bestScore: 0 });
  s.played++;
  if (result.outcome === 'win') { s.won++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); }
  else { s.streak = 0; if (result.outcome === 'lose') s.lost++; else s.tied++; }
  s.bestScore = Math.max(s.bestScore, result.score || 0);
  s.last = Date.now();
  save(KT, stats);
}
