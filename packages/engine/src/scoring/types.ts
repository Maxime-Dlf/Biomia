/**
 * Types du pipeline de scoring (§7.4). Chaque scorer, officiel ou de mod, s'inscrit dans une étape.
 */
import type { CellKey } from '../core/hex.ts';
import type { CampId, EnvId, GameState, PlacedTile, PlacedToken, ShapeId } from '../core/types.ts';

/** Étapes fixes du pipeline, dans l'ordre d'exécution (§7.4). */
export const STAGES = [
  'pre-effects',
  'structures',
  'post-effects',
  'environments',
  'end-bonuses',
  'objectives',
  'jokers',
] as const;
export type Stage = (typeof STAGES)[number];

/** Étapes évaluées uniquement sur l'état final (§7.4). */
export const FINAL_ONLY_STAGES: ReadonlySet<Stage> = new Set([
  'end-bonuses',
  'objectives',
  'jokers',
]);

export type StructureStatus =
  | 'valid'
  | 'pending'
  | 'invalidated'
  | 'blocked'
  | 'absorbed'
  | 'neutralized';

/** Structure reconnue par un scorer (§7.4, §23.1). */
export interface StructureResult {
  /** Identifiant stable dans un rapport : `<scorer>:<clé du membre le plus ancien>`. */
  readonly id: string;
  readonly kind: string;
  readonly scorer: string;
  readonly shape?: ShapeId;
  readonly env?: EnvId;
  /** Cellules des jetons (ou tuiles pour un environnement) membres. */
  readonly members: readonly CellKey[];
  /** Cellules qui comptent sans être membres (rôles illimités, §7.3). */
  readonly supports?: readonly CellKey[];
  readonly owner: CampId | null;
  readonly points: number;
  readonly status: StructureStatus;
  /** `seq` du dernier agrandissement : plus petit = plus ancien (§7.2). */
  readonly seniority: number;
  /** Données propres au scorer (ex. axe d'une ligne), sérialisables. */
  readonly data?: Readonly<Record<string, number | string | boolean>>;
}

/** Catégories du rapport par camp (§7.4, §23.1). */
export type AwardCategory = 'effects' | 'endBonuses' | 'objectives' | 'jokers';

/** Points attribués directement à un camp, hors points propres d'une structure. */
export interface Award {
  readonly camp: CampId;
  readonly points: number;
  readonly category: AwardCategory;
  /** Structure ou environnement à l'origine de l'attribution. */
  readonly source?: string;
  readonly reason: string;
}

/** Jeton retiré du scoring à l'étape 1 (§9.0, §9.4). */
export interface Exclusion {
  readonly cell: CellKey;
  readonly status: 'blocked' | 'absorbed';
  /** Identifiant de la structure responsable. */
  readonly by: string;
}

/** Modification des points d'une structure existante (siphon, parasites, §9.4). */
export interface Adjustment {
  readonly structureId: string;
  readonly delta: number;
  readonly reason: string;
}

export interface ScorerOutput {
  readonly structures?: readonly StructureResult[];
  readonly exclusions?: readonly Exclusion[];
  readonly adjustments?: readonly Adjustment[];
  readonly awards?: readonly Award[];
  /** Identifiants d'environnements neutralisés (exclus des bonus de fin, §9.4.1). */
  readonly neutralize?: readonly string[];
}

/** Métadonnées déclarées par un scorer, utilisées par les objectifs (§9.0, §10.4). */
export interface ScorerMeta {
  /** Taille minimale d'une structure valide (en jetons). */
  readonly minSize: number;
  /** Taille maximale d'une structure valide, `null` = illimitée. */
  readonly maxSize: number | null;
  /** Le scorer peut-il invalider, bloquer ou absorber des jetons ? */
  readonly canInvalidate: boolean;
  readonly sizeUnit: 'tokens' | 'tiles';
  /** Les structures peuvent avoir des supports de formes variées (objectif H05, §10.3). */
  readonly supportShapes?: boolean;
}

/** Jeton vu par le scoring : jeton posé enrichi de sa clé et du camp de son poseur. */
export interface ScoredToken extends PlacedToken {
  readonly key: CellKey;
  readonly camp: CampId;
}

