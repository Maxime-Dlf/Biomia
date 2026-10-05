/**
 * En CI, le navigateur n'a pas de GPU (rendu logiciel) : les tests fonctionnels tournent avec le
 * profil Ultra Low, purement visuel (§14.3). Les captures de référence imposent leur propre profil.
 */
const SETTINGS_KEY = 'crassecadia.settings.v1';

export const CI_STORAGE = process.env.CI
  ? {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:5199',
          localStorage: [{ name: SETTINGS_KEY, value: JSON.stringify({ profile: 'ultra-low' }) }],
        },
      ],
    }
  : undefined;
