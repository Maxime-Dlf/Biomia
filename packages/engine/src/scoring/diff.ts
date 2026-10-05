/**
 * Événements par différence de deux `ScoreReport` successifs (§7.4) : vols, invalidations,
 * blocages et absorptions. Une structure est suivie d'un rapport à l'autre par recouvrement de
 * ses membres, au sein de la même famille (scorer, ou couleur pour les environnements).
 */
import type { CellKey } from '../core/hex.ts';
import type { CampId, GameEvent } from '../core/types.ts';
import type { ScoreReport, StructureResult } from './types.ts';

const INVALIDATING = new Set(['invalidated', 'blocked', 'absorbed'] as const);
type Cause = 'invalidated' | 'blocked' | 'absorbed';

function overlaps(a: readonly CellKey[], b: ReadonlySet<CellKey>): boolean {
  return a.some((k) => b.has(k));
}

function isTokenStructure(s: StructureResult): boolean {
  return s.shape !== undefined && s.kind !== 'excluded' && s.kind !== 'neutral';
}

export function diffReports(prev: ScoreReport, next: ScoreReport): GameEvent[] {
  const events: GameEvent[] = [];

  // Vols de structures de jetons : structure valide qui change de propriétaire.
  const prevByScorer = new Map<string, StructureResult[]>();
  for (const s of prev.structures) {
    if (!isTokenStructure(s) || s.status !== 'valid' || s.owner === null) continue;
    const list = prevByScorer.get(s.scorer) ?? [];
    list.push(s);
    prevByScorer.set(s.scorer, list);
  }
  for (const s of next.structures) {
    if (!isTokenStructure(s) || s.status !== 'valid' || s.owner === null) continue;
    const members = new Set(s.members);
    for (const p of prevByScorer.get(s.scorer) ?? []) {
      if (p.owner !== s.owner && overlaps(p.members, members)) {
        events.push({
          type: 'OwnershipChanged',
          structureId: s.id,
          kind: s.kind,
          ...(s.shape !== undefined ? { shape: s.shape } : {}),
          members: s.members,
          from: p.owner!,
          to: s.owner,
        });
      }
    }
  }

  // Vols d'environnements valides.
  for (const e of next.environments) {
    if (!e.valid) continue;
    const tiles = new Set(e.tiles);
    for (const p of prev.environments) {
      if (p.valid && p.env === e.env && p.owner !== e.owner && overlaps(p.tiles, tiles)) {
        events.push({
          type: 'OwnershipChanged',
          structureId: e.id,
          kind: 'environment',
          env: e.env,
          members: e.tiles,
          from: p.owner,
          to: e.owner,
        });
      }
    }
  }

  // Invalidations : structure valide ou en attente dont un membre devient invalidé, bloqué ou absorbé.
  const status = new Map<CellKey, Cause>();
  for (const s of next.structures) {
    if (s.shape === undefined || !INVALIDATING.has(s.status as Cause)) continue;
    for (const m of s.members) if (!status.has(m)) status.set(m, s.status as Cause);
  }
  for (const p of prev.structures) {
    if (!isTokenStructure(p) || (p.status !== 'valid' && p.status !== 'pending')) continue;
    const cause = p.members.map((m) => status.get(m)).find((c) => c !== undefined);
    if (cause) {
      events.push({
        type: 'StructureInvalidated',
        structureId: p.id,
        kind: p.kind,
        ...(p.shape !== undefined ? { shape: p.shape } : {}),
        members: p.members,
        owner: p.owner,
        cause,
      });
    }
  }

  // Nouveaux jetons bloqués ou absorbés.
  const before = new Set(prev.exclusions.map((e) => e.cell));
  for (const ex of next.exclusions) {
    if (before.has(ex.cell)) continue;
    events.push(
      ex.status === 'blocked'
        ? { type: 'TokenBlocked', cell: ex.cell, by: ex.by }
        : { type: 'TokenAbsorbed', cell: ex.cell, by: ex.by },
    );
  }
  return events;
}

/** Vols réalisés et structures adverses invalidées par le camp qui vient de jouer (§10.1). */
export function crasseCounts(
  events: readonly GameEvent[],
  camp: CampId,
): { steals: number; invalidations: number } {
  let steals = 0;
  let invalidations = 0;
  for (const e of events) {
    if (e.type === 'OwnershipChanged' && e.to === camp && e.from !== camp) steals++;
    if (e.type === 'StructureInvalidated' && e.owner !== null && e.owner !== camp) invalidations++;
  }
  return { steals, invalidations };
}