/** Tuile vue par le scoring : tuile posée enrichie de sa clé et du camp de son poseur. */
export interface ScoredTile extends PlacedTile {
  readonly key: CellKey;
  readonly camp: CampId;
  /** Arêtes après rotation (§3). */
  readonly edges: readonly EnvId[];
}

/** Environnement : composante connexe de demi-tuiles de même couleur, ≥ 2 tuiles (§8.1). */
export interface EnvironmentInfo {
  readonly id: string;
  readonly env: EnvId;
  /** Cellules des tuiles de l'environnement (taille = nombre de tuiles). */
  readonly tiles: readonly CellKey[];
  readonly size: number;
  readonly owner: CampId;
  /** `seq` maximal de ses tuiles (§7.2). */
  readonly seniority: number;
  readonly valid: boolean;
}

/** Accès en lecture seule au plateau pour les scorers (§17.5). */
export interface ScoringContext {
  readonly state: GameState;
  /** `true` pour le décompte de fin de partie (étapes 5 à 7). */
  readonly final: boolean;
  readonly threshold: number;
  readonly tiles: ReadonlyMap<CellKey, ScoredTile>;
  /** Jetons actifs : à partir de l'étape 2, les jetons bloqués ou absorbés en sont retirés. */
  readonly tokens: ReadonlyMap<CellKey, ScoredToken>;
  /** Tous les jetons physiquement présents. */
  readonly allTokens: ReadonlyMap<CellKey, ScoredToken>;
  readonly environments: readonly EnvironmentInfo[];
  /** Structures produites par les étapes précédentes (points à jour). */
  readonly structures: readonly StructureResult[];
  readonly neutralizedEnvs: ReadonlySet<string>;
  readonly exclusions: ReadonlyMap<CellKey, Exclusion>;
  campOf(seat: string): CampId;
  /** Jetons actifs d'une forme, triés par `seq` croissant. */
  tokensOf(shape: ShapeId): readonly ScoredToken[];
  /** Composantes connexes (adjacence) des jetons actifs d'une forme. */
  components(shape: ShapeId): readonly (readonly ScoredToken[])[];
  /** Tuile en bordure extérieure (§3). */
  isBorder(cell: CellKey): boolean;
  /** Tuile en `(q, r)` (accès rapide par grille). */
  tileAt(q: number, r: number): ScoredTile | undefined;
  /** Jeton actif en `(q, r)` (accès rapide par grille). */
  tokenAt(q: number, r: number): ScoredToken | undefined;
  /**
   * Propriétaire d'une structure de jetons : camp du poseur du membre le plus récent (§7.1), ou
   * propriétaire de création si les vols sont désactivés (§7.5). `group` identifie la famille de
   * structures (en général l'identifiant du scorer) pour le suivi d'une évaluation à l'autre.
   */
  ownerOf(members: readonly CellKey[], group: string): CampId | null;
  /** Comme `ownerOf`, à partir des jetons eux-mêmes (évite la résolution des clés). */
  ownerOfTokens(members: readonly ScoredToken[], group: string): CampId | null;
}

export interface Scorer {
  readonly id: string;
  readonly stage: Stage;
  /** Forme scorée (étapes 1 à 3). */
  readonly shape?: ShapeId;
  readonly meta: ScorerMeta;
  /** Ordre à l'intérieur d'une étape (croissant). */
  readonly priority: number;
  readonly run: (ctx: ScoringContext) => ScorerOutput;
}

/** Sous-totaux d'un camp (§7.4, §23.1). */
export interface CampScore {
  readonly total: number;
  readonly environments: number;
  readonly endBonuses: number;
  readonly tokens: Readonly<Record<ShapeId, number>>;
  readonly effects: number;
  readonly objectives: number;
  readonly jokers: number;
}

export interface ScoreReport {
  readonly final: boolean;
  readonly byCamp: Readonly<Record<CampId, CampScore>>;
  readonly structures: readonly StructureResult[];
  readonly awards: readonly Award[];
  readonly environments: readonly EnvironmentInfo[];
  readonly neutralizedEnvs: readonly string[];
  readonly exclusions: readonly Exclusion[];
}
