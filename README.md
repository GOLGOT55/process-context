# process-context

Deux mods pour **Claude Code** qui montrent ce qui se passe pendant une session :

| Mod | Où | Ce qu'il affiche |
| --- | --- | --- |
| **Progress** (`progress`) | Panneau à droite de la conversation | Les actions de Claude en direct, rangées par catégorie, avec un temps estimé, le détail de chaque action et l'historique |
| **Contexte** (`aiblueprint`) | Carte au-dessus de la zone de saisie | Le contexte utilisé, les limites d'usage sur 5 h et sur la semaine, le rythme et l'heure de remise à zéro |

## Installation

Dans Claude Code, à l'invite d'une session dans un terminal :

```
/plugin install progress --marketplace GOLGOT55/process-context
/plugin install aiblueprint --marketplace GOLGOT55/process-context
```

Répondre `y` pour ajouter le marketplace, puis choisir la portée (utilisateur = toutes tes sessions).

Ou depuis un shell :

```bash
claude plugin install progress --marketplace GOLGOT55/process-context
claude plugin install aiblueprint --marketplace GOLGOT55/process-context
```

Dans l'application Claude (onglet Code) : bouton **+** à côté de la zone de saisie → **Plugins** → **Add marketplace** avec `GOLGOT55/process-context`, puis **Add plugin** pour chacun des deux mods.

Les deux mods se chargent ensuite dans toutes les nouvelles sessions.

## Progress

- S'ouvre tout seul à droite dès la première demande ou commande ; `/progress` le rouvre.
- **Catégories** : Lecture, Recherche, Web, Modifications, Commandes, Agents, Autre.
- **Temps estimé** qui s'écoule pour chaque action en cours, appris à partir des durées réelles et gardé d'une session à l'autre.
- **Détail au clic** : fichier et lignes, motif et dossier de recherche, page ou requête web, commande lancée, aperçu des modifications (−/+), fin du résultat.
- **Historique** : les actions terminées restent affichées avec leur durée réelle.
- **Plan** de Claude en haut (○ à faire, ● en cours, ✓ fait).
- Flèches ▸/▾ pour replier, œil ◉ pour réduire le panneau.

### Personnaliser

Bouton **⚙** (masqué par défaut, **Masquer** pour le refermer) :

- Couleur : bleu, vert, violet, orange, rose, gris
- Fond : carte, noir, ardoise, transparent
- Largeur : étroite, normale, large
- Afficher ou non : résumé, plan, historique, temps

Les réglages sont gardés pour toutes les sessions.

## Contexte

- Contexte utilisé (tokens et pourcentage), limites 5 h et semaine avec jauge, rythme (+/−) et heure de remise à zéro.
- Bouton **⚙** pour choisir ce qui s'affiche, le style de jauge, la couleur, la taille et le fond.
- Options aussi réglables dans les paramètres de Claude Code (`pluginConfigs`).

## Limites

- Un mod ne peut pas écrire dans la colonne Environnement / Contexte / Connecteurs de l'application : Progress s'ouvre dans son propre panneau à droite.
- Les temps de Progress sont des estimations : Claude n'annonce pas la durée de ses actions à l'avance.

## Développement

Chaque mod est un dossier autonome (`.claude-plugin/plugin.json`, `hooks/register.tsx`, `types/index.d.ts`, `tests/`).

```bash
claude plugin validate ./progress
claude plugin test ./progress
claude --plugin-dir ./progress --plugin-dir ./aiblueprint
```

## Licence

[MIT](LICENSE) © GOLGOT55
