/**
 * Matériel et génération (§4) : nombre de tuiles, capacités, couleurs, formes, tuiles de départ
 * et pool de jetons. Tout est déterministe à partir du RNG de la partie.
 */
import type { Rng } from '../core/rng.ts';
import type { RuleSet, TileGenerationInput } from '../core/ruleset.ts';
import type {
  EnvId,
  GameConfig,
  Pool,
  SeatId,
  ShapeId,
  StartTile,
  TileDef,
} from '../core/types.ts';

/** Nombre de tuiles `T` de la pioche (§4.3). */
export function computeTileCount(config: GameConfig): number {
  const m = config.marketSize;
  if (config.teams === null) return config.rounds * config.seats.length + m;
  const maxTeam = Math.max(...config.teams.map((t) => t.seats.length));
  return maxTeam * config.teams.length * config.rounds + m;
}

/** Seuil de validité des environnements `S = max(2, ⌈(T − m) / d⌉)` (§8.2). */
export function computeThreshold(tileCount: number, marketSize: number, divisor: number): number {
  return Math.max(2, Math.ceil((tileCount - marketSize) / divisor));
}

/**
 * Répartition des capacités selon le ratio (§4.4, étape 1). Avec `w` le poids total :
 * `b = ⌊T / w⌋` blocs complets, puis le reste est distribué par passes successives sur les
 * capacités croissantes, une capacité de poids `p` participant aux `p` premières passes.
 * Pour 1:2:2, l'ordre du reste est donc 1, 2, 3, 2 (puis 3), conformément au §4.4.
 */
export function capacityCounts(total: number, ratio: readonly number[]): number[] {
  const weight = ratio.reduce((a, b) => a + b, 0);
  if (weight <= 0) throw new Error('Ratio des capacités vide');
  const blocks = Math.floor(total / weight);
  const counts = ratio.map((p) => p * blocks);
  const order: number[] = [];
  const maxPass = Math.max(...ratio);
  for (let pass = 0; pass < maxPass; pass++) {
    ratio.forEach((p, i) => {
      if (pass < p) order.push(i);
    });
  }
  const rest = total - blocks * weight;
  for (let k = 0; k < rest; k++) counts[order[k]!]! += 1;
  return counts;
}

/** Ratio réellement applicable : une capacité ne peut pas dépasser le nombre de formes actives. */
export function effectiveRatio(ratio: readonly number[], shapeCount: number): number[] {
  return ratio.slice(0, Math.max(1, shapeCount));
}

/** Les `k` formes les moins utilisées jusqu'ici, départagées par le RNG (§4.4, étape 3). */
function leastUsedShapes(
  shapes: readonly ShapeId[],
  usage: Map<ShapeId, number>,
  k: number,
  rng: Rng,
): ShapeId[] {
  const byCount = new Map<number, ShapeId[]>();
  for (const s of shapes) {
    const n = usage.get(s) ?? 0;
    const group = byCount.get(n);
    if (group) group.push(s);
    else byCount.set(n, [s]);
  }
  const ordered = [...byCount.keys()]
    .sort((a, b) => a - b)
    .flatMap((n) => rng.shuffle(byCount.get(n)!));
  const chosen = ordered.slice(0, k);
  for (const s of chosen) usage.set(s, (usage.get(s) ?? 0) + 1);
  // Ordre canonique : celui des formes actives.
  return shapes.filter((s) => chosen.includes(s));
}

/**
 * Générateur officiel de tuiles (§4.4, étapes 2 et 3) :
 * - capacité 1 : monochromes, couleurs en tourniquet puis mélangées ;
 * - capacités ≥ 2 : bicolores `[A, A, A, B, B, B]`, paires de couleurs en tourniquet, le cycle
 *   incomplet minimisant l'écart du nombre d'arêtes par couleur (égalité → RNG) ;
 * - formes : les moins utilisées jusqu'ici, départage par RNG.
 */
