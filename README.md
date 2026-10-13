# AeroLab CFD

Tableau de bord pédagogique en français pour préparer et analyser un projet d'aérodynamique automobile.

## Fonctionnalités

- Aperçu 3D dans le navigateur pour les fichiers **STL** et **OBJ**.
- Aide à la conversion des fichiers STEP/STP/IGES avec FreeCAD.
- Fiche de préparation des conditions aux limites et des paramètres CFD.
- Import de résultats CSV, graphiques et comparaison de variantes.
- Estimation théorique de la force de traînée à partir d'un coefficient Cd importé.
- Interface responsive pour ordinateur et mobile.

## Limites importantes

**AeroLab CFD ne lance pas lui-même de simulation CFD.** Les valeurs initiales ne sont pas des mesures ni des résultats de solveur. Il faut réaliser le calcul dans un logiciel adapté (par exemple OpenFOAM ou SimScale), puis importer les résultats ici. Le calcul de force applique simplement la formule (F_d = \frac12 \rho v^2 C_d A\) à un coefficient fourni.

Les fichiers CAO et CSV sélectionnés sont traités localement dans le navigateur ; le site ne les envoie pas à un serveur.

## Utilisation locale

Comme le site utilise des modules JavaScript et des bibliothèques CDN, lancez un serveur HTTP local depuis le dossier du projet :

```bash
python -m http.server 8000
```

Puis ouvrez http://localhost:8000.

## Déployer sur GitHub Pages

1. Ouvrez **Settings → Pages** dans le dépôt.
2. Dans **Build and deployment**, choisissez **Deploy from a branch**.
3. Sélectionnez la branche `main` et le dossier `/(root)`.
4. Cliquez sur **Save**, puis attendez la fin du déploiement.

Une fois activé, le site sera disponible à l'adresse :

https://arthe1200.github.io/AeroLab_CFD/

## Visualiser un fichier STEP

Le visualiseur du navigateur ne lit pas directement les fichiers STEP. Avec FreeCAD :

1. Ouvrez le fichier STEP/STP et vérifiez l'échelle et les solides.
2. Simplifiez les détails non nécessaires.
3. Sélectionnez la carrosserie puis choisissez **Fichier → Exporter**.
4. Exportez en **STL Mesh (*.stl)** avec des unités cohérentes.
5. Importez le STL dans l'onglet Géométrie, puis contrôlez le maillage et la fermeture de la surface dans votre workflow CFD.

Téléchargement de FreeCAD : https://www.freecad.org/downloads.php

## Format CSV

Les en-têtes pris en charge comprennent :

```csv
variant,Cd,drag_N,lift_N,speed_kmh,source,status
Version A,0.31,125.4,-12,100,OpenFOAM,CFD
Version B,0.28,113.3,-8,100,OpenFOAM,CFD
```

Les deux lignes ci-dessus sont **des exemples fictifs de format**, et non des résultats recommandés, mesurés ou simulés.
