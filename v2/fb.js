/* Devis réserves – Eurexpo · couche Firebase (projet de l'appli Équipe : mêmes comptes, mêmes accès) */
const V = '10.14.1';
const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
const A = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
/* App Check (Fraud Defense / reCAPTCHA Enterprise) : prouve à Firebase que les requêtes viennent bien de nos pages.
   Sans réseau ou si le module ne se charge pas, l'appli continue normalement. */
const AC_SITE = '6Le3lBguAAAAAGb774RgCJp5Gd_jfG38Tks9out3';
const AC = await Promise.race([import(`https://www.gstatic.com/firebasejs/${V}/firebase-app-check.js`), new Promise(r => setTimeout(() => r(null), 4000))]).catch(() => null);
let acInst = null;
// jeton App Check à joindre aux appels de la fonction Firebase (vide si indisponible)
export async function jetonAppCheck() { if (!acInst) return ''; try { return (await AC.getToken(acInst, false)).token; } catch (e) { return ''; } }
function appCheck(app) { if (!AC) return; try { acInst = AC.initializeAppCheck(app, { provider: new AC.ReCaptchaEnterpriseProvider(AC_SITE), isTokenAutoRefreshEnabled: true }); } catch (e) { console.warn('App Check :', e); } }

let app, auth, db;
let me = '', meEmail = '';
const unsub = [];

