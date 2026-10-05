/**
 * Politiques de bots (§11.5), partagées par le pilote hors-ligne et le serveur. Les bots utilisent
 * les mêmes fonctions que le serveur (`getLegalActions`, `evaluate`) :
 * - **Facile** : coup légal aléatoire, pondéré vers les poses qui ne font pas perdre de points ;
 * - **Moyen** : glouton, maximise le gain immédiat de son camp ;
 * - **Rusé** : glouton sur `gain_propre − 0,7 × gain_du_meilleur_adversaire`, sur un échantillon de
 *   coups ; il utilise les jokers.
 *
 * Le gain se mesure sur le rapport provisoire (§7.4), en entiers : les utilités sont multipliées
 * par 10 pour garder le coefficient 0,7 entier (§15.1). Les jokers, qui ne comptent qu'en fin de
 * partie, sont ajoutés à la main (+1 par bonus monochrome, −1 par joker dépensé, §4.2).
 */
import { capacity } from '../core/board.ts';
import { cellKey } from '../core/hex.ts';
import type { Rng } from '../core/rng.ts';
import type { Action, BotLevel, CampId, GameState, SeatId } from '../core/types.ts';
import { applyAction } from '../flow/apply.ts';
import { defaultObjectiveVotes } from '../flow/autoplay.ts';
import { getLegalActions } from '../flow/legal.ts';
import { turnStep } from '../flow/state.ts';
import { evaluate } from '../scoring/pipeline.ts';
import { randomAction } from './random.ts';

/** Échantillons de coups évalués à chaque étape (coût borné, §20.2). */
const SAMPLE = {
  easy: 6,
  tilesPerSlot: 10,
  tiles: 20,
  tokens: 10,
  lookahead: 2,
} as const;

type Scores = Readonly<Record<CampId, number>>;

function scores(state: GameState): Scores {
  const out: Record<CampId, number> = {};
  for (const [camp, s] of Object.entries(evaluate(state, { provisional: true }).byCamp)) {
    out[camp] = s.total;
  }
  return out;
}

function sample<T>(items: readonly T[], k: number, rng: Rng): T[] {
  return items.length <= k ? [...items] : rng.shuffle(items).slice(0, k);
}

function step(state: GameState, action: Action): GameState | null {
  const res = applyAction(state, action);
  return res.ok ? res.state : null;
}

/** Évaluation d'une suite de poses provisoires, par rapport au début de la décision. */
class Judge {
  readonly camp: CampId;
  private readonly base: Scores;

  constructor(
    readonly level: BotLevel,
    readonly state: GameState,
    seat: SeatId,
  ) {
    this.camp = state.seatCamp[seat]!;
    this.base = scores(state);
  }

  /** Utilité ×10 de l'état `s` ; `jokers` = jokers gagnés (+) ou dépensés (−) par le coup. */
  utility(s: GameState, jokers = 0): number {
    const now = scores(s);
    const own = (now[this.camp] ?? 0) - (this.base[this.camp] ?? 0) + jokers;
    if (this.level !== 'cunning') return 10 * own;
    let best = 0;
    for (const camp of Object.keys(now)) {
      if (camp === this.camp) continue;
      best = Math.max(best, (now[camp] ?? 0) - (this.base[camp] ?? 0));
    }
    return 10 * own - 7 * best;
  }
}

/** Jokers gagnés par un jeton posé sur la cellule (bonus monochrome, §6.6). */
function monoJokers(state: GameState, q: number, r: number): number {
  const tile = state.tiles.get(cellKey(q, r));
  const bonus = state.config.options.monoBonus;
  // Tuile provisoire du tour : pas encore sur le plateau, on lit le marché.
  const def = tile?.def ?? (state.turn?.slot != null ? state.market[state.turn.slot]?.tile : null);
  return bonus > 0 && def && capacity(def) === 1 ? bonus : 0;
}

/** Meilleure action d'une liste selon l'utilité de l'état obtenu (premier en cas d'égalité). */
function best<A extends Action>(
  judge: Judge,
  actions: readonly A[],
  value: (next: GameState, action: A) => number,
): { action: A; value: number } | null {
  let out: { action: A; value: number } | null = null;
  for (const a of actions) {
    const next = step(judge.state, a);
    if (!next) continue;
    const v = value(next, a);
    if (out === null || v > out.value) out = { action: a, value: v };
  }
  return out;
}

const ofType = <T extends Action['type']>(actions: readonly Action[], type: T) =>
  actions.filter((a): a is Extract<Action, { type: T }> => a.type === type);

/** Valeur de la meilleure pose du jeton choisi, depuis un état à l'étape `placeToken`. */
function bestTokenPlacement(judge: Judge, state: GameState, seat: SeatId, rng: Rng, spent: number) {
  const options = sample(ofType(getLegalActions(state, seat), 'placeToken'), SAMPLE.tokens, rng);
  let out = Number.NEGATIVE_INFINITY;
  for (const a of options) {
    const next = step(state, a);
    if (next) out = Math.max(out, judge.utility(next, monoJokers(state, a.q, a.r) - spent));
  }
  return out;
}

/** Valeur d'un état à l'étape `chooseToken` : « aucun jeton » ou le jeton associé. */
function tokenLookahead(judge: Judge, state: GameState, seat: SeatId, rng: Rng): number {
  let out = judge.utility(state);
  const slot = state.turn?.slot;
  if (slot == null) return out;
  const chosen = step(state, { type: 'chooseToken', seat, slot });
  if (chosen) out = Math.max(out, bestTokenPlacement(judge, chosen, seat, rng, 0));
  return out;
}

