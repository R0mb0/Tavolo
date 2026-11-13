// Deck definitions and card rendering. All card art is original (inline SVG / text glyphs).

export const DECKS = {
  italian: { suits: ['denari', 'coppe', 'spade', 'bastoni'], ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  french: { suits: ['spades', 'hearts', 'diamonds', 'clubs'], ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  // Spanish 40-card deck: 8, 9 and 10 are sota, caballo and rey (printed 10, 11, 12 on the cards)
  spanish: { suits: ['oros', 'copas', 'espadas', 'bastos'], ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  // German 32-card deck: 11 Unter, 12 Ober, 13 König, 14 Ass
  german: { suits: ['eichel', 'laub', 'herz', 'schellen'], ranks: [7, 8, 9, 10, 11, 12, 13, 14] }
};

// Ranks that have a name instead of a number, with the prefix of their translation key.
const NAMED = { italian: ['rank.', [1, 8, 9, 10]], french: ['frank.', [1, 11, 12, 13]], spanish: ['srank.', [1, 8, 9, 10]], german: ['grank.', [11, 12, 13, 14]] };
/** Spoken name of a card ("King · Hearts"); `t` is the translation function. */
export const cardLabel = (c, t) => {
  const [pre, named] = NAMED[c.deck] || NAMED.italian;
  return `${named.includes(c.r) ? t(pre + c.r) : c.r} · ${t('suit.' + c.s)}`;
};

export function buildDeck(deckId, remove = []) {
  const d = DECKS[deckId];
  const out = [];
  for (const s of d.suits) for (const r of d.ranks) {
    const id = `${r}-${s}`;
    if (!remove.includes(id)) out.push({ id, r, s, deck: deckId });
  }
  return out;
}

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Court figures of the Italian deck (8 = knave, 9 = knight, 10 = king), text presentation forced.
const COURT = { 8: '♟︎', 9: '♞︎', 10: '♚︎' };
const FR_RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const FR_SUIT = { spades: '♠︎', hearts: '♥︎', diamonds: '♦︎', clubs: '♣︎' };
export const suitHTML = (deck, s) => (deck === 'french' ? `<span class="s-${s}">${FR_SUIT[s]}</span>` : `<svg class="si s-${s}" aria-hidden="true"><use href="#s-${s}"/></svg>`);
const icon = s => `<svg class="si" aria-hidden="true"><use href="#s-${s}"/></svg>`;

/**
 * Returns the HTML of a card. `card` null/undefined renders a face-down card.
 * opts: { tag: 'div'|'button', cls: extra classes, label: accessible name, disabled: bool, attrs: extra attributes }
 */
export function cardHTML(card, opts = {}) {
  const tag = opts.tag || 'div';
  const cls = opts.cls ? ' ' + opts.cls : '';
  if (!card) return tag === 'button'
    ? `<button type="button" class="card back${cls}"${opts.disabled ? ' disabled' : ''} aria-label="${opts.label || '?'}"${opts.attrs || ''}></button>`
    : `<${tag} class="card back${cls}" aria-hidden="true"></${tag}>`;
  let idx, mid;
  if (card.r === 0) {                                   // joker
    idx = '★';
    mid = '<div class="court"><span>★</span><small>JOLLY</small></div>';
  } else if (card.deck === 'french') {
    const r = FR_RANK[card.r] || card.r;
    idx = `${r}<b>${FR_SUIT[card.s]}</b>`;
    mid = `<div class="court"><span>${FR_SUIT[card.s]}</span></div>`;
  } else if (card.deck === 'spanish' || card.deck === 'german') {
    const de = card.deck === 'german', r = card.r;
    const fig = k => `<svg class="fig" aria-hidden="true"><use href="#f-${k}"/></svg>`;
    idx = `${de ? { 11: 'U', 12: 'O', 13: 'K', 14: 'A' }[r] || r : r >= 8 ? r + 2 : r}${icon(card.s)}`;
    mid = de
      ? (r === 14 ? `<div class="pips n1">${icon(card.s)}</div>`
        : r >= 11 ? `<div class="court r${r}">${fig(r === 13 ? 10 : 8)}${icon(card.s)}</div>`
        : `<div class="pips n${r}">${icon(card.s).repeat(r)}</div>`)
      : (r >= 8 ? `<div class="court">${fig(r)}${icon(card.s)}</div>` : `<div class="pips n${r}">${icon(card.s).repeat(r)}</div>`);
  } else {
    idx = `${card.r}${icon(card.s)}`;
    mid = card.r >= 8
      ? `<div class="court"><span>${COURT[card.r]}</span><svg class="fig" aria-hidden="true"><use href="#f-${card.r}"/></svg>${icon(card.s)}</div>`
      : `<div class="pips n${card.r}">${icon(card.s).repeat(card.r)}</div>`;
  }
  const attrs = tag === 'button'
    ? ` type="button"${opts.disabled ? ' disabled' : ''} aria-label="${opts.label || ''}"`
    : ` role="img" aria-label="${opts.label || ''}"`;
  return `<${tag} class="card face${{ italian: ' it', spanish: ' es', german: ' de' }[card.deck] || ''} s-${card.s}${cls}" data-id="${card.id}"${attrs}${opts.attrs || ''}>` +
    `<span class="idx">${idx}</span>${mid}<span class="idx br">${idx}</span></${tag}>`;
}
