/**
 * `autoPlay` (§6.10) : fonction unique et remplaçable qui termine le tour à l'expiration du
 * minuteur. Elle ne dépense jamais de joker et ne fait jamais de reroll manuel.
 */
import { isTokenPlaceable } from '../core/board.ts';
import { deriveRng, type Rng } from '../core/rng.ts';
import type { Action, GameState, SeatId } from '../core/types.ts';
import { SYSTEM_SEAT, seatsWithMissingVotes } from '../objectives/flow.ts';
import { applyAction } from './apply.ts';
import { getLegalActions, legalStartPlacements } from './legal.ts';
import { activeSeat, effectiveBoard, turnStep } from './state.ts';

function pickOfType<T extends Action['type']>(
  actions: readonly Action[],
  type: T,
  rng: Rng,
): Extract<Action, { type: T }> | null {
  const ofType = actions.filter((a): a is Extract<Action, { type: T }> => a.type === type);
  return ofType.length === 0 ? null : rng.pick(ofType);
}

/** Applique une action produite par autoPlay ; elle est légale par construction. */
function step(state: GameState, action: Action): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`autoPlay a produit une action illégale (${res.reason})`);
  return res.state;
}

/**
 * Actions qui terminent le tour (ou la pose de la tuile de départ) du siège :
 * - pas de tuile posée → emplacement, cellule et rotation au hasard parmi les coups légaux
 *   (l'emplacement déjà choisi par le joueur est conservé) ;
 * - pas de jeton → jeton associé s'il est plaçable (cellule au hasard), sinon « aucun jeton »
 *   (un jeton déjà choisi par le joueur est posé au hasard) ;
 * - confirmation.
 * Le hasard est dérivé de l'état sans faire avancer le RNG de la partie.
 */
/**
 * Votes par défaut d'un siège sur ses cartes sans vote (§10.5) : la haute valeur au tirage
 * initial, la première carte au ravitaillement.
 */
export function defaultObjectiveVotes(state: GameState, seat: SeatId): Action[] {
  const vote = state.objectives?.vote;
  const camp = state.seatCamp[seat];
  if (!vote || camp === undefined) return [];
  const mine = vote.votes[seat] ?? {};
  const cards = vote.draws[camp] ?? [];
  return cards
    .filter((c) => mine[c.id] === undefined)
    .map((c) => ({
      type: 'voteObjective',
      seat,
      cardId: c.id,
      keep: vote.kind === 'initial' ? c.tier === 'high' : c.id === cards[0]!.id,
    }));
}

export function autoPlay(state: GameState, seat: SeatId): Action[] {
  if (state.phase === 'objectives') return defaultObjectiveVotes(state, seat);
  if (activeSeat(state) !== seat) return [];
  const prefix: Action[] = [];
  if (state.objectives?.vote) {
    // Ravitaillement en cours à l'expiration du minuteur : votes par défaut puis clôture.
    let s = state;
    for (const a of defaultObjectiveVotes(state, seat)) {
      prefix.push(a);
      s = step(s, a);
    }
    if (s.objectives?.vote && seatsWithMissingVotes(s).length > 0) {
      const close: Action = { type: 'closeObjectiveVote', seat: SYSTEM_SEAT };
      prefix.push(close);
      s = step(s, close);
    }
    return [...prefix, ...autoPlay(s, seat)];
  }
  const rng = deriveRng(state.rngState, `autoplay:${state.turnIndex}:${state.startIndex}`);
  if (state.phase === 'startTiles') {
    const options = legalStartPlacements(state, seat);
    return options.length === 0 ? [] : [rng.pick(options)];
  }
  if (state.phase !== 'playing' || state.turn === null) return [];

  const actions: Action[] = [];
  let s = state;
  const push = (a: Action | null) => {
    if (a === null) throw new Error('autoPlay : aucun coup légal');
    actions.push(a);
    s = step(s, a);
  };

  if (turnStep(s.turn!) === 'chooseTile') {
    // Un emplacement qui permet au moins une pose.
    const slots = getLegalActions(s, seat).filter((a) => a.type === 'chooseTile');
    const playable = slots.filter((a) => {
      const after = step(s, a);
      return getLegalActions(after, seat).some((b) => b.type === 'placeTile');
    });
    push(playable.length > 0 ? rng.pick(playable) : null);
  }
  if (turnStep(s.turn!) === 'placeTile')
    push(pickOfType(getLegalActions(s, seat), 'placeTile', rng));
  if (turnStep(s.turn!) === 'chooseToken') {
    const slot = s.turn!.slot!;
    const shape = s.market[slot]!.token;
    const board = effectiveBoard(s);
    const placeable = shape !== null && isTokenPlaceable(board.tiles, board.tokens, shape);
    push({ type: 'chooseToken', seat, slot: placeable ? slot : null });
  }
  if (turnStep(s.turn!) === 'placeToken')
    push(pickOfType(getLegalActions(s, seat), 'placeToken', rng));
  actions.push({ type: 'confirm', seat });
  return actions;
}
