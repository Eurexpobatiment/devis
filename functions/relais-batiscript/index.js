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
const ENTETES = ['N°', 'Event', 'Lot', 'Intitulé', 'Observations', 'Création', 'État', 'Plan', 'Entreprise', 'Emplacement'];
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
// Champ « emplacements » du formulaire BatiScript (texte, ou plusieurs valeurs réunies par des virgules)
function bsEmplacement(r) {
  for (const c of r.FormValues || []) if (/^emplacements?$/.test(norm(c.Nom))) {
    const v = c.Valeur;
    return (Array.isArray(v) ? v.map(x => x && typeof x === 'object' ? (x.Nom || x.Valeur || x.Libelle || '') : x).filter(Boolean).join(', ') : String(v == null ? '' : v)).trim();
  }
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
      bsDate(r.Date_creation), ETATS[String(r.Etat)] || String(r.Etat), plan ? (plan.NomComplet || plan.Nom || '') : '', r.Entreprise || '', bsEmplacement(r)];
  }).sort((a, b) => Number(a[0]) - Number(b[0]));
  return { entetes: ENTETES, lignes, quand: frDateHeure(new Date()) };
}

/* Diagnostic (corps { "diag": true }) : décrit la FORME des données BatiScript d'un plan et d'une réserve placée sur plan
 * (noms des champs et types ; nombres visibles, textes masqués) pour savoir si l'API fournit l'image du plan et la
 * position des réserves. Ne renvoie aucun contenu de réserve. */
function forme(v, prof) {
  prof = prof || 0;
  if (v === null || v === undefined) return 'vide';
  if (Array.isArray(v)) return v.length ? { 'liste': v.length, 'premier': prof > 3 ? '…' : forme(v[0], prof + 1) } : 'liste vide';
  if (typeof v === 'object') {
    if (prof > 3) return 'objet';
    const o = {}; Object.keys(v).slice(0, 80).forEach(k => { o[k] = forme(v[k], prof + 1); }); return o;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  if (/^https?:\/\//i.test(s)) { try { const u = new URL(s); return 'lien (' + u.hostname + ', ' + (/\.[a-z0-9]{2,5}$/i.exec(u.pathname) || ['sans extension'])[0] + ')'; } catch (e) { return 'lien'; } }
  if (/^-?\d+([.,]\d+)?$/.test(s)) return 'nombre en texte : ' + s;
  if (/^\d{4}-\d\d-\d\d/.test(s)) return 'date';
  if (/\.(pdf|png|jpe?g|webp|svg|dwg)$/i.test(s)) return 'nom de fichier (' + /\.[a-z0-9]+$/i.exec(s)[0] + ')';
  return 'texte (' + s.length + ' car.)';
}
async function bsEssai(chemin) {
  try {
    let url = BASE + chemin; const db = await bsTargetDb();
    if (db) url += (url.includes('?') ? '&' : '?') + 'target-db=' + encodeURIComponent(db);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + await bsToken() } });
    const type = r.headers.get('content-type') || '';
    const out = { code: r.status, type };
    if (r.status === 200 && /json/i.test(type)) out.forme = forme(await r.json());
    else if (r.status === 200) out.taille = (await r.arrayBuffer()).byteLength;
    return out;
  } catch (e) { return { erreur: e.message || String(e) }; }
}
async function diagnostic() {
  const id = await bsChantierId();
  const [res, plans] = await Promise.all([bsGet('/public/chantiers/' + id + '/reserves'), bsGet('/public/chantiers/' + id + '/plans')]);
  const lr = Object.keys(res).map(k => res[k]), cles = Object.keys(plans);
  const r = lr.filter(x => x.IdPlan && plans[x.IdPlan]).pop() || lr[lr.length - 1] || null;
  const idPlan = r && r.IdPlan && plans[r.IdPlan] ? r.IdPlan : cles[0];
  const champsReserve = {}; lr.forEach(x => Object.keys(x).forEach(k => { champsReserve[k] = (champsReserve[k] || 0) + (x[k] === null || x[k] === '' ? 0 : 1); }));
  const essais = {};
  if (idPlan !== undefined) for (const c of ['/public/chantiers/' + id + '/plans/' + idPlan, '/public/plans/' + idPlan])
    essais[c.replace(String(id), '{chantier}').replace(String(idPlan), '{plan}')] = await bsEssai(c);
  return { quand: frDateHeure(new Date()), nbReserves: lr.length, nbPlans: cles.length, reservesAvecPlan: lr.filter(x => x.IdPlan && plans[x.IdPlan]).length,
    plan: idPlan !== undefined ? forme(plans[idPlan]) : null, reserve: r ? forme(r) : null, champsReserveRemplis: champsReserve, essais };
}

