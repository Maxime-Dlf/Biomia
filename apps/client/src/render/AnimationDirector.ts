/**
 * `AnimationDirector` (§14.5) : traduit les événements du moteur en animations, sans aucun couplage
 * avec les règles. Pendant l'animation, la tuile ou le jeton concerné est retiré du plateau et
 * dessiné dans la couche des effets ; à la fin, le plateau est redessiné.
 *
 * Profil Normal : animations complètes ; Low : allégées ; Ultra Low et « animations réduites » :
 * aucune (pose instantanée, §14.3, §13.6).
 */
import { type CampId, type CellKey, cellKey, type GameEvent, parseKey } from '@crassecadia/engine';
import { type Application, type Container, Graphics, type Ticker } from 'pixi.js';
import type { BoardRenderer } from './BoardRenderer.ts';
import { HEX_SIZE, hexCorners, hexToPixel } from './layout.ts';
import type { RenderOptions } from './performance.ts';
import { ease, Tweens } from './tween.ts';

export interface AnimationHost {
  readonly renderer: BoardRenderer;
  /** Redessine le plateau en tenant compte des cellules en cours d'animation. */
  redraw(): void;
  campIndex(camp: CampId): number;
  patterns(): boolean;
  /** Position écran du compteur de jokers (vol des particules vers le HUD). */
  jokerTarget(): { x: number; y: number } | null;
}

export class AnimationDirector {
  /** Cellules dont la tuile (et le jeton) sont dessinés par les effets. */
  readonly hiddenTiles = new Set<CellKey>();
  /** Cellules dont seul le jeton est dessiné par les effets. */
  readonly hiddenTokens = new Set<CellKey>();
  private readonly tweens = new Tweens();
  private readonly tick = (_t: Ticker) => this.tweens.tick(performance.now());
  private pendingRedraw = false;

  constructor(
    private readonly host: AnimationHost,
    private readonly app: Application,
  ) {
    app.ticker.add(this.tick);
  }

  get busy(): boolean {
    return this.tweens.active > 0;
  }

  dispose(): void {
    this.app.ticker.remove(this.tick);
    this.tweens.finish();
  }

  /** Joue les animations d'un lot d'événements (appelé avant que le plateau soit redessiné). */
  play(events: readonly GameEvent[], options: RenderOptions): void {
    if (options.animations === 'none' || events.length === 0) return;
    const full = options.animations === 'full';
    const now = performance.now();
    const stolen = new Set<CellKey>();
    for (const e of events)
      if (e.type === 'OwnershipChanged') for (const k of e.members) stolen.add(k);
    let tileDelay = 0;
    for (const e of events) {
      switch (e.type) {
        case 'TilePlaced': {
          const key = cellKey(e.tile.q, e.tile.r);
          this.dropTile(
            key,
            e.tile.def,
            e.tile.rotation,
            full,
            full && stolen.has(key),
            now,
            tileDelay,
          );
          if (e.start) tileDelay += full ? 90 : 40;
          break;
        }
        case 'TokenPlaced':
          this.popToken(cellKey(e.token.q, e.token.r), e.token.shape, e.camp, full, now);
          break;
        case 'OwnershipChanged':
          this.stealWave(e.members, full, now);
          break;
        case 'StructureInvalidated':
          this.fracture(e.members, e.cause, full, now);
          break;
        case 'JokerGained':
          if (full) this.jokerFlight(events, e.camp, now);
          break;
        default:
          break;
      }
    }
  }

  private finish(): void {
    if (this.pendingRedraw) return;
    this.pendingRedraw = true;
    queueMicrotask(() => {
      this.pendingRedraw = false;
      this.host.redraw();
    });
  }

  private add(child: Container): void {
    this.host.renderer.effects.addChild(child);
  }

  private remove(child: Container): void {
    child.removeFromParent();
    child.destroy({ children: true });
  }

  /** Pose de tuile : lévitation, chute avec léger rebond, poussière ; rotation de 360° si vol. */
  private dropTile(
    key: CellKey,
    def: Parameters<BoardRenderer['tileGraphic']>[0],
    rotation: number,
    full: boolean,
    spin: boolean,
    now: number,
    delay: number,
  ): void {
    const { q, r } = parseKey(key);
    const { x, y } = hexToPixel(q, r);
    const g = this.host.renderer.tileGraphic(def, rotation, this.host.patterns());
    g.position.set(x, y);
    g.pivot.set(x, y);
    g.alpha = 0;
    this.hiddenTiles.add(key);
    this.add(g);
    const duration = full ? 520 : 180;
    this.tweens.add(
      {
        delay,
        duration,
        easing: full ? ease.outBounce : ease.outCubic,
        update: (p) => {
          g.alpha = Math.min(1, p * 2);
          if (full) {
            g.position.y = y - 60 * (1 - p);
            g.scale.set(1 + 0.12 * (1 - p));
            if (spin) g.rotation = 2 * Math.PI * p;
          }
        },
        done: () => {
          this.remove(g);
          this.hiddenTiles.delete(key);
          if (full) this.dust(x, y);
          this.finish();
        },
      },
      now,
    );
  }

