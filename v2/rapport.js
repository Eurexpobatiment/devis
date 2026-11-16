/* Devis réserves – Eurexpo · édition de rapport : toutes les réserves de la dernière synchronisation,
 * filtrées (événement, hall, zone, lot, état, entreprise, article BPU, dates, texte), regroupées, puis sorties en PDF ou Excel. */
import * as L from './logic.js?v=4';
import * as OUT from './sortie.js?v=8';

const C = OUT.C;
const cmpTxt = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { numeric: true, sensitivity: 'base' });

/* Filtres à choix multiples (k : champ de la ligne ; vide : libellé quand le champ n'est pas rempli) */
export const DIMS = [
  { k: 'ev', lib: 'Événement', vide: '(sans événement)' },
  { k: 'hall', lib: 'Hall' },
  { k: 'plan', lib: 'Zone / plan', vide: '(sans zone)' },
  { k: 'emp', lib: 'Emplacement', vide: '(sans emplacement)' },
  { k: 'lot', lib: 'Lot', vide: '(sans lot)' },
  { k: 'etat', lib: 'État', vide: '(sans état)' },
  { k: 'entr', lib: 'Entreprise', vide: '(sans entreprise)' },
  { k: 'art', lib: 'Article BPU' },
  { k: 'fact', lib: 'Facturable au salon' }
];
const DIM = k => DIMS.find(d => d.k === k);
export const valeur = (l, k) => { const d = DIM(k); return l[k] || (d && d.vide) || ''; };

/* Colonnes du rapport (w : largeur relative dans le PDF ; xl : largeur Excel) */
export const COLS = [
  { k: 'num', lib: 'N°', w: 36, xl: 8, al: 'center' },
  { k: 'ev', lib: 'Événement', w: 78, xl: 22 },
  { k: 'plan', lib: 'Hall / zone', w: 70, xl: 20 },
  { k: 'emp', lib: 'Emplacement', w: 70, xl: 20 },
  { k: 'lot', lib: 'Lot', w: 70, xl: 20 },
  { k: 'constat', lib: 'Constat', w: 110, xl: 28 },
  { k: 'obs', lib: 'Observations', w: 130, xl: 34 },
  { k: 'etat', lib: 'État', w: 48, xl: 12, al: 'center' },
  { k: 'cre', lib: 'Création', w: 60, xl: 12, al: 'center' },
  { k: 'entr', lib: 'Entreprise', w: 70, xl: 20 },
  { k: 'code', lib: 'Code BPU', w: 34, xl: 9, al: 'center' },
  { k: 'des', lib: 'Désignation', w: 130, xl: 36 },
  { k: 'unite', lib: 'Unité', w: 34, xl: 7, al: 'center' },
  { k: 'qte', lib: 'Qté', w: 26, xl: 6, al: 'center' },
  { k: 'pu', lib: 'PU HT', w: 52, xl: 12, al: 'right', eur: true },
  { k: 'mt', lib: 'Montant HT', w: 60, xl: 14, al: 'right', eur: true }
];
export const COLS_DEF = ['num', 'ev', 'plan', 'emp', 'lot', 'constat', 'obs', 'etat', 'des', 'qte', 'mt'];

/* Regroupements proposés */
export const GROUPES = [['', 'Aucun'], ['ev', 'Événement'], ['hall', 'Hall'], ['plan', 'Zone / plan'], ['emp', 'Emplacement'], ['lot', 'Lot'], ['etat', 'État'], ['entr', 'Entreprise'], ['art', 'Article BPU']];

// « 16/11/2026 » → 20261116 (0 si la date n'est pas lisible)
export function jour(t) {
  const m = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(String(t || ''));
  if (!m) return 0;
  const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return a * 10000 + Number(m[2]) * 100 + Number(m[1]);
}
// champ <input type="date"> « 2026-11-16 » → 20261116
export const jourIso = t => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(t || '')); return m ? Number(m[1] + m[2] + m[3]) : 0; };

