/**
 * Rendu du plateau par couches (§14.2) : fond, ombres, surfaces, biseaux, arêtes, liserés
 * d'environnements, liaisons de structures, icônes d'accueil, halos et jetons, surcouches d'état,
 * surbrillances et fantômes, effets. Le profil de performance (§14.3) choisit les options : le rendu
 * Ultra Low reste en 2D vectoriel plat ; Low et Normal ajoutent le biseau, les frontières
 * organiques, l'entrelacement des icônes et le shader des jetons ; Normal ajoute les ombres et
 * l'éclairage solaire. Aucune règle n'est calculée ici : tout vient du `GameState` et du
 * `ScoreReport`.
 */
import {
  type CampId,
  type CellKey,
  cellKey,
  DIRECTIONS,
  type GameState,
  parseKey,
  placedEdges,
  rotateEdges,
  type ScoreReport,
  type TileDef,
} from '@crassecadia/engine';
import { type Application, Container, Graphics } from 'pixi.js';
import { HEX_SIZE, hexCorners, hexToPixel } from './layout.ts';
import { type Light, ZENITH } from './lighting.ts';
import { activeTheme, campColor, envStyle, type Pattern } from './palette.ts';
import { PROFILE_OPTIONS, type RenderOptions } from './performance.ts';
import { drawShape, traceShape } from './shapes.ts';
import type { Theme } from './theme.ts';
import { TokenFilter } from './tokenFilter.ts';

export type Ghost =
  | {
      readonly kind: 'tile';
      readonly def: TileDef;
      readonly rotation: number;
      readonly q: number;
      readonly r: number;
    }
  | {
      readonly kind: 'start';
      readonly cells: readonly {
        readonly def: TileDef;
        readonly q: number;
        readonly r: number;
        readonly rotation: number;
      }[];
    }
  | { readonly kind: 'token'; readonly shape: string; readonly q: number; readonly r: number };

export interface RenderInput {
  readonly state: GameState;
  readonly report: ScoreReport;
  readonly viewerCamp: CampId;
  /** Visibilité des structures (§13.4) : celles du camp affiché, ou toutes. */
  readonly showAllStructures: boolean;
  readonly campIndex: ReadonlyMap<CampId, number>;
  readonly highlights: ReadonlySet<string>;
  readonly ghost: Ghost | null;
  readonly patterns: boolean;
  /** Cellules dont la tuile (et le jeton) sont en cours d'animation (dessinés par les effets). */
  readonly hidden?: ReadonlySet<CellKey>;
  /** Cellules dont seul le jeton est en cours d'animation. */
  readonly hiddenTokens?: ReadonlySet<CellKey>;
  /** Cellule sélectionnée au clavier (§13.6). */
  readonly cursor?: CellKey | null;
}

type Point = { readonly x: number; readonly y: number };

/** Graine visuelle stable d'une tuile (forme de sa frontière organique). */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Tuile bicolore `[A, A, A, B, B, B]` (après rotation) : indice de la première arête de A, celle
 * qui suit une arête de B ; `null` sinon (monochrome ou tuile de mod).
 */
