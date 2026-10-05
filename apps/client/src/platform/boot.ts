/**
 * Choix de l'adaptateur au démarrage (§16.1). Le SDK Discord n'est chargé que dans une Activity, pour
 * garder un bundle initial léger (§20.2).
 */
import { apiBase } from '../net/endpoint.ts';
import { type DiscordClient, DiscordStartError, startDiscord } from './discord.ts';
import { isDiscordLaunch, type Platform } from './platform.ts';
import { webPlatform } from './web.ts';

/**
 * Mappings du proxy Discord (§16.2) : les adresses du serveur et de l'API sont réécrites vers
 * `/.proxy/ws` et `/.proxy/api`, déclarés dans le portail développeur.
 */
export function discordMappings(server: string, api: string): { prefix: string; target: string }[] {
  const target = (url: string) => {
    const u = new URL(url);
    return `${u.host}${u.pathname.replace(/\/$/, '')}`;
  };
  return [
    { prefix: '/ws', target: target(server) },
    { prefix: '/api', target: target(api) },
  ];
}

export async function bootPlatform(): Promise<Platform> {
  if (!isDiscordLaunch(location.search)) return webPlatform();
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
  if (!clientId) throw new DiscordStartError('ready');
  const { DiscordSDK, patchUrlMappings } = await import('@discord/embedded-app-sdk');
  // Nos propres appels passent déjà par `/.proxy` ; les adresses absolues configurées (et celles de
  // bibliothèques tierces) sont réécrites par le SDK.
  const server = import.meta.env.VITE_SERVER_URL as string | undefined;
  const api = import.meta.env.VITE_API_URL as string | undefined;
  if (server && api) patchUrlMappings(discordMappings(server, api));
  const sdk = new DiscordSDK(clientId);
  return startDiscord({ sdk: sdk as unknown as DiscordClient, clientId, apiBase: apiBase() });
}
