CARNET 5/3/1 — INSTALLATION ANDROID

1. Décompresse le ZIP.
2. Mets tous les fichiers de l’application à la racine d’un dépôt GitHub public (index.html, style.css, carnet.js, app.js, sw.js, manifest.webmanifest, icon-192.png, icon-512.png).
3. Dans GitHub : Settings > Pages > Build and deployment > Deploy from a branch > main / (root) > Save.
4. Une fois l’adresse https://<nom>.github.io/<depot>/ active, ouvre-la dans Chrome sur Android.
5. Menu ⋮ > Ajouter à l’écran d’accueil > Installer (selon Chrome).
6. Ouvre l’application installée. Elle fonctionne ensuite sans Internet dès que les ressources ont été mises en cache.

IMPORTANT : le stockage du vieux fichier HTML et celui du site GitHub Pages sont SÉPARÉS. Depuis l’ancien carnet, utilise Données > Exporter JSON, puis dans la PWA, Données > Importer JSON.

Les données ne se synchronisent pas entre appareils. Exporte le JSON périodiquement. Ne vide pas les données du site/app si tu veux conserver ton historique local.

SÉANCES LIBRES

Dans le tableau de séance, sélectionne les mouvements du jour en touchant leur nom. Tu peux faire chaque mouvement seul ou en regrouper plusieurs. Front squat et OHP sont indépendants.
Chaque mouvement utilise automatiquement son premier bloc non enregistré (A, puis B, puis C), selon l’historique du cycle. Aucun choix manuel de bloc n’est nécessaire ou proposé ; le tableau affiche seulement la progression. Les anciennes sélections manuelles sont ignorées, les brouillons et l’historique sont conservés.
Les réglages FSL/SSL, les coches et les répétitions saisies sont conservés par mouvement, cycle et bloc, même si tu retires puis rajoutes le mouvement à une séance.
« Séance terminée » enregistre seulement les mouvements sélectionnés et valide leur bloc. Les coches indiquent les séries supplémentaires réellement cochées ; enregistrer ne les coche pas automatiquement.
Après les trois blocs d’un mouvement, il est indiqué « Terminé » et ne peut plus être ajouté à une séance de ce cycle. Le prochain cycle se crée manuellement dans TM / cycles. Les blocs incomplets sont signalés avant confirmation ; les anciens cycles restent consultables.

MISE À JOUR

Exporte ton JSON avant de mettre les fichiers du site à jour. Le cache hors ligne passe à la nouvelle version lors de la prochaine ouverture avec Internet ; au besoin, ferme puis rouvre l’application.
Les données de l’ancienne version sont reprises automatiquement, y compris les séances Front + OHP qui comptent pour les deux mouvements. Une copie locale brute de l’ancienne base est conservée lors de la première migration.
Les anciens JSON peuvent être importés. Les nouveaux exports utilisent le format ca.carnet531.v2 et incluent aussi les brouillons par mouvement ; ils doivent être ouverts avec cette version de l’application.

VÉRIFICATION LOCALE (Node.js)

node --test tests/carnet.test.js

Test navigateur facultatif, avec Microsoft Edge installé sous Windows :
node --test tests/browser.test.js
Le test ouvre un navigateur sans fenêtre avec un profil temporaire, à 390 puis 320 pixels de largeur. Il vérifie migration, regroupements, progression automatique, brouillons, import/export, cycle suivant et utilisation hors ligne. Il utilise --no-sandbox pour fonctionner dans un environnement de test restreint et ne visite que son serveur local. CARNET_BROWSER permet de préciser un autre exécutable Chromium.
