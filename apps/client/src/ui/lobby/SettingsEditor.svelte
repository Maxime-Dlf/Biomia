<script lang="ts">
  /**
   * Paramètres du mode custom (§12.4), modifiables par l'hôte en salle d'attente. Chaque
   * modification est envoyée au serveur, seul juge : la valeur affichée revient à celle du serveur
   * s'il la refuse.
   */
  import { customConfig, officialRuleSet } from '@crassecadia/content';
  import {
    DEFAULT_TILE_BUDGET,
    PERFORMANCE_WARNING_TILES,
    type RoomSettings,
    type RoomSettingsPatch,
    RoomSettingsSchema,
    settingsTileCount,
  } from '@crassecadia/protocol';
  import { onDestroy } from 'svelte';
  import { localized, t } from '../../i18n/i18n.svelte.ts';
  import NumberField from '../controls/NumberField.svelte';

  let {
    settings,
    editable,
    onchange,
  }: {
    settings: RoomSettings;
    editable: boolean;
    onchange: (patch: RoomSettingsPatch) => void;
  } = $props();

  const content = officialRuleSet(customConfig([]));
  const TIERS = ['A', 'B', 'C', 'D'];
  const BROKEN = ['return-fixed-penalty', 'return-value', 'lost-zero', 'to-saboteur', 'locked'] as const;

  /** Modifications locales pas encore reflétées par le serveur. */
  let patch = $state<RoomSettingsPatch>({});
  const shown = $derived({ ...settings, ...patch } as RoomSettings);
  const disabled = $derived(!editable);
  /** Modifications à envoyer, regroupées pendant une saisie rapide. */
  let queued: RoomSettingsPatch = {};
  let sendTimer: ReturnType<typeof setTimeout> | undefined;

  // Les paramètres du serveur ont changé (réponse à un envoi) : on affiche les siens.
  $effect(() => {
    void settings;
    patch = {};
  });
  onDestroy(() => clearTimeout(sendTimer));

  const tiles = $derived(settingsTileCount(shown));
  const valid = $derived(RoomSettingsSchema.safeParse(shown).success);

  function update(change: RoomSettingsPatch) {
    const next: RoomSettings = { ...shown, ...change };
    // Cohérences immédiates : bots et équipes dans la limite des sièges.
    const fixed: RoomSettingsPatch = { ...change };
    if (next.bots > next.seats) fixed.bots = next.seats;
    if (next.teams.count > next.seats) fixed.teams = { ...next.teams, count: Math.max(2, next.seats) };
    patch = { ...patch, ...fixed };
    queued = { ...queued, ...fixed };
    clearTimeout(sendTimer);
    // Envoi seulement d'un ensemble cohérent ; le serveur fusionne et reste seul juge.
    if (!RoomSettingsSchema.safeParse({ ...settings, ...patch }).success) return;
    sendTimer = setTimeout(() => {
      onchange(queued);
      queued = {};
    }, 100);
  }

  function toggleIn(list: readonly string[], id: string, on: boolean): string[] {
    return on ? [...list, id] : list.filter((x) => x !== id);
  }
</script>

