<script lang="ts">
  import { app } from '../app/app.svelte.ts';
  import { localized, t } from '../i18n/i18n.svelte.ts';
  import { PROFILE_OPTIONS, type RenderOptions } from '../render/performance.ts';
  import { THEMES } from '../render/theme.ts';
  import { type GraphicsProfile, settings } from '../settings/settings.svelte.ts';

  const profiles: GraphicsProfile[] = ['normal', 'low', 'ultra-low'];
  /** Options individuelles réglables en plus du profil (§14.3). */
  const toggles = ['bevel', 'shadows', 'organicBorders', 'interlacedIcons', 'particles'] as const;
  const profileValue = (key: keyof RenderOptions) => PROFILE_OPTIONS[settings.profile][key];
  const value = <K extends keyof RenderOptions>(key: K): RenderOptions[K] =>
    (settings.graphics[key] ?? profileValue(key)) as RenderOptions[K];

  function setOption<K extends keyof RenderOptions>(key: K, v: RenderOptions[K]) {
    const next = { ...settings.graphics };
    // Valeur du profil : l'option individuelle est retirée.
    if (v === profileValue(key)) delete next[key];
    else next[key] = v;
    settings.graphics = next;
  }
</script>

<div class="backdrop" data-interactive role="presentation" onclick={(e) => e.target === e.currentTarget && (app.settingsOpen = false)}>
  <div class="panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <h2 id="settings-title">{t('settings.title')}</h2>
    <label>
      {t('settings.profile')}
      <select bind:value={settings.profile}>
        {#each profiles as p (p)}
          <option value={p}>{t(`settings.profiles.${p}`)}</option>
        {/each}
      </select>
    </label>
    <details>
      <summary>{t('settings.advanced')}</summary>
      {#each toggles as key (key)}
        <label class="check">
          <input type="checkbox" checked={value(key)} onchange={(e) => setOption(key, e.currentTarget.checked)} />
          {t(`settings.options.${key}`)}
        </label>
      {/each}
      <label>
        {t('settings.options.tokenShader')}
        <select value={value('tokenShader')} onchange={(e) => setOption('tokenShader', e.currentTarget.value as RenderOptions['tokenShader'])}>
          {#each ['luxe', 'simple', 'none'] as v (v)}<option value={v}>{t(`settings.shader.${v}`)}</option>{/each}
        </select>
      </label>
      <label>
        {t('settings.options.lighting')}
        <select value={value('lighting')} onchange={(e) => setOption('lighting', e.currentTarget.value as RenderOptions['lighting'])}>
          {#each ['solar', 'zenith', 'none'] as v (v)}<option value={v}>{t(`settings.light.${v}`)}</option>{/each}
        </select>
      </label>
      <label>
        {t('settings.options.animations')}
        <select value={value('animations')} onchange={(e) => setOption('animations', e.currentTarget.value as RenderOptions['animations'])}>
          {#each ['full', 'light', 'none'] as v (v)}<option value={v}>{t(`settings.anim.${v}`)}</option>{/each}
        </select>
      </label>
      {#if Object.keys(settings.graphics).length > 0}
        <button onclick={() => (settings.graphics = {})}>{t('settings.resetOptions')}</button>
      {/if}
    </details>
    <label>
      {t('settings.theme')}
      <select bind:value={settings.theme}>
        {#each THEMES as theme (theme.id)}<option value={theme.id}>{localized(theme.name, theme.id)}</option>{/each}
      </select>
    </label>
    <label>
      {t('settings.renderScale')}
      <select bind:value={settings.renderScale}>
        <option value={50}>50 %</option>
        <option value={75}>75 %</option>
        <option value={100}>100 %</option>
      </select>
    </label>
    <label>
      {t('settings.language')}
      <select bind:value={settings.language}>
        <option value="fr">Français</option>
        <option value="en">English</option>
      </select>
    </label>
    <label class="check"><input type="checkbox" bind:checked={settings.patterns} /> {t('settings.patterns')}</label>
    <label class="check"><input type="checkbox" bind:checked={settings.highContrast} /> {t('settings.highContrast')}</label>
    <label class="check"><input type="checkbox" bind:checked={settings.reducedMotion} /> {t('settings.reducedMotion')}</label>
    <label>
      {t('settings.textScale')} ({settings.textScale} %)
      <input type="range" min="80" max="150" step="5" bind:value={settings.textScale} />
    </label>
    <label>
      {t('settings.volume')} ({settings.volume})
      <input type="range" min="0" max="100" bind:value={settings.volume} />
    </label>
    <button class="primary" onclick={() => (app.settingsOpen = false)}>{t('settings.close')}</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.55);
    display: grid;
    place-items: center;
    z-index: 50;
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    display: grid;
    gap: 0.75rem;
    width: min(26rem, 92vw);
  }
  h2 {
    margin: 0 0 0.25rem;
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
  details {
    display: grid;
    gap: 0.4rem;
  }
</style>