/* Plans des réserves (devis PDF)
 *  - corps { "positions": true } : pour chaque réserve placée sur un plan, [IdPlan, X, Y] (X, Y entre 0 et 1), et le nom des plans ;
 *  - corps { "plan": "<IdPlan>" } : le fichier du plan (PDF ou image), tel que BatiScript le fournit. */
let plansCache = null, plansFin = 0;
async function bsPlans() {
  if (plansCache && Date.now() < plansFin) return plansCache;
  plansCache = await bsGet('/public/chantiers/' + await bsChantierId() + '/plans'); plansFin = Date.now() + 300000;
  return plansCache;
}
async function positions() {
  const id = await bsChantierId();
  const [res, plans] = await Promise.all([bsGet('/public/chantiers/' + id + '/reserves'), bsPlans()]);
  const pos = {}, noms = {};
  Object.keys(res).forEach(k => {
    const r = res[k], x = Number(r.PositionX), y = Number(r.PositionY);
    if (!r.IdPlan || !plans[r.IdPlan] || r.IsOutOfPlan || !isFinite(x) || !isFinite(y)) return;
    pos[String(r.Numero)] = [r.IdPlan, Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5];
    noms[r.IdPlan] = plans[r.IdPlan].NomComplet || plans[r.IdPlan].Nom || '';
  });
  return { pos, plans: noms, quand: frDateHeure(new Date()) };
}
async function fichierPlan(idPlan) {
  const plans = await bsPlans();
  if (!Object.prototype.hasOwnProperty.call(plans, idPlan)) throw Object.assign(new Error('Plan inconnu'), { code: 404 });
  let url = BASE + '/public/chantiers/' + await bsChantierId() + '/plans/' + encodeURIComponent(idPlan);
  const db = await bsTargetDb(); if (db) url += '?target-db=' + encodeURIComponent(db);
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + await bsToken() } });
  if (r.status !== 200) throw new Error('BatiScript (plan) : erreur ' + r.status);
  return { type: r.headers.get('content-type') || 'application/octet-stream', data: Buffer.from(await r.arrayBuffer()) };
}

/* Photos des réserves (rapports PDF)
 *  - corps { "photos": true } : nombre de photos de chaque réserve qui en a, { "283": 2, … } ;
 *  - corps { "photo": "<n° de réserve>", "i": 0 } : le fichier de la photo (la 1re si « i » est absent).
 * La documentation de l'API ne dit pas où se trouvent les fichiers : plusieurs adresses possibles sont essayées,
 * la première qui renvoie bien une image est retenue pour la suite. */
let resCache = null, resFin = 0;
async function bsReserves() {
  if (resCache && Date.now() < resFin) return resCache;
  resCache = await bsGet('/public/chantiers/' + await bsChantierId() + '/reserves'); resFin = Date.now() + 300000;
  return resCache;
}
const MODELES_PHOTO = [
  '/public/chantiers/{chantier}/reserves/{reserve}/photos/{fichier}',
  '/public/chantiers/{chantier}/reserves/{reserve}/photos/{rang}',
  '/public/chantiers/{chantier}/photos/{fichier}',
  '/public/chantiers/{chantier}/reserves/photos/{fichier}',
  '/public/chantiers/{chantier}/reserves/{reserve}/photo/{fichier}',
  '/public/reserves/{reserve}/photos/{fichier}',
  '/public/photos/{fichier}',
  '/public/v2/chantiers/{chantier}/reserves/{reserve}/photos/{fichier}'
];
let modelePhoto = process.env.BATISCRIPT_MODELE_PHOTO || null;
const cheminPhoto = (modele, chantier, r, i) => modele.replace('{chantier}', encodeURIComponent(chantier)).replace('{reserve}', encodeURIComponent(r.Id))
  .replace('{fichier}', encodeURIComponent(r.Photos[i].FileName)).replace('{rang}', String(i));
