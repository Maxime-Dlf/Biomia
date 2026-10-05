/**
 * API HTTP (§16.2, mapping `/api`) : santé, échange du code OAuth Discord côté serveur, salon d'une
 * Activity Discord (un salon par `instanceId`, §16.3).
 *
 * Toute requête porte l'en-tête `x-crassecadia` (§18.2, CSRF) ; les corps sont validés par Zod ;
 * aucune adresse ni donnée personnelle n'est journalisée (§18.3).
 */
import { matchMaker } from '@colyseus/core';
import {
  API_HEADER,
  DiscordRoomRequestSchema,
  DiscordTokenRequestSchema,
  GAME_ROOM,
  PROTOCOL_VERSION,
} from '@crassecadia/protocol';
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import type { DiscordApi } from '../identity.ts';

export interface ApiOptions {
  /** API Discord, `null` si l'application Discord n'est pas configurée. */
  readonly discord: DiscordApi | null;
}

/** Salons des Activities : `instanceId` → code du salon (en mémoire, durée de vie du salon). */
const instanceRooms = new Map<string, Promise<string>>();

async function roomExists(roomId: string): Promise<boolean> {
  return (await matchMaker.query({ roomId })).length > 0;
}

/** Salon de l'instance : réutilisé tant qu'il existe, sinon créé (préréglage officiel, §12.3). */
export function roomForInstance(instanceId: string): Promise<string> {
  const known = instanceRooms.get(instanceId);
  const next = (async () => {
    if (known) {
      const roomId = await known.catch(() => null);
      if (roomId && (await roomExists(roomId))) return roomId;
    }
    const room = await matchMaker.createRoom(GAME_ROOM, {
      protocol: PROTOCOL_VERSION,
      platform: 'discord',
      name: 'Discord',
      create: { name: 'Discord', visibility: 'private', language: 'fr' },
      discordInstance: instanceId,
    });
    return room.roomId;
  })();
  instanceRooms.set(instanceId, next);
  return next;
}

function requireHeader(req: Request, res: Response, next: NextFunction): void {
  if (req.get(API_HEADER) !== '1') {
    res.status(403).json({ error: 'missing-header' });
    return;
  }
  next();
}

export function mountApi(app: Application, options: ApiOptions): void {
  const api = express.Router();
  api.use(express.json({ limit: '4kb' }));
  api.get('/health', (_req, res) => {
    res.json({ ok: true, protocol: PROTOCOL_VERSION, discord: options.discord !== null });
  });
  api.post('/discord/token', requireHeader, async (req, res) => {
    const parsed = DiscordTokenRequestSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid-body' });
    if (!options.discord) return void res.status(503).json({ error: 'discord-not-configured' });
    try {
      res.json({ access_token: await options.discord.exchangeCode(parsed.data.code) });
    } catch {
      res.status(502).json({ error: 'discord-exchange-failed' });
    }
  });
  api.post('/discord/room', requireHeader, async (req, res) => {
    const parsed = DiscordRoomRequestSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid-body' });
    try {
      res.json({ roomId: await roomForInstance(parsed.data.instanceId) });
    } catch {
      res.status(500).json({ error: 'room-unavailable' });
    }
  });
  app.use('/api', api);
}
