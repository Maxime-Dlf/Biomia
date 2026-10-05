/**
 * Algorithmes communs aux scorers (§9.0) et utilitaires : composantes, lignes, motifs
 * chronologiques, barèmes, ancienneté.
 */
import { HexGrid } from '../core/grid.ts';
import { BinaryHeap } from '../core/heap.ts';
import { type CellKey, DIRECTIONS } from '../core/hex.ts';
import type { CampId } from '../core/types.ts';
import type { ScoredToken, StructureResult } from './types.ts';

/** `seq` maximal : ancienneté d'une structure (§7.2). */
export function seniorityOf(tokens: readonly { readonly seq: number }[]): number {
  let max = 0;
  for (const t of tokens) if (t.seq > max) max = t.seq;
  return max;
}

export function minSeqOf(tokens: readonly { readonly seq: number }[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const t of tokens) if (t.seq < min) min = t.seq;
  return min;
}

/** Membre le plus ancien (plus petit `seq`) : sert d'identifiant stable. */
export function oldestKey(tokens: readonly ScoredToken[]): CellKey {
  let oldest = tokens[0]!;
  for (const t of tokens) if (t.seq < oldest.seq) oldest = t;
  return oldest.key;
}

export function latestOf<T extends { readonly seq: number }>(tokens: readonly T[]): T {
  let latest = tokens[0]!;
  for (const t of tokens) if (t.seq > latest.seq) latest = t;
  return latest;
}

