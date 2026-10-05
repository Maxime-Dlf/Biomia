/**
 * Cycle de vie des objectifs (§10.5, §10.6) : tirages, votes, ravitaillement, évaluation continue
 * et attribution de la cause d'une perte.
 */
import { deriveRng } from '../core/rng.ts';
import type { CampId, GameEvent, GameState, SeatId } from '../core/types.ts';
import type { ScoreReport } from '../scoring/types.ts';
import { evaluateCondition } from './conditions.ts';
import { drawDistinct, generateObjectiveDecks } from './generation.ts';
import type {
  HeldObjective,
  ObjectiveCard,
  ObjectivesState,
  ObjectiveTier,
  ObjectiveVote,
} from './types.ts';

/** Siège réservé aux actions du serveur (expiration d'un minuteur de vote). */
export const SYSTEM_SEAT = '@system';

/** Nombre de cartes du ravitaillement (§10.5). */
export const RESUPPLY_SIZE = 3;

/** Instances actuellement détenues ou en cours de tirage (exclues d'une régénération, §10.4). */
function heldInstances(objectives: ObjectivesState): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(objectives.byCamp))
    for (const h of list) out.add(h.card.instance);
  for (const cards of Object.values(objectives.vote?.draws ?? {}))
    for (const c of cards) out.add(c.instance);
  return out;
}

/**
 * Tire `count` cartes d'un paquet sans deux instances du même modèle ; si le paquet ne suffit pas,
 * il est régénéré à partir des modèles, sans les instances détenues (§10.4).
 */
export function drawObjectives(
  state: GameState,
  objectives: ObjectivesState,
  tier: ObjectiveTier,
  count: number,
  takenTemplates: ReadonlySet<string> = new Set(),
): { drawn: ObjectiveCard[]; objectives: ObjectivesState } {
  let current = objectives;
  const first = drawDistinct(current[tier], count, takenTemplates);
  let drawn = first.drawn;
  current = { ...current, [tier]: first.rest };
  if (drawn.length < count) {
    const generation = current.generation + 1;
    const exclude = heldInstances(current);
    for (const c of drawn) exclude.add(c.instance);
    const fresh = generateObjectiveDecks(
      state.ruleSet.objectiveTemplates,
      { config: state.config, threshold: state.threshold, scorers: state.ruleSet.scorers },
      deriveRng(state.rngState, `objectives:${generation}`),
      generation,
      exclude,
    );
    const taken = new Set([...takenTemplates, ...drawn.map((c) => c.templateId)]);
    const more = drawDistinct(fresh[tier], count - drawn.length, taken);
    drawn = [...drawn, ...more.drawn];
    // Le paquet régénéré remplace le paquet épuisé ; les défausses n'y reviennent que par régénération.
    current = { ...current, [tier]: more.rest, generation };
  }
  return { drawn, objectives: current };
}

/** Tirage initial simultané : `initialHigh` haute valeur et `initialLow` faible valeur par camp (§10.5). */
export function initialDeal(state: GameState, objectives: ObjectivesState): ObjectivesState {
  const { initialHigh, initialLow } = state.config.options.objectives;
  let current = objectives;
  const draws: Record<CampId, ObjectiveCard[]> = {};
  for (const camp of Object.keys(state.camps)) {
    const high = drawObjectives(state, current, 'high', initialHigh);
    const low = drawObjectives(
      state,
      high.objectives,
      'low',
      initialLow,
      new Set(high.drawn.map((c) => c.templateId)),
    );
    current = low.objectives;
    draws[camp] = [...high.drawn, ...low.drawn];
  }
  return { ...current, vote: { kind: 'initial', draws, votes: {} } };
}

/** Sièges d'un camp. */
function seatsOf(state: GameState, camp: CampId): readonly SeatId[] {
  return state.camps[camp]?.seats ?? [];
}

/** Sièges qui n'ont pas encore voté sur toutes les cartes de leur camp. */
export function seatsWithMissingVotes(state: GameState): SeatId[] {
  const vote = state.objectives?.vote;
  if (!vote) return [];
  const out: SeatId[] = [];
  for (const [camp, cards] of Object.entries(vote.draws)) {
    for (const seat of seatsOf(state, camp)) {
      const mine = vote.votes[seat] ?? {};
      if (cards.some((c) => mine[c.id] === undefined)) out.push(seat);
    }
  }
  return out;
}

/**
 * Cartes gardées par un camp (§10.5) : majorité simple des votes exprimés, égalité ou absence de
 * vote → gardée. À l'expiration du minuteur sans aucun vote du camp : la haute valeur au tirage
 * initial, la première carte au ravitaillement. Si tout est rejeté : la carte la plus soutenue,
 * puis la plus forte valeur, puis la première du tirage.
 */
