CARNET 5/3/1 — INSTALLATION ANDROID

1. Décompresse le ZIP.
2. Mets tous les fichiers à la racine d’un dépôt GitHub public (index.html, sw.js, manifest.webmanifest, icon-192.png, icon-512.png).
3. Dans GitHub : Settings > Pages > Build and deployment > Deploy from a branch > main / (root) > Save.
4. Une fois l’adresse https://<nom>.github.io/<depot>/ active, ouvre-la dans Chrome sur Android.
5. Menu ⋮ > Ajouter à l’écran d’accueil > Installer (selon Chrome).
6. Ouvre l’application installée. Elle fonctionne ensuite sans Internet dès que les ressources ont été mises en cache.

IMPORTANT : le stockage du vieux fichier HTML et celui du site GitHub Pages sont SÉPARÉS. Depuis l’ancien carnet, utilise Données > Exporter JSON, puis dans la PWA, Données > Importer JSON.

Les données ne se synchronisent pas entre appareils. Exporte le JSON périodiquement. Ne vide pas les données du site/app si tu veux conserver ton historique local.
