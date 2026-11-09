/* Relais BatiScript – appli Devis réserves (Eurexpo)
 * Même travail que apiReservesFirebase du script Google « Devis réserves salons » :
 * lit les réserves du chantier « EDL eurexpo » dans l'API BatiScript (Web-Services) et les renvoie à l'appli.
 *  - Appel réservé aux comptes Bâtiment (jeton Firebase vérifié + fiche Acces active, comme les règles Firestore).
 *  - Jeton App Check vérifié s'il est présent (obligatoire quand REQUIRE_APP_CHECK=1).
 *  - Identifiants BatiScript dans Secret Manager (BATISCRIPT_USER / BATISCRIPT_PASS), jamais dans le code.
 */
const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
admin.initializeApp();

const BASE = 'https://api.batiscript.com/webservices';
const CHANTIER = 'etat des lieux'; // nom du chantier « EDL eurexpo » dans l'API (sans accents ni majuscules)
const ENTETES = ['N°', 'Event', 'Lot', 'Intitulé', 'Observations', 'Création', 'État', 'Plan', 'Entreprise'];
const ETATS = { '-1': 'En attente', '1': 'À corriger', '2': 'Corrigée', '3': 'Validée', '4': 'Abandonnée' };
const ORIGINES = ['https://eurexpobatiment.github.io'];
const PROPRIETAIRE = 'herve.desgranges@gl-events.com';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const frDate = d => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
const frDateHeure = d => frDate(d) + ' ' + new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

// gardés en mémoire tant que l'instance tourne
let jeton = null, jetonFin = 0;
let targetDb = process.env.BATISCRIPT_TARGET_DB !== undefined ? process.env.BATISCRIPT_TARGET_DB : null;
let chantierId = process.env.BATISCRIPT_CHANTIER_ID || null;

async function bsToken() {
  if (jeton && Date.now() < jetonFin) return jeton;
  const u = process.env.BATISCRIPT_USER, p = process.env.BATISCRIPT_PASS;
  if (!u || !p) throw new Error('Identifiants BatiScript absents (secrets batiscript-user / batiscript-pass).');
  const r = await fetch(BASE + '/public/v2/auth', { headers: { Authorization: 'Basic ' + Buffer.from(u + ':' + p, 'utf8').toString('base64') } });
  if (r.status !== 200) throw new Error('Connexion BatiScript refusée (code ' + r.status + ') : vérifiez identifiant et mot de passe.');
  jeton = (await r.json()).access_token; jetonFin = Date.now() + 240000;
  return jeton;
}
async function bsGet(chemin, sansTargetDb) {
  let url = BASE + chemin;
  if (!sansTargetDb) { const db = await bsTargetDb(); if (db) url += (url.includes('?') ? '&' : '?') + 'target-db=' + encodeURIComponent(db); }
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + await bsToken() } });
  if (r.status !== 200) throw new Error('BatiScript ' + chemin + ' : erreur ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function bsTargetDb() {
  if (targetDb !== null) return targetDb;
  let espaces = await bsGet('/public/v2/users/currentuser/spaces', true) || [];
  if (espaces.length > 1) {
    const bons = [];
    for (const e of espaces) {
      const r = await fetch(BASE + '/public/chantiers?target-db=' + encodeURIComponent(e.sourceId), { headers: { Authorization: 'Bearer ' + await bsToken() } });
      if (r.status !== 200) continue;
      const liste = await r.json() || {};
      if (Object.keys(liste).some(k => norm(liste[k].Operation).includes(CHANTIER) && liste[k].Statut !== 'Supprime')) bons.push(e);
    }
    if (bons.length !== 1) throw new Error('Chantier « EDL eurexpo » ' + (bons.length ? 'présent dans plusieurs' : 'absent des') + ' espaces BatiScript ('
      + espaces.map(e => e.sourceId).join(', ') + '). Indiquez le bon sourceId dans la variable BATISCRIPT_TARGET_DB.');
    espaces = bons;
  }
  targetDb = espaces.length ? espaces[0].sourceId : '';
  return targetDb;
}
async function bsChantierId() {
  if (chantierId) return chantierId;
  const liste = await bsGet('/public/chantiers');
  const trouves = Object.keys(liste).map(k => liste[k]).filter(c => norm(c.Operation).includes(CHANTIER) && c.Statut !== 'Supprime');
  if (trouves.length !== 1) throw new Error(trouves.length ? 'Plusieurs chantiers « EDL eurexpo » trouvés : ' + trouves.map(c => c.Operation + ' [' + c.Id + ']').join(', ')
    : 'Chantier « EDL eurexpo » introuvable dans BatiScript.');
  return (chantierId = trouves[0].Id);
}
function bsEvent(r) {
  for (const c of r.FormValues || []) if (/^(event|evenement|salon)$/.test(norm(c.Nom))) return String(c.Valeur || '').trim();
  return '';
}
function bsDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(/\s/g, ''));
  return isNaN(d) ? '' : frDate(d);
}
function bsLot(lot, lotsParNom) {
  const s = String(lot || '').trim();
  if (!s || /^\d/.test(s)) return s; // déjà numéroté (ou vide)
  const num = lotsParNom[norm(s)];
  return num ? ('0' + num).slice(-2) + ' ' + s : s;
}
async function reserves() {
  const id = await bsChantierId();
  const [res, plans, pr] = await Promise.all([bsGet('/public/chantiers/' + id + '/reserves'), bsGet('/public/chantiers/' + id + '/plans'),
    bsGet('/public/chantiers/' + id + '/prestataires')]);
  const lotsParNom = {};
  (pr.Prestataires || []).forEach(p => { if (p.Lot) lotsParNom[norm(p.Lot.Nom)] = p.Lot.Num; });
  const lignes = Object.keys(res).map(k => {
    const r = res[k], plan = plans[r.IdPlan];
    return [String(r.Numero), bsEvent(r), bsLot(r.Lot, lotsParNom), r.Intitule || '', r.Observations || '',
      bsDate(r.Date_creation), ETATS[String(r.Etat)] || String(r.Etat), plan ? (plan.NomComplet || plan.Nom || '') : '', r.Entreprise || ''];
  }).sort((a, b) => Number(a[0]) - Number(b[0]));
  return { entetes: ENTETES, lignes, quand: frDateHeure(new Date()) };
}

