/* Devis réserves – Eurexpo · présentation PowerPoint du tableau de bord, fabriquée dans le navigateur (PptxGenJS).
 * Les graphiques sont de vrais graphiques PowerPoint : ils restent modifiables (clic droit › Modifier les données).
 *
 * D : { titre, filtres: [textes], mesure: 'n' | 'mt', source, edite,
 *       etats: [{ lib, c }], n, total, nb: [par état], levees, taux, ht (texte), E: { v, t },
 *       panneaux: [{ titre, R: [{ nom, n, v, t }] }], temps: { pas, sans, cols: [{ lib, n, v, t }] } } */

const C = { vert: '00AB89', fonce: '004C46', clair: 'F5F5F4', texte: '334155', gris: '78716C', ligne: 'E7E5E4', encre: '1C1917', blanc: 'FFFFFF' };
const POLICE = 'Arial';
const W = 13.333, H = 7.5, MX = 0.5;
const MAX_BARRES = 20;
const LIB = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';

let charge;
function bibliotheque() {
  return charge = charge || new Promise((ok, ko) => {
    if (window.PptxGenJS) return ok(window.PptxGenJS);
    const s = document.createElement('script'); s.src = LIB; s.onload = () => ok(window.PptxGenJS);
    s.onerror = () => { charge = null; ko(new Error('Impossible de charger la bibliothèque PowerPoint (connexion ?)')); };
    document.head.appendChild(s);
  });
}

const hex = c => String(c).replace('#', '');
const img = d => String(d).replace(/^data:/, '');
const nombre = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const coupe = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const pct = (a, b) => b ? Math.round(a * 100 / b) + ' %' : '–';