/* Une ligne par réserve (toutes, même hors devis), avec le classement BPU et les prix du devis */
export function lignes(reserves, mots, bpuListe, param) {
  const bpu = {};
  bpuListe.forEach(b => { if (/^\d{2}\.\d{2}$/.test(String(b.code).trim())) bpu[String(b.code).trim()] = b; });
  return reserves.map(r => {
    const l = L.ligne(r, mots, bpu, param, { force: r.force, qte: r.qte, puForce: r.puForce });
    l.ev = r.ev || ''; l.entr = r.entr || ''; l.emp = r.emp || ''; l.plan = r.plan || ''; l.lot = r.lot || ''; l.etat = r.etat || ''; l.cre = r.cre || '';
    l.hall = OUT.groupeHall(r.plan);
    l.fact = L.facturable(r, param.exclus) ? 'Oui' : 'Non';
    l.art = l.connu ? l.code + ' – ' + l.des : 'Non classé';
    l.jour = jour(r.cre);
    return l;
  });
}

// Valeurs d'un filtre, avec le nombre de réserves : [[valeur, n], …] dans l'ordre d'affichage
export function options(lignes, k) {
  const n = new Map();
  lignes.forEach(l => { const v = valeur(l, k); n.set(v, (n.get(v) || 0) + 1); });
  const cmp = k === 'hall' || k === 'plan' ? OUT.cmpHall : cmpTxt;
  return [...n.entries()].sort((a, b) => cmp(a[0], b[0]));
}

/* F : { sel: { k: Set de valeurs (vide = tout) }, du, au (20261116 ou 0), txt } */
export function filtrer(lignes, F) {
  const dims = DIMS.filter(d => F.sel[d.k] && F.sel[d.k].size);
  const mots = L.norm(F.txt).split(' ').filter(Boolean);
  return lignes.filter(l => {
    for (const d of dims) if (!F.sel[d.k].has(valeur(l, d.k))) return false;
    if (F.du && !(l.jour && l.jour >= F.du)) return false;
    if (F.au && !(l.jour && l.jour <= F.au)) return false;
    if (mots.length) {
      const t = L.norm([l.num, l.constat, l.obs, l.des, l.code, l.ev, l.plan, l.emp, l.lot, l.entr].join(' '));
      if (!mots.every(m => t.indexOf(m) >= 0)) return false;
    }
    return true;
  });
}

// Lignes rangées par hall puis n°, découpées selon le regroupement : [{ nom, lignes, n, ht }]
export function grouper(lignes, k) {
  let rows = OUT.parHall(lignes);
  // tri stable : l'ordre des halls est gardé à l'intérieur de chaque groupe (sans regroupement : par événement)
  if (k !== 'hall' && k !== 'plan') rows.sort((a, b) => (k ? cmpTxt(valeur(a, k), valeur(b, k)) : 0) || cmpTxt(a.ev, b.ev));
  const out = [];
  rows.forEach(l => {
    const g = k ? valeur(l, k) : '';
    let G = out[out.length - 1];
    if (!G || G.nom !== g) out.push(G = { nom: g, lignes: [], n: 0, ht: 0 });
    G.lignes.push(l); G.n++; if (l.mt !== null && l.mt !== undefined) G.ht += l.mt;
  });
  out.forEach(G => { G.ht = L.arrondi(G.ht); });
  return out;
}

// Rappel des filtres en clair, pour l'en-tête du rapport
export function resume(F) {
  const out = [];
  DIMS.forEach(d => {
    const s = F.sel[d.k]; if (!s || !s.size) return;
    const v = [...s].sort(d.k === 'hall' || d.k === 'plan' ? OUT.cmpHall : cmpTxt);
    out.push(d.lib + ' : ' + (v.length > 6 ? v.slice(0, 6).join(', ') + '… (' + v.length + ' valeurs)' : v.join(', ')));
  });
  const fr = j => j ? String(j).replace(/^(\d{4})(\d\d)(\d\d)$/, '$3/$2/$1') : '';
  if (F.du || F.au) out.push('Création : ' + (F.du ? 'du ' + fr(F.du) : '') + (F.du && F.au ? ' ' : '') + (F.au ? 'au ' + fr(F.au) : ''));
  if (L.norm(F.txt)) out.push('Recherche : « ' + String(F.txt).trim() + ' »');
  return out;
}

