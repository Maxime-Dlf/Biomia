/**
 * Mods internes et résolution d'un `RuleSet` (§15.1, §17.3). Le jeu de base est lui-même un
 * ensemble de mods : l'API est ainsi validée par le jeu.
 */
import type {
  EnvDef,
  GameConfig,
  Generators,
  LocalizedText,
  ObjectiveTemplate,
  PlacementValidator,
  RuleSet,
  Scorer,
  ShapeDef,
  ShapeId,
} from '@crassecadia/engine';

/** Fabrique les scorers d'un tier pour une forme donnée (réutilisable par les mods, §9.5). */
export type ScorerFactory = (shape: ShapeId) => Scorer[];

export interface TierDefinition {
  readonly id: string;
  readonly name: LocalizedText;
  /** Scorers par forme ; une forme de mod peut réutiliser la fabrique d'une forme officielle. */
  readonly byShape: Readonly<Record<ShapeId, ScorerFactory>>;
}

export interface InternalMod {
  readonly id: string;
  readonly version: string;
  readonly dependencies?: readonly string[];
  readonly shapes?: readonly ShapeDef[];
  readonly envs?: readonly EnvDef[];
  readonly generators?: Partial<Generators>;
  readonly validators?: readonly PlacementValidator[];
  /** Scorers toujours actifs (environnements, bonus de fin, jokers…). */
  readonly scorers?: readonly Scorer[];
  readonly tiers?: readonly TierDefinition[];
  /** Modèles d'objectifs (§10.4, §17.2 `objectives.json`). */
  readonly objectives?: readonly ObjectiveTemplate[];
}

export class RuleSetError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`RuleSet invalide : ${problems.join(' ; ')}`);
    this.name = 'RuleSetError';
  }
}

/** Ordre de chargement : dépendances d'abord (tri topologique stable, §17.3). */
function loadOrder(mods: readonly InternalMod[]): InternalMod[] {
  const byId = new Map(mods.map((m) => [m.id, m]));
  const out: InternalMod[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: InternalMod) => {
    const st = state.get(m.id);
    if (st === 'done') return;
    if (st === 'visiting') throw new RuleSetError([`dépendance circulaire autour de ${m.id}`]);
    state.set(m.id, 'visiting');
    for (const dep of m.dependencies ?? []) {
      const d = byId.get(dep);
      if (!d) throw new RuleSetError([`${m.id} dépend de ${dep}, absent`]);
      visit(d);
    }
    state.set(m.id, 'done');
    out.push(m);
  };
  mods.forEach(visit);
  return out;
}

/**
 * Résout le `RuleSet` d'une partie (§17.3) : contenus fusionnés par identifiant, scorers inscrits
 * dans leur étape selon le tier de chaque forme active, puis validation finale.
 */
export function resolveRuleSet(config: GameConfig, mods: readonly InternalMod[]): RuleSet {
  const ordered = loadOrder(mods);
  const problems: string[] = [];
  const shapes = new Map<string, ShapeDef>();
  const envs = new Map<string, EnvDef>();
  const tiers = new Map<string, TierDefinition[]>();
  let generators: Partial<Generators> = {};
  const validators: PlacementValidator[] = [];
  const scorers: Scorer[] = [];
  const objectiveTemplates = new Map<string, ObjectiveTemplate>();

  for (const mod of ordered) {
    for (const s of mod.shapes ?? []) {
      if (shapes.has(s.id)) problems.push(`forme redéfinie sans « overrides » : ${s.id}`);
      shapes.set(s.id, s);
    }
    for (const e of mod.envs ?? []) {
      if (envs.has(e.id)) problems.push(`environnement redéfini sans « overrides » : ${e.id}`);
      envs.set(e.id, e);
    }
    generators = { ...generators, ...mod.generators };
    validators.push(...(mod.validators ?? []));
    scorers.push(...(mod.scorers ?? []));
    for (const t of mod.tiers ?? []) tiers.set(t.id, [...(tiers.get(t.id) ?? []), t]);
    for (const o of mod.objectives ?? []) {
      if (objectiveTemplates.has(o.id))
        problems.push(`objectif redéfini sans « overrides » : ${o.id}`);
      objectiveTemplates.set(o.id, o);
    }
  }

  for (const shape of config.activeShapes) {
    if (!shapes.has(shape)) {
      problems.push(`forme active inconnue : ${shape}`);
      continue;
    }
    const tierId = config.tierByShape[shape] ?? 'D';
    const factory = (tiers.get(tierId) ?? [])
      .map((t) => t.byShape[shape])
      .find((f) => f !== undefined);
    if (!factory) problems.push(`la forme ${shape} n'a pas de scorer pour le tier ${tierId}`);
    else scorers.push(...factory(shape));
  }
  for (const env of config.activeEnvs)
    if (!envs.has(env)) problems.push(`environnement actif inconnu : ${env}`);
  if (config.activeShapes.length < 2) problems.push('au moins 2 formes actives');
  if (config.activeEnvs.length < 2) problems.push('au moins 2 environnements actifs');
  if (!generators.tiles) problems.push('aucun générateur de tuiles');
  if (problems.length > 0) throw new RuleSetError(problems);

  return {
    id: ordered.map((m) => `${m.id}@${m.version}`).join('+'),
    shapes: [...shapes.values()],
    envs: [...envs.values()],
    generators: generators as Generators,
    validators,
    scorers,
    objectiveTemplates: [...objectiveTemplates.values()],
  };
}
