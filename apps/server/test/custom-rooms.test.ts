import { matchMaker } from '@colyseus/core';
import {
  actingSeats,
  activeSeat,
  type GameState,
  randomAction,
  rngFromSeed,
  viewFor,
} from '@crassecadia/engine';
import {
  CLOSE_KICKED,
  filterRooms,
  JoinError,
  type ListedRoom,
  LOBBY_ROOM,
  type RoomSettings,
} from '@crassecadia/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameServer } from '../src/app.ts';
import type { GameRoom } from '../src/rooms/GameRoom.ts';
import { sdkClient, sleep, TestPlayer, waitUntil } from './harness.ts';

const PORT = 4000 + Math.floor(Math.random() * 1000);
const ENDPOINT = `ws://localhost:${PORT}`;
const server = createGameServer({
  timing: {
    botDelayMs: 1,
    graceMs: 50,
    fastMs: 5,
    voteMs: { initial: 60_000, resupply: 60_000 },
    startTileMs: 60_000,
  },
});

beforeAll(async () => {
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const roomOf = (p: TestPlayer) => matchMaker.getLocalRoomById(p.roomId) as unknown as GameRoom;
const serverState = (p: TestPlayer): GameState => roomOf(p).authoritativeState!;
const settingsOf = (p: TestPlayer) => JSON.parse(p.projection().settings) as RoomSettings;

async function lastRejection(p: TestPlayer, before: number): Promise<string> {
  await waitUntil(() => p.rejections.length > before);
  return p.rejections.at(-1)!.reason;
}

/** Joue la partie jusqu'à la fin : chaque humain agit dès qu'il le peut. */
async function playOut(players: TestPlayer[], seed: string, timeoutMs = 60_000): Promise<void> {
  const rng = rngFromSeed(seed);
  const end = Date.now() + timeoutMs;
  while (serverState(players[0]!).phase !== 'ended') {
    if (Date.now() > end) throw new Error('partie trop longue');
    const state = serverState(players[0]!);
    const seat = actingSeats(state).find((s) => players.some((p) => p.seat === s));
    if (!seat) {
      await sleep(5);
      continue;
    }
    const p = players.find((x) => x.seat === seat)!;
    // Les bots agissent pendant l'attente : vue de l'état courant du serveur.
    const now = await p.synced(() => serverState(p));
    if (!actingSeats(now).includes(seat)) continue;
    p.send(randomAction(p.mirror()!, seat, rng)!);
    await waitUntil(() => serverState(p) !== now);
  }
}

describe('§12.3 navigateur de salons', () => {
  it('10 salons simultanés : listés (sauf privés), filtrés, rejoints ; liste en temps réel', async () => {
    const hosts: TestPlayer[] = [];
    const kinds = [
      'public',
      'public',
      'public',
      'public',
      'public',
      'public',
      'protected',
      'protected',
      'private',
      'private',
    ] as const;
    for (const [i, visibility] of kinds.entries()) {
      hosts.push(
        await TestPlayer.join(ENDPOINT, {
          name: `Hôte${i}`,
          create: {
            name: `Salon ${i}${i === 3 ? ' Crassé' : ''}`,
            visibility,
            language: i < 5 ? 'fr' : 'en',
            ...(visibility === 'protected' ? { password: 'sésame' } : {}),
          },
        }),
      );
    }
    // Tier A pour le salon 2 (initiation).
    hosts[2]!.room.send('preset', { preset: 'initiation' });
    await waitUntil(() => settingsOf(hosts[2]!).tierByShape['core:square'] === 'A');

    const browser = await sdkClient(ENDPOINT).joinOrCreate(LOBBY_ROOM);
    let rooms: ListedRoom[] = [];
    browser.onMessage('rooms', (list: ListedRoom[]) => {
      rooms = list;
    });
    browser.onMessage('+', ([id, room]: [string, ListedRoom]) => {
      rooms = [...rooms.filter((r) => r.roomId !== id), room];
    });
    browser.onMessage('-', (id: string) => {
      rooms = rooms.filter((r) => r.roomId !== id);
    });
    const ours = () => rooms.filter((r) => hosts.some((h) => h.roomId === r.roomId));
    await waitUntil(() => ours().length === 8);
    expect(
      ours()
        .map((r) => r.roomId)
        .sort(),
    ).toEqual(
      hosts
        .slice(0, 8)
        .map((h) => h.roomId)
        .sort(),
    );
    const listing = ours().find((r) => r.roomId === hosts[6]!.roomId)!.metadata!;
    expect(listing).toMatchObject({
      protected: true,
      humans: 1,
      maxHumans: 4,
      stage: 'lobby',
      freeSeats: 3,
    });

    // Recherche et filtres (§12.3).
    const search = (q: Parameters<typeof filterRooms>[1]) =>
      filterRooms(ours(), q).map((r) => r.roomId);
    expect(search({ search: 'crasse' })).toEqual([hosts[3]!.roomId]);
    await waitUntil(() => search({ tier: 'A' }).length === 1);
    expect(search({ tier: 'A' })).toEqual([hosts[2]!.roomId]);
    expect(search({ language: 'en' }).sort()).toEqual(
      hosts
        .slice(5, 8)
        .map((h) => h.roomId)
        .sort(),
    );

    // On rejoint chaque salon listé ; les protégés exigent le mot de passe.
    for (const host of hosts.slice(0, 8)) {
      const isProtected = filterRooms(ours(), {}).find((r) => r.roomId === host.roomId)!.metadata!
        .protected;
      if (isProtected) {
        await expect(TestPlayer.join(ENDPOINT, { roomId: host.roomId })).rejects.toMatchObject({
          code: JoinError.wrongPassword,
        });
        await expect(
          TestPlayer.join(ENDPOINT, { roomId: host.roomId, password: 'faux' }),
        ).rejects.toMatchObject({ code: JoinError.wrongPassword });
      }
      const guest = await TestPlayer.join(ENDPOINT, { roomId: host.roomId, password: 'sésame' });
      await waitUntil(() => ours().find((r) => r.roomId === host.roomId)?.metadata?.humans === 2);
      await guest.room.leave();
    }
    // Les privés se rejoignent par code.
    for (const host of hosts.slice(8)) {
      const guest = await TestPlayer.join(ENDPOINT, { roomId: host.roomId });
      expect(guest.seat).toBe('p1');
      await guest.room.leave();
    }
    // Temps réel : un nouveau salon apparaît, un salon fermé disparaît.
    const extra = await TestPlayer.join(ENDPOINT, { create: { name: 'Nouveau' } });
    await waitUntil(() => rooms.some((r) => r.roomId === extra.roomId));
    await roomOf(extra).disconnect();
    await waitUntil(() => !rooms.some((r) => r.roomId === extra.roomId));
    await browser.leave();
    for (const h of hosts) await h.room.leave();
  });

  it('limite les essais de mot de passe (§18.2)', async () => {
    const host = await TestPlayer.join(ENDPOINT, {
      create: { visibility: 'protected', password: 'motdepasse' },
    });
    for (let i = 0; i < 5; i++) {
      await expect(
        TestPlayer.join(ENDPOINT, { roomId: host.roomId, password: `x${i}xx` }),
      ).rejects.toMatchObject({ code: JoinError.wrongPassword });
    }
    await expect(
      TestPlayer.join(ENDPOINT, { roomId: host.roomId, password: 'motdepasse' }),
    ).rejects.toMatchObject({ code: JoinError.tooManyAttempts });
    await host.room.leave();
  });
});

describe('§12.4 paramètres du mode custom', () => {
  it('seul l’hôte configure ; bornes, budget et cohérence vérifiés par le serveur', async () => {
    const host = await TestPlayer.join(ENDPOINT, { name: 'Hôte' });
    const guest = await TestPlayer.join(ENDPOINT, { roomId: host.roomId });
    const current = settingsOf(host);

    let n = guest.rejections.length;
    guest.room.send('settings', { patch: { rounds: 3 } });
    expect(await lastRejection(guest, n)).toBe('not-host');
    n = host.rejections.length;
    host.room.send('settings', { patch: { rounds: 0 } });
    expect(await lastRejection(host, n)).toBe('invalid-message');
    n = host.rejections.length;
    host.room.send('settings', {
      patch: { tierByShape: { ...current.tierByShape, 'core:star': 'Z' } },
    });
    expect(await lastRejection(host, n)).toBe('invalid-settings');
    n = host.rejections.length;
    host.room.send('settings', { patch: { seats: 999, rounds: 999 } });
    expect(await lastRejection(host, n)).toBe('over-budget');
    n = host.rejections.length;
    host.room.send('settings', { patch: { seats: 2, bots: 1 } });
    expect(await lastRejection(host, n)).toBe('too-few-seats');

    // Bots visibles comme sièges ; tiers mélangés par forme (§9.5) ; options libres.
    await host.applySettings({
      seats: 5,
      bots: 2,
      botLevel: 'medium',
      tierByShape: { ...current.tierByShape, 'core:circle': 'C', 'core:star': 'A' },
      marketSize: 6,
      startJokers: 3,
      monoBonus: 2,
      capacityRatio: [2, 1, 1],
      turnTimerSeconds: 120,
    });
    await waitUntil(() => Object.keys(host.projection().seats).length === 4);
    expect(host.projection().seats.b1).toMatchObject({ bot: 'medium', name: 'Bot 2' });
    // Préréglage : les champs du salon (sièges, bots) sont conservés.
    host.room.send('preset', { preset: 'chaos' });
    await waitUntil(() => settingsOf(host).tierByShape['core:square'] === 'C');
    expect(settingsOf(host)).toMatchObject({ seats: 5, bots: 2, marketSize: 4 });
    host.room.send('start', {});
    await waitUntil(() => roomOf(host).authoritativeState !== null);
    expect(serverState(host).config.seats.map((s) => s.id)).toEqual(['p0', 'p1', 'b0', 'b1']);
    await guest.room.leave();
    await host.room.leave();
  });

  it('§11.1 composition libre des équipes : chacun choisit la sienne, l’hôte place tout le monde', async () => {
    const host = await TestPlayer.join(ENDPOINT, {
      settings: { seats: 4, bots: 1, teams: { mode: 'manual', count: 2 } },
    });
    const guest = await TestPlayer.join(ENDPOINT, { roomId: host.roomId });
    const n = guest.rejections.length;
    guest.room.send('team', { seat: 'p0', team: 1 });
    expect(await lastRejection(guest, n)).toBe('not-host');
    guest.room.send('team', { seat: guest.seat, team: 1 });
    host.room.send('team', { seat: 'b0', team: 1 });
    host.room.send('team', { seat: 'p0', team: 0 });
    await waitUntil(
      () => host.projection().seats.b0?.team === 1 && host.projection().seats.p1?.team === 1,
    );
    host.room.send('start', {});
    await waitUntil(() => roomOf(host).authoritativeState !== null);
    expect(serverState(host).config.teams).toEqual([
      { id: 'team-1', name: 'A', seats: ['p0'] },
      { id: 'team-2', name: 'B', seats: ['p1', 'b0'] },
    ]);
    await guest.room.leave();
    await host.room.leave();
  });
});

describe('§12.3 droits de l’hôte', () => {
  it('expulse, verrouille, transfère ; l’hôte qui part est remplacé par le plus ancien présent', async () => {
    const host = await TestPlayer.join(ENDPOINT, { name: 'Hôte' });
    const a = await TestPlayer.join(ENDPOINT, { roomId: host.roomId, name: 'A' });
    const b = await TestPlayer.join(ENDPOINT, { roomId: host.roomId, name: 'B' });
    let leaveCode = 0;
    b.room.onLeave((code: number) => {
      leaveCode = code;
    });
    host.room.send('kick', { seat: b.seat });
    await waitUntil(() => leaveCode !== 0);
    expect(leaveCode).toBe(CLOSE_KICKED);
    await waitUntil(() => host.projection().seats[b.seat] === undefined);
    await expect(
      TestPlayer.join(ENDPOINT, { roomId: host.roomId, seatToken: b.token }),
    ).rejects.toMatchObject({ code: JoinError.invalidSeatToken });

    host.room.send('lock', { locked: true });
    await waitUntil(() => host.projection().locked);
    await expect(TestPlayer.join(ENDPOINT, { roomId: host.roomId })).rejects.toMatchObject({
      code: JoinError.locked,
    });
    host.room.send('lock', { locked: false });
    await waitUntil(() => !host.projection().locked);

    host.room.send('transferHost', { seat: a.seat });
    await waitUntil(() => host.projection().host === a.seat);
    const n = host.rejections.length;
    host.room.send('kick', { seat: a.seat });
    expect(await lastRejection(host, n)).toBe('not-host');
    // L'hôte part : le rôle revient au plus ancien joueur présent.
    const c = await TestPlayer.join(ENDPOINT, { roomId: host.roomId, name: 'C' });
    await a.room.leave();
    await waitUntil(() => host.projection().host === host.seat);
    await c.room.leave();
    await host.room.leave();
  });
});

describe('§12.3 spectateurs et rejoindre en cours', () => {
  it('un spectateur ne voit que l’information publique et ne peut pas jouer', async () => {
    const host = await TestPlayer.join(ENDPOINT, { settings: { seats: 2, bots: 1 } });
    await expect(
      TestPlayer.join(ENDPOINT, { roomId: host.roomId, spectator: true }),
    ).rejects.toMatchObject({ code: JoinError.spectatorsDisabled });
    await host.applySettings({ spectators: true });
    const watcher = await TestPlayer.join(ENDPOINT, { roomId: host.roomId, spectator: true });
    expect(watcher.seat).toBe('');
    await waitUntil(() => host.projection().spectators === 1);
    host.room.send('start', {});
    await waitUntil(() => watcher.projection().stage === 'game');
    const state = serverState(host);
    await expect
      .poll(() => viewFromWatcher(watcher), { timeout: 3000, interval: 5 })
      .toEqual(viewFor(state, 'spectator'));
    expect(watcher.projection().privates ?? {}).toEqual({});
    const seq = watcher.send({ type: 'undo', seat: host.seat });
    expect(await watcher.rejection(seq)).toBe('not-seated');
    await watcher.room.leave();
    await host.room.leave();
  });

  it('rejoindre en cours : on reprend le siège d’un bot ; sinon la partie est fermée', async () => {
    const closed = await TestPlayer.join(ENDPOINT, {
      settings: { seats: 2, bots: 1, objectives: { ...defaults(), enabled: false } },
    });
    closed.room.send('start', {});
    await waitUntil(() => roomOf(closed).authoritativeState !== null);
    await expect(TestPlayer.join(ENDPOINT, { roomId: closed.roomId })).rejects.toMatchObject({
      code: JoinError.gameInProgress,
    });
    await closed.room.leave();

    const host = await TestPlayer.join(ENDPOINT, {
      settings: { seats: 3, bots: 2, joinInProgress: true },
    });
    host.room.send('start', {});
    await waitUntil(() => roomOf(host).authoritativeState !== null);
    const late = await TestPlayer.join(ENDPOINT, { roomId: host.roomId, name: 'Retardataire' });
    expect(late.seat).toBe('b0');
    await waitUntil(() => host.projection().seats.b0?.bot === '');
    expect(host.projection().seats.b0).toMatchObject({ connected: true });
    // Pseudo d'invité `Nom#XXX` (§16.4).
    expect(host.projection().seats.b0!.name).toMatch(/^Retardataire#[A-HJ-NP-Z2-9]{3}$/);
    await playOut([host, late], 'late');
    await host.room.leave();
    await late.room.leave();
  }, 60_000);
});

describe('§21 phase 6 — critère de sortie', () => {
  it('une partie à 50 bots et 2 humains se joue jusqu’au bout', async () => {
    const host = await TestPlayer.join(ENDPOINT, {
      settings: { seats: 52, bots: 50, rounds: 2, turnTimerSeconds: null },
    });
    const guest = await TestPlayer.join(ENDPOINT, { roomId: host.roomId });
    host.room.send('start', {});
    await waitUntil(() => roomOf(host).authoritativeState !== null);
    expect(serverState(host).config.seats).toHaveLength(52);
    await playOut([host, guest], 'big', 120_000);
    const final = serverState(host);
    expect(final.phase).toBe('ended');
    expect(final.tiles.size).toBe(52 * 3 + 52 * 2);
    await waitUntil(() => host.gameOver !== null && guest.gameOver !== null);
    expect(activeSeat(final)).toBeNull();
    await host.room.leave();
    await guest.room.leave();
  }, 150_000);
});

function viewFromWatcher(p: TestPlayer) {
  return p.view();
}

function defaults(): RoomSettings['objectives'] {
  return {
    enabled: true,
    initialHigh: 1,
    initialLow: 2,
    broken: 'return-fixed-penalty',
    brokenPenalty: 2,
  };
}
