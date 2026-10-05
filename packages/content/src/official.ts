/**
 * Mods internes officiels (§15.1) et raccourcis de création de partie.
 */
import { createGame, type GameConfig, type GameState, type RuleSet } from '@crassecadia/engine';
import { coreMod } from './core/index.ts';
import { type InternalMod, resolveRuleSet } from './mod.ts';
import { objectivesCoreMod } from './objectives-core/index.ts';
import { tierA } from './tiers/tier-a.ts';
import { tierB } from './tiers/tier-b.ts';
import { tierC } from './tiers/tier-c.ts';
import { tierD } from './tiers/tier-d.ts';

const tierMod = (id: string, tiers: InternalMod['tiers']): InternalMod => ({
  id,
  version: '1.0.0',
  dependencies: ['core'],
  ...(tiers ? { tiers } : {}),
});

/** Mods internes officiels, dans leur ordre de chargement (§17.3). */
export const OFFICIAL_MODS: readonly InternalMod[] = [
  coreMod,
  tierMod('tier-a', [tierA]),
  tierMod('tier-b', [tierB]),
  tierMod('tier-c', [tierC]),
  tierMod('tier-d', [tierD]),
  objectivesCoreMod,
];

/** `RuleSet` d'une configuration n'utilisant que le contenu officiel. */
export function officialRuleSet(config: GameConfig): RuleSet {
  return resolveRuleSet(config, OFFICIAL_MODS);
}

/** Crée une partie avec le contenu officiel. */
export function createOfficialGame(config: GameConfig, seed: string): GameState {
  return createGame(config, officialRuleSet(config), seed);
}
