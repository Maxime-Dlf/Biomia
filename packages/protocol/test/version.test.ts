import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/index.ts';

describe('§15.5 version de protocole', () => {
  it('est un entier positif', () => {
    expect(Number.isInteger(PROTOCOL_VERSION) && PROTOCOL_VERSION > 0).toBe(true);
  });
});