function bicolorStart(edges: readonly string[]): number | null {
  for (let s = 0; s < 6; s++) {
    const a = edges[s];
    if (edges[(s + 5) % 6] === a) continue;
    if (edges[(s + 1) % 6] !== a || edges[(s + 2) % 6] !== a) return null;
    const b = edges[(s + 3) % 6];
    if (b === a || edges[(s + 4) % 6] !== b || edges[(s + 5) % 6] !== b) return null;
    return s;
  }
  return null;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function darken(color: number, k = 0.6): number {
  const ch = (s: number) => Math.round(((color >> s) & 0xff) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Taille maximale d'une texture de cache : au-delà, le plateau est dessiné sans cache. */
const MAX_CACHE_TEXTURE = 4096;

/** Résolutions du cache selon le zoom : on ne recalcule qu'en changeant de palier. */
const CACHE_STEPS = [0.5, 1, 1.5, 2] as const;

export class BoardRenderer {
  readonly world = new Container();
  /**
   * Couches statiques du plateau, mises en cache dans une texture (§14.1) : redessinées à chaque
   * changement d'état ou de palier de zoom, puis affichées en une seule image.
   */
  private readonly board = new Container();
  private cacheResolution = 0;
  /** Effets éphémères (animations, particules), au-dessus du plateau. */
  readonly effects = new Container();
  private readonly layers = {
    shadows: new Graphics(),
    surfaces: new Graphics(),
    bevels: new Graphics(),
    edges: new Graphics(),
    envOutlines: new Graphics(),
    links: new Graphics(),
    icons: new Graphics(),
    iconLens: new Graphics(),
    iconMask: new Graphics(),
    halos: new Graphics(),
    tokens: new Graphics(),
    overlays: new Graphics(),
    highlights: new Graphics(),
    ghosts: new Graphics(),
  };
  private options: RenderOptions = PROFILE_OPTIONS['ultra-low'];
  private theme: Theme = activeTheme();
  private light: Light = ZENITH;
  private tokenFilter: TokenFilter | null = null;
  private last: RenderInput | null = null;

  constructor(readonly app: Application) {
    const L = this.layers;
    for (const [name, layer] of Object.entries(L)) {
      (name === 'highlights' || name === 'ghosts' ? this.world : this.board).addChild(layer);
    }
    this.world.addChildAt(this.board, 0);
    // Entrelacement des icônes : l'icône 3 est redessinée dans l'intersection avec l'icône 1.
    L.iconLens.mask = L.iconMask;
    this.world.addChild(this.effects);
    app.stage.addChild(this.world);
  }

  /** Profil, thème et lumière (§14.3, §14.4, §14.6) ; le plateau est redessiné. */
  configure(options: RenderOptions, theme: Theme, light: Light): void {
    const shaderChanged = options.tokenShader !== this.options.tokenShader || theme !== this.theme;
    this.options = options;
    this.theme = theme;
    this.setLight(light);
    if (shaderChanged) {
      this.tokenFilter?.destroy();
      this.tokenFilter =
        options.tokenShader === 'none'
          ? null
          : new TokenFilter(theme, this.light, options.tokenShader === 'luxe');
      this.layers.tokens.filters = this.tokenFilter ? [this.tokenFilter] : [];
    }
    this.app.renderer.background.color = theme.background;
    if (this.last) this.sync(this.last);
  }

  /** Lumière du moment : teinte du plateau et direction des reflets (§14.4). */
  setLight(light: Light): void {
    this.light = this.options.lighting === 'none' ? ZENITH : light;
    this.world.tint = this.options.lighting === 'solar' ? light.tint : 0xffffff;
    this.tokenFilter?.setLight(this.light);
  }

  /**
   * Palier de résolution du cache pour le zoom courant ; sans cache si la texture serait trop
   * grande (très grands plateaux).
   */
  setZoom(scale: number): void {
    const step: number = CACHE_STEPS.find((r) => r >= scale) ?? 2;
    const b = this.last ? this.bounds(this.last.state) : null;
    const density = this.app.renderer.resolution * step;
    const fits = !b || Math.max(b.maxX - b.minX, b.maxY - b.minY) * density <= MAX_CACHE_TEXTURE;
    const target = fits ? step : 0;
    if (target === this.cacheResolution) return;
    this.cacheResolution = target;
    this.board.cacheAsTexture(target === 0 ? false : { resolution: target, antialias: true });
  }

  get renderOptions(): RenderOptions {
    return this.options;
  }

  /** Bornes du plateau en coordonnées du monde (recentrage). */
  bounds(state: GameState): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = -HEX_SIZE * 3;
    let minY = -HEX_SIZE * 3;
    let maxX = HEX_SIZE * 3;
    let maxY = HEX_SIZE * 3;
    for (const t of state.tiles.values()) {
      const { x, y } = hexToPixel(t.q, t.r);
      minX = Math.min(minX, x - HEX_SIZE * 2);
      maxX = Math.max(maxX, x + HEX_SIZE * 2);
      minY = Math.min(minY, y - HEX_SIZE * 2);
      maxY = Math.max(maxY, y + HEX_SIZE * 2);
    }
    return { minX, minY, maxX, maxY };
  }

  /** Redessine les couches du plateau (tout est redessiné à chaque changement d'état). */
  sync(input: RenderInput): void {
    this.last = input;
    const { state } = input;
    const L = this.layers;
    const hidden = input.hidden ?? new Set<CellKey>();
    for (const layer of [
      L.shadows,
      L.surfaces,
      L.bevels,
      L.edges,
      L.icons,
      L.iconLens,
      L.iconMask,
      L.halos,
      L.tokens,
    ]) {
      layer.clear();
    }
    for (const tile of state.tiles.values()) {
      const key = cellKey(tile.q, tile.r);
      if (hidden.has(key)) continue;
      this.drawTileInto(L, tile.def, tile.rotation, tile.q, tile.r, 1, input.patterns, tile.def.id);
      if (!state.tokens.has(key)) this.drawIcons(tile.def.accepted, tile.q, tile.r, 1);
    }
    const hiddenTokens = input.hiddenTokens ?? new Set<CellKey>();
    for (const token of state.tokens.values()) {
      const key = cellKey(token.q, token.r);
      if (hidden.has(key) || hiddenTokens.has(key)) continue;
      const camp = state.seatCamp[token.placedBy] ?? token.placedBy;
      this.drawToken(
        L.halos,
        L.tokens,
        token.shape,
        token.q,
        token.r,
        input.campIndex.get(camp) ?? 0,
        1,
      );
    }
    this.drawEnvOutlines(input);
    this.drawLinksAndOverlays(input);
    this.syncInteraction(input);
    if (this.cacheResolution > 0) this.board.updateCacheTexture();
  }

  /** Couches interactives uniquement (survol, curseur), sans redessiner le plateau. */
  syncInteraction(input: Pick<RenderInput, 'highlights' | 'ghost' | 'patterns' | 'cursor'>): void {
    const { highlights, ghosts } = this.layers;
    const t = this.theme;
    highlights.clear();
    ghosts.clear();
    for (const key of input.highlights) {
      const { q, r } = parseKey(key);
      const { x, y } = hexToPixel(q, r);
      const pts = hexCorners(x, y, HEX_SIZE * 0.92).flatMap((c) => [c.x, c.y]);
      highlights
        .poly(pts)
        .fill({ color: t.highlight, alpha: 0.12 })
        .stroke({ color: t.highlight, width: 2, alpha: 0.55 });
    }
    if (input.cursor) {
      const { q, r } = parseKey(input.cursor);
      const { x, y } = hexToPixel(q, r);
      highlights
        .poly(hexCorners(x, y, HEX_SIZE * 0.98).flatMap((c) => [c.x, c.y]))
        .stroke({ color: t.highlight, width: 4, alpha: 1 });
    }
    const ghost = input.ghost;
    if (!ghost) return;
    if (ghost.kind === 'token') {
      const { x, y } = hexToPixel(ghost.q, ghost.r);
      drawShape(ghosts, ghost.shape, x, y, HEX_SIZE * 0.42, { fill: t.tokenFill, alpha: 0.7 });
      return;
    }
    const cells = ghost.kind === 'tile' ? [ghost] : ghost.cells;
    const target = { surfaces: ghosts, bevels: ghosts, edges: ghosts, shadows: null };
    for (const c of cells)
      this.drawTileInto(target, c.def, c.rotation, c.q, c.r, 0.75, input.patterns, c.def.id);
  }

  /* ---------------------------------------------------------------- tuiles et jetons */

  /** Tuile isolée dessinée autour de l'origine, pour les animations (§14.5). */
  tileGraphic(def: TileDef, rotation: number, patterns: boolean): Graphics {
    const g = new Graphics();
    this.drawTileInto(
      { surfaces: g, bevels: g, edges: g, shadows: null },
      def,
      rotation,
      0,
      0,
      1,
      patterns,
      def.id,
    );
    return g;
  }

  /** Jeton isolé autour de l'origine, avec son halo, pour les animations. */
  tokenGraphic(shape: string, campIndex: number): Graphics {
    const g = new Graphics();
    this.drawToken(g, g, shape, 0, 0, campIndex, 1);
    if (this.tokenFilter) g.filters = [this.tokenFilter];
    return g;
  }

  private drawToken(
    halos: Graphics,
    tokens: Graphics,
    shape: string,
    q: number,
    r: number,
    campIndex: number,
    alpha: number,
  ): void {
    const { x, y } = hexToPixel(q, r);
    const color = campColor(campIndex, this.theme);
    // Halo de la couleur du camp (§14.4), sous le jeton.
    if (this.options.tokenShader !== 'none') {
      halos.circle(x, y, HEX_SIZE * 0.52).fill({ color, alpha: 0.28 * alpha });
    }
    drawShape(tokens, shape, x, y, HEX_SIZE * 0.42, {
      fill: this.theme.tokenFill,
      stroke: color,
      strokeWidth: 4,
      alpha,
    });
  }

  /**
   * Surface d'une tuile (couleurs par arête, frontière organique pour une bicolore), motifs
   * d'accessibilité, biseau orienté par la lumière, bandes d'arêtes et contour.
   */
  private drawTileInto(
    into: { surfaces: Graphics; bevels: Graphics; edges: Graphics; shadows: Graphics | null },
    def: TileDef,
    rotation: number,
    q: number,
    r: number,
    alpha: number,
    patterns: boolean,
    seedKey: string,
  ): void {
    const o = this.options;
    const { x, y } = hexToPixel(q, r);
    const center = { x, y };
    const corners = hexCorners(x, y);
    const edges = rotateEdges(def.edges, rotation);
    const flat = corners.flatMap((c) => [c.x, c.y]);

    if (o.shadows && into.shadows) {
      // Ombre portée, à l'opposé de la lumière, et ombre de contact entre tuiles.
      const k = 6 * (1.1 - 0.5 * this.light.elevation);
      const dx = -Math.cos(this.light.angle) * k;
      const dy = Math.sin(this.light.angle) * k + 2;
      into.shadows
        .poly(corners.flatMap((c) => [c.x + dx, c.y + dy]))
        .fill({ color: 0x000000, alpha: 0.28 * alpha });
      into.shadows
        .poly(hexCorners(x, y, HEX_SIZE * 1.03).flatMap((c) => [c.x, c.y]))
        .fill({ color: 0x000000, alpha: 0.16 * alpha });
    }

    const s = into.surfaces;
    const start = o.organicBorders ? bicolorStart(edges) : null;
    if (start !== null) {
      // Frontière en courbe organique (§14.4) entre deux coins opposés, propre à chaque tuile.
      const a = envStyle(edges[start]!, this.theme);
      const b = envStyle(edges[(start + 3) % 6]!, this.theme);
      s.poly(flat).fill({ color: b.color, alpha });
      const from = corners[(start + 3) % 6]!;
      const to = corners[start]!;
      const seed = seedOf(seedKey);
      const wiggle = (seed % 2 === 0 ? 1 : -1) * HEX_SIZE * (0.12 + (seed % 7) * 0.02);
      const nx = -(to.y - from.y) / HEX_SIZE / 2;
      const ny = (to.x - from.x) / HEX_SIZE / 2;
      const c1 = lerp(from, center, 0.7);
      const c2 = lerp(to, center, 0.7);
      s.moveTo(to.x, to.y);
      for (let i = 1; i <= 3; i++)
        s.lineTo(corners[(start + i) % 6]!.x, corners[(start + i) % 6]!.y);
      s.bezierCurveTo(
        c1.x + nx * wiggle,
        c1.y + ny * wiggle,
        c2.x - nx * wiggle,
        c2.y - ny * wiggle,
        to.x,
        to.y,
      );
      s.closePath().fill({ color: a.color, alpha });
    } else {
      for (let i = 0; i < 6; i++) {
        const p = corners[i]!;
        const q2 = corners[(i + 1) % 6]!;
        s.poly([x, y, p.x, p.y, q2.x, q2.y]).fill({
          color: envStyle(edges[i]!, this.theme).color,
          alpha,
        });
      }
    }
    if (patterns) {
      for (let i = 0; i < 6; i++) {
        const style = envStyle(edges[i]!, this.theme);
        drawPattern(
          s,
          style.pattern,
          x,
          y,
          corners[i]!,
          corners[(i + 1) % 6]!,
          alpha,
          this.theme.outline,
        );
      }
    }

    if (o.bevel) {
      // Biseau procédural : arêtes tournées vers la lumière éclaircies, les autres assombries.
      for (let i = 0; i < 6; i++) {
        const facing = Math.cos((Math.PI / 3) * i - this.light.angle);
        const p = corners[i]!;
        const q2 = corners[(i + 1) % 6]!;
        const pi = lerp(center, p, 0.86);
        const qi = lerp(center, q2, 0.86);
        into.bevels.poly([p.x, p.y, q2.x, q2.y, qi.x, qi.y, pi.x, pi.y]).fill({
          color: facing > 0 ? 0xffffff : 0x000000,
          alpha: Math.abs(facing) * 0.24 * alpha,
        });
      }
    }

    // Arêtes : bande colorée le long de chaque arête, puis contour de la tuile.
    for (let i = 0; i < 6; i++) {
      const p = corners[i]!;
      const q2 = corners[(i + 1) % 6]!;
      const inset = 0.88;
      into.edges
        .moveTo(x + (p.x - x) * inset, y + (p.y - y) * inset)
        .lineTo(x + (q2.x - x) * inset, y + (q2.y - y) * inset)
        .stroke({ color: darken(envStyle(edges[i]!, this.theme).color), width: 4, alpha });
    }
    into.edges.poly(flat).stroke({ color: this.theme.outline, width: 1.5, alpha: 0.6 * alpha });
  }

  /**
   * Icônes d'accueil (§14.4) : 1 au centre, 2 côte à côte, 3 en triangle équilatéral centré. Avec
   * l'entrelacement cyclique (1 sur 2, 2 sur 3, 3 sur 1), on dessine 3, puis 2, puis 1, puis on
   * redessine l'icône 3 dans sa lentille commune avec l'icône 1, par masque.
   */
  private drawIcons(accepted: readonly string[], q: number, r: number, alpha: number): void {
    const { icons, iconLens, iconMask } = this.layers;
    const { x, y } = hexToPixel(q, r);
    const n = accepted.length;
    const interlace = n === 3 && this.options.interlacedIcons;
    const radius = n === 1 ? 0 : interlace ? HEX_SIZE * 0.2 : HEX_SIZE * 0.3;
    const size = n === 1 ? HEX_SIZE * 0.24 : HEX_SIZE * 0.17;
    const at = (i: number) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1) + (n === 2 ? Math.PI / 2 : 0);
      return { x: x + radius * Math.cos(angle), y: y + radius * Math.sin(angle) };
    };
    const style = {
      fill: 0xffffff,
      stroke: this.theme.outline,
      strokeWidth: 1.5,
      alpha: 0.9 * alpha,
    };
    const order = interlace ? [2, 1, 0] : accepted.map((_, i) => i);
    for (const i of order) {
      const p = at(i);
      drawShape(icons, accepted[i]!, p.x, p.y, size, style);
    }
    if (interlace) {
      const p3 = at(2);
      const p1 = at(0);
      drawShape(iconLens, accepted[2]!, p3.x, p3.y, size, style);
      traceShape(iconMask, accepted[0]!, p1.x, p1.y, size);
      iconMask.fill({ color: 0xffffff });
    }
  }

  private visible(input: RenderInput, owner: CampId | null): boolean {
    return owner !== null && (input.showAllStructures || owner === input.viewerCamp);
  }

  /** Liserés de propriété des environnements visibles (§14.2, couche 4). */
  private drawEnvOutlines(input: RenderInput): void {
    const g = this.layers.envOutlines;
    g.clear();
    for (const env of input.report.environments) {
      if (!this.visible(input, env.owner)) continue;
      const members = new Set(env.tiles);
      const color = campColor(input.campIndex.get(env.owner) ?? 0, this.theme);
      for (const key of env.tiles) {
        const tile = input.state.tiles.get(key);
        if (!tile || input.hidden?.has(key)) continue;
        const edges = placedEdges(tile);
        const { x, y } = hexToPixel(tile.q, tile.r);
        const corners = hexCorners(x, y, HEX_SIZE * 0.97);
        for (let i = 0; i < 6; i++) {
          if (edges[i] !== env.env) continue;
          const d = DIRECTIONS[i]!;
          const nKey = cellKey(tile.q + d.q, tile.r + d.r);
          const neighbor = input.state.tiles.get(nKey);
          const linked =
            neighbor && members.has(nKey) && placedEdges(neighbor)[(i + 3) % 6] === env.env;
          if (linked) continue;
          const a = corners[i]!;
          const b = corners[(i + 1) % 6]!;
          g.moveTo(a.x, a.y)
            .lineTo(b.x, b.y)
            .stroke({ color, width: env.valid ? 5 : 2, alpha: env.valid ? 0.95 : 0.6 });
        }
      }
    }
  }

  /** Liaisons des structures visibles (sous les jetons) et surcouches d'état (§14.2, couches 5 et 8). */
  private drawLinksAndOverlays(input: RenderInput): void {
    const links = this.layers.links;
    const overlays = this.layers.overlays;
    links.clear();
    overlays.clear();
    for (const s of input.report.structures) {
      if (s.shape === undefined) continue;
      if (s.status === 'invalidated' || s.status === 'blocked' || s.status === 'absorbed') {
        for (const key of s.members) {
          if (!input.hidden?.has(key)) drawStatus(overlays, key, s.status, this.theme);
        }
        continue;
      }
      if (s.status !== 'valid' || !this.visible(input, s.owner) || s.members.length < 2) continue;
      const color = campColor(input.campIndex.get(s.owner!) ?? 0, this.theme);
      const pts = s.members.map((k) => {
        const { q, r } = parseKey(k);
        return { k, q, r, ...hexToPixel(q, r) };
      });
      let linked = false;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]!;
          const b = pts[j]!;
          const dq = a.q - b.q;
          const dr = a.r - b.r;
          if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 !== 1) continue;
          links.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width: 7, alpha: 0.85 });
          linked = true;
        }
      }
      if (!linked) {
        // Membres non adjacents (paires espacées, couronnes) : reliés au centre de la structure.
        const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
        const cy = pts.reduce((n, p) => n + p.y, 0) / pts.length;
        for (const p of pts)
          links.moveTo(cx, cy).lineTo(p.x, p.y).stroke({ color, width: 4, alpha: 0.7 });
      }
    }
  }
}

