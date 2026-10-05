/**
 * Reconstruction d'un `GameState` à partir d'une `PlayerView` (§15.5) : le client en ligne s'en
 * sert pour les coups légaux, les aperçus de gain et l'affichage, sans jamais connaître
 * l'information cachée (§18.2).
 *
 * L'information cachée est remplacée par des substituts de même taille :
 * - la pioche devient `deckCount` tuiles `HIDDEN_TILE` (seul son effectif est public) ;
 * - la pool devient un compartiment unique `HIDDEN_SHAPE` de `poolCount` jetons (§22.4 T6) ;
 * - la graine et l'état du RNG sont vides ; les paquets d'objectifs sont vides ;
 * - les objectifs et les cartes de vote des autres camps sont des listes vides.
 *
 * Un état reconstruit ne doit jamais tirer : seules les actions sans tirage (choix et poses
 * provisoires, retour arrière) peuvent y être appliquées, ou des actions accompagnées des tirages
 * révélés par le serveur (`replayedDrawSource`).
 */
import { cellKey } from '../core/hex.ts';
import type { RuleSet } from '../core/ruleset.ts';
import type { GameState, PlacedTile, PlacedToken, StartTile, TileDef } from '../core/types.ts';
import type { ObjectivesState } from '../objectives/types.ts';
import type { PlayerView } from './view.ts';

/** Forme substituée aux jetons de la pool, dont la composition est cachée. */
export const HIDDEN_SHAPE = '?';

/** Tuile substituée aux tuiles de la pioche, qui est cachée. */
export const HIDDEN_TILE: TileDef = Object.freeze({
  id: '?',
  edges: Object.freeze([]),
  accepted: Object.freeze([]),
}) as TileDef;

function hydrateObjectives(view: PlayerView): ObjectivesState | null {
  const o = view.objectives;
  if (!o) return null;
  const byCamp = Object.fromEntries(
    Object.entries(o.byCamp).map(([camp, held]) => [camp, held ?? []]),
  );
  let vote: ObjectivesState['vote'] = null;
  if (o.vote) {
    const myCamp = view.viewer === 'spectator' ? null : (view.seatCamp[view.viewer] ?? null);
    const v = o.vote;
    vote = {
      kind: v.kind,
      draws: Object.fromEntries(v.camps.map((camp) => [camp, camp === myCamp ? v.cards : []])),
      votes: v.votes,
    };
  }
  return { low: [], high: [], discard: [], byCamp, vote, generation: 0 };
}

export function stateFromView(view: PlayerView, ruleSet: RuleSet): GameState {
  const tiles = new Map<string, PlacedTile>();
  for (const t of [...view.tiles].sort((a, b) => a.seq - b.seq)) tiles.set(cellKey(t.q, t.r), t);
  const tokens = new Map<string, PlacedToken>();
  for (const t of [...view.tokens].sort((a, b) => a.seq - b.seq)) tokens.set(cellKey(t.q, t.r), t);
  const startTiles: Record<string, StartTile> = {};
  if (view.ownStartTile) startTiles[view.ownStartTile.seat] = view.ownStartTile;
  return {
    ruleSet,
    config: view.config,
    seed: '',
    rngState: '',
    seqCounter: view.seqCounter,
    tileCount: view.tileCount,
    threshold: view.threshold,
    tiles,
    tokens,
    deck: Array.from({ length: view.deckCount }, () => HIDDEN_TILE),
    deckPos: 0,
    pool: view.poolCount > 0 ? { [HIDDEN_SHAPE]: view.poolCount } : {},
    market: view.market,
    camps: view.camps,
    seatCamp: view.seatCamp,
    turnCycle: view.turnCycle,
    totalTurns: view.totalTurns,
    turnIndex: view.turnIndex,
    startOrder: view.startOrder,
    startTiles,
    startIndex: view.startIndex,
    phase: view.phase,
    turn: view.turn,
    counters: view.counters,
    objectives: hydrateObjectives(view),
  };
}
