<script lang="ts">
  import type { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { campCss } from '../../render/palette.ts';
  import { campName } from '../format.ts';

  let { session }: { session: GameSession } = $props();

  const game = $derived(session.state);
  const mine = $derived(session.report.byCamp[session.viewerCamp]);
  const tokens = $derived(mine ? Object.values(mine.tokens).reduce((a, b) => a + b, 0) : 0);
</script>

<section class="scores" data-interactive aria-label={t('score.title')}>
  <h3>{t('score.title')}</h3>
  <ul>
    {#each session.campOrder as camp, i (camp)}
      <li class:me={camp === session.viewerCamp} style:--camp={campCss(i)}>
        <span class="dot"></span>
        <span class="name">{campName(game, camp)}</span>
        <span class="total">{session.report.byCamp[camp]?.total ?? 0}</span>
      </li>
    {/each}
  </ul>
  {#if mine}
    <!-- Détail de son camp uniquement ; total seul pour les adversaires (§13.4). -->
    <dl>
      <dt>{t('score.environments')}</dt><dd>{mine.environments}</dd>
      <dt>{t('score.tokens')}</dt><dd>{tokens}</dd>
      <dt>{t('score.effects')}</dt><dd>{mine.effects}</dd>
    </dl>
  {/if}
</section>

<style>
  .scores {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.5rem 0.75rem;
    min-width: 11rem;
  }
  h3 {
    margin: 0 0 0.3rem;
    font-size: 0.9rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
  }
  li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.4rem;
    align-items: center;
  }
  li.me .name {
    font-weight: bold;
  }
  .dot {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: var(--camp);
    border: 1px solid #000;
  }
  .total {
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 700px) {
    dl {
      display: none !important;
    }
    .scores {
      min-width: 0;
    }
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    margin: 0.4rem 0 0;
    font-size: 0.8rem;
    opacity: 0.85;
  }
  dt,
  dd {
    margin: 0;
  }
  dd {
    text-align: right;
  }
</style>
