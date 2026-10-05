/**
 * Adaptateur Discord (§16.2) : `ready`, `authorize` → échange du code côté serveur → `authenticate`,
 * pseudo, salon de l'instance (§16.3), invitation (`openInviteDialog`) et liens externes.
 *
 * Tout le trafic passe par le proxy Discord : `patchUrlMappings` réécrit les adresses du serveur
 * (`/ws`, `/api`) vers les mappings déclarés dans le portail développeur.
 */
import {
  API_HEADER,
  type DiscordRoomResponse,
  type DiscordTokenResponse,
} from '@crassecadia/protocol';
import { type Platform, safeName } from './platform.ts';

/** Partie du SDK `@discord/embedded-app-sdk` utilisée par l'adaptateur. */
export interface DiscordClient {
  readonly instanceId: string;
  ready(): Promise<void>;
  readonly commands: {
    authorize(args: {
      client_id: string;
      response_type: 'code';
      state: string;
      prompt: 'none';
      scope: 'identify'[];
    }): Promise<{ code: string }>;
    authenticate(args: { access_token: string }): Promise<{
      user: { username: string; global_name?: string | null };
    }>;
    openInviteDialog(): Promise<unknown>;
    openExternalLink(args: { url: string }): Promise<unknown>;
  };
}

export interface DiscordStart {
  readonly sdk: DiscordClient;
  readonly clientId: string;
  /** Base de l'API du serveur (mapping `/api`). */
  readonly apiBase: string;
  readonly fetch?: typeof fetch;
}

export class DiscordStartError extends Error {
  constructor(readonly step: 'ready' | 'authorize' | 'token' | 'authenticate' | 'room') {
    super(`discord-${step}`);
    this.name = 'DiscordStartError';
  }
}

async function postJson<T>(f: typeof fetch, url: string, body: unknown): Promise<T> {
  const res = await f(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [API_HEADER]: '1' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return (await res.json()) as T;
}

/** Démarre l'Activity : identité vérifiable par le serveur et salon de l'instance. */
export async function startDiscord(options: DiscordStart): Promise<Platform> {
  const { sdk, clientId, apiBase } = options;
  const f = options.fetch ?? fetch;
  const step = async <T>(name: DiscordStartError['step'], run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch {
      throw new DiscordStartError(name);
    }
  };
  await step('ready', () => sdk.ready());
  const { code } = await step('authorize', () =>
    sdk.commands.authorize({
      client_id: clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    }),
  );
  const { access_token } = await step('token', () =>
    postJson<DiscordTokenResponse>(f, `${apiBase}/discord/token`, { code }),
  );
  const { user } = await step('authenticate', () => sdk.commands.authenticate({ access_token }));
  const { roomId } = await step('room', () =>
    postJson<DiscordRoomResponse>(f, `${apiBase}/discord/room`, { instanceId: sdk.instanceId }),
  );
  return {
    kind: 'discord',
    identity: { name: safeName(user.global_name ?? user.username), discordToken: access_token },
    roomId,
    async invite() {
      try {
        await sdk.commands.openInviteDialog();
        return 'dialog';
      } catch {
        return 'failed';
      }
    },
    openLink(url) {
      void sdk.commands.openExternalLink({ url });
    },
  };
}