function typeImage(b) {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}
async function nombresPhotos() {
  const res = await bsReserves(), nb = {};
  Object.keys(res).forEach(k => { const n = (res[k].Photos || []).filter(p => p && p.FileName).length; if (n) nb[String(res[k].Numero)] = n; });
  return { nb, quand: frDateHeure(new Date()) };
}
async function fichierPhoto(numero, i) {
  const res = await bsReserves();
  const r = Object.keys(res).map(k => res[k]).find(x => String(x.Numero) === String(numero));
  i = Number(i) || 0;
  if (!r || !Array.isArray(r.Photos) || !r.Photos[i] || !r.Photos[i].FileName) throw Object.assign(new Error('Photo inconnue'), { code: 404 });
  const chantier = await bsChantierId(), db = await bsTargetDb();
  for (const modele of (modelePhoto ? [modelePhoto] : MODELES_PHOTO)) {
    let url = BASE + cheminPhoto(modele, chantier, r, i);
    if (db) url += '?target-db=' + encodeURIComponent(db);
    const rep = await fetch(url, { headers: { Authorization: 'Bearer ' + await bsToken() } });
    if (rep.status !== 200) continue;
    const data = Buffer.from(await rep.arrayBuffer()), type = typeImage(data);
    if (!type) continue;
    if (!modelePhoto) { modelePhoto = modele; console.log('Adresse des photos BatiScript retenue : ' + modele); }
    return { type, data };
  }
  throw Object.assign(new Error('Photo non fournie par BatiScript'), { code: 502 });
}
// Diagnostic : ce que répond BatiScript à chaque adresse possible pour une photo (code, type, taille ; aucun contenu)
async function diagPhotos() {
  const res = await bsReserves(), chantier = await bsChantierId();
  const lr = Object.keys(res).map(k => res[k]);
  const avec = lr.filter(x => Array.isArray(x.Photos) && x.Photos.some(p => p && p.FileName));
  const r = avec.find(x => x.Photos[0] && x.Photos[0].FileName);
  const essais = {};
  if (r) for (const m of MODELES_PHOTO) essais[m] = await bsEssai(cheminPhoto(m, chantier, r, 0));
  return { reservesAvecPhotos: avec.length, nbPhotos: avec.reduce((n, x) => n + x.Photos.length, 0), retenue: modelePhoto,
    nomFichier: r ? forme(r.Photos[0].FileName) + ', ' + String(r.Photos[0].FileName).length + ' car., ' + (/[\/\\]/.test(r.Photos[0].FileName) ? 'avec dossier' : 'sans dossier') : null, essais };
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
    let corps = req.body; if (typeof corps === 'string') { try { corps = JSON.parse(corps); } catch (e) { corps = {}; } }
    if (corps && corps.diag === 'photos') {
      const d = await diagPhotos();
      console.log('Diagnostic BatiScript (photos) envoyé à ' + email);
      return res.json({ ok: true, diag: d });
    }
    if (corps && corps.photos) {
      const p = await nombresPhotos();
      console.log('Nombres de photos envoyés à ' + email + ' : ' + Object.keys(p.nb).length + ' réserve(s)');
      return res.json({ ok: true, res: p });
    }
    if (corps && corps.photo !== undefined && corps.photo !== null && corps.photo !== '') {
      const f = await fichierPhoto(String(corps.photo), corps.i);
      console.log('Photo ' + (Number(corps.i) || 0) + ' de la réserve ' + corps.photo + ' envoyée à ' + email + ' (' + f.data.length + ' octets)');
      res.set('Content-Type', f.type); res.set('Cache-Control', 'private, max-age=600');
      return res.send(f.data);
    }
    if (corps && corps.diag) {
      const d = await diagnostic();
      console.log('Diagnostic BatiScript (plans) envoyé à ' + email);
      return res.json({ ok: true, diag: d });
    }
    if (corps && corps.positions) {
      const p = await positions();
      console.log('Positions des réserves envoyées à ' + email + ' : ' + Object.keys(p.pos).length);
      return res.json({ ok: true, res: p });
    }
    if (corps && corps.plan) {
      const f = await fichierPlan(String(corps.plan));
      console.log('Plan ' + corps.plan + ' envoyé à ' + email + ' (' + f.data.length + ' octets)');
      res.set('Content-Type', f.type); res.set('Cache-Control', 'private, max-age=600');
      return res.send(f.data);
    }
    const out = await reserves();
    console.log('Réserves BatiScript envoyées à ' + email + ' : ' + out.lignes.length);
    res.json({ ok: true, res: out });
  } catch (e) {
    console.error(e);
    res.status(e.code || 500).json({ ok: false, err: e.message || String(e) });
  }
});
