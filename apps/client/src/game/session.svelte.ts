/**
 * Session de jeu réactive : relie le pilote à l'interface. Calcule les coups légaux du siège local,
 * les aperçus de gain (calcul local par le moteur, §13.2) et porte l'état d'interaction (rotation,
 * survol). Toute action passe par le pilote : « le client demande, le serveur décide » (§15.1).
 */
import {
  type Action,
  actingSeats,
  activeSeat,
  applyAction,
  type CampId,
  cellKey,
  chosenTile,
  chosenTokenShape,
  effectiveBoard,
  evaluate,
  type GameEvent,
  type GameState,
  getLegalActions,
  type Hex,
  isTokenPlaceable,
  type ScoreReport,
  type SeatId,
  type TurnStep,
  turnStep,
} from '@crassecadia/engine';
import type { ConnectionStatus, DriverUpdate, GameDriver } from './driver.ts';

export interface LogEntry {
  readonly id: number;
  readonly turnIndex: number;
  readonly event: GameEvent;
}

const MAX_LOG = 200;

export class GameSession {
  state: GameState = $state.raw(null as unknown as GameState);
  deadline: number | null = $state(null);
  log: LogEntry[] = $state.raw([]);
  /** Tous les événements de la partie, pour la chronologie des crasses en fin de partie (§11.3). */
  history: GameEvent[] = [];
  rotation = $state(0);
  hover: Hex | null = $state(null);
  message: string | null = $state(null);
  /** `ScoreReport` officiel du serveur (§15.5), `null` en local. */
  serverReport: ScoreReport | null = $state.raw(null);
  connection: ConnectionStatus = $state('online');
  /** Siège dont l'écran est affiché en partie à plusieurs sur un écran. */
  viewerSeat: SeatId = $state('');
  private nextLogId = 0;
  /** Abonnés aux lots d'événements (animations, sons, §14.5). */
  private readonly eventListeners = new Set<(events: readonly GameEvent[]) => void>();
  private readonly unsubscribe: () => void;

  constructor(readonly driver: GameDriver) {
    // Un spectateur n'a pas de siège : il ne voit que l'information publique.
    this.viewerSeat = driver.spectator
      ? ''
      : (driver.localSeats[0] ?? driver.current.state.config.seats[0]!.id);
    this.unsubscribe = driver.subscribe((u) => this.onUpdate(u));
  }

