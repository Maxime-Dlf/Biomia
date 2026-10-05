import { createGameServer } from './app.ts';
import { discordApi } from './identity.ts';

const port = Number(process.env.PORT ?? 2567);
const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } = process.env;
const discord =
  DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET
    ? discordApi(DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET)
    : null;
const server = createGameServer({ discord });
await server.listen(port);
console.log(
  `CrasseCadia server listening on ws://localhost:${port} (Discord ${discord ? 'configuré' : 'non configuré'})`,
);
