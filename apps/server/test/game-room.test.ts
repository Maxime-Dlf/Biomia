import { matchMaker } from '@colyseus/core';
import {
  type Action,
  actingSeats,
  activeSeat,
  evaluate,
  finalRanking,
  type GameState,
  getLegalActions,
  randomAction,
  rngFromSeed,
  viewFor,
} from '@crassecadia/engine';
import { JoinError, type RoomSettings } from '@crassecadia/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameServer } from '../src/app.ts';
import type { GameRoom } from '../src/rooms/GameRoom.ts';
import { defaultSettings } from '../src/rooms/lobby.ts';
import { leakedSecrets, sleep, TestPlayer, waitUntil } from './harness.ts';

const PORT = 3000 + Math.floor(Math.random() * 1000);
const ENDPOINT = `ws://localhost:${PORT}`;
const server = createGameServer({
  timing: {
    botDelayMs: 2,
    graceMs: 400,
    fastMs: 20,
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

interface Shortcut {
  readonly humans?: number;
  readonly bots?: number;
  readonly rounds?: number;
  readonly objectives?: boolean;
  readonly teams?: boolean;
  readonly turnTimerSeconds?: number | null;
}

/** Paramètres du salon (§12.4) à partir d'un raccourci : 2 manches, sans minuteur par défaut. */
const settings = (o: Shortcut): Partial<RoomSettings> => {
  const d = defaultSettings();
  const humans = o.humans ?? 2;
  const bots = o.bots ?? 0;
  return {
    seats: humans + bots,
    bots,
    rounds: o.rounds ?? 2,
    turnTimerSeconds: o.turnTimerSeconds === undefined ? null : o.turnTimerSeconds,
    objectives: { ...d.objectives, enabled: o.objectives ?? true },
    teams: o.teams ? { mode: 'random', count: 2 } : d.teams,
  };
};

function roomOf(player: TestPlayer): GameRoom {
  return matchMaker.getLocalRoomById(player.roomId) as unknown as GameRoom;
}

function serverState(player: TestPlayer): GameState {
  return roomOf(player).authoritativeState!;
}

/** Crée un salon et y fait entrer `n` joueurs ; le premier est l'hôte. */
async function lobby(n: number, s: Partial<RoomSettings>): Promise<TestPlayer[]> {
  const host = await TestPlayer.join(ENDPOINT, { name: 'Hôte', settings: s });
  const players = [host];
  for (let i = 1; i < n; i++) {
    players.push(await TestPlayer.join(ENDPOINT, { name: `J${i}`, roomId: host.roomId }));
  }
  return players;
}

async function start(players: TestPlayer[]): Promise<void> {
  players[0]!.room.send('start', {});
  await waitUntil(() => players.every((p) => p.view() !== null));
}

/** Attend que chaque client ait reçu exactement sa vue de l'état du serveur. */
async function synced(players: TestPlayer[]): Promise<void> {
  const state = serverState(players[0]!);
  for (const p of players) {
    await expect
      .poll(() => p.view(), { timeout: 3000, interval: 5 })
      .toEqual(viewFor(state, p.seat));
  }
}

/** Informations cachées à l'instant présent pour le camp `camp` (§18.2). */
function secretsFor(state: GameState, camp: string): string[] {
  // La graine est révélée par le replay en fin de partie (§15.4).
  const out = state.phase === 'ended' ? [state.rngState] : [state.seed, state.rngState];
  for (const t of state.deck.slice(state.deckPos)) out.push(t.id);
  if (state.phase !== 'ended' && state.objectives) {
    for (const [c, held] of Object.entries(state.objectives.byCamp)) {
      if (c !== camp) for (const h of held) out.push(h.card.id);
    }
    for (const [c, cards] of Object.entries(state.objectives.vote?.draws ?? {})) {
      if (c !== camp) for (const card of cards) out.push(card.id);
    }
    for (const card of [...state.objectives.low, ...state.objectives.high]) out.push(card.id);
  }
  return out;
}

describe('§15.5 GameRoom — partie complète en ligne', () => {
  it('4 clients jouent une partie complète ; chaque vue est exacte et sans information cachée', async () => {
    const players = await lobby(4, settings({ humans: 4, objectives: true }));
    await start(players);
    const rng = rngFromSeed('integration');
    const bySeat = new Map(players.map((p) => [p.seat, p]));
    for (let guard = 0; guard < 1000; guard++) {
      await synced(players);
      const state = serverState(players[0]!);
      for (const p of players) {
        const camp = state.seatCamp[p.seat]!;
        expect(leakedSecrets(p.frames(), secretsFor(state, camp))).toEqual([]);
      }
      if (state.phase === 'ended') break;
      // Le siège qui doit agir choisit son coup à partir de son état reconstruit.
      const seat = actingSeats(state)[0]!;
      const player = bySeat.get(seat)!;
      const mirror = player.mirror()!;
      expect(getLegalActions(mirror, seat).length).toBeGreaterThan(0);
      player.send(randomAction(mirror, seat, rng)!);
      await waitUntil(() => serverState(player) !== state);
    }
    const final = serverState(players[0]!);
    expect(final.phase).toBe('ended');
    await waitUntil(() => players.every((p) => p.gameOver !== null));
    const report = evaluate(final);
    for (const p of players) {
      expect(p.gameOver!.report).toEqual(report);
      expect(p.gameOver!.ranking).toEqual(finalRanking(final, report));
      expect(p.report).toEqual(report);
      expect(p.rejections).toEqual([]);
      // Objectifs révélés à tous en fin de partie (§10.1).
      expect(p.view()!.objectives!.byCamp).toEqual(viewFor(final, 'spectator').objectives!.byCamp);
    }
    // Replay : le moteur déterministe rejoue la partie à l'identique (§15.4).
    const { replayGame } = await import('@crassecadia/engine');
    const { officialRuleSet } = await import('@crassecadia/content');
    const replay = players[0]!.gameOver!.replay;
    expect(replayGame(officialRuleSet(replay.config), replay).state.tiles).toEqual(final.tiles);
    for (const p of players) await p.room.leave();
  });

  it('diffuse le ScoreReport officiel et filtre les événements privés d’objectifs', async () => {
    const players = await lobby(2, settings({ humans: 2, bots: 1, rounds: 1 }));
    await start(players);
    const rng = rngFromSeed('events');
    for (let guard = 0; guard < 500 && serverState(players[0]!).phase !== 'ended'; guard++) {
      const state = serverState(players[0]!);
      const seat = actingSeats(state).find((s) => !s.startsWith('b'));
      if (!seat) {
        await sleep(5);
        continue;
      }
      const p = players.find((x) => x.seat === seat)!;
      // Le bot vote en même temps : on attend la vue de l'état courant, pas de l'état capturé.
      const now = await p.synced(() => serverState(p));
      if (!actingSeats(now).includes(seat)) continue;
      p.send(randomAction(p.mirror()!, seat, rng)!);
      await waitUntil(() => serverState(p) !== now);
    }
    await waitUntil(() => players.every((p) => p.gameOver !== null));
    const final = serverState(players[0]!);
    for (const p of players) {
      expect(p.report).toEqual(evaluate(final));
      const camp = final.seatCamp[p.seat];
      const foreign = p.events.filter(
        (e) => e.type === 'ObjectiveStatusChanged' && e.camp !== camp,
      );
      expect(foreign).toEqual([]);
    }
    for (const p of players) await p.room.leave();
  });
});

describe('§18.2 coups refusés', () => {
  it('refuse les messages invalides, les rejeux, les tours périmés et les sièges d’autrui', async () => {
    const [a, b] = await lobby(2, settings({ humans: 2, objectives: false }));
    // Seul l'hôte lance la partie.
    b!.room.send('start', {});
    await waitUntil(() => b!.rejections.length > 0);
    expect(b!.rejections[0]!.reason).toBe('not-host');
    await start([a!, b!]);
    const state = serverState(a!);
    const first = activeSeat(state)!;
    const [actor, other] = a!.seat === first ? [a!, b!] : [b!, a!];
    const legal = getLegalActions(actor.mirror()!, first)[0]!;

    a!.room.send('action', { clientSeq: 99, turnIndex: 0, action: { type: 'undo' } });
    expect(await a!.rejection(99)).toBe('invalid-message');
    a!.room.send('action', {
      clientSeq: 98,
      turnIndex: 0,
      action: { type: 'closeObjectiveVote', seat: '@system' },
    });
    expect(await a!.rejection(98)).toBe('invalid-message');

    let seq = other.send({ ...legal, seat: first } as Action);
    expect(await other.rejection(seq)).toBe('not-your-seat');
    seq = other.send({ ...legal, seat: other.seat } as Action);
    expect(await other.rejection(seq)).toBe('not-your-turn');
    seq = actor.send(legal, 5);
    expect(await actor.rejection(seq)).toBe('stale-turn');
    // Rejeu d'un numéro de séquence déjà traité.
    actor.room.send('action', { clientSeq: seq, turnIndex: 0, action: legal });
    await waitUntil(() => actor.rejections.filter((r) => r.clientSeq === seq).length === 2);
    expect(actor.rejections.at(-1)!.reason).toBe('replayed');
    // Le coup légal passe.
    actor.send(legal);
    await waitUntil(() => serverState(actor).startIndex === 1);
    // Le dernier clientSeq traité est renvoyé dans la vue privée (réconciliation).
    await waitUntil(
      () => actor.projection().privates?.[actor.seat]?.lastClientSeq === actor.clientSeq,
    );
    expect(Object.keys(actor.projection().privates ?? {})).toEqual([actor.seat]);
    await a!.room.leave();
    await b!.room.leave();
  });

  it('refuse une version de protocole incompatible, et un salon plein ou déjà lancé', async () => {
    await expect(TestPlayer.join(ENDPOINT, { protocol: 999 })).rejects.toMatchObject({
      code: JoinError.protocolMismatch,
    });
    const [a] = await lobby(1, settings({ humans: 1, bots: 1 }));
    await expect(TestPlayer.join(ENDPOINT, { roomId: a!.roomId })).rejects.toMatchObject({
      code: JoinError.full,
    });
    await start([a!]);
    await expect(
      TestPlayer.join(ENDPOINT, { roomId: a!.roomId, seatToken: 'x'.repeat(43) }),
    ).rejects.toMatchObject({ code: JoinError.invalidSeatToken });
    expect(a!.roomId).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await a!.room.leave();
  });
});

describe('§11.4 déconnexion et reconnexion', () => {
  it('un F5 ne fait pas perdre la partie : le jeton de siège rend le siège et sa vue privée', async () => {
    const [a, b] = await lobby(2, settings({ humans: 2, objectives: true }));
    await start([a!, b!]);
    await synced([a!, b!]);
    const before = a!.view()!;
    a!.drop();
    await waitUntil(() => b!.projection().seats[a!.seat]!.connected === false);
    const back = await TestPlayer.join(ENDPOINT, { roomId: a!.roomId, seatToken: a!.token });
    expect(back.seat).toBe(a!.seat);
    expect(back.clientSeq).toBe(a!.clientSeq);
    await synced([back, b!]);
    expect(back.view()!.objectives!.vote!.cards).toEqual(before.objectives!.vote!.cards);
    await waitUntil(() => b!.projection().seats[a!.seat]!.connected === true);
    // Une seconde connexion avec le même jeton remplace la première.
    const again = await TestPlayer.join(ENDPOINT, { roomId: a!.roomId, seatToken: a!.token });
    await waitUntil(() => back.room.connection.isOpen === false);
    expect(again.seat).toBe(a!.seat);
    await again.room.leave();
    await b!.room.leave();
  });

  it('le bot Facile joue pour un déconnecté après 30 s (3 tours), puis 5 s', async () => {
    const [a, b] = await lobby(2, settings({ humans: 2, objectives: false, rounds: 6 }));
    await start([a!, b!]);
    b!.drop();
    const rng = rngFromSeed('absent');
    /** Durée de chaque tour (ou pose de départ) joué par le bot pour le déconnecté. */
    const absent: { phase: string; ms: number }[] = [];
    for (let guard = 0; guard < 2000; guard++) {
      const state = serverState(a!);
      if (state.phase === 'ended') break;
      const seat = activeSeat(state);
      if (seat === a!.seat) {
        await expect
          .poll(() => a!.view(), { timeout: 3000, interval: 5 })
          .toEqual(viewFor(state, seat));
        a!.send(randomAction(a!.mirror()!, seat, rng)!);
        await waitUntil(() => serverState(a!) !== state);
      } else {
        const began = Date.now();
        await waitUntil(
          () => activeSeat(serverState(a!)) !== seat || serverState(a!).phase === 'ended',
          3000,
        );
        absent.push({ phase: state.phase, ms: Date.now() - began });
      }
    }
    expect(serverState(a!).phase).toBe('ended');
    const starts = absent.filter((x) => x.phase === 'startTiles');
    const turns = absent.filter((x) => x.phase === 'playing');
    expect(starts).toHaveLength(1);
    expect(turns).toHaveLength(6);
    // Délai de grâce pour la pose de départ et les 3 premiers tours, puis délai court (§11.4).
    for (const x of [...starts, ...turns.slice(0, 3)]) expect(x.ms).toBeGreaterThanOrEqual(350);
    for (const x of turns.slice(3)) expect(x.ms).toBeLessThan(300);
    await a!.room.leave();
  });

  it('en équipe, un coéquipier connecté joue le tour du déconnecté ; le bot n’intervient pas', async () => {
    const players = await lobby(4, settings({ humans: 4, objectives: false, teams: true }));
    await start(players);
    const rng = rngFromSeed('relay');
    // Tuiles de départ et premiers tours jusqu'au tour d'un siège dont on coupe la connexion.
    let target: TestPlayer | null = null;
    for (let guard = 0; guard < 500 && !target; guard++) {
      await synced(players);
      const state = serverState(players[0]!);
      const seat = activeSeat(state)!;
      const p = players.find((x) => x.seat === seat)!;
      if (state.phase === 'playing') target = p;
      else {
        p.send(randomAction(p.mirror()!, seat, rng)!);
        await waitUntil(() => serverState(p) !== state);
      }
    }
    const state = serverState(players[0]!);
    const camp = state.seatCamp[target!.seat];
    const mate = players.find((p) => p !== target && state.seatCamp[p.seat] === camp)!;
    const foe = players.find((p) => state.seatCamp[p.seat] !== camp)!;
    target!.drop();
    await waitUntil(() => mate.projection().seats[target!.seat]!.connected === false);
    await sleep(600); // plus que le délai de grâce : le bot ne joue pas
    expect(serverState(mate).turn).toEqual(state.turn);
    const action = getLegalActions(mate.mirror()!, target!.seat)[0]!;
    const seq = foe.send(action);
    expect(await foe.rejection(seq)).toBe('not-your-seat');
    mate.send(action);
    await waitUntil(() => serverState(mate) !== state);
    expect(mate.rejections).toEqual([]);
    for (const p of players) if (p !== target) await p.room.leave();
  });
});

describe('§6.10 minuteur et jeu automatique', () => {
  it('à l’expiration, votes par défaut, pose de départ et tours joués par autoPlay', async () => {
    const a = await TestPlayer.join(ENDPOINT, {
      settings: settings({ humans: 1, bots: 1, objectives: true, turnTimerSeconds: 45 }),
    });
    const room = roomOf(a);
    room.timing = {
      ...room.timing,
      voteMs: { initial: 60, resupply: 60 },
      startTileMs: 60,
      turnMsOverride: 40,
    };
    a.room.send('start', {});
    await waitUntil(() => roomOf(a).authoritativeState?.phase === 'ended', 15_000);
    const final = serverState(a);
    // Timeout du tirage initial : la haute valeur est gardée (§10.5).
    expect(final.objectives!.byCamp[a.seat]!.length).toBeGreaterThanOrEqual(1);
    // autoPlay ne dépense jamais de joker (§6.10).
    expect(a.events.some((e) => e.type === 'JokerSpent' && e.camp === a.seat)).toBe(false);
    await waitUntil(() => a.gameOver !== null);
    await a.room.leave();
  });
});
