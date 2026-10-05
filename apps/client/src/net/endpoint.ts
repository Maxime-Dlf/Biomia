/**
 * Adresse du serveur Colyseus et mémorisation de la session de jeu en ligne.
 *
 * Le jeton de reconnexion d'un invité est gardé dans `sessionStorage` (§11.4) : un F5 rejoint le
 * même siège ; un nouvel onglet démarre une nouvelle session. Repli en mémoire si le stockage est
 * indisponible (navigation privée stricte, iframe).
 */

/**
 * Dans une Activity, tout passe par le proxy Discord (§16.2) : les mappings `/ws` et `/api` sont
 * appelés par `/.proxy/ws` et `/.proxy/api` (le SDK Colyseus garde tel quel un chemin `/.proxy`).
 */
function inDiscord(): boolean {
  return typeof location !== 'undefined' && location.hostname.endsWith('discordsays.com');
}

/** `VITE_SERVER_URL`, sinon le port 2567 en développement, sinon `/ws` (mapping Discord, §16.2). */
export function serverEndpoint(): string {
  if (inDiscord()) return `${location.origin}/.proxy/ws`;
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  if (import.meta.env.DEV) return `${scheme}://${location.hostname}:2567`;
  return `${scheme}://${location.host}/ws`;
}

/** API HTTP du serveur (§16.2, mapping `/api`) : `VITE_API_URL`, sinon déduite de l'adresse. */
export function apiBase(): string {
  if (inDiscord()) return '/.proxy/api';
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured) return configured;
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567/api`;
  return `${location.origin}/api`;
}

export interface SavedSession {
  readonly endpoint: string;
  readonly roomId: string;
  readonly seatToken: string;
  readonly name: string;
}

const KEY = 'crassecadia.session';
let memory: SavedSession | null = null;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  memory = session;
  try {
    storage()?.setItem(KEY, JSON.stringify(session));
  } catch {
    // Stockage plein ou refusé : la session reste en mémoire.
  }
}

export function loadSession(): SavedSession | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SavedSession>;
      if (s.endpoint && s.roomId && s.seatToken && s.name) return s as SavedSession;
    }
  } catch {
    // Valeur illisible : ignorée.
  }
  return memory;
}

export function clearSession(): void {
  memory = null;
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Rien à faire.
  }
}