// Compte Bâtiment : même contrôle que les règles Firestore (propriétaire, ou fiche Acces active)
async function verifierCompte(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.get('Authorization') || '');
  if (!m) throw Object.assign(new Error('Connexion nécessaire'), { code: 401 });
  let dec;
  try { dec = await admin.auth().verifyIdToken(m[1]); } catch (e) { throw Object.assign(new Error('Connexion expirée : reconnectez-vous'), { code: 401 }); }
  const email = String(dec.email || '').toLowerCase();
  if (!email || dec.email_verified !== true) throw Object.assign(new Error('Accès refusé'), { code: 403 });
  if (email === PROPRIETAIRE) return email;
  const acc = await admin.firestore().doc('Acces/' + email).get();
  if (!acc.exists || !acc.get('nom') || acc.get('actif') === 'non') throw Object.assign(new Error('Accès refusé'), { code: 403 });
  return email;
}
async function verifierAppCheck(req) {
  const t = req.get('X-Firebase-AppCheck');
  if (!t) { if (process.env.REQUIRE_APP_CHECK === '1') throw Object.assign(new Error('Appel non autorisé'), { code: 401 }); return; }
  try { await admin.appCheck().verifyToken(t); } catch (e) { throw Object.assign(new Error('Appel non autorisé'), { code: 401 }); }
}

functions.http('relais', async (req, res) => {
  const origine = req.get('Origin') || '';
  if (ORIGINES.includes(origine)) { res.set('Access-Control-Allow-Origin', origine); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Firebase-AppCheck');
  res.set('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, err: 'Méthode non autorisée' });
  try {
    await verifierAppCheck(req);
    const email = await verifierCompte(req);
    const out = await reserves();
    console.log('Réserves BatiScript envoyées à ' + email + ' : ' + out.lignes.length);
    res.json({ ok: true, res: out });
  } catch (e) {
    console.error(e);
    res.status(e.code || 500).json({ ok: false, err: e.message || String(e) });
  }
});
