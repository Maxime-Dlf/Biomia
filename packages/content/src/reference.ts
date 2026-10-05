/**
 * Plateaux de référence (§20.1, format §23.3) : un plateau, la règle visée et le score attendu,
 * validé à la main par le responsable des règles.
 *
 * Raccourcis acceptés en plus du format §23.3 :
 * - identifiants sans préfixe : `"heart"` → `core:heart`, `"E0"` → `core:E0` ;
 * - tuile `{ "q", "r", "mono": "E0" }` ou `{ "q", "r", "bi": ["E0", "E1"] }` (arêtes [A,A,A,B,B,B]) ;
 * - jeton compact `["heart", q, r, "A", seq]` ;
 * - `fill` : cellules couvertes d'une tuile neutre (seq 0, camp du 1ᵉʳ camp) ;
 * - toute cellule portant un jeton sans tuile reçoit une tuile neutre ;
 * - les tuiles neutres sont monochromes E2, E3 ou E4 selon `(q − r) mod 3` : deux tuiles neutres
 *   voisines n'ont jamais la même couleur et ne forment donc pas d'environnement.
 */
import {
  boardState,
  type CampId,
  type CampScore,
  cellKey,
  evaluate,
  type GameState,
  type PlacedTile,
  type PlacedToken,
  type Rotation,
  type ScoreReport,
} from '@crassecadia/engine';
import { CORE_ENVS, CORE_SHAPES } from './ids.ts';
import { officialRuleSet } from './official.ts';
import { customConfig, tierForAll } from './presets.ts';

type TileSpec = {
  readonly q: number;
  readonly r: number;
  readonly edges?: readonly string[];
  readonly mono?: string;
  readonly bi?: readonly [string, string];
  readonly accepted?: readonly string[];
  readonly rotation?: number;
  readonly placedBy?: string;
  readonly seq?: number;
};

type TokenSpec =
  | readonly [string, number, number, string, number]
  | {
      readonly q: number;
      readonly r: number;
      readonly shape: string;
      readonly placedBy: string;
      readonly seq: number;
    };

type ExpectedCamp = Partial<Omit<CampScore, 'tokens'>> & {
  readonly tokens?: Readonly<Record<string, number>>;
};

export interface ReferenceBoard {
  readonly id: string;
  readonly rule: string;
  readonly description: string;
  readonly config: {
    readonly camps: readonly CampId[];
    readonly tierByShape?: Readonly<Record<string, string>>;
    readonly threshold?: number;
    readonly final?: boolean;
    readonly jokers?: Readonly<Record<CampId, number>>;
    readonly options?: { readonly steals?: boolean; readonly sabotage?: boolean };
  };
  readonly tiles?: readonly TileSpec[];
  readonly fill?: readonly (readonly [number, number])[];
  readonly tokens?: readonly TokenSpec[];
  readonly expected: Readonly<Record<CampId, ExpectedCamp>>;
  readonly validatedBy: string | null;
  readonly validatedAt: string | null;
}

const withPrefix = (id: string) => (id.includes(':') ? id : `core:${id}`);

function tileFrom(spec: TileSpec, defaultCamp: string): PlacedTile {
  let edges: string[];
  if (spec.edges) edges = spec.edges.map(withPrefix);
  else if (spec.mono) edges = Array(6).fill(withPrefix(spec.mono));
  else if (spec.bi) {
    const [a, b] = spec.bi.map(withPrefix) as [string, string];
    edges = [a, a, a, b, b, b];
  } else throw new Error(`Tuile (${spec.q}, ${spec.r}) sans arêtes`);
  return {
    def: {
      id: `ref-${spec.q},${spec.r}`,
      edges,
      accepted: (spec.accepted ?? CORE_SHAPES).map(withPrefix),
    },
    q: spec.q,
    r: spec.r,
    rotation: (spec.rotation ?? 0) as Rotation,
    placedBy: spec.placedBy ?? defaultCamp,
    seq: spec.seq ?? 0,
  };
}

function tokenFrom(spec: TokenSpec): PlacedToken {
  if (Array.isArray(spec)) {
    const [shape, q, r, placedBy, seq] = spec as readonly [string, number, number, string, number];
    return { shape: withPrefix(shape), q, r, placedBy, seq };
  }
  const t = spec as Exclude<TokenSpec, readonly unknown[]>;
  return { shape: withPrefix(t.shape), q: t.q, r: t.r, placedBy: t.placedBy, seq: t.seq };
}

/** État d'évaluation d'un plateau de référence. */
export function referenceState(board: ReferenceBoard): GameState {
  const camps = board.config.camps;
  const tierByShape = { ...tierForAll('D') };
  for (const [shape, tier] of Object.entries(board.config.tierByShape ?? {}))
    tierByShape[withPrefix(shape)] = tier;
  const config = customConfig([], {
    tierByShape,
    options: {
      steals: board.config.options?.steals ?? true,
      sabotage: board.config.options?.sabotage ?? true,
    },
  });
  const fillEnv = (q: number, r: number) => CORE_ENVS[2 + ((((q - r) % 3) + 3) % 3)]!;
  const tiles = new Map<string, PlacedTile>();
  for (const spec of board.tiles ?? [])
    tiles.set(cellKey(spec.q, spec.r), tileFrom(spec, camps[0]!));
  for (const [q, r] of board.fill ?? []) {
    if (!tiles.has(cellKey(q, r)))
      tiles.set(cellKey(q, r), tileFrom({ q, r, mono: fillEnv(q, r) }, camps[0]!));
  }
  const tokens = (board.tokens ?? []).map(tokenFrom);
  for (const t of tokens) {
    if (!tiles.has(cellKey(t.q, t.r)))
      tiles.set(
        cellKey(t.q, t.r),
        tileFrom({ q: t.q, r: t.r, mono: fillEnv(t.q, t.r) }, t.placedBy),
      );
  }
  return boardState({
    ruleSet: officialRuleSet(config),
    config,
    camps,
    tiles: [...tiles.values()],
    tokens,
    threshold: board.config.threshold ?? 2,
    ...(board.config.jokers ? { jokers: board.config.jokers } : {}),
    ended: board.config.final ?? false,
  });
}

/** Compare le rapport du moteur au score attendu ; retourne les écarts lisibles. */
export function checkReferenceBoard(board: ReferenceBoard): {
  mismatches: string[];
  report: ScoreReport;
} {
  const report = evaluate(referenceState(board));
  const mismatches: string[] = [];
  for (const [camp, expected] of Object.entries(board.expected)) {
    const actual = report.byCamp[camp];
    if (!actual) {
      mismatches.push(`${camp} : camp absent du rapport`);
      continue;
    }
    for (const [field, value] of Object.entries(expected)) {
      if (field === 'tokens') {
        for (const [shape, pts] of Object.entries(value as Record<string, number>)) {
          const got = actual.tokens[withPrefix(shape)] ?? 0;
          if (got !== pts)
            mismatches.push(`${camp}.tokens.${shape} : attendu ${pts}, obtenu ${got}`);
        }
      } else {
        const got = actual[field as keyof Omit<CampScore, 'tokens'>];
        if (got !== value) mismatches.push(`${camp}.${field} : attendu ${value}, obtenu ${got}`);
      }
    }
  }
  return { mismatches, report };
}
