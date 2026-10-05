/**
 * Traductions (§13.5 : FR / EN au lancement) avec i18next. La langue suit les paramètres globaux ;
 * `t()` lit un état réactif pour que l'interface se mette à jour au changement de langue.
 */
import i18next from 'i18next';
import { settings } from '../settings/settings.svelte.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';

void i18next.init({
  lng: settings.language,
  fallbackLng: 'fr',
  resources: { fr: { translation: fr }, en: { translation: en } },
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function t(key: string, options?: Record<string, unknown>): string {
  // Lecture réactive de la langue : les composants se rafraîchissent quand elle change.
  const lng = settings.language;
  return i18next.t(key, { lng, ...options });
}

/** Nom localisé d'un contenu (forme, environnement) défini par un mod. */
export function localized(
  name: Readonly<Record<string, string>> | undefined,
  fallback: string,
): string {
  if (!name) return fallback;
  return name[settings.language] ?? name.fr ?? Object.values(name)[0] ?? fallback;
}