/* Rapport prêt à sortir. o : { titre, sous (sous-titre), garde (page de garde, oui par défaut), groupe, cols: [clés], source } */
export function rapport(lignesFiltrees, F, o) {
  const G = grouper(lignesFiltrees, o.groupe);
  const cols = COLS.filter(c => o.cols.indexOf(c.k) >= 0);
  let ht = 0; lignesFiltrees.forEach(l => { if (l.mt !== null && l.mt !== undefined) ht += l.mt; });
  return { titre: String(o.titre || '').trim() || 'Rapport des réserves', sous: String(o.sous || '').trim(), garde: o.garde !== false, filtres: resume(F), groupes: G, cols, n: lignesFiltrees.length, ht: L.arrondi(ht),
    groupeLib: o.groupe ? (GROUPES.find(g => g[0] === o.groupe) || [])[1] : '', avecMt: cols.some(c => c.k === 'mt'), source: o.source || '', plans: [], photos: [] };
}

export const nomFichier = (R, ext) => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return R.titre.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() + ' - ' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.' + ext;
};

// Texte d'une cellule (écran, PDF) ; Excel garde les nombres
export function texte(l, c) {
  if (c.k === 'des') return l.connu ? (l.des || '') : 'Non classé';
  if (c.k === 'code') return l.connu ? l.code : '';
  if (c.k === 'qte') return String(l.qte).replace('.', ',');
  if (c.eur) return l[c.k] === null || l[c.k] === undefined ? '' : L.euros(l[c.k]);
  return String(l[c.k] == null ? '' : l[c.k]);
}
const titreGroupe = (R, G) => (G.nom || '—') + '  ·  ' + G.n + ' réserve' + (G.n > 1 ? 's' : '') + (R.avecMt ? '  ·  ' + L.euros(G.ht) + ' HT' : '');
const bilan = R => R.n + ' réserve' + (R.n > 1 ? 's' : '') + (R.avecMt ? ' · ' + L.euros(R.ht) + ' HT' : '');

/* ---------- PDF ---------- */
/* Organisation : page de garde (au choix), en-tête et synthèse, puis le détail.
 * Sans photo ni plan : un seul tableau, avec une ligne de titre par groupe.
 * Avec photos ou plans : une partie par groupe (par hall, par défaut), dans cet ordre : réserves, photos, plans.
 * Un plan est rangé dans la partie de ses réserves ; s'il porte des réserves de plusieurs groupes, il va à la fin. */
