import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  type Action,
  actingSeats,
  activeSeat,
  applyAction,
  autoPlay,
  type BrokenObjectiveBehavior,
  type CampId,
  evaluate,
  evaluateCondition,
  type GameState,
  getLegalActions,
  type HeldObjective,
  instantiateTemplate,
  type ObjectiveCard,
  type ObjectiveTemplate,
  refreshObjectives,
  roundsFactor,
  type SeatConfig,
  SYSTEM_SEAT,
  viewFor,
} from '@crassecadia/engine';
import { describe, expect, it } from 'vitest';
import {
  createOfficialGame,
  customConfig,
  OFFICIAL_OBJECTIVES,
  officialConfig,
  officialRuleSet,
  type ReferenceBoard,
  referenceState,
} from '../src/index.ts';

const seats = (n: number): SeatConfig[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, bot: null }));

const template = (id: string): ObjectiveTemplate => OFFICIAL_OBJECTIVES.find((t) => t.id === id)!;

function apply(state: GameState, action: Action): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`${res.reason} ${JSON.stringify(action)}`);
  return res.state;
}

function generationContext(overrides: Parameters<typeof customConfig>[1] = {}) {
  const config = customConfig(seats(2), overrides);
  const ruleSet = officialRuleSet(config);
  return { config, threshold: 4, scorers: ruleSet.scorers };
}

function card(id: string, params: Record<string, string | number>, value = 5): ObjectiveCard {
  const t = template(id);
  return {
    id: `${id}-test`,
    instance: id,
    templateId: id,
    tier: t.tier,
    params,
    value,
    permanent: t.permanent,
  };
}

const held = (c: ObjectiveCard, patch: Partial<HeldObjective> = {}): HeldObjective => ({
  card: c,
  fulfilled: false,
  everFulfilled: false,
  brokenBy: null,
  lost: false,
  locked: false,
  ...patch,
});

type Tok = [string, number, number, string, number];
function boardWith(
  tokens: Tok[],
  tiles: ReferenceBoard['tiles'] = [],
  extra: Partial<ReferenceBoard['config']> = {},
) {
  return referenceState({
    id: 't',
    rule: 't',
    description: 't',
    config: { camps: ['A', 'B'], threshold: 2, ...extra },
    tiles,
    tokens,
    expected: {},
    validatedBy: null,
    validatedAt: null,
  });
}

/** Évalue une condition du catalogue pour le camp A. */
function holds(
  state: GameState,
  id: string,
  params: Record<string, string | number>,
  camp: CampId = 'A',
): boolean {
  return evaluateCondition(
    { state, report: evaluate(state), camp, params },
    template(id).condition,
  );
}

describe('§10.3 Catalogue officiel', () => {
  it('20 objectifs de faible valeur et 10 de haute valeur', () => {
    expect(OFFICIAL_OBJECTIVES.filter((t) => t.tier === 'low')).toHaveLength(20);
    expect(OFFICIAL_OBJECTIVES.filter((t) => t.tier === 'high')).toHaveLength(10);
  });

  it('les conditions ne citent aucune forme ni couleur en dur (§10.2)', () => {
    const json = JSON.stringify(OFFICIAL_OBJECTIVES.map((t) => t.condition));
    expect(json).not.toMatch(/core:/);
  });
});

