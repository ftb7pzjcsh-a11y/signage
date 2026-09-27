# écran vertical

Page de signalétique 1080×1920 qui lit `wire.json` et fait tourner les derniers développements.

## Fichiers

- `index.html` : la page (aucune dépendance externe : police Roboto système, drapeaux en emoji, QR code généré en local)
- `qrcode.js` : générateur de QR codes (licence MIT, Kazuhiko Arase)
- `wire.json` : les données. Tant que `"sample": true` y figure, un badge « Sample data, not live » s'affiche.

## Mise en ligne

1. Crée un dépôt GitHub public, par exemple `signage`, et dépose les trois fichiers à la racine.
2. Settings → Pages → Source : « Deploy from a branch », branche `main`, dossier `/ (root)`.
3. L'adresse sera `https://TON-COMPTE.github.io/unga-signage/`. Colle-la dans AbleSign en mode « display a website ».

## Mettre à jour le contenu

Modifie `wire.json` directement sur github.com (icône crayon, puis « Commit changes »). Les écrans relisent le fichier toutes les 2 minutes ; GitHub Pages peut mettre quelques minutes à publier le changement.

Plus tard, un workflow GitHub Actions pourra réécrire ce fichier automatiquement.

## Réglages

En haut du script dans `index.html` : fréquence de rafraîchissement, durée d'affichage par développement, nombre d'items en rotation et dans la liste.
