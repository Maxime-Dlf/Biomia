<script lang="ts">
  import { goto } from '../../app/app.svelte.ts';
  import { t } from '../../i18n/i18n.svelte.ts';
  import { settings } from '../../settings/settings.svelte.ts';
  import { LEGAL } from './legal-text.ts';

  const sections = $derived(LEGAL[settings.language === 'en' ? 'en' : 'fr']);
</script>

<main class="legal" data-interactive>
  <h1>{t('legal.title')}</h1>
  {#each sections as section (section.title)}
    <section>
      <h2>{section.title}</h2>
      {#each section.paragraphs as p, i (i)}<p>{p}</p>{/each}
    </section>
  {/each}
  <nav><button onclick={() => goto({ name: 'home' })}>{t('setup.back')}</button></nav>
</main>

<style>
  .legal {
    position: absolute;
    inset: 0;
    overflow: auto;
    padding: 2rem max(1rem, calc(50vw - 24rem));
    background: #172019;
    line-height: 1.5;
  }
  h2 {
    margin: 1.25rem 0 0.25rem;
    font-size: 1.1rem;
  }
  p {
    margin: 0.3rem 0;
  }
  nav {
    margin-top: 1.5rem;
  }
</style>
