<script lang="ts">
  import { CUSTOM_DEFAULT_OPTIONS, customConfig, tierForAll } from '@crassecadia/content';
  import type { SeatConfig } from '@crassecadia/engine';
  import { goto } from '../../app/app.svelte.ts';
  import { LocalDriver } from '../../game/local-driver.ts';
  import { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';

  type SeatRow = { name: string; bot: boolean };
  const presets = { official: 'D', initiation: 'A', chaos: 'C' } as const;

  let rows: SeatRow[] = $state([
    { name: 'Joueur 1', bot: false },
    { name: 'Bot 1', bot: true },
  ]);
  let rounds = $state(20);
  let timer = $state<number | null>(45);
  let preset = $state<keyof typeof presets>('official');
  let objectives = $state(true);
  let seed = $state(Math.random().toString(36).slice(2, 10));

  function addSeat() {
    if (rows.length < 8) rows.push({ name: `Bot ${rows.length}`, bot: true });
  }

  function start() {
    const seats: SeatConfig[] = rows.map((row, i) => ({
      id: `s${i}`,
      name: row.name.trim() || `#${i + 1}`,
      bot: row.bot ? 'easy' : null,
    }));
    const config = customConfig(seats, {
      mode: 'offline',
      rounds,
      turnTimerMs: timer === null ? null : timer * 1000,
      tierByShape: tierForAll(presets[preset]),
      options: { objectives: { ...CUSTOM_DEFAULT_OPTIONS.objectives, enabled: objectives } },
    });
    goto({ name: 'game', session: new GameSession(new LocalDriver(config, seed)) });
  }
</script>

<main class="setup" data-interactive>
  <h1>{t('setup.title')}</h1>
  <section>
    <h2>{t('setup.seats')}</h2>
    {#each rows as row, i (i)}
      <div class="seat">
        <input aria-label={t('setup.name')} bind:value={row.name} maxlength="16" />
        <select aria-label={t('setup.bot')} bind:value={row.bot}>
          <option value={false}>{t('setup.human')}</option>
          <option value={true}>{t('setup.bot')}</option>
        </select>
        <button disabled={rows.length <= 1} onclick={() => rows.splice(i, 1)}>{t('setup.removeSeat')}</button>
      </div>
    {/each}
    <button disabled={rows.length >= 8} onclick={addSeat}>{t('setup.addSeat')}</button>
  </section>
  <section class="grid">
    <label>
      {t('setup.rounds')} ({rounds})
      <input type="range" min="1" max="40" bind:value={rounds} />
    </label>
    <label>
      {t('setup.timer')}
      <select bind:value={timer}>
        <option value={null}>{t('setup.noTimer')}</option>
        {#each [30, 45, 60, 90, 120] as s (s)}
          <option value={s}>{t('setup.seconds', { count: s })}</option>
        {/each}
      </select>
    </label>
    <label>
      {t('setup.preset')}
      <select bind:value={preset}>
        {#each Object.keys(presets) as p (p)}
          <option value={p}>{t(`presets.${p}`)}</option>
        {/each}
      </select>
    </label>
    <label class="check"><input type="checkbox" bind:checked={objectives} /> {t('setup.objectives')}</label>
    <label>
      {t('setup.seed')}
      <input bind:value={seed} maxlength="32" />
    </label>
  </section>
  <nav>
    <button onclick={() => goto({ name: 'home' })}>{t('setup.back')}</button>
    <button class="primary" onclick={start}>{t('setup.start')}</button>
  </nav>
</main>

<style>
  .setup {
    position: absolute;
    inset: 0;
    overflow: auto;
    padding: 2rem max(1rem, calc(50vw - 20rem));
    display: grid;
    gap: 1.25rem;
    align-content: start;
    background: #172019;
  }
  h1,
  h2 {
    margin: 0;
  }
  section {
    display: grid;
    gap: 0.5rem;
  }
  .seat {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.5rem;
  }
  .grid {
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  nav {
    display: flex;
    justify-content: space-between;
  }
</style>
