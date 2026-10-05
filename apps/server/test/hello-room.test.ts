import { Client } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameServer } from '../src/app.ts';

const PORT = 2600 + Math.floor(Math.random() * 300);
const server = createGameServer();

beforeAll(async () => {
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('phase 0 — hello room', () => {
  it('accepte une connexion, synchronise l’état et répond au ping', async () => {
    const client = new Client(`ws://localhost:${PORT}`);
    const room = await client.joinOrCreate('hello');
    const pong = new Promise<unknown>((resolve) => room.onMessage('pong', resolve));
    room.send('ping', { n: 42 });
    expect(await pong).toEqual({ n: 42 });
    await new Promise((r) => setTimeout(r, 100));
    expect(room.state.message).toBe('Bienvenue dans CrasseCadia');
    expect(room.state.connected).toBe(1);
    await room.leave();
  });
});
