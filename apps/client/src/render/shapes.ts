/**
 * Dessin vectoriel des formes de jetons (rendu Ultra Low, §14.3) : Carré, Triangle, Cœur, Rond,
 * Étoile ; polygone dérivé de l'identifiant pour les formes de mods.
 */
import type { Graphics } from 'pixi.js';

export interface ShapeStyle {
  readonly fill: number;
  readonly stroke?: number;
  readonly strokeWidth?: number;
  readonly alpha?: number;
}

function polygonPoints(
  sides: number,
  x: number,
  y: number,
  radius: number,
  rotation = -Math.PI / 2,
): number[] {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * 2 * Math.PI) / sides;
    pts.push(x + radius * Math.cos(a), y + radius * Math.sin(a));
  }
  return pts;
}

/** Trace la forme centrée en `(x, y)`, de demi-taille `r`. */
export function traceShape(g: Graphics, shape: string, x: number, y: number, r: number): void {
  switch (shape) {
    case 'core:square':
      g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
      return;
    case 'core:triangle':
      g.poly(polygonPoints(3, x, y + r * 0.15, r * 1.05));
      return;
    case 'core:circle':
      g.circle(x, y, r * 0.85);
      return;
    case 'core:star':
      g.star(x, y, 5, r, r * 0.45, 0);
      return;
    case 'core:heart': {
      const top = y - r * 0.45;
      g.moveTo(x, y + r * 0.9);
      g.bezierCurveTo(x - r * 1.3, y + r * 0.05, x - r * 0.9, top - r * 0.75, x, top);
      g.bezierCurveTo(x + r * 0.9, top - r * 0.75, x + r * 1.3, y + r * 0.05, x, y + r * 0.9);
      g.closePath();
      return;
    }
    default: {
      let h = 0;
      for (let i = 0; i < shape.length; i++) h = (h * 31 + shape.charCodeAt(i)) | 0;
      g.poly(polygonPoints(5 + (Math.abs(h) % 4), x, y, r));
    }
  }
}

export function drawShape(
  g: Graphics,
  shape: string,
  x: number,
  y: number,
  r: number,
  style: ShapeStyle,
): void {
  traceShape(g, shape, x, y, r);
  g.fill({ color: style.fill, alpha: style.alpha ?? 1 });
  if (style.stroke !== undefined) {
    traceShape(g, shape, x, y, r);
    g.stroke({ color: style.stroke, width: style.strokeWidth ?? 2, alpha: style.alpha ?? 1 });
  }
}
