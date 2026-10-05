<script lang="ts">
  import type { GameEvent } from '@crassecadia/engine';
  import type { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { campName, seatName, shapeName } from '../format.ts';

  let { session }: { session: GameSession } = $props();
  const game = $derived(session.state);

  /** Message d'un événement public, ou `null` s'il n'est pas affiché au journal. */
  function message(e: GameEvent): string | null {
    switch (e.type) {
      case 'TilePlaced':
        return e.start ? null : t('log.tilePlaced', { name: seatName(game, e.seat) });
      case 'TokenPlaced':
        return t('log.tokenPlaced', { name: seatName(game, e.seat), shape: shapeName(game, e.token.shape) });
      case 'OwnershipChanged':
        return t('log.steal', {
          to: campName(game, e.to),
          from: campName(game, e.from),
          what: e.kind === 'environment' ? t('log.environment') : t('log.structure'),
        });
      case 'StructureInvalidated':
        return e.owner ? t('log.invalidated', { owner: campName(game, e.owner) }) : null;
      case 'TokenBlocked':
        return t('log.blocked');
      case 'TokenAbsorbed':
        return t('log.absorbed');
      case 'JokerGained':
        return t('log.joker', { name: campName(game, e.camp) });
      case 'Rerolled':
        return t('log.reroll');
      case 'ObjectivesKept':
        return t('log.kept', { name: campName(game, e.camp), count: e.count });
      default:
        // `ObjectiveStatusChanged` est privé : jamais affiché au journal public.
        return null;
    }
  }

  const lines = $derived(
    session.log
      .map((entry) => ({ id: entry.id, text: message(entry.event), crasse: entry.event.type === 'OwnershipChanged' || entry.event.type === 'StructureInvalidated' }))
      .filter((l) => l.text !== null)
      .slice(-14)
      .reverse(),
  );
</script>

<section class="log" data-interactive aria-label={t('log.title')} aria-live="polite">
  <h3>{t('log.title')}</h3>
  <ul>
    {#each lines as line (line.id)}
      <li class:crasse={line.crasse}>{line.text}</li>
    {/each}
  </ul>
</section>

<style>
  .log {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.5rem 0.75rem;
    max-height: 30vh;
    overflow: auto;
    width: 16rem;
  }
  h3 {
    margin: 0 0 0.3rem;
    font-size: 0.9rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.78rem;
    display: grid;
    gap: 0.15rem;
  }
  li.crasse {
    color: #ffb4a2;
  }
</style>