describe('§10.4 Génération des paquets', () => {
  it('instanciation avec chaque forme et chaque couleur actives', () => {
    const ctx = generationContext();
    expect(instantiateTemplate(template('core:L01'), ctx, 0)).toHaveLength(5);
    expect(instantiateTemplate(template('core:L04'), ctx, 0)).toHaveLength(5);
    expect(instantiateTemplate(template('core:L02'), ctx, 0)).toHaveLength(1);
  });

  it('faisabilité : pas de H04 sur les Carrés, Ronds et Étoiles du Tier D (taille max < 5)', () => {
    const shapes = instantiateTemplate(template('core:H04'), generationContext(), 0).map(
      (c) => c.params.F,
    );
    expect(shapes.sort()).toEqual(['core:heart', 'core:triangle']);
  });

  it('faisabilité : L16 et H08 écartés si le sabotage est désactivé ; L15 et H07 si les vols le sont', () => {
    const noSabotage = generationContext({ options: { sabotage: false } });
    expect(instantiateTemplate(template('core:L16'), noSabotage, 0)).toEqual([]);
    expect(instantiateTemplate(template('core:H08'), noSabotage, 0)).toEqual([]);
    const noSteals = generationContext({ options: { steals: false } });
    expect(instantiateTemplate(template('core:L15'), noSteals, 0)).toEqual([]);
    expect(instantiateTemplate(template('core:L16'), generationContext(), 0)).toHaveLength(1);
  });

  it('ajustement de N : f = manches / 20 limité à [0,5 ; 3], N = max(minimum, arrondi(N_base))', () => {
    expect([roundsFactor(20), roundsFactor(5), roundsFactor(200)]).toEqual([1, 0.5, 3]);
    const n = (rounds: number, id: string) =>
      instantiateTemplate(template(id), generationContext({ rounds }), 0)[0]!.params.N;
    expect(n(20, 'core:L05')).toBe(4);
    expect(n(10, 'core:L05')).toBe(2);
    expect(n(200, 'core:L05')).toBe(12);
    expect(n(20, 'core:L02')).toBe(5); // S + 1 avec S = 4
    expect(n(20, 'core:H02')).toBe(5); // min(5, couleurs actives)
  });

  it('valeur : fixe en classique et classé ; en custom arrondi(valeur × √f) borné à 3–8 et 8–20', () => {
    const classic = officialConfig('1v1', seats(2));
    const fixed = {
      config: { ...classic, rounds: 80 },
      threshold: 4,
      scorers: officialRuleSet(classic).scorers,
    };
    expect(instantiateTemplate(template('core:L01'), fixed, 0)[0]!.value).toBe(5);
    const custom = generationContext({ rounds: 80 });
    expect(instantiateTemplate(template('core:L01'), custom, 0)[0]!.value).toBe(8);
    expect(instantiateTemplate(template('core:H01'), custom, 0)[0]!.value).toBe(20);
    const short = generationContext({ rounds: 5 });
    expect(instantiateTemplate(template('core:L08'), short, 0)[0]!.value).toBe(3);
  });
});

