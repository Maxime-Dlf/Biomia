<script lang="ts">
  import { app, goto } from '../../app/app.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
</script>

<main class="home" data-interactive>
  <h1>{t('app.title')}</h1>
  <p class="tagline">{t('app.tagline')}</p>
  <nav>
    <button class="primary" onclick={() => goto({ name: 'setup' })}>{t('home.playOffline')}</button>
    <button onclick={() => goto({ name: 'online' })}>{t('home.online')}</button>
    <button onclick={() => (app.settingsOpen = true)}>{t('home.settings')}</button>
  </nav>
  <footer><button class="link" onclick={() => goto({ name: 'legal' })}>{t('legal.link')}</button></footer>
</main>

<style>
  .home {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
    gap: 0.5rem;
    background: radial-gradient(circle at 50% 30%, #2c3a32, #141a16);
  }
  h1 {
    font-size: 3rem;
    margin: 0;
    letter-spacing: 0.05em;
  }
  .tagline {
    opacity: 0.75;
    margin: 0 0 2rem;
  }
  footer {
    margin-top: 2rem;
  }
  .link {
    background: none;
    border: none;
    text-decoration: underline;
    opacity: 0.75;
    cursor: pointer;
  }
  nav {
    display: grid;
    gap: 0.75rem;
    width: min(20rem, 80vw);
    margin: 0 auto;
  }
</style>
