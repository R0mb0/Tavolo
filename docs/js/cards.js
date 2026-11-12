// Deck definitions and card rendering. All card art is original (inline SVG / text glyphs).

export const DECKS = {
  italian: { suits: ['denari', 'coppe', 'spade', 'bastoni'], ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  french: { suits: ['spades', 'hearts', 'diamonds', 'clubs'], ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] }
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
    ? `<button type="button" class="card back${cls}"${opts.disabled ? ' disabled' : ''} aria-label="?"${opts.attrs || ''}></button>`
    : `<${tag} class="card back${cls}" aria-hidden="true"></${tag}>`;
  let idx, mid;
  if (card.deck === 'french') {
    const r = FR_RANK[card.r] || card.r;
    idx = `${r}<b>${FR_SUIT[card.s]}</b>`;
    mid = `<div class="court"><span>${FR_SUIT[card.s]}</span></div>`;
  } else {
    idx = `${card.r}${icon(card.s)}`;
    mid = card.r >= 8
      ? `<div class="court"><span>${COURT[card.r]}</span>${icon(card.s)}</div>`
      : `<div class="pips n${card.r}">${icon(card.s).repeat(card.r)}</div>`;
  }
  const attrs = tag === 'button'
    ? ` type="button"${opts.disabled ? ' disabled' : ''} aria-label="${opts.label || ''}"`
    : ` role="img" aria-label="${opts.label || ''}"`;
  return `<${tag} class="card face s-${card.s}${cls}" data-id="${card.id}"${attrs}${opts.attrs || ''}>` +
    `<span class="idx">${idx}</span>${mid}<span class="idx br">${idx}</span></${tag}>`;
}
