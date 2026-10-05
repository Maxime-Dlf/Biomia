# Assets sources (§14.7)

Déposez ici les fichiers sources selon la convention ci-dessous. Remplacer un fichier ne demande
aucune modification de code : le pipeline (AssetPack, phase 9) produit atlas, variantes HD/SD et
formats compressés. En attendant, le client dessine des substituts vectoriels (profil Ultra Low).

| Asset | Nom de fichier | Format source | HD | SD (auto) |
|---|---|---|---|---|
| Texture de biome | `biome_e0.png` … `biome_e4.png` | PNG/PSD, raccordable | 512 × 512 | 256 |
| Masque de frontière | `border_mask_<style>.png` | PNG avec alpha | 512 × 512 | 256 |
| Jeton | `token_square.png`, `token_triangle.png`, `token_heart.png`, `token_circle.png`, `token_star.png` | PNG transparent 1:1 | 256 × 256 | 128 |
| Icône d'accueil | `icon_square.svg` … | SVG | 128 × 128 | 64 |
| Carte d'objectif | `objective_low.png`, `objective_high.png` | PNG 2:3 | 600 × 900 | 300 × 450 |
| Interface | `ui_<nom>.svg`, `ui_<nom>_9slice.png` | SVG, PNG 9-slice | — | — |
| Sons | `sfx_<événement>.wav` (ex. `sfx_tile_placed.wav`, `sfx_steal.wav`) | WAV | — | — |

Identifiants stables des environnements : `E0` à `E4` (couleurs provisoires Okabe-Ito dans
`apps/client/src/render/palette.ts`). Les noms définitifs des 5 environnements et des 5 formes font
partie des livrables de cadrage de l'artiste.
