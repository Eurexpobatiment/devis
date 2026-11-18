/* Devis réserves – Eurexpo · tableau de bord : état de toutes les réserves de la dernière synchronisation,
 * en graphiques, filtrables (événement, entreprise, lot, hall, état, dates). Sans dépendance : barres en HTML. */
import * as L from './logic.js?v=4';
import * as RAP from './rapport.js?v=10';
import * as OUT from './sortie.js?v=8';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cmpTxt = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { numeric: true, sensitivity: 'base' });

/* États, dans l'ordre d'empilement. La couleur suit l'état, jamais son rang. */
export const ETATS = [
  { lib: 'À corriger', c: '#C8372D' },
  { lib: 'En attente', c: '#E8A21C' },
  { lib: 'Corrigée', c: '#4F6BD8' },
  { lib: 'Validée', c: '#00896E' },
  { lib: 'Abandonnée', c: '#CFCBC7' },
  { lib: 'Autre état', c: '#8A7F9E' }
];
export function classeEtat(etat) {
  const n = L.norm(etat);
  if (n.indexOf('a corriger') === 0) return 0;
  if (n.indexOf('en attente') === 0) return 1;
  if (n.indexOf('corrig') === 0) return 2;
  if (n.indexOf('valid') === 0) return 3;
  if (n.indexOf('abandon') === 0) return 4;
  return 5;
}

/* Filtres proposés (mêmes champs que l'édition de rapport) et graphiques de répartition */
const FILTRES = ['ev', 'entr', 'lot', 'hall', 'etat', 'fact'];
const PANNEAUX = [['ev', 'Par événement'], ['entr', 'Par entreprise'], ['lot', 'Par lot'], ['hall', 'Par hall / zone']];
const MAX_BARRES = 12;

const DB = { sel: {}, lignes: [], mesure: 'n', tout: {}, el: null, hooks: {}, tips: [] };
FILTRES.forEach(k => { DB.sel[k] = new Set(); });
const dim = k => RAP.DIMS.find(d => d.k === k);

const filtre = () => ({ sel: DB.sel, du: RAP.jourIso(q('#d-du').value), au: RAP.jourIso(q('#d-au').value), txt: '' });
const q = s => DB.el.querySelector(s);
const val = l => DB.mesure === 'mt' ? (l.mt === null || l.mt === undefined ? 0 : l.mt) : 1;
const fmt = x => DB.mesure === 'mt' ? L.euros(Math.round(x)).replace(/,00/, '') : String(Math.round(x));
const pct = (a, b) => b ? Math.round(a * 100 / b) + ' %' : '–';