export function keptCards(
  state: GameState,
  vote: ObjectiveVote,
  camp: CampId,
  timedOut: boolean,
): ObjectiveCard[] {
  const cards = vote.draws[camp] ?? [];
  const seats = seatsOf(state, camp);
  const anyVote = seats.some((s) => Object.keys(vote.votes[s] ?? {}).length > 0);
  if (timedOut && !anyVote) {
    const fallback =
      vote.kind === 'initial' ? cards.filter((c) => c.tier === 'high') : cards.slice(0, 1);
    return fallback.length > 0 ? fallback : cards.slice(0, 1);
  }
  const tally = cards.map((card) => {
    let keep = 0;
    let reject = 0;
    for (const s of seats) {
      const v = vote.votes[s]?.[card.id];
      if (v === true) keep++;
      if (v === false) reject++;
    }
    return { card, keep, reject };
  });
  const kept = tally.filter((t) => t.keep >= t.reject).map((t) => t.card);
  if (kept.length > 0 || tally.length === 0) return kept;
  const best = [...tally].sort((a, b) => b.keep - a.keep || b.card.value - a.card.value)[0]!;
  return [best.card];
}

const freshHeld = (card: ObjectiveCard): HeldObjective => ({
  card,
  fulfilled: false,
  everFulfilled: false,
  brokenBy: null,
  lost: false,
  locked: false,
});

/** Clôture d'un vote : cartes gardées ajoutées, rejetées défaussées (§10.5). */
export function resolveVote(
  state: GameState,
  objectives: ObjectivesState,
  timedOut: boolean,
): ObjectivesState {
  const vote = objectives.vote;
  if (!vote) return objectives;
  const byCamp: Record<CampId, readonly HeldObjective[]> = { ...objectives.byCamp };
  const discard = [...objectives.discard];
  for (const [camp, cards] of Object.entries(vote.draws)) {
    const kept = new Set(keptCards(state, vote, camp, timedOut).map((c) => c.id));
    byCamp[camp] = [...(byCamp[camp] ?? []), ...cards.filter((c) => kept.has(c.id)).map(freshHeld)];
    discard.push(...cards.filter((c) => !kept.has(c.id)));
  }
  return { ...objectives, byCamp, discard, vote: null };
}

/** Le camp peut-il demander un ravitaillement : tous ses objectifs gardés sont remplis (§10.5) ? */
export function canResupply(state: GameState, camp: CampId): boolean {
  const held = state.objectives?.byCamp[camp] ?? [];
  return held.filter((h) => !h.lost).every((h) => h.fulfilled);
}

/**
 * Réévaluation continue des objectifs après une pose (§10.1, §10.6). `actingCamp` est le camp qui
 * vient de jouer : une perte provoquée par un autre camp est un objectif « brisé ».
 */
export function refreshObjectives(
  state: GameState,
  objectives: ObjectivesState,
  report: ScoreReport,
  actingCamp: CampId | null,
): { objectives: ObjectivesState; events: GameEvent[] } {
  const behavior = state.config.options.objectives.broken;
  const conditionOf = new Map(state.ruleSet.objectiveTemplates.map((t) => [t.id, t.condition]));
  const events: GameEvent[] = [];
  const byCamp: Record<CampId, readonly HeldObjective[]> = {};
  for (const [camp, held] of Object.entries(objectives.byCamp)) {
    byCamp[camp] = held.map((h) => {
      if (h.lost || h.locked) return h;
      const condition = conditionOf.get(h.card.templateId);
      if (!condition) return h;
      const now = evaluateCondition({ state, report, camp, params: h.card.params }, condition);
      if (now === h.fulfilled) return h;
      const cause = actingCamp !== null && actingCamp !== camp ? actingCamp : null;
      if (now) {
        events.push({
          type: 'ObjectiveStatusChanged',
          camp,
          cardId: h.card.id,
          fulfilled: true,
          cause,
        });
        return { ...h, fulfilled: true, everFulfilled: true, locked: behavior === 'locked' };
      }
      events.push({
        type: 'ObjectiveStatusChanged',
        camp,
        cardId: h.card.id,
        fulfilled: false,
        cause,
      });
      const lost = cause !== null && (behavior === 'lost-zero' || behavior === 'to-saboteur');
      return { ...h, fulfilled: false, brokenBy: cause, lost };
    });
  }
  return { objectives: { ...objectives, byCamp }, events };
}

/** Points d'un objectif en fin de partie (§10.6) : par camp bénéficiaire. */
export function objectiveAwards(
  state: GameState,
  camp: CampId,
  h: HeldObjective,
): { camp: CampId; points: number }[] {
  const { broken, brokenPenalty } = state.config.options.objectives;
  const value = h.card.value;
  if (h.fulfilled) return [{ camp, points: value }];
  if (h.lost && broken === 'lost-zero') return [{ camp, points: 0 }];
  if (h.lost && broken === 'to-saboteur' && h.brokenBy !== null) {
    return [
      { camp, points: 0 },
      { camp: h.brokenBy, points: value },
    ];
  }
  if (broken === 'return-fixed-penalty' && h.brokenBy !== null)
    return [{ camp, points: -brokenPenalty }];
  return [{ camp, points: -value }];
}