describe('§10.5 Tirage initial et vote', () => {
  it('chaque camp reçoit 1 haute et 2 faibles, sans deux instances du même modèle', () => {
    const s = createOfficialGame(customConfig(seats(3)), 'deal');
    expect(s.phase).toBe('objectives');
    const draws = s.objectives!.vote!.draws;
    for (const cards of Object.values(draws)) {
      expect(cards.map((c) => c.tier).sort()).toEqual(['high', 'low', 'low']);
      expect(new Set(cards.map((c) => c.templateId)).size).toBe(3);
    }
    expect(actingSeats(s).sort()).toEqual(['p0', 'p1', 'p2']);
  });

  it('votes simultanés ; la phase se termine quand tout le monde a voté, puis pose des tuiles de départ', () => {
    let s = createOfficialGame(customConfig(seats(2)), 'votes');
    for (const seat of ['p0', 'p1']) {
      const cards = s.objectives!.vote!.draws[seat]!;
      s = apply(s, { type: 'voteObjective', seat, cardId: cards[0]!.id, keep: true });
      s = apply(s, { type: 'voteObjective', seat, cardId: cards[1]!.id, keep: false });
      if (seat === 'p0') expect(s.phase).toBe('objectives');
      s = apply(s, { type: 'voteObjective', seat, cardId: cards[2]!.id, keep: true });
    }
    expect(s.phase).toBe('startTiles');
    expect(s.objectives!.byCamp.p0).toHaveLength(2);
    expect(s.objectives!.discard).toHaveLength(2);
  });

  it('il faut garder au moins 1 carte : tout rejeter garde la plus forte valeur', () => {
    let s = createOfficialGame(customConfig(seats(1)), 'reject');
    const cards = s.objectives!.vote!.draws.p0!;
    for (const c of cards)
      s = apply(s, { type: 'voteObjective', seat: 'p0', cardId: c.id, keep: false });
    const kept = s.objectives!.byCamp.p0!;
    expect(kept).toHaveLength(1);
    expect(kept[0]!.card.tier).toBe('high');
  });

  it('timeout sans aucun vote : on garde la haute valeur (siège système)', () => {
    let s = createOfficialGame(customConfig(seats(2)), 'timeout');
    expect(applyAction(s, { type: 'closeObjectiveVote', seat: 'p0' })).toEqual({
      ok: false,
      reason: 'system-only',
    });
    s = apply(s, { type: 'closeObjectiveVote', seat: SYSTEM_SEAT });
    for (const camp of ['p0', 'p1']) {
      expect(s.objectives!.byCamp[camp]!.map((h) => h.card.tier)).toEqual(['high']);
    }
  });

  it('vote en équipe : une voix par carte, égalité → gardée ; tout rejeté → la plus soutenue', () => {
    const config = customConfig(seats(4), {
      teams: [
        { id: 'A', name: 'A', seats: ['p0', 'p1'] },
        { id: 'B', name: 'B', seats: ['p2', 'p3'] },
      ],
    });
    let s = createOfficialGame(config, 'team');
    const a = s.objectives!.vote!.draws.A!;
    const b = s.objectives!.vote!.draws.B!;
    // Équipe A : carte 0 (1 pour, 1 contre → gardée), carte 1 (2 contre), carte 2 (2 pour).
    const votesA: [string, number, boolean][] = [
      ['p0', 0, true],
      ['p1', 0, false],
      ['p0', 1, false],
      ['p1', 1, false],
      ['p0', 2, true],
      ['p1', 2, true],
    ];
    for (const [seat, i, keep] of votesA)
      s = apply(s, { type: 'voteObjective', seat, cardId: a[i]!.id, keep });
    // Équipe B : tout rejeté, sauf une voix « garder » sur la carte 2.
    const votesB: [string, number, boolean][] = [
      ['p2', 0, false],
      ['p3', 0, false],
      ['p2', 1, false],
      ['p3', 1, false],
      ['p2', 2, true],
      ['p3', 2, false],
    ];
    for (const [seat, i, keep] of votesB)
      s = apply(s, { type: 'voteObjective', seat, cardId: b[i]!.id, keep });
    expect(s.objectives!.byCamp.A!.map((h) => h.card.id)).toEqual([a[0]!.id, a[2]!.id]);
    // Carte 2 : 1 pour, 1 contre → égalité → gardée ; les autres rejetées.
    expect(s.objectives!.byCamp.B!.map((h) => h.card.id)).toEqual([b[2]!.id]);
  });

  it('autoPlay vote par défaut : la haute valeur au tirage initial', () => {
    const s = createOfficialGame(customConfig(seats(1)), 'auto');
    const actions = autoPlay(s, 'p0');
    expect(actions.filter((a) => a.type === 'voteObjective' && a.keep)).toHaveLength(1);
  });
});

/** Partie custom 1 joueur, objectifs choisis, tuile de départ posée. */
function playingGame(seed: string, objectives: HeldObjective[] = []): GameState {
  let s = createOfficialGame(customConfig(seats(1)), seed);
  s = apply(s, { type: 'closeObjectiveVote', seat: SYSTEM_SEAT });
  s = apply(s, { type: 'placeStartTile', seat: 'p0', q: 0, r: 0, orientation: 0 });
  return { ...s, objectives: { ...s.objectives!, byCamp: { p0: objectives } } };
}

