import { defineProject } from 'vitest/config';

/** Tests unitaires des modules du client sans interface (plateformes, réseau). */
export default defineProject({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
