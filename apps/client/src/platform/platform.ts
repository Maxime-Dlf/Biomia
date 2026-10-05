/**
 * Plateformes (§16.1) : un seul build client, deux portes d'entrée. Au démarrage, le client détecte
 * Discord (paramètres `frame_id` et `instance_id`) et charge l'adaptateur `discord`, sinon `web`.
 * L'adaptateur fournit l'identité, l'invitation et l'ouverture de liens.
 */

export type PlatformKind = 'web' | 'discord';

export interface PlatformIdentity {
  /** Pseudo proposé (le serveur ajoute le tag `#XXX`, §16.4). */
  readonly name: string;
  /** Jeton d'accès Discord, vérifié par le serveur. */
  readonly discordToken?: string;
}

export type InviteResult = 'dialog' | 'shared' | 'copied' | 'failed';

export interface Platform {
  readonly kind: PlatformKind;
  /** Identité fournie par la plateforme, `null` pour un invité web qui choisit son pseudo. */
  readonly identity: PlatformIdentity | null;
  /** Salon de l'Activity Discord (§16.3), `null` sur le web. */
  readonly roomId: string | null;
  invite(code: string): Promise<InviteResult>;
  openLink(url: string): void;
}

/** L'application tourne-t-elle dans une Activity Discord ? (§16.1) */
export function isDiscordLaunch(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('frame_id') && params.has('instance_id');
}

/** Lien d'invitation d'un salon (§16.3) : `https://<domaine>/r/<CODE>`. */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/r/${code}`;
}

/** Code de salon d'un lien d'invitation (`/r/CODE` ou `#/r/CODE`), sinon `null`. */
export function codeFromLocation(pathname: string, hash: string): string | null {
  const m =
    /^(?:#)?\/r\/([A-Za-z0-9]{6})\/?$/.exec(hash) ?? /^\/r\/([A-Za-z0-9]{6})\/?$/.exec(pathname);
  return m ? m[1]!.toUpperCase() : null;
}

/** Pseudo conforme au protocole (1 à 16 caractères, sans contrôle ni chevron). */
export function safeName(name: string): string {
  return (
    name
      .replace(/[\p{C}<>#]/gu, '')
      .trim()
      .slice(0, 16) || 'Joueur'
  );
}
