/**
 * Évaluation du langage de conditions des objectifs (§10.2) sur le `ScoreReport` et le plateau.
 * Les conditions ne citent aucune forme ni couleur en dur : elles passent par les paramètres.
 */
import { borderTiles, placedEdges } from '../core/board.ts';
import type { CellKey } from '../core/hex.ts';
import type { CampId, GameState } from '../core/types.ts';
import type { EnvironmentInfo, ScoreReport, StructureResult } from '../scoring/types.ts';
import type {
  ComparisonOp,
  ObjectiveCondition,
  ObjectiveMeasure,
  ObjectiveQuery,
  OwnerFilter,
  ParamRef,
} from './types.ts';

export interface ConditionContext {
  readonly state: GameState;
  readonly report: ScoreReport;
  readonly camp: CampId;
  readonly params: Readonly<Record<string, string | number>>;
}

function resolve<T extends string | number>(
  ref: ParamRef<T> | undefined,
  params: ConditionContext['params'],
): T | undefined {
  if (typeof ref === 'string' && ref.startsWith('$')) {
    const v = params[ref.slice(1)];
    if (v === undefined) throw new Error(`Paramètre manquant : ${ref}`);
    return v as T;
  }
  return ref as T | undefined;
}

function ownerMatches(
  filter: OwnerFilter | undefined,
  owner: CampId | null,
  self: CampId,
): boolean {
  if (filter === undefined || filter === 'any') return true;
  if (filter === 'self') return owner === self;
  return owner !== null && owner !== self;
}

function compare(a: number, op: ComparisonOp, b: number): boolean {
  switch (op) {
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '=':
      return a === b;
    case '>':
      return a > b;
  }
}

const max = (values: Iterable<number>) => {
  let m = 0;
  for (const v of values) if (v > m) m = v;
  return m;
};

function campOfSeat(state: GameState, seat: string): CampId {
  return state.seatCamp[seat] ?? seat;
}

function tileColors(state: GameState, cell: CellKey): Set<string> {
  const tile = state.tiles.get(cell);
  return new Set(tile ? placedEdges(tile) : []);
}

function measureEnvironments(
  ctx: ConditionContext,
  q: Extract<ObjectiveQuery, { environments: unknown }>['environments'],
  measure: ObjectiveMeasure,
): number {
  const color = resolve(q.color, ctx.params);
  const matchesBase = (e: EnvironmentInfo) =>
    (q.valid === undefined || e.valid === q.valid) && (color === undefined || e.env === color);
  const envs = ctx.report.environments.filter(
    (e) => matchesBase(e) && ownerMatches(q.owner, e.owner, ctx.camp),
  );
  switch (measure) {
    case 'count':
      return envs.length;
    case 'maxSize':
      return max(envs.map((e) => e.size));
    case 'sumSize':
      return envs.reduce((n, e) => n + e.size, 0);
    case 'distinctColors':
      return new Set(envs.map((e) => e.env)).size;
    case 'largestColors': {
      // Le plus grand environnement de chaque couleur : taille, puis ancienneté (§8.4).
      const best = new Map<string, EnvironmentInfo>();
      for (const e of ctx.report.environments.filter(matchesBase)) {
        const cur = best.get(e.env);
        if (!cur || e.size > cur.size || (e.size === cur.size && e.seniority < cur.seniority))
          best.set(e.env, e);
      }
      return [...best.values()].filter((e) => ownerMatches(q.owner, e.owner, ctx.camp)).length;
    }
    case 'maxForeignTiles':
      return max(
        envs.map(
          (e) =>
            e.tiles.filter(
              (k) => campOfSeat(ctx.state, ctx.state.tiles.get(k)!.placedBy) !== ctx.camp,
            ).length,
        ),
      );
    default:
      throw new Error(`Mesure ${measure} indisponible pour les environnements`);
  }
}

function measureStructures(
  ctx: ConditionContext,
  q: Extract<ObjectiveQuery, { structures: unknown }>['structures'],
  measure: ObjectiveMeasure,
): number {
  const shape = resolve(q.shape, ctx.params);
  const list: StructureResult[] = ctx.report.structures.filter(
    (s) =>
      s.shape !== undefined &&
      s.kind !== 'excluded' &&
      s.kind !== 'neutral' &&
      (shape === undefined || s.shape === shape) &&
      (q.status === undefined || s.status === q.status) &&
      ownerMatches(q.owner, s.owner, ctx.camp),
  );
  switch (measure) {
    case 'count':
      return list.length;
    case 'maxSize':
      return max(list.map((s) => s.members.length));
    case 'members':
      return list.reduce((n, s) => n + s.members.length, 0);
    case 'distinctShapes':
      return new Set(list.map((s) => s.shape)).size;
    case 'maxStructureShapes':
      return max(
        list.map((s) => {
          const shapes = new Set<string>();
          for (const k of [...s.members, ...(s.supports ?? [])]) {
            const t = ctx.state.tokens.get(k);
            if (t) shapes.add(t.shape);
          }
          return shapes.size;
        }),
      );
    case 'maxColors':
      return max(
        list.map((s) => {
          const colors = new Set<string>();
          for (const k of s.members) for (const c of tileColors(ctx.state, k)) colors.add(c);
          return colors.size;
        }),
      );
    default:
      throw new Error(`Mesure ${measure} indisponible pour les structures`);
  }
}

