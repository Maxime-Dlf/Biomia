/**
 * Flux du navigateur de salons (§12.3) : liste en temps réel publiée par la `LobbyRoom` du serveur.
 * Les salons privés n'y figurent jamais.
 */
import { Client, type Room } from '@colyseus/sdk';
import { type ListedRoom, LOBBY_ROOM } from '@crassecadia/protocol';
import { serverEndpoint } from './endpoint.ts';

export class RoomBrowserFeed {
  rooms: ListedRoom[] = [];
  private room: Room | null = null;
  private disposed = false;
  private readonly listeners = new Set<(rooms: ListedRoom[]) => void>();

  async connect(endpoint = serverEndpoint()): Promise<void> {
    const room = await new Client(endpoint).joinOrCreate(LOBBY_ROOM);
    if (this.disposed) {
      void room.leave();
      return;
    }
    this.room = room;
    room.onMessage('rooms', (list: ListedRoom[]) => this.set(list));
    room.onMessage('+', ([id, listed]: [string, ListedRoom]) =>
      this.set([...this.rooms.filter((r) => r.roomId !== id), listed]),
    );
    room.onMessage('-', (id: string) => this.set(this.rooms.filter((r) => r.roomId !== id)));
  }

  private set(rooms: ListedRoom[]): void {
    this.rooms = rooms;
    for (const l of this.listeners) l(rooms);
  }

  subscribe(listener: (rooms: ListedRoom[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.rooms);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    void this.room?.leave();
  }
}
