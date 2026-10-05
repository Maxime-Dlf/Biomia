<script lang="ts">
  import { evaluate, finalRanking, type GameEvent } from '@crassecadia/engine';
  import { goto } from '../../app/app.svelte.ts';
  import { LocalDriver } from '../../game/local-driver.ts';
  import { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { campCss } from '../../render/palette.ts';
  import { campName, objectiveName, objectiveStatus } from '../format.ts';

  let { session }: { session: GameSession } = $props();

  const game = $derived(session.state);
  const report = $derived(evaluate(game));
  const ranking = $derived(finalRanking(game, report));
  const headline = $derived(
    ranking[0]!.length > 1 ? t('end.shared') : t('end.winner', { name: campName(game, ranking[0]![0]!) }),
  );
  const order = $derived(ranking.flat());
  const categories = ['environments', 'endBonuses', 'effects', 'objectives', 'jokers'] as const;

  /** Chronologie des crasses (§11.3) à partir des événements (§7.4). */
  const crasses = $derived(
    session.history
      .filter((e): e is Extract<GameEvent, { type: 'OwnershipChanged' | 'StructureInvalidated' }> => e.type === 'OwnershipChanged' || e.type === 'StructureInvalidated')
      .map((e) =>
        e.type === 'OwnershipChanged'
          ? t('log.steal', {
              to: campName(game, e.to),
              from: campName(game, e.from),
              what: e.kind === 'environment' ? t('log.environment') : t('log.structure'),
            })
          : t('log.invalidated', { owner: e.owner ? campName(game, e.owner) : '?' }),
      ),
  );

  const local = $derived(session.driver instanceof LocalDriver);

  function exportReplay() {
    const replay = session.driver.replay();
    if (!replay) return;
    const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `crassecadia-replay-${replay.seed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function playAgain() {
    if (!(session.driver instanceof LocalDriver)) return;
    const seed = Math.random().toString(36).slice(2, 10);
    goto({ name: 'game', session: new GameSession(new LocalDriver(session.driver.config, seed)) });
  }
</script>

<div class="backdrop" data-interactive>
  <div class="end" role="dialog" aria-modal="true" aria-labelledby="end-title">
    <h2 id="end-title">{t('end.title')} — {headline}</h2>
    <table>
      <thead>
        <tr>
          <th></th>
          <th>{t('score.total')}</th>
          <th>{t('score.tokens')}</th>
          {#each categories as c (c)}<th>{t(`score.${c}`)}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each order as camp (camp)}
          {@const s = report.byCamp[camp]!}
          <tr style:--camp={campCss(session.campOrder.indexOf(camp))}>
            <th><span class="dot"></span>{campName(game, camp)}</th>
            <td class="total">{s.total}</td>
            <td>{Object.values(s.tokens).reduce((a, b) => a + b, 0)}</td>
            {#each categories as c (c)}<td>{s[c]}</td>{/each}
          </tr>
        {/each}
      </tbody>
    </table>

    {#if game.objectives}
      <h3>{t('end.objectivesRevealed')}</h3>
      <div class="objectives">
        {#each order as camp (camp)}
          <div>
            <strong>{campName(game, camp)}</strong>
            <ul>
              {#each game.objectives.byCamp[camp] ?? [] as h (h.card.id)}
                <li>{objectiveName(game, h.card)} — {objectiveStatus(h).label} ({h.card.value})</li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}

    <h3>{t('end.crasses')}</h3>
    {#if crasses.length === 0}
      <p>{t('end.noCrasse')}</p>
    {:else}
      <ol class="crasses">
        {#each crasses as line, i (i)}<li>{line}</li>{/each}
      </ol>
    {/if}

    <nav>
      <button onclick={() => goto({ name: 'home' })}>{t('end.menu')}</button>
      <button onclick={exportReplay}>{t('end.exportReplay')}</button>
      {#if local}<button class="primary" onclick={playAgain}>{t('end.playAgain')}</button>{/if}
    </nav>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.65);
    display: grid;
    place-items: center;
    z-index: 45;
  }
  .end {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem 1.5rem;
    width: min(52rem, 95vw);
    max-height: 92vh;
    overflow: auto;
    display: grid;
    gap: 0.75rem;
  }
  h2,
  h3 {
    margin: 0;
  }
  table {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 0.3rem 0.5rem;
    text-align: right;
    border-bottom: 1px solid var(--border);
  }
  tbody th {
    text-align: left;
  }
  .total {
    font-weight: bold;
  }
  .dot {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: var(--camp);
    margin-right: 0.4rem;
    border: 1px solid #000;
  }
  .objectives {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
    font-size: 0.85rem;
  }
  .objectives ul {
    margin: 0.25rem 0 0;
    padding-left: 1.1rem;
  }
  .crasses {
    margin: 0;
    max-height: 10rem;
    overflow: auto;
    font-size: 0.85rem;
  }
  nav {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
