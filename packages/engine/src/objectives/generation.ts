/**
 * Génération des paquets d'objectifs (§10.4) : instanciation des modèles avec les formes et couleurs
 * actives, faisabilité selon les métadonnées des scorers, ajustement de `N` et de la valeur.
 */
import type { Rng } from '../core/rng.ts';
import type { GameConfig } from '../core/types.ts';
import type { Scorer } from '../scoring/types.ts';
import { evaluateExpression, roundHalfUp } from './expr.ts';
import type {
  FeasibilityRequirement,
  ObjectiveCard,
  ObjectiveTemplate,
  ParamRef,
} from './types.ts';

export interface ObjectiveGenerationContext {
  readonly config: GameConfig;
  readonly threshold: number;
  readonly scorers: readonly Scorer[];
}

/** `f = manches / 20`, limité à [0,5 ; 3] (§10.3, §10.4). */
export function roundsFactor(rounds: number): number {
  return Math.min(3, Math.max(0.5, rounds / 20));
}

function cartesian(
  entries: readonly (readonly [string, readonly string[]])[],
): Record<string, string>[] {
  let out: Record<string, string>[] = [{}];
  for (const [name, values] of entries) {
    out = out.flatMap((combo) => values.map((v) => ({ ...combo, [name]: v })));
  }
  return out;
}

function resolveRef<T>(ref: ParamRef<T>, params: Readonly<Record<string, string | number>>): T {
  if (typeof ref === 'string' && ref.startsWith('$')) return params[ref.slice(1)] as T;
  return ref as T;
}

function feasible(
  req: FeasibilityRequirement,
  params: Readonly<Record<string, string | number>>,
  ctx: ObjectiveGenerationContext,
): boolean {
  const active = ctx.scorers;
  if ('canInvalidate' in req)
    return ctx.config.options.sabotage && active.some((s) => s.meta.canInvalidate);
  if ('supportShapes' in req) return active.some((s) => s.meta.supportShapes === true);
  if ('stealsEnabled' in req) return ctx.config.options.steals;
  if ('colorsAtLeast' in req)
    return ctx.config.activeEnvs.length >= resolveRef(req.colorsAtLeast, params);
  if ('shapesAtLeast' in req)
    return ctx.config.activeShapes.length >= resolveRef(req.shapesAtLeast, params);
  const shape = resolveRef(req.shape, params);
  const n = resolveRef(req.gte, params);
  const sizes = active
    .filter((s) => s.shape === shape && (s.stage === 'structures' || s.stage === 'pre-effects'))
    .map((s) => s.meta.maxSize);
  if (sizes.length === 0) return false;
  return sizes.some((m) => m === null || m >= n);
}

/**
 * Instancie un modèle pour toutes les valeurs actives de ses paramètres `{F}` et `{C}` ; écarte les
 * instances impossibles avec les scorers actifs.
 */
export function instantiateTemplate(
  template: ObjectiveTemplate,
  ctx: ObjectiveGenerationContext,
  generation: number,
): ObjectiveCard[] {
  const { config } = ctx;
  const f = roundsFactor(config.rounds);
  const vars = {
    S: ctx.threshold,
    f,
    rounds: config.rounds,
    shapes: config.activeShapes.length,
    colors: config.activeEnvs.length,
  };
  const choice: [string, readonly string[]][] = [];
  const ints: Record<string, number> = {};
  for (const [name, spec] of Object.entries(template.params)) {
    if (spec.type === 'shape') choice.push([name, config.activeShapes]);
    else if (spec.type === 'color') choice.push([name, config.activeEnvs]);
    else {
      const base = typeof spec.base === 'number' ? spec.base : evaluateExpression(spec.base, vars);
      ints[name] = Math.max(spec.min ?? 1, roundHalfUp(base));
    }
  }
  const fixedValue = config.mode === 'classic' || config.mode === 'ranked';
  const value = fixedValue
    ? template.value.base
    : Math.min(
        template.value.max,
        Math.max(template.value.min, roundHalfUp(template.value.base * Math.sqrt(f))),
      );
  const out: ObjectiveCard[] = [];
  for (const combo of cartesian(choice)) {
    const params = { ...combo, ...ints };
    if (!(template.requires ?? []).every((r) => feasible(r, params, ctx))) continue;
    const suffix = Object.entries(combo)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    const instance = suffix ? `${template.id}[${suffix}]` : template.id;
    out.push({
      id: `${instance}#${generation}`,
      instance,
      templateId: template.id,
      tier: template.tier,
      params,
      value,
      permanent: template.permanent,
    });
  }
  return out;
}

/**
 * Paquets faible et haute valeur, mélangés (§10.4). `exclude` retire les instances actuellement
 * détenues (régénération d'un paquet vide).
 */
export function generateObjectiveDecks(
  templates: readonly ObjectiveTemplate[],
  ctx: ObjectiveGenerationContext,
  rng: Rng,
  generation: number,
  exclude: ReadonlySet<string> = new Set(),
): { low: ObjectiveCard[]; high: ObjectiveCard[] } {
  const all = templates
    .flatMap((t) => instantiateTemplate(t, ctx, generation))
    .filter((c) => !exclude.has(c.instance));
  return {
    low: rng.shuffle(all.filter((c) => c.tier === 'low')),
    high: rng.shuffle(all.filter((c) => c.tier === 'high')),
  };
}

/**
 * Tire `count` cartes du dessus du paquet, sans deux instances du même modèle dans un même tirage
 * (§10.4) : une carte en double est sautée et reste dans le paquet, à sa place.
 */
export function drawDistinct(
  deck: readonly ObjectiveCard[],
  count: number,
  takenTemplates: ReadonlySet<string> = new Set(),
): { drawn: ObjectiveCard[]; rest: ObjectiveCard[] } {
  const templates = new Set(takenTemplates);
  const drawn: ObjectiveCard[] = [];
  const rest: ObjectiveCard[] = [];
  for (const card of deck) {
    if (drawn.length < count && !templates.has(card.templateId)) {
      drawn.push(card);
      templates.add(card.templateId);
    } else {
      rest.push(card);
    }
  }
  return { drawn, rest };
}
