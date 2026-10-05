/**
 * Habillage saisonnier (§14.4) : particules de la saison (pétales, pollens, feuilles, neige), au
 * premier plan de l'écran, sans interaction. Profil Normal uniquement.
 */
import { type Application, Container, Graphics, type Ticker } from 'pixi.js';
import type { Season } from './lighting.ts';
import type { ParticleStyle } from './theme.ts';

interface Particle {
  readonly g: Graphics;
  vx: number;
  vy: number;
  spin: number;
}

export class SeasonalParticles {
  readonly layer = new Container();
  private particles: Particle[] = [];
  private readonly tick = (t: Ticker) => this.update(t.deltaMS / 1000);

  constructor(
    private readonly app: Application,
    season: Season,
    style: ParticleStyle,
    count = 36,
  ) {
    this.layer.eventMode = 'none';
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const color = style.colors[i % style.colors.length]!;
      const s = style.size * (0.7 + Math.random() * 0.6);
      if (style.shape === 'petal' || style.shape === 'leaf')
        g.ellipse(0, 0, s * 1.6, s).fill({ color, alpha: 0.85 });
      else if (style.shape === 'flake') g.star(0, 0, 6, s, s * 0.45).fill({ color, alpha: 0.9 });
      else g.circle(0, 0, s).fill({ color, alpha: 0.7 });
      g.position.set(Math.random() * app.screen.width, Math.random() * app.screen.height);
      this.layer.addChild(g);
      this.particles.push({
        g,
        vx: (Math.random() - 0.5) * 18,
        vy: style.fall * (0.6 + Math.random() * 0.8),
        spin: (Math.random() - 0.5) * (season === 'autumn' ? 2 : 1),
      });
    }
    app.stage.addChild(this.layer);
    app.ticker.add(this.tick);
  }

  private update(dt: number): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const time = performance.now() / 1000;
    for (const p of this.particles) {
      p.g.x += (p.vx + Math.sin(time + p.g.y * 0.01) * 10) * dt;
      p.g.y += p.vy * dt;
      p.g.rotation += p.spin * dt;
      if (p.g.y > h + 10) p.g.y = -10;
      if (p.g.y < -10) p.g.y = h + 10;
      if (p.g.x > w + 10) p.g.x = -10;
      if (p.g.x < -10) p.g.x = w + 10;
    }
  }

  dispose(): void {
    this.app.ticker.remove(this.tick);
    this.layer.destroy({ children: true });
    this.particles = [];
  }
}
