<script lang="ts">
  import { PlayerNameSchema, type RoomCreation, RoomCreationSchema } from '@crassecadia/protocol';
  import { untrack } from 'svelte';
  import { goto } from '../../app/app.svelte.ts';
  import { NetworkDriver, OnlineError } from '../../game/network-driver.ts';
  import { GameSession } from '../../game/session.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { settings as globalSettings } from '../../settings/settings.svelte.ts';
  import RoomBrowser from '../lobby/RoomBrowser.svelte';

  let { error = null, initialCode = '' }: { error?: string | null; initialCode?: string } = $props();

  let name = $state('Joueur');
  let code = $state(untrack(() => initialCode));
  let codePassword = $state('');
  let roomName = $state('Salon de Joueur');
  let visibility = $state<RoomCreation['visibility']>('public');
  let password = $state('');
  let busy = $state(false);
  let problem = $state<string | null>(null);
  $effect.pre(() => {
    problem = error;
  });

  const validName = $derived(PlayerNameSchema.safeParse(name).success);
  const creation = $derived<RoomCreation>({
    name: roomName.trim(),
    visibility,
    language: globalSettings.language,
    ...(visibility === 'protected' ? { password } : {}),
  });
  const validCreation = $derived(RoomCreationSchema.safeParse(creation).success);

  async function run(open: () => Promise<NetworkDriver>) {
    busy = true;
    problem = null;
    try {
      const driver = await open();
      // Un spectateur arrivé en cours de partie va directement au plateau.
      goto(driver.started ? { name: 'game', session: new GameSession(driver) } : { name: 'lobby', driver });
    } catch (e) {
      problem = e instanceof OnlineError ? e.code : 'network';
    } finally {
      busy = false;
    }
  }

  function joinRoom(roomId: string, options: { password?: string; spectator?: boolean }) {
    void run(() => NetworkDriver.join(name.trim(), roomId, options));
  }
</script>

<main class="online" data-interactive>
  <h1>{t('online.title')}</h1>
  <label>
    {t('online.name')}
    <input bind:value={name} maxlength="16" aria-invalid={!validName} />
  </label>

  <section>
    <h2>{t('online.join')}</h2>
    <form class="row" onsubmit={(e) => { e.preventDefault(); joinRoom(code, codePassword ? { password: codePassword } : {}); }}>
      <input aria-label={t('online.code')} placeholder={t('online.code')} bind:value={code} maxlength="6" autocapitalize="characters" />
      <input type="password" aria-label={t('browser.passwordOptional')} placeholder={t('browser.passwordOptional')} bind:value={codePassword} maxlength="64" />
      <button type="submit" data-testid="join-code" disabled={busy || !validName || code.trim().length !== 6}>{t('online.joinButton')}</button>
    </form>
  </section>

  <section>
    <h2>{t('online.create')}</h2>
    <div class="grid">
      <label>
        {t('online.roomName')}
        <input bind:value={roomName} maxlength="32" />
      </label>
      <label>
        {t('online.visibility')}
        <select bind:value={visibility}>
          {#each ['public', 'protected', 'private'] as v (v)}<option value={v}>{t(`online.visibilities.${v}`)}</option>{/each}
        </select>
      </label>
      {#if visibility === 'protected'}
        <label>
          {t('browser.password')}
          <input type="password" bind:value={password} maxlength="64" minlength="4" />
        </label>
      {/if}
    </div>
    <button class="primary" disabled={busy || !validName || !validCreation} onclick={() => void run(() => NetworkDriver.create(name.trim(), creation))}>
      {t('online.createButton')}
    </button>
  </section>

  {#if problem}
    <p class="error" role="alert">
      {t(`online.errors.${problem}`)}
      {#if problem === 'protocol-mismatch'}
        <button onclick={() => location.reload()}>{t('online.reload')}</button>
      {/if}
    </p>
  {/if}

  <RoomBrowser {busy} onjoin={(roomId, options) => validName && joinRoom(roomId, options)} />

  <nav>
    <button onclick={() => goto({ name: 'home' })}>{t('setup.back')}</button>
  </nav>
</main>

<style>
  .online {
    position: absolute;
    inset: 0;
    overflow: auto;
    padding: 2rem max(1rem, calc(50vw - 32rem));
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
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 0.5rem;
  }
  .row input:first-child {
    text-transform: uppercase;
    letter-spacing: 0.2em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
  }
  .error {
    background: #4a1f1f;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
  }
  nav {
    display: flex;
    justify-content: space-between;
  }
  @media (max-width: 700px) {
    .row {
      grid-template-columns: 1fr;
    }
  }
</style>
