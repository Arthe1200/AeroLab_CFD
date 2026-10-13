# AeroLab CFD

**Tableau de bord pédagogique d'aérodynamique automobile**, en français, conçu pour préparer un workflow CFD et analyser des résultats exportés par un solveur externe.

> **Limite fondamentale : AeroLab CFD n'est pas un solveur CFD.** Il ne résout pas les équations de Navier–Stokes et ne génère pas de résultats aérodynamiques à partir d'une géométrie. Il visualise des modèles 3D et exploite des données fournies par l'utilisateur.

## Fonctionnalités

- Interface responsive avec sections Vue d'ensemble, Géométrie 3D, Configuration CFD, Résultats et Comparaison.
- Aperçu 3D des fichiers **STL** et **OBJ**, avec rotation et zoom.
- Reconnaissance des fichiers **STEP/STP/IGES** pour guider leur conversion en STL avec FreeCAD.
- Fiche de préparation des conditions aux limites et paramètres de référence.
- Import CSV avec séparateur virgule ou point-virgule, prise en charge des champs absents et vérifications de cohérence élémentaires.
- Graphiques de coefficient de traînée et de force de traînée.
- Comparaison de variantes et avertissement lorsque les vitesses diffèrent.
- Estimation théorique de la force de traînée à partir d'un Cd fourni.
- Export CSV et sauvegarde locale des résultats dans le navigateur.

## Démarrer en local

Les modules JavaScript et les bibliothèques graphiques sont chargés depuis des CDN ; une connexion Internet est nécessaire pour les charger.

Avec Python installé, depuis le dossier du projet :

```bash
python -m http.server 8000
```

Puis ouvrir http://localhost:8000.

Il est également possible d'utiliser l'extension Live Server d'un éditeur de code.

## Déployer sur GitHub Pages

Le workflow GitHub Actions du dépôt publie le site statique à chaque mise à jour de `main`. Vérifiez l'onglet **Actions**, puis **Settings → Pages** si le dépôt nécessite une première activation de GitHub Pages avec la source **GitHub Actions**.

URL attendue : https://arthe1200.github.io/AeroLab_CFD/

## Préparer un fichier STEP

