import type { GameEvent } from '@crassecadia/engine';
import { describe, expect, it } from 'vitest';
import {
  ActionMessageSchema,
  eventsForCamp,
  JoinOptionsSchema,
  PlayerNameSchema,
} from '../src/index.ts';

const ok = (v: unknown) => ActionMessageSchema.safeParse(v).success;

describe('§15.5 validation Zod des messages du client', () => {
  it('accepte chaque type d’action du §23.1', () => {
    const actions = [
      { type: 'placeStartTile', seat: 'p0', q: 0, r: 0, orientation: 5 },
      { type: 'reroll', seat: 'p0' },
      { type: 'chooseTile', seat: 'p0', slot: 3 },
      { type: 'placeTile', seat: 'p0', q: -2, r: 1, rotation: 0 },
      { type: 'chooseToken', seat: 'p0', slot: null },
      { type: 'chooseToken', seat: 'p0', slot: 1 },
      { type: 'placeToken', seat: 'p0', q: 1, r: 1 },
      { type: 'undo', seat: 'p0' },
      { type: 'confirm', seat: 'p0' },
      { type: 'requestObjectives', seat: 'p0' },
      { type: 'voteObjective', seat: 'p0', cardId: 'core:L01|F=x#0', keep: false },
    ];
    for (const action of actions) expect(ok({ clientSeq: 1, turnIndex: 0, action })).toBe(true);
  });

  it('refuse les actions réservées au serveur, les champs inconnus et les valeurs hors bornes', () => {
    const base = { clientSeq: 1, turnIndex: 0 };
    expect(ok({ ...base, action: { type: 'closeObjectiveVote', seat: '@system' } })).toBe(false);
    expect(ok({ ...base, action: { type: 'undo', seat: 'p0', extra: 1 } })).toBe(false);
    expect(ok({ ...base, extra: 1, action: { type: 'undo', seat: 'p0' } })).toBe(false);
    expect(
      ok({ ...base, action: { type: 'placeTile', seat: 'p0', q: 0.5, r: 0, rotation: 0 } }),
    ).toBe(false);
    expect(
      ok({ ...base, action: { type: 'placeTile', seat: 'p0', q: 0, r: 0, rotation: 6 } }),
    ).toBe(false);
    expect(ok({ clientSeq: 0, turnIndex: 0, action: { type: 'undo', seat: 'p0' } })).toBe(false);
    expect(ok({ ...base, action: { type: 'undo' } })).toBe(false);
    expect(ok('undo')).toBe(false);
    expect(ok(null)).toBe(false);
  });

  it('§18.2 pollution de prototype : `__proto__` est refusé', () => {
    const raw = JSON.parse(
      '{"clientSeq":1,"turnIndex":0,"action":{"type":"undo","seat":"p0","__proto__":{"x":1}}}',
    );
    expect(ok(raw)).toBe(false);
  });

  it('§18.2 pseudos : longueur bornée, ni caractère de contrôle ni chevron', () => {
    expect(PlayerNameSchema.parse('  Ana  ')).toBe('Ana');
    for (const bad of ['', '   ', 'x'.repeat(17), '<b>', 'a\u0000b', 'a\nb']) {
      expect(PlayerNameSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('options de connexion : version, plateforme, pseudo, jeton de 32 octets', () => {
    const hello = { protocol: 2, platform: 'web', name: 'Ana' };
    expect(JoinOptionsSchema.safeParse(hello).success).toBe(true);
    expect(JoinOptionsSchema.safeParse({ ...hello, seatToken: 'A'.repeat(43) }).success).toBe(true);
    expect(JoinOptionsSchema.safeParse({ ...hello, seatToken: 'short' }).success).toBe(false);
    expect(JoinOptionsSchema.safeParse({ ...hello, platform: 'other' }).success).toBe(false);
    const create = { name: 'Salon', visibility: 'protected', language: 'fr' };
    expect(JoinOptionsSchema.safeParse({ ...hello, create }).success).toBe(false);
    expect(
      JoinOptionsSchema.safeParse({ ...hello, create: { ...create, password: 'secret' } }).success,
    ).toBe(true);
  });
});

describe('§15.4 événements privés', () => {
  const events: GameEvent[] = [
    { type: 'TurnEnded', seat: 'p0', turnIndex: 0 },
    { type: 'ObjectiveStatusChanged', camp: 'A', cardId: 'c', fulfilled: true, cause: null },
  ];
  it('`ObjectiveStatusChanged` n’est envoyé qu’à son camp, sauf en fin de partie', () => {
    expect(eventsForCamp(events, 'A', false)).toHaveLength(2);
    expect(eventsForCamp(events, 'B', false)).toEqual([events[0]]);
    expect(eventsForCamp(events, null, false)).toEqual([events[0]]);
    expect(eventsForCamp(events, 'B', true)).toHaveLength(2);
  });
});