/* ---------- Mise en place (une fois) ---------- */
export function monter(el, hooks) {
  DB.el = el; DB.hooks = hooks || {};
  el.innerHTML =
    '<div class="barre"><div><h2>Dashboard</h2><p class="aide">État de toutes les réserves de la dernière synchronisation BatiScript, tous événements confondus (régie et maintenance comprises). Choisissez un ou plusieurs filtres ; un filtre sans rien de coché prend tout. Un clic sur une barre ou sur un nom filtre le tableau de bord sur cette valeur (second clic : retire le filtre).</p></div>' +
    '<div class="actions"><button class="btn" id="d-raz">Effacer les filtres</button><button class="btn plein" id="d-rapport" title="Ouvre l\'onglet Édition de rapport avec les mêmes filtres, pour voir la liste et l\'éditer en PDF ou Excel">Voir la liste des réserves</button></div></div>' +
    '<div class="filtres"><span id="d-filtres" style="display:contents"></span>' +
    '<label class="lib">Créée du<input type="date" id="d-du"></label><label class="lib">au<input type="date" id="d-au"></label>' +
    '<label class="lib">Mesure<select id="d-mesure"><option value="n">Nombre de réserves</option><option value="mt">Montant HT estimé (BPU)</option></select></label></div>' +
    '<div class="kpis" id="d-kpis"></div><div id="d-corps"></div><div class="d-tip" id="d-tip"></div>';

  q('#d-filtres').addEventListener('change', ev => {
    const t = ev.target, det = t.closest('details'); if (!det || t.type !== 'checkbox') return;
    const s = DB.sel[det.dataset.dim]; if (t.checked) s.add(t.value); else s.delete(t.value);
    etiquette(det); maj();
  });
  q('#d-filtres').addEventListener('input', ev => { if (ev.target.closest('.outils')) chercherDans(ev.target.closest('details')); });
  q('#d-filtres').addEventListener('click', ev => {
    if (ev.target.dataset.rien === undefined) return;
    DB.sel[ev.target.closest('details').dataset.dim].clear(); listes(); maj();
  });
  ['#d-du', '#d-au'].forEach(s => q(s).addEventListener('input', maj));
  q('#d-mesure').addEventListener('change', () => { DB.mesure = q('#d-mesure').value; maj(); });
  q('#d-raz').addEventListener('click', () => { FILTRES.forEach(k => DB.sel[k].clear()); q('#d-du').value = q('#d-au').value = ''; listes(); maj(); });
  q('#d-rapport').addEventListener('click', () => { if (DB.hooks.versRapport) DB.hooks.versRapport(DB.sel, q('#d-du').value, q('#d-au').value); });

  // clic sur une barre, un nom ou une légende : filtre (ou retire le filtre) sur cette valeur
  q('#d-corps').addEventListener('click', ev => {
    const plus = ev.target.closest('[data-tout]');
    if (plus) { DB.tout[plus.dataset.tout] = !DB.tout[plus.dataset.tout]; return maj(); }
    const t = ev.target.closest('[data-k]'); if (!t) return;
    const s = DB.sel[t.dataset.k], vs = JSON.parse(t.dataset.v);
    const tous = vs.every(v => s.has(v));
    vs.forEach(v => { if (tous) s.delete(v); else s.add(v); });
    cacher(); listes(); maj();
  });
  q('#d-corps').addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('[data-k]')) { ev.preventDefault(); ev.target.click(); } });
  // info-bulle
  q('#d-corps').addEventListener('mousemove', ev => {
    const t = ev.target.closest('[data-tip]'); if (!t) return cacher();
    const tip = q('#d-tip'); tip.innerHTML = DB.tips[Number(t.dataset.tip)] || ''; tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(ev.clientX + 14, window.innerWidth - w - 8)) + 'px';
    tip.style.top = (ev.clientY + 16 + h > window.innerHeight ? ev.clientY - h - 10 : ev.clientY + 16) + 'px';
  });
  q('#d-corps').addEventListener('mouseleave', cacher);
}
function cacher() { const t = q('#d-tip'); if (t) t.style.display = 'none'; }

function etiquette(det) {
  const v = [...DB.sel[det.dataset.dim]];
  det.querySelector('summary b').textContent = !v.length ? 'tous' : v.length === 1 ? (v[0].length > 26 ? v[0].slice(0, 25) + '…' : v[0]) : v.length + ' choisis';
  det.classList.toggle('actif', v.length > 0);
}
function chercherDans(det) {
  const i = det.querySelector('.outils input'), f = i ? L.norm(i.value) : '';
  det.querySelectorAll('label').forEach(l => { l.style.display = !f || L.norm(l.textContent).indexOf(f) >= 0 ? '' : 'none'; });
}
// Listes de filtres (les choix, les listes ouvertes et les recherches sont gardés)
function listes() {
  const box = q('#d-filtres');
  const ouverts = [...box.querySelectorAll('details[open]')].map(d => d.dataset.dim);
  const cherche = {}; box.querySelectorAll('.outils input').forEach(i => { cherche[i.closest('details').dataset.dim] = i.value; });
  box.innerHTML = FILTRES.map(k => {
    const d = dim(k), opts = RAP.options(DB.lignes, k), vus = new Set(opts.map(o => o[0]));
    [...DB.sel[k]].forEach(v => { if (!vus.has(v)) DB.sel[k].delete(v); });   // valeur disparue de l'import
    return '<details class="multi" data-dim="' + k + '"' + (ouverts.indexOf(k) >= 0 ? ' open' : '') + '><summary>' + esc(d.lib) + ' <b></b></summary><div class="liste">' +
      '<div class="outils">' + (opts.length > 10 ? '<input placeholder="chercher…" value="' + esc(cherche[k] || '') + '">' : '<span></span>') + '<span class="lien" data-rien>tout décocher</span></div>' +
      opts.map(o => '<label><input type="checkbox" value="' + esc(o[0]) + '"' + (DB.sel[k].has(o[0]) ? ' checked' : '') + '><span>' + esc(o[0]) + '</span><i>' + o[1] + '</i></label>').join('') +
      '</div></details>';
  }).join('');
  box.querySelectorAll('details').forEach(det => { etiquette(det); chercherDans(det); });
}

/* ---------- Données ---------- */
// appelé à chaque changement des réserves, du BPU, des mots-clés ou des paramètres
export function dessiner(lignes) {
  if (!DB.el) return;
  DB.lignes = lignes; listes(); maj();
}

