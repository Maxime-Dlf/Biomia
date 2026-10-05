/**
 * Pipeline de scoring (§7.4) : fonction pure, déterministe, en entiers. Le score est recalculé en
 * entier à partir du plateau. Les options « vols désactivés » et « sabotage désactivé » (§7.5)
 * sont implémentées ici une seule fois, par rejeu chronologique des poses.
 */

import { borderTiles, placedEdges } from '../core/board.ts';
import { HexGrid } from '../core/grid.ts';
import type { CellKey } from '../core/hex.ts';
import type { CampId, GameState, PlacedTile, PlacedToken, ShapeId } from '../core/types.ts';
import { effectiveBoard } from '../flow/state.ts';
import { connectedComponents, latestOf } from './algorithms.ts';
import { computeEnvironments, type EnvOwnerResolver, latestTileOwner } from './environments.ts';
import {
  type Award,
  type CampScore,
  type EnvironmentInfo,
  type Exclusion,
  FINAL_ONLY_STAGES,
  type ScoredTile,
  type ScoredToken,
  type ScoreReport,
  type Scorer,
  type ScorerOutput,
  type ScoringContext,
  STAGES,
  type Stage,
  type StructureResult,
} from './types.ts';

export type TokenOwnerResolver = (members: readonly ScoredToken[], group: string) => CampId | null;

export interface PipelineInput {
  readonly state: GameState;
  readonly tiles: ReadonlyMap<CellKey, PlacedTile>;
  readonly tokens: ReadonlyMap<CellKey, PlacedToken>;
  readonly final: boolean;
  readonly tokenOwner?: TokenOwnerResolver;
  readonly envOwner?: EnvOwnerResolver;
  /** Jetons neutres (sabotage désactivé, §7.5) : 0 point et sans effet. */
  readonly neutral?: ReadonlySet<CellKey>;
}

const naturalTokenOwner: TokenOwnerResolver = (members) =>
  members.length === 0 ? null : latestOf(members).camp;