<div class="editor" class:readonly={disabled}>
  <fieldset>
    <legend>{t('room.game')}</legend>
    <NumberField label={t('room.seats')} value={shown.seats} min={1} max={999} sliderMax={16} {disabled} onchange={(v) => update({ seats: v })} />
    <NumberField label={t('room.bots')} value={shown.bots} min={0} max={shown.seats} sliderMax={Math.min(shown.seats, 16)} {disabled} onchange={(v) => update({ bots: v })} />
    <label>
      {t('room.botLevel')}
      <select value={shown.botLevel} {disabled} onchange={(e) => update({ botLevel: e.currentTarget.value as RoomSettings['botLevel'] })}>
        {#each ['easy', 'medium', 'cunning'] as level (level)}<option value={level}>{t(`room.levels.${level}`)}</option>{/each}
      </select>
    </label>
    <NumberField label={t('setup.rounds')} value={shown.rounds} min={1} max={999} sliderMax={40} {disabled} onchange={(v) => update({ rounds: v })} />
    <label class="check">
      <input type="checkbox" checked={shown.turnTimerSeconds === null} {disabled} onchange={(e) => update({ turnTimerSeconds: e.currentTarget.checked ? null : 45 })} />
      {t('setup.noTimer')}
    </label>
    {#if shown.turnTimerSeconds !== null}
      <NumberField label={t('room.timerSeconds')} value={shown.turnTimerSeconds} min={5} max={3600} sliderMax={180} {disabled} onchange={(v) => update({ turnTimerSeconds: v })} />
    {/if}
    <label>
      {t('room.turnOrder')}
      <select value={shown.turnOrder} {disabled} onchange={(e) => update({ turnOrder: e.currentTarget.value as RoomSettings['turnOrder'] })}>
        <option value="seats">{t('room.orderSeats')}</option>
        <option value="random">{t('room.orderRandom')}</option>
      </select>
    </label>
    <NumberField label={t('room.market')} value={shown.marketSize} min={1} max={99} sliderMax={8} {disabled} onchange={(v) => update({ marketSize: v })} />
    <NumberField label={t('room.startJokers')} value={shown.startJokers} min={0} max={999} sliderMax={10} {disabled} onchange={(v) => update({ startJokers: v })} />
  </fieldset>

  <fieldset>
    <legend>{t('room.teams')}</legend>
    <label>
      {t('room.teamMode')}
      <select value={shown.teams.mode} {disabled} onchange={(e) => update({ teams: { ...shown.teams, mode: e.currentTarget.value as RoomSettings['teams']['mode'] } })}>
        {#each ['none', 'manual', 'random'] as mode (mode)}<option value={mode}>{t(`room.teamModes.${mode}`)}</option>{/each}
      </select>
    </label>
    {#if shown.teams.mode !== 'none'}
      <NumberField label={t('room.teamCount')} value={shown.teams.count} min={2} max={Math.max(2, shown.seats)} sliderMax={8} {disabled} onchange={(v) => update({ teams: { ...shown.teams, count: v } })} />
    {/if}
  </fieldset>

  <fieldset>
    <legend>{t('room.content')}</legend>
    <table class="shapes">
      <tbody>
        {#each content.shapes as shape (shape.id)}
          {@const on = shown.activeShapes.includes(shape.id)}
          <tr>
            <td>
              <label class="check">
                <input type="checkbox" checked={on} disabled={disabled || (on && shown.activeShapes.length <= 2)} onchange={(e) => update({ activeShapes: toggleIn(shown.activeShapes, shape.id, e.currentTarget.checked) })} />
                {localized(shape.name, shape.id)}
              </label>
            </td>
            <td>
              <select aria-label={t('room.tierOf', { shape: localized(shape.name, shape.id) })} value={shown.tierByShape[shape.id] ?? 'D'} {disabled} onchange={(e) => update({ tierByShape: { ...shown.tierByShape, [shape.id]: e.currentTarget.value } })}>
                {#each TIERS as tier (tier)}<option value={tier}>{t('room.tier', { tier })}</option>{/each}
              </select>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="envs">
      {#each content.envs as env (env.id)}
        {@const on = shown.activeEnvs.includes(env.id)}
        <label class="check">
          <input type="checkbox" checked={on} disabled={disabled || (on && shown.activeEnvs.length <= 2)} onchange={(e) => update({ activeEnvs: toggleIn(shown.activeEnvs, env.id, e.currentTarget.checked) })} />
          {localized(env.name, env.id)}
        </label>
      {/each}
    </div>
    <div class="ratio">
      {#each [0, 1, 2] as i (i)}
        <NumberField label={t('room.capacity', { n: i + 1 })} value={shown.capacityRatio[i]!} min={0} max={99} sliderMax={5} {disabled} onchange={(v) => update({ capacityRatio: shown.capacityRatio.map((w, j) => (j === i ? v : w)) as RoomSettings['capacityRatio'] })} />
      {/each}
    </div>
    <NumberField label={t('room.threshold')} value={shown.thresholdDivisor} min={1} max={1000} sliderMax={30} {disabled} onchange={(v) => update({ thresholdDivisor: v })} />
  </fieldset>

  <fieldset>
    <legend>{t('room.rules')}</legend>
    {#each ['steals', 'sabotage', 'autoReroll', 'manualReroll', 'undo'] as const as key (key)}
      <label class="check">
        <input type="checkbox" checked={shown[key]} {disabled} onchange={(e) => update({ [key]: e.currentTarget.checked })} />
        {t(`room.${key}`)}
      </label>
    {/each}
    <NumberField label={t('room.monoBonus')} value={shown.monoBonus} min={0} max={99} sliderMax={5} {disabled} onchange={(v) => update({ monoBonus: v })} />
  </fieldset>

  <fieldset>
    <legend>{t('setup.objectives')}</legend>
    <label class="check">
      <input type="checkbox" checked={shown.objectives.enabled} {disabled} onchange={(e) => update({ objectives: { ...shown.objectives, enabled: e.currentTarget.checked } })} />
      {t('room.objectivesOn')}
    </label>
    {#if shown.objectives.enabled}
      <NumberField label={t('room.initialHigh')} value={shown.objectives.initialHigh} min={0} max={10} {disabled} onchange={(v) => update({ objectives: { ...shown.objectives, initialHigh: v } })} />
      <NumberField label={t('room.initialLow')} value={shown.objectives.initialLow} min={0} max={10} {disabled} onchange={(v) => update({ objectives: { ...shown.objectives, initialLow: v } })} />
      <label>
        {t('room.broken')}
        <select value={shown.objectives.broken} {disabled} onchange={(e) => update({ objectives: { ...shown.objectives, broken: e.currentTarget.value as RoomSettings['objectives']['broken'] } })}>
          {#each BROKEN as b (b)}<option value={b}>{t(`room.brokenModes.${b}`)}</option>{/each}
        </select>
      </label>
      {#if shown.objectives.broken === 'return-fixed-penalty'}
        <NumberField label={t('room.brokenPenalty')} value={shown.objectives.brokenPenalty} min={0} max={99} sliderMax={10} {disabled} onchange={(v) => update({ objectives: { ...shown.objectives, brokenPenalty: v } })} />
      {/if}
    {/if}
  </fieldset>

  <fieldset>
    <legend>{t('room.visibility')}</legend>
    <label>
      {t('room.structures')}
      <select value={shown.structureVisibility} {disabled} onchange={(e) => update({ structureVisibility: e.currentTarget.value as RoomSettings['structureVisibility'] })}>
        <option value="own">{t('room.own')}</option>
        <option value="all">{t('room.all')}</option>
      </select>
    </label>
    <label>
      {t('room.scores')}
      <select value={shown.scoreVisibility} {disabled} onchange={(e) => update({ scoreVisibility: e.currentTarget.value as RoomSettings['scoreVisibility'] })}>
        <option value="live">{t('room.live')}</option>
        <option value="hidden">{t('room.hidden')}</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" checked={shown.spectators} {disabled} onchange={(e) => update({ spectators: e.currentTarget.checked })} />
      {t('room.spectators')}
    </label>
    <label class="check">
      <input type="checkbox" checked={shown.joinInProgress} {disabled} onchange={(e) => update({ joinInProgress: e.currentTarget.checked })} />
      {t('room.joinInProgress')}
    </label>
  </fieldset>

  {#if !valid}
    <p class="warn" role="alert">{t('room.invalid')}</p>
  {:else if tiles > DEFAULT_TILE_BUDGET}
    <p class="warn" role="alert">{t('room.overBudget', { tiles, budget: DEFAULT_TILE_BUDGET })}</p>
  {:else if tiles > PERFORMANCE_WARNING_TILES}
    <p class="warn" role="status">{t('room.performance', { tiles })}</p>
  {/if}
</div>

<style>
  .editor {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 0.75rem;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.5rem;
    align-content: start;
    margin: 0;
  }
  label {
    display: grid;
    gap: 0.2rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .shapes {
    border-collapse: collapse;
  }
  .shapes td {
    padding: 0.1rem 0.25rem;
  }
  .envs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }
  .ratio {
    display: grid;
    gap: 0.4rem;
  }
  .warn {
    grid-column: 1 / -1;
    background: #5a4214;
    padding: 0.4rem 0.75rem;
    border-radius: 8px;
    margin: 0;
  }
  .readonly :global(input),
  .readonly :global(select) {
    cursor: default;
  }
</style>