/** Motif d'accessibilité dans un triangle de tuile (§13.6). */
function drawPattern(
  g: Graphics,
  pattern: Pattern,
  cx: number,
  cy: number,
  a: Point,
  b: Point,
  alpha: number,
  color: number,
): void {
  const at = (u: number, v: number) => ({
    x: cx + (a.x - cx) * u + (b.x - cx) * v,
    y: cy + (a.y - cy) * u + (b.y - cy) * v,
  });
  const a2 = 0.28 * alpha;
  switch (pattern) {
    case 'dots':
      for (const [u, v] of [
        [0.3, 0.3],
        [0.6, 0.2],
        [0.2, 0.6],
      ] as const) {
        const p = at(u, v);
        g.circle(p.x, p.y, 2.2).fill({ color, alpha: a2 });
      }
      return;
    case 'stripes':
      for (const t of [0.35, 0.65]) {
        const p = at(t, 0);
        const q = at(0, t);
        g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ color, width: 1.5, alpha: a2 });
      }
      return;
    case 'cross': {
      const p = at(0.45, 0.45);
      g.moveTo(p.x - 4, p.y - 4)
        .lineTo(p.x + 4, p.y + 4)
        .stroke({ color, width: 1.5, alpha: a2 });
      g.moveTo(p.x + 4, p.y - 4)
        .lineTo(p.x - 4, p.y + 4)
        .stroke({ color, width: 1.5, alpha: a2 });
      return;
    }
    case 'waves': {
      const p = at(0.6, 0.1);
      const q = at(0.35, 0.35);
      const r = at(0.1, 0.6);
      g.moveTo(p.x, p.y)
        .quadraticCurveTo(q.x + 4, q.y - 4, r.x, r.y)
        .stroke({ color, width: 1.5, alpha: a2 });
      return;
    }
    case 'rings': {
      const p = at(0.4, 0.4);
      g.circle(p.x, p.y, 4).stroke({ color, width: 1.5, alpha: a2 });
      return;
    }
    case 'none':
      return;
  }
}