  private dust(x: number, y: number): void {
    const now = performance.now();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 2 * Math.PI;
      const puff = new Graphics().circle(0, 0, 4).fill({ color: 0xe8e0c8, alpha: 0.6 });
      puff.position.set(x, y + HEX_SIZE * 0.6);
      this.add(puff);
      this.tweens.add(
        {
          delay: 0,
          duration: 320,
          easing: ease.outCubic,
          update: (p) => {
            puff.position.set(x + Math.cos(a) * 26 * p, y + HEX_SIZE * 0.6 + Math.sin(a) * 8 * p);
            puff.alpha = 0.6 * (1 - p);
          },
          done: () => this.remove(puff),
        },
        now,
      );
    }
  }

  /** Pose de jeton : apparition avec rebond, après la chute de la tuile du même tour. */
  private popToken(key: CellKey, shape: string, camp: CampId, full: boolean, now: number): void {
    const { q, r } = parseKey(key);
    const { x, y } = hexToPixel(q, r);
    const g = this.host.renderer.tokenGraphic(shape, this.host.campIndex(camp));
    g.position.set(x, y);
    g.pivot.set(x, y);
    g.scale.set(0);
    this.hiddenTokens.add(key);
    this.add(g);
    this.tweens.add(
      {
        delay: full ? 420 : 120,
        duration: full ? 360 : 160,
        easing: full ? ease.outBounce : ease.outCubic,
        update: (p) => g.scale.set(p),
        done: () => {
          this.remove(g);
          this.hiddenTokens.delete(key);
          this.finish();
        },
      },
      now,
    );
  }

  /** Vol : onde de choc et vague de saut sur les éléments volés (§14.5). */
  private stealWave(members: readonly CellKey[], full: boolean, now: number): void {
    const pts = members.map((k) => {
      const { q, r } = parseKey(k);
      return hexToPixel(q, r);
    });
    if (pts.length === 0) return;
    const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
    const cy = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    if (full) {
      const ring = new Graphics();
      this.add(ring);
      this.tweens.add(
        {
          delay: 480,
          duration: 600,
          easing: ease.outCubic,
          update: (p) => {
            ring
              .clear()
              .circle(cx, cy, HEX_SIZE * (0.5 + 3 * p))
              .stroke({ color: 0xffffff, width: 5 * (1 - p) + 1, alpha: 1 - p });
          },
          done: () => this.remove(ring),
        },
        now,
      );
    }
    for (const p of pts) {
      const flash = new Graphics()
        .poly(hexCorners(0, 0, HEX_SIZE * 0.95).flatMap((c) => [c.x, c.y]))
        .fill({ color: 0xffffff, alpha: 0.5 });
      flash.position.set(p.x, p.y);
      flash.alpha = 0;
      this.add(flash);
      const distance = Math.hypot(p.x - cx, p.y - cy);
      this.tweens.add(
        {
          delay: (full ? 520 : 0) + distance * 1.5,
          duration: full ? 360 : 200,
          easing: ease.linear,
          update: (k) => {
            const bump = Math.sin(Math.PI * k);
            flash.alpha = bump;
            if (full) flash.position.y = p.y - 10 * bump;
          },
          done: () => this.remove(flash),
        },
        now,
      );
    }
  }

  /** Invalidation : la fissure grandit (la fracture reste ensuite dessinée) ; verrou ; spirale. */
  private fracture(
    members: readonly CellKey[],
    cause: 'invalidated' | 'blocked' | 'absorbed',
    full: boolean,
    now: number,
  ): void {
    for (const key of members) {
      const { q, r } = parseKey(key);
      const { x, y } = hexToPixel(q, r);
      const g = new Graphics();
      this.add(g);
      const s = HEX_SIZE * 0.42;
      this.tweens.add(
        {
          delay: full ? 500 : 100,
          duration: full ? 450 : 200,
          easing: ease.outCubic,
          update: (p) => {
            g.clear();
            if (cause === 'invalidated') {
              g.moveTo(x - s * 0.2, y - s * 1.05).lineTo(
                x - s * 0.2 + s * 0.4 * p,
                y - s * 1.05 + s * 2.1 * p,
              );
              g.stroke({ color: 0xff4d4d, width: 3, alpha: 1 - p * 0.5 });
            } else if (cause === 'blocked') {
              g.roundRect(x - s * 0.45, y - s * 0.05 - 30 * (1 - p), s * 0.9, s * 0.7, 3).fill({
                color: 0x222222,
                alpha: p,
              });
            } else {
              for (const k of [1, 0.66, 0.33]) {
                g.circle(x, y, s * k * (2 - p)).stroke({ color: 0x5b2a86, width: 3, alpha: p });
              }
              g.rotation = 0;
            }
          },
          done: () => this.remove(g),
        },
        now,
      );
    }
  }

  /** Gain de joker : une particule vole du jeton vers le compteur du HUD (§14.5). */
  private jokerFlight(events: readonly GameEvent[], camp: CampId, now: number): void {
    const target = this.host.jokerTarget();
    const placed = events.find((e) => e.type === 'TokenPlaced' && e.camp === camp);
    if (!target || !placed || placed.type !== 'TokenPlaced') return;
    const from = hexToPixel(placed.token.q, placed.token.r);
    const to = this.host.renderer.world.toLocal(target);
    const spark = new Graphics()
      .circle(0, 0, 7)
      .fill({ color: 0xffd11a })
      .stroke({ color: 0xffffff, width: 2 });
    spark.position.set(from.x, from.y);
    this.add(spark);
    this.tweens.add(
      {
        delay: 700,
        duration: 700,
        easing: ease.inOutCubic,
        update: (p) => {
          spark.position.set(
            from.x + (to.x - from.x) * p,
            from.y + (to.y - from.y) * p - Math.sin(Math.PI * p) * 80,
          );
          spark.scale.set(1 - 0.5 * p);
        },
        done: () => this.remove(spark),
      },
      now,
    );
  }
}