/** Composantes connexes (adjacence hexagonale) d'un ensemble de jetons, triées par ancienneté. */
export function connectedComponents(tokens: readonly ScoredToken[]): ScoredToken[][] {
  const grid = new HexGrid(tokens);
  const seen = new Set<ScoredToken>();
  const out: ScoredToken[][] = [];
  for (const start of [...tokens].sort((a, b) => a.seq - b.seq)) {
    if (seen.has(start)) continue;
    const comp: ScoredToken[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const t = stack.pop()!;
      comp.push(t);
      for (const d of DIRECTIONS) {
        const n = grid.get(t.q + d.q, t.r + d.r);
        if (n && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    out.push(comp.sort((a, b) => a.seq - b.seq));
  }
  return out;
}

/** Jetons adjacents à `t` dans la grille. */
export function adjacentIn(
  t: { readonly q: number; readonly r: number },
  grid: HexGrid<ScoredToken>,
): ScoredToken[] {
  const out: ScoredToken[] = [];
  for (const d of DIRECTIONS) {
    const n = grid.get(t.q + d.q, t.r + d.r);
    if (n) out.push(n);
  }
  return out;
}

/** Une série ordonnée de jetons (ligne, chevron). */
export interface Run {
  readonly members: readonly ScoredToken[];
  /** Famille de la série : axe pour une ligne, paire de directions pour un chevron. */
  readonly family: number | null;
}

interface RunEntry {
  readonly run: Run;
  readonly length: number;
  readonly seniority: number;
  readonly minSeq: number;
  readonly tie: string;
}

function runEntry(members: readonly ScoredToken[], family: number | null): RunEntry {
  return {
    run: { members, family },
    length: members.length,
    seniority: seniorityOf(members),
    minSeq: minSeqOf(members),
    tie: `${family}:${members.map((t) => t.key).join(';')}`,
  };
}

/**
 * Ordre des séries : longueur décroissante, ancienneté croissante, plus petit `seq` minimal ;
 * départage final déterministe par famille et cellules (cas d'égalité parfaite, §7.2).
 */
function compareRunEntries(a: RunEntry, b: RunEntry): number {
  return (
    b.length - a.length ||
    a.seniority - b.seniority ||
    a.minSeq - b.minSeq ||
    (a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0)
  );
}

/**
 * Attribution gloutonne des séries (§9.0, étapes 2 à 4) : on prend la meilleure série, on retire
 * ses jetons des autres candidates qui sont découpées en sous-séries contiguës, et on recommence.
 * Les jetons restants forment des séries de longueur 1.
 *
 * Mise en œuvre : tas à invalidation paresseuse. Une candidate entamée n'est découpée qu'au moment
 * où elle sort du tas ; c'est équivalent, car un morceau est toujours plus court que sa série
 * d'origine et passe donc après elle.
 */
export function assignRuns(
  tokens: readonly ScoredToken[],
  candidates: readonly Run[],
  minLength: number,
): Run[] {
  const heap = new BinaryHeap<RunEntry>(compareRunEntries);
  for (const c of candidates)
    if (c.members.length >= minLength) heap.push(runEntry(c.members, c.family));
  const used = new Set<CellKey>();
  const out: Run[] = [];
  while (heap.size > 0) {
    const entry = heap.pop()!;
    const members = entry.run.members;
    if (members.some((t) => used.has(t.key))) {
      let piece: ScoredToken[] = [];
      const flush = () => {
        if (piece.length >= minLength) heap.push(runEntry(piece, entry.run.family));
        piece = [];
      };
      for (const t of members) {
        if (used.has(t.key)) flush();
        else piece.push(t);
      }
      flush();
      continue;
    }
    out.push(entry.run);
    for (const t of members) used.add(t.key);
  }
  for (const t of [...tokens].sort((a, b) => a.seq - b.seq)) {
    if (!used.has(t.key)) out.push({ members: [t], family: null });
  }
  return out;
}

/**
 * Algorithme « lignes » (§9.0) : séries maximales de jetons consécutifs sur les 3 axes
 * (directions `a` et `a + 3`), puis attribution gloutonne.
 */
export function assignLines(tokens: readonly ScoredToken[]): Run[] {
  const grid = new HexGrid(tokens);
  const candidates: Run[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const d = DIRECTIONS[axis]!;
    for (const t of tokens) {
      // Début de série : pas de jeton dans la direction opposée.
      if (grid.has(t.q - d.q, t.r - d.r)) continue;
      const members: ScoredToken[] = [t];
      let cur = grid.get(t.q + d.q, t.r + d.r);
      while (cur) {
        members.push(cur);
        cur = grid.get(cur.q + d.q, cur.r + d.r);
      }
      if (members.length >= 2) candidates.push({ members, family: axis });
    }
  }
  return assignRuns(tokens, candidates, 2);
}

/**
 * Comparateur de motifs de l'algorithme « chronologique » (§9.0), membres hors jeton courant :
 * l'élément le plus récent le plus ancien d'abord, puis le plus petit `seq` minimal, puis
 * l'ordre lexicographique des `seq` décroissants.
 */
function compareMotifs(a: readonly ScoredToken[], b: readonly ScoredToken[]): number {
  const sa = a.map((t) => t.seq).sort((x, y) => y - x);
  const sb = b.map((t) => t.seq).sort((x, y) => y - x);
  const d = sa[0]! - sb[0]! || sa[sa.length - 1]! - sb[sb.length - 1]!;
  if (d !== 0) return d;
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i]! - sb[i]!;
  return 0;
}

export interface Motif {
  readonly members: readonly ScoredToken[];
  /** Jeton qui a complété le motif : son poseur en est le propriétaire. */
  readonly completer: ScoredToken;
}

/**
 * Algorithme « chronologique » (§9.0) : les jetons sont parcourus par `seq` croissant ; chacun
 * tente de compléter un motif avec des jetons plus anciens encore libres.
 * `candidatesFor(t, free)` énumère les autres membres possibles d'un motif complété par `t`.
 */
export function assignChronological(
  tokens: readonly ScoredToken[],
  candidatesFor: (t: ScoredToken, isFree: (key: CellKey) => boolean) => ScoredToken[][],
): { motifs: Motif[]; leftovers: ScoredToken[] } {
  const ordered = [...tokens].sort((a, b) => a.seq - b.seq);
  const processed = new Set<CellKey>();
  const used = new Set<CellKey>();
  const motifs: Motif[] = [];
  for (const t of ordered) {
    const isFree = (key: CellKey) => processed.has(key) && !used.has(key);
    const options = candidatesFor(t, isFree).filter((others) => others.every((o) => isFree(o.key)));
    if (options.length > 0) {
      options.sort(compareMotifs);
      const others = options[0]!;
      used.add(t.key);
      for (const o of others) used.add(o.key);
      motifs.push({ members: [...others, t].sort((a, b) => a.seq - b.seq), completer: t });
    }
    processed.add(t.key);
  }
  return { motifs, leftovers: ordered.filter((t) => !used.has(t.key)) };
}

/** Barème par taille : `table[n]` pour `n` < longueur, sinon la dernière valeur (§9). */
export function tableValue(table: readonly number[], n: number): number {
  if (n <= 0) return 0;
  return table[Math.min(n, table.length - 1)]!;
}

/**
 * Barème « par nombre » (§9.0) : total du camp pour `n` structures, puis répartition des points
 * entre ses structures par incréments marginaux, dans l'ordre d'ancienneté.
 */
export function distributeByCount<
  T extends { readonly owner: CampId | null; readonly seniority: number },
>(structures: readonly T[], totalFor: (count: number) => number): Map<T, number> {
  const byCamp = new Map<CampId, T[]>();
  for (const s of structures) {
    if (s.owner === null) continue;
    const list = byCamp.get(s.owner);
    if (list) list.push(s);
    else byCamp.set(s.owner, [s]);
  }
  const out = new Map<T, number>();
  for (const list of byCamp.values()) {
    list.sort((a, b) => a.seniority - b.seniority);
    list.forEach((s, i) => {
      out.set(s, totalFor(i + 1) - totalFor(i));
    });
  }
  return out;
}

/** Construit une structure de jetons avec identifiant et ancienneté standard. */
export function tokenStructure(
  scorer: string,
  kind: string,
  members: readonly ScoredToken[],
  fields: Omit<StructureResult, 'id' | 'kind' | 'scorer' | 'members' | 'seniority' | 'shape'> & {
    readonly shape?: string;
  },
): StructureResult {
  const { shape, ...rest } = fields;
  return {
    id: `${scorer}:${oldestKey(members)}`,
    kind,
    scorer,
    shape: shape ?? members[0]?.shape,
    members: members.map((t) => t.key),
    seniority: seniorityOf(members),
    ...rest,
  };
}
