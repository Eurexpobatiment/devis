# Fonction Firebase « relais-batiscript »

Remplace la fonction `apiReservesFirebase` du script Google « Devis réserves salons » (en service depuis le 10 nov. 2026).
Lit les réserves du chantier « EDL eurexpo » dans l'API BatiScript et les renvoie à l'appli Devis (`v2/index.html`, `CONFIG.relaisFb`).
L'appli repasse par l'ancien script Google si la fonction échoue.

- Région : europe-west9 (Paris) · URL : https://europe-west9-equipe-batiment.cloudfunctions.net/relais-batiscript
- Accès : compte Bâtiment connecté (jeton Firebase + fiche `Acces` active) ; jeton App Check vérifié s'il est présent
  (le rendre obligatoire : variable `REQUIRE_APP_CHECK=1`).
- Identifiants BatiScript : secrets `batiscript-user` / `batiscript-pass` (Secret Manager, Paris).

Changer les identifiants (Cloud Shell, ils sont demandés et ne s'affichent pas) :
```
read -p 'Identifiant : ' U && read -s -p 'Mot de passe : ' P && echo && printf '%s' "$U" | gcloud secrets versions add batiscript-user --data-file=- && printf '%s' "$P" | gcloud secrets versions add batiscript-pass --data-file=- ; unset U P; gcloud run services update relais-batiscript --region=europe-west9 --update-labels=maj=$(date +%s) --quiet
```

Mettre à jour le code (Cloud Shell) :
```
rm -rf ~/devis && git clone -q --depth 1 https://github.com/Eurexpobatiment/devis ~/devis && cd ~/devis/functions/relais-batiscript && gcloud functions deploy relais-batiscript --gen2 --region=europe-west9 --runtime=nodejs22 --source=. --entry-point=relais --trigger-http --allow-unauthenticated --memory=256Mi --max-instances=3 --timeout=60s --set-secrets=BATISCRIPT_USER=batiscript-user:latest,BATISCRIPT_PASS=batiscript-pass:latest
```
