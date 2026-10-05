import { matchMaker } from '@colyseus/core';
import { actingSeats, randomAction, rngFromSeed, viewFor } from '@crassecadia/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameServer } from '../src/app.ts';
import type { GameRoom } from '../src/rooms/GameRoom.ts';
import { sleep, TestPlayer, waitUntil } from './harness.ts';

const PORT = 6000 + Math.floor(Math.random() * 1000);
const ENDPOINT = `ws://localhost:${PORT}`;
const server = createGameServer({ timing: { botDelayMs: 1 } });
beforeAll(async () => {
  await server.listen(PORT);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const roomOf = (p: TestPlayer) => matchMaker.getLocalRoomById(p.roomId) as unknown as GameRoom;
const texts = (p: TestPlayer) => p.chat.map((l) => l.text);

describe('§11.2 chat d’équipe et général', () => {
  it('Entrée : équipe ; Maj + Entrée : général ; spectateurs en lecture ; historique ; fin de partie', async () => {
    const a1 = await TestPlayer.join(ENDPOINT, {
      name: 'A1',
      settings: {
        seats: 3,
        bots: 0,
        rounds: 1,
        turnTimerSeconds: null,
        teams: { mode: 'manual', count: 2 },
        spectators: true,
      },
    });
    const a2 = await TestPlayer.join(ENDPOINT, { roomId: a1.roomId, name: 'A2' });
    const b1 = await TestPlayer.join(ENDPOINT, { roomId: a1.roomId, name: 'B1' });
    const watcher = await TestPlayer.join(ENDPOINT, { roomId: a1.roomId, spectator: true });
    a1.room.send('team', { seat: a1.seat, team: 0 });
    a1.room.send('team', { seat: a2.seat, team: 0 });
    a1.room.send('team', { seat: b1.seat, team: 1 });
    await waitUntil(
      () =>
        a1.projection().seats[b1.seat]?.team === 1 && a1.projection().seats[a2.seat]?.team === 0,
    );

    // En salle d'attente, le chat d'équipe est le chat général.
    a2.room.send('chat', { text: 'salut', scope: 'team' });
    await waitUntil(() => [a1, a2, b1, watcher].every((p) => texts(p).includes('salut')));

    a1.room.send('start', {});
    await waitUntil(() => roomOf(a1).authoritativeState !== null);
    a1.room.send('chat', { text: 'plan secret', scope: 'team' });
    b1.room.send('chat', { text: '  bonne partie  ', scope: 'all' });
    await waitUntil(
      () => texts(a2).includes('plan secret') && texts(watcher).includes('bonne partie'),
    );
    await sleep(100);
    expect(texts(b1)).not.toContain('plan secret');
    expect(texts(watcher)).not.toContain('plan secret');
    expect(a2.chat.find((l) => l.text === 'plan secret')).toMatchObject({
      team: true,
      seat: a1.seat,
    });
    expect(a1.chat.find((l) => l.text === 'bonne partie')).toMatchObject({ team: false });
    expect(a1.chat.find((l) => l.text === 'bonne partie')!.name).toMatch(/^B1#/);

    // Refus : spectateur, longueur, débit.
    let n = watcher.rejections.length;
    watcher.room.send('chat', { text: 'coucou', scope: 'all' });
    await waitUntil(() => watcher.rejections.length > n);
    expect(watcher.rejections.at(-1)!.reason).toBe('not-seated');
    n = b1.rejections.length;
    b1.room.send('chat', { text: 'x'.repeat(301), scope: 'all' });
    await waitUntil(() => b1.rejections.length > n);
    expect(b1.rejections.at(-1)!.reason).toBe('invalid-chat');
    for (let i = 0; i < 5; i++) b1.room.send('chat', { text: `spam ${i}`, scope: 'all' });
    await waitUntil(() => b1.rejections.some((r) => r.reason === 'chat-rate-limited'));
    expect(texts(b1).filter((t) => t.startsWith('spam'))).toHaveLength(4);

    // Historique à la reconnexion : uniquement ce que le camp peut lire.
    b1.drop();
    const back = await TestPlayer.join(ENDPOINT, { roomId: a1.roomId, seatToken: b1.token });
    await waitUntil(() => texts(back).includes('bonne partie'));
    expect(texts(back)).not.toContain('plan secret');

    // Fin de partie : l'historique est détruit (§11.2).
    const players = [a1, a2, back];
    const rng = rngFromSeed('chat');
    while (roomOf(a1).authoritativeState!.phase !== 'ended') {
      const state = roomOf(a1).authoritativeState!;
      const seat = actingSeats(state)[0]!;
      const p = players.find((x) => x.seat === seat)!;
      await expect
        .poll(() => p.view(), { timeout: 3000, interval: 5 })
        .toEqual(viewFor(state, seat));
      p.send(randomAction(p.mirror()!, seat, rng)!);
      await waitUntil(() => roomOf(a1).authoritativeState !== state);
    }
    const late = await TestPlayer.join(ENDPOINT, { roomId: a1.roomId, spectator: true });
    await sleep(150);
    expect(late.chat).toEqual([]);
    for (const p of [a1, a2, back, watcher, late]) await p.room.leave();
  }, 60_000);
});