/**
 * Surcouches d'état persistantes (§14.5) : un jeton invalidé reste fendu en deux moitiés jusqu'à
 * la fin de la partie ; verrou (bloqué) ; spirale (absorbé).
 */
function drawStatus(
  g: Graphics,
  key: string,
  status: 'invalidated' | 'blocked' | 'absorbed',
  theme: Theme,
): void {
  const { q, r } = parseKey(key);
  const { x, y } = hexToPixel(q, r);
  const s = HEX_SIZE * 0.42;
  if (status === 'invalidated') {
    const crack = [
      [x - s * 0.2, y - s * 1.05],
      [x + s * 0.15, y - s * 0.1],
      [x - s * 0.15, y + s * 0.2],
      [x + s * 0.2, y + s * 1.05],
    ] as const;
    const trace = () => {
      g.moveTo(crack[0][0], crack[0][1]);
      for (const [px, py] of crack.slice(1)) g.lineTo(px, py);
    };
    // Fente qui sépare le jeton en deux moitiés, puis liseré rouge.
    trace();
    g.stroke({ color: theme.background, width: 5 });
    trace();
    g.stroke({ color: theme.danger, width: 2 });
  } else if (status === 'blocked') {
    g.roundRect(x - s * 0.45, y - s * 0.05, s * 0.9, s * 0.7, 3).fill({
      color: 0x222222,
      alpha: 0.9,
    });
    g.arc(x, y - s * 0.05, s * 0.3, Math.PI, 0).stroke({ color: 0x222222, width: 4 });
  } else {
    for (const k of [1, 0.66, 0.33])
      g.circle(x, y, s * k).stroke({ color: 0x5b2a86, width: 3, alpha: 0.8 });
  }
}