Le navigateur ne convertit pas directement les formats STEP/IGES. Utilisez [FreeCAD](https://www.freecad.org/downloads.php) :

1. Ouvrir le modèle et vérifier les unités, l'échelle et les solides.
2. Simplifier les détails inutiles pour l'étude.
3. Sélectionner les objets à exporter et utiliser **Fichier → Exporter**.
4. Choisir le format STL et une résolution de tessellation adaptée.
5. Importer le STL dans AeroLab pour l'inspection visuelle.
6. Contrôler la fermeture, les normales, les intersections et la qualité de surface dans le logiciel de maillage/solveur avant toute simulation.

L'aperçu 3D est normalisé pour tenir dans la fenêtre : il ne certifie donc pas l'échelle physique du modèle.

## Workflow CFD conseillé

1. Nettoyer la CAO et définir le repère et les unités.
2. Construire le domaine fluide externe avec des limites suffisamment éloignées de la voiture.
3. Définir vitesse d'entrée, pression de sortie, parois, sol et roues selon le cas étudié.
4. Générer et contrôler le maillage, notamment près de la carrosserie et dans le sillage.
5. Configurer le solveur, les propriétés du fluide, la turbulence et les critères de convergence.
6. Vérifier la convergence, les bilans de masse, les forces et la sensibilité au maillage.
7. Exporter les résultats du solveur en CSV puis les importer dans AeroLab.
8. Comparer les variantes uniquement lorsque les méthodes et conditions sont cohérentes.

Un exemple de logiciel libre est [OpenFOAM](https://www.openfoam.com/). Les choix de domaine, de modèle de turbulence, de maillage et de conditions aux limites doivent être adaptés à chaque étude.

## Format CSV

Les noms d'en-têtes reconnus incluent `variant`, `Cd`, `drag_N`, `lift_N`, `speed_kmh`, `source` et `status`. Les variantes de noms françaises et anglaises usuelles sont également reconnues.

```csv
variant,Cd,drag_N,lift_N,speed_kmh,source,status
Variante A,0.31,125.4,-12,100,OpenFOAM,CFD
Variante B,0.28,113.3,-8,100,OpenFOAM,CFD
```

**Les nombres ci-dessus sont fictifs et servent uniquement à illustrer le format.** N'utilisez pas ces valeurs pour tirer une conclusion technique.

## Formule de référence

La force de traînée estimée est :

`Fd = 0.5 × rho × v² × Cd × A`

où `rho` est la masse volumique de l'air en kg/m³, `v` la vitesse relative air-véhicule en m/s, `Cd` le coefficient de traînée et `A` la surface de référence en m². Le résultat dépend des hypothèses et de la qualité du Cd fourni ; ce calcul n'est ni une simulation ni une mesure.

## Confidentialité et limites

- Les fichiers CAO et CSV sélectionnés sont traités dans le navigateur et ne sont pas téléversés par le code de l'application.
- Les résultats sont sauvegardés dans le stockage local du navigateur ; ils ne sont ni synchronisés ni partagés entre appareils. Effacer les données du navigateur peut les supprimer.
- Les dépendances sont chargées depuis des CDN externes.
- L'aperçu géométrique n'est pas un outil de réparation de maillage.
- Les vérifications CSV sont des contrôles simples et ne valident pas la qualité scientifique des données.
- Les comparaisons ne remplacent pas la validation du solveur, l'étude de convergence ni la validation expérimentale.

## Technologies

HTML, CSS, JavaScript ES modules, Three.js et Plotly.js.


## Moteur CFD local Windows (pont expérimental)

Le site GitHub Pages ne peut pas installer de logiciel ni exécuter un solveur sur le PC. Le dossier `local-engine/` contient un petit service local qui permet de vérifier le lien navigateur ↔ PC et de recevoir un modèle STL/OBJ. Il écoute uniquement sur `127.0.0.1`, utilise un code d'accès et ne doit pas être exposé sur Internet.

### Installation du pont

1. Installer Python 3.11 ou plus récent.
2. Ouvrir PowerShell dans `local-engine`.
3. Exécuter `py -m venv .venv`, puis `.venv\\Scripts\\python -m pip install -r requirements.txt`.
4. Lancer `start-windows.bat`. Copier le code d'accès affiché dans la console.
5. Dans AeroLab CFD → Configuration CFD, saisir le code puis cliquer sur **Tester la connexion**.

Le moteur local peut créer un cas OpenFOAM initial, générer un maillage et lancer le solveur. Ce workflow est un prototype et dépend de la compatibilité de la géométrie et de l'installation OpenFOAM. Le format STEP/IGES doit être converti en STL avec FreeCAD.


## Simulation automatique (prototype)

Le moteur local tente de créer un cas OpenFOAM à partir d'un fichier STL/OBJ, puis lance blockMesh, snappyHexMesh, checkMesh et simpleFoam. Il tente ensuite d'exporter les champs en VTK ASCII. Il faut une distribution WSL où les commandes OpenFOAM sont accessibles après chargement de son fichier bashrc. Le démarrage installe aussi trimesh pour lire et normaliser la géométrie.

Le modèle est mis à l'échelle avec sa plus grande dimension fixée à 4,5 m et l'axe le plus long est interprété comme axe longitudinal X. Ce sont des hypothèses automatiques, pas une validation du modèle. Le maillage initial est grossier et sans couches limites : les résultats ne sont pas validés pour la conception automobile. Les fichiers VTK exportés peuvent être explorés dans ParaView. La visualisation interactive des streamlines directement dans la page reste à développer.


## Mode sans installation locale

L'interface comprend un **aperçu d'écoulement illustratif** animé dans le navigateur après import d'un STL/OBJ. Les trajectoires sont générées graphiquement autour de l'enveloppe du modèle ; elles ne proviennent pas de la résolution des équations de Navier–Stokes et ne permettent pas de mesurer le Cd. Elles portent donc toujours le libellé « Flux approximatif ».

### Connecteur pour un véritable moteur CFD cloud

La section Configuration CFD accepte l'URL d'un serveur distant qui implémente l'API AeroLab (GET /api/health, POST /api/jobs avec les champs multipart geometry et speed_kmh, GET /api/jobs/{id}, puis les routes de téléchargement des résultats et du journal). Le site surveille le travail et permet de télécharger les résultats renvoyés.

**Aucun serveur CFD cloud n'est actuellement hébergé ou configuré dans ce dépôt.** GitHub Pages est uniquement un hébergeur statique : le connecteur ne peut pas lancer un vrai calcul tant que l'API distante n'a pas été déployée sur une infrastructure disposant d'OpenFOAM, de mémoire et de temps CPU suffisants. L'API doit être servie en HTTPS, limiter les téléversements et l'utilisation, contrôler les fichiers, et autoriser explicitement l'origine https://arthe1200.github.io en CORS. Ne place pas de clé privée de service dans le JavaScript public.

L'aperçu dans le navigateur et une simulation CFD réelle sont donc distingués dans l'interface. Un résultat ne doit être qualifié de CFD que si le serveur a réellement terminé le solveur et renvoyé les données calculées.
