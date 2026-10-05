/**
 * Schema Colyseus du salon de jeu (§15.5). Sa forme JSON est `ProjectedRoom` (paquet `protocol`) :
 * le client la reçoit par diff et reconstruit sa `PlayerView`.
 */
import { schema } from '@colyseus/schema';

export const TileDefSchema = schema(
  { id: 'string', edges: ['string'], accepted: ['string'] },
  'TileDef',
);
export type TileDefSchema = InstanceType<typeof TileDefSchema>;

/** Pose de tuile du journal en ajout seul. */
export const PlacedTileSchema = schema(
  {
    id: 'string',
    edges: ['string'],
    accepted: ['string'],
    q: 'int32',
    r: 'int32',
    rotation: 'uint8',
    placedBy: 'string',
    seq: 'uint32',
  },
  'PlacedTile',
);
export type PlacedTileSchema = InstanceType<typeof PlacedTileSchema>;

/** Pose de jeton du journal en ajout seul. */
export const PlacedTokenSchema = schema(
  { shape: 'string', q: 'int32', r: 'int32', placedBy: 'string', seq: 'uint32' },
  'PlacedToken',
);
export type PlacedTokenSchema = InstanceType<typeof PlacedTokenSchema>;

export const SlotSchema = schema({ tile: TileDefSchema, token: 'string' }, 'Slot');
export type SlotSchema = InstanceType<typeof SlotSchema>;

export const CampSchema = schema(
  {
    jokers: 'uint32',
    steals: 'uint32',
    invalidations: 'uint32',
    monoBonuses: 'uint32',
    tokensPlaced: 'uint32',
  },
  'Camp',
);
export type CampSchema = InstanceType<typeof CampSchema>;

export const TurnSchema = schema(
  {
    seat: 'string',
    slot: 'int8',
    tilePlaced: 'boolean',
    tileQ: 'int32',
    tileR: 'int32',
    rotation: 'uint8',
    tokenSlot: 'int8',
    tokenPlaced: 'boolean',
    tokenQ: 'int32',
    tokenR: 'int32',
    manualRerollUsed: 'boolean',
    resupplyUsed: 'boolean',
  },
  'Turn',
);
export type TurnSchema = InstanceType<typeof TurnSchema>;

export const GameSchema = schema(
  {
    info: 'string',
    phase: 'string',
    seqCounter: 'uint32',
    turnIndex: 'uint32',
    startIndex: 'uint32',
    deckCount: 'uint32',
    poolCount: 'uint32',
    deadline: 'float64',
    tiles: [PlacedTileSchema],
    tokens: [PlacedTokenSchema],
    market: [SlotSchema],
    camps: { map: CampSchema },
    turn: TurnSchema,
    objectives: 'string',
  },
  'Game',
);
export type GameSchema = InstanceType<typeof GameSchema>;

export const SeatSchema = schema(
  { id: 'string', name: 'string', bot: 'string', connected: 'boolean', team: 'int16' },
  'Seat',
);
export type SeatSchema = InstanceType<typeof SeatSchema>;

/** Partie privée d'un siège : envoyée à lui seul (`StateView`). */
export const PrivateSchema = schema(
  {
    seat: 'string',
    startTile: 'string',
    objectives: 'string',
    vote: 'string',
    lastClientSeq: 'uint32',
  },
  'Private',
);
export type PrivateSchema = InstanceType<typeof PrivateSchema>;

export const RoomStateSchema = schema(
  {
    protocol: 'uint8',
    stage: 'string',
    name: 'string',
    visibility: 'string',
    locked: 'boolean',
    language: 'string',
    spectators: 'uint16',
    host: 'string',
    settings: 'string',
    seats: { map: SeatSchema },
    game: GameSchema,
    privates: { map: PrivateSchema, view: true },
  },
  'RoomState',
);
export type RoomStateSchema = InstanceType<typeof RoomStateSchema>;