describe('§10.5 Ravitaillement', () => {
  it('possible quand tous les objectifs gardés sont remplis : 3 cartes de faible valeur, 1 fois par tour', () => {
    let s = playingGame('resupply', [
      held(card('core:L08', { N: 0 }), { fulfilled: true, everFulfilled: true }),
    ]);
    expect(getLegalActions(s, 'p0').some((a) => a.type === 'requestObjectives')).toBe(true);
    s = apply(s, { type: 'requestObjectives', seat: 'p0' });
    const cards = s.objectives!.vote!.draws.p0!;
    expect(cards.map((c) => c.tier)).toEqual(['low', 'low', 'low']);
    // Le tour est suspendu pendant le vote.
    expect(applyAction(s, { type: 'chooseTile', seat: 'p0', slot: 0 })).toEqual({
      ok: false,
      reason: 'objective-vote-pending',
    });
    for (const [i, keep] of [
      [0, false],
      [1, true],
      [2, false],
    ] as const) {
      s = apply(s, { type: 'voteObjective', seat: 'p0', cardId: cards[i]!.id, keep });
    }
    expect(s.objectives!.byCamp.p0!.map((h) => h.card.id)).toContain(cards[1]!.id);
    expect(s.objectives!.byCamp.p0).toHaveLength(2);
    expect(applyAction(s, { type: 'requestObjectives', seat: 'p0' }).ok).toBe(false);
  });

  it('refusé tant qu’un objectif gardé n’est pas rempli', () => {
    const s = playingGame('no-resupply', [held(card('core:L08', { N: 50 }))]);
    expect(applyAction(s, { type: 'requestObjectives', seat: 'p0' })).toEqual({
      ok: false,
      reason: 'objectives-not-all-fulfilled',
    });
  });

  it('timeout du ravitaillement : la première carte est gardée', () => {
    let s = playingGame('resupply-timeout', [
      held(card('core:L08', { N: 0 }), { fulfilled: true }),
    ]);
    s = apply(s, { type: 'requestObjectives', seat: 'p0' });
    const first = s.objectives!.vote!.draws.p0![0]!;
    s = apply(s, { type: 'closeObjectiveVote', seat: SYSTEM_SEAT });
    expect(s.objectives!.byCamp.p0!.map((h) => h.card.id)).toEqual(['core:L08-test', first.id]);
    expect(activeSeat(s)).toBe('p0');
  });
});

describe('§10.6 Objectif brisé par une crasse', () => {
  // A possède une ligne de 2 triangles ; B la prolonge et la vole.
  const before = boardWith([
    ['triangle', 0, 0, 'A', 1],
    ['triangle', 1, 0, 'A', 2],
  ]);
  const after = boardWith([
    ['triangle', 0, 0, 'A', 1],
    ['triangle', 1, 0, 'A', 2],
    ['triangle', 2, 0, 'B', 3],
  ]);
  const objective = card('core:L06', { F: 'core:triangle', N: 2 }, 5);

  function run(behavior: BrokenObjectiveBehavior, actingCamp: CampId) {
    const withBehavior = (s: GameState): GameState => ({
      ...s,
      config: {
        ...s.config,
        options: {
          ...s.config.options,
          objectives: { ...s.config.options.objectives, broken: behavior },
        },
      },
      objectives: {
        low: [],
        high: [],
        discard: [],
        vote: null,
        generation: 0,
        byCamp: { A: [held(objective)], B: [] },
      },
    });
    const s0 = withBehavior(before);
    const step1 = refreshObjectives(s0, s0.objectives!, evaluate(s0), 'A');
    const s1 = { ...withBehavior(after), objectives: step1.objectives };
    const step2 = refreshObjectives(s1, step1.objectives, evaluate(s1), actingCamp);
    const final = evaluate({ ...s1, objectives: step2.objectives, phase: 'ended' });
    return {
      held: step2.objectives.byCamp.A![0]!,
      events: [...step1.events, ...step2.events],
      final,
    };
  }

  it('rempli puis perdu par le tour d’un adversaire : « brisé », −2 en fin de partie (classique)', () => {
    const r = run('return-fixed-penalty', 'B');
    expect(r.held).toMatchObject({ fulfilled: false, everFulfilled: true, brokenBy: 'B' });
    expect(
      r.events.map((e) => e.type === 'ObjectiveStatusChanged' && [e.fulfilled, e.cause]),
    ).toEqual([
      [true, null],
      [false, 'B'],
    ]);
    expect(r.final.byCamp.A!.objectives).toBe(-2);
    expect(r.final.byCamp.B!.objectives).toBe(0);
  });

  it('perdu par sa propre faute : −valeur', () => {
    expect(run('return-fixed-penalty', 'A').final.byCamp.A!.objectives).toBe(-5);
  });

  it('custom « retour-valeur » : −valeur ; « perdu-zéro » : 0 ; « au saboteur » : +valeur pour B', () => {
    expect(run('return-value', 'B').final.byCamp.A!.objectives).toBe(-5);
    const lost = run('lost-zero', 'B');
    expect(lost.held.lost).toBe(true);
    expect(lost.final.byCamp.A!.objectives).toBe(0);
    const saboteur = run('to-saboteur', 'B');
    expect(saboteur.final.byCamp.A!.objectives).toBe(0);
    expect(saboteur.final.byCamp.B!.objectives).toBe(5);
  });

  it('custom « verrouillé » : un objectif rempli le reste', () => {
    const r = run('locked', 'B');
    expect(r.held).toMatchObject({ fulfilled: true, locked: true });
    expect(r.final.byCamp.A!.objectives).toBe(5);
  });

  it('un objectif réparé redevient rempli et rapporte +valeur', () => {
    const repaired = boardWith([
      ['triangle', 0, 0, 'A', 1],
      ['triangle', 1, 0, 'A', 2],
      ['triangle', 2, 0, 'B', 3],
      ['triangle', 3, 0, 'A', 4],
    ]);
    const r = run('return-fixed-penalty', 'B');
    const s = {
      ...repaired,
      objectives: {
        low: [],
        high: [],
        discard: [],
        vote: null,
        generation: 0,
        byCamp: { A: [r.held], B: [] },
      },
    };
    const res = refreshObjectives(s, s.objectives, evaluate(s), 'A');
    expect(res.objectives.byCamp.A![0]).toMatchObject({ fulfilled: true, brokenBy: 'B' });
    expect(
      evaluate({ ...s, objectives: res.objectives, phase: 'ended' }).byCamp.A!.objectives,
    ).toBe(5);
  });
});

