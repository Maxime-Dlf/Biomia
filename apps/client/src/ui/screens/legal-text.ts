/**
 * Mentions légales et politique de confidentialité (§13.1, §18.3). Elles décrivent le
 * fonctionnement actuel du jeu ; les champs entre crochets sont à compléter par l'éditeur avant
 * toute publication (§22.3).
 */

export interface LegalSection {
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export const LEGAL: Readonly<Record<'fr' | 'en', readonly LegalSection[]>> = {
  fr: [
    {
      title: 'Mentions légales',
      paragraphs: [
        'Éditeur : [À COMPLÉTER : nom ou raison sociale, adresse, contact].',
        'Directeur de la publication : [À COMPLÉTER].',
        'Hébergement : [À COMPLÉTER : hébergeur du serveur et du site, adresse].',
        'CrasseCadia est un nom de travail ; le nom définitif sera choisi avant publication.',
      ],
    },
    {
      title: 'Données traitées',
      paragraphs: [
        'Vous jouez en invité : aucun compte n’est créé et aucune donnée n’est enregistrée en base.',
        'Votre pseudo (complété d’un tag #XXX) n’est connu que des participants de votre salon, le temps de la partie.',
        'Un jeton de reconnexion aléatoire est gardé dans le stockage de session de votre navigateur pour retrouver votre siège après un rechargement ; il expire au plus tard 3 heures après votre déconnexion.',
        'Vos paramètres (graphismes, langue, accessibilité) sont gardés sur votre appareil.',
        'Les parties en cours n’existent qu’en mémoire du serveur et disparaissent quand le salon se ferme. Les mots de passe des salons protégés n’y sont gardés que sous forme hachée.',
      ],
    },
    {
      title: 'Discord',
      paragraphs: [
        'Dans une Activity Discord, le jeu demande l’autorisation « identify » pour afficher votre nom Discord. Le serveur vérifie votre identité auprès de Discord, sans la conserver.',
      ],
    },
    {
      title: 'Mesure d’audience et journaux',
      paragraphs: [
        'Aucune mesure d’audience, aucun traceur publicitaire et aucun identifiant persistant non essentiel ne sont utilisés.',
        'Aucune adresse IP n’est écrite sur disque : la limitation des essais de mot de passe se fait en mémoire uniquement.',
      ],
    },
    {
      title: 'Vos droits',
      paragraphs: [
        'Comme aucune donnée personnelle n’est conservée après la partie, il n’y a rien à exporter ni à supprimer. Pour toute question : [À COMPLÉTER : adresse de contact].',
        'Âge minimum : celui de la plateforme utilisée (13 ans sur Discord).',
      ],
    },
  ],
  en: [
    {
      title: 'Legal notice',
      paragraphs: [
        'Publisher: [TO BE COMPLETED: name or company, address, contact].',
        'Publication director: [TO BE COMPLETED].',
        'Hosting: [TO BE COMPLETED: server and website host, address].',
        'CrasseCadia is a working title; the final name will be chosen before release.',
      ],
    },
    {
      title: 'Data we process',
      paragraphs: [
        'You play as a guest: no account is created and nothing is stored in a database.',
        'Your nickname (with a #XXX tag) is only known to the players of your room, for the duration of the game.',
        'A random reconnection token is kept in your browser session storage to get your seat back after a reload; it expires at most 3 hours after you disconnect.',
        'Your settings (graphics, language, accessibility) are kept on your device.',
        'Games in progress only exist in the server memory and are gone when the room closes. Protected room passwords are only kept hashed.',
      ],
    },
    {
      title: 'Discord',
      paragraphs: [
        'In a Discord Activity, the game asks for the “identify” permission to show your Discord name. The server checks your identity with Discord and does not keep it.',
      ],
    },
    {
      title: 'Analytics and logs',
      paragraphs: [
        'No analytics, no advertising tracker and no non-essential persistent identifier are used.',
        'No IP address is written to disk: password attempt limiting is done in memory only.',
      ],
    },
    {
      title: 'Your rights',
      paragraphs: [
        'Since no personal data is kept after the game, there is nothing to export or delete. For any question: [TO BE COMPLETED: contact address].',
        'Minimum age: that of the platform you use (13 on Discord).',
      ],
    },
  ],
};
