<script lang="ts">
  import type { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';

  let { session, onRecenter }: { session: GameSession; onRecenter: () => void } = $props();
  const placing = $derived(session.step === 'placeTile' || session.state.phase === 'startTiles');
</script>

<section class="controls" data-interactive>
  <button disabled={!session.has('reroll')} onclick={() => session.simple('reroll')}>{t('game.reroll')}</button>
  <button disabled={!session.has('undo')} onclick={() => session.simple('undo')}>{t('game.undo')}</button>
  <button disabled={!placing || !session.canAct} onclick={() => session.rotate(1)} title="R">⟲ {t('game.rotate')}</button>
  <button disabled={!(session.canAct && session.step === 'chooseToken')} onclick={() => session.noToken()}>
    {t('game.noToken')}
  </button>
  <button disabled={!session.has('requestObjectives')} onclick={() => session.simple('requestObjectives')}>
    {t('game.resupply')}
  </button>
  <button class="primary" disabled={!session.has('confirm')} onclick={() => session.simple('confirm')}>
    {t('game.confirm')}
  </button>
  <button onclick={onRecenter}>{t('game.recenter')}</button>
</section>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: center;
  }
  @media (max-width: 700px) {
    .controls button {
      padding: 0.35rem 0.55rem;
      font-size: 0.85rem;
    }
  }
</style>
