/**
 * Tas binaire minimal (le plus petit selon `compare` en tête). Sert aux attributions gloutonnes
 * à invalidation paresseuse : une entrée dont la priorité s'est dégradée est réinsérée à la sortie.
 */
export class BinaryHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(items[i]!, items[parent]!) >= 0) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < items.length && this.compare(items[l]!, items[best]!) < 0) best = l;
        if (r < items.length && this.compare(items[r]!, items[best]!) < 0) best = r;
        if (best === i) break;
        [items[i], items[best]] = [items[best]!, items[i]!];
        i = best;
      }
    }
    return top;
  }
}
