<script lang="ts">
  /**
   * Salle d'attente (§12.3, §13.1) : code et lien du salon, joueurs et équipes, paramètres du
   * §12.4 (modifiables par l'hôte), préréglages et droits de l'hôte.
   */
  import { humanSeats, type ProjectedRoom, type ProjectedSeat, type RoomSettings } from '@crassecadia/protocol';
  import { onDestroy, untrack } from 'svelte';
  import { app, goto } from '../../app/app.svelte.ts';
  import type { NetworkDriver } from '../../game/network-driver.ts';
  import { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { inviteLink } from '../../platform/platform.ts';
  import Chat from '../hud/Chat.svelte';
  import SettingsEditor from '../lobby/SettingsEditor.svelte';

  let { driver }: { driver: NetworkDriver } = $props();

  let room = $state.raw<ProjectedRoom | null>(null);
  let notice = $state<string | null>(null);
  let copied = $state(false);
  /** Recrée l'éditeur après un refus, pour revenir aux valeurs du serveur. */
  let editorKey = $state(0);

  const seats = $derived(room ? Object.values(room.seats) : []);
  // Dérivé du texte : un patch du salon sans changement de paramètres ne recrée pas l'objet.
  const settingsJson = $derived(room?.settings ?? null);
  const settings = $derived(settingsJson ? (JSON.parse(settingsJson) as RoomSettings) : null);
  const isHost = $derived(room?.host === driver.seat);
  const link = $derived(inviteLink(location.origin, driver.roomId));
  let invited = $state<string | null>(null);
  const humans = $derived(seats.filter((s) => s.bot === ''));
  const bots = $derived(seats.filter((s) => s.bot !== ''));
  const teamNames = $derived(
    settings ? Array.from({ length: settings.teams.count }, (_, i) => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1))) : [],
  );

  let left = false;
  // La salle d'attente est recréée pour chaque pilote ({#key} dans App.svelte).
  const unsubscribe = untrack(() => driver).onRoom((r) => {
    room = r;
    const rejected = driver.takeRejection();
    if (rejected) {
      notice = rejected;
      editorKey += 1;
    }
    if (left) return;
    // Navigation différée : le rappel peut survenir pendant l'initialisation du composant.
    if (driver.connection === 'closed') {
      left = true;
      queueMicrotask(() => goto({ name: 'online', error: driver.failure ?? 'network' }));
    } else if (driver.started) {
      left = true;
      queueMicrotask(() => goto({ name: 'game', session: new GameSession(driver) }));
    }
  });
  onDestroy(unsubscribe);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      copied = false;
    }
  }

  const canMove = (seat: ProjectedSeat) => isHost || seat.id === driver.seat;
</script>

<main class="lobby" data-interactive>
  <header>
    <h1>{room?.name ?? t('online.lobby')}</h1>
    <p class="code">
      {t('online.code')} <strong data-testid="room-code">{driver.roomId}</strong>
      <button onclick={copy}>{copied ? t('online.copied') : t('online.copy')}</button>
      <button onclick={async () => (invited = await app.platform.invite(driver.roomId))}>{t('online.invite')}</button>
      {#if invited}<span class="muted" role="status">{t(`online.invited.${invited}`)}</span>{/if}
      {#if room}<span class="badge">{t(`online.visibilities.${room.visibility}`)}</span>{/if}
      {#if room?.locked}<span class="badge">{t('browser.locked')}</span>{/if}
    </p>
    <p class="hint">{t('online.share', { link })}</p>
  </header>

  <section>
    <h2>{t('online.players', { count: humans.length, max: settings ? humanSeats(settings) : 0 })}</h2>
    <table class="seats">
      <tbody>
        {#each [...humans, ...bots] as seat (seat.id)}
          <tr class:offline={!seat.connected}>
            <td>
              {seat.bot ? '🤖 ' : ''}{seat.name}
              {#if seat.id === room?.host}<span class="badge">{t('online.host')}</span>{/if}
              {#if seat.id === driver.seat}<span class="badge">{t('online.you')}</span>{/if}
              {#if !seat.connected}<span class="badge">{t('online.offline')}</span>{/if}
            </td>
            <td>
              {#if settings?.teams.mode === 'manual'}
                <select aria-label={t('room.teamOf', { name: seat.name })} value={seat.team} disabled={!canMove(seat)} onchange={(e) => driver.setTeam(seat.id, Number(e.currentTarget.value))}>
                  {#each teamNames as team, i (i)}<option value={i}>{t('room.team', { team })}</option>{/each}
                </select>
              {:else if settings?.teams.mode === 'random'}
                <span class="muted">{t('room.teamModes.random')}</span>
              {/if}
            </td>
            <td class="actions">
              {#if isHost && seat.bot === '' && seat.id !== driver.seat}
                <button onclick={() => driver.transferHost(seat.id)} disabled={!seat.connected}>{t('room.makeHost')}</button>
                <button onclick={() => driver.kick(seat.id)}>{t('room.kick')}</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if room && room.spectators > 0}<p class="muted">{t('room.watching', { count: room.spectators })}</p>{/if}
  </section>

  {#if isHost}
    <section class="host">
      <span>{t('room.presets')}</span>
      {#each ['official', 'initiation', 'chaos'] as const as preset (preset)}
        <button onclick={() => driver.applyPreset(preset)}>{t(`presets.${preset}`)}</button>
      {/each}
      <label class="check">
        <input type="checkbox" checked={room?.locked ?? false} onchange={(e) => driver.setLocked(e.currentTarget.checked)} />
        {t('room.lock')}
      </label>
    </section>
  {/if}

  {#if settings}
    {#key editorKey}
      <SettingsEditor {settings} editable={isHost} onchange={(s) => driver.sendSettings(s)} />
    {/key}
  {/if}

  <Chat {driver} teams={false} />

  {#if notice}<p class="error" role="alert">{t('errors.generic', { reason: notice })}</p>{/if}

  <nav>
    <button onclick={() => goto({ name: 'online' })}>{t('online.leave')}</button>
    {#if isHost}
      <button class="primary" onclick={() => driver.startGame()}>{t('online.start')}</button>
    {:else}
      <span>{t('online.waitHost')}</span>
    {/if}
  </nav>
</main>

<style>
  .lobby {
    position: absolute;
    inset: 0;
    overflow: auto;
    padding: 1.5rem max(1rem, calc(50vw - 34rem));
    display: grid;
    gap: 1rem;
    align-content: start;
    background: #172019;
  }
  h1,
  h2 {
    margin: 0;
  }
  header {
    display: grid;
    gap: 0.4rem;
  }
  .code {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .code strong {
    font-size: 1.6rem;
    letter-spacing: 0.25em;
  }
  .hint,
  .muted {
    opacity: 0.75;
    margin: 0;
    word-break: break-all;
  }
  .seats {
    border-collapse: collapse;
  }
  .seats td {
    padding: 0.2rem 0.5rem 0.2rem 0;
  }
  .offline {
    opacity: 0.6;
  }
  .badge {
    font-size: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 0.45rem;
    margin-left: 0.4rem;
  }
  .actions {
    display: flex;
    gap: 0.3rem;
  }
  .host {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .error {
    background: #4a1f1f;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
  }
  nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    bottom: 0;
    background: #172019;
    padding: 0.5rem 0;
  }
</style>
