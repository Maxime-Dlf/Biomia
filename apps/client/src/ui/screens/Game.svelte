<script lang="ts">
  import { type CellKey, cellKey, type Hex, parseKey, startTileCells } from '@crassecadia/engine';
  import type { Application } from 'pixi.js';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { app as appState, goto } from '../../app/app.svelte.ts';
  import { SoundEngine } from '../../audio/SoundEngine.ts';
  import { NetworkDriver } from '../../game/network-driver.ts';
  import type { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { AnimationDirector } from '../../render/AnimationDirector.ts';
  import { BoardRenderer, type Ghost, type RenderInput } from '../../render/BoardRenderer.ts';
  import { Camera } from '../../render/camera.ts';
  import { createBoardApp } from '../../render/createBoardApp.ts';
  import { hexToPixel, pixelToHex } from '../../render/layout.ts';
  import { localHours, seasonOf, solarLight, ZENITH } from '../../render/lighting.ts';
  import { SeasonalParticles } from '../../render/particles.ts';
  import { FpsMonitor, lighterProfile, resolveRenderOptions } from '../../render/performance.ts';
  import { themeById } from '../../render/theme.ts';
  import { type GraphicsProfile, settings } from '../../settings/settings.svelte.ts';
  import { seatName } from '../format.ts';
  import Chat from '../hud/Chat.svelte';
  import Controls from '../hud/Controls.svelte';
  import EventLog from '../hud/EventLog.svelte';
  import Market from '../hud/Market.svelte';
  import ObjectivesPanel from '../hud/ObjectivesPanel.svelte';
  import Scoreboard from '../hud/Scoreboard.svelte';
  import TilePreview from '../hud/TilePreview.svelte';
  import TurnBar from '../hud/TurnBar.svelte';
  import VoteModal from '../hud/VoteModal.svelte';
  import EndScreen from './EndScreen.svelte';

  let { session }: { session: GameSession } = $props();

  let boardEl: HTMLDivElement;
  let pixi: Application | null = null;
  let renderer: BoardRenderer | null = $state(null);
  let camera: Camera | null = null;
  let director: AnimationDirector | null = null;
  let particles: SeasonalParticles | null = null;
  const sound = new SoundEngine();
  let pointer = $state({ x: 0, y: 0 });
  let drag: { slot: number } | null = $state(null);
  /** Cellule choisie au clavier (§13.6). */
  let cursor: Hex | null = $state(null);
  /** Suggestion d'un profil plus léger (§14.3). */
  let slowSuggestion = $state<GraphicsProfile | null>(null);
  /** Partie à plusieurs sur un écran : le siège affiché doit confirmer qu'il a l'appareil. */
  let confirmedViewer = $state(untrack(() => session.viewerSeat));
  const hotSeat = $derived(session.driver.sharedScreen);
  const mustPass = $derived(hotSeat && session.canAct && session.viewerSeat !== confirmedViewer);

  const campIndex = $derived(new Map(session.campOrder.map((c, i) => [c, i])));
  const options = $derived(resolveRenderOptions(settings.profile, settings.graphics, settings.reducedMotion));
  const theme = $derived(themeById(settings.theme));

  /** Heure de l'éclairage : locale, ou `?time=H` en développement (captures de référence). */
  function lightNow() {
    const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get('time') : null;
    return solarLight(forced === null ? localHours(new Date()) : Number(forced));
  }

  const ghost: Ghost | null = $derived.by(() => {
    const h = session.hover;
    const state = session.state;
    if (!h || !session.canAct || !session.highlights.has(`${h.q},${h.r}`)) return null;
    if (state.phase === 'startTiles') {
      const cells = startTileCells(state, session.viewerSeat, h.q, h.r, session.rotation);
      return { kind: 'start', cells };
    }
    if (session.step === 'placeTile' && session.heldTile) {
      return { kind: 'tile', def: session.heldTile, rotation: session.rotation, q: h.q, r: h.r };
    }
    if (session.step === 'placeToken' && session.heldTokenShape) {
      return { kind: 'token', shape: session.heldTokenShape, q: h.q, r: h.r };
    }
    return null;
  });

  const cursorKey: CellKey | null = $derived.by(() => {
    const c: Hex | null = cursor;
    return c ? cellKey(c.q, c.r) : null;
  });

  function input(): RenderInput {
    return {
      state: session.state,
      report: session.report,
      viewerCamp: session.viewerCamp,
      showAllStructures:
        session.driver.spectator || session.state.config.options.structureVisibility === 'all' || session.state.phase === 'ended',
      campIndex,
      highlights: session.highlights,
      ghost,
      patterns: settings.patterns,
      hidden: director?.hiddenTiles,
      hiddenTokens: director?.hiddenTokens,
      cursor: cursorKey,
    };
  }

  function recenter() {
    if (renderer && camera && pixi) camera.fit(renderer.bounds(session.state), pixi.screen.width, pixi.screen.height);
  }

  /** Position écran du compteur de jokers, cible des particules (§14.5). */
  function jokerTarget() {
    const el = document.querySelector('[data-joker-counter]');
    if (!el || !pixi) return null;
    const box = el.getBoundingClientRect();
    const canvas = pixi.canvas.getBoundingClientRect();
    return { x: box.left + box.width / 2 - canvas.left, y: box.top + box.height / 2 - canvas.top };
  }

  // L'écran est recréé pour chaque session ({#key} dans App.svelte).
  const unsubscribeEvents = untrack(() => session).onEvents((events) => {
    // Avant que le plateau soit redessiné : les éléments animés en sont retirés.
    director?.play(events, options);
    sound.play(events, (seat) => session.driver.localSeats.includes(seat));
  });

  onMount(async () => {
    pixi = await createBoardApp(boardEl, settings.renderScale / 100);
    const r = new BoardRenderer(pixi);
    r.configure(options, theme, options.lighting === 'solar' ? lightNow() : ZENITH);
    camera = new Camera(pixi.canvas, r.world, {
      onTap: (w) => {
        const h = pixelToHex(w.x, w.y);
        session.clickCell(h.q, h.r);
      },
      onHover: (w) => {
        session.hover = w ? pixelToHex(w.x, w.y) : null;
      },
      onWheel: (deltaY) => {
        if (!session.canAct || !(session.step === 'placeTile' || session.state.phase === 'startTiles')) return false;
        session.rotate(deltaY > 0 ? 1 : -1);
        return true;
      },
    });
    director = new AnimationDirector(
      {
        renderer: r,
        redraw: () => renderer?.sync(input()),
        campIndex: (camp) => campIndex.get(camp) ?? 0,
        patterns: () => settings.patterns,
        jokerTarget,
      },
      pixi,
    );
    const monitor = new FpsMonitor(() => (slowSuggestion = lighterProfile(settings.profile)));
    pixi.ticker.add(() => {
      monitor.frame(performance.now());
      // Résolution du cache des tuiles statiques selon le zoom (§14.1).
      r.setZoom(r.world.scale.x);
    });
    renderer = r;
    recenter();
    if (import.meta.env.DEV) {
      // Passerelle des tests de bout en bout : position écran d'une cellule (développement uniquement).
      Object.assign(window, {
        __crassecadia: {
          session,
          fps: () => pixi?.ticker.FPS ?? 0,
          cellToScreen(q: number, r: number) {
            const p = hexToPixel(q, r);
            const g = renderer!.world.toGlobal({ x: p.x, y: p.y });
            const rect = pixi!.canvas.getBoundingClientRect();
            return { x: rect.left + g.x, y: rect.top + g.y };
          },
        },
      });
    }
  });

  // Éclairage solaire : recalculé chaque minute (transitions lissées, §14.4).
  const lightTimer = setInterval(() => {
    if (renderer && options.lighting === 'solar') renderer.setLight(lightNow());
  }, 60_000);

  onDestroy(() => {
    clearInterval(lightTimer);
    unsubscribeEvents();
    director?.dispose();
    particles?.dispose();
    sound.dispose();
    camera?.dispose();
    pixi?.destroy(true, { children: true });
  });

  // Profil, options et thème (§14.3, §14.6) : le plateau est reconfiguré et redessiné.
  $effect(() => {
    if (!renderer) return;
    renderer.configure(options, theme, options.lighting === 'solar' ? lightNow() : ZENITH);
  });
  // Particules saisonnières (§14.4), profil Normal.
  $effect(() => {
    const on = renderer !== null && options.particles;
    untrack(() => {
      particles?.dispose();
      particles = null;
      if (on && pixi) {
        const season = seasonOf(new Date());
        particles = new SeasonalParticles(pixi, season, theme.particles[season]);
      }
    });
  });
  $effect(() => sound.setVolume(settings.volume));
  // Plateau : redessiné quand l'état, le rapport ou le camp affiché changent.
  $effect(() => {
    if (!renderer) return;
    renderer.sync(input());
  });
  // Couches interactives : survol, rotation, surbrillances, curseur clavier.
  $effect(() => {
    if (!renderer) return;
    renderer.syncInteraction({ highlights: session.highlights, ghost, patterns: settings.patterns, cursor: cursorKey });
  });
  $effect(() => {
    if (camera) camera.inertia = !settings.reducedMotion;
  });
  // Le curseur clavier ne survit pas à un changement d'étape.
  $effect(() => {
    if (cursorKey && !session.highlights.has(cursorKey)) cursor = null;
  });

  /** Déplace le curseur clavier vers la cellule légale la plus proche dans la direction (§13.6). */
  function moveCursor(dx: number, dy: number) {
    const cells = [...session.highlights].map((k) => parseKey(k));
    if (cells.length === 0) return;
    if (!cursor) {
      cursor = cells[0]!;
    } else {
      const from = hexToPixel(cursor.q, cursor.r);
      let best: { cell: Hex; score: number } | null = null;
      for (const cell of cells) {
        const p = hexToPixel(cell.q, cell.r);
        const vx = p.x - from.x;
        const vy = p.y - from.y;
        const along = vx * dx + vy * dy;
        if (along <= 0) continue;
        const score = along + 2 * Math.abs(vx * dy - vy * dx);
        if (!best || score < best.score) best = { cell, score };
      }
      if (best) cursor = best.cell;
    }
    session.hover = cursor;
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const arrow = arrows[e.key];
    if (arrow && session.canAct && session.highlights.size > 0) {
      e.preventDefault();
      moveCursor(arrow[0], arrow[1]);
    } else if (e.key === 'r' || e.key === 'R') session.rotate(e.shiftKey ? -1 : 1);
    else if (e.key === 'Enter' && cursor && session.highlights.has(cellKey(cursor.q, cursor.r))) {
      session.clickCell(cursor.q, cursor.r);
    } else if (e.key === 'Enter' && session.has('confirm')) session.simple('confirm');
    else if ((e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) && session.has('undo')) session.simple('undo');
    else if (e.key === ' ') recenter();
  }

  function onPointerMove(e: PointerEvent) {
    pointer = { x: e.clientX, y: e.clientY };
  }

  /** Glisser-déposer d'une tuile du marché vers le plateau (§13.2). */
  function startDrag(slot: number, e: PointerEvent) {
    drag = { slot };
    pointer = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || !camera || !pixi) {
      drag = null;
      return;
    }
    const rect = pixi.canvas.getBoundingClientRect();
    const local = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target === pixi.canvas) {
      const w = camera.toWorld(local);
      const h = pixelToHex(w.x, w.y);
      session.dropSlotOn(drag.slot, h.q, h.r);
    }
    drag = null;
  }
