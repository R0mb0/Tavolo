// Registry of rule engines. A game JSON picks one with its "engine" field.
import { createTrickGame } from './trick.js';
import { createFishingGame } from './fishing.js';

export const ENGINES = {
  trick: createTrickGame,
  fishing: createFishingGame
};
