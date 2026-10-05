import { describe, expect, it, vi } from 'vitest';
import { discordMappings } from '../src/platform/boot.ts';
import { type DiscordClient, DiscordStartError, startDiscord } from '../src/platform/discord.ts';
import {
  codeFromLocation,
  inviteLink,
  isDiscordLaunch,
  safeName,
} from '../src/platform/platform.ts';

describe('§16.1 détection de la plateforme', () => {
  it('Discord fournit frame_id et instance_id', () => {
    expect(isDiscordLaunch('?frame_id=1&instance_id=2&platform=desktop')).toBe(true);
    expect(isDiscordLaunch('?instance_id=2')).toBe(false);
    expect(isDiscordLaunch('')).toBe(false);
  });
});

describe('§16.3 liens d’invitation', () => {
  it('https://<domaine>/r/<CODE>, lu aussi sous la forme #/r/<CODE>', () => {
    expect(inviteLink('https://crassecadia.io/', 'K7P2QX')).toBe('https://crassecadia.io/r/K7P2QX');
    expect(codeFromLocation('/r/k7p2qx', '')).toBe('K7P2QX');
    expect(codeFromLocation('/', '#/r/K7P2QX')).toBe('K7P2QX');
    expect(codeFromLocation('/', '')).toBeNull();
    expect(codeFromLocation('/r/TROPLONG', '')).toBeNull();
  });

  it('pseudo conforme au protocole', () => {
    expect(safeName('  Ana<script>  ')).toBe('Anascript');
    expect(safeName('Nom#123')).toBe('Nom123');
    expect(safeName('\u0000')).toBe('Joueur');
    expect(safeName('x'.repeat(40))).toHaveLength(16);
  });
});

describe('§16.2 proxy Discord', () => {
  it('mappings /ws et /api vers les adresses du serveur', () => {
    expect(discordMappings('wss://crassecadia.io/ws', 'https://crassecadia.io/api')).toEqual([
      { prefix: '/ws', target: 'crassecadia.io/ws' },
      { prefix: '/api', target: 'crassecadia.io/api' },
    ]);
  });
});

/** SDK Discord simulé. */
function fakeSdk(overrides: Partial<DiscordClient['commands']> = {}): DiscordClient {
  return {
    instanceId: 'inst-1',
    ready: vi.fn(async () => {}),
    commands: {
      authorize: vi.fn(async () => ({ code: 'code-1' })),
      authenticate: vi.fn(async () => ({ user: { username: 'ana', global_name: 'Ana <3' } })),
      openInviteDialog: vi.fn(async () => null),
      openExternalLink: vi.fn(async () => null),
      ...overrides,
    },
  };
}

function fakeFetch(status = 200) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    const body = JSON.parse(String(init?.body));
    const json = path.endsWith('/discord/token')
      ? { access_token: `token-for-${body.code}` }
      : { roomId: `ROOM-${body.instanceId}` };
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('§16.2 adaptateur Discord', () => {
  it('ready → authorize → échange côté serveur → authenticate → salon de l’instance', async () => {
    const sdk = fakeSdk();
    const f = fakeFetch();
    const platform = await startDiscord({
      sdk,
      clientId: 'app',
      apiBase: 'https://x/api',
      fetch: f,
    });
    expect(sdk.ready).toHaveBeenCalled();
    expect(sdk.commands.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'app', scope: ['identify'], response_type: 'code' }),
    );
    expect(sdk.commands.authenticate).toHaveBeenCalledWith({ access_token: 'token-for-code-1' });
    const calls = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls.map(([url]) => url)).toEqual([
      'https://x/api/discord/token',
      'https://x/api/discord/room',
    ]);
    // En-tête anti-CSRF obligatoire (§18.2).
    expect((calls[0]![1].headers as Record<string, string>)['x-crassecadia']).toBe('1');
    expect(platform).toMatchObject({
      kind: 'discord',
      roomId: 'ROOM-inst-1',
      identity: { name: 'Ana 3', discordToken: 'token-for-code-1' },
    });
    expect(await platform.invite('ABCDEF')).toBe('dialog');
    platform.openLink('https://example.org');
    expect(sdk.commands.openExternalLink).toHaveBeenCalledWith({ url: 'https://example.org' });
  });

  it('signale l’étape qui échoue', async () => {
    const refused = fakeSdk({ authorize: vi.fn(async () => Promise.reject(new Error('no'))) });
    await expect(
      startDiscord({ sdk: refused, clientId: 'app', apiBase: '/api', fetch: fakeFetch() }),
    ).rejects.toMatchObject({ step: 'authorize' });
    await expect(
      startDiscord({ sdk: fakeSdk(), clientId: 'app', apiBase: '/api', fetch: fakeFetch(503) }),
    ).rejects.toBeInstanceOf(DiscordStartError);
  });
});
