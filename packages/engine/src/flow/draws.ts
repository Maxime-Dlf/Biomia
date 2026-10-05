/**
 * `DrawSource` : abstraction des tirages (§15.4). Le serveur tire avec le RNG à graine ; le client
 * rejoue les tirages révélés et ne connaît donc jamais la pioche à l'avance.
 */
import { drawFromPool, poolAdd, poolRemove } from '../core/pool.ts';
import { type Rng, rngFromState } from '../core/rng.ts';
import type { DrawRecord, Pool, ShapeId, TileDef } from '../core/types.ts';

export interface DrawSource {
  /** Prochaine tuile de la pioche, ou `null` si elle est vide. */
  tile(deck: readonly TileDef[], pos: number): TileDef | null;
  /** Jeton tiré uniformément parmi `available`, ou `null` si elle est vide. */
  token(available: Pool): ShapeId | null;
  /** État du RNG après les tirages (inchangé pour une source rejouée). */
  rngState(previous: string): string;
}

/** Source du serveur : la pioche dans l'ordre, les jetons avec le RNG de la partie. */
export function seededDrawSource(rng: Rng): DrawSource {
  return {
    tile: (deck, pos) => deck[pos] ?? null,
    token: (available) => drawFromPool(available, rng),
    rngState: () => rng.state(),
  };
}

/** Source du client : rejoue, dans l'ordre, les tirages révélés par le serveur. */
export function replayedDrawSource(records: readonly DrawRecord[]): DrawSource {
  let i = 0;
  const next = (kind: DrawRecord['kind']): DrawRecord => {
    const rec = records[i++];
    if (!rec || rec.kind !== kind) throw new Error(`Tirage révélé manquant ou inattendu (${kind})`);
    return rec;
  };
  return {
    tile: () => {
      const rec = next('tile');
      return rec.kind === 'tile' ? rec.tile : null;
    },
    token: () => {
      const rec = next('token');
      return rec.kind === 'token' ? rec.shape : null;
    },
    rngState: (previous) => previous,
  };
}

/**
 * Session de tirage d'une action : suit la position dans la pioche et la pool courante, et
 * enregistre chaque tirage pour le révéler aux clients.
 */
export class DrawSession {
  deckPos: number;
  pool: Pool;
  readonly records: DrawRecord[] = [];

  constructor(
    private readonly source: DrawSource,
    private readonly deck: readonly TileDef[],
    deckPos: number,
    pool: Pool,
  ) {
    this.deckPos = deckPos;
    this.pool = pool;
  }

  drawTile(): TileDef | null {
    const tile = this.source.tile(this.deck, this.deckPos);
    if (tile !== null) this.deckPos += 1;
    this.records.push({ kind: 'tile', tile });
    return tile;
  }

  /** Tire un jeton de la pool courante (ou d'une sous-pool) et le retire de la pool. */
  drawToken(available: Pool = this.pool): ShapeId | null {
    const shape = this.source.token(available);
    if (shape !== null) this.pool = poolRemove(this.pool, shape);
    this.records.push({ kind: 'token', shape });
    return shape;
  }

  /** Remet un jeton dans la pool (jeton mis de côté, jeton non posé). */
  returnToken(shape: ShapeId): void {
    this.pool = poolAdd(this.pool, shape);
  }

  rngState(previous: string): string {
    return this.source.rngState(previous);
  }
}

/** Source par défaut d'un état : RNG à graine repris de `rngState`. */
export function defaultDrawSource(rngState: string): DrawSource {
  return seededDrawSource(rngFromState(rngState));
}
