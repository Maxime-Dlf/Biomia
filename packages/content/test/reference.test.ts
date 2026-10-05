import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkReferenceBoard, type ReferenceBoard } from '../src/index.ts';

const DIR = join(import.meta.dirname, 'reference');

/**
 * Plateaux de référence (§20.1) : scores rédigés à la main d'après le document, à faire valider par
 * le responsable des règles (`validatedBy`). Point ouvert O1 (§22.2).
 */
for (const file of readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  const boards = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as ReferenceBoard[];
  describe(`Plateaux de référence — ${file}`, () => {
    it('identifiants uniques', () => {
      expect(new Set(boards.map((b) => b.id)).size).toBe(boards.length);
    });
    for (const board of boards) {
      const status = board.validatedBy ? '' : ' (à valider)';
      it(`${board.rule} ${board.id}${status} — ${board.description}`, () => {
        expect(checkReferenceBoard(board).mismatches).toEqual([]);
      });
    }
  });
}
