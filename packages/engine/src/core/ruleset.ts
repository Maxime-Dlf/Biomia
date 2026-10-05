/**
 * `RuleSet` : composition résolue des mods actifs pour une partie (§15.4, §17.3).
 * Le moteur ne connaît aucune forme, couleur ni barème en dur : tout vient d'ici.
 */
import type { ObjectiveTemplate } from '../objectives/types.ts';
import type { Scorer } from '../scoring/types.ts';
import type { Rng } from './rng.ts';
import type { EnvId, GameState, SeatId, ShapeId, TileDef } from './types.ts';

export type LocalizedText = Readonly<Record<string, string>>;

export interface ShapeDef {
  readonly id: ShapeId;
  readonly name: LocalizedText;
}

export interface EnvDef {
  readonly id: EnvId;
  readonly name: LocalizedText;
}

export interface TileGenerationInput {
  /** Nombre de tuiles à produire par capacité (index 0 = capacité 1). */
  readonly countsByCapacity: readonly number[];
  readonly shapes: readonly ShapeId[];
  readonly envs: readonly EnvId[];
  /** Préfixe des identifiants de tuiles. */
  readonly idPrefix: string;
}

export interface Generators {
  /**
   * Produit les tuiles demandées, regroupées par capacité (index 0 = capacité 1), avec couleurs et
   * formes équilibrées (§4.4, étapes 2 et 3). Le mélange final de la pioche est fait par le moteur.
   */
  readonly tiles: (input: TileGenerationInput, rng: Rng) => TileDef[][];
}

/** Placement proposé, soumis aux validateurs de mods (§17.5 `validators`). */
export type PlacementProposal =
  | {
      readonly kind: 'tile';
      readonly seat: SeatId;
      readonly q: number;
      readonly r: number;
      readonly tile: TileDef;
    }
  | {
      readonly kind: 'token';
      readonly seat: SeatId;
      readonly q: number;
      readonly r: number;
      readonly shape: ShapeId;
    };

export interface PlacementValidator {
  readonly id: string;
  /** Retourne un motif de refus, ou `null` si la pose est permise. */
  readonly validate: (state: GameState, proposal: PlacementProposal) => string | null;
}

export interface RuleSet {
  readonly id: string;
  readonly shapes: readonly ShapeDef[];
  readonly envs: readonly EnvDef[];
  readonly generators: Generators;
  readonly validators: readonly PlacementValidator[];
  /** Scorers inscrits dans les étapes du pipeline (§7.4), déjà filtrés pour la partie. */
  readonly scorers: readonly Scorer[];
  /** Modèles d'objectifs secrets actifs (§10.3, §10.4). */
  readonly objectiveTemplates: readonly ObjectiveTemplate[];
}
