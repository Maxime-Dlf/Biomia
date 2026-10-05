/**
 * Simulation de parties bot contre bot (§20.1) : statistiques de score par tier (phase 2) et taux
 * de réussite par objectif (phase 3), base de l'équilibrage.
 *
 * Usage : pnpm --filter @crassecadia/tools simulate -- --games 200 --seats 4 --rounds 20 --tiers A,B,C,D
 *         [--levels easy,medium] : niveaux des bots (§11.5), attribués aux sièges en tourniquet ;
 *         les places sont permutées d'une partie à l'autre et les taux de victoire sont affichés.
 */
import { parseArgs } from 'node:util';
import { createOfficialGame, customConfig, tierForAll } from '@crassecadia/content';
import {
  actingSeats,
  applyAction,
  type BotLevel,
  botAction,
  evaluate,
  finalRanking,
  type GameState,
  rngFromSeed,
  type SeatConfig,
} from '@crassecadia/engine';

const { values } = parseArgs({
  // pnpm transmet le séparateur `--` tel quel : on l'ignore.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    games: { type: 'string', default: '100' },
    seats: { type: 'string', default: '4' },
    rounds: { type: 'string', default: '20' },
    tiers: { type: 'string', default: 'A,B,C,D' },
    seed: { type: 'string', default: 'sim' },
    levels: { type: 'string', default: 'easy' },
  },
});

const games = Number(values.games);
const seatCount = Number(values.seats);
const rounds = Number(values.rounds);
const tiers = values.tiers.split(',');
const levels = values.levels.split(',') as BotLevel[];
/** Sièges de la partie `g` : les niveaux tournent d'une place à chaque partie (équité de l'ordre). */
const seatsFor = (g: number): SeatConfig[] =>
  Array.from({ length: seatCount }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    bot: levels[(i + g) % levels.length]!,
  }));

function play(state: GameState, seed: string): GameState {
  const rng = rngFromSeed(seed);
  let s = state;
  while (s.phase !== 'ended') {
    const acting = actingSeats(s);
    const seat = acting[rng.int(acting.length)]!;
    const level = s.config.seats.find((x) => x.id === seat)!.bot ?? 'easy';
    const res = applyAction(s, botAction(level, s, seat, rng)!);
    if (!res.ok) throw new Error(`Action refusée : ${res.reason}`);
    s = res.state;
  }
  return s;
}

/** Victoires par niveau : premier seul au classement final (§11.3). */
const wins = new Map<string, { games: number; wins: number }>();

const mean = (xs: readonly number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (x: number) => x.toFixed(1).padStart(6);

const objectiveStats = new Map<string, { held: number; fulfilled: number; broken: number }>();

for (const tier of tiers) {
  const totals: number[] = [];
  const categories = {
    environments: [] as number[],
    endBonuses: [] as number[],
    tokens: [] as number[],
    effects: [] as number[],
    objectives: [] as number[],
    jokers: [] as number[],
  };
  const started = performance.now();
  for (let g = 0; g < games; g++) {
    const config = customConfig(seatsFor(g), { rounds, tierByShape: tierForAll(tier) });
    const final = play(
      createOfficialGame(config, `${values.seed}-${tier}-${g}`),
      `${values.seed}-${tier}-${g}`,
    );
    const report = evaluate(final);
    const winners = finalRanking(final, report)[0]!;
    for (const seat of final.config.seats) {
      const stat = wins.get(seat.bot!) ?? { games: 0, wins: 0 };
      stat.games++;
      if (winners.length === 1 && winners[0] === seat.id) stat.wins++;
      wins.set(seat.bot!, stat);
    }
    for (const camp of Object.values(report.byCamp)) {
      totals.push(camp.total);
      categories.environments.push(camp.environments);
      categories.endBonuses.push(camp.endBonuses);
      categories.tokens.push(Object.values(camp.tokens).reduce((a, b) => a + b, 0));
      categories.effects.push(camp.effects);
      categories.objectives.push(camp.objectives);
      categories.jokers.push(camp.jokers);
    }
    for (const held of Object.values(final.objectives?.byCamp ?? {})) {
      for (const h of held) {
        const stat = objectiveStats.get(h.card.templateId) ?? { held: 0, fulfilled: 0, broken: 0 };
        stat.held++;
        if (h.fulfilled) stat.fulfilled++;
        else if (h.brokenBy !== null) stat.broken++;
        objectiveStats.set(h.card.templateId, stat);
      }
    }
  }
  const seconds = (performance.now() - started) / 1000;
  console.log(
    `Tier ${tier} — ${games} parties, ${seatCount} sièges, ${rounds} manches (${seconds.toFixed(1)} s)\n` +
      `  total ${fmt(mean(totals))} | env ${fmt(mean(categories.environments))} | bonus ${fmt(mean(categories.endBonuses))}` +
      ` | jetons ${fmt(mean(categories.tokens))} | effets ${fmt(mean(categories.effects))}` +
      ` | objectifs ${fmt(mean(categories.objectives))} | jokers ${fmt(mean(categories.jokers))}`,
  );
}

if (levels.length > 1) {
  console.log('\nVictoires par niveau de bot (§11.5) :');
  for (const [level, s] of wins) {
    const rate = ((100 * s.wins) / s.games).toFixed(0).padStart(3);
    console.log(`  ${level.padEnd(8)} ${rate} % de ${s.games} participations`);
  }
}

console.log(`\nTaux de réussite par objectif (bots ${levels.join(', ')}) :`);
for (const [id, s] of [...objectiveStats].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const rate = (100 * s.fulfilled) / s.held;
  console.log(
    `  ${id.padEnd(10)} gardé ${String(s.held).padStart(4)} | rempli ${rate.toFixed(0).padStart(3)} % | brisé ${s.broken}`,
  );
}
