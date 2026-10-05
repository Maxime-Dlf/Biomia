/**
 * Graphe des environnements (§8.1, §8.2) : nœuds = demi-tuiles (une par couleur présente sur la
 * tuile), arcs = arêtes adjacentes de même couleur. Un environnement est une composante connexe
 * d'au moins 2 tuiles.
 */
import { DIRECTIONS, opposite } from '../core/hex.ts';
import type { CampId, EnvId } from '../core/types.ts';
import type { EnvironmentInfo, ScoredTile } from './types.ts';

/** Résout le propriétaire d'un environnement (§8.2, ou §7.5 si les vols sont désactivés). */
export type EnvOwnerResolver = (tiles: readonly ScoredTile[], group: string) => CampId;

/** Propriétaire naturel : camp du poseur de la tuile la plus récente (§7.1, §8.2). */
export function latestTileOwner(tiles: readonly ScoredTile[]): CampId {
  let latest = tiles[0]!;
  for (const t of tiles) if (t.seq > latest.seq) latest = t;
  return latest.camp;
}

/**
 * Index spatial des tuiles : grille typée sur la boîte englobante quand le plateau est compact,
 * sinon table de hachage numérique.
 */
function spatialIndex(list: readonly ScoredTile[]): (q: number, r: number) => number {
  let minQ = Number.POSITIVE_INFINITY;
  let maxQ = Number.NEGATIVE_INFINITY;
  let minR = Number.POSITIVE_INFINITY;
  let maxR = Number.NEGATIVE_INFINITY;
  for (const t of list) {
    if (t.q < minQ) minQ = t.q;
    if (t.q > maxQ) maxQ = t.q;
    if (t.r < minR) minR = t.r;
    if (t.r > maxR) maxR = t.r;
  }
  const width = maxQ - minQ + 1;
  const height = maxR - minR + 1;
  if (list.length > 0 && width * height <= 8 * list.length + 64) {
    const grid = new Int32Array(width * height).fill(-1);
    list.forEach((t, i) => {
      grid[(t.q - minQ) * height + (t.r - minR)] = i;
    });
    return (q, r) =>
      q < minQ || q > maxQ || r < minR || r > maxR ? -1 : grid[(q - minQ) * height + (r - minR)]!;
  }
  const OFFSET = 1 << 20;
  const map = new Map<number, number>();
  list.forEach((t, i) => {
    map.set((t.q + OFFSET) * 2 * OFFSET + (t.r + OFFSET), i);
  });
  return (q, r) => map.get((q + OFFSET) * 2 * OFFSET + (r + OFFSET)) ?? -1;
}

function find(parent: Int32Array, x: number): number {
  let root = x;
  while (parent[root] !== root) root = parent[root]!;
  while (parent[x] !== root) {
    const next = parent[x]!;
    parent[x] = root;
    x = next;
  }
  return root;
}

export function computeEnvironments(
  tiles: ReadonlyMap<string, ScoredTile>,
  threshold: number,
  resolveOwner: EnvOwnerResolver = (t) => latestTileOwner(t),
): EnvironmentInfo[] {
  const list = [...tiles.values()];
  const indexOf = spatialIndex(list);
  // Nœuds : pour chaque tuile, une demi-tuile par couleur distincte.
  const nodeStart = new Int32Array(list.length + 1);
  const nodeColors: EnvId[] = [];
  list.forEach((t, i) => {
    const start = nodeColors.length;
    nodeStart[i] = start;
    for (const e of t.edges) {
      let known = false;
      for (let n = start; n < nodeColors.length && !known; n++) known = nodeColors[n] === e;
      if (!known) nodeColors.push(e);
    }
  });
  nodeStart[list.length] = nodeColors.length;
  const nodeOf = (tile: number, color: EnvId) => {
    for (let n = nodeStart[tile]!; n < nodeStart[tile + 1]!; n++)
      if (nodeColors[n] === color) return n;
    return -1;
  };
  const parent = new Int32Array(nodeColors.length);
  for (let n = 0; n < parent.length; n++) parent[n] = n;

  // Chaque paire de tuiles adjacentes n'est traitée qu'une fois (directions 0 à 2).
  list.forEach((tile, i) => {
    for (let dir = 0; dir < 3; dir++) {
      const d = DIRECTIONS[dir]!;
      const j = indexOf(tile.q + d.q, tile.r + d.r);
      if (j < 0) continue;
      const color = tile.edges[dir]!;
      if (list[j]!.edges[opposite(dir)] !== color) continue;
      const a = find(parent, nodeOf(i, color));
      const b = find(parent, nodeOf(j, color));
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  });

  // Taille de chaque composante d'abord : les demi-tuiles isolées ne sont pas des environnements.
  const roots = new Int32Array(nodeColors.length);
  const sizes = new Int32Array(nodeColors.length);
  for (let n = 0; n < roots.length; n++) {
    roots[n] = find(parent, n);
    sizes[roots[n]!]! += 1;
  }
  const groups = new Map<number, ScoredTile[]>();
  list.forEach((tile, i) => {
    for (let n = nodeStart[i]!; n < nodeStart[i + 1]!; n++) {
      const root = roots[n]!;
      if (sizes[root]! < 2) continue;
      const g = groups.get(root);
      if (g) g.push(tile);
      else groups.set(root, [tile]);
    }
  });

  const out: EnvironmentInfo[] = [];
  for (const [root, members] of groups) {
    const env = nodeColors[root]!;
    let oldest = members[0]!;
    let seniority = 0;
    for (const t of members) {
      if (t.seq < oldest.seq) oldest = t;
      if (t.seq > seniority) seniority = t.seq;
    }
    const group = `env:${env}`;
    out.push({
      id: `${group}:${oldest.key}`,
      env,
      tiles: members.map((t) => t.key),
      size: members.length,
      owner: resolveOwner(members, group),
      seniority,
      valid: members.length >= threshold,
    });
  }
  // Ordre déterministe : par ancienneté, puis identifiant.
  return out.sort((a, b) => a.seniority - b.seniority || (a.id < b.id ? -1 : 1));
}
