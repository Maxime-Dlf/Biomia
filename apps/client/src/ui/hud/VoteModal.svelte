<script lang="ts">
  import type { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { objectiveName, seatName } from '../format.ts';

  let { session }: { session: GameSession } = $props();

  const vote = $derived(session.state.objectives?.vote ?? null);
  const cards = $derived(vote?.draws[session.viewerCamp] ?? []);
  const mine = $derived(vote?.votes[session.viewerSeat] ?? {});
  /** Coéquipiers du siège affiché : chacun vote pour chaque carte (§10.5). */
  const mates = $derived(
    (session.state.camps[session.viewerCamp]?.seats ?? []).filter((s) => s !== session.viewerSeat),
  );
  /** Choix locaux avant envoi : au moins une carte gardée (§10.5). */
  let keep: Record<string, boolean> = $state({});
  const kept = $derived(cards.filter((c) => keep[c.id] ?? c.tier === 'high'));

  function submit() {
    for (const c of cards) if (mine[c.id] === undefined) session.vote(c.id, keep[c.id] ?? c.tier === 'high');
  }
</script>

{#if vote && session.canAct && cards.some((c) => mine[c.id] === undefined)}
  <div class="backdrop" data-interactive>
    <div class="modal" role="dialog" aria-modal="true">
      <h2>{vote.kind === 'initial' ? t('objectives.voteInitial') : t('objectives.voteResupply')}</h2>
      <div class="cards">
        {#each cards as card (card.id)}
          {@const on = keep[card.id] ?? card.tier === 'high'}
          <button class="card {card.tier}" class:on aria-pressed={on} onclick={() => (keep[card.id] = !on)}>
            <span class="tier">{card.tier === 'high' ? t('objectives.high') : t('objectives.low')}</span>
            <span class="name">{objectiveName(session.state, card)}</span>
            <span class="value">{t('objectives.value', { value: card.value })}</span>
            {#if card.permanent}<span class="perm">{t('objectives.permanent')}</span>{/if}
            <span class="choice">{on ? t('objectives.keep') : t('objectives.reject')}</span>
            {#each mates as mate (mate)}
              {@const v = vote.votes[mate]?.[card.id]}
              <span class="mate">{seatName(session.state, mate)} : {v === undefined ? '…' : v ? t('objectives.keep') : t('objectives.reject')}</span>
            {/each}
          </button>
        {/each}
      </div>
      <button class="primary" disabled={kept.length === 0} onclick={submit}>{t('game.confirm')}</button>
    </div>
  </div>
{/if}

<style>
  .mate {
    font-size: 0.75rem;
    opacity: 0.85;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.6);
    display: grid;
    place-items: center;
    z-index: 40;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    display: grid;
    gap: 1rem;
    width: min(46rem, 94vw);
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }
  .card {
    display: grid;
    gap: 0.35rem;
    text-align: left;
    padding: 0.75rem;
    border-radius: 10px;
    border: 2px solid #555;
    background: #232c26;
    opacity: 0.6;
  }
  .card.high {
    background: #2d2a1d;
  }
  .card.on {
    opacity: 1;
    border-color: #ffd11a;
  }
  .tier,
  .perm {
    font-size: 0.72rem;
    opacity: 0.8;
    text-transform: uppercase;
  }
  .name {
    font-weight: bold;
  }
  .choice {
    font-size: 0.8rem;
  }
</style>