export async function pdf(R) {
  const pm = await OUT.pdfmake();
  const [logo, photo] = await Promise.all([OUT.image('logo.png'), R.garde ? OUT.image('Agenda_EurexpoLyon.jpg') : null]);
  const W = 841.89, H = 595.28;
  const edite = new Date().toLocaleDateString('fr-FR');
  const nb = R.cols.length;
  const g0 = R.garde ? 1 : 0;   // pages avant le rapport lui-même
  const ligneOr = () => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 205, y2: 0, lineWidth: 1.5, lineColor: C.accent }], margin: [0, 2, 0, 8] });
  const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');

  const garde = R.garde ? [
    { text: 'CENTRE DE CONGRÈS DE LYON\nEUREXPO LYON\nLA SUCRIÈRE\nMATMUT STADIUM', absolutePosition: { x: 560, y: 78 },
      width: 236, alignment: 'right', fontSize: 6.5, color: C.fonce, lineHeight: 1.15 },
    { image: logo, width: 145, absolutePosition: { x: 30, y: 128 } },
    { text: 'HOME OF\nEXCELLENCE', absolutePosition: { x: 32, y: 222 }, fontSize: 21, color: C.fonce, lineHeight: 1.05 },
    { image: photo, width: 285, height: 187, absolutePosition: { x: 374, y: 120 } },
    { stack: [
      { text: R.titre, bold: true, fontSize: R.titre.length > 60 ? 14 : 18, color: C.fonce },
      R.sous ? { text: R.sous, bold: true, fontSize: 13, color: C.fonce, margin: [0, 4, 0, 0] } : {},
      { text: 'Réserves BatiScript · ' + edite, fontSize: 10, color: C.fonce, margin: [0, 14, 0, 0] },
      { text: bilan(R), fontSize: 9, color: C.fonce, margin: [0, 12, 0, 0] }
    ], alignment: 'right', absolutePosition: { x: 400, y: 356 }, width: 396 },
    { text: 'Édité le ' + edite + ' – GL events Lyon', italics: true, fontSize: 7, color: C.texte, absolutePosition: { x: 30, y: 524 } },
    { text: '', pageBreak: 'after' }
  ] : [];

  const entete = {
    columns: [
      { width: '*', stack: [
        { text: R.titre, bold: true, fontSize: 18, color: C.fonce },
        { text: (R.sous ? R.sous + ' · ' : '') + 'Réserves BatiScript · ' + bilan(R), fontSize: 10, color: C.texte, margin: [0, 4, 0, 2] },
        ligneOr(),
        R.filtres.length ? { stack: R.filtres.map(t => ({ text: t })), fontSize: 8.5 } : { text: 'Toutes les réserves (aucun filtre).', fontSize: 8.5 }
      ] },
      { width: 230, stack: [
        { image: logo, width: 110, alignment: 'right' },
        { text: OUT.EMETTEUR + '\n' + OUT.SITES, fontSize: 7, alignment: 'right', color: C.texte, margin: [0, 6, 0, 0] }
      ] }
    ],
    margin: [0, 0, 0, 10]
  };

  const petit = nb > 11;   // beaucoup de colonnes : texte un peu plus petit
  const th = t => ({ text: t, bold: true, color: '#FFFFFF', fillColor: C.fonce, alignment: 'center', fontSize: petit ? 7 : 8 });
  const contenu = garde.concat([entete]);

  // Synthèse par groupe
  const synthese = !!(R.groupeLib && R.groupes.length > 1);
  if (synthese) {
    const s = [[th(R.groupeLib), th('Réserves')].concat(R.avecMt ? [th('Montant HT')] : [])];
    R.groupes.forEach(G => s.push([G.nom || '—', { text: String(G.n), alignment: 'center' }].concat(R.avecMt ? [{ text: L.euros(G.ht), alignment: 'right' }] : [])));
    s.push([{ text: 'Total', bold: true, color: C.fonce }, { text: String(R.n), bold: true, alignment: 'center', color: C.fonce }]
      .concat(R.avecMt ? [{ text: L.euros(R.ht), bold: true, alignment: 'right', color: C.fonce }] : []));
    contenu.push({ text: 'Synthèse par ' + R.groupeLib.toLowerCase(), bold: true, fontSize: 11, color: C.fonce, margin: [0, 2, 0, 5] });
    contenu.push({ table: { headerRows: 1, dontBreakRows: true, widths: [250, 55].concat(R.avecMt ? [80] : []), body: s },
      layout: { fillColor: i => i > 0 && i % 2 === 0 ? C.clair : null, hLineWidth: i => i === 0 ? 0 : 0.4, vLineWidth: () => 0, hLineColor: () => '#E7E5E4', paddingTop: () => 3, paddingBottom: () => 3 },
      margin: [0, 0, 0, 14] });
  }
  const notes = [];
  if (R.avecMt) notes.push({ text: 'Montants HT estimés avec le bordereau de prix (BPU) remise en état après salon ; les réserves non classées ou sans prix ne sont pas chiffrées.', fontSize: 7.5, italics: true });
  notes.push({ text: 'Réserves relevées dans BatiScript' + (R.source ? ' – ' + R.source : '') + '. Édité le ' + edite + '.', fontSize: 7.5, italics: true });

  // Tableau des réserves d'une liste de groupes (titres : une ligne de titre par groupe ; total : ligne de total général)
  const dispo = W - 40 - 24 - nb * 6 - 2, somme = R.cols.reduce((n, c) => n + c.w, 0);
  const widths = R.cols.map(c => Math.floor(c.w * dispo / somme * 10) / 10);
  function tableau(groupes, titres, total) {
    const corps = [R.cols.map(c => th(c.lib))], speciales = [];
    groupes.forEach(G => {
      if (titres) {
        speciales.push(corps.length);
        corps.push([{ text: titreGroupe(R, G), colSpan: nb, bold: true, color: C.fonce, fillColor: '#E6F6F2' }].concat(Array(nb - 1).fill('')));
      }
      G.lignes.forEach(l => corps.push(R.cols.map(c => {
        const o = { text: texte(l, c), alignment: c.al || 'left' };
        if (c.k === 'des' && !l.connu) { o.color = C.alerte; o.bold = true; }
        return o;
      })));
    });
    if (total && R.avecMt && nb > 1) {
      const f = { bold: true, color: C.fonce, fillColor: '#E6F6F2' };
      const n = groupes.reduce((x, G) => x + G.n, 0), ht = L.arrondi(groupes.reduce((x, G) => x + G.ht, 0));
      speciales.push(corps.length);
      const i = R.cols.findIndex(c => c.k === 'mt');
      const ligne = R.cols.map(() => Object.assign({ text: '' }, f));
      if (i > 0) { ligne[0] = Object.assign({ text: total + ' (' + pluriel(n, 'réserve') + ')', colSpan: i, alignment: 'right' }, f); for (let j = 1; j < i; j++) ligne[j] = ''; }
      ligne[i] = Object.assign({ text: L.euros(ht), alignment: 'right' }, f);
      corps.push(ligne);
    }
    let k = 0; const zebre = corps.map((r, i) => i === 0 || speciales.indexOf(i) >= 0 ? (k = 0, false) : (++k % 2 === 0));
    return { fontSize: petit ? 7 : 8, table: { headerRows: 1, dontBreakRows: true, widths, body: corps },
      layout: { fillColor: i => zebre[i] ? C.clair : null, hLineWidth: i => i === 0 ? 0 : 0.4, vLineWidth: () => 0, hLineColor: () => '#E7E5E4',
        paddingTop: () => 3.5, paddingBottom: () => 3.5, paddingLeft: () => 3, paddingRight: () => 3 } };
  }
  // Photos (4 par rangée) ; le titre reste avec la première rangée et se répète en haut des pages suivantes
  const parNum = {}, groupeDe = {};
  R.groupes.forEach((G, i) => G.lignes.forEach(l => { parNum[String(l.num)] = l; groupeDe[String(l.num)] = i; }));
  function grillePhotos(photos, titre) {
    // photos au plus grand : toute la largeur de la case, 2 rangées par page ; cases serrées (2 pt de marge de chaque côté)
    const PAR = 4, LARG = Math.floor((W - 64) / PAR) - 4, cases = photos.map(p => {
      const l = parNum[p.num] || {};
      return { stack: [
        { image: p.img, fit: [LARG, 205], alignment: 'center' },
        { text: [{ text: 'N° ' + p.num + (p.n > 1 ? ' (' + (p.i + 1) + '/' + p.n + ')' : ''), bold: true, color: C.fonce }, { text: l.plan ? '  ·  ' + l.plan : '' }], fontSize: 7.5, margin: [0, 3, 0, 0] },
        { text: [l.constat, l.emp].filter(Boolean).join(' · '), fontSize: 7, color: C.gris }
      ], margin: [0, 0, 0, 6] };
    });
    const rangs = [[{ text: [{ text: titre, bold: true, fontSize: 11, color: C.fonce }, { text: '   ' + pluriel(photos.length, 'photo'), fontSize: 8, color: C.gris }], colSpan: PAR, margin: [0, 0, 0, 4] }, '', '', '']];
    for (let i = 0; i < cases.length; i += PAR) { const r = cases.slice(i, i + PAR); while (r.length < PAR) r.push(''); rangs.push(r); }
    return { table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths: ['*', '*', '*', '*'], body: rangs },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 2, paddingBottom: () => 2 }, margin: [0, 14, 0, 0] };
  }
  // Plan : une page par plan (R.plans : [{ nom, img, w, h, nums }])
  function pagePlan(P, rappel) {
    const portrait = P.h > P.w * 1.15;
    return [
      { pageBreak: 'before', pageOrientation: portrait ? 'portrait' : 'landscape', columns: [
        { width: '*', text: [{ text: 'Plan des réserves', bold: true, fontSize: 13, color: C.fonce }, { text: '   ' + P.nom, fontSize: 11, color: C.texte }] },
        { width: 'auto', text: pluriel(P.nums.length, 'réserve') + ' · ' + rappel, fontSize: 8, color: C.gris, margin: [0, 5, 0, 0] }
      ] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 205, y2: 0, lineWidth: 1.5, lineColor: C.accent }], margin: [0, 3, 0, 8] },
      { image: P.img, fit: portrait ? [H - 64, W - 58 - 40] : [W - 64, H - 58 - 40], alignment: 'center' }
    ];
  }

  const photos = R.photos || [], plans = (R.plans || []).slice().sort((a, b) => OUT.cmpHall(a.nom, b.nom));
  if (!photos.length && !plans.length) {
    // rapport simple : un seul tableau
    if (synthese) contenu.push({ text: 'Détail des réserves', bold: true, fontSize: 11, color: C.fonce, margin: [0, 0, 0, 5] });
    contenu.push(tableau(R.groupes, !!R.groupeLib, 'Total'));
    contenu.push({ stack: notes, margin: [0, 12, 0, 0] });
  } else {
    // une partie par groupe : réserves, photos, plans
    contenu.push({ stack: notes, margin: [0, synthese ? 0 : 4, 0, 0] });
    const plansDe = R.groupes.map(() => []), plansFin = [];
    plans.forEach(P => {
      const gs = [...new Set(P.nums.map(n => groupeDe[String(n)]).filter(i => i !== undefined))];
      if (gs.length === 1) plansDe[gs[0]].push(P); else plansFin.push(P);
    });
    R.groupes.forEach((G, i) => {
      const nom = R.groupeLib ? (G.nom || '—') : 'Détail des réserves';
      contenu.push({ pageBreak: 'before', pageOrientation: 'landscape', columns: [
        { width: '*', text: nom, bold: true, fontSize: 15, color: C.fonce },
        { width: 'auto', text: pluriel(G.n, 'réserve') + (R.avecMt ? ' · ' + L.euros(G.ht) + ' HT' : '') + ' · ' + R.titre, fontSize: 8, color: C.gris, margin: [0, 7, 0, 0] }
      ] });
      contenu.push(ligneOr());
      contenu.push(tableau([G], false, R.avecMt ? 'Total ' + (R.groupeLib ? G.nom || '' : '').trim() : ''));
      const ph = photos.filter(p => groupeDe[p.num] === i);
      if (ph.length) contenu.push(grillePhotos(ph, 'Photos' + (R.groupeLib ? ' – ' + (G.nom || '—') : '')));
      plansDe[i].forEach(P => contenu.push(...pagePlan(P, nom)));
    });
    plansFin.forEach(P => contenu.push(...pagePlan(P, R.titre)));
  }

  const doc = {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [40, 28, 24, 30],
    info: { title: R.titre, author: OUT.EMETTEUR },
    defaultStyle: { fontSize: 8, color: C.texte, lineHeight: 1.1 },
    background: (page, taille) => g0 && page === 1
      ? { canvas: [
          { type: 'rect', x: 0, y: 0, w: 374, h: H, color: C.clair },
          { type: 'rect', x: 374, y: 0, w: W - 374, h: H, color: C.vert },
          { type: 'rect', x: 233, y: 116, w: 141, h: 195, color: C.fonce }
        ] }
      : { canvas: [{ type: 'rect', x: 0, y: 0, w: 12, h: taille && taille.height ? taille.height : H, color: C.vert }] },
    footer: (page, n) => g0 && page === 1 ? null : { columns: [
      { text: R.titre + ' – ' + OUT.EMETTEUR, fontSize: 7, color: C.gris },
      { text: 'Page ' + (page - g0) + ' / ' + (n - g0), fontSize: 7, color: C.gris, alignment: 'right' }
    ], margin: [40, 8, 24, 0] },
    content: contenu
  };
  return new Promise((ok, ko) => { try { pm.createPdf(doc).getBlob(ok); } catch (e) { ko(e); } });
}

