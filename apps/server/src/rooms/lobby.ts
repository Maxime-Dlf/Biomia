/**
 * Briques de la salle d'attente (§12.3, §12.4) : mot de passe d'un salon protégé, composition des
 * équipes au lancement (§11.1), valeurs par défaut et préréglages.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { customConfig, PRESETS } from '@crassecadia/content';
import type { SeatId, TeamConfig } from '@crassecadia/engine';
import { type RoomSettings, settingsFromConfig } from '@crassecadia/protocol';

/** Champs propres au salon, conservés quand on applique un préréglage. */
export const DEFAULT_ROOM_FIELDS: Pick<
  RoomSettings,
  'seats' | 'bots' | 'botLevel' | 'teams' | 'spectators' | 'joinInProgress'
> = {
  seats: 4,
  bots: 0,
  botLevel: 'easy',
  teams: { mode: 'none', count: 2 },
  spectators: false,
  joinInProgress: false,
};

/** Paramètres par défaut d'un salon : valeurs par défaut du mode custom (§12.4). */
export function defaultSettings(): RoomSettings {
  return settingsFromConfig(customConfig([]), DEFAULT_ROOM_FIELDS);
}

/** Paramètres d'un préréglage (§12.4), en gardant les champs propres au salon. */
export function presetSettings(presetId: string, current: RoomSettings): RoomSettings | null {
  const preset = PRESETS.find((p) => p.id === presetId);
  return preset ? settingsFromConfig(preset.apply([]), current) : null;
}

/** Nom d'une équipe : A, B, … Z, puis 27, 28, … */
export function teamName(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

export const teamId = (index: number) => `team-${index + 1}`;

/**
 * Équipes du lancement (§11.1). Composition libre : chaque siège dans l'équipe choisie, les équipes
 * vides sont retirées. Répartition aléatoire : sièges mélangés puis distribués en tourniquet, donc
 * des effectifs égaux à une unité près (50/50 avec deux équipes).
 */
export function startTeams(
  settings: RoomSettings,
  seats: readonly { readonly id: SeatId; readonly team: number }[],
  shuffle: <T>(items: readonly T[]) => T[],
): TeamConfig[] | null {
  const { mode } = settings.teams;
  if (mode === 'none') return null;
  const count = Math.min(settings.teams.count, seats.length);
  const groups: SeatId[][] = Array.from({ length: count }, () => []);
  if (mode === 'manual') {
    for (const s of seats) groups[Math.min(Math.max(s.team, 0), count - 1)]!.push(s.id);
  } else {
    for (const [i, id] of shuffle(seats.map((s) => s.id)).entries()) groups[i % count]!.push(id);
  }
  return groups.flatMap((g, i) =>
    g.length === 0 ? [] : [{ id: teamId(i), name: teamName(i), seats: g }],
  );
}

/** Mélange de Fisher-Yates avec l'aléa du système (hors moteur : composition du salon). */
export function cryptoShuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE() % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Essais de mot de passe permis par adresse et par minute (§18.1, §18.2). */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

/**
 * Mot de passe d'un salon protégé : haché (scrypt, sel aléatoire), comparé en temps constant,
 * essais limités par adresse en mémoire uniquement (§18.3).
 */
export class PasswordGuard {
  private readonly salt = randomBytes(16);
  private readonly hash: Buffer | null;
  private readonly attempts = new Map<string, { count: number; until: number }>();

  constructor(password: string | undefined) {
    this.hash = password === undefined ? null : this.digest(password);
  }

  get required(): boolean {
    return this.hash !== null;
  }

  private digest(password: string): Buffer {
    return scryptSync(password.normalize('NFC'), this.salt, 32);
  }

  check(password: string | undefined, address: string): 'ok' | 'wrong' | 'too-many' {
    if (this.hash === null) return 'ok';
    const now = Date.now();
    const entry = this.attempts.get(address);
    if (entry && entry.until > now && entry.count >= MAX_ATTEMPTS) return 'too-many';
    if (password !== undefined && timingSafeEqual(this.digest(password), this.hash)) return 'ok';
    const fresh = !entry || entry.until <= now;
    this.attempts.set(address, {
      count: fresh ? 1 : entry.count + 1,
      until: fresh ? now + WINDOW_MS : entry.until,
    });
    return 'wrong';
  }
}
