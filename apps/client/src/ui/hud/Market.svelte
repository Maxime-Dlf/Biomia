<script lang="ts">
  import type { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import ShapeIcon from './ShapeIcon.svelte';
  import TilePreview from './TilePreview.svelte';

  let { session, onDragStart }: { session: GameSession; onDragStart: (slot: number, e: PointerEvent) => void } = $props();

  const game = $derived(session.state);
  const turn = $derived(game.turn);
  const camp = $derived(session.viewerCamp);
  const jokers = $derived(game.camps[camp]?.jokers ?? 0);
</script>

<section class="market" data-interactive aria-label={t('game.market')}>
  <h3>{t('game.market')} <span class="jokers" data-joker-counter>{t('game.jokers', { count: jokers })}</span></h3>
  <div class="slots">
    {#each game.market as slot, i (i)}
      {@const chosen = turn?.slot === i}
      {@const tokenChosen = turn?.tokenChoice?.slot === i}
      {@const placeable = session.placeable[i] ?? false}
      {@const pickTile = session.canAct && session.step === 'chooseTile' && slot.tile !== null}
      {@const pickToken = session.canAct && session.step === 'chooseToken' && placeable && (turn?.slot === i || jokers > 0)}
      <div class="slot" class:chosen class:tokenChosen>
        <button
          class="tile"
          disabled={!pickTile}
          onclick={() => session.chooseSlot(i)}
          onpointerdown={(e) => pickTile && onDragStart(i, e)}
          aria-label="tuile {i + 1}"
        >
          {#if slot.tile}
            <TilePreview def={slot.tile} size={58} rotation={chosen ? session.rotation : 0} />
          {/if}
        </button>
        <button
          class="token"
          class:blocked={slot.token !== null && !placeable}
          disabled={!pickToken}
          onclick={() => session.chooseSlot(i)}
          title={!placeable ? t('game.notPlaceable') : turn?.slot !== undefined && turn?.slot !== null && turn.slot !== i ? t('game.jokerCost') : ''}
        >
          {#if slot.token}
            <ShapeIcon shape={slot.token} size={26} />
          {/if}
          {#if session.step === 'chooseToken' && turn?.slot !== i && placeable}
            <span class="cost">{t('game.jokerCost')}</span>
          {/if}
        </button>
      </div>
    {/each}
  </div>
</section>

<style>
  .market {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.5rem;
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.9rem;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .jokers {
    font-weight: normal;
    opacity: 0.85;
  }
  .slots {
    display: flex;
    gap: 0.4rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .slot {
    display: grid;
    gap: 0.25rem;
    justify-items: center;
    padding: 0.25rem;
    border-radius: 8px;
    border: 2px solid transparent;
  }
  .slot.chosen {
    border-color: #ffd11a;
  }
  .slot.tokenChosen .token {
    outline: 3px solid #ffd11a;
  }
  button.tile,
  button.token {
    padding: 0;
    background: transparent;
    border: none;
    position: relative;
  }
  button.tile:disabled,
  button.token:disabled {
    opacity: 1;
    cursor: default;
  }
  button.token {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #2a352e;
    display: grid;
    place-items: center;
  }
  /* Halo rouge : jeton non plaçable (§6.4). */
  button.token.blocked {
    box-shadow: 0 0 0 3px #ff4d4d, 0 0 12px #ff4d4d;
  }
  .cost {
    position: absolute;
    bottom: -0.9rem;
    font-size: 0.65rem;
    white-space: nowrap;
    color: #ffd11a;
  }
</style>