/* ---------- Excel ---------- */
const argb = h => 'FF' + h.replace('#', '').toUpperCase();
const colXl = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
const hauteur = (t, wch) => String(t == null ? '' : t).split('\n').reduce((n, p) => n + Math.max(1, Math.ceil(p.length / (wch * 1.1))), 0);

export async function excel(R) {
  const EJ = await OUT.exceljs();
  const logo = await OUT.image('logo.png');
  const dim = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok({ w: 3, h: 1 }); i.src = logo; });
  const amp = t => String(t || '').replace(/&/g, '&&');
  const nb = R.cols.length, der = colXl(nb);
  const wb = new EJ.Workbook(); wb.creator = OUT.EMETTEUR;
  const ws = wb.addWorksheet('Rapport', {
    properties: { tabColor: { argb: argb(C.vert) } },
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 } },
    headerFooter: { oddFooter: '&L&8' + amp(R.titre) + '&R&8Page &P / &N' }
  });
  ws.columns = R.cols.map(c => ({ width: c.xl }));
  const F = o => Object.assign({ name: 'Arial', size: 9, color: { argb: argb(C.texte) } }, o);
  const fond = h => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(h) } });
  const EUR = '#,##0.00 "€"';
  const trait = { style: 'thin', color: { argb: 'FFE7E5E4' } };

  ws.getCell('A1').value = R.titre; ws.getCell('A1').font = F({ size: 18, bold: true, color: { argb: argb(C.fonce) } });
  ws.getRow(1).height = 28;
  ws.getCell('A2').value = 'Réserves BatiScript · ' + bilan(R) + ' · édité le ' + new Date().toLocaleDateString('fr-FR'); ws.getCell('A2').font = F({ size: 10 });
  let r = 3;
  (R.filtres.length ? R.filtres : ['Toutes les réserves (aucun filtre).']).forEach(t => { ws.getCell('A' + r).value = t; ws.getCell('A' + r).font = F({ size: 8.5 }); r++; });
  if (R.source) { ws.getCell('A' + r).value = 'Source : ' + R.source; ws.getCell('A' + r).font = F({ size: 7.5, italic: true }); r++; }
  const largeur = R.cols.reduce((n, c) => n + c.xl, 0) * 7.2, lw = 140;
  let x = 0, col = 0; while (col < nb && x + R.cols[col].xl * 7.2 < largeur - lw - 6) { x += R.cols[col].xl * 7.2; col++; }
  if (nb > 3) ws.addImage(wb.addImage({ base64: logo, extension: 'png' }), { tl: { col: Math.min(col + 0.2, nb - 0.5), row: 0.15 }, ext: { width: lw, height: lw * dim.h / dim.w } });

  const hr = r + 1;
  const th = ws.getRow(hr);
  th.values = R.cols.map(c => c.lib); th.height = 24;
  th.eachCell(c => { c.fill = fond(C.fonce); c.font = F({ bold: true, color: { argb: 'FFFFFFFF' } }); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  r = hr; let k = 0;
  const iMt = R.cols.findIndex(c => c.k === 'mt');
  R.groupes.forEach(G => {
    if (R.groupeLib) {
      r++; k = 0;
      if (nb > 1) ws.mergeCells('A' + r + ':' + der + r);
      const c = ws.getCell('A' + r);
      c.value = titreGroupe(R, G); c.fill = fond('#E6F6F2'); c.font = F({ bold: true, color: { argb: argb(C.fonce) } });
      c.alignment = { vertical: 'middle' }; ws.getRow(r).height = 17;
    }
    G.lignes.forEach(l => {
      r++; k++;
      const row = ws.getRow(r);
      row.values = R.cols.map(c => {
        if (c.k === 'num') { const n = Number(l.num); return isNaN(n) || l.num === '' ? l.num : n; }
        if (c.k === 'qte') return l.qte;
        if (c.eur) return l[c.k] === null || l[c.k] === undefined ? null : L.arrondi(l[c.k]);
        return texte(l, c);
      });
      let h = 1;
      R.cols.forEach((c, i) => {
        const cel = row.getCell(i + 1);
        cel.font = c.k === 'des' && !l.connu ? F({ bold: true, color: { argb: argb(C.alerte) } }) : F();
        cel.border = { bottom: trait };
        cel.alignment = { vertical: 'middle', wrapText: true, horizontal: c.al || 'left' };
        if (c.eur) cel.numFmt = EUR;
        if (k % 2 === 0) cel.fill = fond(C.clair);
        if (!c.eur && typeof cel.value === 'string') h = Math.max(h, hauteur(cel.value, c.xl));
      });
      row.height = Math.max(16, 3 + 11.5 * h);
    });
  });
  const fin = r;
  if (!R.groupeLib && fin > hr) ws.autoFilter = 'A' + hr + ':' + der + fin;
  ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
  ws.pageSetup.printTitlesRow = hr + ':' + hr;
  if (R.avecMt && fin > hr) {
    r++;
    const row = ws.getRow(r), cm = colXl(iMt + 1);
    if (iMt > 0) { if (iMt > 1) ws.mergeCells('A' + r + ':' + colXl(iMt) + r); row.getCell(1).value = 'Total (' + R.n + ' réserve' + (R.n > 1 ? 's' : '') + ')'; row.getCell(1).alignment = { horizontal: 'right' }; }
    row.getCell(iMt + 1).value = { formula: 'SUM(' + cm + (hr + 1) + ':' + cm + fin + ')', result: R.ht };
    row.getCell(iMt + 1).numFmt = EUR; row.getCell(iMt + 1).alignment = { horizontal: 'right' };
    for (let i = 1; i <= nb; i++) { row.getCell(i).fill = fond('#E6F6F2'); row.getCell(i).font = F({ bold: true, color: { argb: argb(C.fonce) } }); }
    row.height = 17;
  }

  // Synthèse par groupe (2e onglet)
  if (R.groupeLib) {
    const rc = wb.addWorksheet('Synthèse', { properties: { tabColor: { argb: argb(C.fonce) } }, views: [{ showGridLines: false }] });
    rc.columns = [{ width: 44 }, { width: 12 }, { width: 16 }];
    rc.getCell('A1').value = 'Synthèse par ' + R.groupeLib.toLowerCase() + ' – ' + R.titre;
    rc.getCell('A1').font = F({ size: 13, bold: true, color: { argb: argb(C.fonce) } });
    const h = rc.getRow(3); h.values = [R.groupeLib, 'Réserves'].concat(R.avecMt ? ['Montant HT'] : []);
    h.eachCell(c => { c.fill = fond(C.fonce); c.font = F({ bold: true, color: { argb: 'FFFFFFFF' } }); c.alignment = { horizontal: 'center' }; });
    let y = 3;
    R.groupes.forEach((G, i) => {
      y++; const row = rc.getRow(y); row.values = [G.nom || '—', G.n].concat(R.avecMt ? [G.ht] : []);
      row.eachCell(c => { c.font = F(); c.border = { bottom: trait }; if (i % 2) c.fill = fond(C.clair); });
      row.getCell(2).alignment = { horizontal: 'center' }; if (R.avecMt) row.getCell(3).numFmt = EUR;
    });
    y++; const tot = rc.getRow(y);
    tot.values = ['Total', { formula: 'SUM(B4:B' + (y - 1) + ')', result: R.n }].concat(R.avecMt ? [{ formula: 'SUM(C4:C' + (y - 1) + ')', result: R.ht }] : []);
    tot.eachCell(c => { c.font = F({ bold: true, color: { argb: argb(C.fonce) } }); c.fill = fond('#E6F6F2'); });
    tot.getCell(2).alignment = { horizontal: 'center' }; if (R.avecMt) tot.getCell(3).numFmt = EUR;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