function measureTokens(
  ctx: ConditionContext,
  q: Extract<ObjectiveQuery, { tokens: unknown }>['tokens'],
  measure: ObjectiveMeasure,
): number {
  const shape = resolve(q.shape, ctx.params);
  const color = resolve(q.tileColor, ctx.params);
  const colors = new Set<string>();
  let count = 0;
  for (const [key, t] of ctx.state.tokens) {
    if (shape !== undefined && t.shape !== shape) continue;
    if (!ownerMatches(q.placedBy, campOfSeat(ctx.state, t.placedBy), ctx.camp)) continue;
    const tile = ctx.state.tiles.get(key);
    if (!tile) continue;
    if (!ownerMatches(q.tilePlacedBy, campOfSeat(ctx.state, tile.placedBy), ctx.camp)) continue;
    const edges = placedEdges(tile);
    if (color !== undefined && !edges.includes(color)) continue;
    count++;
    for (const e of edges) colors.add(e);
  }
  if (measure === 'count') return count;
  if (measure === 'tileColors') return colors.size;
  throw new Error(`Mesure ${measure} indisponible pour les jetons`);
}

function measureTiles(
  ctx: ConditionContext,
  q: Extract<ObjectiveQuery, { tiles: unknown }>['tiles'],
  measure: ObjectiveMeasure,
): number {
  if (measure !== 'count') throw new Error(`Mesure ${measure} indisponible pour les tuiles`);
  const border = q.border === undefined ? null : borderTiles(ctx.state.tiles);
  let count = 0;
  for (const [key, t] of ctx.state.tiles) {
    if (!ownerMatches(q.placedBy, campOfSeat(ctx.state, t.placedBy), ctx.camp)) continue;
    if (q.capacity !== undefined && t.def.accepted.length !== q.capacity) continue;
    if (border && border.has(key) !== q.border) continue;
    count++;
  }
  return count;
}

export function measureQuery(
  ctx: ConditionContext,
  query: ObjectiveQuery,
  measure: ObjectiveMeasure,
): number {
  if ('environments' in query) return measureEnvironments(ctx, query.environments, measure);
  if ('structures' in query) return measureStructures(ctx, query.structures, measure);
  if ('tokens' in query) return measureTokens(ctx, query.tokens, measure);
  if ('tiles' in query) return measureTiles(ctx, query.tiles, measure);
  if ('counter' in query) {
    if (query.counter === 'jokers') return ctx.state.camps[ctx.camp]?.jokers ?? 0;
    return ctx.state.counters[ctx.camp]?.[query.counter] ?? 0;
  }
  const shape = resolve(query.ranking.shape, ctx.params);
  const pointsOf = (camp: CampId) => {
    const s = ctx.report.byCamp[camp];
    if (!s) return 0;
    return shape === undefined
      ? Object.values(s.tokens).reduce((a, b) => a + b, 0)
      : (s.tokens[shape] ?? 0);
  };
  const mine = pointsOf(ctx.camp);
  const others = Object.keys(ctx.state.camps)
    .filter((c) => c !== ctx.camp)
    .map(pointsOf);
  if (measure === 'rank') return 1 + others.filter((p) => p > mine).length;
  if (measure === 'strictFirst') return others.every((p) => p < mine) ? 1 : 0;
  throw new Error(`Mesure ${measure} indisponible pour le classement`);
}

export function evaluateCondition(ctx: ConditionContext, condition: ObjectiveCondition): boolean {
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(ctx, c));
  if ('any' in condition) return condition.any.some((c) => evaluateCondition(ctx, c));
  if ('not' in condition) return !evaluateCondition(ctx, condition.not);
  const target = resolve(condition.value, ctx.params);
  if (typeof target !== 'number') throw new Error('Valeur de comparaison non numérique');
  return compare(measureQuery(ctx, condition.query, condition.measure), condition.op, target);
}
