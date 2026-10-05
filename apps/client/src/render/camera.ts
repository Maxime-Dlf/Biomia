/**
 * Caméra du plateau (§13.2) : déplacement par glisser avec inertie, zoom à la molette (Ctrl ou
 * pavé tactile) et au pincement, recentrage. Distingue un clic d'un déplacement.
 */
import { type Container, Point } from 'pixi.js';

export interface CameraCallbacks {
  /** Clic (sans déplacement) en coordonnées du monde. */
  onTap(world: Point): void;
  /** Survol en coordonnées du monde (`null` en sortie du plateau). */
  onHover(world: Point | null): void;
  /**
   * Molette sans Ctrl : retourne `true` si elle a été consommée (ex. rotation de la tuile), sinon
   * elle zoome.
   */
  onWheel(deltaY: number): boolean;
}

const TAP_TOLERANCE = 6;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

export class Camera {
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number } | null = null;
  private panned = false;
  private pinchDistance = 0;
  private velocity = { x: 0, y: 0 };
  private lastMove = { x: 0, y: 0, t: 0 };
  private inertiaFrame = 0;
  inertia = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: Container,
    private readonly callbacks: CameraCallbacks,
  ) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheelEvent, { passive: false });
  }

  dispose(): void {
    cancelAnimationFrame(this.inertiaFrame);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('wheel', this.onWheelEvent);
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  toWorld(screen: { x: number; y: number }): Point {
    return this.world.toLocal(new Point(screen.x, screen.y));
  }

  /** Centre la vue sur les bornes données (en coordonnées du monde). */
  fit(
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    width: number,
    height: number,
  ): void {
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(width / w, height / h) * 0.8));
    this.world.scale.set(Math.min(scale, 1.4));
    const s = this.world.scale.x;
    this.world.position.set(
      width / 2 - ((bounds.minX + bounds.maxX) / 2) * s,
      height / 2 - ((bounds.minY + bounds.maxY) / 2) * s,
    );
  }

  zoomAt(screen: { x: number; y: number }, factor: number): void {
    const before = this.toWorld(screen);
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.world.scale.x * factor));
    this.world.scale.set(scale);
    const after = this.toWorld(screen);
    this.world.position.x += (after.x - before.x) * scale;
    this.world.position.y += (after.y - before.y) * scale;
  }

  private onDown = (e: PointerEvent): void => {
    cancelAnimationFrame(this.inertiaFrame);
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.dragStart = p;
      this.panned = false;
      this.lastMove = { ...p, t: performance.now() };
      this.velocity = { x: 0, y: 0 };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      this.panned = true;
    }
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      this.callbacks.onHover(this.toWorld(p));
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDistance > 0)
        this.zoomAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist / this.pinchDistance);
      this.pinchDistance = dist;
      return;
    }
    if (
      this.dragStart &&
      !this.panned &&
      Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) > TAP_TOLERANCE
    ) {
      this.panned = true;
    }
    if (this.panned) {
      this.world.position.x += p.x - prev.x;
      this.world.position.y += p.y - prev.y;
      const now = performance.now();
      const dt = Math.max(1, now - this.lastMove.t);
      this.velocity = { x: (p.x - this.lastMove.x) / dt, y: (p.y - this.lastMove.y) / dt };
      this.lastMove = { ...p, t: now };
    } else {
      this.callbacks.onHover(this.toWorld(p));
    }
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.local(e);
    const wasPanning = this.panned;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0) return;
    this.dragStart = null;
    if (!wasPanning) {
      this.callbacks.onTap(this.toWorld(p));
      return;
    }
    if (this.inertia && performance.now() - this.lastMove.t < 80) this.startInertia();
  };

  private onLeave = (): void => {
    if (this.pointers.size === 0) this.callbacks.onHover(null);
  };

  private onWheelEvent = (e: WheelEvent): void => {
    e.preventDefault();
    if (!e.ctrlKey && this.callbacks.onWheel(e.deltaY)) return;
    this.zoomAt(this.local(e), Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  };

  private startInertia(): void {
    let { x: vx, y: vy } = this.velocity;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      this.world.position.x += vx * dt;
      this.world.position.y += vy * dt;
      const decay = 0.94 ** (dt / 16);
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) > 0.02) this.inertiaFrame = requestAnimationFrame(step);
    };
    this.inertiaFrame = requestAnimationFrame(step);
  }
}
