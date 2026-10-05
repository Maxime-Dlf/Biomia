/**
 * `applyAction` (§15.4) : applique une action légale et retourne le nouvel état, les événements et
 * les tirages effectués. L'état d'entrée n'est jamais modifié.
 */
import { capacity } from '../core/board.ts';
import { cellKey, type Rotation } from '../core/hex.ts';
import type {
  Action,
  ActionResult,
  CampId,
  Counters,
  GameEvent,
  GameState,
  MarketSlot,
  PlacedTile,
  PlacedToken,
  TurnState,
} from '../core/types.ts';
import {
  drawObjectives,
  RESUPPLY_SIZE,
  refreshObjectives,
  resolveVote,
  seatsWithMissingVotes,
} from '../objectives/flow.ts';
import { crasseCounts, diffReports } from '../scoring/diff.ts';
import { evaluate } from '../scoring/pipeline.ts';
import type { ScoreReport } from '../scoring/types.ts';
import { checkAction } from './check.ts';
import { DrawSession, type DrawSource, defaultDrawSource } from './draws.ts';
import {
  autoReroll,
  canAutoReroll,
  manualReroll,
  marketTokens,
  refillMarket,
  type TokenTaken,
} from './market.ts';
import { campOf, currentRound, startTileCells, turnStep } from './state.ts';

/** Transaction d'une action : état courant, événements et session de tirage paresseuse. */
class Transaction {
  readonly events: GameEvent[] = [];
  private session: DrawSession | null = null;

  constructor(
    public state: GameState,
    private readonly source: DrawSource | undefined,
  ) {}

  update(patch: Partial<GameState>): void {
    if ('pool' in patch && this.session)
      throw new Error('La pool est gérée par la session de tirage');
    this.state = { ...this.state, ...patch };
  }

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  draws(): DrawSession {
    if (this.session === null) {
      const s = this.state;
      this.session = new DrawSession(
        this.source ?? defaultDrawSource(s.rngState),
        s.deck,
        s.deckPos,
        s.pool,
      );
    }
    return this.session;
  }

  result(): ActionResult {
    let state = this.state;
    const session = this.session;
    if (session) {
      state = {
        ...state,
        deckPos: session.deckPos,
        pool: session.pool,
        rngState: session.rngState(state.rngState),
      };
    }
    return { ok: true, state, events: this.events, draws: session?.records ?? [] };
  }
}

function updateCounters(
  state: GameState,
  camp: CampId,
  patch: (c: Counters) => Counters,
): GameState['counters'] {
  return { ...state.counters, [camp]: patch(state.counters[camp]!) };
}

/**
 * Événements de crasse (vols, invalidations, blocages) par différence des rapports avant et après
 * une pose, et mise à jour des compteurs permanents du camp qui joue (§7.4, §10.1).
 */
function recordScoringEvents(tx: Transaction, before: GameState, camp: CampId): void {
  const after = evaluate(tx.state, { final: false });
  const events = diffReports(evaluate(before, { final: false }), after);
  for (const e of events) tx.emit(e);
  const { steals, invalidations } = crasseCounts(events, camp);
  if (steals > 0 || invalidations > 0) {
    tx.update({
      counters: updateCounters(tx.state, camp, (c) => ({
        ...c,
        steals: c.steals + steals,
        invalidations: c.invalidations + invalidations,
      })),
    });
  }
  refreshObjectiveStatuses(tx, camp, after);
}

/** Réévalue les objectifs de tous les camps (§10.1) ; `actingCamp` sert à détecter une crasse (§10.6). */
function refreshObjectiveStatuses(
  tx: Transaction,
  actingCamp: CampId | null,
  report?: ScoreReport,
): void {
  const objectives = tx.state.objectives;
  if (!objectives) return;
  const res = refreshObjectives(
    tx.state,
    objectives,
    report ?? evaluate(tx.state, { final: false }),
    actingCamp,
  );
  for (const e of res.events) tx.emit(e);
  tx.update({ objectives: res.objectives });
}

/** Clôt le vote d'objectifs en cours (§10.5), puis poursuit la mise en place après le tirage initial. */
function closeVote(tx: Transaction, timedOut: boolean): void {
  const s = tx.state;
  const vote = s.objectives!.vote!;
  const resolved = resolveVote(s, s.objectives!, timedOut);
  tx.update({ objectives: resolved });
  for (const camp of Object.keys(vote.draws)) {
    const before = s.objectives!.byCamp[camp]?.length ?? 0;
    tx.emit({ type: 'ObjectivesKept', camp, count: (resolved.byCamp[camp]?.length ?? 0) - before });
  }
  refreshObjectiveStatuses(tx, null);
  if (vote.kind === 'initial') {
    tx.update({ phase: 'startTiles' });
    tx.emit({ type: 'PhaseChanged', phase: 'startTiles' });
  }
}

