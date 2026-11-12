// Registry of rule engines. A game JSON picks one with its "engine" field.
import { createTrickGame } from './trick.js';
import { createFishingGame } from './fishing.js';
import { createPatienceGame } from './patience.js';
import { createSheddingGame } from './shedding.js';
import { createRummyGame } from './rummy.js';
import { createBurracoGame } from './burraco.js';
import { createMachiavelliGame } from './machiavelli.js';
import { createBankingGame } from './banking.js';
import { createCalledGame } from './called.js';

export const ENGINES = {
  trick: createTrickGame,
  fishing: createFishingGame,
  patience: createPatienceGame,
  shedding: createSheddingGame,
  rummy: createRummyGame,
  burraco: createBurracoGame,
  machiavelli: createMachiavelliGame,
  banking: createBankingGame,
  called: createCalledGame
};
