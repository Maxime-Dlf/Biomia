<script lang="ts">
  import { t } from '../../i18n/i18n.svelte.ts';

  /**
   * Paramètre numérique (§12.4) : un curseur et une case de saisie libre. `←` / `→` changent la
   * valeur de 1, `Maj + ←/→` de 10. Le curseur couvre une plage usuelle ; la saisie libre va
   * jusqu'aux bornes techniques.
   */
  let {
    label,
    value,
    min,
    max,
    sliderMax = max,
    disabled = false,
    onchange,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    sliderMax?: number;
    disabled?: boolean;
    onchange: (value: number) => void;
  } = $props();

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));

  function set(n: number) {
    if (!Number.isFinite(n)) return;
    const v = clamp(n);
    if (v !== value) onchange(v);
  }

  function onKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(value + step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(value - step);
    else return;
    e.preventDefault();
  }
</script>

<label class="field">
  <span>{label}</span>
  <span class="row">
    <input
      type="range"
      aria-label={t('room.slider', { label })}
      {min}
      max={Math.max(sliderMax, min + 1)}
      value={Math.min(value, sliderMax)}
      {disabled}
      oninput={(e) => set(Number(e.currentTarget.value))}
      onkeydown={onKey}
    />
    <input
      type="number"
      aria-label={label}
      {min}
      {max}
      {value}
      {disabled}
      onchange={(e) => set(Number(e.currentTarget.value))}
      onkeydown={onKey}
    />
  </span>
</label>

<style>
  .field {
    display: grid;
    gap: 0.2rem;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 5rem;
    gap: 0.5rem;
    align-items: center;
  }
  input[type='number'] {
    width: 100%;
  }
</style>