/** Valeur d'un état à l'étape `placeTile` : meilleures poses échantillonnées, avec le jeton. */
function tileLookahead(judge: Judge, state: GameState, seat: SeatId, rng: Rng, k: number) {
  const placements = sample(ofType(getLegalActions(state, seat), 'placeTile'), k, rng);
  const ranked = placements
    .map((a) => ({ a, next: step(state, a) }))
    .filter((x): x is { a: (typeof placements)[number]; next: GameState } => x.next !== null)
    .map((x) => ({ ...x, v: judge.utility(x.next) }))
    .sort((p, q) => q.v - p.v)
    .slice(0, SAMPLE.lookahead);
  let out: { action: (typeof placements)[number]; value: number } | null = null;
  for (const { a, next } of ranked) {
    const v = tokenLookahead(judge, next, seat, rng);
    if (out === null || v > out.value) out = { action: a, value: v };
  }
  return out;
}

/** Votes d'objectifs (§10.5) : Facile vote par défaut ; Moyen et Rusé ne gardent que le moins risqué. */
function voteAction(level: BotLevel, state: GameState, seat: SeatId): Action | null {
  const defaults = defaultObjectiveVotes(state, seat);
  if (level === 'easy' || defaults.length === 0) return defaults[0] ?? null;
  const vote = state.objectives!.vote!;
  const cards = vote.draws[state.seatCamp[seat]!] ?? [];
  const keep = [...cards].sort((a, b) => a.value - b.value)[0]!;
  const first = defaults[0] as Extract<Action, { type: 'voteObjective' }>;
  return { ...first, keep: first.cardId === keep.id };
}

/** Facile : une pose au hasard parmi celles qui ne font pas perdre de points (§11.5). */
function easyPlacement(state: GameState, seat: SeatId, legal: readonly Action[], rng: Rng) {
  const judge = new Judge('easy', state, seat);
  const scored = sample(legal, SAMPLE.easy, rng).map((a) => {
    const next = step(state, a);
    return { a, v: next ? judge.utility(next) : Number.NEGATIVE_INFINITY };
  });
  const safe = scored.filter((x) => x.v >= 0);
  if (safe.length > 0) return rng.pick(safe).a;
  return scored.reduce((p, q) => (q.v > p.v ? q : p)).a;
}

/** Prochaine action d'un bot du niveau donné, ou `null` s'il n'a rien à faire. */
export function botAction(
  level: BotLevel,
  state: GameState,
  seat: SeatId,
  rng: Rng,
): Action | null {
  const legal = getLegalActions(state, seat);
  if (legal.length === 0) return null;
  if (state.objectives?.vote) return voteAction(level, state, seat);
  if (state.phase === 'startTiles') {
    if (level === 'easy') return easyPlacement(state, seat, legal, rng);
    const judge = new Judge(level, state, seat);
    return (
      best(judge, sample(legal, SAMPLE.tiles, rng), (next) => judge.utility(next))?.action ??
      legal[0]!
    );
  }
  if (state.phase !== 'playing' || state.turn === null) return null;
  const progress = legal.filter((a) => a.type !== 'undo' && a.type !== 'requestObjectives');

  if (level === 'easy') {
    const placements = progress.filter((a) => a.type === 'placeTile' || a.type === 'placeToken');
    if (placements.length > 0) return easyPlacement(state, seat, placements, rng);
    if (turnStep(state.turn) === 'chooseToken') {
      // Jeton associé ou aucun : seul le Rusé paie un joker (§11.5).
      const slot = state.turn.slot;
      return rng.pick(
        ofType(progress, 'chooseToken').filter((a) => a.slot === null || a.slot === slot),
      );
    }
    return randomAction(state, seat, rng, { undoPercent: 0, rerollPercent: 50 });
  }

  const judge = new Judge(level, state, seat);
  switch (turnStep(state.turn)) {
    case 'chooseTile': {
      let out: { action: Action; value: number } | null = null;
      for (const a of ofType(progress, 'chooseTile')) {
        const next = step(state, a);
        const v = next ? tileLookahead(judge, next, seat, rng, SAMPLE.tilesPerSlot) : null;
        if (v && (out === null || v.value > out.value)) out = { action: a, value: v.value };
      }
      return out?.action ?? rng.pick(progress);
    }
    case 'placeTile':
      return tileLookahead(judge, state, seat, rng, SAMPLE.tiles)?.action ?? rng.pick(progress);
    case 'chooseToken': {
      const slot = state.turn.slot!;
      const choices = ofType(progress, 'chooseToken').filter(
        // Seul le Rusé paie un joker pour un autre jeton (§11.5).
        (a) => a.slot === null || a.slot === slot || level === 'cunning',
      );
      return (
        best(judge, choices, (next, a) =>
          a.slot === null
            ? judge.utility(next)
            : bestTokenPlacement(judge, next, seat, rng, a.slot === slot ? 0 : 1),
        )?.action ?? rng.pick(progress)
      );
    }
    case 'placeToken': {
      const spent = state.turn.tokenChoice?.slot !== state.turn.slot ? 1 : 0;
      const options = sample(ofType(progress, 'placeToken'), SAMPLE.tokens, rng);
      return (
        best(judge, options, (next, a) => judge.utility(next, monoJokers(state, a.q, a.r) - spent))
          ?.action ?? rng.pick(progress)
      );
    }
    case 'confirm':
      return progress.find((a) => a.type === 'confirm') ?? null;
  }
}