describe('§10.2 Langage de conditions : mesures du catalogue', () => {
  const tilesE = (cells: [number, number, string, string, number][]): ReferenceBoard['tiles'] =>
    cells.map(([q, r, env, placedBy, seq]) => ({ q, r, mono: env, placedBy, seq }));

  it('L01 / L17 / H03 : environnements par couleur, plus grand environnement par couleur', () => {
    const s = boardWith(
      [],
      tilesE([
        [0, 0, 'E0', 'A', 1],
        [1, 0, 'E0', 'A', 2],
        [2, 0, 'E0', 'A', 3],
        [0, 3, 'E0', 'B', 4],
        [1, 3, 'E0', 'B', 5],
        [0, 6, 'E1', 'A', 6],
        [1, 6, 'E1', 'A', 7],
      ]),
    );
    expect(holds(s, 'core:L01', { C: 'core:E0', N: 1 })).toBe(true);
    expect(holds(s, 'core:L01', { C: 'core:E0', N: 2 })).toBe(false);
    expect(holds(s, 'core:L17', { C: 'core:E0' })).toBe(true);
    expect(holds(s, 'core:L17', { C: 'core:E0' }, 'B')).toBe(false);
    expect(holds(s, 'core:H03', { N: 2 })).toBe(true);
    expect(holds(s, 'core:H02', { N: 2 })).toBe(true);
    expect(holds(s, 'core:L02', { N: 3 })).toBe(true);
    expect(holds(s, 'core:L02', { N: 4 })).toBe(false);
  });

  it('L14 : environnement contenant des tuiles posées par d’autres camps', () => {
    const s = boardWith(
      [],
      tilesE([
        [0, 0, 'E0', 'B', 1],
        [1, 0, 'E0', 'B', 2],
        [2, 0, 'E0', 'A', 3],
      ]),
    );
    expect(holds(s, 'core:L14', { N: 2 })).toBe(true);
    expect(holds(s, 'core:L14', { N: 3 })).toBe(false);
  });

  it('L12 / L11 / L19 : jetons sur les tuiles d’autres camps, d’une couleur, couvrant N couleurs', () => {
    const s = boardWith(
      [
        ['circle', 0, 0, 'A', 4],
        ['circle', 2, 0, 'A', 5],
        ['circle', 4, 0, 'A', 6],
      ],
      tilesE([
        [0, 0, 'E0', 'B', 1],
        [2, 0, 'E1', 'B', 2],
        [4, 0, 'E1', 'A', 3],
      ]),
    );
    expect(holds(s, 'core:L12', { N: 2 })).toBe(true);
    expect(holds(s, 'core:L12', { N: 3 })).toBe(false);
    expect(holds(s, 'core:L11', { C: 'core:E1', N: 2 })).toBe(true);
    expect(holds(s, 'core:L19', { N: 2 })).toBe(true);
    expect(holds(s, 'core:L19', { N: 3 })).toBe(false);
  });

  it('L04 / L06 / L07 / L20 / H10 : structures valides possédées', () => {
    const s = boardWith(
      [
        ['triangle', 0, 0, 'A', 1],
        ['triangle', 1, 0, 'A', 2],
        ['triangle', 2, 0, 'A', 3],
        ['circle', 0, 3, 'A', 4],
        ['circle', 3, 3, 'A', 5],
      ],
      tilesE([
        [0, 6, 'E0', 'A', 6],
        [1, 6, 'E0', 'A', 7],
        [0, 9, 'E1', 'A', 8],
        [1, 9, 'E1', 'A', 9],
      ]),
    );
    expect(holds(s, 'core:L04', { F: 'core:circle', N: 2 })).toBe(true);
    expect(holds(s, 'core:L06', { F: 'core:triangle', N: 3 })).toBe(true);
    expect(holds(s, 'core:L07', { N: 2 })).toBe(true);
    expect(holds(s, 'core:L07', { N: 3 })).toBe(false);
    expect(holds(s, 'core:L20', { N: 5 })).toBe(true);
    expect(holds(s, 'core:H10', { N: 5 })).toBe(true);
    expect(holds(s, 'core:H10', { N: 6 })).toBe(false);
  });

  it('H05 : structure dont membres et supports couvrent N formes (étoile)', () => {
    const s = boardWith([
      ['star', 0, 0, 'A', 1],
      ['square', 1, 0, 'B', 2],
      ['triangle', -1, 0, 'B', 3],
      ['heart', 0, 1, 'B', 4],
      ['circle', 0, -1, 'B', 5],
    ]);
    expect(holds(s, 'core:H05', { N: 5 })).toBe(true);
  });

  it('L13 : structure reposant sur N couleurs', () => {
    const s = boardWith(
      [
        ['triangle', 0, 0, 'A', 4],
        ['triangle', 1, 0, 'A', 5],
      ],
      [
        { q: 0, r: 0, bi: ['E0', 'E1'], placedBy: 'A', seq: 1 },
        { q: 1, r: 0, mono: 'E2', placedBy: 'A', seq: 2 },
      ],
    );
    expect(holds(s, 'core:L13', { N: 3 })).toBe(true);
    expect(holds(s, 'core:L13', { N: 4 })).toBe(false);
  });

  it('H09 : strictement premier en points de structures d’une forme', () => {
    const s = boardWith([
      ['triangle', 0, 0, 'A', 1],
      ['triangle', 1, 0, 'A', 2],
      ['triangle', 5, 0, 'B', 3],
    ]);
    expect(holds(s, 'core:H09', { F: 'core:triangle' })).toBe(true);
    expect(holds(s, 'core:H09', { F: 'core:triangle' }, 'B')).toBe(false);
    const tie = boardWith([
      ['triangle', 0, 0, 'A', 1],
      ['triangle', 5, 0, 'B', 2],
    ]);
    expect(holds(tie, 'core:H09', { F: 'core:triangle' })).toBe(false);
  });

  it('L10 / L18 : tuiles posées (monochromes, en bordure)', () => {
    const s = boardWith(
      [],
      [
        { q: 0, r: 0, mono: 'E0', accepted: ['circle'], placedBy: 'A', seq: 1 },
        { q: 1, r: 0, mono: 'E1', accepted: ['star'], placedBy: 'A', seq: 2 },
        { q: 2, r: 0, mono: 'E2', accepted: ['star', 'heart'], placedBy: 'B', seq: 3 },
      ],
    );
    expect(holds(s, 'core:L10', { N: 2 })).toBe(true);
    expect(holds(s, 'core:L10', { N: 3 })).toBe(false);
    expect(holds(s, 'core:L18', { N: 2 })).toBe(true);
    expect(holds(s, 'core:L18', { N: 3 })).toBe(false);
  });
});

