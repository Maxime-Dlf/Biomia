/**
 * Objectifs secrets (§10) : modèles déclaratifs, langage de conditions (§10.2, format §23.4),
 * cartes instanciées et état de partie.
 */
import type { LocalizedText } from '../core/ruleset.ts';
import type { CampId, SeatId } from '../core/types.ts';
import type { StructureStatus } from '../scoring/types.ts';

export type ObjectiveTier = 'low' | 'high';

/** Filtre de propriétaire relatif au camp qui détient l'objectif. */
export type OwnerFilter = 'self' | 'other' | 'any';

/** Valeur littérale ou référence à un paramètre (`"$F"`, `"$C"`, `"$N"`). */
export type ParamRef<T> = T | `$${string}`;

/** Requêtes génériques sur le `ScoreReport` et le plateau (§10.2). */
export type ObjectiveQuery =
  | {
      readonly environments: {
        readonly owner?: OwnerFilter;
        readonly color?: ParamRef<string>;
        readonly valid?: boolean;
      };
    }
  | {
      readonly structures: {
        readonly owner?: OwnerFilter;
        readonly shape?: ParamRef<string>;
        readonly status?: StructureStatus;
      };
    }
  | {
      readonly tokens: {
        readonly placedBy?: OwnerFilter;
        readonly shape?: ParamRef<string>;
        readonly tileColor?: ParamRef<string>;
        readonly tilePlacedBy?: OwnerFilter;
      };
    }
  | {
      readonly tiles: {
        readonly placedBy?: OwnerFilter;
        readonly capacity?: number;
        readonly border?: boolean;
      };
    }
  | { readonly counter: 'steals' | 'invalidations' | 'monoBonuses' | 'jokers' }
  | { readonly ranking: { readonly category: 'tokens'; readonly shape?: ParamRef<string> } };

/**
 * Mesures disponibles par requête (§10.2) :
 * - environnements : `count`, `maxSize`, `sumSize`, `distinctColors`, `largestColors`, `maxForeignTiles` ;
 * - structures : `count`, `maxSize`, `members`, `distinctShapes`, `maxStructureShapes`, `maxColors` ;
 * - jetons : `count`, `tileColors` ; tuiles : `count` ; compteur : `value` ;
 * - classement : `rank`, `strictFirst` (1 si strictement premier, sinon 0).
 */
export type ObjectiveMeasure =
  | 'count'
  | 'maxSize'
  | 'sumSize'
  | 'distinctColors'
  | 'largestColors'
  | 'maxForeignTiles'
  | 'members'
  | 'distinctShapes'
  | 'maxStructureShapes'
  | 'maxColors'
  | 'tileColors'
  | 'value'
  | 'rank'
  | 'strictFirst';

export type ComparisonOp = '>=' | '<=' | '=' | '>';

export type ObjectiveCondition =
  | { readonly all: readonly ObjectiveCondition[] }
  | { readonly any: readonly ObjectiveCondition[] }
  | { readonly not: ObjectiveCondition }
  | {
      readonly query: ObjectiveQuery;
      readonly measure: ObjectiveMeasure;
      readonly op: ComparisonOp;
      readonly value: ParamRef<number>;
    };

export type ParamSpec =
  | { readonly type: 'shape' }
  | { readonly type: 'color' }
  | {
      readonly type: 'int';
      /**
       * Valeur de base : nombre ou expression sur `S` (seuil), `f` (manches / 20, borné à
       * [0,5 ; 3]), `rounds`, `shapes` et `colors` (nombre de formes et couleurs actives).
       */
      readonly base: number | string;
      readonly min?: number;
    };

/** Contrainte de faisabilité avec les scorers actifs (§10.4). */
export type FeasibilityRequirement =
  | {
      readonly scorerMeta: 'maxSize';
      readonly shape: ParamRef<string>;
      readonly gte: ParamRef<number>;
    }
  /** Un scorer actif peut invalider, et le sabotage est activé (L16, H08). */
  | { readonly canInvalidate: true }
  /** Un scorer actif produit des supports de formes variées (H05). */
  | { readonly supportShapes: true }
  /** Les vols sont activés (L15, H07). */
  | { readonly stealsEnabled: true }
  | { readonly colorsAtLeast: ParamRef<number> }
  | { readonly shapesAtLeast: ParamRef<number> };

export interface ObjectiveTemplate {
  readonly id: string;
  readonly tier: ObjectiveTier;
  readonly name: LocalizedText;
  readonly params: Readonly<Record<string, ParamSpec>>;
  readonly requires?: readonly FeasibilityRequirement[];
  readonly condition: ObjectiveCondition;
  /** Valeur fixe en classique et classé ; en custom, `arrondi(valeur × √f)` borné (§10.4). */
  readonly value: { readonly base: number; readonly min: number; readonly max: number };
  /** Repose sur un compteur permanent : ne peut pas être perdu (§10.1). */
  readonly permanent: boolean;
}

/** Carte d'objectif instanciée (paramètres résolus). */
export interface ObjectiveCard {
  /** Identifiant unique dans la partie. */
  readonly id: string;
  /** Instance (modèle + paramètres), commune aux régénérations du paquet (§10.4). */
  readonly instance: string;
  readonly templateId: string;
  readonly tier: ObjectiveTier;
  readonly params: Readonly<Record<string, string | number>>;
  readonly value: number;
  readonly permanent: boolean;
}

/** Objectif gardé par un camp, avec son historique (§10.6). */
export interface HeldObjective {
  readonly card: ObjectiveCard;
  readonly fulfilled: boolean;
  /** Rempli au moins une fois. */
  readonly everFulfilled: boolean;
  /** Camp responsable de la dernière perte, `null` si jamais perdu ou perdu par sa propre faute. */
  readonly brokenBy: CampId | null;
  /** Comportements `lost-zero` et `to-saboteur` : perdu définitivement. */
  readonly lost: boolean;
  /** Comportement `locked` : rempli une fois, rempli pour toujours. */
  readonly locked: boolean;
}

/** Vote en cours : tirage initial (tous les camps) ou ravitaillement (un camp) (§10.5). */
export interface ObjectiveVote {
  readonly kind: 'initial' | 'resupply';
  readonly draws: Readonly<Record<CampId, readonly ObjectiveCard[]>>;
  /** Votes par siège : identifiant de carte → garder ? */
  readonly votes: Readonly<Record<SeatId, Readonly<Record<string, boolean>>>>;
}

export interface ObjectivesState {
  readonly low: readonly ObjectiveCard[];
  readonly high: readonly ObjectiveCard[];
  readonly discard: readonly ObjectiveCard[];
  readonly byCamp: Readonly<Record<CampId, readonly HeldObjective[]>>;
  readonly vote: ObjectiveVote | null;
  /** Nombre de régénérations de paquets (identifiants uniques). */
  readonly generation: number;
}
