// Achievements are computed from the statistics alone, so they travel with an export and need no storage of their own.
let meta = {};                                             // gameId -> { deck, solo }
export const setGames = m => { meta = m; };

const games = s => Object.keys(s).filter(k => k[0] !== '_' && s[k] && typeof s[k] === 'object');
const wins = s => games(s).reduce((a, k) => a + (s[k].won || 0), 0);
const any = (s, f) => games(s).some(k => f(s[k], k));
const count = (s, f) => games(s).filter(k => f(s[k], k)).length;
const days = s => new Set((Array.isArray(s._log) ? s._log : []).map(x => new Date(x[0]).toDateString())).size;

export const ACHIEVEMENTS = [
  { id: 'first', test: s => wins(s) >= 1 },
  { id: 'ten', test: s => wins(s) >= 10 },
  { id: 'fifty', test: s => wins(s) >= 50 },
  { id: 'streak3', test: s => any(s, x => x.bestStreak >= 3) },
  { id: 'streak5', test: s => any(s, x => x.bestStreak >= 5) },
  { id: 'explorer', test: s => count(s, x => x.played > 0) >= 5 },
  { id: 'all', test: s => Object.keys(meta).length > 0 && Object.keys(meta).every(k => s[k] && s[k].played > 0) },
  { id: 'decks', test: s => ['italian', 'french'].every(d => any(s, (x, k) => x.won > 0 && meta[k] && meta[k].deck === d)) },
  { id: 'hard', test: s => any(s, x => x.diff && x.diff.hard && x.diff.hard.won > 0) },
  { id: 'hard3', test: s => count(s, x => x.diff && x.diff.hard && x.diff.hard.won > 0) >= 3 },
  { id: 'patience', test: s => any(s, (x, k) => x.won > 0 && meta[k] && meta[k].solo) },
  { id: 'regular', test: s => days(s) >= 3 }
];

export const unlocked = stats => ACHIEVEMENTS.filter(a => a.test(stats)).map(a => a.id);
