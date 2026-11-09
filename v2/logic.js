/* Devis réserves – Eurexpo · calculs (classement, devis), sans dépendance.
 * Reprend à l'identique la logique du script Google (classer_, construireDevis_). */

export const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export const nombre = x => {
  if (x === null || x === undefined || x === '') return null;
  if (typeof x === 'number') return isFinite(x) ? x : null;
  const n = Number(String(x).replace(/\s|€/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
};

export const arrondi = x => Math.round(x * 100) / 100;

// En-têtes de l'export BatiScript (et de l'API) : N°, Event, Lot, Intitulé, Observations, Création, État, Plan, Entreprise
export function lireLignesImport(entetes, lignes) {
  const H = entetes.map(norm);
  const col = n => H.findIndex(x => x === n || x.indexOf(n) === 0);
  const c = {
    num: col('n°'), ev: col('event') >= 0 ? col('event') : col('evenement'), lot: col('lot'),
    int: col('intitule'), obs: col('observation'), cre: col('creation'), etat: col('etat'), plan: col('plan'), entr: col('entreprise')
  };
  if (c.num < 0 || c.ev < 0 || c.int < 0) throw new Error('Colonnes N°, Event ou Intitulé absentes de l\'import.');
  const g = (r, k) => c[k] >= 0 && r[c[k]] != null ? String(r[c[k]]).trim() : '';
  return lignes.map(r => ({
    num: g(r, 'num'), ev: g(r, 'ev'), lot: g(r, 'lot'), int: g(r, 'int'), obs: g(r, 'obs'),
    cre: g(r, 'cre'), etat: g(r, 'etat'), plan: g(r, 'plan'), entr: g(r, 'entr')
  })).filter(r => r.num);
}

// Réserve facturable : un événement, pas dans les exclus, pas abandonnée
export function facturable(r, exclus) {
  const ex = (exclus || []).map(norm);
  return !!r.ev && ex.indexOf(norm(r.ev)) < 0 && norm(r.etat).indexOf('abandon') !== 0;
}

// Classement : intitulé d'abord, puis observation si l'intitulé ne donne rien ; le plus bas dans la liste l'emporte.
// L'observation est toujours lue : si elle donne un autre code que l'intitulé, ce code est proposé (sugg) pour vérification.
export function classer(r, mots) {
  const M = mots.map(m => ({ k: norm(m.mot), c: String(m.code || '').trim() })).filter(m => m.k && m.c);
  const cherche = t => { let c = ''; if (t) M.forEach(m => { if (t.indexOf(m.k) >= 0) c = m.c; }); return c; };
  const cInt = cherche(norm(r.int)), cObs = cherche(norm(r.obs));
  const auto = cInt || cObs;
  return {
    auto,
    via: auto ? (cInt ? 'intitulé' : 'observation') : '',
    sugg: cInt && cObs && cObs !== cInt ? cObs : ''
  };
}

/* Ligne de devis d'une réserve.
 * bpu : { code: {des, unite, pu, lot} } · p : {coef} · o : réglages gardés {force, qte, puForce} */
export function ligne(r, mots, bpu, p, o) {
  o = o || {};
  const { auto, via, sugg } = classer(r, mots);
  const force = String(o.force || '').trim();
  const code = force || auto;
  const a = code ? bpu[code] : null;
  const qte = nombre(o.qte) === null ? 1 : nombre(o.qte);
  const puForce = nombre(o.puForce);
  const puBpu = a ? nombre(a.pu) : null;
  let pu = null;
  if (code && a) pu = puForce !== null ? puForce : (puBpu === null ? null : puBpu * (nombre(p.coef) || 1));
  return {
    num: r.num, salon: r.ev, lot: r.lot, constat: r.int, obs: r.obs, plan: r.plan, etat: r.etat, cre: r.cre,
    auto, via, sugg, force, code: a ? code : (code ? code : ''), connu: !!a,
    des: a ? a.des : '', unite: a ? a.unite : '', qte, puForce, pu,
    mt: pu === null || !a ? null : qte * pu
  };
}

// Devis par salon : lignes triées par code (non classées à la fin) puis n°, totaux
export function devisSalon(lignes, tva) {
  const rows = lignes.slice().sort((a, b) =>
    ((!a.connu) - (!b.connu)) || String(a.code).localeCompare(String(b.code)) || (Number(a.num) - Number(b.num)));
  let ht = 0, nc = 0, sansPu = 0;
  rows.forEach(l => { if (!l.connu) nc++; else if (l.pu === null) sansPu++; if (l.mt !== null) ht += l.mt; });
  ht = arrondi(ht);
  const t = nombre(tva) === null ? 0.2 : nombre(tva);
  const tv = arrondi(ht * t);
  return { lignes: rows, n: rows.length, nc, sansPu, ht, tva: tv, ttc: arrondi(ht + tv), taux: t };
}

export function calculer(reserves, mots, bpuListe, param, garde) {
  const bpu = {};
  bpuListe.forEach(b => { if (/^\d{2}\.\d{2}$/.test(String(b.code).trim())) bpu[String(b.code).trim()] = b; });
  const salons = {};
  reserves.filter(r => facturable(r, param.exclus)).forEach(r => {
    const l = ligne(r, mots, bpu, param, garde[r.num]);
    (salons[r.ev] = salons[r.ev] || []).push(l);
  });
  const res = {};
  Object.keys(salons).forEach(s => { res[s] = devisSalon(salons[s], param.tva); });
  return res;
}

export const euros = x => x === null || x === undefined || x === '' ? '' :
  Number(x).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ') + ' €';
