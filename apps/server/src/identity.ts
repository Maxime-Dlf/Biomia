/**
 * Identités (§16.4) : pseudos d'invités `Nom#XXX` (web et Discord, aucune donnée en base) et accès à
 * l'API Discord (échange du code OAuth côté serveur, profil de l'utilisateur, §16.2).
 */
import { createHash, randomBytes } from 'node:crypto';

/** Alphabet des tags : sans 0, O, 1, I, L. */
const TAG_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const toTag = (bytes: Uint8Array) =>
  Array.from(bytes.subarray(0, 3), (b) => TAG_ALPHABET[b % TAG_ALPHABET.length]).join('');

/** Tag aléatoire d'un invité web. */
export function guestTag(): string {
  return toTag(randomBytes(3));
}

/** Tag stable d'un joueur Discord, dérivé de son identifiant (même tag d'une partie à l'autre). */
export function discordTag(discordId: string): string {
  return toTag(createHash('sha256').update(`discord:${discordId}`).digest());
}

/** Pseudo affiché `Nom#XXX` ; le `#` est réservé au tag : un tag saisi à la main est ignoré (§18.1). */
export function displayName(base: string, tag: string): string {
  const name = (base.split('#')[0] ?? '').trim().slice(0, 16) || 'Joueur';
  return `${name}#${tag}`;
}

export interface DiscordUser {
  readonly id: string;
  readonly username: string;
  readonly global_name?: string | null;
}

export interface DiscordApi {
  /** Échange le code OAuth de `authorize` contre un jeton d'accès (§16.2). */
  exchangeCode(code: string): Promise<string>;
  /** Profil de l'utilisateur d'un jeton d'accès. */
  user(accessToken: string): Promise<DiscordUser>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const DISCORD_API = 'https://discord.com/api';

/** API Discord réelle, avec l'identifiant et le secret de l'application. */
export function discordApi(
  clientId: string,
  clientSecret: string,
  fetchImpl: Fetch = fetch,
): DiscordApi {
  return {
    async exchangeCode(code) {
      const res = await fetchImpl(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
        }),
      });
      if (!res.ok) throw new Error(`discord-token-${res.status}`);
      const body = (await res.json()) as { access_token?: unknown };
      if (typeof body.access_token !== 'string') throw new Error('discord-token-invalid');
      return body.access_token;
    },
    async user(accessToken) {
      const res = await fetchImpl(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`discord-user-${res.status}`);
      const body = (await res.json()) as Partial<DiscordUser>;
      if (typeof body.id !== 'string' || typeof body.username !== 'string') {
        throw new Error('discord-user-invalid');
      }
      return { id: body.id, username: body.username, global_name: body.global_name ?? null };
    },
  };
}