/** Début d'un tour : nouveau `TurnState`, puis reroll automatique éventuel (§6.1, §6.2). */
function beginTurn(tx: Transaction): void {
  const s = tx.state;
  const seat = s.turnCycle[s.turnIndex % s.turnCycle.length]!;
  const turn: TurnState = {
    seat,
    slot: null,
    tilePlacement: null,
    tokenChoice: null,
    tokenPlacement: null,
    manualRerollUsed: false,
    resupplyUsed: false,
  };
  tx.update({ turn });
  tx.emit({ type: 'TurnStarted', seat, turnIndex: s.turnIndex, round: currentRound(s) });
  if (s.config.options.autoReroll) {
    const session = tx.draws();
    if (canAutoReroll(s.market, session.pool)) {
      const before = marketTokens(s.market);
      const market = autoReroll(s.market, session);
      tx.update({ market });
      tx.emit({ type: 'Rerolled', seat, mode: 'auto', before, after: marketTokens(market) });
    }
  }
}

function advanceTurn(tx: Transaction): void {
  const next = tx.state.turnIndex + 1;
  if (next >= tx.state.totalTurns) {
    tx.update({ turnIndex: next, phase: 'ended', turn: null });
    tx.emit({ type: 'PhaseChanged', phase: 'ended' });
    tx.emit({ type: 'GameEnded' });
    return;
  }
  tx.update({ turnIndex: next });
  beginTurn(tx);
}

/** Pose d'une tuile de départ, puis marché initial après la dernière (§5.6, §5.7). */
function placeStartTile(
  tx: Transaction,
  action: Extract<Action, { type: 'placeStartTile' }>,
): void {
  const s = tx.state;
  const seat = action.seat;
  const camp = campOf(s, seat);
  const tiles = new Map(s.tiles);
  let seq = s.seqCounter;
  for (const cell of startTileCells(s, seat, action.q, action.r, action.orientation)) {
    const tile: PlacedTile = {
      def: cell.def,
      q: cell.q,
      r: cell.r,
      rotation: cell.rotation,
      placedBy: seat,
      seq: ++seq,
    };
    tiles.set(cellKey(cell.q, cell.r), tile);
    tx.emit({ type: 'TilePlaced', seat, camp, tile, start: true });
  }
  const startIndex = s.startIndex + 1;
  tx.update({ tiles, seqCounter: seq, startIndex });
  recordScoringEvents(tx, s, camp);
  if (startIndex < s.startOrder.length) return;

  const session = tx.draws();
  const market: MarketSlot[] = [];
  for (let i = 0; i < s.config.marketSize; i++) {
    const tile = session.drawTile();
    market.push({ tile, token: session.drawToken() });
  }
  tx.update({ market, phase: 'playing' });
  tx.emit({ type: 'PhaseChanged', phase: 'playing' });
  tx.emit({ type: 'MarketRefilled', market, slots: market.map((_, i) => i) });
  beginTurn(tx);
}

