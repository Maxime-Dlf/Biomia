<script lang="ts">
  import { rotateEdges, type TileDef } from '@crassecadia/engine';
  import { envStyle } from '../../render/palette.ts';
  import ShapeIcon from './ShapeIcon.svelte';

  let { def, rotation = 0, size = 64 }: { def: TileDef; rotation?: number; size?: number } = $props();

  // Coins d'un hexagone pointe en haut dans une boîte 100 × 100 (direction i à 60°·i antihoraire).
  const corners = Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 30) * Math.PI) / 180;
    return { x: 50 + 46 * Math.cos(a), y: 50 - 46 * Math.sin(a) };
  });
  const edges = $derived(rotateEdges(def.edges, rotation));
</script>

<div class="tile" style:width="{size}px" style:height="{size}px">
  <svg viewBox="0 0 100 100" aria-hidden="true">
    {#each edges as env, i (i)}
      {@const a = corners[i]!}
      {@const b = corners[(i + 1) % 6]!}
      <polygon points="50,50 {a.x},{a.y} {b.x},{b.y}" fill={envStyle(env).css} />
    {/each}
    <polygon points={corners.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke="#10140f" stroke-width="2" />
  </svg>
  <div class="icons">
    {#each def.accepted as shape (shape)}
      <ShapeIcon {shape} size={size * 0.24} fill="#ffffff" />
    {/each}
  </div>
</div>

<style>
  .tile {
    position: relative;
  }
  svg {
    position: absolute;
    inset: 0;
  }
  .icons {
    position: absolute;
    inset: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    align-content: center;
    gap: 1px;
    padding: 22%;
  }
</style>
