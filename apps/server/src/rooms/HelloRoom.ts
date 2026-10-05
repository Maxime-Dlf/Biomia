import { type Client, Room } from '@colyseus/core';
import { schema } from '@colyseus/schema';

/** Salon de démonstration de la phase 0 : vérifie la chaîne client ↔ serveur (§21, phase 0). */
export const HelloState = schema(
  {
    message: 'string',
    connected: 'uint16',
  },
  'HelloState',
);
export type HelloState = InstanceType<typeof HelloState>;

export class HelloRoom extends Room<{ state: HelloState }> {
  override maxClients = 8;

  override onCreate(): void {
    this.setState(new HelloState({ message: 'Bienvenue dans CrasseCadia', connected: 0 }));
    this.onMessage('ping', (client: Client, payload: unknown) => {
      client.send('pong', payload);
    });
  }

  override onJoin(): void {
    this.state.connected += 1;
  }

  override onLeave(): void {
    this.state.connected -= 1;
  }
}