/** Confirmation : pose définitive, jokers, regarnissage, tour suivant (§6.5 à §6.9). */
function confirmTurn(tx: Transaction): void {
  const s = tx.state;
  const turn = s.turn!;
  const seat = turn.seat;
  const camp = campOf(s, seat);
  const slot = turn.slot!;
  const tp = turn.tilePlacement!;
  const choice = turn.tokenChoice!;
  let seq = s.seqCounter;

  const tiles = new Map(s.tiles);
  const tile: PlacedTile = {
    def: s.market[slot]!.tile!,
    q: tp.q,
    r: tp.r,
    rotation: tp.rotation,
    placedBy: seat,
    seq: ++seq,
  };
  tiles.set(cellKey(tp.q, tp.r), tile);
  tx.emit({ type: 'TilePlaced', seat, camp, tile, start: false });

  let tokens = s.tokens;
  let jokers = s.camps[camp]!.jokers;
  let counters = s.counters;
  let taken: TokenTaken = { kind: 'none' };
  if (choice.slot !== null) {
    const p = turn.tokenPlacement!;
    const token: PlacedToken = {
      shape: s.market[choice.slot]!.token!,
      q: p.q,
      r: p.r,
      placedBy: seat,
      seq: ++seq,
    };
    const nextTokens = new Map(tokens);
    nextTokens.set(cellKey(p.q, p.r), token);
    tokens = nextTokens;
    tx.emit({ type: 'TokenPlaced', seat, camp, token });
    counters = updateCounters(s, camp, (c) => ({ ...c, tokensPlaced: c.tokensPlaced + 1 }));
    if (choice.slot === slot) {
      taken = { kind: 'associated' };
    } else {
      taken = { kind: 'joker', slot: choice.slot };
      jokers -= 1;
      tx.emit({ type: 'JokerSpent', camp, amount: 1 });
    }
    // Bonus monochrome : jeton posé sur une tuile de capacité 1 (§6.6).
    const bonus = s.config.options.monoBonus;
    if (bonus > 0 && capacity(tiles.get(cellKey(p.q, p.r))!.def) === 1) {
      jokers += bonus;
      counters = {
        ...counters,
        [camp]: { ...counters[camp]!, monoBonuses: counters[camp]!.monoBonuses + 1 },
      };
      tx.emit({ type: 'JokerGained', camp, amount: bonus, reason: 'monochrome' });
    }
  }

  tx.update({
    tiles,
    tokens,
    seqCounter: seq,
    camps: { ...s.camps, [camp]: { ...s.camps[camp]!, jokers } },
    counters,
  });
  recordScoringEvents(tx, s, camp);
  const { market, slots } = refillMarket(s.market, slot, taken, tx.draws());
  tx.update({ market, turn: null });
  tx.emit({ type: 'MarketRefilled', market, slots });
  tx.emit({ type: 'TurnEnded', seat, turnIndex: s.turnIndex });
  advanceTurn(tx);
}

/** Retour arrière : annule la dernière action provisoire du tour (§6.7). */
function undo(turn: TurnState): TurnState {
  switch (turnStep(turn)) {
    case 'placeTile':
      return { ...turn, slot: null };
    case 'chooseToken':
      return { ...turn, tilePlacement: null };
    case 'placeToken':
      return { ...turn, tokenChoice: null };
    case 'confirm':
      return turn.tokenPlacement !== null
        ? { ...turn, tokenPlacement: null }
        : { ...turn, tokenChoice: null };
    case 'chooseTile':
      return turn;
  }
}

export function applyAction(state: GameState, action: Action, source?: DrawSource): ActionResult {
  const reason = checkAction(state, action);
  if (reason !== null) return { ok: false, reason };
  const tx = new Transaction(state, source);
  const turn = state.turn;
  switch (action.type) {
    case 'placeStartTile':
      placeStartTile(tx, action);
      break;
    case 'reroll': {
      const market = manualReroll(state.market, tx.draws());
      tx.update({ market, turn: { ...turn!, manualRerollUsed: true } });
      tx.emit({
        type: 'Rerolled',
        seat: action.seat,
        mode: 'manual',
        before: marketTokens(state.market),
        after: marketTokens(market),
      });
      break;
    }
    case 'chooseTile':
      tx.update({ turn: { ...turn!, slot: action.slot } });
      break;
    case 'placeTile':
      tx.update({
        turn: {
          ...turn!,
          tilePlacement: { q: action.q, r: action.r, rotation: action.rotation as Rotation },
        },
      });
      break;
    case 'chooseToken':
      tx.update({ turn: { ...turn!, tokenChoice: { slot: action.slot } } });
      break;
    case 'placeToken':
      tx.update({ turn: { ...turn!, tokenPlacement: { q: action.q, r: action.r } } });
      break;
    case 'undo':
      tx.update({ turn: undo(turn!) });
      break;
    case 'confirm':
      confirmTurn(tx);
      break;
    case 'requestObjectives': {
      // Ravitaillement : 3 objectifs de faible valeur, vote du camp (§10.5).
      const camp = campOf(state, action.seat);
      const drawn = drawObjectives(state, state.objectives!, 'low', RESUPPLY_SIZE);
      tx.update({
        turn: { ...turn!, resupplyUsed: true },
        objectives: {
          ...drawn.objectives,
          vote: { kind: 'resupply', draws: { [camp]: drawn.drawn }, votes: {} },
        },
      });
      tx.emit({ type: 'ObjectivesDrawn', kind: 'resupply', camps: [camp] });
      break;
    }
    case 'voteObjective': {
      const objectives = state.objectives!;
      const vote = objectives.vote!;
      const votes = {
        ...vote.votes,
        [action.seat]: { ...vote.votes[action.seat], [action.cardId]: action.keep },
      };
      tx.update({ objectives: { ...objectives, vote: { ...vote, votes } } });
      if (seatsWithMissingVotes(tx.state).length === 0) closeVote(tx, false);
      break;
    }
    case 'closeObjectiveVote':
      closeVote(tx, true);
      break;
  }
  return tx.result();
}
