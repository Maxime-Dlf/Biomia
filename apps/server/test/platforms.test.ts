import {
  API_HEADER,
  type DiscordRoomResponse,
  JoinError,
  type ListedRoom,
  LOBBY_ROOM,
} from '@crassecadia/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameServer } from '../src/app.ts';
import { type DiscordApi, discordTag, displayName, guestTag } from '../src/identity.ts';
import { sdkClient, TestPlayer, waitUntil } from './harness.ts';

const PORT = 5000 + Math.floor(Math.random() * 1000);
const ENDPOINT = `ws://localhost:${PORT}`;
const HTTP = `http://localhost:${PORT}`;

/** API Discord simulée : un code et deux jetons valides. */
const fakeDiscord: DiscordApi = {
  async exchangeCode(code) {
    if (code !== 'code-ok') throw new Error('bad code');
    return 'token-ana';
  },
  async user(token) {
    if (token === 'token-ana') return { id: '111', username: 'ana', global_name: 'Ana' };
    if (token === 'token-bo') return { id: '222', username: 'bo', global_name: null };
    throw new Error('bad token');
  },
};

const server = createGameServer({ discord: fakeDiscord });
beforeAll(async () => {
  await server.listen(PORT);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const post = (path: string, body: unknown, header = true) =>
  fetch(`${HTTP}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(header ? { [API_HEADER]: '1' } : {}) },
    body: JSON.stringify(body),
  });

describe('§16.4 identités unifiées des invités', () => {
  it('pseudo `Nom#XXX` ; le tag Discord est stable, le `#` du nom est réservé', () => {
    expect(guestTag()).toMatch(/^[A-HJ-NP-Z2-9]{3}$/);
    expect(discordTag('111')).toBe(discordTag('111'));
    expect(discordTag('111')).not.toBe(discordTag('112'));
    expect(displayName('Ana#ZZZ', 'K7P')).toBe('Ana#K7P');
    expect(displayName('  ', 'K7P')).toBe('Joueur#K7P');
  });
});

describe('§16.2 API HTTP', () => {
  it('santé, en-tête obligatoire (CSRF), corps validé', async () => {
    const health = await (await fetch(`${HTTP}/api/health`)).json();
    expect(health).toEqual({ ok: true, protocol: 2, discord: true });
    expect((await post('/discord/token', { code: 'code-ok' }, false)).status).toBe(403);
    expect((await post('/discord/token', { code: '' })).status).toBe(400);
    expect((await post('/discord/token', { code: 'x', extra: 1 })).status).toBe(400);
  });

  it('échange du code OAuth côté serveur (§16.2 authorize → authenticate)', async () => {
    const ok = await post('/discord/token', { code: 'code-ok' });
    expect(await ok.json()).toEqual({ access_token: 'token-ana' });
    expect((await post('/discord/token', { code: 'faux' })).status).toBe(502);
  });
});

describe('§16.3 salons des Activities Discord et codes croisés', () => {
  it('un salon par instanceId, privé, au préréglage officiel ; rejoint depuis Discord et depuis le web', async () => {
    const a = (await (
      await post('/discord/room', { instanceId: 'i-1' })
    ).json()) as DiscordRoomResponse;
    const again = (await (
      await post('/discord/room', { instanceId: 'i-1' })
    ).json()) as DiscordRoomResponse;
    const other = (await (
      await post('/discord/room', { instanceId: 'i-2' })
    ).json()) as DiscordRoomResponse;
    expect(a.roomId).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(again.roomId).toBe(a.roomId);
    expect(other.roomId).not.toBe(a.roomId);
    expect((await post('/discord/room', { instanceId: 'pas valide !' })).status).toBe(400);

    // Membre du vocal : pseudo vérifié par Discord ; le premier arrivé est l'hôte.
    const ana = await TestPlayer.join(ENDPOINT, { roomId: a.roomId, discordToken: 'token-ana' });
    expect(ana.projection().seats[ana.seat]!.name).toBe(`Ana#${discordTag('111')}`);
    expect(ana.projection().host).toBe(ana.seat);
    expect(ana.projection().visibility).toBe('private');
    const settings = JSON.parse(ana.projection().settings);
    expect(settings).toMatchObject({ turnOrder: 'random', spectators: true, joinInProgress: true });
    const bo = await TestPlayer.join(ENDPOINT, { roomId: a.roomId, discordToken: 'token-bo' });
    await waitUntil(() => ana.projection().seats[bo.seat]?.name === `bo#${discordTag('222')}`);
    await expect(
      TestPlayer.join(ENDPOINT, { roomId: a.roomId, discordToken: 'token-faux' }),
    ).rejects.toMatchObject({ code: JoinError.discordAuth });
    // Un joueur web rejoint le salon Discord avec son code (§16.3).
    const web = await TestPlayer.join(ENDPOINT, { roomId: a.roomId, name: 'Web' });
    expect(web.projection().seats[web.seat]!.name).toMatch(/^Web#/);

    // Le salon d'une Activity n'apparaît pas dans le navigateur de salons.
    const browser = await sdkClient(ENDPOINT).joinOrCreate(LOBBY_ROOM);
    let rooms: ListedRoom[] | null = null;
    browser.onMessage('rooms', (list: ListedRoom[]) => {
      rooms = list;
    });
    await waitUntil(() => rooms !== null);
    expect(rooms!.some((r) => r.roomId === a.roomId)).toBe(false);
    await browser.leave();
    for (const p of [ana, bo, web]) await p.room.leave();
  });
});
