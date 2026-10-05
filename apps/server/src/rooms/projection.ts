/**
 * Couche de projection (§15.5) : reflète le `GameState` autoritaire dans le Schema Colyseus après
 * chaque action. Le plateau est un journal de poses en ajout seul ; les autres champs ne sont
 * réécrits que s'ils changent, pour des diffs minimaux. Rien de caché (pioche, graine, RNG,
 * composition de la pool, objectifs des autres camps) n'est jamais écrit dans la partie publique.
 */
import { ArraySchema } from '@colyseus/schema';
import type { GameState, MarketSlot, SeatId, TileDef } from '@crassecadia/engine';
import { gameInfo, privateParts, projectTurn, publicObjectives } from '@crassecadia/protocol';
import {
  CampSchema,
  GameSchema,
  PlacedTileSchema,
  PlacedTokenSchema,
  PrivateSchema,
  type RoomStateSchema,
  SlotSchema,
  TileDefSchema,
  TurnSchema,
} from './schema.ts';

/** Affecte un champ seulement s'il change (diffs minimaux). */
function set<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  if (target[key] !== value) target[key] = value;
}

function tileDefSchema(def: TileDef): TileDefSchema {
  return new TileDefSchema({
    id: def.id,
    edges: new ArraySchema<string>(...def.edges),
    accepted: new ArraySchema<string>(...def.accepted),
  });
}

function syncSlot(slot: SlotSchema, m: MarketSlot): void {
  if (m.tile === null) {
    if (slot.tile !== undefined) slot.tile = undefined as unknown as TileDefSchema;
  } else if (slot.tile?.id !== m.tile.id) {
    slot.tile = tileDefSchema(m.tile);
  }
  set(slot, 'token', m.token ?? '');
}

export class Projector {
  constructor(private readonly root: RoomStateSchema) {}

  /** Crée la partie projetée et les parties privées des sièges. */
  start(state: GameState): void {
    this.root.game = new GameSchema({
      info: JSON.stringify(gameInfo(state)),
      phase: state.phase,
      seqCounter: 0,
      turnIndex: 0,
      startIndex: 0,
      deckCount: 0,
      poolCount: 0,
      deadline: 0,
      objectives: '',
    });
    for (const camp of Object.keys(state.camps)) {
      this.root.game.camps.set(
        camp,
        new CampSchema({ jokers: 0, steals: 0, invalidations: 0, monoBonuses: 0, tokensPlaced: 0 }),
      );
    }
    this.sync(state);
  }

  /** Partie privée d'un siège, créée au besoin. */
  privateOf(seat: SeatId): PrivateSchema {
    let p = this.root.privates.get(seat);
    if (!p) {
      p = new PrivateSchema({
        seat,
        startTile: 'null',
        objectives: 'null',
        vote: 'null',
        lastClientSeq: 0,
      });
      this.root.privates.set(seat, p);
    }
    return p;
  }

  sync(state: GameState): void {
    const g = this.root.game!;
    set(g, 'phase', state.phase);
    set(g, 'seqCounter', state.seqCounter);
    set(g, 'turnIndex', state.turnIndex);
    set(g, 'startIndex', state.startIndex);
    set(g, 'deckCount', state.deck.length - state.deckPos);
    let poolCount = 0;
    for (const shape in state.pool) poolCount += state.pool[shape]!;
    set(g, 'poolCount', poolCount);

    // Journal des poses : on n'ajoute que les nouvelles (le plateau ne fait que croître, §3).
    if (state.tiles.size > g.tiles.length) {
      for (const t of [...state.tiles.values()].slice(g.tiles.length)) {
        g.tiles.push(
          new PlacedTileSchema({
            id: t.def.id,
            edges: new ArraySchema<string>(...t.def.edges),
            accepted: new ArraySchema<string>(...t.def.accepted),
            q: t.q,
            r: t.r,
            rotation: t.rotation,
            placedBy: t.placedBy,
            seq: t.seq,
          }),
        );
      }
    }
    if (state.tokens.size > g.tokens.length) {
      for (const t of [...state.tokens.values()].slice(g.tokens.length)) {
        g.tokens.push(
          new PlacedTokenSchema({
            shape: t.shape,
            q: t.q,
            r: t.r,
            placedBy: t.placedBy,
            seq: t.seq,
          }),
        );
      }
    }

    state.market.forEach((m, i) => {
      let slot = g.market[i];
      if (!slot) {
        slot = new SlotSchema({ token: '' });
        g.market.push(slot);
      }
      syncSlot(slot, m);
    });

    for (const [id, camp] of Object.entries(state.camps)) {
      const c = g.camps.get(id)!;
      const counters = state.counters[id]!;
      set(c, 'jokers', camp.jokers);
      set(c, 'steals', counters.steals);
      set(c, 'invalidations', counters.invalidations);
      set(c, 'monoBonuses', counters.monoBonuses);
      set(c, 'tokensPlaced', counters.tokensPlaced);
    }

    if (state.turn === null) {
      if (g.turn !== undefined) g.turn = undefined as unknown as TurnSchema;
    } else {
      const projected = projectTurn(state.turn);
      if (!g.turn) g.turn = new TurnSchema(projected);
      else for (const [k, v] of Object.entries(projected)) set(g.turn, k as never, v as never);
    }

    set(g, 'objectives', JSON.stringify(publicObjectives(state)));
    for (const seat of state.config.seats) {
      const parts = privateParts(state, seat.id);
      const p = this.privateOf(seat.id);
      set(p, 'startTile', parts.startTile);
      set(p, 'objectives', parts.objectives);
      set(p, 'vote', parts.vote);
    }
  }

  /** Échéance du minuteur en cours (horloge du serveur), `0` sans minuteur. */
  setDeadline(deadline: number | null): void {
    if (this.root.game) set(this.root.game, 'deadline', deadline ?? 0);
  }
}
