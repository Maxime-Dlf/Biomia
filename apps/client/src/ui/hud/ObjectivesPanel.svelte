<script lang="ts">
  import type { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { objectiveName, objectiveStatus } from '../format.ts';

  let { session }: { session: GameSession } = $props();
  const held = $derived(session.state.objectives?.byCamp[session.viewerCamp] ?? []);
  // Replié par défaut sur petit écran pour laisser voir le plateau.
  const compact = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
</script>

{#if session.state.objectives}
  <details class="objectives" data-interactive open={!compact}>
    <summary><h3>{t('objectives.title')} ({held.length})</h3></summary>
    {#if held.length === 0}
      <p class="empty">{t('objectives.none')}</p>
    {/if}
    <ul>
      {#each held as h (h.card.id)}
        {@const status = objectiveStatus(h)}
        <li class={status.tone}>
          <span class="name">{objectiveName(session.state, h.card)}</span>
          <span class="value">{t('objectives.value', { value: h.card.value })}</span>
          <span class="status">{status.label}</span>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .objectives {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.5rem 0.75rem;
    max-width: 18rem;
  }
  summary {
    cursor: pointer;
    list-style: none;
  }
  h3 {
    display: inline;
    margin: 0;
    font-size: 0.9rem;
  }
  ul {
    margin-top: 0.3rem !important;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0 0.5rem;
    font-size: 0.82rem;
    border-left: 4px solid #777;
    padding-left: 0.4rem;
  }
  li.ok {
    border-color: #4caf50;
  }
  li.warn {
    border-color: #ffb300;
  }
  li.bad {
    border-color: #ff4d4d;
  }
  .status {
    grid-column: 1 / -1;
    opacity: 0.75;
    font-size: 0.75rem;
  }
  .empty {
    margin: 0;
    opacity: 0.7;
    font-size: 0.8rem;
  }
</style>