// Répartition par état d'une liste de lignes : [6 valeurs], total
function parEtat(rows) {
  const v = [0, 0, 0, 0, 0, 0]; let t = 0;
  rows.forEach(l => { const x = val(l); v[classeEtat(l.etat)] += x; t += x; });
  return { v, t };
}
// Une barre par valeur du champ k, de la plus chargée à la moins chargée
export function repartition(rows, k) {
  const m = new Map();
  rows.forEach(l => { const g = RAP.valeur(l, k); let a = m.get(g); if (!a) m.set(g, a = []); a.push(l); });
  return [...m.entries()].map(([nom, ls]) => Object.assign({ nom, n: ls.length }, parEtat(ls)))
    .sort((a, b) => (b.t - a.t) || (k === 'hall' ? OUT.cmpHall(a.nom, b.nom) : cmpTxt(a.nom, b.nom)));
}
// Créations dans le temps : par semaine si la période est courte, par mois sinon
export function chronologie(rows) {
  const dates = rows.filter(l => l.jour);
  if (!dates.length) return { pas: '', cols: [], sans: rows.length };
  const d = j => new Date(Math.floor(j / 10000), Math.floor(j / 100) % 100 - 1, j % 100);
  const lundi = x => { const y = new Date(x); y.setDate(y.getDate() - ((y.getDay() + 6) % 7)); return y; };
  const mois = new Set(dates.map(l => Math.floor(l.jour / 100)));
  const parMois = mois.size > 3;
  const cle = l => parMois ? Math.floor(l.jour / 100) : (x => x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate())(lundi(d(l.jour)));
  const m = new Map();
  dates.forEach(l => { const c = cle(l); let a = m.get(c); if (!a) m.set(c, a = []); a.push(l); });
  // périodes vides comprises, pour garder l'échelle du temps
  const cles = [...m.keys()].sort((a, b) => a - b), out = [];
  if (parMois) {
    for (let c = cles[0]; c <= cles[cles.length - 1] && out.length < 60; c = c % 100 === 12 ? (Math.floor(c / 100) + 1) * 100 + 1 : c + 1) out.push(c);
  } else {
    const fin = d(cles[cles.length - 1]);
    for (let x = d(cles[0]); x <= fin && out.length < 60; x.setDate(x.getDate() + 7)) out.push(x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate());
  }
  const lib = c => parMois
    ? new Date(Math.floor(c / 100), c % 100 - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    : d(c).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return { pas: parMois ? 'mois' : 'semaine', sans: rows.length - dates.length,
    cols: out.map(c => Object.assign({ lib: lib(c), n: (m.get(c) || []).length }, parEtat(m.get(c) || []))) };
}

/* ---------- Affichage ---------- */
const segments = e => e.v.map((x, i) => x > 0 ? '<i style="flex:' + x + ' 1 0;background:' + ETATS[i].c + '"></i>' : '').join('');
function bulle(titre, e, n) {
  DB.tips.push('<b>' + esc(titre) + '</b>' + e.v.map((x, i) => x > 0
    ? '<div><span class="d-pt" style="background:' + ETATS[i].c + '"></span>' + ETATS[i].lib + '<em>' + fmt(x) + ' · ' + pct(x, e.t) + '</em></div>' : '').join('') +
    '<div class="tot">Total<em>' + fmt(e.t) + (DB.mesure === 'mt' ? ' · ' + n + ' réserve' + (n > 1 ? 's' : '') : '') + '</em></div>');
  return DB.tips.length - 1;
}
const attr = (k, vs) => ' data-k="' + k + '" data-v="' + esc(JSON.stringify(vs)) + '" role="button" tabindex="0"';

function maj() {
  const rows = RAP.filtrer(DB.lignes, filtre());
  DB.tips = [];
  const E = parEtat(rows);
  const nb = [0, 0, 0, 0, 0, 0]; let ht = 0;
  rows.forEach(l => { nb[classeEtat(l.etat)]++; if (l.mt !== null && l.mt !== undefined) ht += l.mt; });
  const actives = rows.length - nb[4], levees = nb[2] + nb[3];
  const kpi = (v, lib, c) => '<div class="kpi"' + (c ? ' style="border-left-color:' + c + '"' : '') + '><div class="val">' + v + '</div><div class="lib">' + lib + '</div></div>';
  q('#d-kpis').innerHTML =
    kpi(rows.length, 'réserve(s) sur ' + DB.lignes.length) +
    kpi(nb[0], 'à corriger', ETATS[0].c) +
    kpi(nb[1], 'en attente', ETATS[1].c) +
    kpi(levees, 'corrigée(s) ou validée(s)', ETATS[3].c) +
    kpi(pct(levees, actives), 'taux de levée (hors abandonnées)') +
    kpi(L.euros(L.arrondi(ht)), 'montant HT estimé (BPU)');

  if (!rows.length) {
    q('#d-corps').innerHTML = '<div class="vide">' + (DB.lignes.length ? 'Aucune réserve ne correspond à ces filtres.' : 'Aucune réserve : lancez une synchronisation BatiScript (onglet Devis).') + '</div>';
    return;
  }

  // valeurs réelles de chaque état (pour filtrer d'un clic sur la légende)
  const reels = ETATS.map(() => new Set());
  DB.lignes.forEach(l => reels[classeEtat(l.etat)].add(RAP.valeur(l, 'etat')));
  const legende = '<div class="d-leg">' + ETATS.map((e, i) => E.v[i] > 0 || nb[i] > 0
    ? '<span class="' + ([...reels[i]].some(v => DB.sel.etat.has(v)) ? 'choisi' : '') + '"' + attr('etat', [...reels[i]]) + ' title="Filtrer sur cet état"><span class="d-pt" style="background:' + e.c + '"></span>' + e.lib + ' <b>' + fmt(E.v[i]) + '</b> <em>' + pct(E.v[i], E.t) + '</em></span>' : '').join('') + '</div>';

  const h = [];
  h.push('<div class="d-carte"><h3>État des réserves <small>' + (DB.mesure === 'mt' ? 'montant HT estimé' : 'nombre de réserves') + '</small></h3>' +
    '<div class="d-bar gros" data-tip="' + bulle('Sélection', E, rows.length) + '">' + segments(E) + '</div>' + legende + '</div>');

  h.push('<div class="d-grille">');
  PANNEAUX.forEach(([k, titre]) => {
    const R = repartition(rows, k), max = R.length ? R[0].t : 0;
    const vus = DB.tout[k] ? R : R.slice(0, MAX_BARRES);
    h.push('<div class="d-carte"><h3>' + titre + ' <small>' + R.length + ' valeur' + (R.length > 1 ? 's' : '') + '</small></h3>' +
      vus.map(r => '<div class="d-ligne' + (DB.sel[k].has(r.nom) ? ' choisi' : '') + '"' + attr(k, [r.nom]) + ' data-tip="' + bulle(r.nom, r, r.n) + '">' +
        '<span class="nom">' + esc(r.nom) + '</span>' +
        '<span class="piste"><span class="d-bar" style="width:' + (max ? Math.max(r.t > 0 ? 1 : 0, r.t * 100 / max) : 0) + '%">' + segments(r) + '</span></span>' +
        '<span class="tot">' + fmt(r.t) + '</span></div>').join('') +
      (R.length > MAX_BARRES ? '<span class="lien" data-tout="' + k + '">' + (DB.tout[k] ? 'Réduire aux ' + MAX_BARRES + ' premières' : 'Afficher les ' + R.length + ' valeurs') + '</span>' : '') +
      '</div>');
  });
  h.push('</div>');

  const T = chronologie(rows);
  if (T.cols.length) {
    const max = Math.max.apply(null, T.cols.map(c => c.t)) || 1, peu = T.cols.length <= 16;
    h.push('<div class="d-carte"><h3>Réserves créées par ' + T.pas + ' <small>' + (DB.mesure === 'mt' ? 'montant HT estimé' : 'nombre de réserves') + (T.pas === 'semaine' ? ' · semaine du lundi indiqué' : '') + '</small></h3>' +
      '<div class="d-temps">' + T.cols.map((c, i) => '<div class="col" data-tip="' + bulle((T.pas === 'semaine' ? 'Semaine du ' : '') + c.lib, c, c.n) + '">' +
        '<span class="v">' + (c.t > 0 && (peu || c.t === max) ? fmt(c.t) : '') + '</span>' +
        '<span class="pile" style="height:' + (c.t * 100 / max) + '%">' + c.v.map((x, j) => x > 0 ? '<i style="flex:' + x + ' 1 0;background:' + ETATS[j].c + '"></i>' : '').join('') + '</span>' +
        '<span class="x">' + (peu || i % Math.ceil(T.cols.length / 12) === 0 ? esc(c.lib) : '') + '</span></div>').join('') + '</div>' +
      (T.sans ? '<p class="aide" style="margin-top:8px">' + T.sans + ' réserve(s) sans date de création ne figurent pas sur ce graphique.</p>' : '') + '</div>');
  }
  q('#d-corps').innerHTML = h.join('');
}
