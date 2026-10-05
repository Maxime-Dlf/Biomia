/** Adaptateur web (§16.1) : partage natif ou presse-papiers, liens dans un nouvel onglet. */
import { inviteLink, type Platform } from './platform.ts';

export function webPlatform(origin = location.origin): Platform {
  return {
    kind: 'web',
    identity: null,
    roomId: null,
    async invite(code) {
      const url = inviteLink(origin, code);
      try {
        if (navigator.share) {
          await navigator.share({ title: 'CrasseCadia', url });
          return 'shared';
        }
        await navigator.clipboard.writeText(url);
        return 'copied';
      } catch {
        return 'failed';
      }
    },
    openLink(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  };
}
