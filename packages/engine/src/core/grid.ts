/**
 * Grille hexagonale indexée par `(q, r)` : tableau dense sur la boîte englobante si le plateau est
 * compact, table de hachage numérique sinon. Évite les clés textuelles dans les boucles chaudes du
 * scoring (§20.2).
 */
const OFFSET = 1 << 20;
const numeric = (q: number, r: number) => (q + OFFSET) * 2 * OFFSET + (r + OFFSET);

export class HexGrid<T extends { readonly q: number; readonly r: number }> {
  private readonly dense: (T | undefined)[] | null;
  private readonly sparse: Map<number, T> | null;
  readonly minQ: number;
  readonly minR: number;
  readonly maxQ: number;
  readonly maxR: number;
  private readonly height: number;
  readonly size: number;

  constructor(items: Iterable<T>) {
    const list = [...items];
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
    this.size = list.length;
    if (list.length === 0) {
      minQ = maxQ = minR = maxR = 0;
    }
    this.minQ = minQ;
    this.maxQ = maxQ;
    this.minR = minR;
    this.maxR = maxR;
    this.height = maxR - minR + 1;
    const area = (maxQ - minQ + 1) * this.height;
    if (area <= 8 * list.length + 64) {
      this.dense = new Array<T | undefined>(area);
      this.sparse = null;
      for (const t of list) this.dense[(t.q - minQ) * this.height + (t.r - minR)] = t;
    } else {
      this.dense = null;
      this.sparse = new Map();
      for (const t of list) this.sparse.set(numeric(t.q, t.r), t);
    }
  }

  get(q: number, r: number): T | undefined {
    if (this.dense) {
      if (q < this.minQ || q > this.maxQ || r < this.minR || r > this.maxR) return undefined;
      return this.dense[(q - this.minQ) * this.height + (r - this.minR)];
    }
    return this.sparse!.get(numeric(q, r));
  }

  has(q: number, r: number): boolean {
    return this.get(q, r) !== undefined;
  }
}
