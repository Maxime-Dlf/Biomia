<script lang="ts">
  import { onMount } from 'svelte';
  import { app, goto } from '../app/app.svelte.ts';
  import { NetworkDriver, OnlineError } from '../game/network-driver.ts';
  import { GameSession } from '../game/session.svelte.ts';
  import { t } from '../i18n/i18n.svelte.ts';
  import { clearSession, loadSession } from '../net/endpoint.ts';
  import { bootPlatform } from '../platform/boot.ts';
  import { codeFromLocation, isDiscordLaunch } from '../platform/platform.ts';
  import { settings } from '../settings/settings.svelte.ts';
  import Game from './screens/Game.svelte';
  import Home from './screens/Home.svelte';
  import Legal from './screens/Legal.svelte';
  import Lobby from './screens/Lobby.svelte';
  import OfflineSetup from './screens/OfflineSetup.svelte';
  import OnlineSetup from './screens/OnlineSetup.svelte';
  import SettingsPanel from './SettingsPanel.svelte';

  /** Rejoint le salon de l'Activity Discord (§16.3), ou le reprend après un rechargement. */
  async function startInDiscord() {
    goto({ name: 'resuming' });
    try {
      const platform = await bootPlatform();
      app.platform = platform;
      const roomId = platform.roomId!;
      const identity = platform.identity!;
      const saved = loadSession();
      let driver: NetworkDriver | null = null;
      if (saved?.roomId === roomId) driver = await NetworkDriver.resume(saved).catch(() => null);
      if (!driver) {
        try {
          driver = await NetworkDriver.join(identity.name, roomId, { discordToken: identity.discordToken });
        } catch (e) {
          // Partie déjà lancée sans siège à reprendre : le membre du vocal la regarde.
          if (!(e instanceof OnlineError) || (e.code !== 'in-progress' && e.code !== 'full')) throw e;
          driver = await NetworkDriver.join(identity.name, roomId, { spectator: true });
        }
      }
      goto(driver.started ? { name: 'game', session: new GameSession(driver) } : { name: 'lobby', driver });
    } catch (e) {
      goto({ name: 'online', error: e instanceof OnlineError ? e.code : 'discord' });
    }
  }

  /** Un F5 ne fait pas perdre la partie : reprise de la session mémorisée (§11.4). */
  /** Scènes de référence (développement uniquement) : captures visuelles et mesure des FPS. */
  async function openScene(params: URLSearchParams): Promise<boolean> {
    const name = params.get('scene');
    if (!import.meta.env.DEV || !name) return false;
    const profile = params.get('profile');
    if (profile === 'normal' || profile === 'low' || profile === 'ultra-low') settings.profile = profile;
    // Particules aléatoires : désactivées pour des captures reproductibles.
    if (params.get('particles') === '0') settings.graphics = { ...settings.graphics, particles: false };
    const { SceneDriver, sceneState } = await import('../game/scene.ts');
    const state = sceneState(name);
    if (!state) return false;
    goto({ name: 'game', session: new GameSession(new SceneDriver(state)) });
    return true;
  }

  onMount(async () => {
    if (await openScene(new URLSearchParams(location.search))) return;
    if (isDiscordLaunch(location.search)) {
      void startInDiscord();
      return;
    }
    const code = codeFromLocation(location.pathname, location.hash);
    const saved = loadSession();
    if (saved && (!code || code === saved.roomId)) {
      goto({ name: 'resuming' });
      NetworkDriver.resume(saved).then(
        (driver) =>
          goto(driver.started ? { name: 'game', session: new GameSession(driver) } : { name: 'lobby', driver }),
        (e: unknown) => {
          clearSession();
          goto({ name: 'online', error: e instanceof OnlineError ? e.code : 'network' });
        },
      );
    } else if (code) {
      goto({ name: 'online', code });
    }
  });
</script>

{#if app.screen.name === 'home'}
  <Home />
{:else if app.screen.name === 'setup'}
  <OfflineSetup />
{:else if app.screen.name === 'online'}
  <OnlineSetup error={app.screen.error ?? null} initialCode={app.screen.code ?? ''} />
{:else if app.screen.name === 'legal'}
  <Legal />
{:else if app.screen.name === 'resuming'}
  <main class="resuming" role="status">{t('online.resuming')}</main>
{:else if app.screen.name === 'lobby'}
  {#key app.screen.driver}
    <Lobby driver={app.screen.driver} />
  {/key}
{:else}
  {#key app.screen.session}
    <Game session={app.screen.session} />
  {/key}
{/if}

{#if app.settingsOpen}
  <SettingsPanel />
{/if}

<style>
  .resuming {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    background: #172019;
  }
</style>