function scorersByStage(scorers: readonly Scorer[], stage: Stage): Scorer[] {
  return scorers
    .filter((s) => s.stage === stage)
    .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

interface ContextBase {
  readonly state: GameState;
  readonly final: boolean;
  readonly tiles: ReadonlyMap<CellKey, ScoredTile>;
  readonly allTokens: ReadonlyMap<CellKey, ScoredToken>;
  readonly environments: readonly EnvironmentInfo[];
  readonly campOf: (seat: string) => CampId;
  readonly isBorder: (cell: CellKey) => boolean;
  readonly tileGrid: () => HexGrid<ScoredTile>;
  readonly tokenOwner: TokenOwnerResolver;
}

interface ShapeIndex {
  readonly byShape: ReadonlyMap<ShapeId, readonly ScoredToken[]>;
  readonly components: Map<ShapeId, ScoredToken[][]>;
  readonly grid: () => HexGrid<ScoredToken>;
}

/** Jetons par forme triés par `seq`, partagés par tous les contextes d'un même ensemble de jetons. */
function shapeIndex(tokens: ReadonlyMap<CellKey, ScoredToken>): ShapeIndex {
  const byShape = new Map<ShapeId, ScoredToken[]>();
  for (const t of tokens.values()) {
    const list = byShape.get(t.shape);
    if (list) list.push(t);
    else byShape.set(t.shape, [t]);
  }
  for (const list of byShape.values()) list.sort((a, b) => a.seq - b.seq);
  let grid: HexGrid<ScoredToken> | null = null;
  return {
    byShape,
    components: new Map(),
    grid: () => {
      grid ??= new HexGrid(tokens.values());
      return grid;
    },
  };
}

function makeContext(
  base: ContextBase,
  tokens: ReadonlyMap<CellKey, ScoredToken>,
  index: ShapeIndex,
  structures: readonly StructureResult[],
  exclusions: ReadonlyMap<CellKey, Exclusion>,
  neutralizedEnvs: ReadonlySet<string>,
): ScoringContext {
  return {
    state: base.state,
    final: base.final,
    threshold: base.state.threshold,
    tiles: base.tiles,
    tokens,
    allTokens: base.allTokens,
    environments: base.environments,
    structures,
    neutralizedEnvs,
    exclusions,
    campOf: base.campOf,
    tokensOf: (shape) => index.byShape.get(shape) ?? [],
    components: (shape) => {
      let c = index.components.get(shape);
      if (!c) {
        c = connectedComponents(index.byShape.get(shape) ?? []);
        index.components.set(shape, c);
      }
      return c;
    },
    isBorder: base.isBorder,
    tileAt: (q, r) => base.tileGrid().get(q, r),
    tokenAt: (q, r) => index.grid().get(q, r),
    ownerOf: (members, group) => {
      const toks = members
        .map((k) => base.allTokens.get(k))
        .filter((t): t is ScoredToken => t !== undefined);
      return base.tokenOwner(toks, group);
    },
    ownerOfTokens: (members, group) => base.tokenOwner(members, group),
  };
}

function emptyCampScore(): CampScore {
  return {
    total: 0,
    environments: 0,
    endBonuses: 0,
    tokens: {},
    effects: 0,
    objectives: 0,
    jokers: 0,
  };
}

export function runPipeline(input: PipelineInput): ScoreReport {
  const { state, final } = input;
  const campOf = (seat: string): CampId => state.seatCamp[seat] ?? seat;
  const neutral = input.neutral ?? new Set<CellKey>();

  const tiles = new Map<CellKey, ScoredTile>();
  for (const [key, t] of input.tiles)
    tiles.set(key, { ...t, key, camp: campOf(t.placedBy), edges: placedEdges(t) });
  const allTokens = new Map<CellKey, ScoredToken>();
  for (const [key, t] of input.tokens) {
    if (!neutral.has(key)) allTokens.set(key, { ...t, key, camp: campOf(t.placedBy) });
  }
  let border: Set<CellKey> | null = null;
  let tileGrid: HexGrid<ScoredTile> | null = null;
  const base: ContextBase = {
    state,
    final,
    tiles,
    allTokens,
    environments: computeEnvironments(
      tiles,
      state.threshold,
      input.envOwner ?? ((t) => latestTileOwner(t)),
    ),
    campOf,
    isBorder: (cell) => {
      border ??= borderTiles(input.tiles);
      return border.has(cell);
    },
    tileGrid: () => {
      tileGrid ??= new HexGrid(tiles.values());
      return tileGrid;
    },
    tokenOwner: input.tokenOwner ?? naturalTokenOwner,
  };
  const scorers = state.ruleSet.scorers;
  const awards: Award[] = [];
  const neutralized = new Set<string>();

  // Étape 1 : effets évalués sur le plateau brut puis appliqués tous ensemble (§9.4).
  const exclusions = new Map<CellKey, Exclusion>();
  let structures: StructureResult[] = [];
  {
    const ctx = makeContext(base, allTokens, shapeIndex(allTokens), [], exclusions, neutralized);
    const outputs = scorersByStage(scorers, 'pre-effects').map((s) => s.run(ctx));
    for (const out of outputs) {
      for (const ex of out.exclusions ?? [])
        if (!exclusions.has(ex.cell)) exclusions.set(ex.cell, ex);
      structures.push(...(out.structures ?? []));
      awards.push(...(out.awards ?? []));
    }
    // Un jeton qui produit un effet mais qui est lui-même bloqué ou absorbé perd ses points.
    structures = structures.map((s) => {
      const ex = s.members.map((m) => exclusions.get(m)).find((e) => e !== undefined);
      return ex ? { ...s, status: ex.status, points: 0 } : s;
    });
    const represented = new Set(structures.flatMap((s) => s.members));
    for (const ex of exclusions.values()) {
      const t = allTokens.get(ex.cell);
      if (!t || represented.has(ex.cell)) continue;
      structures.push({
        id: `excluded:${ex.cell}`,
        kind: 'excluded',
        scorer: ex.by,
        shape: t.shape,
        members: [ex.cell],
        owner: t.camp,
        points: 0,
        status: ex.status,
        seniority: t.seq,
      });
    }
  }
  let activeTokens: ReadonlyMap<CellKey, ScoredToken> = allTokens;
  if (exclusions.size > 0) {
    const filtered = new Map<CellKey, ScoredToken>();
    for (const [key, t] of allTokens) if (!exclusions.has(key)) filtered.set(key, t);
    activeTokens = filtered;
  }
  for (const n of neutral) {
    const t = input.tokens.get(n);
    if (!t) continue;
    structures.push({
      id: `neutral:${n}`,
      kind: 'neutral',
      scorer: 'engine',
      shape: t.shape,
      members: [n],
      owner: campOf(t.placedBy),
      points: 0,
      status: 'pending',
      seniority: t.seq,
    });
  }

  const apply = (out: ScorerOutput) => {
    structures.push(...(out.structures ?? []));
    awards.push(...(out.awards ?? []));
    for (const id of out.neutralize ?? []) neutralized.add(id);
    if (out.adjustments && out.adjustments.length > 0) {
      const index = new Map(structures.map((s, i) => [s.id, i]));
      for (const adj of out.adjustments) {
        const i = index.get(adj.structureId);
        if (i === undefined) continue;
        const s = structures[i]!;
        structures[i] = { ...s, points: Math.max(0, s.points + adj.delta) };
      }
    }
  };

  const activeIndex = shapeIndex(activeTokens);
  for (const stage of STAGES) {
    if (stage === 'pre-effects') continue;
    if (FINAL_ONLY_STAGES.has(stage) && !final) continue;
    const list = scorersByStage(scorers, stage);
    if (stage === 'structures') {
      // Les scorers de structures sont indépendants : ils voient tous le même état.
      const ctx = makeContext(base, activeTokens, activeIndex, structures, exclusions, neutralized);
      for (const out of list.map((s) => s.run(ctx))) apply(out);
    } else {
      // Les effets suivants s'enchaînent : chacun voit les points mis à jour par les précédents.
      for (const scorer of list) {
        apply(
          scorer.run(
            makeContext(base, activeTokens, activeIndex, structures, exclusions, neutralized),
          ),
        );
      }
    }
  }

  type MutableScore = { -readonly [K in keyof CampScore]: CampScore[K] } & {
    tokens: Record<ShapeId, number>;
  };
  const byCamp: Record<CampId, MutableScore> = {};
  const campScore = (camp: CampId): MutableScore => {
    let c = byCamp[camp];
    if (!c) {
      c = { ...emptyCampScore(), tokens: {} };
      byCamp[camp] = c;
    }
    return c;
  };
  for (const camp of Object.keys(state.camps)) campScore(camp);
  for (const s of structures) {
    if (s.owner === null || s.points === 0) continue;
    const c = campScore(s.owner);
    if (s.shape !== undefined) c.tokens[s.shape] = (c.tokens[s.shape] ?? 0) + s.points;
    else c.environments += s.points;
  }
  for (const a of awards) campScore(a.camp)[a.category] += a.points;
  for (const c of Object.values(byCamp)) {
    const tokens = Object.values(c.tokens).reduce((x, y) => x + y, 0);
    c.total = c.environments + c.endBonuses + tokens + c.effects + c.objectives + c.jokers;
  }

  return {
    final,
    byCamp,
    structures,
    awards,
    environments: base.environments,
    neutralizedEnvs: [...neutralized].sort(),
    exclusions: [...exclusions.values()],
  };
}

/* ------------------------------------------------------------------------------------------ */
/* §7.5 — rejeu chronologique                                                                   */
/* ------------------------------------------------------------------------------------------ */

interface MemoEntry {
  readonly members: ReadonlySet<CellKey>;
  readonly owner: CampId;
  readonly size: number;
  readonly seniority: number;
}
type OwnershipMemo = ReadonlyMap<string, readonly MemoEntry[]>;

function buildMemo(report: ScoreReport): OwnershipMemo {
  const memo = new Map<string, MemoEntry[]>();
  const add = (
    group: string,
    members: readonly CellKey[],
    owner: CampId | null,
    seniority: number,
  ) => {
    if (owner === null) return;
    const list = memo.get(group) ?? [];
    list.push({ members: new Set(members), owner, size: members.length, seniority });
    memo.set(group, list);
  };
  for (const s of report.structures) {
    if (s.shape !== undefined && s.kind !== 'excluded' && s.kind !== 'neutral')
      add(s.scorer, s.members, s.owner, s.seniority);
  }
  for (const e of report.environments) add(`env:${e.env}`, e.tiles, e.owner, e.seniority);
  return memo;
}

/**
 * Vols désactivés (§7.5) : le propriétaire d'une structure est celui de sa création ; en cas de
 * fusion, celui de la partie la plus grande (à égalité : la plus ancienne).
 */
function memoOwner(memo: OwnershipMemo, group: string, keys: readonly CellKey[]): CampId | null {
  let best: MemoEntry | null = null;
  for (const entry of memo.get(group) ?? []) {
    if (!keys.some((k) => entry.members.has(k))) continue;
    if (
      !best ||
      entry.size > best.size ||
      (entry.size === best.size && entry.seniority < best.seniority)
    )
      best = entry;
  }
  return best?.owner ?? null;
}

const INVALIDATING = new Set(['invalidated', 'blocked', 'absorbed']);

/** Statut de chaque jeton membre d'une structure (le plus défavorable l'emporte). */
function memberStatuses(report: ScoreReport): Map<CellKey, string> {
  const out = new Map<CellKey, string>();
  for (const s of report.structures) {
    if (s.shape === undefined) continue;
    for (const m of s.members) if (!INVALIDATING.has(out.get(m) ?? '')) out.set(m, s.status);
  }
  return out;
}

/** Une structure valide est-elle passée à invalidée, bloquée ou absorbée (§7.5) ? */
function isSabotage(before: ScoreReport, after: ScoreReport): boolean {
  const statuses = memberStatuses(after);
  return before.structures.some(
    (s) =>
      s.shape !== undefined &&
      s.status === 'valid' &&
      s.members.some((m) => INVALIDATING.has(statuses.get(m) ?? '')),
  );
}

function evaluateChronological(
  state: GameState,
  tiles: ReadonlyMap<CellKey, PlacedTile>,
  tokens: ReadonlyMap<CellKey, PlacedToken>,
  final: boolean,
): ScoreReport {
  const { steals, sabotage } = state.config.options;
  const elements = [
    ...[...tiles].map(([key, item]) => ({ key, seq: item.seq, tile: item, token: null })),
    ...[...tokens].map(([key, item]) => ({ key, seq: item.seq, tile: null, token: item })),
  ].sort((a, b) => a.seq - b.seq);

  const curTiles = new Map<CellKey, PlacedTile>();
  const curTokens = new Map<CellKey, PlacedToken>();
  const neutral = new Set<CellKey>();
  let memo: OwnershipMemo = new Map();
  let previous: ScoreReport | null = null;

  const resolvers = (m: OwnershipMemo) => ({
    tokenOwner: steals
      ? naturalTokenOwner
      : (members: readonly ScoredToken[], group: string) =>
          members.length === 0
            ? null
            : (memoOwner(
                m,
                group,
                members.map((t) => t.key),
              ) ?? latestOf(members).camp),
    envOwner: steals
      ? (t: readonly ScoredTile[]) => latestTileOwner(t)
      : (t: readonly ScoredTile[], group: string) =>
          memoOwner(
            m,
            group,
            t.map((x) => x.key),
          ) ?? latestTileOwner(t),
  });
  let lastResolvers = resolvers(memo);

  for (const el of elements) {
    if (el.tile) curTiles.set(el.key, el.tile);
    else curTokens.set(el.key, el.token!);
    lastResolvers = resolvers(memo);
    let report = runPipeline({
      state,
      tiles: curTiles,
      tokens: curTokens,
      final: false,
      neutral,
      ...lastResolvers,
    });
    if (!sabotage && el.token && previous && isSabotage(previous, report)) {
      neutral.add(el.key);
      report = runPipeline({
        state,
        tiles: curTiles,
        tokens: curTokens,
        final: false,
        neutral,
        ...lastResolvers,
      });
    }
    memo = buildMemo(report);
    previous = report;
  }
  return runPipeline({ state, tiles, tokens, final, neutral, ...lastResolvers });
}

export interface EvaluateOptions {
  /** Inclure les poses provisoires du tour en cours (aperçu du gain, §13.2). */
  readonly provisional?: boolean;
  /** Décompte final (étapes 5 à 7) ; par défaut, uniquement en fin de partie. */
  readonly final?: boolean;
}

/** `evaluate` (§15.4) : `ScoreReport` complet de l'état. */
export function evaluate(state: GameState, options: EvaluateOptions = {}): ScoreReport {
  const board = options.provisional ? effectiveBoard(state) : state;
  const final = options.final ?? state.phase === 'ended';
  const { steals, sabotage } = state.config.options;
  if (steals && sabotage)
    return runPipeline({ state, tiles: board.tiles, tokens: board.tokens, final });
  return evaluateChronological(state, board.tiles, board.tokens, final);
}