describe('§10.3 Couverture du catalogue : objectifs restants', () => {
  it('L03 Mosaïque / H01 Empire : couleurs distinctes, taille ≥ S + 5', () => {
    const cells: Exclude<ReferenceBoard['tiles'], undefined>[number][] = [];
    for (let i = 0; i < 7; i++) cells.push({ q: i, r: 0, mono: 'E0', placedBy: 'A', seq: i + 1 });
    cells.push(
      { q: 0, r: 3, mono: 'E1', placedBy: 'A', seq: 8 },
      { q: 1, r: 3, mono: 'E1', placedBy: 'A', seq: 9 },
    );
    cells.push(
      { q: 0, r: 6, mono: 'E2', placedBy: 'A', seq: 10 },
      { q: 1, r: 6, mono: 'E2', placedBy: 'A', seq: 11 },
    );
    const s = boardWith([], cells);
    expect(holds(s, 'core:L03', { N: 3 })).toBe(true);
    expect(holds(s, 'core:L03', { N: 4 })).toBe(false);
    expect(holds(s, 'core:H01', { N: 7 })).toBe(true);
    expect(holds(s, 'core:H01', { N: 8 })).toBe(false);
  });

  it('L05 Semeur / H04 Chef-d’œuvre / H06 Dynastie', () => {
    const tri = Array.from({ length: 5 }, (_, i): Tok => ['triangle', i, 0, 'A', i + 1]);
    const circles = Array.from({ length: 4 }, (_, i): Tok => ['circle', 2 * i, 3, 'A', 10 + i]);
    const s = boardWith([...tri, ...circles]);
    expect(holds(s, 'core:L05', { F: 'core:triangle', N: 5 })).toBe(true);
    expect(holds(s, 'core:L05', { F: 'core:triangle', N: 6 })).toBe(false);
    expect(holds(s, 'core:H04', { F: 'core:triangle', N: 5 })).toBe(true);
    expect(holds(s, 'core:H06', { F: 'core:circle', N: 4 })).toBe(true);
    expect(holds(s, 'core:H06', { F: 'core:circle', N: 5 })).toBe(false);
  });

  it('L08 / L09 / L15 / L16 / H07 / H08 : compteurs (jokers, bonus monochromes, vols, invalidations)', () => {
    const base = boardWith([]);
    const s: GameState = {
      ...base,
      camps: { ...base.camps, A: { ...base.camps.A!, jokers: 3 } },
      counters: {
        ...base.counters,
        A: { steals: 3, invalidations: 1, monoBonuses: 2, tokensPlaced: 0 },
      },
    };
    expect(holds(s, 'core:L08', { N: 3 })).toBe(true);
    expect(holds(s, 'core:L08', { N: 4 })).toBe(false);
    expect(holds(s, 'core:L09', { N: 2 })).toBe(true);
    expect(holds(s, 'core:L15', { N: 1 })).toBe(true);
    expect(holds(s, 'core:H07', { N: 3 })).toBe(true);
    expect(holds(s, 'core:L16', { N: 1 })).toBe(true);
    expect(holds(s, 'core:H08', { N: 3 })).toBe(false);
  });

  it('chaque modèle du catalogue est exercé par au moins un test de ce fichier', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const untested = OFFICIAL_OBJECTIVES.map((t) => t.id).filter(
      (id) => !source.includes(`holds(s, '${id}'`) && !source.includes(`card('${id}'`),
    );
    expect(untested).toEqual([]);
  });
});

describe('§10.1 Secret : visibilité', () => {
  it('chaque camp ne voit que ses objectifs et son tirage ; tout est révélé en fin de partie', () => {
    const s = createOfficialGame(customConfig(seats(2)), 'secret');
    const view = viewFor(s, 'p0');
    expect(view.objectives!.vote!.cards).toEqual(s.objectives!.vote!.draws.p0);
    expect(JSON.stringify(view)).not.toContain(s.objectives!.vote!.draws.p1![0]!.id);
    const chosen = apply(s, { type: 'closeObjectiveVote', seat: SYSTEM_SEAT });
    expect(viewFor(chosen, 'p0').objectives!.byCamp.p1).toBeNull();
    expect(viewFor(chosen, 'p0').objectives!.counts.p1).toBe(1);
    expect(viewFor({ ...chosen, phase: 'ended' }, 'p0').objectives!.byCamp.p1).toHaveLength(1);
  });
});