</script>

<svelte:window onkeydown={onKey} onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div class="board" bind:this={boardEl}></div>

<div class="hud">
  <div class="top">
    <div class="top-left"><TurnBar {session} /></div>
    <div class="top-right">
      <Scoreboard {session} />
      <ObjectivesPanel {session} />
      <div class="menus">
        <button class="menu" data-interactive aria-label={t('home.settings')} onclick={() => (appState.settingsOpen = true)}>⚙</button>
        <button class="menu" data-interactive onclick={() => goto({ name: 'home' })}>{t('game.menu')}</button>
      </div>
    </div>
  </div>
  <div class="bottom">
    {#if session.state.phase === 'playing'}<Market {session} onDragStart={startDrag} />{/if}
    <Controls {session} onRecenter={recenter} />
  </div>
  <div class="bottom-left"><EventLog {session} /></div>
  {#if session.driver instanceof NetworkDriver}
    <div class="bottom-right"><Chat driver={session.driver} teams={session.state.config.teams !== null} /></div>
  {/if}
</div>

{#if session.preview !== null && session.hover}
  <div class="preview" style:left="{pointer.x + 16}px" style:top="{pointer.y + 16}px">
    {t('game.gain', { value: session.preview > 0 ? `+${session.preview}` : session.preview })}
  </div>
{/if}

{#if drag && session.state.market[drag.slot]?.tile}
  <div class="drag" style:left="{pointer.x - 32}px" style:top="{pointer.y - 32}px">
    <TilePreview def={session.state.market[drag.slot]!.tile!} rotation={session.rotation} />
  </div>
{/if}

{#if session.connection !== 'online'}
  <div class="banner" role="status">{t(`online.connection.${session.connection}`)}</div>
{/if}

{#if slowSuggestion}
  <div class="suggest" role="status" data-interactive>
    {t('game.slow', { profile: t(`settings.profiles.${slowSuggestion}`) })}
    <button onclick={() => { settings.profile = slowSuggestion!; slowSuggestion = null; }}>{t('game.switchProfile')}</button>
    <button onclick={() => (slowSuggestion = null)}>{t('settings.close')}</button>
  </div>
{/if}

{#if session.message}
  <div class="toast" role="status">{t('errors.generic', { reason: session.message })}</div>
{/if}

<VoteModal {session} />

{#if mustPass}
  <div class="pass" data-interactive>
    <p>{t('game.passDevice', { name: seatName(session.state, session.viewerSeat) })}</p>
    <button class="primary" onclick={() => (confirmedViewer = session.viewerSeat)}>
      {t('game.ready', { name: seatName(session.state, session.viewerSeat) })}
    </button>
  </div>
{/if}

{#if session.state.phase === 'ended'}
  <EndScreen {session} />
{/if}

<style>
  .board {
    position: fixed;
    inset: 0;
  }
  .hud {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }
  .top {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    right: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .top-left {
    max-width: min(34rem, 60vw);
  }
  .top-right {
    display: grid;
    gap: 0.5rem;
    justify-items: end;
  }
  .menus {
    display: flex;
    gap: 0.4rem;
  }
  .bottom {
    position: absolute;
    bottom: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    gap: 0.5rem;
    justify-items: center;
  }
  .bottom-left {
    position: absolute;
    bottom: 0.75rem;
    left: 0.75rem;
  }
  .bottom-right {
    position: absolute;
    bottom: 0.75rem;
    right: 0.75rem;
  }
  .menu {
    pointer-events: auto;
  }
  .preview,
  .drag {
    position: fixed;
    pointer-events: none;
    z-index: 30;
  }
  .preview {
    background: #111a;
    border: 1px solid var(--border);
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-weight: bold;
  }
  .toast {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #4a1f1f;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    pointer-events: none;
    opacity: 0.9;
  }
  .suggest {
    position: fixed;
    top: 3rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--panel);
    border: 1px solid var(--border);
    padding: 0.4rem 0.8rem;
    border-radius: 8px;
    z-index: 55;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .banner {
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    background: #6b4a12;
    padding: 0.35rem 1rem;
    border-radius: 0 0 8px 8px;
    z-index: 55;
    pointer-events: none;
  }
  .pass {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: #101511;
    display: grid;
    place-content: center;
    text-align: center;
    gap: 1rem;
    font-size: 1.3rem;
  }
  @media (max-width: 700px) {
    .bottom-left {
      display: none;
    }
    .bottom-right {
      bottom: auto;
      top: 50%;
    }
    .top {
      top: 0.4rem;
      left: 0.4rem;
      right: 0.4rem;
      font-size: 0.85rem;
    }
    .top-left {
      max-width: none;
      flex: 1 1 100%;
    }
    .top-right {
      flex: 1 1 100%;
      grid-template-columns: 1fr auto;
      align-items: start;
      justify-items: stretch;
    }
    .menus {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }
    .bottom {
      bottom: 0.4rem;
      width: calc(100vw - 0.8rem);
    }
  }
</style>