  onEvents(listener: (events: readonly GameEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  dispose(): void {
    this.eventListeners.clear();
    this.unsubscribe();
    this.driver.dispose();
  }

  private onUpdate(u: DriverUpdate): void {
    this.state = u.state;
    this.deadline = u.deadline;
    if (u.report !== undefined) this.serverReport = u.report;
    if (u.connection !== undefined) this.connection = u.connection;
    if (u.rejected) this.message = u.rejected;
    if (u.events.length > 0) {
      for (const l of this.eventListeners) l(u.events);
      this.history.push(...u.events);
      const entries = u.events.map((event) => ({
        id: this.nextLogId++,
        turnIndex: u.state.turnIndex,
        event,
      }));
      this.log = [...this.log, ...entries].slice(-MAX_LOG);
    }
    // En partie à plusieurs sur un écran, l'écran suit le siège local qui doit agir.
    const acting = this.localActingSeats;
    if (acting.length > 0 && !acting.includes(this.viewerSeat)) this.viewerSeat = acting[0]!;
  }

  /* ------------------------------------------------------------------ dérivés */

  readonly activeSeat: SeatId | null = $derived(this.state ? activeSeat(this.state) : null);
  readonly localActingSeats: SeatId[] = $derived(
    this.state ? actingSeats(this.state).filter((s) => this.driver.localSeats.includes(s)) : [],
  );
  /** Le siège affiché peut-il agir maintenant ? */
  readonly canAct: boolean = $derived(this.localActingSeats.includes(this.viewerSeat));
  readonly viewerCamp: CampId = $derived(this.state?.seatCamp[this.viewerSeat] ?? this.viewerSeat);
  readonly step: TurnStep | null = $derived(
    this.state?.phase === 'playing' && this.state.turn ? turnStep(this.state.turn) : null,
  );
  readonly legal: Action[] = $derived(
    this.canAct ? getLegalActions(this.state, this.viewerSeat) : [],
  );
  /** Rapport affiché : celui du serveur en ligne, sinon calculé sur place. */
  readonly report: ScoreReport = $derived(this.serverReport ?? evaluate(this.state));
  readonly campOrder: CampId[] = $derived(this.state ? Object.keys(this.state.camps) : []);

  has(type: Action['type']): boolean {
    return this.legal.some((a) => a.type === type);
  }

  /** Cellules légales pour la tuile choisie, avec la rotation courante. */
  readonly tileTargets: Hex[] = $derived(
    this.legal.filter(
      (a): a is Extract<Action, { type: 'placeTile' }> =>
        a.type === 'placeTile' && a.rotation === this.rotation,
    ),
  );
  readonly tokenTargets: Hex[] = $derived(
    this.legal.filter((a): a is Extract<Action, { type: 'placeToken' }> => a.type === 'placeToken'),
  );
  readonly startTargets: Extract<Action, { type: 'placeStartTile' }>[] = $derived(
    this.legal.filter(
      (a): a is Extract<Action, { type: 'placeStartTile' }> => a.type === 'placeStartTile',
    ),
  );

  /** Jetons du marché plaçables sur le plateau effectif (halo rouge sinon, §6.4). */
  readonly placeable: boolean[] = $derived.by(() => {
    if (!this.state) return [];
    const board = effectiveBoard(this.state);
    return this.state.market.map(
      (m) => m.token !== null && isTokenPlaceable(board.tiles, board.tokens, m.token),
    );
  });

  readonly heldTile = $derived(this.state ? chosenTile(this.state) : null);
  readonly heldTokenShape = $derived(this.state ? chosenTokenShape(this.state) : null);

  /** Aperçu du gain de score du camp pour la pose survolée (§13.2). */
  readonly preview: number | null = $derived.by(() => {
    const h = this.hover;
    if (!h || !this.canAct || !this.step) return null;
    let action: Action | null = null;
    if (this.step === 'placeTile' && this.tileTargets.some((c) => c.q === h.q && c.r === h.r)) {
      action = {
        type: 'placeTile',
        seat: this.viewerSeat,
        q: h.q,
        r: h.r,
        rotation: this.rotation,
      };
    } else if (
      this.step === 'placeToken' &&
      this.tokenTargets.some((c) => c.q === h.q && c.r === h.r)
    ) {
      action = { type: 'placeToken', seat: this.viewerSeat, q: h.q, r: h.r };
    }
    if (!action) return null;
    const res = applyAction(this.state, action);
    if (!res.ok) return null;
    const before = evaluate(this.state, { provisional: true }).byCamp[this.viewerCamp]?.total ?? 0;
    const after = evaluate(res.state, { provisional: true }).byCamp[this.viewerCamp]?.total ?? 0;
    return after - before;
  });

  /* ------------------------------------------------------------------ actions */

  act(action: Action): boolean {
    const res = this.driver.send(action);
    this.message = res.ok ? null : res.reason;
    return res.ok;
  }

  rotate(delta: number): void {
    this.rotation = (((this.rotation + delta) % 6) + 6) % 6;
  }

  /** Clic sur une cellule du plateau, selon l'étape en cours. */
  clickCell(q: number, r: number): void {
    if (!this.canAct) return;
    const seat = this.viewerSeat;
    if (this.state.phase === 'startTiles') {
      const orientation = this.rotation;
      const match = this.startTargets.find(
        (a) => a.q === q && a.r === r && a.orientation === orientation,
      );
      if (match) this.act(match);
      else this.message = 'illegal-start-position';
      return;
    }
    if (this.step === 'placeTile')
      this.act({ type: 'placeTile', seat, q, r, rotation: this.rotation });
    else if (this.step === 'placeToken') this.act({ type: 'placeToken', seat, q, r });
  }

  chooseSlot(slot: number): void {
    if (this.step === 'chooseTile') this.act({ type: 'chooseTile', seat: this.viewerSeat, slot });
    else if (this.step === 'chooseToken')
      this.act({ type: 'chooseToken', seat: this.viewerSeat, slot });
  }

  /** Glisser-déposer d'une tuile du marché sur le plateau (§13.2). */
  dropSlotOn(slot: number, q: number, r: number): void {
    if (
      this.step === 'chooseTile' &&
      !this.act({ type: 'chooseTile', seat: this.viewerSeat, slot })
    )
      return;
    if (this.step === 'placeTile')
      this.act({ type: 'placeTile', seat: this.viewerSeat, q, r, rotation: this.rotation });
  }

  simple(type: 'reroll' | 'undo' | 'confirm' | 'requestObjectives'): void {
    this.act({ type, seat: this.viewerSeat });
  }

  noToken(): void {
    this.act({ type: 'chooseToken', seat: this.viewerSeat, slot: null });
  }

  vote(cardId: string, keep: boolean): void {
    this.act({ type: 'voteObjective', seat: this.viewerSeat, cardId, keep });
  }

  /** Cellules surlignées pour l'étape en cours. */
  readonly highlights: Set<string> = $derived.by(() => {
    const out = new Set<string>();
    if (!this.canAct) return out;
    if (this.state.phase === 'startTiles') {
      for (const a of this.startTargets)
        if (a.orientation === this.rotation) out.add(cellKey(a.q, a.r));
    } else if (this.step === 'placeTile') {
      for (const c of this.tileTargets) out.add(cellKey(c.q, c.r));
    } else if (this.step === 'placeToken') {
      for (const c of this.tokenTargets) out.add(cellKey(c.q, c.r));
    }
    return out;
  });
}