export function init(cfg) {
  app = initializeApp(cfg);
  appCheck(app);
  // Connexion partagée entre toutes les applis eurexpobatiment.github.io : même rangement partout (sinon elles se « volent » la session)
  try { auth = A.initializeAuth(app, { persistence: [A.browserLocalPersistence, A.indexedDBLocalPersistence] }); } catch (e) { auth = A.getAuth(app); }
  try {
    db = F.initializeFirestore(app, { ignoreUndefinedProperties: true,
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) { db = F.getFirestore(app); }
}

const MSG = {
  'auth/invalid-email': 'Adresse e-mail invalide',
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect',
  'auth/wrong-password': 'E-mail ou mot de passe incorrect',
  'auth/user-not-found': 'Aucun compte avec cette adresse : créez-le depuis l\'appli Équipe (« Première connexion »)',
  'auth/too-many-requests': 'Trop d\'essais : patientez quelques minutes',
  'auth/network-request-failed': 'Pas de connexion internet',
  'permission-denied': 'Accès refusé (votre compte n\'a pas les droits pour cette action)',
  'unavailable': 'Serveur injoignable (pas de connexion ?)'
};
export const errMsg = e => MSG[e && e.code] || (e && e.message) || String(e);
const wrap = p => p.catch(e => { throw new Error(errMsg(e)); });

export const login = (email, pw) => wrap(A.signInWithEmailAndPassword(auth, email.trim(), pw));
export const resetPw = email => wrap(A.sendPasswordResetEmail(auth, email.trim(), { url: location.href.split('#')[0] }));
export async function logout() { stop(); me = ''; await A.signOut(auth); }
export const whoami = () => ({ nom: me, email: meEmail });
export const jeton = () => auth.currentUser.getIdToken();

// cb({etat: 'deconnecte' | 'non-verifie' | 'sans-acces' | 'ok', email, nom})
export function onAuth(cb) {
  let accUnsub = null;
  A.onAuthStateChanged(auth, async u => {
    if (accUnsub) { accUnsub(); accUnsub = null; }
    if (!u || u.isAnonymous) { me = ''; meEmail = ''; return cb({ etat: 'deconnecte' }); } // anonyme = session des applis de saisie
    meEmail = String(u.email || '').toLowerCase();
    if (!u.emailVerified) {
      await u.reload().catch(() => {});
      if (!auth.currentUser.emailVerified) return cb({ etat: 'non-verifie', email: meEmail });
    }
    try { const r = await u.getIdTokenResult(); if (r.claims.email_verified !== true) await u.getIdToken(true); } catch (e) {}
    let essai = 0, dejaOk = false;
    const ecoute = () => {
      accUnsub = F.onSnapshot(F.doc(db, 'Acces', meEmail), { includeMetadataChanges: true }, s => {
        const a = s.exists() ? s.data() : null;
        if (a && a.actif !== 'non') { essai = 0; me = a.nom; if (!dejaOk) { dejaOk = true; cb({ etat: 'ok', email: meEmail, nom: me }); } return; }
        // Fiche absente du cache local : on attend la réponse du serveur avant de conclure
        if (!a && s.metadata.fromCache) return;
        dejaOk = false; cb({ etat: 'sans-acces', email: meEmail });
      }, async e => {
        accUnsub = null;
        // Erreur passagère (jeton pas encore à jour, réseau…) : jusqu'à 3 nouvelles tentatives
        if (essai < 3) {
          essai++;
          if (e.code === 'permission-denied' || e.code === 'unauthenticated') await u.getIdToken(true).catch(() => {});
          await new Promise(r => setTimeout(r, 800 * essai));
          if (auth.currentUser === u) return ecoute();
          return;
        }
        dejaOk = false; cb({ etat: 'erreur', email: meEmail, err: errMsg(e) });
      });
    };
    ecoute();
  });
}

/* ---------- Données en direct ---------- */
export function stop() { while (unsub.length) { try { unsub.pop()(); } catch (e) {} } }

// Relancer la vérification d'accès (bouton « Réessayer »)
export const recharger = () => location.reload();

// onData(nom, valeur) : 'bpu' (liste), 'reserves' (liste), 'registre' (liste), 'config', 'mots', 'meta' (objets)
export function start(onData, onErr) {
  stop();
  const liste = (col, nom) => unsub.push(F.onSnapshot(F.collection(db, col),
    s => onData(nom, s.docs.map(d => Object.assign({}, d.data(), { id: d.id })), s.metadata.fromCache),
    e => onErr(errMsg(e))));
  const objet = (id, nom) => unsub.push(F.onSnapshot(F.doc(db, 'DevisParam', id),
    s => onData(nom, s.exists() ? s.data() : null, s.metadata.fromCache),
    e => onErr(errMsg(e))));
  liste('DevisBPU', 'bpu');
  liste('DevisReserves', 'reserves');
  liste('DevisRegistre', 'registre');
  objet('config', 'config');
  objet('mots', 'mots');
  objet('meta', 'meta');
}

const stamp = () => ({ majPar: me, majLe: new Date().toISOString() });

// Écritures groupées (Firestore : 500 opérations par lot)
export async function ecrire(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = F.writeBatch(db);
    ops.slice(i, i + 400).forEach(o => {
      const ref = F.doc(db, o.col, o.id);
      if (o.suppr) b.delete(ref);
      else b.set(ref, Object.assign({}, o.data, stamp()), { merge: !!o.merge });
    });
    await wrap(b.commit());
  }
}

export const majParam = (id, data) => wrap(F.setDoc(F.doc(db, 'DevisParam', id), Object.assign({}, data, stamp()), { merge: true }));
export const majRegistre = (id, data) => wrap(F.setDoc(F.doc(db, 'DevisRegistre', id), Object.assign({}, data, stamp()), { merge: true }));
export const supprRegistre = id => wrap(F.deleteDoc(F.doc(db, 'DevisRegistre', id)));
export const effacerChamp = () => F.deleteField();

// Numéro de devis suivant, attribué dans une transaction (deux personnes ne peuvent pas obtenir le même)
export async function attribuerNumero(regId, salon, annee) {
  return wrap(F.runTransaction(db, async tx => {
    const refR = F.doc(db, 'DevisRegistre', regId), refM = F.doc(db, 'DevisParam', 'meta');
    const [r, m] = [await tx.get(refR), await tx.get(refM)];
    if (r.exists() && r.data().num) return r.data().num;
    const cpt = Object.assign({}, (m.exists() && m.data().compteurs) || {});
    const n = (Number(cpt[annee]) || 0) + 1;
    cpt[annee] = n;
    const num = 'DEV-' + annee + '-' + String(n).padStart(3, '0');
    tx.set(refM, Object.assign({ compteurs: cpt }, stamp()), { merge: true });
    tx.set(refR, Object.assign({ salon, num, statut: 'Brouillon', date: new Date().toLocaleDateString('fr-FR') }, stamp()), { merge: true });
    return num;
  }));
}