export function balancedTileGenerator(input: TileGenerationInput, rng: Rng): TileDef[][] {
  const { countsByCapacity, shapes, envs, idPrefix } = input;
  if (envs.length < 2) throw new Error('Au moins 2 environnements sont nécessaires');
  const edgeCount = new Map<EnvId, number>(envs.map((e) => [e, 0]));
  let nextId = 0;
  const newId = () => `${idPrefix}${nextId++}`;

  // Monochromes : tourniquet sur un ordre des couleurs tiré au sort, puis mélange.
  const n1 = countsByCapacity[0] ?? 0;
  const envCycle = rng.shuffle(envs);
  const monoColors = rng.shuffle(
    Array.from({ length: n1 }, (_, i) => envCycle[i % envCycle.length]!),
  );
  for (const c of monoColors) edgeCount.set(c, edgeCount.get(c)! + 6);

  // Bicolores : cycles complets des paires, puis cycle incomplet glouton.
  const pairs: [EnvId, EnvId][] = [];
  for (let i = 0; i < envs.length; i++) {
    for (let j = i + 1; j < envs.length; j++) pairs.push([envs[i]!, envs[j]!]);
  }
  const nBi = countsByCapacity.slice(1).reduce((a, b) => a + b, 0);
  const biPairs: [EnvId, EnvId][] = [];
  const addPair = (p: [EnvId, EnvId]) => {
    biPairs.push(p);
    edgeCount.set(p[0], edgeCount.get(p[0])! + 3);
    edgeCount.set(p[1], edgeCount.get(p[1])! + 3);
  };
  const fullCycles = Math.floor(nBi / pairs.length);
  for (let c = 0; c < fullCycles; c++) for (const p of pairs) addPair(p);
  const remaining = pairs.slice();
  for (let k = fullCycles * pairs.length; k < nBi; k++) {
    let best: number[] = [];
    let bestSpread = Number.POSITIVE_INFINITY;
    remaining.forEach(([a, b], idx) => {
      let max = Number.NEGATIVE_INFINITY;
      let min = Number.POSITIVE_INFINITY;
      for (const [env, n] of edgeCount) {
        const v = n + (env === a || env === b ? 3 : 0);
        if (v > max) max = v;
        if (v < min) min = v;
      }
      const spread = max - min;
      if (spread < bestSpread) {
        bestSpread = spread;
        best = [idx];
      } else if (spread === bestSpread) {
        best.push(idx);
      }
    });
    const idx = rng.pick(best);
    addPair(remaining[idx]!);
    remaining.splice(idx, 1);
  }
  const shuffledPairs = rng.shuffle(biPairs);

  // Formes acceptées, capacité par capacité.
  const usage = new Map<ShapeId, number>(shapes.map((s) => [s, 0]));
  const groups: TileDef[][] = [];
  let pairCursor = 0;
  countsByCapacity.forEach((count, capIndex) => {
    const cap = capIndex + 1;
    const group: TileDef[] = [];
    for (let k = 0; k < count; k++) {
      let edges: EnvId[];
      if (cap === 1) {
        const c = monoColors[k]!;
        edges = [c, c, c, c, c, c];
      } else {
        const [a, b] = shuffledPairs[pairCursor++]!;
        edges = [a, a, a, b, b, b];
      }
      group.push({ id: newId(), edges, accepted: leastUsedShapes(shapes, usage, cap, rng) });
    }
    groups.push(group);
  });
  return groups;
}

function generationInput(
  config: GameConfig,
  counts: number[],
  idPrefix: string,
): TileGenerationInput {
  return {
    countsByCapacity: counts,
    shapes: config.activeShapes,
    envs: config.activeEnvs,
    idPrefix,
  };
}

/** Pioche de `T` tuiles, mélangée (§4.4, étape 4). */
export function generateDeck(
  config: GameConfig,
  ruleSet: RuleSet,
  tileCount: number,
  rng: Rng,
): TileDef[] {
  const ratio = effectiveRatio(config.options.capacityRatio, config.activeShapes.length);
  const counts = capacityCounts(tileCount, ratio);
  const groups = ruleSet.generators.tiles(generationInput(config, counts, 't'), rng);
  return rng.shuffle(groups.flat());
}

/** Capacités des 3 cellules d'une tuile de départ, limitées au nombre de formes actives (§4.6). */
export function startCellCapacities(shapeCount: number): [number, number, number] {
  return [1, Math.min(2, shapeCount), Math.min(3, shapeCount)];
}

/**
 * Tuiles de départ (§4.6) : même équilibrage que la pioche, calculé sur l'ensemble des tuiles de
 * départ de la partie. Chaque siège reçoit une cellule de chaque capacité.
 */
export function generateStartTiles(
  config: GameConfig,
  ruleSet: RuleSet,
  seats: readonly SeatId[],
  rng: Rng,
): StartTile[] {
  const caps = startCellCapacities(config.activeShapes.length);
  const maxCap = Math.max(...caps);
  const counts = Array.from(
    { length: maxCap },
    (_, i) => caps.filter((c) => c === i + 1).length * seats.length,
  );
  const groups = ruleSet.generators
    .tiles(generationInput(config, counts, 's'), rng)
    .map((g) => rng.shuffle(g));
  const cursors = groups.map(() => 0);
  return seats.map((seat) => {
    const cells = caps.map((c) => groups[c - 1]![cursors[c - 1]!++]!) as [
      TileDef,
      TileDef,
      TileDef,
    ];
    return { seat, cells };
  });
}

/**
 * Pool initiale (§4.5) : 1 jeton de chaque forme acceptée, pour chaque tuile de la pioche et chaque
 * cellule des tuiles de départ.
 */
export function buildPool(
  shapes: readonly ShapeId[],
  deck: readonly TileDef[],
  starts: readonly StartTile[],
): Pool {
  const pool: Record<ShapeId, number> = {};
  for (const s of shapes) pool[s] = 0;
  const add = (t: TileDef) => {
    for (const s of t.accepted) pool[s] = (pool[s] ?? 0) + 1;
  };
  deck.forEach(add);
  for (const st of starts) st.cells.forEach(add);
  return pool;
}
