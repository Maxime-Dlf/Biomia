<script lang="ts">
  /**
   * Navigateur de salons (§12.3) : liste en temps réel, recherche texte, filtres (places libres,
   * sans mods, langue, tier, état), tri. Un salon protégé demande son mot de passe.
   */
  import { filterRooms, type ListedRoom, type RoomQuery, type RoomStage } from '@crassecadia/protocol';
  import { onDestroy, onMount } from 'svelte';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { RoomBrowserFeed } from '../../net/room-browser.ts';

  let {
    busy,
    onjoin,
  }: {
    busy: boolean;
    onjoin: (roomId: string, options: { password?: string; spectator?: boolean }) => void;
  } = $props();

  const feed = new RoomBrowserFeed();
  let rooms = $state.raw<ListedRoom[]>([]);
  let offline = $state(false);
  let search = $state('');
  let freeSeats = $state(false);
  let noMods = $state(false);
  let language = $state<string | null>(null);
  let tier = $state<string | null>(null);
  let stage = $state<RoomStage | null>(null);
  let sort = $state<NonNullable<RoomQuery['sort']>>('newest');
  /** Salon protégé dont on saisit le mot de passe. */
  let asking = $state<{ roomId: string; spectator: boolean } | null>(null);
  let password = $state('');

  const shown = $derived(filterRooms(rooms, { search, freeSeats, noMods, language, tier, stage, sort }));
  const languages = $derived([...new Set(rooms.map((r) => r.metadata?.language).filter(Boolean))].sort());

  onMount(() => {
    const unsubscribe = feed.subscribe((list) => (rooms = list));
    feed.connect().catch(() => (offline = true));
    return unsubscribe;
  });
  onDestroy(() => feed.dispose());

  function join(room: ListedRoom, spectator: boolean) {
    if (room.metadata?.protected) {
      asking = { roomId: room.roomId, spectator };
      password = '';
      return;
    }
    onjoin(room.roomId, { spectator });
  }
</script>

<section class="browser" aria-label={t('browser.title')}>
  <h2>{t('browser.title')}</h2>
  <div class="filters">
    <input type="search" placeholder={t('browser.search')} aria-label={t('browser.search')} bind:value={search} />
    <label class="check"><input type="checkbox" bind:checked={freeSeats} /> {t('browser.freeSeats')}</label>
    <label class="check"><input type="checkbox" bind:checked={noMods} /> {t('browser.noMods')}</label>
    <select aria-label={t('browser.language')} bind:value={language}>
      <option value={null}>{t('browser.anyLanguage')}</option>
      {#each languages as l (l)}<option value={l}>{l}</option>{/each}
    </select>
    <select aria-label={t('browser.tier')} bind:value={tier}>
      <option value={null}>{t('browser.anyTier')}</option>
      {#each ['A', 'B', 'C', 'D'] as x (x)}<option value={x}>{t('room.tier', { tier: x })}</option>{/each}
    </select>
    <select aria-label={t('browser.stage')} bind:value={stage}>
      <option value={null}>{t('browser.anyStage')}</option>
      {#each ['lobby', 'playing', 'ended'] as x (x)}<option value={x}>{t(`browser.stages.${x}`)}</option>{/each}
    </select>
    <select aria-label={t('browser.sort')} bind:value={sort}>
      {#each ['newest', 'players', 'name'] as x (x)}<option value={x}>{t(`browser.sorts.${x}`)}</option>{/each}
    </select>
  </div>

  {#if offline}
    <p class="empty">{t('online.errors.network')}</p>
  {:else if shown.length === 0}
    <p class="empty">{t('browser.empty')}</p>
  {:else}
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>{t('browser.name')}</th>
            <th>{t('browser.host')}</th>
            <th>{t('browser.players')}</th>
            <th>{t('browser.stage')}</th>
            <th>{t('browser.tier')}</th>
            <th>{t('browser.mods')}</th>
            <th>{t('setup.rounds')}</th>
            <th>{t('setup.timer')}</th>
            <th>{t('browser.language')}</th>
            <th>{t('browser.region')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each shown as room (room.roomId)}
            {@const m = room.metadata!}
            <tr data-room={room.roomId}>
              <td>
                {#if m.protected}<span title={t('browser.protected')} aria-label={t('browser.protected')}>🔒</span>{/if}
                {#if m.locked}<span title={t('browser.locked')} aria-label={t('browser.locked')}>⛔</span>{/if}
                {m.name}
              </td>
              <td>{m.host}</td>
              <td>{m.humans}{m.bots > 0 ? ` + ${m.bots} 🤖` : ''} / {m.maxHumans + m.bots}</td>
              <td>{t(`browser.stages.${m.stage}`)}</td>
              <td>{m.tiers.join(' / ')}</td>
              <td>
                {#if m.mods.length === 0}—{:else}
                  {m.mods.length}
                  {#if m.mods.some((x) => x.scripts)}<span title={t('browser.scripts')}>📜</span>{/if}
                  {#if m.mods.some((x) => x.shaders)}<span title={t('browser.shaders')}>✨</span>{/if}
                {/if}
              </td>
              <td>{m.rounds}</td>
              <td>{m.timer === null ? '∞' : `${m.timer} s`}</td>
              <td>{m.language}</td>
              <td>{m.region}</td>
              <td class="actions">
                <button disabled={busy || m.freeSeats <= 0 || m.locked || m.stage === 'ended'} onclick={() => join(room, false)}>{t('browser.join')}</button>
                {#if m.spectators && !m.locked}
                  <button disabled={busy} onclick={() => join(room, true)}>{t('browser.watch')}</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if asking}
    <form class="password" onsubmit={(e) => { e.preventDefault(); onjoin(asking!.roomId, { password, spectator: asking!.spectator }); asking = null; }}>
      <label>
        {t('browser.password')}
        <input type="password" bind:value={password} maxlength="64" />
      </label>
      <button type="submit" class="primary" disabled={busy || password.length === 0}>{t('browser.join')}</button>
      <button type="button" onclick={() => (asking = null)}>{t('setup.back')}</button>
    </form>
  {/if}
</section>

<style>
  .browser {
    display: grid;
    gap: 0.5rem;
  }
  h2 {
    margin: 0;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .filters input[type='search'] {
    flex: 1 1 12rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .table {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.9rem;
  }
  th,
  td {
    padding: 0.3rem 0.4rem;
    border-bottom: 1px solid var(--border);
    text-align: left;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    gap: 0.3rem;
  }
  .empty {
    opacity: 0.7;
    margin: 0;
  }
  .password {
    display: flex;
    gap: 0.5rem;
    align-items: end;
    flex-wrap: wrap;
  }
  .password label {
    display: grid;
    gap: 0.2rem;
  }
</style>
