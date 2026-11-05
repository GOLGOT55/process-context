# process-context

Deux mods pour **Claude Code** qui montrent ce qui se passe pendant une session :

| Mod | Où | Ce qu'il affiche |
| --- | --- | --- |
| **Progress** (`progress`) | Panneau à droite de la conversation | Les actions de Claude en direct, étape par étape avec ✓, le temps estimé, le détail de chaque action et les fichiers touchés |
| **Contexte** (`aiblueprint`) | Carte au-dessus de la zone de saisie | Le contexte utilisé, le coût et la durée de la session, les limites 5 h et semaine (alerte à 80 %), et le **mode économe** (réponses courtes, code minimal, tokens économisés) |

## Installation

### En une seule commande

Dans un terminal (PowerShell, bash ou zsh), installe les deux mods d'un coup :

```bash
claude plugin install progress --marketplace GOLGOT55/process-context; claude plugin install aiblueprint --marketplace GOLGOT55/process-context
```

Puis ouvre une nouvelle session Claude Code : les deux mods sont actifs.

### Une par une

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

- S'ouvre tout seul à droite dès l'ouverture de la session (et au plus tard à la première demande) ; `/progress` le rouvre.
- **Catégories** : Lecture, Recherche, Web, Modifications, Commandes, Agents, Autre.
- **Temps estimé** qui s'écoule pour chaque action en cours, appris à partir des durées réelles et gardé d'une session à l'autre.
- **Détail au clic** : fichier et lignes, motif et dossier de recherche, page ou requête web, commande lancée, aperçu des modifications (−/+), fin du résultat.
- **Temps total** en haut de la carte Actions : le temps restant pour tout pendant le travail, puis le temps passé (✓) une fois fini. Chaque catégorie garde son ✓ et son temps.
- **Étape par étape** : chaque sous-action a son état, ✓ validée, ● en cours (avec son compte à rebours), ○ en attente, ✕ échec. Une fois validée, seul le ✓ reste, sans les secondes. Bilan en haut (« ✓ 5 validées · ● 1 en cours »).
- **Historique de la demande** : les actions restent affichées une fois finies ; chaque nouvelle demande repart d'un panneau vide pour ne pas tout accumuler.
- **Plan** de Claude en haut (○ à faire, ● en cours, ✓ fait).
- **Fichiers touchés** : tous les fichiers modifiés pendant la conversation, avec +/− lignes par fichier et au total. ▸ montre un aperçu rapide ; un clic sur le nom ↗ ouvre le fichier dans **sa propre fenêtre d'éditeur** (une par fichier, autant que tu veux) :
  - onglet **Contenu** : le fichier numéroté, les lignes changées par Claude surlignées en vert ;
  - onglet **Changements** : chaque modification, lignes retirées en rouge (−) et ajoutées en vert (+) ;
  - si l'app refuse les fenêtres à part, les fichiers s'ouvrent en **onglets** dans Progress (clic pour passer de l'un à l'autre, ✕ pour fermer, **← Retour** pour revenir).
- **Garde-fou** (activable/désactivable dans ⚙) : avant une commande risquée, une fenêtre demande Autoriser ou Refuser :
  - suppression récursive (`rm -rf`, `Remove-Item -Recurse`, `rmdir /s`) ;
  - suppression dans tes dossiers Jeux ou Cerveau ;
  - `git push --force`, `git reset --hard`, `git clean -f`, `git branch -D`.

  Seules les vraies commandes comptent : un texte qui contient juste ces mots (un message, un test) ne déclenche rien. Effacer tout un disque ou le formater est refusé d'office. La carte « Garde-fou » liste chaque commande avec ✓ autorisée, ✕ refusée ou ⛔ bloquée, l'heure, et la commande au clic.
- **Catégories fermées par défaut** : on n'y voit que l'action en cours, avec son temps qui défile ; une fois finie, elle reste avec son ✓ (sans les secondes) jusqu'à la suivante. Clic sur ▸ pour tout voir, ▾ pour refermer. Œil ◉ pour réduire le panneau.

### Personnaliser

Bouton **⚙** (masqué par défaut, **Masquer** pour le refermer) :

- Couleur : bleu, vert, violet, orange, rose, gris
- Couleur des validations ✓ et couleur des temps
- Jauge : ligne, segments, anneau ou aucune
- Fond : carte, noir, ardoise, transparent
- Largeur : étroite, normale, large
- Afficher ou non : résumé, plan, historique, temps, fichiers
- Garde-fou : actif ou désactivé

Les réglages sont gardés pour toutes les sessions.

## Contexte

- Contexte utilisé (tokens et pourcentage), limites 5 h et semaine avec jauge, rythme (+/−) et heure de remise à zéro.
- **Coût & temps** : coût de la session et depuis combien de temps elle tourne.
- **Alerte 80 %** : une notification (une seule fois par fenêtre) et un ⚠ quand la limite 5 h dépasse 80 %.
- 5 h et semaine s'affichent dès l'ouverture d'une conversation : les dernières valeurs connues sont gardées jusqu'à la première réponse.
- Rien à zéro n'est caché : contexte, 5 h et semaine s'affichent toujours, à 0 % s'il n'y a pas encore de valeur.
- Bouton **⚙** pour choisir ce qui s'affiche, le style de jauge, la couleur, la taille et le fond.
- Options aussi réglables dans les paramètres de Claude Code (`pluginConfigs`).

## Mode économe (dans Contexte)

Actif dès l'installation. À chaque requête, il ajoute au prompt système les règles :

- **caveman** : réponse d'abord, pas de politesses ni de résumé, phrases courtes, code et erreurs recopiés exactement ;
- **ponytail** : le plus petit changement complet, réutiliser l'existant, rien de non demandé.

Plus fiable qu'un skill : le modèle relit ces règles à chaque message. Environ 435 tokens par requête, mis en cache par l'API.

- **Case ☑ actif / ☐ inactif** dans la carte ÉCONOMIE : un clic active ou coupe le mode (gardé pour toutes les sessions).
- **Estimation** des tokens économisés sur la session : tokens de réponse écrits avec le mode × 40 % ÷ 60 % (taux moyen, pas une mesure exacte).
- **Compactage automatique** : quand le contexte dépasse 400 000 tokens, la conversation est compactée seule (comme `/compact`), entre deux tours.
- ⚙ → Afficher → **Économie** masque ou montre la carte.
- Les avertissements de sécurité, questions et tout ce qui est écrit dans des fichiers restent en phrases complètes.

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