/* Fabrique les diapositives dans pptx (instance PptxGenJS). images : { logo, photo } en data URL. */
export function composer(pptx, D, images) {
  const mt = D.mesure === 'mt';
  const fmt = x => mt ? nombre(x) + ' €' : nombre(x);
  const unite = mt ? 'montant HT estimé (BPU)' : 'nombre de réserves';
  const pied = 'GL events Lyon – Eurexpo Lyon · ' + D.titre + ' · édité le ' + D.edite;

  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'GL events Lyon – Eurexpo Lyon'; pptx.company = 'GL events Lyon'; pptx.title = D.titre;
  pptx.theme = { headFontFace: POLICE, bodyFontFace: POLICE };
  pptx.defineSlideMaster({
    title: 'PAGE', background: { color: C.blanc },
    objects: [
      { rect: { x: 0, y: 0, w: 0.18, h: H, fill: { color: C.vert } } },
      { image: { x: W - MX - 1.55, y: 0.3, w: 1.55, h: 1.55 * 225 / 700, data: img(images.logo) } },
      { line: { x: MX, y: 1.12, w: W - 2 * MX, h: 0, line: { color: C.ligne, width: 1 } } },
      { text: { text: pied, options: { x: MX, y: H - 0.42, w: W - 2 * MX - 1, h: 0.3, fontFace: POLICE, fontSize: 9, color: C.gris } } }
    ],
    slideNumber: { x: W - MX - 0.6, y: H - 0.42, w: 0.6, h: 0.3, fontFace: POLICE, fontSize: 9, color: C.gris, align: 'right' }
  });
  const page = (titre, sous) => {
    const s = pptx.addSlide({ masterName: 'PAGE' });
    s.addText([{ text: titre, options: { bold: true, fontSize: 24, color: C.fonce } }].concat(
      sous ? [{ text: '   ' + sous, options: { fontSize: 12, color: C.gris } }] : []),
      { x: MX, y: 0.3, w: W - 2 * MX - 1.8, h: 0.7, fontFace: POLICE, valign: 'middle', margin: 0 });
    return s;
  };

  /* ----- Page de garde : même trame que les pages suivantes (bandeau vert, logo, filet, pied de page) ----- */
  const g = pptx.addSlide({ masterName: 'PAGE' });
  g.addText('CENTRE DE CONGRÈS DE LYON  ·  EUREXPO LYON  ·  LA SUCRIÈRE  ·  MATMUT STADIUM',
    { x: MX, y: 0.3, w: W - 2 * MX - 1.8, h: 0.7, fontFace: POLICE, fontSize: 10, color: C.fonce, valign: 'middle', margin: 0 });
  g.addText('HOME OF\nEXCELLENCE', { x: MX, y: 1.5, w: 5.6, h: 1.2, fontFace: POLICE, fontSize: 30, color: C.fonce, margin: 0, valign: 'top' });
  g.addShape(pptx.ShapeType.rect, { x: MX, y: 3.05, w: 1.6, h: 0.05, fill: { color: C.vert }, line: { color: C.vert, width: 0 } });
  g.addText([
    { text: D.titre, options: { bold: true, fontSize: 28, color: C.fonce, breakLine: true } },
    { text: D.filtres.length ? D.filtres.map(t => coupe(t, 150)).join('\n') : 'Toutes les réserves, tous événements confondus', options: { fontSize: 13, color: C.fonce, breakLine: true } },
    { text: nombre(D.n) + ' réserve' + (D.n > 1 ? 's' : '') + (D.n !== D.total ? ' sur ' + nombre(D.total) : '') + ' · ' + D.ht + ' HT estimé (BPU)', options: { fontSize: 12, color: C.texte, breakLine: true } },
    { text: D.source ? coupe(D.source, 90) : '', options: { italic: true, fontSize: 9, color: C.gris } }
  ], { x: MX, y: 3.35, w: 5.6, h: 3.4, valign: 'top', fontFace: POLICE, margin: 0, paraSpaceAfter: 8, fit: 'shrink' });
  g.addImage({ data: img(images.photo), x: 6.55, y: 1.5, w: W - MX - 6.55, h: (W - MX - 6.55) * 558 / 850 });

  /* ----- Chiffres clés et état des réserves ----- */
  const s1 = page('Chiffres clés', D.filtres.length ? coupe(D.filtres.join(' · '), 110) : 'toutes les réserves');
  const tuiles = [
    [nombre(D.n), 'réserve(s) sur ' + nombre(D.total), C.vert],
    [nombre(D.nb[0]), 'à corriger', hex(D.etats[0].c)],
    [nombre(D.nb[1]), 'en attente', hex(D.etats[1].c)],
    [nombre(D.levees), 'corrigée(s) ou validée(s)', hex(D.etats[3].c)],
    [D.taux, 'taux de levée (hors abandonnées)', C.vert],
    [String(D.ht).replace(/,00(?=\s*€)/, ''), 'montant HT estimé (BPU)', C.vert]
  ];
  const esp = 0.18, tw = (W - 2 * MX - esp * (tuiles.length - 1)) / tuiles.length;
  tuiles.forEach((t, i) => {
    const x = MX + i * (tw + esp), y = 1.45;
    s1.addShape(pptx.ShapeType.rect, { x, y, w: tw, h: 1.45, fill: { color: C.clair }, line: { color: C.clair, width: 0 } });
    s1.addShape(pptx.ShapeType.rect, { x, y, w: 0.07, h: 1.45, fill: { color: t[2] }, line: { color: t[2], width: 0 } });
    s1.addText(t[0], { x: x + 0.2, y: y + 0.15, w: tw - 0.3, h: 0.7, bold: true, fontFace: POLICE, fontSize: 22, color: C.encre, margin: 0, valign: 'middle' });
    s1.addText(t[1], { x: x + 0.2, y: y + 0.85, w: tw - 0.3, h: 0.5, fontFace: POLICE, fontSize: 11, color: C.gris, margin: 0, valign: 'top' });
  });
  s1.addText([{ text: 'État des réserves', options: { bold: true, fontSize: 16, color: C.encre } }, { text: '   ' + unite, options: { fontSize: 11, color: C.gris } }],
    { x: MX, y: 3.3, w: 8, h: 0.4, fontFace: POLICE, margin: 0 });
  // barre empilée : un rectangle par état, à l'échelle
  const large = W - 2 * MX; let x0 = MX;
  D.E.v.forEach((v, i) => {
    if (!(v > 0) || !D.E.t) return;
    const w = large * v / D.E.t;
    s1.addShape(pptx.ShapeType.rect, { x: x0, y: 3.85, w, h: 0.6, fill: { color: hex(D.etats[i].c) }, line: { color: C.blanc, width: 1 } });
    if (w > 0.75) s1.addText(pct(v, D.E.t), { x: x0, y: 3.85, w, h: 0.6, align: 'center', valign: 'middle', bold: true, fontFace: POLICE, fontSize: 12, color: i === 4 || i === 1 ? C.encre : C.blanc, margin: 0 });
    x0 += w;
  });
  const vus = D.etats.map((e, i) => i).filter(i => D.E.v[i] > 0 || D.nb[i] > 0);
  const tete = { bold: true, color: C.blanc, fill: { color: C.fonce } };
  const lignes = [[
    { text: 'État', options: tete }, { text: 'Réserves', options: Object.assign({ align: 'right' }, tete) },
    { text: mt ? 'Montant HT estimé' : 'Part', options: Object.assign({ align: 'right' }, tete) }
  ].concat(mt ? [{ text: 'Part du montant', options: Object.assign({ align: 'right' }, tete) }] : [])];
  vus.forEach(i => lignes.push([
    { text: [{ text: '■ ', options: { color: hex(D.etats[i].c) } }, { text: D.etats[i].lib, options: { color: C.encre } }] },
    { text: nombre(D.nb[i]), options: { align: 'right' } }
  ].concat(mt ? [{ text: fmt(D.E.v[i]), options: { align: 'right' } }, { text: pct(D.E.v[i], D.E.t), options: { align: 'right' } }]
    : [{ text: pct(D.E.v[i], D.E.t), options: { align: 'right' } }])));
  s1.addTable(lignes, { x: MX, y: 4.7, w: mt ? 8 : 6, colW: mt ? [3, 1.4, 2, 1.6] : [3, 1.5, 1.5], rowH: 0.3,
    fontFace: POLICE, fontSize: 11, color: C.texte, border: { type: 'solid', color: C.ligne, pt: 0.75 }, valign: 'middle' });

  /* ----- Répartitions : un graphique empilé par état ----- */
  const series = (items, nom) => D.etats.map((e, i) => ({ name: e.lib, c: hex(e.c), labels: items.map(nom), values: items.map(r => Math.round(r.v[i] * 100) / 100) }))
    .filter(s => s.values.some(v => v > 0));
  const commun = S => ({
    x: MX, y: 1.3, w: W - 2 * MX, h: H - 1.3 - 0.6, barGrouping: 'stacked', barOverlapPct: 100, chartColors: S.map(s => s.c),
    showLegend: true, legendPos: 'b', legendFontFace: POLICE, legendFontSize: 11, legendColor: C.texte,
    catAxisLabelFontFace: POLICE, catAxisLabelFontSize: 11, catAxisLabelColor: C.encre,
    valAxisLabelFontFace: POLICE, valAxisLabelFontSize: 10, valAxisLabelColor: C.gris, valAxisLabelFormatCode: mt ? '#,##0 "€"' : '#,##0',
    valGridLine: { color: C.ligne, size: 0.75 }, catGridLine: { style: 'none' }, valAxisLineShow: false, valAxisMinVal: 0,
    dataLabelFormatCode: mt ? '#,##0 "€"' : '#,##0'
  });
  D.panneaux.forEach(P => {
    // au-delà de MAX_BARRES valeurs : les premières seulement, le reste est chiffré dans le sous-titre
    const items = P.R.slice(0, MAX_BARRES), reste = P.R.slice(MAX_BARRES);
    const s = page(P.titre, unite + ' · ' + P.R.length + ' valeur' + (P.R.length > 1 ? 's' : '') +
      (reste.length ? ' · les ' + MAX_BARRES + ' premières (les ' + reste.length + ' autres : ' + fmt(reste.reduce((a, r) => a + r.t, 0)) + ')' : ''));
    if (!items.length) return;
    const S = series(items, r => coupe(r.nom, 34) + '  ·  ' + fmt(r.t));
    s.addChart(pptx.ChartType.bar, S, Object.assign(commun(S), { barDir: 'bar', catAxisOrientation: 'maxMin', valAxisOrientation: 'minMax', barGapWidthPct: 45, catAxisLabelFontSize: items.length > 14 ? 9 : 11 }));
  });

  /* ----- Créations dans le temps ----- */
  const T = D.temps;
  if (T && T.cols.length) {
    const s = page('Réserves créées par ' + T.pas, unite + (T.pas === 'semaine' ? ' · semaine du lundi indiqué' : '') + (T.sans ? ' · ' + T.sans + ' réserve(s) sans date non comptée(s)' : ''));
    // le total de chaque période est écrit sous sa date
    const S = series(T.cols, c => T.cols.length <= 20 ? c.lib + '\n' + fmt(c.t) : c.lib);
    if (S.length) s.addChart(pptx.ChartType.bar, S, Object.assign(commun(S), { barDir: 'col', barGapWidthPct: 40 }));
  }
  return pptx;
}

export const nomFichier = D => (D.titre + (D.suffixe ? ' - ' + D.suffixe : '')).replace(/[\\/:*?"<>|]/g, ' ').slice(0, 150) + ' - ' + D.edite.replace(/\//g, '-') + '.pptx';

/* Fichier PowerPoint (Blob). images : fonction nom → data URL (celle de sortie.js) */
export async function pptx(D, image) {
  const P = await bibliotheque();
  const [logo, photo] = await Promise.all([image('logo.png'), image('Agenda_EurexpoLyon.jpg')]);
  return composer(new P(), D, { logo, photo }).write({ outputType: 'blob' });
}
