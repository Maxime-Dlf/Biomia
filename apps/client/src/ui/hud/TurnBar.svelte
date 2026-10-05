<script lang="ts">
  import { currentRound } from '@crassecadia/engine';
  import type { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { campCss } from '../../render/palette.ts';
  import { seatName } from '../format.ts';

  let { session }: { session: GameSession } = $props();

  const game = $derived(session.state);
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(id);
  });
  const seconds = $derived(session.deadline === null ? null : Math.max(0, Math.ceil((session.deadline - now) / 1000)));
  const campIndex = $derived(new Map(session.campOrder.map((c, i) => [c, i])));

  const headline = $derived.by(() => {
    if (game.phase === 'objectives') return t('game.objectivesPhase');
    const seat = session.activeSeat;
    if (!seat) return '';
    const name = seatName(game, seat);
    return session.canAct ? t('game.yourTurn', { name }) : t('game.turnOf', { name });
  });

  const hint = $derived.by(() => {
    if (!session.canAct) return '';
    if (game.phase === 'startTiles') return t('game.placeStart');
    if (session.step) return t(`game.steps.${session.step}`);
    return '';
  });
</script>

<header class="turnbar" data-interactive>
  <div class="main">
    <strong>{headline}</strong>
    {#if hint}<span class="hint">{hint}</span>{/if}
  </div>
  <div class="meta">
    {#if game.phase === 'playing'}
      <span>{t('game.round', { round: currentRound(game), total: game.config.rounds })}</span>
      <span>{t('game.deck', { count: game.deck.length - game.deckPos })}</span>
    {:else if game.phase === 'startTiles'}
      <span>{t('game.startTiles')}</span>
    {/if}
    {#if seconds !== null}
      <span class="timer" class:urgent={seconds <= 10}>⏱ {t('game.timeLeft', { seconds })}</span>
    {/if}
  </div>
  <ol class="order" aria-label="ordre de passage">
    {#each game.turnCycle as seat, i (i)}
      {@const camp = game.seatCamp[seat] ?? seat}
      <li class:active={seat === session.activeSeat} style:--camp={campCss(campIndex.get(camp) ?? 0)}>
        {seatName(game, seat)}
      </li>
    {/each}
  </ol>
</header>

<style>
  .turnbar {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.5rem 0.75rem;
    display: grid;
    gap: 0.3rem;
  }
  .main {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: baseline;
  }
  .hint {
    opacity: 0.8;
    font-size: 0.9rem;
  }
  .meta {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    opacity: 0.85;
  }
  .timer.urgent {
    color: #ff6b6b;
    font-weight: bold;
  }
  .order {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.8rem;
  }
  .order li {
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    border: 2px solid var(--camp);
  }
  .order li.active {
    background: var(--camp);
    color: #111;
    font-weight: bold;
  }
</style>
