<script lang="ts">
  let { shape, size = 22, fill = '#f7f3e8', stroke = '#10140f' }: { shape: string; size?: number; fill?: string; stroke?: string } = $props();

  function path(id: string): string {
    switch (id) {
      case 'core:square':
        return 'M4,4 H20 V20 H4 Z';
      case 'core:triangle':
        return 'M12,3 L21,20 H3 Z';
      case 'core:circle':
        return 'M12,3 A9,9 0 1 1 11.99,3 Z';
      case 'core:star':
        return 'M12,2 L14.6,8.6 L21.5,9.2 L16.2,13.7 L17.9,20.6 L12,16.9 L6.1,20.6 L7.8,13.7 L2.5,9.2 L9.4,8.6 Z';
      case 'core:heart':
        return 'M12,21 C2,14 3,6 8,5 C10.5,4.5 12,7 12,8 C12,7 13.5,4.5 16,5 C21,6 22,14 12,21 Z';
      default:
        return 'M12,2 L21,8 L18,20 H6 L3,8 Z';
    }
  }
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  <path d={path(shape)} fill={fill} stroke={stroke} stroke-width="1.6" stroke-linejoin="round" />
</svg>
