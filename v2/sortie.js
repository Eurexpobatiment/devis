/* Devis réserves – Eurexpo · PDF (page de garde + devis) et Excel, fabriqués dans le navigateur,
 * puis enregistrés là où la personne le choisit. */
import { euros } from './logic.js?v=1';

const C = { vert: '#00AB89', fonce: '#004C46', clair: '#F5F5F4', texte: '#334155', alerte: '#C00000', accent: '#F0AE40', gris: '#78716C' };
const EMETTEUR = 'GL events Lyon – Eurexpo Lyon';
const SITES = 'Centre de congrès de Lyon · Eurexpo Lyon · La Sucrière · Matmut Stadium';

const charges = {};
function script(url) {
  return charges[url] = charges[url] || new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = url; s.onload = ok;
    s.onerror = () => ko(new Error('Impossible de charger ' + url.split('/').pop() + ' (connexion ?)'));
    document.head.appendChild(s);
  });
}
async function pdfmake() {
  await script('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js');
  await script('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js');
  return window.pdfMake;
}
export async function sheetjs() {
  await script('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  return window.XLSX;
}
const images = {};
async function image(nom) {
  if (images[nom]) return images[nom];
  const b = await (await fetch(nom)).blob();
  return images[nom] = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
}

export const nomFichier = (d, ext) =>
  (d.num ? d.num + ' - ' : '') + 'Devis réserves - ' + String(d.salon).replace(/[\\/:*?"<>|]/g, ' ') + '.' + ext;

// Enregistrement : fenêtre « Enregistrer sous » quand le navigateur la propose (Chrome, Edge), sinon téléchargement
// La fenêtre est ouverte tout de suite (au clic), le fichier est fabriqué ensuite : fabriquer() → Blob
export async function enregistrer(nom, type, fabriquer, pendant) {
  let h = null;
  if (window.showSaveFilePicker && window.self === window.top) {
    try {
      const ext = nom.split('.').pop();
      h = await window.showSaveFilePicker({
        suggestedName: nom,
        types: [{ description: ext.toUpperCase(), accept: { [type]: ['.' + ext] } }]
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return 'annule';
      h = null;
    }
  }
  if (pendant) pendant();
  const blob = await fabriquer();
  if (h) { const w = await h.createWritable(); await w.write(blob); await w.close(); return 'enregistre'; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return 'telecharge';
}

/* d : { salon, num, date, lignes:[{num, plan, constat, obs, code, connu, des, unite, qte, pu, mt}], n, nc, sansPu, ht, tva, ttc, taux, source } */
export async function pdf(d) {
  const pm = await pdfmake();
  const [logo, photo] = await Promise.all([image('logo.png'), image('garde.jpg')]);
  const W = 841.89, H = 595.28;
  const edite = new Date().toLocaleDateString('fr-FR');

  const garde = [
    { text: 'CENTRE DE CONGRÈS DE LYON\nEUREXPO LYON\nLA SUCRIÈRE\nMATMUT STADIUM', absolutePosition: { x: 560, y: 78 },
      width: 236, alignment: 'right', fontSize: 6.5, color: C.fonce, lineHeight: 1.15 },
    { image: logo, width: 145, absolutePosition: { x: 30, y: 128 } },
    { text: 'HOME OF\nEXCELLENCE', absolutePosition: { x: 32, y: 222 }, fontSize: 21, color: C.fonce, lineHeight: 1.05 },
    { image: photo, width: 285, height: 195, absolutePosition: { x: 374, y: 116 } },
    { stack: [
      { text: 'Devis de remise en état', bold: true, fontSize: 18, color: C.fonce },
      { text: 'Salon ' + d.salon, bold: true, fontSize: 18, color: C.fonce },
      { text: [d.num, d.date].filter(Boolean).join(' · '), fontSize: 10, color: C.fonce, margin: [0, 14, 0, 0] },
      { text: 'Total ' + euros(d.ht) + ' HT · ' + euros(d.ttc) + ' TTC · ' + d.n + ' réserve(s)', fontSize: 9, color: C.fonce, margin: [0, 16, 0, 0] }
    ], alignment: 'right', absolutePosition: { x: 400, y: 386 }, width: 396 },
    { text: 'Édité le ' + edite + ' – GL events Lyon', italics: true, fontSize: 7, color: C.texte, absolutePosition: { x: 30, y: 524 } },
    { text: '', pageBreak: 'after' }
  ];

  const alertes = [];
  if (d.nc) alertes.push(d.nc + ' réserve(s) non classée(s)');
  if (d.sansPu) alertes.push(d.sansPu + ' réserve(s) sans prix unitaire');

  const entete = {
    columns: [
      { width: '*', stack: [
        { text: 'Devis N° ' + (d.num || '—'), bold: true, fontSize: 18, color: C.fonce },
        { text: 'Remise en état suite au salon ' + d.salon, fontSize: 10, color: C.texte, margin: [0, 4, 0, 2] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 205, y2: 0, lineWidth: 1.5, lineColor: C.accent }], margin: [0, 2, 0, 8] },
        { table: { widths: [52, 'auto'], body: [
          [{ text: 'Date', bold: true }, d.date || ''],
          [{ text: 'Salon', bold: true }, d.salon],
          [{ text: 'N° devis', bold: true }, d.num || '']
        ] }, layout: 'noBorders', fontSize: 8.5 },
        alertes.length ? { text: 'Attention : ' + alertes.join(' – '), color: C.alerte, bold: true, fontSize: 8.5, margin: [0, 4, 0, 0] } : {}
      ] },
      { width: 230, stack: [
        { image: logo, width: 110, alignment: 'right' },
        { text: EMETTEUR + '\n' + SITES, fontSize: 7, alignment: 'right', color: C.texte, margin: [0, 6, 0, 0] }
      ] }
    ],
    margin: [0, 0, 0, 10]
  };

  const th = t => ({ text: t, bold: true, color: '#FFFFFF', fillColor: C.fonce, alignment: 'center', fontSize: 8.5 });
  const corps = [[th('N°\nréserve'), th('Hall / zone'), th('Constat'), th('Observations'), th('Code\nBPU'), th('Désignation'),
    th('Unité'), th('Qté'), th('PU HT'), th('Montant HT')]];
  d.lignes.forEach(l => {
    const nc = !l.connu;
    corps.push([
      l.num, l.plan || '', l.constat || '', l.obs || '',
      { text: nc ? '' : l.code, alignment: 'center' },
      nc ? { text: 'Non classé', color: C.alerte, bold: true } : (l.des || ''),
      { text: l.unite || '', alignment: 'center' },
      { text: String(l.qte).replace('.', ','), alignment: 'center' },
      { text: l.pu === null ? (nc ? '' : 'à saisir') : euros(l.pu), alignment: 'right', color: l.pu === null && !nc ? C.alerte : undefined },
      { text: l.mt === null ? '' : euros(l.mt), alignment: 'right' }
    ]);
  });
  const total = (lib, v, gras) => [{ text: lib, colSpan: 2, bold: gras, alignment: 'right' }, '', { text: euros(v), bold: gras, alignment: 'right' }];

  const doc = {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [40, 28, 24, 30],
    info: { title: 'Devis ' + (d.num || '') + ' – ' + d.salon, author: EMETTEUR },
    defaultStyle: { fontSize: 8.5, color: C.texte, lineHeight: 1.1 },
    background: (page) => page === 1
      ? { canvas: [
          { type: 'rect', x: 0, y: 0, w: 374, h: H, color: C.clair },
          { type: 'rect', x: 374, y: 0, w: W - 374, h: H, color: C.vert },
          { type: 'rect', x: 233, y: 116, w: 141, h: 195, color: C.fonce }
        ] }
      : { canvas: [{ type: 'rect', x: 0, y: 0, w: 12, h: H, color: C.vert }] },
    footer: (page, nb) => page === 1 ? null : {
      columns: [
        { text: 'Devis ' + (d.num || '') + ' – ' + d.salon, fontSize: 7, color: C.gris },
        { text: 'Page ' + (page - 1) + ' / ' + (nb - 1), fontSize: 7, color: C.gris, alignment: 'right' }
      ], margin: [40, 8, 24, 0]
    },
    content: garde.concat([
      entete,
      { table: { headerRows: 1, dontBreakRows: true, widths: [34, 62, 108, 128, 34, 160, 30, 26, 54, 62], body: corps },
        layout: {
          fillColor: (i) => i > 0 && i % 2 === 0 ? C.clair : null,
          hLineWidth: (i) => i === 0 ? 0 : 0.4, vLineWidth: () => 0, hLineColor: () => '#E7E5E4',
          paddingTop: () => 4, paddingBottom: () => 4
        } },
      { columns: [{ width: '*', text: '' }, { width: 230, table: { widths: [70, 70, 80], body: [
        total('Total HT', d.ht, true), total('TVA ' + String(Math.round(d.taux * 1000) / 10).replace('.', ',') + ' %', d.tva, false),
        total('Total TTC', d.ttc, true)
      ] }, layout: 'noBorders', fontSize: 9.5 }], margin: [0, 10, 0, 0], unbreakable: true },
      { text: 'Prix unitaires HT issus du bordereau de prix (BPU) remise en état après salon.', fontSize: 7.5, italics: true, margin: [0, 14, 0, 0] },
      { text: 'Réserves relevées dans BatiScript' + (d.source ? ' – ' + d.source : '') + '.', fontSize: 7.5, italics: true }
    ])
  };
  const blob = await new Promise((ok, ko) => { try { pm.createPdf(doc).getBlob(ok); } catch (e) { ko(e); } });
  return blob;
}

export async function excel(d) {
  const X = await sheetjs();
  const rows = [
    ['Devis N° ' + (d.num || '')], ['Remise en état suite au salon ' + d.salon], [],
    ['Date', d.date || ''], ['Salon', d.salon], ['N° devis', d.num || ''], [],
    ['N° réserve', 'Hall / zone', 'Constat', 'Observations', 'Code BPU', 'Désignation', 'Unité', 'Qté', 'PU HT', 'Montant HT']
  ];
  d.lignes.forEach(l => rows.push([l.num, l.plan || '', l.constat || '', l.obs || '', l.connu ? l.code : '',
    l.connu ? l.des : '⚠ Non classé', l.unite || '', l.qte, l.pu, l.mt]));
  rows.push([], ['', '', '', '', '', '', '', 'Total HT', '', d.ht], ['', '', '', '', '', '', '', 'TVA', '', d.tva], ['', '', '', '', '', '', '', 'Total TTC', '', d.ttc]);
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!autofilter'] = { ref: 'A8:J' + (8 + d.lignes.length) }; // filtres sur chaque colonne du tableau
  ws['!cols'] = [10, 18, 26, 32, 9, 44, 8, 6, 11, 12].map(w => ({ wch: w }));
  for (let r = 8; r < rows.length; r++) ['I', 'J'].forEach(c => { const x = ws[c + (r + 1)]; if (x && typeof x.v === 'number') x.z = '#,##0.00 "€"'; });
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Devis');
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
